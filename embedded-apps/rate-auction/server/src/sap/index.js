import { MockSap } from './mock.js';
import { ODataSap } from './odata.js';
import { RfcSap, createRfc } from './rfc.js';
import { EccStore } from './ecc-store.js';
import { FakeRfc } from './fake-rfc.js';

// SAP_MODE:   mock (sample data, default) | rfc (SAP ECC, custom Z function modules) | odata (S/4HANA / Gateway)
// STORE_MODE: memory (default) | ecc (auction data saved in SAP custom tables, no other database)
export const sapMode = () => (['rfc', 'odata'].includes(process.env.SAP_MODE) ? process.env.SAP_MODE : 'mock');
export const storeMode = () => (process.env.STORE_MODE === 'ecc' ? 'ecc' : 'memory');

export function getRfc() {
  const g = globalThis, e = process.env;
  if (!g.__sapRfc && e.SAP_RFC_DRIVER === 'fake') g.__sapRfc = new FakeRfc(); // local try-out without SAP, see README
  if (!g.__sapRfc) {
    if (!e.SAP_ASHOST || !e.SAP_SYSNR || !e.SAP_CLIENT || !e.SAP_USER) throw new Error('RFC settings missing: set SAP_ASHOST, SAP_SYSNR, SAP_CLIENT, SAP_USER, SAP_PASSWORD');
    g.__sapRfc = createRfc({ ashost: e.SAP_ASHOST, sysnr: e.SAP_SYSNR, client: e.SAP_CLIENT, user: e.SAP_USER, password: e.SAP_PASSWORD, lang: e.SAP_LANG || 'EN', saprouter: e.SAP_SAPROUTER, timeoutMs: Number(e.SAP_TIMEOUT_MS) || 15000, poolSize: Number(e.SAP_POOL_SIZE) || 4 });
  }
  return g.__sapRfc;
}

export function getSap() {
  const g = globalThis, e = process.env;
  if (!g.__sapClient) {
    const mode = sapMode();
    if (mode === 'rfc') g.__sapClient = new RfcSap(getRfc(), { lang: e.SAP_SPRAS || 'E' });
    else if (mode === 'odata') {
      g.__sapClient = new ODataSap({
        baseUrl: e.SAP_BASE_URL, sapClient: e.SAP_CLIENT, auth: e.SAP_AUTH === 'oauth' ? 'oauth' : 'basic',
        user: e.SAP_USER, password: e.SAP_PASSWORD, tokenUrl: e.SAP_TOKEN_URL, clientId: e.SAP_CLIENT_ID, clientSecret: e.SAP_CLIENT_SECRET,
        lang: e.SAP_LANG || 'EN', timeoutMs: Number(e.SAP_TIMEOUT_MS) || 15000,
      });
    } else g.__sapClient = new MockSap();
  }
  return g.__sapClient;
}

export function getStore() {
  const g = globalThis;
  if (storeMode() !== 'ecc') return null;
  if (!g.__eccStore) g.__eccStore = new EccStore(getRfc());
  return g.__eccStore;
}
