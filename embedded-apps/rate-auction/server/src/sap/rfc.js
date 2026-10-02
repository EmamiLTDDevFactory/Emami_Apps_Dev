import { SapError } from './errors.js';
import { UOM_FROM_SAP, toEccInfoRecord, toEccContract } from './mappings.js';

// ---------- timestamps: ABAP TIMESTAMPL (yyyymmddhhmmss.fffffff, UTC) <-> epoch ms ----------
const p2 = (n) => String(n).padStart(2, '0');
export function toTs(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + '.' + String(d.getUTCMilliseconds()).padStart(3, '0') + '0000';
}
export function fromTs(v) {
  const m = String(v ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,7}))?/);
  if (!m || /^0+$/.test(m[1] + m[2] + m[3])) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + Math.round(Number('0.' + (m[7] || '0')) * 1000);
}

// ---------- error classification ----------
// node-rfc raises ABAPError for exceptions raised inside ABAP, and library errors for connection trouble.
export function classifyRfcError(e, write) {
  if (e instanceof SapError) return e;
  const text = String(e.codeString || '') + ' ' + String(e.message || '');
  if (e.name === 'ABAPError') return new SapError(e.message || e.key || 'SAP raised an error', { detail: { key: e.key } });
  if (/COMMUNICATION|TIMEOUT|CONNECTION|CLOSED|BROKEN|NETWORK|LOGON_FAILURE/i.test(text)) {
    if (/LOGON_FAILURE/i.test(text)) return new SapError('SAP logon failed: check the technical user and password', {});
    return write
      ? new SapError('SAP did not answer. The document may or may not exist.', { unknownOutcome: true, detail: text.trim() })
      : new SapError('Cannot reach SAP: ' + (e.message || text).trim(), { retryable: true });
  }
  return new SapError('SAP RFC error: ' + (e.message || text).trim());
}

// ---------- connection (node-rfc, loaded only when used) ----------
// Needs the SAP NetWeaver RFC SDK on the server (download from SAP Support Portal, licensed by SAP).
export function createRfc(cfg) {
  let pool = null;
  const getPool = async () => {
    if (pool) return pool;
    const mod = await import(/* webpackIgnore: true */ 'node-rfc');
    const { Pool } = mod.default || mod;
    const connectionParameters = { ashost: cfg.ashost, sysnr: cfg.sysnr, client: cfg.client, user: cfg.user, passwd: cfg.password, lang: cfg.lang || 'EN' };
    if (cfg.saprouter) connectionParameters.saprouter = cfg.saprouter;
    pool = new Pool({ connectionParameters, clientOptions: {}, poolOptions: { low: 0, high: cfg.poolSize || 4 } });
    return pool;
  };
  return {
    // opts.write: this call changes data in SAP, so a lost answer means "unknown outcome", never an automatic retry.
    async call(fm, params = {}, opts = {}) {
      const timeoutMs = opts.timeoutMs || cfg.timeoutMs || 15000;
      let client;
      try {
        client = await (await getPool()).acquire();
      } catch (e) {
        throw new SapError('Cannot connect to SAP: ' + (e.message || e), { retryable: true });
      }
      const running = client.call(fm, params);
      let timer;
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('RFC call timed out'), { codeString: 'TIMEOUT' })), timeoutMs); });
      try {
        return await Promise.race([running, timeout]);
      } catch (e) {
        throw classifyRfcError(e, !!opts.write);
      } finally {
        clearTimeout(timer);
        running.catch(() => {}).finally(() => { try { pool.release(client); } catch (e) { /* ignore */ } });
      }
    },
  };
}

// ---------- SAP master data and document creation over RFC ----------
const bapiErrors = (rows) => (rows || []).filter((r) => r.TYPE === 'E' || r.TYPE === 'A').map((r) => String(r.MESSAGE || '').trim()).filter(Boolean);
const noZeros = (s) => String(s || '').trim().replace(/^0+(?=\d)/, '');

export class RfcSap {
  constructor(rfc, cfg = {}) { this.rfc = rfc; this.cfg = { lang: 'E', ...cfg }; }

  async _read(fm, params) {
    let last;
    for (let i = 0; i < 3; i++) {
      try { return await this.rfc.call(fm, params); } catch (e) {
        if (!(e instanceof SapError) || !e.retryable) throw e;
        last = e; await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
    throw last;
  }

  async ping() {
    const r = await this._read('Z_AUC_PING', {});
    return { ok: true, sysid: r.EV_SYSID, client: r.EV_MANDT };
  }

  async getMaterials(type) {
    const r = await this._read('Z_AUC_GET_MATERIALS', { IV_MTART: type, IV_SPRAS: this.cfg.lang });
    return (r.ET_MATERIALS || []).map((m) => ({
      code: String(m.MATNR).trim(), desc: String(m.MAKTX).trim(), type: String(m.MTART).trim(),
      uom: UOM_FROM_SAP[String(m.MEINS).trim()] || String(m.MEINS).trim(), lastRate: null,
    }));
  }

  async getLastRate(code) {
    const r = await this._read('Z_AUC_GET_LAST_RATE', { IV_MATNR: code });
    return { lastRate: r.EV_FOUND === 'X' && Number(r.EV_NETPR) > 0 ? Number(r.EV_NETPR) : null };
  }

  // term: part of the vendor name; codes: exact vendor numbers. Either or both.
  async _vendors(term, codes) {
    const r = await this._read('Z_AUC_GET_VENDORS', { IV_TERM: term || '', IT_LIFNR: (codes || []).map((c) => ({ LIFNR: c })), IV_MAX: 50 });
    return (r.ET_VENDORS || []).map((v) => ({ code: noZeros(v.LIFNR), name: String(v.NAME1).trim(), email: String(v.EMAIL || '').trim() }));
  }
  searchVendors(term) { return this._vendors(term, []); }
  getVendors(codes) { return this._vendors('', codes); }

  async createInfoRecord(payload) {
    const r = await this.rfc.call('Z_AUC_CREATE_INFOREC', { IS_DATA: toEccInfoRecord(payload) }, { write: true });
    const errs = bapiErrors(r.ET_RETURN);
    const no = String(r.EV_INFNR || '').trim();
    if (errs.length || !no) throw new SapError(errs.join(' | ') || 'SAP did not return an info record number', { detail: r.ET_RETURN });
    return { docNo: no };
  }

  async createContract(payload) {
    const r = await this.rfc.call('Z_AUC_CREATE_CONTRACT', { IS_DATA: toEccContract(payload) }, { write: true });
    const errs = bapiErrors(r.ET_RETURN);
    const no = String(r.EV_EBELN || '').trim();
    if (errs.length || !no) throw new SapError(errs.join(' | ') || 'SAP did not return a contract number', { detail: r.ET_RETURN });
    return { docNo: no };
  }
}
