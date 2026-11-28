/* =============================================================================
   Distribution Planning engine
   -----------------------------------------------------------------------------
   Pure functions over the dataset dp_extract.py writes. No DOM here, so the
   same file runs in the browser page and under node for testing.

   plan(D, opt) -> {legs:[...], lines:[...], trucks:[...], need:[...], log:[...]}

   THE REQUIREMENT, per planning key (CCD Unique / HCD Design Code) x depot,
   for a truck that would ARRIVE a days from today (a = lane lead time):

     block target   T(day of arrival)
                      <= B1 day  : p1 x F0          (F0 = M0 + additional)
                      <= B2 day  : p2 x F0
                      <= month end: p2 x F0 + (trend good ? p3 x M1 : 0)
                      next month : F0 + (trend good ? m1Open x M1 : 0)
                    read the Service-KPI way: stock + sale MTD + GIT that
                    lands by then, against the target.
     open orders    MT/Ecom orders the depot cannot ship from FRESH stock and
                    GIT landing by then
     sales trend    the last 14 days' daily rate x (lead time + cycle days),
                    less stock and GIT - enough to not run dry before the
                    next truck after this one

     need = max(block shortfall, open-order gap + trend gap), split into
       tier 1  open orders            (fresh stock only)
       tier 2  sales trend
       tier 3  forecast / block norm
     MT/Ecom share of tiers 2-3 also needs fresh stock (> 70% life).

   MT / Ecom HUB-AND-SPOKE: where the console gives an MWH|Depot split for a
   key x depot, the depot is targeted on its depot share of the MT/Ecom
   forecast and the MWH on the MWH share. GT has no MWH buffer.

   LEGS
     1  unit -> depot / MWH, on confirmed unit stock (upload) or SAP.
        Nearest unit holding the key first. Dehradun is sent to Ambala MWH.
     2  MWH -> its depots (Raipur also from Indore), then Ambala -> anywhere.
        Leg 1 counts as GIT landing at its own lead time.
     3  inter-depot transfer for what is still short on tiers 1-2, from a
        depot holding surplus, nearest first, never stock made > N months ago.

   Under shortage, each tier is shared pro rata to need, tier 1 before 2
   before 3 - a depot's open orders are never starved to fill another's norm.
   ========================================================================== */
(function (root) {
'use strict';

const DEF = {
  b1Day: 10, b2Day: 20,
  p1: 0.5, p2: 1.0,          /* block targets, share of M0 + additional        */
  p3: 0.2,                   /* after the 20th: share of M1 if the trend is good */
  m1Open: 0.5,               /* next month: M1 share to have landed by the 10th  */
  trendOk: 1.0,              /* projected month-end / F0 needed to call it good  */
  cycleDays: 7,              /* days a truck must carry a depot to the next one  */
  freshMin: 0.70,            /* shelf life left for MT / Ecom                    */
  idtMaxAgeDays: 270,        /* no inter-depot move of stock made > 9 months ago */
  defaultLT: 5,
  trucks: [18, 15, 9],       /* tonnes                                           */
  minFill: 0.85,             /* a truck below this share of its size is held     */
  ptlMax: 2,                 /* critical remainder under this many tonnes goes part-load (PTL) */
  defCaseKg: 10,
  unitBasis: 'auto',         /* 'sap' | 'upload' | 'auto' (upload where given)   */
  mwhBasis: 'sap',
  clubs: [['UN13', 'UN02']], /* sources that may share a truck                   */
  club3p: false,             /* 3Ps do not share a truck (user, 25 Nov)           */
  /* a lane's load that does not fill a truck: true = hold it for a later truck
     (critical lines still go PTL / part load); false = dispatch as calculated */
  holdPartLoads: false,
  /* leg 1 ships these depots' need to the hub; the hub sends it on in leg 2.
     The depots on an MWH's own site are served this way too. */
  viaHub: {DP62: 'DP44', DP02: 'DP44', DP10: 'DP29', DP15: 'DP39', DP11: 'DP38'},
  noIdt: ['DP62'],           /* depots that take / give no inter-depot transfer   */
  sameSiteLT: 0,             /* days, MWH <-> depot on the same site              */
  hub3p: 'DP44',             /* 3P hub: Ambala; it then serves all India          */
  /* sources that plan nothing (UN01 = R&D) */
  srcExclude: ['UN01'],
  /* where a source may send: {source: [destination codes]}. A source not
     listed may send anywhere. A depot it may not reach directly is served
     through that depot's MWH, or else through the 3P hub, if allowed. */
  srcAllow: {'3P01': ['DP44'], '3P21': ['DP44'], '3P43': ['DP44'], '3P34': ['DP44'], '3P28': ['DP44'], '3P35': ['DP44']},
  backupMwh: {DP21: ['DP38']},
  anyMwh: ['DP44'],          /* MWHs allowed to serve any depot                  */
  doIdt: true,
  /* depot at the same site as an MWH: when the MWH is short, the depot's
     surplus (above its own need, lots made within 9 months) serves the MWH's
     other depots in leg 2 - the 'callback'. Loads share the MWH's truck. */
  callback: {DP44: 'DP02', DP29: 'DP10', DP39: 'DP15', DP38: 'DP11'},
  cbOff: [],                 /* MWHs whose same-site depot is NOT called back */
  doCallback: true,
  flush3p: true,             /* all 3P stock is allocated: what is left goes to the 3P hub */
  pcsDivs: [],               /* divisions planned in pieces (e.g. ['HCD'])          */
  pcsMats: [],               /* material codes planned in pieces                    */
  arrivalOnly: false,        /* plan only the stock ticked as arrived (Arrivals tab) */
  /* leg 3 (inter-depot) */
  idtZoneOrder: true,        /* donors: own zone first, then the fallback zones in this order */
  idtZoneFallback: {North: ['West', 'East', 'South'], South: ['West', 'East', 'North'], East: ['South', 'North', 'West'], West: ['South', 'North', 'East']},
  idtBalance: false,         /* after the urgent moves, balance depots to idtBalancePct % of forecast */
  idtBalancePct: 100, idtBalanceMargin: 0,   /* donor keeps forecast x pct x (1 + margin %) */
  roadFactor: 1.25, kmPerDay: 300,           /* no console lane: transit = straight km x factor / km per day */
  ooFastest: true,
  gitDays: 2,                /* stock in transit (no date in SAP) lands within this many days */
  mwhNetDepot: true,         /* MWH buffer counts its depots' stock above their own target */           /* open orders go by the quickest source (MWH before unit) */
  /* what counts as critical (loaded first, red): 'engine' = open orders not
     covered or the depot runs dry before the truck lands; 'stock' = depot
     stock (stock only, no sale, no GIT) below critStockPct % of its month
     forecast (M0 + additional); 'either' = both rules */
  critRule: 'stock', critStockPct: 20,
  /* smallest quantity worth an STO line (cases, per material and destination);
     below it the line is dropped, or rounded up to the minimum when the
     source has the stock and minMode is 'up' */
  minCases1: 5, minCases2: 0, minCases3: 0, minMode: 'drop',
};

const r2 = x => Math.round(x * 100) / 100;

/* ------------------------------------------------------------ indexing */
function index(D, opt) {
  const S = D.sites, M = D.mats;
  const six = {}; S.forEach((s, i) => six[s.code] = i);
  const today = new Date(D.meta.today + 'T00:00:00');
  const t = today.getDate();
  const N = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  /* planning keys */
  const kix = {}, keys = [], keyOf = new Int32Array(M.length);
  M.forEach((m, i) => {
    const k = m.div + ':' + m.key;
    let j = kix[k];
    if (j === undefined) { j = kix[k] = keys.length; keys.push({id: k, div: m.div, key: m.key, mats: [], name: m.desc, base: m.div + ':' + (m.ukey || m.key)}); }
    keys[j].mats.push(i); keyOf[i] = j;
  });

  const isDepot = S.map(s => s.type === 'Depot' && !!s.mwh);
  const isMwh = S.map(s => s.type === 'MWH');
  const isUnit = S.map(s => s.type === 'Unit' || s.type === '3P');
  const mwhOf = S.map(s => s.mwh ? six[s.mwh] : -1);

  const lane = {};
  D.lanes.forEach(([a, b, lt]) => lane[a + '>' + b] = lt);
  /* an MWH and the depot on the same site: moving between them takes no transit */
  const same = new Set();
  Object.entries(opt.callback || {}).forEach(([w, d]) => { same.add(w + '>' + d); same.add(d + '>' + w); });
  /* straight-line km between two sites with coordinates (Depot Location) */
  const km = (a, b) => {
    const p = S[a], q = S[b];
    if (p.lat == null || q.lat == null) return 1e6;
    const r = Math.PI / 180, dLa = (q.lat - p.lat) * r, dLo = (q.lon - p.lon) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin(dLo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const LT = (si, di) => {
    if (si === di) return 0;
    if (same.has(S[si].code + '>' + S[di].code)) return opt.sameSiteLT;
    const v = lane[S[si].code + '>' + S[di].code];
    if (v != null) return v;
    /* no console lane: road km (straight km x road factor) at kmPerDay */
    const d = km(si, di);
    return d < 1e5 ? Math.max(1, Math.ceil(d * (opt.roadFactor || 1.25) / (opt.kmPerDay || 300))) : null;
  };

  return {S, M, six, t, N, today, keys, keyOf, isDepot, isMwh, isUnit, mwhOf, LT, lane, km};
}

/* per key x site accumulator */
function KS() { return new Map(); }
const kk = (k, s) => k * 4096 + s;
function add(map, k, s, v) { if (!v) return; const x = kk(k, s); map.set(x, (map.get(x) || 0) + v); }
function get(map, k, s) { return map.get(kk(k, s)) || 0; }

/* ---------------------------------------------------- stock with freshness */
/* lots per material x site, oldest MFG first: {q, fresh, age, mfg} */
function buildLots(D, X, opt) {
  const lots = new Map();                     /* mi*4096+si -> [lot] */
  const today = X.today;
  D.lots.forEach(([mi, si, q, lf, mfg]) => {
    if (lf === 0) return;                     /* expired: never shipped */
    const k = mi * 4096 + si;
    let a = lots.get(k); if (!a) lots.set(k, a = []);
    const age = mfg ? Math.round((today - new Date(mfg + 'T00:00:00')) / 864e5) : null;
    a.push({q, fresh: lf < 0 || lf > opt.freshMin, age, mfg: mfg || '9999'});
  });
  lots.forEach(a => a.sort((x, y) => x.mfg < y.mfg ? -1 : x.mfg > y.mfg ? 1 : 0));
  return lots;
}

/* site stock by material, split fresh / old, honouring the lot list.
   Stock with no MFD record is taken as fresh (new production, uploads). */
function stockOf(D, X, opt, lots, uploads, arrived) {
  const stk = new Map();                      /* mi*4096+si -> {q, fresh, lots} */
  const put = (mi, si, q) => {
    if (q <= 0) return;
    const k = mi * 4096 + si; const e = stk.get(k) || {q: 0}; e.q += q; stk.set(k, e);
  };
  const upSites = new Set(uploads ? uploads.map(u => u.site) : []);
  D.stk.forEach(([mi, si, unr, git, qi]) => {
    const s = X.S[si];
    const useUp = upSites.has(si) && (X.isUnit[si] ? opt.unitBasis !== 'sap' : X.isMwh[si] ? opt.mwhBasis !== 'sap' : false);
    if (useUp) return;
    put(mi, si, unr + (X.isUnit[si] ? qi : 0));   /* QC at a unit releases within days */
  });
  (uploads || []).forEach(u => {
    const useUp = X.isUnit[u.site] ? opt.unitBasis !== 'sap' : X.isMwh[u.site] ? opt.mwhBasis !== 'sap' : true;
    if (!useUp) return;
    u.rows.forEach(([mi, pcs]) => put(mi, u.site, pcs));
  });
  /* trucks the planner has ticked as arrived become stock at the depot */
  (arrived || []).forEach(g => put(g[0], g[1], g[2]));
  stk.forEach((e, k) => {
    const L = lots.get(k) || [];
    let left = e.q; const out = [];
    for (const l of L) { if (left <= 0) break; const q = Math.min(l.q, left); out.push({q, fresh: l.fresh, age: l.age, mfg: l.mfg}); left -= q; }
    if (left > 0) out.push({q: left, fresh: true, age: null, mfg: '9998'});   /* unrecorded: fresh, age unknown */
    out.sort((x, y) => x.mfg < y.mfg ? -1 : x.mfg > y.mfg ? 1 : 0);
    e.lots = out;
    e.fresh = out.reduce((a, l) => a + (l.fresh ? l.q : 0), 0);
  });
  return stk;
}

/* ------------------------------------------------------------- demand side */
function demand(D, X, opt) {
  const K = X.keyOf;
  const F0 = KS(), F0me = KS(), F1 = KS(), sale = KS(), oo = KS(), tr = KS();
  /* the MT and Ecom parts on their own: each channel has its own MWH split */
  const F0c = {MT: KS(), Ecom: KS()}, F1c = {MT: KS(), Ecom: KS()};
  D.fc.forEach(([mi, si, ch, m0, m1]) => {
    add(F0, K[mi], si, m0); add(F1, K[mi], si, m1);
    if (ch !== 'GT') add(F0me, K[mi], si, m0);
    if (F0c[ch]) { add(F0c[ch], K[mi], si, m0); add(F1c[ch], K[mi], si, m1); }
  });
  D.afc.forEach(([mi, si, ch, q]) => { add(F0, K[mi], si, q); if (ch !== 'GT') add(F0me, K[mi], si, q); if (F0c[ch]) add(F0c[ch], K[mi], si, q); });
  D.sale.forEach(([mi, si, ch, q]) => add(sale, K[mi], si, q));
  D.oo.forEach(([mi, si, ch, q]) => add(oo, K[mi], si, q));
  const days = D.meta.trendDays || 14;
  D.trend.forEach(([mi, si, ch, q]) => add(tr, K[mi], si, q / days));
  /* MWH | depot split for MT / Ecom, by division key x depot code */
  const split = new Map();
  D.split.forEach(([div, ch, key, dep, mwh, ms, ds]) => {
    split.set(div + ':' + key + '|' + dep + '|' + ch, {mwh, ms, ds});
  });
  return {F0, F0me, F1, F0c, F1c, sale, oo, tr, split};
}

/* share of a depot's MT or Ecom forecast held AT the depot (rest at its MWH),
   from the console Plant type blocks "MT | MWH" / "Zepto | MWH". Each channel
   has its own split; no row = the whole channel stays at the depot. */
function depotShare(X, Dm, k, si, ch) {
  const K = X.keys[k], dep = X.S[si].code;
  /* the split is kept on the base Unique; a DP split ("3XO") inherits it */
  const a = Dm.split.get(K.id + '|' + dep + '|' + ch) || (K.base !== K.id ? Dm.split.get(K.base + '|' + dep + '|' + ch) : null);
  return a ? {ds: a.ds, ms: a.ms, mwh: a.mwh} : null;
}
/* a depot's own forecast: GT in full, MT / Ecom only the share kept at the depot */
function depotFc(X, Dm, k, si) {
  const f0 = get(Dm.F0, k, si), f1 = get(Dm.F1, k, si);
  let F0 = f0, F1 = f1, ds = 1;
  ['MT', 'Ecom'].forEach(ch => {
    const sh = depotShare(X, Dm, k, si, ch); if (!sh) return;
    const a0 = get(Dm.F0c[ch], k, si), a1 = get(Dm.F1c[ch], k, si);
    F0 -= a0 * (1 - sh.ds); F1 -= a1 * (1 - sh.ds);
    if (a0 > 0) ds = Math.min(ds, sh.ds);
  });
  return {F0, F1, ds};
}

/* ---------------------------------------------- inbound by key x site x day */
function inbound(D, X, opt, arrivedQ) {
  const g = new Map();                        /* kk -> [[offsetDays, qty, fresh]] */
  const put = (k, si, off, q) => { const x = kk(k, si); let a = g.get(x); if (!a) g.set(x, a = []); a.push(off, q); };
  /* goods in transit = the GIT column of the console stock sheet (material x
     receiving plant). It has no dates, so it counts as landing within gitDays. */
  D.git.forEach((r, i) => {
    const [mi, to, q] = r;
    if (to == null) return;
    const rest = q - ((arrivedQ && arrivedQ.get(mi * 4096 + to)) || 0);   /* arrived = now stock */
    if (rest > 1e-6) put(X.keyOf[mi], to, opt.gitDays, rest);
  });
  D.sto.forEach(([mi, from, to, q]) => {
    if (to == null) return;
    const lt = (from != null ? X.LT(from, to) : null) ?? opt.defaultLT;
    put(X.keyOf[mi], to, lt, q);
  });
  return g;
}
const gitBy = (g, k, si, a) => { const v = g.get(kk(k, si)); if (!v) return 0; let s = 0; for (let i = 0; i < v.length; i += 2) if (v[i] <= a) s += v[i + 1]; return s; };

/* ------------------------------------------------------------ the target */
function targetAt(opt, X, F0, F1, day, good) {
  if (day <= opt.b1Day) return opt.p1 * F0;
  if (day <= opt.b2Day) return opt.p2 * F0;
  if (day <= X.N) return opt.p2 * F0 + (good ? opt.p3 * F1 : 0);
  return F0 + (good ? opt.m1Open * F1 : 0);
}

/* need of key k at depot si for a truck landing in a days, given the stock
   (pcs, fresh pcs) the depot holds and the GIT already on its way */
function needAt(ctx, k, si, a, extraGit) {
  const {X, opt, Dm, stkK, gin} = ctx;
  const f0 = get(Dm.F0, k, si), fme = get(Dm.F0me, k, si);
  const {F0, F1, ds} = depotFc(X, Dm, k, si);   /* depot keeps only its share of MT/Ecom */
  const sale = get(Dm.sale, k, si), ooQ = get(Dm.oo, k, si), rate = get(Dm.tr, k, si);
  const s = stkK.get(kk(k, si)) || {q: 0, fresh: 0};
  const git = gitBy(gin, k, si, a) + (extraGit ? gitBy(extraGit, k, si, a) : 0);
  const daysLeft = Math.max(0, X.N - X.t);
  const good = f0 > 0 && (sale + rate * daysLeft) >= opt.trendOk * f0;
  const day = X.t + a;
  const T = targetAt(opt, X, F0, F1, day, good);
  const block = Math.max(0, T - (s.q + sale + git));
  const t1 = Math.max(0, ooQ - s.fresh - git);
  const t2raw = Math.max(0, rate * (a + opt.cycleDays) - (s.q + git));
  const total = Math.max(block, t1 + t2raw);
  const n1 = t1, n2 = Math.min(total - n1, t2raw), n3 = Math.max(0, total - n1 - n2);
  const me = f0 > 0 ? fme / f0 : 0;
  return {n1, n2, n3, total, fresh: n1 + me * (n2 + n3), T, F0, F1, sale, stk: s.q, sfresh: s.fresh,
          git, oo: ooQ, rate, good, day, a, ds};
}

/* MWH buffer for MT/Ecom: its share of each of its depots' MT / Ecom forecast
   (per channel split), at the block the truck lands in - next month's
   forecast once the truck lands after month-end. Stock a depot already holds
   above its own target counts towards the buffer (it is in the network). */
function mwhNeed(ctx, k, mi_site, a, extraGit) {
  const {X, opt, Dm, stkK, gin} = ctx;
  const day = X.t + a, next = day > X.N, d = next ? day - X.N : day;
  const p = next ? (d <= opt.b1Day ? opt.m1Open : opt.p2) : (d <= opt.b1Day ? opt.p1 : opt.p2);
  let T = 0, cover = 0;
  X.S.forEach((s, di) => {
    if (!X.isDepot[di]) return;
    let part = 0;
    ['MT', 'Ecom'].forEach(ch => {
      const sh = depotShare(X, Dm, k, di, ch);
      if (!sh || !sh.ms || X.six[sh.mwh] !== mi_site) return;
      const base = get(next ? Dm.F1c[ch] : Dm.F0c[ch], k, di);
      if (base > 0) part += p * base * sh.ms;
    });
    if (part <= 0) return;
    T += part;
    if (opt.mwhNetDepot) {
      const n = needAt(ctx, k, di, a, extraGit);
      const surplus = Math.max(0, n.stk + n.git + n.sale - n.T);
      cover += Math.min(part, surplus);
    }
  });
  if (T <= 0) return null;
  const s = stkK.get(kk(k, mi_site)) || {q: 0, fresh: 0};
  const git = gitBy(gin, k, mi_site, a) + (extraGit ? gitBy(extraGit, k, mi_site, a) : 0);
  const n = Math.max(0, T - cover - s.fresh - git);
  return {n1: 0, n2: 0, n3: n, total: n, fresh: n, T, a, buffer: true, stk: s.q, git, cover};
}

/* key-level stock map from the material stock */
function keyStock(X, stk) {
  const out = new Map();
  stk.forEach((e, x) => {
    const mi = Math.floor(x / 4096), si = x % 4096, k = X.keyOf[mi];
    const y = kk(k, si); const o = out.get(y) || {q: 0, fresh: 0};
    o.q += e.q; o.fresh += e.fresh; out.set(y, o);
  });
  return out;
}

/* --------------------------------------------- allocate one source pool */
/* pool: {fresh, old}; dem: [{si, n1,n2,n3, fresh}] -> per demand {qFresh,qOld,tier} */
function shareTier(pool, list, tier, wantFresh) {
  const need = list.map(d => d['n' + tier] - (d.got && d.got[tier] || 0)).map(v => Math.max(0, v));
  const tot = need.reduce((a, b) => a + b, 0);
  if (tot <= 0) return;
  /* fresh-only part: tier 1 always, tiers 2-3 the MT/Ecom share */
  for (let pass = 0; pass < 2; pass++) {
    const avail = pass === 0 ? pool.fresh : pool.old + pool.fresh;
    if (avail <= 0) continue;
    const want = list.map((d, i) => {
      const n = need[i] - (d._t || 0);
      if (n <= 0) return 0;
      if (pass === 0) {
        const fr = tier === 1 ? n : Math.max(0, Math.min(n, d.freshLeft));
        return fr;
      }
      /* pass 1: GT part, any stock, oldest first */
      return tier === 1 ? 0 : n;
    });
    const w = want.reduce((a, b) => a + b, 0);
    if (w <= 0) continue;
    const f = Math.min(1, avail / w);
    list.forEach((d, i) => {
      const q = want[i] * f;
      if (q <= 0) return;
      d._t = (d._t || 0) + q;
      if (pass === 0) { pool.fresh -= q; d.qFresh = (d.qFresh || 0) + q; d.freshLeft -= q; }
      else {
        const fromOld = Math.min(q, pool.old); pool.old -= fromOld; pool.fresh -= (q - fromOld);
        d.qOld = (d.qOld || 0) + fromOld; d.qFresh = (d.qFresh || 0) + (q - fromOld);
      }
      d.byTier = d.byTier || [0, 0, 0, 0]; d.byTier[tier] += q;
    });
  }
  list.forEach(d => { d.got = d.got || [0, 0, 0, 0]; d.got[tier] += d._t || 0; d._t = 0; });
}

function allocate(pool, list) {
  list.forEach(d => { d.freshLeft = d.fresh; d.qFresh = 0; d.qOld = 0; });
  [1, 2, 3].forEach(t => shareTier(pool, list, t));
  return list;
}

/* ---------------------------------------- material split at the source */
/* turn a key quantity into material lines, FEFO from the source's lots:
   the fresh part from the oldest FRESH lots, the rest from the oldest of all */
function toMaterials(X, stk, k, si, qFresh, qOld, used, maxAge) {
  const out = new Map();
  const mats = X.keys[k].mats;
  const take = (wantFresh, q) => {
    const cand = [];
    mats.forEach(mi => {
      const e = stk.get(mi * 4096 + si); if (!e) return;
      e.lots.forEach((l, li) => {
        if (maxAge != null && !(l.age != null && l.age <= maxAge)) return;
        if (!wantFresh || l.fresh) cand.push({mi, l, key: mi * 4096 + si + ':' + li});
      });
    });
    cand.sort((x, y) => x.l.mfg < y.l.mfg ? -1 : x.l.mfg > y.l.mfg ? 1 : 0);
    for (const c of cand) {
      if (q <= 1e-6) break;
      const free = c.l.q - (used.get(c.key) || 0);
      if (free <= 0) continue;
      const g = Math.min(free, q);
      used.set(c.key, (used.get(c.key) || 0) + g);
      out.set(c.mi, (out.get(c.mi) || 0) + g);
      q -= g;
    }
    return q;
  };
  let rest = take(true, qFresh);
  rest += take(false, qOld);
  /* any remainder (pool was from an upload with no lots, rounding): the
     key's first material holding stock, else its first material */
  if (rest > 1e-6 && maxAge == null) {
    const mi = mats.find(m => stk.get(m * 4096 + si)) ?? mats[0];
    out.set(mi, (out.get(mi) || 0) + rest);
  }
  return out;
}

/* ---------------------------------------------------------------- trucks */
/* Full trucks only. Per lane: as many of the largest vehicle as the load
   fills, then the best-fitting vehicle for the rest IF it fills to minFill.
   A remainder that fills no vehicle is held for tomorrow, lowest priority
   first - unless it carries critical lines, in which case it is offered as a
   part load for the planner to decide ("part-critical"). Lines are loaded
   critical first, then open orders, trend, norm. */
function buildTrucks(lines, X, opt) {
  const groups = new Map();
  const club = {}; opt.clubs.forEach((c, i) => c.forEach(code => club[code] = c.join('+')));
  /* the 3Ps sit together in Haridwar / Baddi: one truck may pick from several */
  if (opt.club3p) X.S.forEach(s => { if (s.type === '3P') club[s.code] = '3Ps'; });
  lines.forEach(l => {
    l.truck = null; l.held = false;
    if (l.cases <= 0 || l.off) return;
    const sg = club[X.S[l.from].code] || X.S[l.from].code;
    /* forwarding on arrival of a leg-1 truck is a later truck, not today's */
    const key = l.leg + '|' + sg + '|' + X.S[l.to].code + (l.pass ? '|after' + l.passDay : '');
    let g = groups.get(key); if (!g) groups.set(key, g = {leg: l.leg, src: sg, to: l.to, lines: [], later: l.pass ? l.passDay : null});
    g.lines.push(l);
  });
  const trucks = [];
  const sizes = opt.trucks.slice().sort((a, b) => b - a), small = sizes[sizes.length - 1];
  let no = 0;
  groups.forEach(g => {
    const t0 = trucks.length;
    buildGroup(g);
    if (g.later != null) for (let i = t0; i < trucks.length; i++) trucks[i].later = g.later;
  });
  return trucks;
  function buildGroup(g) {
    g.lines.sort((a, b) => b.crit - a.crit || a.tier - b.tier || b.kg - a.kg);
    if (g.leg === 3) {                      /* inter-depot moves go part-load */
      const kg = g.lines.reduce((a, l) => a + l.kg, 0);
      g.lines.forEach(l => l.truck = no);
      trucks.push({no, leg: 3, src: g.src, to: g.to, veh: 'PTL', tonnes: r2(kg / 1000), fill: null, status: 'PTL', crit: true});
      no++; return;
    }
    const T = g.lines.reduce((a, l) => a + l.kg, 0) / 1000;
    const veh = [];
    let left = T;
    /* biggest vehicle first; the tail goes in the smallest vehicle it fills
       to minFill, else in the biggest vehicle it fills completely */
    while (left > 1e-6) {
      if (left >= sizes[0]) { veh.push(sizes[0]); left -= sizes[0]; continue; }
      const fit = sizes.slice().reverse().find(v => v >= left - 1e-9 && left / v >= opt.minFill);
      if (fit) { veh.push(fit); left = 0; break; }
      const part = sizes.find(v => v <= left + 1e-9);
      if (!part) break;
      veh.push(part); left -= part;
    }
    /* load the vehicles in priority order; what does not fit is the remainder */
    let vi = 0, room = veh.length ? veh[0] * 1000 : 0;
    const rem = [];
    g.lines.forEach(l => {
      while (vi < veh.length && l.kg > room + 1 && room < veh[vi] * 1000 * (1 - opt.minFill)) { vi++; room = vi < veh.length ? veh[vi] * 1000 : 0; }
      if (vi < veh.length && (l.kg <= room + 1 || room >= l.kg * 0.5)) { l.truck = no + vi; room -= l.kg; }
      else rem.push(l);
    });
    const remCrit = rem.some(l => l.crit);
    const loaded = g.lines.filter(l => l.truck != null);
    veh.forEach((v, i) => {
      const kg = loaded.filter(l => l.truck === no + i).reduce((a, l) => a + l.kg, 0);
      trucks.push({no: no + i, leg: g.leg, src: g.src, to: g.to, veh: v, tonnes: r2(kg / 1000),
                   fill: r2(kg / 1000 / v), status: 'full', crit: loaded.some(l => l.truck === no + i && l.crit)});
    });
    no += veh.length;
    if (rem.length) {
      const kg = rem.reduce((a, l) => a + l.kg, 0);
      const fit = sizes.slice().reverse().find(v => v >= kg / 1000) || sizes[0];
      const critKg = rem.filter(l => l.crit).reduce((a, l) => a + l.kg, 0);
      if (!opt.holdPartLoads) {
        /* dispatch as calculated: the remainder goes as a part load */
        rem.forEach(l => { l.truck = no; });
        const ptl = kg / 1000 < opt.ptlMax;
        trucks.push({no, leg: g.leg, src: g.src, to: g.to, veh: ptl ? 'PTL' : fit, tonnes: r2(kg / 1000),
                     fill: ptl ? null : r2(kg / 1000 / fit), status: ptl ? 'PTL' : 'part-load', crit: remCrit});
        no++;
      } else if (remCrit && critKg / 1000 < opt.ptlMax) {
        /* a small urgent consignment: send the critical lines part-load, hold the rest */
        rem.forEach(l => { if (l.crit) l.truck = no; else l.held = true; });
        trucks.push({no, leg: g.leg, src: g.src, to: g.to, veh: 'PTL', tonnes: r2(critKg / 1000), fill: null,
                     status: 'PTL', crit: true});
        no++;
        const hk = kg - critKg;
        if (hk > 1) trucks.push({no: null, leg: g.leg, src: g.src, to: g.to, veh: null, tonnes: r2(hk / 1000),
                                 fill: r2(hk / 1000 / small), status: 'held', crit: false});
      } else if (remCrit) {
        rem.forEach(l => { l.truck = no; });
        trucks.push({no, leg: g.leg, src: g.src, to: g.to, veh: fit, tonnes: r2(kg / 1000), fill: r2(kg / 1000 / fit),
                     status: 'part-critical', crit: true});
        no++;
      } else {
        rem.forEach(l => { l.held = true; });
        trucks.push({no: null, leg: g.leg, src: g.src, to: g.to, veh: null, tonnes: r2(kg / 1000), fill: r2(kg / 1000 / small),
                     status: 'held', crit: false});
      }
    }
  }
}

/* ---- minimum line size: a material going to one destination on one leg
   must add up to at least minCases<leg>. Smaller lines are dropped (off,
   belowMin) or, with minMode 'up', raised to the minimum if the source still
   holds that much of the material. Forwarding on arrival cannot be raised. */
function applyMinCases(lines, X, opt, stk) {
  const min = {1: opt.minCases1 || 0, 2: opt.minCases2 || 0, 3: opt.minCases3 || 0};
  if (!min[1] && !min[2] && !min[3]) return;
  const srcOf = l => l.cbFrom != null ? l.cbFrom : l.from;
  const used = new Map();
  lines.forEach(l => { if (l.off || l.pass) return; const x = l.mi * 4096 + srcOf(l); used.set(x, (used.get(x) || 0) + l.pcs); });
  const grp = new Map();
  lines.forEach(l => { if (l.off || l.cases <= 0 || !min[l.leg] || l.flush) return;
    const x = l.leg + '|' + l.from + '|' + l.to + '|' + l.mi + '|' + (l.pass ? 'p' : '');
    let g = grp.get(x); if (!g) grp.set(x, g = []); g.push(l); });
  grp.forEach(ls => {
    const m = min[ls[0].leg], tot = ls.reduce((a, l) => a + l.cases, 0);
    if (tot >= m) return;
    const l0 = ls.slice().sort((a, b) => a.tier - b.tier || b.cases - a.cases)[0];
    const mm = X.M[l0.mi], cp = mm.cp > 0 ? mm.cp : 1, add = (m - tot) * cp;
    if (opt.minMode === 'up' && !l0.pass) {
      const x = l0.mi * 4096 + srcOf(l0), have = (stk.get(x) || {q: 0}).q;
      if (have - (used.get(x) || 0) >= add) {
        used.set(x, (used.get(x) || 0) + add);
        l0.cases += m - tot; l0.pcs = l0.cases * cp; l0.kg = l0.cases * (mm.cw > 0 ? mm.cw : opt.defCaseKg);
        l0.minUp = true; l0.reason += ' (raised to minimum ' + m + ' cases)';
        return;
      }
    }
    ls.forEach(l => { l.off = true; l.belowMin = true; });
  });
}

/* =================================================================== plan */
function plan(D, optIn, input) {
  const opt = Object.assign({}, DEF, optIn || {});
  /* arrival-only: no callback or inter-depot moves - only ticked arrivals ship */
  if (opt.arrivalOnly) { opt.doCallback = false; opt.doIdt = false; }
  input = input || {};
  const X = index(D, opt);
  const log = [];
  const lots = buildLots(D, X, opt);
  /* ticked vehicles (rows of D.ship). Each moves at most the SAP GIT of a
     material at that plant from GIT to stock: [mi, plant, qty] */
  const arrivedQ = new Map();
  {
    const sapGit = new Map(); D.git.forEach(([mi, to, q]) => { if (to != null) sapGit.set(mi * 4096 + to, (sapGit.get(mi * 4096 + to) || 0) + q); });
    const want = new Map();
    new Set(input.arrived || []).forEach(i => { const r = (D.ship || [])[i]; if (!r || r[2] == null) return; const x = r[0] * 4096 + r[2]; want.set(x, (want.get(x) || 0) + r[3]); });
    want.forEach((q, x) => { const c = Math.min(q, sapGit.get(x) || 0); if (c > 0) arrivedQ.set(x, c); });
  }
  const arrived = [...arrivedQ].map(([x, q]) => [Math.floor(x / 4096), x % 4096, q]);
  const arrivedSet = null;
  const stk = stockOf(D, X, opt, lots, input.uploads, arrived);
  const Dm = demand(D, X, opt);
  const gin = inbound(D, X, opt, arrivedQ);
  const stkK = keyStock(X, stk);
  const ctx = {X, opt, Dm, stkK, gin};
  const used = new Map();                     /* lot usage across legs */
  const lines = [], needs = [];
  const legGit = new Map();                   /* shipments planned so far, as GIT */
  const addGit = (k, si, a, q) => { const x = kk(k, si); let v = legGit.get(x); if (!v) legGit.set(x, v = []); v.push(a, q); };
  const pend = new Map();                     /* pending STO out of each source */
  D.sto.forEach(([mi, from, to, q]) => { if (from != null) { const x = kk(X.keyOf[mi], from); pend.set(x, (pend.get(x) || 0) + q); } });

  const depots = X.S.map((s, i) => i).filter(i => X.isDepot[i]);
  const mwhs = X.S.map((s, i) => i).filter(i => X.isMwh[i]);
  const units = X.S.map((s, i) => i).filter(i => X.isUnit[i] && !(opt.srcExclude || []).includes(X.S[i].code));
  /* route from a source to a destination, honouring srcAllow and the hubs:
     {lt: days to the destination, phys: where the truck goes, legLt} or null */
  /* materials planned in pieces (no rounding to full cases) */
  const pcsSet = new Set(opt.pcsMats || []);
  const isPcs = mi => (opt.pcsDivs || []).includes(X.M[mi].div) || pcsSet.has(X.M[mi].code);
  const excluded = u => (opt.srcExclude || []).includes(X.S[u].code);
  const allowed = (u, x) => { const a = (opt.srcAllow || {})[X.S[u].code]; return !a || a.includes(X.S[x].code); };
  /* an MWH may forward to a depot: not excluded, and the depot is on its list */
  const mwhSends = (w, di) => !excluded(w) && allowed(w, di);
  const route = (u, di) => {
    const hc = opt.viaHub[X.S[di].code], h3 = X.six[opt.hub3p];
    const cand = hc != null ? [X.six[hc]] : X.isDepot[di] ? [di, X.mwhOf[di], h3] : [di];
    for (const p of cand) {
      if (p == null || !allowed(u, p) || (p !== di && !mwhSends(p, di))) continue;
      const a = X.LT(u, p);
      if (p === di) return {lt: a == null ? 99 : a, phys: di, legLt: a == null ? opt.defaultLT : a};
      const la = a == null ? opt.defaultLT : a;
      return {lt: la + (X.LT(p, di) ?? opt.defaultLT), phys: p, legLt: la};
    }
    return null;
  };

  /* arrival-only plan: the only supply is what was ticked as arrived, at the
     site it landed; all other stock still counts for each site's own need */
  const arrCap = opt.arrivalOnly ? new Map() : null;
  if (arrCap) arrived.forEach(g => { const x = kk(X.keyOf[g[0]], g[1]); arrCap.set(x, (arrCap.get(x) || 0) + g[2]); });
  const poolOf = (k, si) => {
    const p = poolRaw(k, si); if (!p || !arrCap) return p;
    const cap = arrCap.get(kk(k, si)); if (!cap) return null;
    const took = takenK.get(kk(k, si)) || {f: 0, o: 0};
    const left = Math.max(0, cap - took.f - took.o);
    const fresh = Math.min(p.fresh, left);
    return {fresh, old: Math.min(p.old, left - fresh)};
  };
  const poolRaw = (k, si) => {
    const s = stkK.get(kk(k, si)); if (!s) return null;
    const p = Math.max(0, pend.get(kk(k, si)) || 0);
    let fresh = s.fresh, old = s.q - s.fresh;
    const cut = Math.min(old, p); old -= cut; fresh = Math.max(0, fresh - (p - cut));
    /* what earlier legs already took out of this source */
    const took = takenK.get(kk(k, si)) || {f: 0, o: 0};
    return {fresh: Math.max(0, fresh - took.f), old: Math.max(0, old - took.o)};
  };
  const takenK = new Map();
  const emit = (leg, k, from, to, d, a, reason) => {
    const qF = d.qFresh || 0, qO = d.qOld || 0;
    if (qF + qO < 1e-6) return;
    const tk = takenK.get(kk(k, from)) || {f: 0, o: 0}; tk.f += qF; tk.o += qO; takenK.set(kk(k, from), tk);
    const mm = toMaterials(X, stk, k, from, qF, qO, used, leg === 3 || d.cb ? opt.idtMaxAgeDays : null);
    const tierOf = d.byTier ? (d.byTier[1] > 0 ? 1 : d.byTier[2] > 0 ? 2 : 3) : 3;
    mm.forEach((pcs, mi) => {
      const m = X.M[mi];
      const cp = m.cp > 0 ? m.cp : 1;
      /* planned in pieces: whole pieces, no rounding to full cases. A case
         is rounded UP only if the source still has those pieces free (within
         the age limit for inter-depot moves); otherwise it is rounded down. */
      const ip = isPcs(mi);
      let pc = ip ? Math.round(pcs) : Math.round(pcs / cp) * cp;
      if (pc > pcs + 1e-6) {
        const extra = pc - pcs, mAge = leg === 3 || d.cb ? opt.idtMaxAgeDays : null;
        const e = stk.get(mi * 4096 + from); let free = 0; const fl = [];
        if (e) e.lots.forEach((l, li) => { if (mAge != null && !(l.age != null && l.age <= mAge)) return;
          const key = mi * 4096 + from + ':' + li, f = l.q - (used.get(key) || 0); if (f > 0) { free += f; fl.push([key, f]); } });
        if (free + 1e-6 >= extra) { let x = extra; for (const [key, f] of fl) { if (x <= 0) break; const g = Math.min(f, x); used.set(key, (used.get(key) || 0) + g); x -= g; } }
        else pc = ip ? Math.floor(pcs) : Math.floor(pcs / cp + 1e-9) * cp;
      }
      if (pc <= 0) return;
      const cases = pc / cp;
      const ckg = m.cw > 0 ? m.cw : opt.defCaseKg;
      lines.push({leg, k, mi, from, to, pcs: pc, cases, kg: cases * ckg, a, tier: tierOf, inPcs: ip ? 1 : 0,
                  crit: d.crit ? 1 : 0, reason: reason(d), via: d.via || null, cb: d.cb ? 1 : 0});
    });
    addGit(k, d.target != null ? d.target : to, a, qF + qO);
  };
  const why = d => {
    const p = [];
    if (d.byTier && d.byTier[1] > 0) p.push('open orders ' + Math.round(d.byTier[1]));
    if (d.byTier && d.byTier[2] > 0) p.push('sales trend');
    if (d.byTier && d.byTier[3] > 0) p.push(d.buffer ? 'MWH buffer' : (d.via ? 'for ' + d.via : 'block target'));
    if (d.crit && d.doc != null && d.doc < 60) p.push(d.doc <= 0 ? 'out of stock' : 'stock-out in ' + d.doc + 'd');
    return p.join(', ');
  };
  const critical = (n, k, si) => {
    /* critical: the depot runs dry before this truck lands, or misses open orders */
    const s = stkK.get(kk(k, si)) || {q: 0};
    const rate = get(Dm.tr, k, si) || (get(Dm.F0, k, si) / X.N);
    const doc = rate > 0 ? (s.q + gitBy(gin, k, si, 3)) / rate : 99;
    n.doc = Math.round(doc);
    /* critical: open orders the depot cannot ship, or it runs dry before
       this truck can land */
    n.crit = n.n1 > 0 || (doc < n.a && n.n2 > 0);
  };

  const nextLand = (k, si) => {
    let best = 1e9;
    [gin, legGit].forEach(g => { const v = g.get(kk(k, si)); if (v) for (let i = 0; i < v.length; i += 2) if (v[i + 1] > 0) best = Math.min(best, v[i]); });
    return best === 1e9 ? opt.cycleDays : best;
  };
  /* what a depot can give away: lots made within the age limit, beyond its
     own need (block target left, cover until its next truck, open orders) */
  const donorSurplus = (k, si) => {
    const s = stkK.get(kk(k, si)); if (!s || s.q <= 0) return null;
    const rate = get(Dm.tr, k, si);
    const own = needAt(ctx, k, si, 0, legGit);
    const keepQ = Math.max(own.T - get(Dm.sale, k, si), rate * (nextLand(k, si) + opt.cycleDays), get(Dm.oo, k, si));
    let elig = 0, eligF = 0;
    X.keys[k].mats.forEach(mi => {
      const e = stk.get(mi * 4096 + si); if (!e) return;
      e.lots.forEach(l => { if (l.age != null && l.age <= opt.idtMaxAgeDays) { elig += l.q; if (l.fresh) eligF += l.q; } });
    });
    const took = takenK.get(kk(k, si)) || {f: 0, o: 0};
    const surplus = Math.min(elig, s.q - keepQ - took.f - took.o);
    return surplus > 1e-6 ? {surplus, fresh: Math.min(eligF, surplus), keep: keepQ} : null;
  };

  /* ============ open orders first, by the quickest route ================
     An open order the depot cannot ship goes from whichever source lands it
     first. Where an MWH (its own, the back-up, or Ambala for all India) - or
     the depot on that MWH's site, by callback - lands it before the nearest
     unit holding the stock could, the MWH sends it now in leg 2, and leg 1
     then sees it as GIT. A tie goes to the unit (saves the second freight). */
  const unitArrival = (k, di) => {
    let best = Infinity;
    units.forEach(u => {
      const p = poolOf(k, u); if (!p || p.fresh <= 1e-6) return;
      const h = route(u, di); if (h) best = Math.min(best, h.lt);
    });
    return best;
  };
  if (opt.ooFastest) X.keys.forEach((K, k) => {
    depots.forEach(di => {
      if (get(Dm.oo, k, di) <= 1e-6) return;
      const cands = [];
      mwhs.forEach(wi => {
        const own = X.mwhOf[di] === wi, bk = (opt.backupMwh[X.S[di].code] || []).includes(X.S[wi].code),
              any = opt.anyMwh.includes(X.S[wi].code);
        if ((own || bk || any) && mwhSends(wi, di)) cands.push({wi, lt: X.LT(wi, di) ?? opt.defaultLT, own});
      });
      if (!cands.length) return;
      cands.sort((a, b) => a.lt - b.lt || b.own - a.own);
      const uArr = unitArrival(k, di);
      for (const c of cands) {
        if (c.lt >= uArr) break;
        const n = needAt(ctx, k, di, c.lt, legGit);
        if (n.n1 <= 1e-6) break;
        critical(n, k, di);
        const tag = x => 'open orders ' + Math.round(x.byTier ? x.byTier[1] : 0) + ', quicker from ' + X.S[c.wi].code +
          ' (' + c.lt + ' d) than a unit (' + (uArr === Infinity ? 'no stock' : uArr + ' d') + ')' + (x.crit && x.doc < 60 ? ', stock-out in ' + x.doc + 'd' : '');
        const mk = () => Object.assign({}, n, {n2: 0, n3: 0, total: n.n1, fresh: n.n1, si: di, target: di, a: c.lt,
                                              freshLeft: n.n1, qFresh: 0, qOld: 0, got: null, byTier: null});
        /* the MWH's own stock first */
        const pool = poolOf(k, c.wi);
        let served = 0;
        if (pool && pool.fresh > 1e-6) {
          const d = mk(); shareTier({fresh: pool.fresh, old: pool.old}, [d], 1);
          served = (d.qFresh || 0) + (d.qOld || 0);
          const before = lines.length;
          emit(2, k, c.wi, di, d, c.lt, tag);
          for (let i = before; i < lines.length; i++) lines[i].fast = true;
        }
        /* then the same-site depot's surplus, booked as a callback */
        const coCode = opt.doCallback && !(opt.cbOff || []).includes(X.S[c.wi].code) ? (opt.callback || {})[X.S[c.wi].code] : null, co = coCode != null ? X.six[coCode] : null;
        if (co != null && co !== di && n.n1 - served > 1e-6) {
          const don = donorSurplus(k, co);
          if (don && don.fresh > 1e-6) {
            const d = mk(); d.n1 = d.total = d.fresh = d.freshLeft = n.n1 - served;
            shareTier({fresh: don.fresh, old: 0}, [d], 1);
            const before = lines.length;
            emit(2, k, co, di, d, c.lt, x => 'callback from ' + X.S[co].code + ': ' + tag(x));
            for (let i = before; i < lines.length; i++) { lines[i].from = c.wi; lines[i].cbFrom = co; lines[i].cb = 1; lines[i].fast = true; }
          }
        }
      }
    });
  });

  /* ================= LEG 1: units -> depots / MWH ===================== */
  X.keys.forEach((K, k) => {
    const srcs = units.filter(u => { const p = poolOf(k, u); return p && (p.fresh + p.old) > 0; });
    if (!srcs.length) return;
    /* each destination's nearest unit with the key decides its lead time */
    const dem = [];
    /* each destination's quickest allowed source sets its lead time */
    const nearest = di => {
      let best = null, bh = null;
      srcs.forEach(u => { const h = route(u, di); if (h && (!bh || h.lt < bh.lt)) { bh = h; best = u; } });
      if (!bh) return null;
      if (bh.lt === 99) bh = {lt: opt.defaultLT, phys: bh.phys, legLt: opt.defaultLT};
      return {u: best, h: bh};
    };
    depots.forEach(di => {
      const nb = nearest(di); if (!nb) return;
      const {u, h} = nb;
      const n = needAt(ctx, k, di, h.lt, legGit);
      if (n.total <= 1e-6) return;
      critical(n, k, di);
      n.depot = di; n.src = u; n.a = h.lt; n.target = di;
      n.si = h.phys;
      if (n.si !== di) n.via = X.S[di].name;
      dem.push(n);
    });
    mwhs.forEach(wi => {
      const nb = nearest(wi); if (!nb) return;
      const n = mwhNeed(ctx, k, wi, nb.h.lt, legGit);
      if (!n || n.total <= 1e-6) return;
      n.si = wi; n.depot = wi; n.src = nb.u; n.target = wi;
      dem.push(n);
    });
    if (!dem.length) return;
    /* each source serves the destinations it is nearest to; leftovers go on */
    const order = srcs.slice().sort((a, b) => {
      const pa = poolOf(k, a), pb = poolOf(k, b);
      return (pb.fresh + pb.old) - (pa.fresh + pa.old);
    });
    /* round 0: every unit serves the destinations it is nearest to;
       round 1: what is left anywhere is served by any unit still holding stock */
    [0, 1].forEach(round => order.forEach(u => {
      const pool = poolOf(k, u);
      if (!pool || pool.fresh + pool.old <= 1e-6) return;
      const list = dem.filter(d => (round === 0 ? d.src === u : true) && (d.total - (d.done || 0)) > 1e-6 && route(u, d.buffer ? d.si : d.depot));
      if (!list.length) return;
      const sub = list.map(d => ({...d, n1: Math.max(0, d.n1 - (d.g1 || 0)), n2: Math.max(0, d.n2 - (d.g2 || 0)),
                                  n3: Math.max(0, d.n3 - (d.g3 || 0)), fresh: Math.max(0, d.fresh - (d.gf || 0)),
                                  got: null, byTier: null}));
      allocate(pool, sub);
      sub.forEach((s, i) => {
        const d = list[i];
        const q = (s.qFresh || 0) + (s.qOld || 0); if (q < 1e-6) return;
        d.g1 = (d.g1 || 0) + s.byTier[1]; d.g2 = (d.g2 || 0) + s.byTier[2];
        d.g3 = (d.g3 || 0) + s.byTier[3]; d.gf = (d.gf || 0) + (s.qFresh || 0);
        d.done = (d.done || 0) + q;
        /* where this unit goes to the depot depends on the unit, not on
           whichever unit set the demand up */
        const h = route(u, d.buffer ? d.si : d.depot);
        s.via = h.phys !== d.depot && !d.buffer ? X.S[d.depot].name : null;
        /* stock for a depot served through a hub lands at the hub; the hub
           forwards it in leg 2 (pass-through), so it is GIT at the hub */
        s.target = d.buffer ? d.si : s.via ? h.phys : d.depot;
        const before = lines.length;
        emit(1, k, u, h.phys, s, h.legLt, why);
        if (s.via) for (let i = before; i < lines.length; i++) lines[i].viaDepot = d.depot;
      });
    }));
    dem.forEach(d => needs.push({leg: 1, k, si: d.depot, total: d.total, done: d.done || 0, crit: d.crit, n: d}));
  });

  /* ---- top-up: a lane whose load does not fill a truck is filled with what
     the destination will need for its NEXT truck (a later landing date),
     from stock the source still holds. Only if that cannot fill it does the
     lane go as a part load (critical) or wait (otherwise). */
  const laneKg = (leg) => {
    const m = new Map();
    lines.forEach(l => { if (l.leg !== leg) return; const x = l.from + '>' + l.to; m.set(x, (m.get(x) || 0) + l.kg); });
    return m;
  };
  const sizesAsc = opt.trucks.slice().sort((a, b) => a - b);
  const topUp = (leg, from, to, kgNow) => {
    const T = kgNow / 1000;
    const big = sizesAsc[sizesAsc.length - 1];
    const full = Math.floor(T / big + 1e-9);
    const rem = T - full * big;
    if (rem <= 1e-6) return;
    const v = sizesAsc.find(x => x >= rem) || big;
    if (rem / v >= opt.minFill) return;
    let want = (v * opt.minFill - rem) * 1000 + 1;
    const lt = X.LT(from, to) ?? opt.defaultLT;
    const cand = [];
    X.keys.forEach((K, k) => {
      const pool = poolOf(k, from); if (!pool || pool.fresh + pool.old <= 1e-6) return;
      const n = X.isMwh[to] ? mwhNeed(ctx, k, to, lt + opt.cycleDays * 2, legGit)
                            : needAt(ctx, k, to, lt + opt.cycleDays * 2, legGit);
      if (!n || n.total <= 1e-6) return;
      const mi0 = K.mats[0], m = X.M[mi0];
      const kgPc = (m.cw > 0 ? m.cw : opt.defCaseKg) / (m.cp > 0 ? m.cp : 1);
      cand.push({k, n, pool, kgPc, val: n.total * (m.rate || 1)});
    });
    cand.sort((a, b) => b.val - a.val);
    for (const c of cand) {
      if (want <= 0) break;
      const q = Math.min(c.n.total, c.pool.fresh + c.pool.old, want / c.kgPc);
      if (q * c.kgPc < 1) continue;
      const d = {fresh: c.n.fresh * (q / c.n.total), n1: 0, n2: 0, n3: q, total: q};
      allocate(c.pool, [d]);
      d.byTier = [0, 0, 0, q]; d.topup = true; d.target = to;
      const before = lines.length;
      emit(leg, c.k, from, to, d, lt, () => 'top-up: next truck\'s need');
      for (let i = before; i < lines.length; i++) { lines[i].topup = true; want -= lines[i].kg; }
    }
  };
  laneKg(1).forEach((kg, x) => { const [f, t2] = x.split('>').map(Number); topUp(1, f, t2, kg); });

  /* ---- 3P flush: no stock is held at a 3P. Whatever a 3P still holds after
     leg 1 goes to the nearest MWH it may send to (the hub on a tie): the MWH
     distributes it in later plans. */
  /* a 3P with its own list of several destinations: what is left is spread
     over THOSE destinations - first what each still needs (a depot's own
     need; an MWH's buffer plus its depots not on the list), the rest by
     their share of the month forecast - not all to the nearest MWH. */
  const spread3p = u => {
    const list = ((opt.srcAllow || {})[X.S[u].code] || []).map(c => X.six[c]).filter(d => d != null && d !== u && (X.isDepot[d] || X.isMwh[d]));
    if (list.length < 2) return false;
    const onList = new Set(list);
    const kids = W => depots.filter(di => X.mwhOf[di] === W && !onList.has(di) && mwhSends(W, di));
    X.keys.forEach((K, k) => {
      const p = poolOf(k, u); if (!p || p.fresh + p.old < 1e-6) return;
      const Q = p.fresh + p.old;
      const ds = list.map(d => {
        const lt = X.LT(u, d) ?? opt.defaultLT;
        let need = 0, fc = 0;
        if (X.isDepot[d]) { need = needAt(ctx, k, d, lt, legGit).total; fc = get(Dm.F0, k, d); }
        else {
          const b = mwhNeed(ctx, k, d, lt, legGit); need = b ? b.total : 0;
          kids(d).forEach(di => { need += needAt(ctx, k, di, lt + (X.LT(d, di) ?? opt.defaultLT), legGit).total; fc += get(Dm.F0, k, di); });
        }
        return {d, lt, need: Math.max(0, need), fc: Math.max(0, fc), q: 0, why: ''};
      });
      const tn = ds.reduce((a, x) => a + x.need, 0);
      let left = Q;
      if (tn > 1e-6) { const f = Math.min(1, Q / tn); ds.forEach(x => { x.q = x.need * f; if (x.q > 1e-6) x.why = 'its need'; }); left = Q - Math.min(Q, tn); }
      if (left > 1e-6) {
        const tf = ds.reduce((a, x) => a + x.fc, 0);
        if (tf > 1e-6) ds.forEach(x => { const g = left * x.fc / tf; if (g > 1e-6) { x.q += g; x.why = x.why ? x.why + ' + forecast share' : 'forecast share'; } });
        else { const near = ds.slice().sort((a, b) => a.lt - b.lt)[0]; near.q += left; near.why = near.why ? near.why + ' + rest' : 'rest (no forecast)'; }
      }
      ds.forEach(x => {
        if (x.q < 1e-6) return;
        const r = x.q / Q, d = {qFresh: p.fresh * r, qOld: p.old * r, byTier: [0, 0, 0, x.q], target: x.d, crit: false};
        const before = lines.length;
        emit(1, k, u, x.d, d, x.lt, () => '3P flush to the selected destinations: ' + x.why);
        for (let i = before; i < lines.length; i++) lines[i].flush = true;
      });
    });
    return true;
  };
  if (opt.flush3p) units.filter(u => X.S[u].type === '3P').forEach(u => {
    if (spread3p(u)) return;
    const h3 = X.six[opt.hub3p];
    const ws = mwhs.filter(w => allowed(u, w)).sort((a, b) => ((X.LT(u, a) ?? 99) - (X.LT(u, b) ?? 99)) || (b === h3) - (a === h3));
    const hub = ws[0]; if (hub == null) return;
    X.keys.forEach((K, k) => {
      const p = poolOf(k, u); if (!p || p.fresh + p.old < 1e-6) return;
      const q = p.fresh + p.old;
      const d = {qFresh: p.fresh, qOld: p.old, byTier: [0, 0, 0, q], target: hub, crit: false};
      const before = lines.length;
      emit(1, k, u, hub, d, X.LT(u, hub) ?? 1, () => '3P flush: no stock held at 3P, to ' + X.S[hub].code);
      for (let i = before; i < lines.length; i++) lines[i].flush = true;
    });
  });

  /* ================= LEG 2: MWH -> depots ============================= */
  X.keys.forEach((K, k) => {
    const pass = (mwList, depFilter, urgentOnly) => {
      mwList.forEach(wi => {
        mwhPass(wi, depFilter, urgentOnly);
        if (opt.doCallback) callbackPass(wi, depFilter, urgentOnly);
      });
    };
    const callbackPass = (wi, depFilter, urgentOnly) => {
      if ((opt.cbOff || []).includes(X.S[wi].code)) return;
      const co = X.six[(opt.callback || {})[X.S[wi].code]]; if (co == null) return;
      const don = donorSurplus(k, co); if (!don) return;
      const dem = [];
      depots.forEach(di => {
        if (di === co || !depFilter(wi, di) || !mwhSends(wi, di)) return;
        const lt = X.LT(co, di) ?? X.LT(wi, di) ?? opt.defaultLT;
        const n = needAt(ctx, k, di, lt, legGit);
        if (n.total <= 1e-6) return;
        critical(n, k, di);
        n.si = di; n.target = di; n.a = lt; n.cb = true;
        dem.push(n);
      });
      if (!dem.length) return;
      const pool = {fresh: don.fresh, old: don.surplus - don.fresh};
      dem.forEach(d => { d.freshLeft = d.fresh; d.qFresh = 0; d.qOld = 0; d.got = null; d.byTier = null; });
      shareTier(pool, dem, 1); shareTier(pool, dem, 2); if (!urgentOnly) shareTier(pool, dem, 3);
      /* booked in two steps: callback STO depot -> MWH (same site, no truck),
         then MWH -> depot on the MWH's truck. Stock is taken from the depot. */
      dem.forEach(d => {
        const before = lines.length;
        emit(2, k, co, d.si, d, X.LT(wi, d.si) ?? d.a, x => 'callback from ' + X.S[co].code + ': ' + why(x));
        for (let i = before; i < lines.length; i++) { lines[i].from = wi; lines[i].cbFrom = co; }
      });
    };
    const mwhPass = (wi, depFilter, urgentOnly) => {
      {
        const pool = poolOf(k, wi); if (!pool || pool.fresh + pool.old <= 1e-6) return;
        /* the MWH keeps its own MT/Ecom buffer except against open orders */
        const buf = mwhNeed(ctx, k, wi, 0, null);
        const dem = [];
        depots.forEach(di => {
          if (!depFilter(wi, di) || !mwhSends(wi, di)) return;
          const lt = X.LT(wi, di) ?? opt.defaultLT;
          const n = needAt(ctx, k, di, lt, legGit);
          if (n.total <= 1e-6) return;
          critical(n, k, di);
          n.si = di; n.target = di; n.a = lt;
          dem.push(n);
        });
        if (!dem.length) return;
        /* arrival-only: the MWH's other stock already holds its buffer */
        const raw = arrCap ? poolRaw(k, wi) : null;
        const keep = !buf ? 0 : arrCap ? Math.max(0, Math.min((buf.T || 0) - (raw.fresh - pool.fresh), pool.fresh))
                                       : Math.min(buf.T || 0, pool.fresh);
        /* tier 1 sees the whole pool, tiers 2-3 the pool above the buffer */
        const full = {fresh: pool.fresh, old: pool.old};
        dem.forEach(d => { d.freshLeft = d.fresh; d.qFresh = 0; d.qOld = 0; d.got = null; d.byTier = null; });
        shareTier(full, dem, 1);
        const above = {fresh: Math.max(0, full.fresh - keep), old: full.old};
        shareTier(above, dem, 2); if (!urgentOnly) shareTier(above, dem, 3);
        dem.forEach(d => {
          const lt = X.LT(wi, d.si) ?? opt.defaultLT;
          emit(2, k, wi, d.si, d, lt, why);
        });
      }
    };
    /* MWH -> MWH: a source MWH whose "Only selected" list holds another MWH
       sends that MWH what its depots still need (those not ticked for direct
       supply), plus its MT/Ecom buffer. The receiving MWH forwards the depot
       part on arrival (pass-through). */
    const xferPass = wi => {
      const list = (opt.srcAllow || {})[X.S[wi].code]; if (!list) return;
      list.map(c => X.six[c]).filter(W => W != null && W !== wi && X.isMwh[W]).forEach(W => {
        const pool = poolOf(k, wi); if (!pool || pool.fresh + pool.old <= 1e-6) return;
        const lt1 = X.LT(wi, W) ?? opt.defaultLT;
        const dem = [];
        depots.forEach(di => {
          if (X.mwhOf[di] !== W || list.includes(X.S[di].code) || !mwhSends(W, di)) return;
          const lt = lt1 + (X.LT(W, di) ?? opt.defaultLT);
          const n = needAt(ctx, k, di, lt, legGit);
          if (n.total <= 1e-6) return;
          critical(n, k, di);
          n.depot = di; n.si = W; n.target = W; n.a = lt1;
          dem.push(n);
        });
        /* the receiving MWH's own buffer, net of what it still holds */
        const bw = mwhNeed(ctx, k, W, lt1, legGit);
        if (bw) {
          const pw = poolOf(k, W), held = pw ? pw.fresh : 0;
          const q = Math.max(0, (bw.T || 0) - (bw.cover || 0) - held - (bw.git || 0));
          if (q > 1e-6) dem.push({n1: 0, n2: 0, n3: q, total: q, fresh: q, buffer: true, depot: W, si: W, target: W, a: lt1});
        }
        if (!dem.length) return;
        const buf = mwhNeed(ctx, k, wi, 0, null);
        const keep = buf ? Math.min(buf.T || 0, pool.fresh) : 0;
        const full = {fresh: pool.fresh, old: pool.old};
        dem.forEach(d => { d.freshLeft = d.fresh; d.qFresh = 0; d.qOld = 0; d.got = null; d.byTier = null; });
        shareTier(full, dem, 1);
        const above = {fresh: Math.max(0, full.fresh - keep), old: full.old};
        shareTier(above, dem, 2); shareTier(above, dem, 3);
        dem.forEach(d => {
          const before = lines.length;
          emit(2, k, wi, W, d, lt1, x => (x.buffer ? 'MWH transfer to ' + X.S[W].code + ': its MT/Ecom buffer'
            : 'MWH transfer to ' + X.S[W].code + ' for ' + X.S[x.depot].code + ' ' + X.S[x.depot].name + ': ' + why(x)));
          for (let i = before; i < lines.length; i++) { lines[i].xfer = true; if (!d.buffer) lines[i].viaDepot = d.depot; }
        });
      });
    };
    const explicit = wi => (opt.srcAllow || {})[X.S[wi].code] != null;
    /* own depots first; Raipur also from Indore */
    pass(mwhs, (wi, di) => X.mwhOf[di] === wi);
    pass(mwhs, (wi, di) => (opt.backupMwh[X.S[di].code] || []).includes(X.S[wi].code));
    /* an MWH with its own list: the other depots ticked get their full need,
       then the MWHs ticked get their depots' need */
    pass(mwhs.filter(explicit), (wi, di) => X.mwhOf[di] !== wi);
    mwhs.filter(explicit).forEach(xferPass);
    /* the hub serves other regions only for what cannot wait (orders, trend) */
    pass(mwhs.filter(wi => opt.anyMwh.includes(X.S[wi].code) && !explicit(wi)), (wi, di) => X.mwhOf[di] !== wi, true);
  });

  /* ---- pass-through: leg-1 stock landed at a hub for another depot (3Ps via
     Ambala, Dehradun via Ambala) goes on from the hub in leg 2, for what the
     depot still needs once that truck has landed */
  {
    const grp = new Map();
    lines.forEach(l => { if ((l.leg !== 1 && !l.xfer) || l.viaDepot == null) return;
      const x = l.k + '|' + l.to + '|' + l.viaDepot; let g = grp.get(x); if (!g) grp.set(x, g = []); g.push(l); });
    grp.forEach(ls => {
      const k = ls[0].k, hub = ls[0].to, di = ls[0].viaDepot;
      const aH = Math.max(...ls.map(l => l.a)), aV = aH + (X.LT(hub, di) ?? opt.defaultLT);
      const Q = ls.reduce((a, l) => a + l.pcs, 0);
      const n = needAt(ctx, k, di, aV, legGit);
      const r = Math.min(1, n.total / Q);
      if (r * Q < 1) return;
      let sent = 0;
      ls.forEach(l => {
        const m = X.M[l.mi], cpp = m.cp > 0 ? m.cp : 1;
        const pcs = l.inPcs ? Math.round(l.pcs * r) : Math.round(l.cases * r) * cpp; if (pcs <= 0) return;
        const cases = pcs / cpp;
        lines.push({leg: 2, k, mi: l.mi, from: hub, to: di, pcs, cases, kg: cases * (m.cw > 0 ? m.cw : opt.defCaseKg),
                    a: aV, tier: l.tier, crit: l.crit, pass: true, inPcs: l.inPcs,
                    reason: 'on arrival from ' + X.S[l.from].code + ' (day ' + aH + '): ' + l.reason, via: null, passDay: aH});
        sent += pcs;
      });
      if (sent) addGit(k, di, aV, sent);
    });
  }

  laneKg(2).forEach((kg, x) => { const [f, t2] = x.split('>').map(Number); if (X.isMwh[f]) topUp(2, f, t2, kg); });

  /* ================= LEG 3: inter-depot transfer =======================
     Only for what cannot wait: open orders the depot cannot ship, or stock
     that runs out before the next truck already planned or on the road lands.
     A donor gives only what it holds beyond its own need until ITS next
     truck, and only from lots made within the age limit (9 months). */
  const gitBefore = (k, si, a) => gitBy(gin, k, si, a - 1) + gitBy(legGit, k, si, a - 1);
  /* a depot served through a hub (Dehradun) takes nothing by inter-depot
     transfer and gives nothing: the hub serves it in leg 2 */
  const idtDepots = depots.filter(di => !(opt.noIdt || []).includes(X.S[di].code));
  /* zone of a depot = the zone of the MWH it hangs off (North DP44, South
     DP29, East DP39, West DP38), so Raipur is East like its MWH */
  const zoneOf = si => { const w = X.isMwh[si] ? si : X.mwhOf[si]; return w != null ? X.S[w].zone : X.S[si].zone; };
  const ZF = opt.idtZoneFallback || {};
  const zoneRank = (from, to) => {
    if (!opt.idtZoneOrder) return 0;
    const zt = zoneOf(to), zf = zoneOf(from);
    if (zf === zt) return 0;
    const ord = ZF[zt] || []; const i = ord.indexOf(zf);
    return i < 0 ? 9 : i + 1;
  };
  const idtOrder = (to) => (a, b) => zoneRank(a.si, to) - zoneRank(b.si, to) || (X.LT(a.si, to) ?? 99) - (X.LT(b.si, to) ?? 99)
                                     || X.km(a.si, to) - X.km(b.si, to);
  const idtLog = [], idtKeep = new Map(), idtGap = new Map();
  if (opt.doIdt) X.keys.forEach((K, k) => {
    /* ---- pass 1: urgent - open orders not covered, or out before the next truck */
    const short = [];
    idtDepots.forEach(di => {
      const s = stkK.get(kk(k, di)) || {q: 0, fresh: 0};
      const rate = get(Dm.tr, k, di), ooQ = get(Dm.oo, k, di);
      const land = nextLand(k, di);
      const g = gitBefore(k, di, land);
      const ooGap = Math.max(0, ooQ - s.fresh - gitBy(gin, k, di, 2));
      const outGap = Math.max(0, rate * land - (s.q + g));
      const gap = Math.max(ooGap, outGap);
      if (gap <= 1e-6) return;
      short.push({di, gap, ooGap, land, left: gap, doc: rate > 0 ? Math.round(s.q / rate) : 99});
    });
    let donors = null;
    const getDonors = () => { if (!donors) { donors = []; idtDepots.forEach(si => { const d = donorSurplus(k, si); if (d) { donors.push({si, ...d}); idtKeep.set(kk(k, si), d.keep); } }); } return donors; };
    if (short.length && getDonors().length) {
      short.sort((a, b) => b.ooGap - a.ooGap || a.doc - b.doc);
      short.forEach(sh => idtGap.set(kk(k, sh.di), sh.gap));
      short.forEach(sh => {
        const cand = donors.filter(d => d.surplus > 1e-6 && d.si !== sh.di && X.LT(d.si, sh.di) != null
                                        && X.LT(d.si, sh.di) < sh.land).sort(idtOrder(sh.di));
        for (const d of cand) {
          if (sh.left <= 1e-6) break;
          const q = Math.min(d.surplus, sh.left);
          const qF = Math.min(q, d.fresh, Math.max(sh.ooGap, 0) > 0 ? q : 0) || Math.min(q, d.fresh);
          const qO = Math.max(0, q - qF);
          d.surplus -= q; d.fresh = Math.max(0, d.fresh - qF); sh.left -= q;
          const o1 = Math.min(q, sh.ooGap);
          const dd = {qFresh: qF, qOld: qO, byTier: [0, o1, q - o1, 0], crit: true, doc: sh.doc, target: sh.di};
          const before = lines.length;
          emit(3, k, d.si, sh.di, dd, X.LT(d.si, sh.di), x => why(x) + (zoneRank(d.si, sh.di) ? ', from ' + zoneOf(d.si) + ' zone' : ''));
          for (let i = before; i < lines.length; i++) lines[i].idtUrgent = true;
        }
      });
    }
    /* ---- pass 2 (optional): balance to coverage %. After everything above,
       a depot still below Forecast x coverage (stock + MTD sale + all GIT +
       all planned inbound) takes from depots above it - only their surplus
       above their own coverage and own need, lots within 9 months. */
    if (opt.idtBalance) {
      const cov = (opt.idtBalancePct || 100) / 100;
      const pos = di => { const s = stkK.get(kk(k, di)) || {q: 0};
        return s.q + get(Dm.sale, k, di) + gitBy(gin, k, di, 999) + gitBy(legGit, k, di, 999); };
      const tgt = di => depotFc(X, Dm, k, di).F0 * cov;
      const gaps = idtDepots.map(di => ({di, left: Math.max(0, tgt(di) - pos(di))})).filter(g => g.left > 1e-6);
      if (!gaps.length) return;
      const ds = getDonors().map(d => {
        /* stay at or above own coverage after everything already planned out */
        const out = (takenK.get(kk(k, d.si)) || {f: 0, o: 0});
        const over = Math.max(0, pos(d.si) - (out.f + out.o) - tgt(d.si) * (1 + (opt.idtBalanceMargin || 0) / 100));
        idtKeep.set(kk(k, d.si), Math.max(idtKeep.get(kk(k, d.si)) || 0, d.keep, tgt(d.si) * (1 + (opt.idtBalanceMargin || 0) / 100) - get(Dm.sale, k, d.si) - gitBy(gin, k, d.si, 999) - gitBy(legGit, k, d.si, 999)));
        return {si: d.si, surplus: Math.min(d.surplus, over), fresh: Math.min(d.fresh, over)};
      }).filter(d => d.surplus > 1e-6);
      if (!ds.length) return;
      gaps.sort((a, b) => b.left / Math.max(1, tgt(b.di)) - a.left / Math.max(1, tgt(a.di)));
      gaps.forEach(g => idtGap.set(kk(k, g.di), (idtGap.get(kk(k, g.di)) || 0) + g.left));
      gaps.forEach(g => {
        const cand = ds.filter(d => d.surplus > 1e-6 && d.si !== g.di).sort(idtOrder(g.di));
        for (const d of cand) {
          if (g.left <= 1e-6) break;
          const q = Math.min(d.surplus, g.left);
          const qO = Math.min(q, Math.max(0, d.surplus - d.fresh)), qF = q - qO;   /* older first: it's the balancing stock */
          d.surplus -= q; d.fresh = Math.max(0, d.fresh - qF); g.left -= q;
          const dd = {qFresh: qF, qOld: qO, byTier: [0, 0, 0, q], crit: false, target: g.di};
          const before = lines.length;
          emit(3, k, d.si, g.di, dd, X.LT(d.si, g.di) ?? opt.defaultLT,
               () => 'balance to ' + Math.round(cov * 100) + '% coverage' + (zoneRank(d.si, g.di) ? ', from ' + zoneOf(d.si) + ' zone' : ''));
          for (let i = before; i < lines.length; i++) lines[i].idtBalance = true;
        }
      });
    }
  });

  /* critical by rule */
  {
    const pc = (opt.critStockPct || 0) / 100, cache = new Map();
    const stkPct = (k, di) => {
      const x = kk(k, di); if (cache.has(x)) return cache.get(x);
      const f = needAt(ctx, k, di, 0, null).F0, q = (stkK.get(x) || {q: 0}).q;
      const v = f > 0 ? q / f : null; cache.set(x, v); return v;
    };
    lines.forEach(l => {
      l.critOO = l.crit ? 1 : 0;
      const di = l.viaDepot != null ? l.viaDepot : l.to;
      const p = X.isDepot[di] ? stkPct(l.k, di) : null;
      l.stkPct = p == null ? null : Math.round(p * 100);
      l.critStk = p != null && p < pc ? 1 : 0;
      l.crit = opt.critRule === 'engine' ? l.critOO : opt.critRule === 'stock' ? l.critStk : (l.critOO || l.critStk ? 1 : 0);
      if (l.critStk && opt.critRule !== 'engine') l.reason += ', stock ' + l.stkPct + '% of forecast';
    });
  }
  applyMinCases(lines, X, opt, stk);
  const validation = validateIdt();
  function validateIdt() {
    const L3 = lines.filter(l => !l.off && l.leg === 3 && l.cases > 0);
    const res = [];
    const add = (check, bad, n, detail) => res.push({check, result: bad ? 'FAIL' : 'PASS', n, detail});
    /* 1. no donor below what it must keep (its own need, as worked out when it
       was chosen as donor) after everything it sends, all legs */
    const outK = new Map(); lines.forEach(l => { if (l.off) return; const s = l.cbFrom != null ? l.cbFrom : l.from; const x = kk(l.k, s); outK.set(x, (outK.get(x) || 0) + l.pcs); });
    const donorsK = new Set(L3.map(l => kk(l.k, l.from)));
    let b1 = 0, ex1 = [];
    donorsK.forEach(x => {
      const k = Math.floor(x / 4096), si = x % 4096, s = stkK.get(x) || {q: 0};
      const keep = Math.min(idtKeep.get(x) || 0, s.q);
      const tol = L3.filter(l => l.k === k && l.from === si).reduce((a, l) => a + (X.M[l.mi].cp || 1), 0);
      if (s.q - (outK.get(x) || 0) < keep - tol - 1) { b1++; if (ex1.length < 5) ex1.push(X.keys[k].id + ' @ ' + X.S[si].code); }
    });
    add('No donor depot falls below its own need (target left, cover to its next truck, open orders)', b1, donorsK.size, b1 ? 'e.g. ' + ex1.join(', ') : donorsK.size + ' donor SKU-depots checked');
    /* 2. nothing older than the age limit moves between depots */
    const elig = new Map();
    stk.forEach((e, x) => { const si = x % 4096; if (!X.isDepot[si]) return; let q = 0; (e.lots || []).forEach(lt => { if (lt.age != null && lt.age <= opt.idtMaxAgeDays) q += lt.q; }); elig.set(x, q); });
    const sentM = new Map(); L3.forEach(l => { const x = l.mi * 4096 + l.from; sentM.set(x, (sentM.get(x) || 0) + l.pcs); });
    let b2 = 0; sentM.forEach((q, x) => { if (q > (elig.get(x) || 0) + 1) b2++; });
    add('No stock made more than ' + Math.round(opt.idtMaxAgeDays / 30) + ' months ago moves between depots', b2, sentM.size, b2 ? b2 + ' material-donor pairs exceed their eligible lots' : sentM.size + ' material-donor pairs within eligible lots');
    /* 3. no double cover: a depot receives no more than the gap left after
       GIT and the leg 1 / leg 2 trucks (worked out before the inter-depot moves) */
    const recv = new Map(); L3.forEach(l => { const x = kk(l.k, l.to); recv.set(x, (recv.get(x) || 0) + l.pcs); });
    let b3 = 0, ex3 = [];
    recv.forEach((q, x) => {
      const k = Math.floor(x / 4096), di = x % 4096;
      const tol = L3.filter(l => l.k === k && l.to === di).reduce((a, l) => a + (X.M[l.mi].cp || 1), 0);
      if (q > (idtGap.get(x) || 0) + tol + 1) { b3++; if (ex3.length < 5) ex3.push(X.keys[k].id + ' @ ' + X.S[di].code); }
    });
    add('No double cover: inter-depot stock only where GIT and the leg 1 / leg 2 trucks leave a gap', b3, recv.size, b3 ? 'e.g. ' + ex3.join(', ') : recv.size + ' receiving SKU-depots checked');
    /* 4. excluded depots */
    const b4 = L3.filter(l => (opt.noIdt || []).includes(X.S[l.from].code) || (opt.noIdt || []).includes(X.S[l.to].code)).length;
    add('No inter-depot move to or from ' + (opt.noIdt || []).join(', '), b4, L3.length, b4 ? b4 + ' lines' : 'none');
    /* 5. full cases (except SKUs planned in pieces) */
    const b5 = L3.filter(l => !l.inPcs && Math.abs(l.cases - Math.round(l.cases)) > 1e-6).length;
    add('Transfers in full cases (except SKUs planned in pieces)', b5, L3.length, b5 ? b5 + ' lines' : L3.length + ' lines');
    /* 6. a donor never sends more than it holds */
    const heldM = new Map(); stk.forEach((e, x) => heldM.set(x, e.q));
    const allOut = new Map(); lines.forEach(l => { if (l.off) return; const s = l.cbFrom != null ? l.cbFrom : l.from; if (!X.isDepot[s]) return; const x = l.mi * 4096 + s; allOut.set(x, (allOut.get(x) || 0) + l.pcs); });
    let b6 = 0; allOut.forEach((q, x) => { if (q > (heldM.get(x) || 0) + 1) b6++; });
    add('No depot sends more than its stock', b6, allOut.size, b6 ? b6 + ' material-depot pairs' : allOut.size + ' material-depot pairs');
    return res;
  }
  const trucks = buildTrucks(lines, X, opt);
  return {opt, X, lines, trucks, needs, log, stk, stkK, Dm, ctx, legGit, arrivedQ, validation};
}

const API = {plan, DEF, needAt, mwhNeed, index, buildTrucks};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.DPE = API;
})(typeof window !== 'undefined' ? window : globalThis);
