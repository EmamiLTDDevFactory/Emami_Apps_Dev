import { toTs, fromTs } from './rfc.js';
import { pad10, UOM_TO_SAP, UOM_FROM_SAP } from './mappings.js';

// Saves the auction into SAP custom tables (ZAUC_HDR, ZAUC_VEND, ZAUC_BID, ZAUC_LOG, ZAUC_MAIL, ZAUC_SAPDOC)
// through RFC function modules, and loads it back after a restart. There is no other database.
// Only changes are sent. A marker moves forward only after SAP confirms, so a failed save is simply retried.
const X = (b) => (b ? 'X' : '');
const norm = (c) => String(c || '').trim().replace(/^0+(?=\d)/, '');

export class EccStore {
  constructor(rfc) { this.rfc = rfc; this.marks = new Map(); }

  _m(id) {
    if (!this.marks.has(id)) this.marks.set(id, { bids: new Map(), logId: 0, mails: new Set(), docs: null, head: null });
    return this.marks.get(id);
  }
  _w(fm, params) { return this.rfc.call(fm, params, { write: true }); }

  async sync(a) {
    const m = this._m(a.id);
    const lifnr = (vid) => pad10((a.vendors.find((v) => v.id === vid) || {}).sapCode);

    // 1. header and invited vendors (small, replaced as a whole when something changed)
    const header = {
      AUCID: a.id, TITLE: a.title, MATNR: a.material.code, MATDESC: a.material.desc, MTART: a.material.type,
      MEINS: UOM_TO_SAP[a.material.uom] || a.material.uom, UNIT_TXT: a.unit,
      CEILING: String(a.ceiling), DECREMENT: String(a.decrement), THRESHOLD: String(a.threshold), SHOW_LOWEST: X(a.showLowest), MUST_BEAT: X(a.mustBeatLeader),
      STATUS: a.status, ENDS_AT: toTs(a.endsAt), PAUSED_LEFT: String(a.pausedLeft || 0), EXTENSIONS: a.extensions, MAX_EXT: a.maxExt,
      WINDOW_S: a.window / 1000, EXTEND_S: a.extendBy / 1000, WINNER: a.winner ? lifnr(a.winner) : '', AWARD_REASON: a.awardReason || '', DEMO: X(a.demo),
    };
    const vendors = a.vendors.map((v) => ({ AUCID: a.id, VID: v.id, LIFNR: pad10(v.sapCode), ALIAS: v.alias, NAME: v.name, EMAIL: v.email, OUT: X(v.out) }));
    const headKey = JSON.stringify([header, vendors]);
    if (headKey !== m.head) { await this._w('Z_AUC_SAVE_AUCTION', { IS_HEADER: header, IT_VENDORS: vendors }); m.head = headKey; }

    // 2. bids that are new or whose void flag changed
    const bids = a.bids.filter((b) => m.bids.get(b.id) !== b.void);
    if (bids.length) {
      await this._w('Z_AUC_SAVE_BIDS', { IT_BIDS: bids.map((b) => ({ AUCID: a.id, BIDNO: b.id, LIFNR: lifnr(b.vid), AMOUNT: String(b.amount), BID_TS: toTs(b.at), VOID: X(b.void) })) });
      bids.forEach((b) => m.bids.set(b.id, b.void));
    }

    // 3. new log lines, oldest first
    const logs = a.log.filter((l) => l.id > m.logId).sort((x, y) => x.id - y.id);
    if (logs.length) {
      await this._w('Z_AUC_APPEND_LOG', { IT_LOG: logs.map((l) => ({ AUCID: a.id, LOGNO: l.id, LOG_TS: toTs(l.at), TEXT: String(l.text).slice(0, 255) })) });
      m.logId = logs[logs.length - 1].id;
    }

    // 4. mails sent
    const mails = a.outbox.filter((x) => !m.mails.has(x.id));
    if (mails.length) {
      await this._w('Z_AUC_SAVE_MAILS', { IT_MAILS: mails.map((x) => ({ AUCID: a.id, MAILID: x.id, GROUPN: x.group, LIFNR: x.vid ? lifnr(x.vid) : '', TO_NAME: x.toName, TO_ADDR: x.to, SUBJECT: x.subject, BODY: x.body, SENT_TS: toTs(x.at) })) });
      mails.forEach((x) => m.mails.add(x.id));
    }

    // 5. SAP documents created (S) and requests whose outcome is unknown (U)
    const docs = [
      ...a.sap.map((d) => ({ AUCID: a.id, KIND: d.kind, STATUS: 'S', DOCNO: d.docNo, MSG: '', TS: toTs(d.at) })),
      ...a.sapUnknown.map((u) => ({ AUCID: a.id, KIND: u.kind, STATUS: 'U', DOCNO: '', MSG: String(u.message).slice(0, 255), TS: toTs(u.at) })),
    ];
    const docsKey = JSON.stringify(docs);
    if (docsKey !== m.docs) { await this._w('Z_AUC_SAVE_SAPDOC', { IV_AUCID: a.id, IT_DOCS: docs }); m.docs = docsKey; }
  }

  // Latest auction (or a given one) rebuilt from the tables; null when there is none.
  async load(aucId = '') {
    const r = await this.rfc.call('Z_AUC_LOAD_AUCTION', { IV_AUCID: aucId });
    const h = r.ES_HEADER;
    if (!h || !String(h.AUCID || '').trim()) return null;
    const vendors = (r.ET_VENDORS || []).map((v) => ({ id: String(v.VID).trim(), name: String(v.NAME).trim(), sapCode: norm(v.LIFNR), email: String(v.EMAIL).trim(), alias: String(v.ALIAS).trim(), out: v.OUT === 'X' }));
    const vidOf = (l) => (vendors.find((v) => v.sapCode === norm(l)) || {}).id || null;
    const uom = UOM_FROM_SAP[String(h.MEINS).trim()] || String(h.MEINS).trim();
    const ceiling = Number(h.CEILING);
    const log = (r.ET_LOG || []).map((l) => ({ id: Number(l.LOGNO), at: fromTs(l.LOG_TS), text: String(l.TEXT).trim() })).sort((x, y) => y.id - x.id);
    const outbox = (r.ET_MAILS || []).map((x) => ({ id: String(x.MAILID).trim(), vid: x.LIFNR && norm(x.LIFNR) ? vidOf(x.LIFNR) : null, group: String(x.GROUPN).trim(), toName: String(x.TO_NAME).trim(), to: String(x.TO_ADDR).trim(), subject: String(x.SUBJECT).trim(), body: String(x.BODY), at: fromTs(x.SENT_TS) })).sort((x, y) => y.at - x.at);
    const docs = r.ET_DOCS || [];
    const a = {
      id: String(h.AUCID).trim(), sapPending: [], logSeq: Math.max(0, ...log.map((l) => l.id)), demo: h.DEMO === 'X',
      sapUnknown: docs.filter((d) => d.STATUS === 'U').map((d) => ({ kind: String(d.KIND).trim(), message: String(d.MSG).trim(), at: fromTs(d.TS) })),
      title: String(h.TITLE).trim(),
      material: { code: String(h.MATNR).trim(), desc: String(h.MATDESC).trim(), type: String(h.MTART).trim(), uom },
      unit: String(h.UNIT_TXT).trim(), ceiling, decrement: Number(h.DECREMENT), threshold: Number(h.THRESHOLD) || ceiling, botFloor: Math.round(ceiling * 75) / 100,
      showLowest: h.SHOW_LOWEST === 'X', mustBeatLeader: h.MUST_BEAT === 'X', status: String(h.STATUS).trim(),
      endsAt: fromTs(h.ENDS_AT), pausedLeft: String(h.STATUS).trim() === 'paused' ? Number(h.PAUSED_LEFT) : null,
      extensions: Number(h.EXTENSIONS), maxExt: Number(h.MAX_EXT), window: Number(h.WINDOW_S) * 1000, extendBy: Number(h.EXTEND_S) * 1000,
      winner: norm(h.WINNER) ? vidOf(h.WINNER) : null, auctionType: 'Reverse auction (lowest rate wins)', awardReason: String(h.AWARD_REASON).trim() || null,
      sap: docs.filter((d) => d.STATUS === 'S').map((d) => ({ kind: String(d.KIND).trim(), docNo: String(d.DOCNO).trim(), at: fromTs(d.TS) })),
      outbox, sentMail: outbox.map((x) => x.id), vendors,
      bids: (r.ET_BIDS || []).map((b) => ({ id: Number(b.BIDNO), vid: vidOf(b.LIFNR), amount: Number(b.AMOUNT), at: fromTs(b.BID_TS), void: b.VOID === 'X' })).sort((x, y) => x.id - y.id),
      log,
    };
    // Everything just loaded is already in SAP: set the markers so it is not sent again.
    const m = this._m(a.id);
    a.bids.forEach((b) => m.bids.set(b.id, b.void)); m.logId = a.logSeq; outbox.forEach((x) => m.mails.add(x.id));
    return a;
  }
}
