// Bidding engine: all rules and all anonymity masking live here, on the server.
// Vendor views are built from scratch (never filtered client-side), so real
// vendor names and ids of other vendors cannot appear in them.

import { MATERIAL_TYPES, SAP_SPEC, checkSap, inr, r2, suggestRates } from './rules.js';

export { MATERIAL_TYPES, SAP_SPEC, checkSap, inr, suggestRates };

// Mock vendor master (SAP vendor codes and mail IDs are made up; .example addresses never deliver).
const VENDORS = [
  ['Apex Logistics', '100234', 'sales@apexlogistics.example'],
  ['BlueLine Freight', '100287', 'bids@bluelinefreight.example'],
  ['Coastal Carriers', '100315', 'rates@coastalcarriers.example'],
  ['Delta Haulage', '100342', 'ops@deltahaulage.example'],
  ['Evergreen Transport', '100398', 'commercial@evergreentransport.example'],
];
// Mock SAP material master. In production this is read from SAP (RFC / OData) by material type.
const MATERIALS = [
  { code: 'RM-100245', desc: 'Liquid paraffin, light', type: 'ROH', uom: 'KG', lastRate: 98 },
  { code: 'RM-100312', desc: 'Menthol crystals', type: 'ROH', uom: 'KG', lastRate: 2150 },
  { code: 'RM-100377', desc: 'Glycerin IP', type: 'ROH', uom: 'KG', lastRate: 115 },
  { code: 'RM-100401', desc: 'Cetyl alcohol', type: 'ROH', uom: 'KG', lastRate: 240 },
  { code: 'PM-200118', desc: 'HDPE bottle 100 ml with cap', type: 'VERP', uom: 'EA', lastRate: 6.8 },
  { code: 'PM-200145', desc: 'Aluminium collapsible tube 50 g', type: 'VERP', uom: 'EA', lastRate: 4.9 },
  { code: 'PM-200190', desc: 'Corrugated carton 5-ply, 24 units', type: 'VERP', uom: 'EA', lastRate: 38 },
  { code: 'SV-300021', desc: 'Freight, Kolkata to Delhi, 32 ft MXL truck', type: 'DIEN', uom: 'TRIP', lastRate: 64000 },
  { code: 'SV-300034', desc: 'Freight, Kolkata to Mumbai, 32 ft MXL truck', type: 'DIEN', uom: 'TRIP', lastRate: 98000 },
  { code: 'SV-300067', desc: 'Contract packing, job work', type: 'DIEN', uom: 'EA', lastRate: 3.2 },
  { code: 'OS-400012', desc: 'Stretch film 500 mm', type: 'HIBE', uom: 'KG', lastRate: 185 },
  { code: 'OS-400025', desc: 'Wooden pallet 1200 x 1000', type: 'HIBE', uom: 'EA', lastRate: 640 },
];
export const materialsByType = (type) => MATERIALS.filter((m) => m.type === type);
export const findMaterial = (code) => MATERIALS.find((m) => m.code === code);

export const VENDOR_MASTER = VENDORS.map(([name, code, email]) => ({ code, name, email }));
const INTERNAL_MAIL = 'central.purchase@company.example';
const iso = (t) => new Date(t).toISOString().slice(0, 10);

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function createEngine(opts = {}) {
  let seq = 0;
  // In a demo auction (sample SAP data), v1 and v2 are seats for real signed-in vendors and v3..v5 are simulated bidders.
  const E = { a: null, rev: 0, humans: ['v1', 'v2'] };
  let docSeq = { inforecord: 5300001000, contract: 4600001000 };

  // Every state change writes a log line, so the log also drives E.rev (used to decide when to save to SAP).
  const log = (text, now = Date.now()) => {
    E.a.log.unshift({ id: ++E.a.logSeq, at: now, text });
    E.a.log.length = Math.min(E.a.log.length, 200);
    E.rev++;
  };

  E.reset = (now = Date.now(), cfg = {}) => {
    const people = cfg.vendors && cfg.vendors.length ? cfg.vendors : VENDOR_MASTER;
    const letters = shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).slice(0, people.length); // aliases are random per auction
    const demo = cfg.demo !== false;
    const m = cfg.material || findMaterial('SV-300021');
    const sug = suggestRates(m);
    const ceiling = cfg.ceiling ?? sug.ceiling, decrement = cfg.decrement ?? sug.decrement;
    const minutes = cfg.minutes ?? 5;
    // Threshold: the highest rate a vendor may bid (default: last purchase rate). The ceiling is only the baseline for savings.
    const threshold = r2(Number(cfg.threshold ?? m.lastRate ?? ceiling * 0.95));
    E.a = {
      id: 'AUC-' + now.toString(36).toUpperCase(),
      sapPending: [],
      sapUnknown: [],
      logSeq: 0,
      demo,
      title: m.desc,
      material: { code: m.code, desc: m.desc, type: m.type, uom: m.uom },
      unit: '₹ per ' + ({ EA: 'piece', KG: 'kg', MT: 'tonne', TRIP: 'trip', L: 'litre' }[m.uom] || m.uom),
      ceiling,
      decrement,
      threshold,
      botFloor: r2(threshold * 0.75),
      showLowest: false,
      mustBeatLeader: false,
      status: 'live',
      endsAt: now + minutes * 60000,
      pausedLeft: null,
      extensions: 0,
      maxExt: 5,
      window: 60000,
      extendBy: 60000,
      winner: null,
      auctionType: 'Reverse auction (lowest rate wins)',
      awardReason: null,
      sap: [],
      outbox: [],
      sentMail: [],
      vendors: people.map((v, i) => ({ id: 'v' + (i + 1), name: v.name, sapCode: v.code, email: v.email, alias: 'Vendor ' + letters[i], out: false })),
      seats: {}, // demo only: signed-in email -> seat vid (see vendorIdFor)
      bids: [],
      log: [],
    };
    log('Auction opened for ' + m.code + ' ' + m.desc + (cfg.actor ? ' by ' + cfg.actor : ''), now);
    // Mock data: three simulated vendors have already bid, so the room is not empty.
    if (demo) {
      [['v3', 1, 50], ['v4', 2, 42], ['v5', 3, 33], ['v3', 4, 21], ['v4', 5, 12]].forEach(([id, k, secsAgo]) =>
        E.placeBid(id, r2(threshold - decrement * k), now - secsAgo * 1000));
    }
  };

  const validBids = (vid) => E.a.bids.filter((b) => b.vid === vid && !b.void);

  // Which vendor of the current auction a signed-in Emami Apps user bids as. A vendor's identity is
  // the mail address on their SAP vendor master record: the hub user with that same email is that
  // vendor, and nobody else can bid for them. A demo auction (sample SAP data, whose vendor mails are
  // made-up .example addresses no real person can sign in with) instead hands each signed-in vendor
  // one of the free seats in E.humans, so the demo can be tried with real hub accounts.
  E.vendorIdFor = (email, now = Date.now()) => {
    const a = E.a;
    const e = String(email || '').trim().toLowerCase();
    if (!a || !e) return null;
    const own = a.vendors.find((v) => String(v.email || '').toLowerCase() === e);
    if (!a.demo) return own ? own.id : null;
    a.seats = a.seats || {};
    if (a.seats[e]) return a.seats[e];
    // Recorded as a seat too, so a demo seat is never handed to a second person for the same vendor.
    if (own) { a.seats[e] = own.id; return own.id; }
    const taken = Object.values(a.seats);
    const free = E.humans.find((id) => !taken.includes(id));
    if (!free) return null;
    a.seats[e] = free;
    log(e + ' joined the demo as ' + vendorOf(free).name + ' (' + vendorOf(free).alias + ')', now);
    return free;
  };

  // One entry per vendor: their best valid bid (lowest amount, earliest wins ties).
  const ranking = () =>
    E.a.vendors
      .filter((v) => !v.out)
      .map((v) => {
        const bs = validBids(v.id).sort((x, y) => x.amount - y.amount || x.at - y.at || x.id - y.id);
        return bs.length ? { vid: v.id, amount: bs[0].amount, at: bs[0].at, count: bs.length } : null;
      })
      .filter(Boolean)
      .sort((x, y) => x.amount - y.amount || x.at - y.at);

  E.placeBid = (vid, amount, now = Date.now()) => {
    const a = E.a;
    if (!a) return { ok: false, error: 'No auction is open.' };
    const v = a.vendors.find((x) => x.id === vid);
    if (!v || v.out) return { ok: false, error: 'This account cannot bid in this auction.' };
    if (a.status !== 'live' || now >= a.endsAt) return { ok: false, error: 'Bidding is closed.' };
    amount = r2(Number(amount));
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter a valid rate.' };
    if (amount > a.threshold) return { ok: false, error: 'Rate is above the maximum allowed for this auction (' + inr(a.threshold) + '). Bid ' + inr(a.threshold) + ' or lower.' };

    const mine = ranking().find((r) => r.vid === vid);
    const limit = mine ? r2(mine.amount - a.decrement) : a.threshold;
    if (amount > limit) {
      return {
        ok: false,
        error: mine
          ? 'Bid ' + inr(limit) + ' or lower. Each bid must drop by at least ' + inr(a.decrement) + '.'
          : 'Bid ' + inr(a.threshold) + ' or lower.',
      };
    }
    if (a.mustBeatLeader) {
      const lead = ranking()[0];
      if (lead && lead.vid !== vid && amount > r2(lead.amount - a.decrement)) {
        return { ok: false, error: 'Your bid must beat the current lowest rate by at least ' + inr(a.decrement) + '.' };
      }
    }

    a.bids.push({ id: ++seq, vid, amount, at: now, void: false });
    log(v.name + ' (' + v.alias + ') bid ' + inr(amount), now);

    // Anti-sniping: a bid inside the last window pushes the end time out.
    if (a.endsAt - now <= a.window && a.extensions < a.maxExt) {
      a.endsAt += a.extendBy;
      a.extensions++;
      log('Auction extended by ' + a.extendBy / 1000 + 's (' + a.extensions + '/' + a.maxExt + ')', now);
    }
    return { ok: true, bidId: seq };
  };

  const vendorOf = (id) => E.a.vendors.find((v) => v.id === id);
  const rateText = (amt) => inr(amt) + ' ' + E.a.unit.replace('₹ ', '');

  E.sapDefaults = (kind, now = Date.now()) => {
    const a = E.a, w = vendorOf(a.winner);
    const best = ranking().find((r) => r.vid === a.winner);
    const base = {
      vendorCode: w.sapCode, netPrice: String(best.amount), currency: 'INR', uom: a.material.uom, material: a.material.code,
      validFrom: iso(now), validTo: iso(now + 365 * 864e5),
      purchOrg: '', purchGroup: '', plant: '', incoterms: '', paymentTerms: '', taxCode: '',
    };
    return kind === 'inforecord'
      ? { ...base, infoCategory: 'Standard', priceUnit: '1', plannedDelivDays: '', minQty: '' }
      : { ...base, contractType: 'WK – Quantity contract', shortText: a.material.desc, targetQty: '', targetValue: '' };
  };

  // Mail drafts are rebuilt from live state. Vendors who lost are told the result only:
  // no winner name and no rates of other vendors.
  E.mailDrafts = () => {
    const a = E.a;
    if (!a || a.status !== 'awarded') return [];
    const rank = ranking();
    const win = vendorOf(a.winner), wBest = rank.find((r) => r.vid === a.winner);
    const sapLine = a.sap.length ? a.sap.map((d) => SAP_SPEC[d.kind].title + ' ' + d.docNo).join(', ') : null;
    const sentSet = a.sentMail;
    const out = [];
    out.push({
      id: 'winner', group: 'Awarded vendor', vid: win.id, toName: win.name, to: win.email,
      subject: 'Award notification: ' + a.title,
      body: ['Dear ' + win.name + ',', '', 'We are pleased to inform you that you have been awarded the requirement "' + a.title + '" at ' + rateText(wBest.amount) + '.',
        sapLine ? 'Reference in our system: ' + sapLine + '.' : 'Our purchase team will share the contract / info record reference shortly.', '', 'Please confirm acceptance by reply to this mail.', '', 'Regards,', 'Central Purchase'].join('\n'),
    });
    rank.filter((r) => r.vid !== a.winner).forEach((r) => {
      const v = vendorOf(r.vid);
      out.push({
        id: 'result-' + v.id, group: 'Other participants', vid: v.id, toName: v.name, to: v.email,
        subject: 'Auction result: ' + a.title,
        body: ['Dear ' + v.name + ',', '', 'Thank you for taking part in "' + a.title + '". The auction is closed and the requirement has been awarded to another vendor.', 'Your best rate was ' + rateText(r.amount) + '.', '', 'We look forward to working with you in future auctions.', '', 'Regards,', 'Central Purchase'].join('\n'),
      });
    });
    const saving = ((a.ceiling - wBest.amount) / a.ceiling * 100).toFixed(1);
    out.push({
      id: 'internal', group: 'Internal', vid: null, toName: 'Central Purchase, Finance', to: INTERNAL_MAIL,
      subject: 'Auction awarded: ' + a.title,
      body: ['Auction: ' + a.material.code + ' ' + a.title, 'Type: ' + a.auctionType, 'Awarded to: ' + win.name + ' (' + win.alias + ', SAP ' + win.sapCode + ')', 'Awarded rate: ' + rateText(wBest.amount),
        'Ceiling rate: ' + rateText(a.ceiling) + '  |  Saving vs ceiling: ' + saving + '%', 'Threshold (maximum bid): ' + rateText(a.threshold) + '  |  Saving vs threshold: ' + ((a.threshold - wBest.amount) / a.threshold * 100).toFixed(1) + '%', 'Award basis: ' + a.awardReason, 'SAP: ' + (sapLine || 'not yet created'), 'Bidders: ' + rank.length + ' of ' + a.vendors.length + ' invited'].join('\n'),
    });
    return out.map((m) => ({ ...m, sent: sentSet.includes(m.id) }));
  };

  // Step 1 of an SAP create: validate everything and lock the request. Returns the payload for the SAP client.
  E.prepareSap = (kind, formIn, now = Date.now()) => {
    const a = E.a;
    const fail = (error) => ({ ok: false, error });
    if (!a || a.status !== 'awarded') return fail('Award the auction before creating SAP documents.');
    if (!SAP_SPEC[kind]) return fail('Unknown SAP document type.');
    if (a.sap.some((d) => d.kind === kind)) return fail(SAP_SPEC[kind].title + ' already created for this award.');
    if (a.sapPending.includes(kind)) return fail('A SAP request for this document is already in progress.');
    if (a.sapUnknown.some((u) => u.kind === kind)) return fail('SAP did not answer the earlier request, so the document may already exist. Check SAP first, then record the document number or allow a retry.');
    const form = { ...(formIn || {}) };
    const d = E.sapDefaults(kind, now); // vendor, price, currency and material always come from the award, never from the form
    form.vendorCode = d.vendorCode; form.netPrice = d.netPrice; form.currency = d.currency; form.material = d.material;
    const chk = checkSap(kind, form);
    if (chk.missing.length) return fail('Missing: ' + chk.missing.join(', ') + '.');
    if (chk.errors.length) return fail(chk.errors[0]);
    a.sapPending.push(kind);
    return { ok: true, payload: { kind, form, auctionRef: a.id, auctionTitle: a.title, material: a.material } };
  };
  // Step 2a: SAP said yes.
  E.recordSap = (kind, docNo, now = Date.now()) => {
    const a = E.a;
    a.sapPending = a.sapPending.filter((k) => k !== kind);
    a.sap.push({ kind, docNo, at: now });
    log(SAP_SPEC[kind].title + ' ' + docNo + ' created in SAP (' + SAP_SPEC[kind].tcode + ') for ' + vendorOf(a.winner).name, now);
  };
  // Step 2b: SAP said no, or we could not tell.
  E.failSap = (kind, message, now = Date.now()) => {
    const a = E.a;
    a.sapPending = a.sapPending.filter((k) => k !== kind);
    log('SAP ' + SAP_SPEC[kind].title + ' creation failed: ' + message, now);
  };

  // SAP did not answer after the request was sent: the document may or may not exist. Block retries until an admin checks.
  E.markSapUnknown = (kind, message, now = Date.now()) => {
    const a = E.a;
    a.sapPending = a.sapPending.filter((k) => k !== kind);
    a.sapUnknown = a.sapUnknown.filter((u) => u.kind !== kind).concat({ kind, message, at: now });
    log('SAP ' + SAP_SPEC[kind].title + ' request unanswered. Check SAP before retrying: ' + message, now);
  };

  E.control = (action, p = {}, now = Date.now()) => {
    const a = E.a;
    const fail = (error) => ({ ok: false, error });
    const who = p.actor || 'admin'; // the signed-in admin's email, recorded in the audit log
    if (!a && action !== 'create') return fail('No auction is open. Start a new auction first.');
    switch (action) {
      case 'pause':
        if (a.status === 'live') { a.pausedLeft = Math.max(0, a.endsAt - now); a.status = 'paused'; log('Paused by ' + who, now); }
        break;
      case 'resume':
        if (a.status === 'paused') { a.endsAt = now + a.pausedLeft; a.status = 'live'; log('Resumed by ' + who, now); }
        break;
      case 'extend':
        if (a.status === 'live') a.endsAt += 60000;
        else if (a.status === 'paused') a.pausedLeft += 60000;
        else break;
        log('Extended by 60s by ' + who, now);
        break;
      case 'close':
        if (a.status === 'live' || a.status === 'paused') { a.status = 'closed'; log('Closed by ' + who, now); }
        break;
      case 'void': {
        if (a.status === 'awarded') return fail('Bids cannot be voided after the award.');
        const b = a.bids.find((x) => x.id === Number(p.bidId));
        if (b && !b.void) { b.void = true; log('Bid voided by ' + who + ': ' + inr(b.amount), now); }
        break;
      }
      case 'award': {
        if (a.status !== 'closed') return fail('Close the auction before awarding.');
        const rank = ranking();
        const pick = rank.find((r) => r.vid === p.vid);
        if (!pick) return fail('Select a vendor who has placed a valid bid.');
        const lowest = pick.amount === rank[0].amount;
        const reason = String(p.reason || '').trim();
        if (!lowest && reason.length < 5) return fail('This is not the lowest bid. Record the reason for awarding it.');
        a.winner = pick.vid;
        a.awardReason = lowest ? 'Lowest valid bid' : reason;
        a.status = 'awarded';
        const w = vendorOf(pick.vid);
        log('Awarded to ' + w.name + ' at ' + inr(pick.amount) + (lowest ? ' (lowest bid)' : ' (not lowest). Reason: ' + reason) + ' by ' + who, now);
        break;
      }
      case 'createSap': { // synchronous path used by the browser preview (simulated SAP)
        const pr = E.prepareSap(p.kind, p.form, now);
        if (!pr.ok) return pr;
        E.recordSap(p.kind, String(docSeq[p.kind]++), now);
        break;
      }
      case 'resolveSap': {
        const u = a.sapUnknown.find((x) => x.kind === p.kind);
        if (!u) return fail('Nothing to resolve for this document.');
        const docNo = String(p.docNo || '').trim();
        if (docNo) {
          if (!/^\d{4,12}$/.test(docNo)) return fail('Enter the document number exactly as shown in SAP.');
          a.sapUnknown = a.sapUnknown.filter((x) => x.kind !== p.kind);
          E.recordSap(p.kind, docNo, now);
        } else {
          a.sapUnknown = a.sapUnknown.filter((x) => x.kind !== p.kind);
          log(who + ' confirmed ' + SAP_SPEC[p.kind].title + ' does not exist in SAP. Retry allowed.', now);
        }
        break;
      }
      case 'sendMail': {
        if (a.status !== 'awarded') return fail('Award the auction before sending result mails.');
        const drafts = E.mailDrafts();
        const ids = (p.ids || []).filter((id) => drafts.some((m) => m.id === id && !m.sent));
        if (!ids.length) return fail('Select at least one mail that has not been sent.');
        const note = String(p.note || '').trim();
        ids.forEach((id) => {
          const m = drafts.find((x) => x.id === id);
          a.outbox.unshift({ id, vid: m.vid, group: m.group, toName: m.toName, to: m.to, subject: m.subject, body: m.body + (note ? '\n\n' + note : ''), at: now });
          a.sentMail.push(id);
          log('Mail sent (mock) to ' + m.toName + ': ' + m.subject, now);
        });
        break;
      }
      case 'create': {
        const m = p.material || findMaterial(p.materialCode);
        if (!m || m.type !== p.materialType) return fail('Choose a material type and a material from the SAP list.');
        const ceiling = r2(Number(p.ceiling)), decrement = r2(Number(p.decrement)), minutes = Math.round(Number(p.minutes));
        if (!(ceiling > 0)) return fail('Enter a ceiling rate above zero.');
        if (!(decrement > 0) || decrement >= ceiling) return fail('Minimum decrement must be above zero and below the ceiling.');
        if (!(minutes >= 1 && minutes <= 120)) return fail('Duration must be between 1 and 120 minutes.');
        const hasThr = p.threshold !== undefined && p.threshold !== '';
        const threshold = hasThr ? r2(Number(p.threshold)) : undefined;
        if (hasThr && !(threshold > 0 && threshold <= ceiling)) return fail('Threshold must be above zero and not above the ceiling rate.');
        if (p.vendors && p.vendors.length < 2) return fail('Invite at least two vendors.');
        E.reset(now, { material: m, ceiling, decrement, minutes, threshold, vendors: p.vendors, demo: p.demo, actor: who });
        break;
      }
      case 'toggleLowest':
        a.showLowest = !a.showLowest;
        log('Lowest-rate visibility for vendors: ' + (a.showLowest ? 'on' : 'off') + ' (' + who + ')', now);
        break;
    }
    return { ok: true };
  };

  // Called once a second: closes the auction on time and drives the simulated bidders.
  E.tick = (now = Date.now()) => {
    const a = E.a;
    if (!a) return;
    if (a.status === 'live' && now >= a.endsAt) { a.status = 'closed'; log('Closed by timer', now); return; }
    if (!a.demo || a.status !== 'live' || Math.random() > 0.3) return;
    const bots = a.vendors.filter((v) => !E.humans.includes(v.id) && !v.out);
    if (!bots.length) return;
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const mine = ranking().find((r) => r.vid === bot.id);
    const amount = r2((mine ? mine.amount : a.threshold) - a.decrement * (1 + Math.floor(Math.random() * 2)));
    if (amount >= a.botFloor) E.placeBid(bot.id, amount, now);
  };

  const remaining = (now) => {
    const a = E.a;
    return a.status === 'live' ? Math.max(0, a.endsAt - now) : a.status === 'paused' ? a.pausedLeft : 0;
  };

  // Admin payload: real names, aliases, every bid, audit log.
  E.adminView = (now = Date.now()) => {
    const a = E.a;
    if (!a) return { role: 'admin', status: 'none' };
    const rank = ranking();
    const byId = (id) => a.vendors.find((v) => v.id === id);
    const w = a.winner && byId(a.winner);
    return {
      role: 'admin',
      title: a.title, material: a.material, unit: a.unit, ceiling: a.ceiling, decrement: a.decrement,
      showLowest: a.showLowest, threshold: a.threshold, status: a.status, remaining: remaining(now),
      extensions: a.extensions, maxExt: a.maxExt, totalBids: a.bids.filter((b) => !b.void).length,
      auctionType: a.auctionType,
      winner: w ? { name: w.name, alias: w.alias, sapCode: w.sapCode, amount: rank.find((r) => r.vid === w.id)?.amount, lowest: rank[0].vid === w.id || rank[0].amount === rank.find((r) => r.vid === w.id)?.amount, reason: a.awardReason } : null,
      sap: a.sap.map((d) => ({ kind: d.kind, docNo: d.docNo, at: d.at })),
      sapUnknown: a.sapUnknown,
      sapDefaults: a.status === 'awarded' ? { inforecord: E.sapDefaults('inforecord', now), contract: E.sapDefaults('contract', now) } : null,
      mails: E.mailDrafts(),
      outbox: a.outbox.slice(0, 20).map((m) => ({ group: m.group, toName: m.toName, to: m.to, subject: m.subject, at: m.at })),
      ceilingRate: a.ceiling,
      ladder: rank.map((r, i) => ({ rank: i + 1, vid: r.vid, name: byId(r.vid).name, alias: byId(r.vid).alias, sapCode: byId(r.vid).sapCode, amount: r.amount, count: r.count })),
      noBid: a.vendors.filter((v) => !rank.some((r) => r.vid === v.id)).map((v) => ({ name: v.name, alias: v.alias })),
      feed: a.bids.slice(-40).reverse().map((b) => ({ id: b.id, name: byId(b.vid).name, alias: byId(b.vid).alias, amount: b.amount, at: b.at, void: b.void })),
      log: a.log.slice(0, 30),
    };
  };

  // Vendor payload: alias, own bids, own rank. No other vendor's name, id or bid amount.
  E.vendorView = (vid, now = Date.now()) => {
    const a = E.a;
    if (!a) return { role: 'vendor', status: 'none' };
    const v = a.vendors.find((x) => x.id === vid);
    // Signed in with the Vendor role but not invited to this auction: say so, and show nothing else.
    if (!v) return { role: 'vendor', status: 'not-invited', title: a.title, material: a.material };
    const rank = ranking();
    const idx = rank.findIndex((r) => r.vid === vid);
    const mine = idx >= 0 ? rank[idx] : null;
    return {
      role: 'vendor',
      alias: v.alias,
      title: a.title, material: a.material, unit: a.unit, decrement: a.decrement,
      status: a.status, remaining: remaining(now), invited: a.vendors.length,
      myBest: mine ? mine.amount : null,
      myRank: mine ? idx + 1 : null,
      leading: idx === 0,
      lowest: a.showLowest && rank[0] ? rank[0].amount : null,
      threshold: a.threshold,
      nextMax: mine ? r2(mine.amount - a.decrement) : a.threshold,
      myBids: validBids(vid).slice().reverse().slice(0, 20).map((b) => ({ id: b.id, amount: b.amount, at: b.at })),
      result: a.status === 'awarded' ? (a.winner === vid ? 'won' : 'lost') : null,
      auctionType: a.auctionType,
      inbox: a.outbox.filter((m) => m.vid === vid).map((m) => ({ subject: m.subject, body: m.body, at: m.at })),
    };
  };

  // Full state as plain data: saved to SAP ECC tables and loaded back after a restart.
  E.snapshot = () => (E.a ? JSON.parse(JSON.stringify(E.a)) : null);
  E.restore = (state) => {
    E.a = JSON.parse(JSON.stringify(state));
    seq = Math.max(0, ...E.a.bids.map((b) => b.id));
    E.a.sapPending = [];
    E.rev++;
  };

  if (!opts.empty) E.reset();
  return E;
}
