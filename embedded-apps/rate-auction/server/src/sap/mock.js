import { materialsByType, findMaterial, VENDOR_MASTER } from '../engine.js';

// Same interface as ODataSap, backed by the sample data. Used for demos and local development.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = { inforecord: 5300001000, contract: 4600001000 };

export class MockSap {
  async ping() { return { ok: true, mode: 'mock' }; }
  async getMaterials(type) { await sleep(300); return materialsByType(type).map((m) => ({ ...m })); }
  async getLastRate(code) { const m = findMaterial(code); return { lastRate: m ? m.lastRate : null }; }
  async searchVendors(term) { const t = String(term || '').toLowerCase(); return VENDOR_MASTER.filter((v) => v.name.toLowerCase().includes(t)); }
  async getVendors(codes) { return VENDOR_MASTER.filter((v) => codes.includes(v.code)); }
  async createInfoRecord() { await sleep(500); return { docNo: String(seq.inforecord++) }; }
  async createContract() { await sleep(500); return { docNo: String(seq.contract++) }; }
}
