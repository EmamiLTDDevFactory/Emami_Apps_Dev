/*
   DAILY COST WATCH - pure logic (no database, no network), tested in test/costWatchCore.test.js.

   - costLineFilter: the CostLineSet Mode B $filter, built exactly like the Costing Cockpit's buildSelectionFilter
     (Edm.Decimal "m" suffix, Edm.Boolean flags on CostLineSet, BudgetYr quoted, "or" lists).
   - buildSnapshots: one snapshot per FG header, leaf rows only, one line per component + unit (the app's
     src/lib/snapshots format, plus sel_curr): q = ProdQty / ExplQty, rates quantity-weighted.
   - evaluateRules: R1..R10 on yesterday vs today (and 30 days ago), with rupee impact, severity and evidence.
   - shouldNotify: an unchanged open alert is not repeated for 7 days unless it got 25 % worse; snoozed = silent.
   - digest: subject, HTML / text table ranked by impact, deterministic summary, signed acknowledge / snooze links.
   - validateNumbers: the AI numbers rule (every number in the summary must be a cited fact).
   Money in exact decimal strings: sums via the small Dec helper (scaled BigInt, 12 decimals).
*/
const crypto = require('crypto');

/* ---------- exact decimals (12 dp, BigInt) ---------- */
const SCALE = 12n;
const TEN = 10n ** SCALE;
function toBig(v) {
    const s = String(v ?? '0').trim() || '0';
    if (!/^-?\d*\.?\d*(e-?\d+)?$/i.test(s)) return 0n;
    const n = Number(s);
    if (/e/i.test(s)) return BigInt(Math.round(n * 1e12));
    const neg = s.startsWith('-');
    const [i, f = ''] = s.replace('-', '').split('.');
    const big = BigInt(i || '0') * TEN + BigInt((f + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE)) || '0');
    return neg ? -big : big;
}
const Dec = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => (a * b) / TEN,
    div: (a, b) => (b === 0n ? 0n : (a * TEN) / b),
    abs: (a) => (a < 0n ? -a : a),
    num: (a) => Number(a) / 1e12,
    str: (a, dp = 6) => {
        const neg = a < 0n; const x = neg ? -a : a;
        const i = x / TEN; const f = (x % TEN).toString().padStart(Number(SCALE), '0').slice(0, dp);
        return `${neg ? '-' : ''}${i}${dp ? `.${f}` : ''}`;
    },
};

/* ---------- OData filter (mirror of the app's literals) ---------- */
const str = (v) => `'${String(v).replace(/'/g, "''")}'`;
const dec = (v) => `${String(Number(v))}m`;
const anyOf = (prop, vals, lit = str) => {
    const v = [...new Set((vals || []).map((x) => String(x).trim()).filter(Boolean))];
    if (!v.length) return null;
    return v.length === 1 ? `${prop} eq ${lit(v[0])}` : `(${v.map((x) => `${prop} eq ${lit(x)}`).join(' or ')})`;
};

/** settings: { prio[], donor, lookback, maxLevel, inclFrt, stdFrt, inclBudget, budgetYr, inclCover, hor1..3 } */
function costLineFilter(skus, plant, qty, s = {}) {
    const parts = [
        `Mode eq 'B'`,
        anyOf('Matnr', skus.map((x) => x.toUpperCase())),
        `Werks eq ${str(String(plant).toUpperCase())}`,
        `ExplQty eq ${dec(qty || 1)}`,
        s.maxLevel > 0 ? `MaxLevel eq ${Math.round(s.maxLevel)}` : null,
        `Lookback eq ${Math.round(s.lookback || 365)}`,
        `Prio eq ${str((s.prio && s.prio.length ? s.prio : ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW']).join(','))}`,
        s.donor ? `DonorPlant eq ${str(String(s.donor).toUpperCase())}` : null,
        `InclFrt eq ${s.inclFrt === false ? 'false' : 'true'}`,
        `StdFrt eq ${s.stdFrt ? 'true' : 'false'}`,
        `InclBudget eq ${s.inclBudget ? 'true' : 'false'}`,
        s.inclBudget && s.budgetYr ? `BudgetYr eq ${str(String(s.budgetYr))}` : null,
        `InclCover eq ${s.inclCover ? 'true' : 'false'}`,
        ...(s.inclCover ? [`Hor1 eq ${s.hor1 || 30}`, `Hor2 eq ${s.hor2 || 60}`, `Hor3 eq ${s.hor3 || 90}`] : []),
    ];
    if (!parts[1]) throw new Error('At least one SKU is required.');
    return parts.filter(Boolean).join(' and ');
}

/** Query string with OData $ options literal and values encodeURIComponent'ed (never "+"). */
const queryString = (params) => Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

/* ---------- snapshots ---------- */
// a row whose own cost counts: a leaf, or a subcontracted assembly (MARC-SOBSL 30: the subcontractor's charge on top of its components), same as the app's isLeafRow
const isLeaf = (r) => !r.Haschild || String(r.Haschild).trim() === '' || String(r.Sobsl ?? '').trim() === '30';
const wavg = (a, aq, b, bq) => (aq + bq === 0n ? b : Dec.div(Dec.mul(a, aq) + Dec.mul(b, bq), aq + bq));

function paramsHash(p) {
    return crypto.createHash('sha1').update(JSON.stringify([p.system, (p.prio || []).join(','), p.lookback, p.donor || '', String(p.qty), p.inclFrt !== false, !!p.stdFrt])).digest('hex').slice(0, 12);
}

/** Sources whose rate already includes freight (env FREIGHT_INCLUDED_SOURCES, default CONSUMP,MBEW; empty = none). */
const freightIncluded = (src) => (process.env.FREIGHT_INCLUDED_SOURCES ?? 'CONSUMP,MBEW').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).includes(String(src || '').trim().toUpperCase());

function buildSnapshots(rows, params) {
    const qty = toBig(params.qty || 1) || TEN;
    const heads = new Map();
    for (const r of rows) {
        if (!isLeaf(r)) continue;
        const hk = `${r.Hwerks}|${r.Headmat}`;
        let h = heads.get(hk);
        if (!h) heads.set(hk, (h = { headtxt: r.Headtxt || '', lines: new Map() }));
        const q = toBig(r.ProdQty) > 0n ? Dec.div(toBig(r.ProdQty), qty) : toBig(r.Hbmeng) > 0n ? Dec.div(toBig(r.Menge), toBig(r.Hbmeng)) : 0n;
        // Consumption / MBEW rates already include freight: SAP's added freight is not counted (same rule as the app).
        const incl = freightIncluded(r.SelSource);
        const cur = { r: toBig(r.SelRatePcLoc), f: incl ? 0n : toBig(r.FrtPcLoc), x: toBig(r.SelFxInr) > 0n ? toBig(r.SelFxInr) : TEN, p: incl ? toBig(r.TotCostPcInr) - toBig(r.FrtPcInr) : toBig(r.TotCostPcInr) };
        const ck = `${r.Idnrk}|${r.Meins}`;
        const e = h.lines.get(ck);
        if (!e) {
            h.lines.set(ck, { q, ...cur, l: { hwerks: r.Hwerks, headmat: r.Headmat, idnrk: r.Idnrk, maktx: r.Maktx || '', mtart: r.Mtart || '', meins: r.Meins || '', sel_source: r.SelSource || '', sel_curr: r.SelCurr || r.LocCurr || '', src_count: Number(r.SrcCount) || 0, donor: r.Donor || '', loc_curr: r.LocCurr || '', cov_h1: r.CovH1 === undefined || r.CovH1 === null ? '' : String(r.CovH1), bud_landed: String(r.BudLanded ?? '0') } });
        } else {
            e.r = wavg(e.r, e.q, cur.r, q); e.f = wavg(e.f, e.q, cur.f, q); e.x = wavg(e.x, e.q, cur.x, q); e.p = wavg(e.p, e.q, cur.p, q);
            e.q = e.q + q;
        }
    }
    const hash = paramsHash(params);
    return [...heads.entries()].map(([hk, h]) => {
        const lines = [...h.lines.values()].map((e) => ({ ...e.l, q: Dec.str(e.q, 9), r_loc: Dec.str(e.r, 6), f_loc: Dec.str(e.f, 6), fx_inr: Dec.str(e.x, 6), p_inr: Dec.str(e.p, 6) }));
        const total = lines.reduce((a, l) => a + Dec.mul(toBig(l.q), toBig(l.p_inr)), 0n);
        const [plant, sku] = hk.split('|');
        return { sku, plant, headtxt: h.headtxt, params_hash: hash, total_per_unit: Dec.str(total, 6), line_count: lines.length, lines };
    });
}

/* ---------- rules ---------- */
const DEFAULT_THRESHOLDS = {
    r1DayPct: 2, r1MonthPct: 5, r2Pct: 10, r2MinSharePct: 0.5, r4MinSharePct: 1, r5Pct: 25, r6Pct: 1, r7QtyPct: 5, r8LeadDays: 15, r8MinSharePct: 1,
    highInr: 50000, mediumInr: 5000,
};
const GOOD = new Set(['CONTRACT', 'INFOREC']);
const WEAK = new Set(['MARKT', 'CONSUMP', 'MBEW']);
const pct = (a, b) => (b === 0n ? null : Dec.num(Dec.div(a - b, Dec.abs(b))) * 100);
const keyOf = (l) => `${l.idnrk}|${l.meins}`;
const perPc = (l) => Dec.mul(toBig(l.q), toBig(l.p_inr));
const median = (xs) => { const v = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2n; };

function severity(impactInr, t) {
    const v = Math.abs(impactInr);
    return v >= t.highInr ? 'high' : v >= t.mediumInr ? 'medium' : 'low';
}

/**
 * prev / cur / d30: snapshots ({ total_per_unit, lines }); history: totals of the last 7 days; volume: pieces for the
 * rupee impact (plan quantity or 1000); checks: { prev: [...], cur: [...] } PlanCheckSet rows (R9).
 */
function evaluateRules({ prev, cur, d30, history = [], history30 = [], monthStart = null, volume = 1000, thresholds = {}, checks = null }) {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const out = [];
    const vol = toBig(volume || 1000);
    const total1 = toBig(cur.total_per_unit);
    const add = (rule, idnrk, direction, deltaPc, evidence) => {
        const impact = Dec.num(Dec.mul(deltaPc, vol));
        out.push({ rule, sku: cur.sku, plant: cur.plant, idnrk: idnrk || '', direction, impact_inr: Math.round(impact * 100) / 100, severity: severity(impact, t), evidence: { ...evidence, delta_per_pc: Dec.str(deltaPc, 6), volume: Number(volume) } });
    };
    if (prev) {
        const total0 = toBig(prev.total_per_unit);
        const dDay = pct(total1, total0);
        const d30v = d30 ? pct(total1, toBig(d30.total_per_unit)) : null;
        if ((dDay !== null && Math.abs(dDay) > t.r1DayPct) || (d30v !== null && Math.abs(d30v) > t.r1MonthPct)) {
            const med = median(history.map(toBig));
            add('R1', '', total1 >= total0 ? 'up' : 'down', total1 - total0, {
                text: 'Cost per finished piece moved', before: prev.total_per_unit, after: cur.total_per_unit, pct_day: dDay, pct_30d: d30v,
                median_7d: med === null ? null : Dec.str(med, 6), month_start: monthStart ? monthStart.total_per_unit : null,
            });
        }
        const total = total1 === 0n ? 1n : total1;
        const b = new Map(prev.lines.map((l) => [keyOf(l), l]));
        const c = new Map(cur.lines.map((l) => [keyOf(l), l]));
        for (const [k, l1] of c) {
            const l0 = b.get(k);
            const share = Dec.num(Dec.div(perPc(l1), total)) * 100;
            if (!l0) { add('R7', l1.idnrk, 'added', perPc(l1), { text: 'Component added to the BOM', after: l1.q, maktx: l1.maktx }); continue; }
            const p0 = toBig(l0.p_inr); const p1 = toBig(l1.p_inr);
            const rp = pct(p1, p0);
            if (rp !== null && Math.abs(rp) > t.r2Pct && share >= t.r2MinSharePct) add('R2', l1.idnrk, p1 >= p0 ? 'up' : 'down', Dec.mul(toBig(l1.q), p1 - p0), { text: 'Component rate moved', before: l0.p_inr, after: l1.p_inr, pct: rp, share_pct: share, maktx: l1.maktx });
            const s0 = l0.sel_source; const s1 = l1.sel_source;
            if ((GOOD.has(s0) && WEAK.has(s1)) || (s0 && !s1)) add('R3', l1.idnrk, 'worse', Dec.mul(toBig(l1.q), p1 - p0), { text: 'Rate source got worse', before: s0, after: s1 || 'none', maktx: l1.maktx });
            const f0 = Dec.mul(toBig(l0.f_loc), toBig(l0.fx_inr)); const f1 = Dec.mul(toBig(l1.f_loc), toBig(l1.fx_inr));
            const fp = pct(f1, f0);
            if (fp !== null && Math.abs(fp) > t.r5Pct && f0 !== 0n) add('R5', l1.idnrk, f1 >= f0 ? 'up' : 'down', Dec.mul(toBig(l1.q), f1 - f0), { text: 'Freight per piece jumped', before: Dec.str(f0, 6), after: Dec.str(f1, 6), pct: fp, maktx: l1.maktx });
            const x0 = toBig(l0.fx_inr); const x1 = toBig(l1.fx_inr);
            const xp = pct(x1, x0);
            if (l1.loc_curr && l1.loc_curr !== 'INR' && xp !== null && Math.abs(xp) > t.r6Pct) add('R6', l1.idnrk, x1 >= x0 ? 'up' : 'down', Dec.mul(Dec.mul(toBig(l1.q), toBig(l1.r_loc) + toBig(l1.f_loc)), x1 - x0), { text: `FX factor moved (${l1.loc_curr})`, before: l0.fx_inr, after: l1.fx_inr, pct: xp, currency: l1.loc_curr, maktx: l1.maktx });
            const qp = pct(toBig(l1.q), toBig(l0.q));
            if (qp !== null && Math.abs(qp) > t.r7QtyPct) add('R7', l1.idnrk, qp > 0 ? 'qty up' : 'qty down', Dec.mul(toBig(l1.q) - toBig(l0.q), p0), { text: 'Quantity per piece changed', before: l0.q, after: l1.q, pct: qp, maktx: l1.maktx });
        }
        for (const [k, l0] of b) if (!c.has(k)) add('R7', l0.idnrk, 'removed', -perPc(l0), { text: 'Component removed from the BOM', before: l0.q, maktx: l0.maktx });
    }
    // R10: statistical outlier of today's cost per piece against its own last 30 days (needs 8 snapshots; z above 3 and a real spread; not when R1 already flagged the move)
    if (prev && history30.length >= 8 && !out.some((x) => x.rule === 'R1')) {
        const xs = history30.map((h) => Number(h)).filter((x) => Number.isFinite(x));
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
        const cur1 = Number(Dec.str(total1, 6));
        if (xs.length >= 8 && sd > 0 && m > 0 && sd / m > 0.0005) {
            const z = (cur1 - m) / sd;
            if (Math.abs(z) > (t.r10Z || 3)) add('R10', '', z > 0 ? 'up' : 'down', total1 - toBig(String(m.toFixed(6))), { text: 'Cost per piece is a statistical outlier against its last 30 days', after: cur.total_per_unit, mean_30d: m.toFixed(6), stdev_30d: sd.toFixed(6), z: Math.round(z * 100) / 100, snapshots: xs.length });
        }
    }
    // R4 / R8 need no history
    const total = total1 === 0n ? 1n : total1;
    for (const l of cur.lines) {
        const share = Dec.num(Dec.div(perPc(l), total)) * 100;
        if ((!l.sel_source || toBig(l.p_inr) === 0n || l.sel_source === 'MBEW') && share > t.r4MinSharePct) {
            add('R4', l.idnrk, l.sel_source ? 'mbew only' : 'no rate', perPc(l), { text: l.sel_source === 'MBEW' ? 'MBEW only: no contract, info record, market or consumption rate in the look-back window' : 'No rate or rate 0', share_pct: share, maktx: l.maktx });
        }
        if (l.cov_h1 !== '' && Number(l.cov_h1) < 999 && Number(l.cov_h1) < t.r8LeadDays && share > t.r8MinSharePct) {
            add('R8', l.idnrk, 'low cover', perPc(l), { text: `Low cover: ${l.cov_h1} days, below the lead time of ${t.r8LeadDays}`, cover_days: Number(l.cov_h1), share_pct: share, maktx: l.maktx });
        }
    }
    if (checks && checks.cur) {
        const seen = new Set((checks.prev || []).map((x) => `${x.Kind}|${x.Matnr}|${x.Werks}|${x.Comp}`));
        for (const x of checks.cur) {
            if (x.Matnr && x.Matnr !== cur.sku) continue;
            if (!seen.has(`${x.Kind}|${x.Matnr}|${x.Werks}|${x.Comp}`)) add('R9', x.Comp || '', 'new check', 0n, { text: `New plan check: ${x.Msg || x.Kind}`, kind: x.Kind });
        }
    }
    return out.sort((a, b) => Math.abs(b.impact_inr) - Math.abs(a.impact_inr));
}

const fingerprint = (a) => [a.rule, a.sku, a.plant, a.idnrk || '', a.direction].join('|');

/** existing: { status, snooze_until, last_notified_at, last_notified_impact } or null. */
function shouldNotify(existing, alert, now = new Date()) {
    if (!existing) return true;
    if (existing.status === 'snoozed' && existing.snooze_until && new Date(existing.snooze_until) > now) return false;
    const last = existing.last_notified_at ? new Date(existing.last_notified_at) : null;
    if (!last || now - last >= 7 * 86400000) return true;
    const before = Math.abs(Number(existing.last_notified_impact) || 0);
    return Math.abs(alert.impact_inr) >= before * 1.25 && before > 0;
}

/* ---------- signed links ---------- */
function signLink(secret, payload, days = 7) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 86400000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}
function verifyLink(secret, token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

/* ---------- digest ---------- */
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RULE_NAME = { R1: 'Cost per piece moved', R2: 'Component rate moved', R3: 'Rate source worse', R4: 'No / MBEW-only rate', R5: 'Freight jump', R6: 'FX moved', R7: 'BOM changed', R8: 'Low cover', R9: 'Plan check', R10: 'Statistical outlier' };

function digestSubject(date, alerts) {
    const high = alerts.filter((a) => a.severity === 'high').length;
    const med = alerts.filter((a) => a.severity === 'medium').length;
    return `Cost watch - ${date}: ${high} high, ${med} medium`;
}

/** Facts for the AI summary + a deterministic template from the same facts. */
function digestFacts(alerts) {
    const facts = [];
    const add = (label, value, unit) => { const id = `F${facts.length + 1}`; facts.push({ id, label, value: String(value), display: unit === 'INR' ? inr(value) : String(value), unit }); return id; };
    const top = alerts.slice(0, 5).map((a) => ({ a, id: add(`Impact of ${RULE_NAME[a.rule]} on ${a.idnrk || a.sku} (${a.sku}, plant ${a.plant})`, Math.round(a.impact_inr), 'INR') }));
    const count = add('Alerts', alerts.length, 'count');
    const template = alerts.length
        ? `${alerts.length} [${count}] alerts. ${top.map(({ a, id }) => `${RULE_NAME[a.rule]} on ${a.idnrk || a.sku} (${a.sku}, plant ${a.plant}): ${inr(Math.round(a.impact_inr))} INR [${id}]`).join('; ')}. Check with procurement / master data / planning.`
        : 'No change above the thresholds.';
    return { facts, template };
}

function digestHtml({ item, alerts, date, asOf, system, summary, appUrl, links }) {
    const rows = alerts.map((a, i) => `<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px 8px">${i + 1}</td><td style="padding:6px 8px"><b>${esc(RULE_NAME[a.rule] || a.rule)}</b><br><span style="color:#6b7280">${esc(a.evidence?.text || '')}</span></td><td style="padding:6px 8px;font-family:monospace">${esc(a.sku)} · ${esc(a.plant)}${a.idnrk ? `<br>${esc(a.idnrk)} ${esc(a.evidence?.maktx || '')}` : ''}</td><td style="padding:6px 8px;text-transform:uppercase;font-weight:700;color:${a.severity === 'high' ? '#b91c1c' : a.severity === 'medium' ? '#b45309' : '#6b7280'}">${esc(a.severity)}</td><td style="padding:6px 8px;text-align:right">${inr(a.impact_inr)}</td><td style="padding:6px 8px;white-space:nowrap"><a href="${esc(`${appUrl}/apps/bom-cost-explorer/watch/?alert=${a.id}`)}">Open</a> · <a href="${esc(links[a.id]?.ack || '#')}">Acknowledge</a> · <a href="${esc(links[a.id]?.snooze || '#')}">Snooze 7 days</a></td></tr>`).join('');
    return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111">
<h2 style="margin:0 0 4px">Cost watch - ${esc(date)}</h2>
<div style="color:#6b7280;font-size:12px">${esc(item.name)} · SAP ${esc(system)} · data as of ${esc(asOf)} · priority ${esc((item.settings?.prio || []).join(' > ') || 'default')} · look-back ${esc(item.settings?.lookback || 365)} days</div>
<p>${esc(summary)}</p>
${alerts.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f3f4f6;text-align:left"><th style="padding:6px 8px">#</th><th style="padding:6px 8px">Rule</th><th style="padding:6px 8px">SKU · plant · material</th><th style="padding:6px 8px">Severity</th><th style="padding:6px 8px;text-align:right">Impact INR</th><th style="padding:6px 8px"></th></tr></thead><tbody>${rows}</tbody></table>` : ''}
<p style="color:#6b7280;font-size:12px">Impact = change per piece x ${esc(item.plan1 ? 'planned volume' : 'per 1,000 pieces')}. Acknowledge and snooze links expire in 7 days. <a href="${esc(`${appUrl}/apps/bom-cost-explorer/watch/`)}">Open the cost watch</a></p></div>`;
}

/* ---------- numbers rule (port of the app's lib/ai/validate.ts essentials) ---------- */
function extractNumbers(text) {
    let t = String(text).replace(/\[F\d+\]/g, ' ').replace(/\bplants?\s+[A-Z0-9]{4}(\s*(,|and)\s*[A-Z0-9]{4})*\b/gi, ' ');
    t = t.replace(/\b\d{1,2}([./-])\d{1,2}\1\d{2,4}\b/g, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b[A-Za-z]+\d+[A-Za-z\d]*\b/g, ' ').replace(/\b\d+[A-Za-z][A-Za-z\d]*\b/g, ' ');
    const out = [];
    for (const m of t.matchAll(/(?<![\d.,])([-−]?)(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)) {
        const plain = m[2].replace(/,/g, '');
        if (!m[2].includes(',') && !m[2].includes('.') && ((plain.length === 4 && +plain >= 1900 && +plain <= 2100) || plain.length >= 7)) continue;
        const dp = plain.includes('.') ? plain.split('.')[1].length : 0;
        out.push({ raw: m[0], value: Math.abs(Number(plain)), tol: 0.5 * 10 ** -dp });
    }
    return out;
}
function validateNumbers(text, citedIds, facts) {
    const ids = new Set([...(citedIds || []), ...[...String(text).matchAll(/\[(F\d+)\]/g)].map((m) => m[1])]);
    const cand = facts.filter((f) => ids.has(f.id));
    const bad = extractNumbers(text).filter((n) => !cand.some((f) => Math.abs(Math.abs(Number(f.value)) - n.value) <= n.tol + 1e-9));
    return { ok: bad.length === 0, bad: bad.map((b) => b.raw) };
}

module.exports = {
    freightIncluded,
    Dec, toBig, costLineFilter, queryString, buildSnapshots, paramsHash, evaluateRules, DEFAULT_THRESHOLDS, fingerprint, shouldNotify,
    signLink, verifyLink, digestSubject, digestFacts, digestHtml, validateNumbers, extractNumbers, RULE_NAME, severity, isLeaf,
};
