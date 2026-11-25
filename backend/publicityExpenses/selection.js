/*
   Period selection for Publicity Expenses.

   The app sends any set of fiscal periods (1..12) of one fiscal year. Figures are the selected periods added up (CY)
   against the same periods of the previous year (PY); P01..Pn is the YTD of the MIS.

   One SAP read (fiscal year, period) gives the YTD (periods 1..n) and the period alone. A set is read with as few
   reads as possible: each run of consecutive periods a..b = YTD(b) - YTD(a-1), a run of one period = that period:
     P08          -> 1 read  (period 8)           P01-P08 -> 1 read  (YTD 8)
     P04-P06 (Q2) -> 2 reads (YTD 6 - YTD 3)      P03, P05, P08 -> 3 reads (periods 3, 5, 8)
   so a YTD selection always equals SAP's own YTD figure.

   After combining, every row keeps the CDS field names:
     CYYTDAmount / PYYTDAmount   total of the selected periods (= YTD for P01..Pn)
     CYPeriodAmount / PYPeriodAmount   the latest selected period alone
     OBYTDAmount / RBYTDAmount   budget of the selected periods (SAP budget only; mock / upload recompute it)
     OBAnnualAmount / RBAnnualAmount   full-year budget (from the latest read)
*/

/** "1-8,10" | [1, 2] | 7 -> sorted unique periods. Throws a message on bad input. */
function parsePeriods(v) {
    const items = Array.isArray(v) ? v : String(v ?? '').split(',');
    const out = new Set();
    for (const raw of items) {
        const s = String(raw).trim();
        if (!s) continue;
        const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(s);
        const [a, b] = m ? [Number(m[1]), Number(m[2])] : [Number(s), Number(s)];
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 12 || a > b) throw new Error('Periods must be 1 to 12 (e.g. 8, 1-8 or 4-6,9).');
        for (let p = a; p <= b; p++) out.add(p);
    }
    return [...out].sort((x, y) => x - y);
}

/** [1,2,3,5] -> [[1,3],[5,5]] */
function runsOf(periods) {
    const runs = [];
    for (const p of [...periods].sort((a, b) => a - b)) {
        const last = runs[runs.length - 1];
        if (last && p === last[1] + 1) last[1] = p; else runs.push([p, p]);
    }
    return runs;
}

/**
 * Reads needed for a selection: [{ period, field: 'ytd' | 'period', sign }]. ytdOnly = every run as YTD(b) - YTD(a-1),
 * also a single period (needed when the budget comes from SAP: the CDS gives budget YTD, not budget per period).
 */
function termsOf(periods, { ytdOnly = false } = {}) {
    const terms = [];
    for (const [a, b] of runsOf(periods)) {
        if (a === b && !ytdOnly) { terms.push({ period: b, field: 'period', sign: 1 }); continue; }
        terms.push({ period: b, field: 'ytd', sign: 1 });
        if (a > 1) terms.push({ period: a - 1, field: 'ytd', sign: -1 });
    }
    return terms;
}

const r2 = (x) => Math.round(x * 100) / 100;
const ZERO = { CYYTDAmount: 0, PYYTDAmount: 0, CYPeriodAmount: 0, PYPeriodAmount: 0, OBYTDAmount: 0, RBYTDAmount: 0, OBAnnualAmount: 0, RBAnnualAmount: 0 };

/**
 * Add up the reads of a selection per row key. parts = [{ term, rows }]; latest = the latest selected period.
 * Attributes (names, SKUs, ...) come from the latest read. Input rows are not modified.
 */
function combine(parts, keyOf, latest) {
    const ordered = [...parts].sort((a, b) => Number(b.term.period === latest) - Number(a.term.period === latest) || b.term.period - a.term.period);
    const out = new Map();
    for (const { term, rows } of ordered) {
        const ytd = term.field === 'ytd'; const s = term.sign; const last = term.period === latest && s > 0;
        for (const r of rows) {
            const k = keyOf(r);
            let o = out.get(k);
            if (!o) { o = { ...r, ...ZERO }; out.set(k, o); }
            const n = (f) => Number(r[f]) || 0;
            o.CYYTDAmount += s * n(ytd ? 'CYYTDAmount' : 'CYPeriodAmount');
            o.PYYTDAmount += s * n(ytd ? 'PYYTDAmount' : 'PYPeriodAmount');
            if (ytd) { o.OBYTDAmount += s * n('OBYTDAmount'); o.RBYTDAmount += s * n('RBYTDAmount'); }
            if (last) { o.CYPeriodAmount += n('CYPeriodAmount'); o.PYPeriodAmount += n('PYPeriodAmount'); o.OBAnnualAmount += n('OBAnnualAmount'); o.RBAnnualAmount += n('RBAnnualAmount'); }
        }
    }
    for (const o of out.values()) {
        for (const f of Object.keys(ZERO)) o[f] = r2(o[f]);
        o.CYvsPYVariance = r2(o.CYYTDAmount - o.PYYTDAmount);
        o.CYvsRBYTDDeviation = r2(o.CYYTDAmount - o.RBYTDAmount);
    }
    return [...out.values()];
}

const summaryKey = (r) => `${r.CompanyCode}|${r.ReportingKey}|${r.GLAccount}|${r.Site}`;
const lineKey = (r) => `${r.CompanyCode}|${r.ReportingKey}|${r.GLAccount}|${r.Site}|${r.CostCenter}|${r.ProfitCenter}|${r.CostCenterType}|${r.MappingRule}`;

/** Human description of the reads, e.g. "YTD P06 - YTD P03" (shown in the drill-down as the basis). */
const describe = (terms) => terms.map((t, i) => `${i ? (t.sign < 0 ? ' - ' : ' + ') : ''}${t.field === 'ytd' ? 'YTD ' : ''}P${String(t.period).padStart(2, '0')}`).join('');

module.exports = { parsePeriods, runsOf, termsOf, combine, summaryKey, lineKey, describe };
