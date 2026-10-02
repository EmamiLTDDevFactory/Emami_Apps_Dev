import { SapError, messageFromSapBody } from './errors.js';
import { fromProduct, toInfoRecordBody, toContractBody } from './mappings.js';

const SVC = {
  product: '/sap/opu/odata/sap/API_PRODUCT_SRV',
  infoRecord: '/sap/opu/odata/sap/API_INFORECORD_PROCESS_SRV',
  contract: '/sap/opu/odata/sap/API_PURCHASECONTRACT_PROCESS_SRV',
};

export class ODataSap {
  constructor(cfg) {
    this.cfg = { timeoutMs: 15000, lang: 'EN', maxPages: 10, ...cfg };
    if (!this.cfg.baseUrl) throw new Error('SAP_BASE_URL is not set');
    this.token = null; // OAuth bearer cache
  }

  // ---------- auth ----------
  async _authHeader() {
    const c = this.cfg;
    if (c.auth === 'oauth') {
      if (this.token && this.token.exp > Date.now() + 30000) return 'Bearer ' + this.token.value;
      const res = await this._raw(c.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Basic ' + Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64') },
        body: 'grant_type=client_credentials',
      });
      const j = await res.json();
      if (!res.ok || !j.access_token) throw new SapError('SAP token request failed', { status: res.status });
      this.token = { value: j.access_token, exp: Date.now() + (j.expires_in || 300) * 1000 };
      return 'Bearer ' + this.token.value;
    }
    return 'Basic ' + Buffer.from(c.user + ':' + c.password).toString('base64');
  }

  // ---------- transport ----------
  async _raw(url, opts = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  _url(path, query) {
    const u = new URL(this.cfg.baseUrl.replace(/\/$/, '') + path);
    if (this.cfg.sapClient) u.searchParams.set('sap-client', this.cfg.sapClient);
    Object.entries(query || {}).forEach(([k, v]) => v !== undefined && u.searchParams.set(k, v));
    return u.toString();
  }

  // Reads are safe to retry: 3 attempts, short back-off, only on network errors / 5xx.
  async _get(path, query) {
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const res = await this._raw(this._url(path, { $format: 'json', ...query }), {
          headers: { authorization: await this._authHeader(), accept: 'application/json' },
        });
        if (res.status >= 500) { last = new SapError('SAP is temporarily unavailable (' + res.status + ')', { status: res.status, retryable: true }); }
        else {
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new SapError(messageFromSapBody(body) || 'SAP returned ' + res.status, { status: res.status, detail: body });
          return body;
        }
      } catch (e) {
        if (e instanceof SapError && !e.retryable) throw e;
        last = e instanceof SapError ? e : new SapError('Cannot reach SAP: ' + (e.name === 'AbortError' ? 'timed out' : e.message), { retryable: true });
      }
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    throw last;
  }

  // Writes: fetch a CSRF token (and the session cookie it belongs to), then POST once. No automatic retry.
  async _post(servicePath, entity, body) {
    const auth = await this._authHeader();
    let tokenRes;
    try {
      tokenRes = await this._raw(this._url(servicePath + '/'), { headers: { authorization: auth, 'x-csrf-token': 'Fetch', accept: 'application/json' } });
    } catch (e) {
      throw new SapError('Cannot reach SAP: ' + e.message, { retryable: true }); // nothing was sent yet, safe to retry
    }
    const csrf = tokenRes.headers.get('x-csrf-token');
    if (!tokenRes.ok || !csrf) throw new SapError('Could not get a CSRF token from SAP (' + tokenRes.status + ')', { status: tokenRes.status });
    const cookie = (tokenRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    let res;
    try {
      res = await this._raw(this._url(servicePath + '/' + entity), {
        method: 'POST',
        headers: { authorization: auth, 'x-csrf-token': csrf, cookie, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // The request may have reached SAP. Do not retry; reconcile first.
      throw new SapError('SAP did not answer in time. The document may or may not exist.', { unknownOutcome: true, detail: e.message });
    }
    const out = await res.json().catch(() => null);
    if (!res.ok) throw new SapError(messageFromSapBody(out) || 'SAP rejected the request (' + res.status + ')', { status: res.status, detail: out });
    return out.d;
  }

  // ---------- operations ----------
  async ping() {
    await this._get(SVC.product + '/A_Product', { $top: '1', $select: 'Product' });
    return { ok: true };
  }

  async getMaterials(type) {
    const out = [];
    let query = { $filter: "ProductType eq '" + type.replace(/'/g, '') + "'", $select: 'Product,ProductType,BaseUnit', $expand: 'to_Description', $top: '200' };
    let path = SVC.product + '/A_Product';
    for (let page = 0; page < this.cfg.maxPages; page++) {
      const body = await this._get(path, query);
      (body.d.results || []).forEach((p) => out.push(fromProduct(p, this.cfg.lang)));
      if (!body.d.__next) break;
      // __next is a full URL with its own query string: follow it as is.
      const next = new URL(body.d.__next);
      path = next.pathname;
      query = Object.fromEntries(next.searchParams.entries());
      delete query['sap-client'];
    }
    return out;
  }

  // Last purchase rate: the best available net price on existing info records for the material.
  // VERIFY: many companies prefer the last PO price or a custom service; swap this method if so.
  async getLastRate(code) {
    const body = await this._get(SVC.infoRecord + '/A_PurchasingInfoRecord', {
      $filter: "Material eq '" + code.replace(/'/g, '') + "'",
      $expand: 'to_PurgInfoRecdOrgPlantData', $top: '10',
    });
    const prices = (body.d.results || []).flatMap((r) => (r.to_PurgInfoRecdOrgPlantData?.results || []).map((o) => Number(o.NetPriceAmount))).filter((n) => n > 0);
    return prices.length ? { lastRate: Math.min(...prices) } : { lastRate: null };
  }

  async searchVendors() { throw new SapError('Vendor search is not implemented for the OData adapter. Use SAP_MODE=rfc (ECC).'); }
  async getVendors() { return this.searchVendors(); }

  async createInfoRecord(payload) {
    const d = await this._post(SVC.infoRecord, 'A_PurchasingInfoRecord', toInfoRecordBody(payload));
    return { docNo: d.PurchasingInfoRecord };
  }

  async createContract(payload) {
    const d = await this._post(SVC.contract, 'A_PurchaseContract', toContractBody(payload));
    return { docNo: d.PurchaseContract };
  }
}
