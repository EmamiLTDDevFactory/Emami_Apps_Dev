// A stand-in for SAP ECC: it behaves like the Z function modules in abap/ and keeps the Z tables in memory.
// Same call(fm, params, opts) shape as createRfc(), including the errors it raises.
import { SapError } from './errors.js';

export class FakeRfc {
  constructor() {
    this.calls = [];
    this.t = { hdr: [], vend: [], bid: [], log: [], mail: [], doc: [] };
    this.failSaves = 0;            // next N Z_AUC_SAVE_* / APPEND calls fail (SAP unreachable)
    this.timeoutOn = null;         // function name that "times out after sending"
    this.seq = { inf: 5300009000, ctr: 4600009000 };
    this.vendors = [
      { LIFNR: '0000100234', NAME1: 'Apex Logistics', EMAIL: 'sales@apexlogistics.example' },
      { LIFNR: '0000100287', NAME1: 'BlueLine Freight', EMAIL: 'bids@bluelinefreight.example' },
      { LIFNR: '0000100315', NAME1: 'Coastal Carriers', EMAIL: 'rates@coastalcarriers.example' },
      { LIFNR: '0000100399', NAME1: 'Nomail Transport', EMAIL: '' },
    ];
    this.materials = [
      { MATNR: 'RM-100245', MAKTX: 'Liquid paraffin, light', MTART: 'ROH', MEINS: 'KG' },
      { MATNR: 'PM-200118', MAKTX: 'HDPE bottle 100 ml with cap', MTART: 'VERP', MEINS: 'PC' },
      { MATNR: 'SV-300021', MAKTX: 'Freight, Kolkata to Delhi, 32 ft MXL truck', MTART: 'DIEN', MEINS: 'TRIP' },
    ];
  }

  async call(fm, p = {}, opts = {}) {
    this.calls.push(fm);
    (this.sent = this.sent || {})[fm] = p;
    const bad = (fm.startsWith('Z_AUC_SAVE') || fm === 'Z_AUC_APPEND_LOG') && this.failSaves > 0;
    if (bad) { this.failSaves--; throw new SapError('Cannot reach SAP: RFC_COMMUNICATION_FAILURE', { retryable: true }); }
    if (this.timeoutOn === fm) throw new SapError('SAP did not answer. The document may or may not exist.', { unknownOutcome: true });
    const T = this.t;
    const upsert = (rows, key, add) => add.forEach((r) => { const i = rows.findIndex((x) => key.every((k) => x[k] === r[k])); if (i >= 0) rows[i] = { ...r }; else rows.push({ ...r }); });
    switch (fm) {
      case 'Z_AUC_PING': return { EV_SYSID: 'ECD', EV_MANDT: '100' };
      case 'Z_AUC_GET_MATERIALS': return { ET_MATERIALS: this.materials.filter((m) => m.MTART === p.IV_MTART) };
      case 'Z_AUC_GET_LAST_RATE': return p.IV_MATNR === 'RM-100245' ? { EV_FOUND: 'X', EV_NETPR: '98.0000', EV_WAERS: 'INR' } : { EV_FOUND: '', EV_NETPR: '0' };
      case 'Z_AUC_GET_VENDORS': {
        const codes = (p.IT_LIFNR || []).map((x) => String(x.LIFNR).padStart(10, '0'));
        const term = String(p.IV_TERM || '').toLowerCase();
        if (!codes.length && !term) return { ET_VENDORS: [] }; // never dump the whole master
        return { ET_VENDORS: this.vendors.filter((v) => (codes.length ? codes.includes(v.LIFNR) : v.NAME1.toLowerCase().includes(term))) };
      }
      case 'Z_AUC_SAVE_AUCTION': {
        { const h = p.IS_HEADER; if (!h.AUCID || !(Number(h.THRESHOLD) > 0) || Number(h.THRESHOLD) > Number(h.CEILING)) throw new SapError('INVALID_INPUT'); }
        upsert(T.hdr, ['AUCID'], [{ ...p.IS_HEADER, CREATED: T.hdr.find((h) => h.AUCID === p.IS_HEADER.AUCID)?.CREATED || T.hdr.length + 1 }]);
        T.vend = T.vend.filter((v) => v.AUCID !== p.IS_HEADER.AUCID); upsert(T.vend, ['AUCID', 'VID'], p.IT_VENDORS); return {};
      }
      case 'Z_AUC_SAVE_BIDS': {
        // like the ABAP: header must exist; a bid above the threshold is saved but flagged OVER_CAP
        const rows = p.IT_BIDS.map((b) => {
          const h = T.hdr.find((x) => x.AUCID === b.AUCID);
          if (!h) throw new SapError('AUCTION_NOT_FOUND');
          return { ...b, OVER_CAP: Number(b.AMOUNT) > Number(h.THRESHOLD) ? 'X' : '' };
        });
        upsert(T.bid, ['AUCID', 'BIDNO'], rows); return {};
      }
      case 'Z_AUC_APPEND_LOG': upsert(T.log, ['AUCID', 'LOGNO'], p.IT_LOG); return {};
      case 'Z_AUC_SAVE_MAILS': upsert(T.mail, ['AUCID', 'MAILID'], p.IT_MAILS); return {};
      case 'Z_AUC_SAVE_SAPDOC': T.doc = T.doc.filter((d) => d.AUCID !== p.IV_AUCID).concat(p.IT_DOCS.map((d) => ({ ...d }))); return {};
      case 'Z_AUC_LOAD_AUCTION': {
        const h = p.IV_AUCID ? T.hdr.find((x) => x.AUCID === p.IV_AUCID) : [...T.hdr].sort((a, b) => b.CREATED - a.CREATED)[0];
        if (!h) return { ES_HEADER: {}, ET_VENDORS: [], ET_BIDS: [], ET_LOG: [], ET_MAILS: [], ET_DOCS: [] };
        const mine = (rows) => rows.filter((r) => r.AUCID === h.AUCID).map((r) => ({ ...r }));
        return { ES_HEADER: { ...h }, ET_VENDORS: mine(T.vend), ET_BIDS: mine(T.bid), ET_LOG: mine(T.log), ET_MAILS: mine(T.mail), ET_DOCS: mine(T.doc) };
      }
      case 'Z_AUC_CREATE_INFOREC': {
        const d = p.IS_DATA;
        if (d.MATNR === 'BLOCKED') return { EV_INFNR: '', ET_RETURN: [{ TYPE: 'E', MESSAGE: 'Material BLOCKED is blocked for procurement' }] };
        if (!d.LIFNR || !d.EKORG || !d.WERKS) return { EV_INFNR: '', ET_RETURN: [{ TYPE: 'E', MESSAGE: 'Purchasing organization and plant are required' }] };
        this.created = (this.created || []).concat({ kind: 'inforecord', d });
        return { EV_INFNR: String(++this.seq.inf), ET_RETURN: [{ TYPE: 'S', MESSAGE: 'Info record created' }] };
      }
      case 'Z_AUC_CREATE_CONTRACT': {
        const d = p.IS_DATA;
        if (!d.LIFNR || !d.KDATB) return { EV_EBELN: '', ET_RETURN: [{ TYPE: 'E', MESSAGE: 'Validity start is required' }] };
        this.created = (this.created || []).concat({ kind: 'contract', d });
        return { EV_EBELN: String(++this.seq.ctr), ET_RETURN: [{ TYPE: 'S', MESSAGE: 'Contract created' }] };
      }
    }
    throw new SapError('Function module ' + fm + ' not found');
  }
}
