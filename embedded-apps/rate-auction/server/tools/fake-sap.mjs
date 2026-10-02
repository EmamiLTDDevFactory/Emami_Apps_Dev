// A small stand-in for SAP Gateway, for testing the OData client without a real SAP system.
// It mimics: basic auth, CSRF token + session cookie on writes, server-side paging (__next),
// descriptions in several languages, and SAP-style error bodies.
import http from 'node:http';

export function startFakeSap(port = 0) {
  const state = { calls: [], infoRecords: [], contracts: [] };
  const PRODUCTS = [
    ['RM-100245', 'KG', 'Liquid paraffin, light', 'Leichtes Paraffinöl'],
    ['RM-100312', 'KG', 'Menthol crystals', 'Mentholkristalle'],
    ['RM-100377', 'KG', 'Glycerin IP', 'Glycerin IP'],
  ].map(([Product, BaseUnit, en, de]) => ({
    Product, ProductType: 'ROH', BaseUnit,
    to_Description: { results: [{ Language: 'DE', ProductDescription: de }, { Language: 'EN', ProductDescription: en }] },
  }));
  const PAGE = 2;
  const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  const err = (res, code, msg, details = []) => send(res, code, { error: { code: 'X', message: { lang: 'en', value: msg }, innererror: { errordetails: details.map((m) => ({ message: m })) } } });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    state.calls.push(req.method + ' ' + url.pathname);
    const auth = req.headers.authorization || '';
    if (auth !== 'Basic ' + Buffer.from('sapuser:secret').toString('base64')) return err(res, 401, 'Logon failed');

    // CSRF: token is only issued on request and only valid together with the cookie from the same call
    if (req.method === 'GET' && req.headers['x-csrf-token'] === 'Fetch') {
      return send(res, 200, { d: {} }, { 'x-csrf-token': 'tok-123', 'set-cookie': ['SAP_SESSIONID_X=abc; path=/; HttpOnly', 'sap-usercontext=sap-client=100; path=/'] });
    }
    if (req.method === 'GET' && url.pathname.endsWith('/A_Product')) {
      const flt = url.searchParams.get('$filter') || '';
      const type = (flt.match(/ProductType eq '(\w+)'/) || [])[1];
      const skip = Number(url.searchParams.get('$skiptoken') || 0);
      const rows = PRODUCTS.filter((p) => p.ProductType === type);
      const slice = rows.slice(skip, skip + PAGE);
      const d = { results: slice };
      if (skip + PAGE < rows.length) d.__next = 'http://127.0.0.1:' + server.address().port + url.pathname + '?$filter=' + encodeURIComponent(flt) + '&$skiptoken=' + (skip + PAGE);
      return send(res, 200, { d });
    }
    if (req.method === 'GET' && url.pathname.endsWith('/A_PurchasingInfoRecord')) {
      const mat = (url.searchParams.get('$filter') || '').match(/Material eq '([^']+)'/)?.[1];
      const results = mat === 'RM-100245' ? [{ to_PurgInfoRecdOrgPlantData: { results: [{ NetPriceAmount: '101.50' }, { NetPriceAmount: '98.00' }, { NetPriceAmount: '0.00' }] } }] : [];
      return send(res, 200, { d: { results } });
    }
    if (req.method === 'POST') {
      if (req.headers['x-csrf-token'] !== 'tok-123' || !(req.headers.cookie || '').includes('SAP_SESSIONID_X=abc')) {
        return send(res, 403, { error: { message: { value: 'CSRF token validation failed' } } }, { 'x-csrf-token': 'Required' });
      }
      let raw = ''; for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      if (body.Material === 'SLOW') return; // never answers: simulates a timeout after the request was sent
      if (body.Material === 'REJECT') return err(res, 400, 'Material is blocked for procurement', ['Material REJECT is flagged for deletion']);
      if (url.pathname.endsWith('/A_PurchasingInfoRecord')) {
        const o = body.to_PurgInfoRecdOrgPlantData?.results?.[0];
        if (!body.Supplier || !o || !o.NetPriceAmount) return err(res, 400, 'Required fields missing');
        const no = '53000090' + (state.infoRecords.length + 1).toString().padStart(2, '0');
        state.infoRecords.push({ no, body });
        return send(res, 201, { d: { PurchasingInfoRecord: no } });
      }
      if (url.pathname.endsWith('/A_PurchaseContract')) {
        const it = body.to_PurchaseContractItem?.results?.[0];
        if (!body.Supplier || !it) return err(res, 400, 'Required fields missing');
        const no = '46000090' + (state.contracts.length + 1).toString().padStart(2, '0');
        state.contracts.push({ no, body });
        return send(res, 201, { d: { PurchaseContract: no } });
      }
    }
    err(res, 404, 'Resource not found');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, state, url: 'http://127.0.0.1:' + server.address().port })));
}
