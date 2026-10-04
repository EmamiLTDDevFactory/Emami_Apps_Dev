/**
 * Standalone mock SAP Gateway (HTTP) - same handler MOCK_SAP=true uses in-process, exposed on a
 * port so the app can be exercised through its REAL SAP client path (Basic auth, sap-client,
 * timeouts, header parsing). Used by Playwright; also handy for check:metadata.
 *
 *   npm run mock:sap            -> http://localhost:4599/sap/opu/odata/sap/ZMM_BOM_COST_SRV
 *   MOCK_SAP_USER=u MOCK_SAP_PASSWORD=p npm run mock:sap   (then Basic auth is enforced)
 */
import http from 'node:http';
import { mockSapFetch } from './sap';

const port = Number(process.env.MOCK_SAP_PORT || 4599);
const user = process.env.MOCK_SAP_USER;
const pass = process.env.MOCK_SAP_PASSWORD ?? '';

http
  .createServer(async (req, res) => {
    if (user) {
      const expected = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SAP NetWeaver Application Server"' });
        return res.end('Unauthorized');
      }
    }
    const ctl = new AbortController();
    req.on('close', () => !res.writableEnded && ctl.abort());
    try {
      const r = await mockSapFetch(`http://localhost:${port}${req.url}`, { signal: ctl.signal });
      const headers: Record<string, string> = {};
      r.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(r.status, headers);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(499);
      res.end();
    }
  })
  .listen(port, () => console.log(`[mock-sap] listening on http://localhost:${port}/sap/opu/odata/sap/ZMM_BOM_COST_SRV`));
