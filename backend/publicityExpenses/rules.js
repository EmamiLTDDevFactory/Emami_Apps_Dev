/*
   Exclusion rules: take G/L accounts, cost centres, profit centres or cost-centre types out of the report.

   Rule { dimension, values[], pattern, fromFy, fromPeriod, toFy?, toPeriod?, reason, active }
   Dimensions: GL, COMPANY_CODE, PRODUCT_GROUP (summary level); COST_CENTER, PROFIT_CENTER, CC_TYPE, MAPPING_RULE (detail level).
   values  = exact codes picked from the data in the app (multi-select from the CDS results) - never read as a range.
   pattern = optional, for codes that may come later (case-insensitive; leading zeros of all-digit codes ignored, 508458 = 0000508458):
     exact      EH193
     range      508000-508099        (numbers compared as numbers, codes of equal length as text)
     wildcard   EH19*  or  5080??    (* any characters, ? one character)
     list       508458, 508459       (comma separated; each item may be any of the above)
   Effective period: a rule applies to a report whose selected fiscal year / period lies in [from, to] (to open = no end).
   When it applies it removes the item from CY and PY alike (like-for-like comparison) - YTD, the period and the trend.

   G/L rules act on the summary rows directly. Cost-centre / profit-centre / type rules need the detail view
   (ZC_ATLBTL_EXP_DETAIL): the matching detail lines are summed to the summary grain (company x reporting row x G/L x site)
   and subtracted. A line that two rules match counts once, for the first rule (rule order = id). Budget (OB / RB) is
   not touched by exclusions.
*/
const DIMENSIONS = {
    GL: { label: 'G/L account', field: 'GLAccount', level: 'summary' },
    COST_CENTER: { label: 'Cost centre', field: 'CostCenter', level: 'detail' },
    PROFIT_CENTER: { label: 'Profit centre', field: 'ProfitCenter', level: 'detail' },
    CC_TYPE: { label: 'Cost-centre type (KOSAR)', field: 'CostCenterType', level: 'detail' },
    COMPANY_CODE: { label: 'Company code', field: 'CompanyCode', level: 'summary' },
    PRODUCT_GROUP: { label: 'Product group', field: 'ProductGroup', level: 'summary' },
    MAPPING_RULE: { label: 'Mapping rule', field: 'MappingRule', level: 'detail' },
};
const MAX_VALUES = 3000;

const norm = (v) => { const s = String(v ?? '').trim().toUpperCase(); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s; };

/**
 * Wildcard match (* = any run, ? = one character) in linear time: no regular expression, so a pattern like *A*A*A*...B
 * cannot make the server backtrack for minutes (ReDoS). Classic greedy match with one backtrack point.
 */
function glob(p, s) {
    let i = 0; let j = 0; let star = -1; let mark = 0;
    while (j < s.length) {
        if (i < p.length && (p[i] === '?' || p[i] === s[j])) { i++; j++; } else if (i < p.length && p[i] === '*') { star = i++; mark = j; } else if (star >= 0) { i = star + 1; j = ++mark; } else return false;
    }
    while (i < p.length && p[i] === '*') i++;
    return i === p.length;
}

/** One pattern item -> predicate on a normalised value. Throws on a malformed item. */
function itemMatcher(raw) {
    const item = String(raw).trim().toUpperCase();
    if (!item) throw new Error('Empty value in the pattern.');
    if (item.length > 40) throw new Error('A value in the pattern is longer than 40 characters.');
    if (!/^[A-Z0-9_\-*?./ ]+$/.test(item)) throw new Error(`"${raw}" has characters that are not allowed (letters, digits, - _ . / * ? only).`);
    if (/[*?]/.test(item)) {
        // (the value is upper-case and trimmed, as norm() leaves it; the item is upper-case too)
        const n = (/^\d[\d*?]*$/.test(item) ? item.replace(/^0+(?=[\d*?])/, '') : item).replace(/\*+/g, '*');
        return (v) => glob(n, v);
    }
    const m = /^([A-Z0-9_./]+)\s*-\s*([A-Z0-9_./]+)$/.exec(item);
    if (m) {
        const [a, b] = [norm(m[1]), norm(m[2])];
        if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
            const lo = Math.min(Number(a), Number(b)); const hi = Math.max(Number(a), Number(b));
            return (v) => /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi;
        }
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return (v) => v.length === lo.length && v >= lo && v <= hi;
    }
    const exact = norm(item);
    return (v) => v === exact;
}

function compilePattern(pattern) {
    const items = String(pattern || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length > 200) throw new Error('At most 200 items in a pattern.');
    return items.map(itemMatcher);
}

/** values (exact) + pattern -> predicate on a raw field value. */
function compile(rule) {
    const exact = new Set((rule.values || []).map(norm));
    const ms = compilePattern(rule.pattern);
    if (!exact.size && !ms.length) throw new Error('Pick at least one value or give a pattern.');
    return (value) => { const v = norm(value); return v !== '' && (exact.has(v) || ms.some((f) => f(v))); };
}

/** Validate / normalise a rule from a request or an upload row. Returns { rule } or { error }. */
function validateRule(input) {
    const r = input || {};
    const dimension = String(r.dimension || '').trim().toUpperCase();
    if (!DIMENSIONS[dimension]) return { error: `Dimension must be one of ${Object.keys(DIMENSIONS).join(', ')}.` };
    const pattern = String(r.pattern || '').trim();
    const rawValues = Array.isArray(r.values) ? r.values : String(r.values || '').split(/[,;\n]/);
    const values = [...new Set(rawValues.map((v) => String(v ?? '').trim()).filter(Boolean))];
    if (values.length > MAX_VALUES) return { error: `At most ${MAX_VALUES} values in one rule - use a pattern for larger sets.` };
    if (values.some((v) => v.length > 60)) return { error: 'A value is longer than 60 characters.' };
    if (pattern.length > 1000) return { error: 'The pattern is longer than 1000 characters.' };
    try { compile({ values, pattern }); } catch (e) { return { error: e.message }; }
    const fy = (v) => Number(v);
    const fromFy = fy(r.fromFy); const fromPeriod = fy(r.fromPeriod ?? 1);
    if (!Number.isInteger(fromFy) || fromFy < 2000 || fromFy > 2099) return { error: 'Effective from: fiscal year must be like 2026.' };
    if (!Number.isInteger(fromPeriod) || fromPeriod < 1 || fromPeriod > 12) return { error: 'Effective from: period must be 1 to 12.' };
    let toFy = r.toFy === '' || r.toFy == null ? null : fy(r.toFy);
    let toPeriod = r.toPeriod === '' || r.toPeriod == null ? null : fy(r.toPeriod);
    if (toFy !== null) {
        if (!Number.isInteger(toFy) || toFy < 2000 || toFy > 2099) return { error: 'Effective to: fiscal year must be like 2026.' };
        if (toPeriod === null) toPeriod = 12;
        if (!Number.isInteger(toPeriod) || toPeriod < 1 || toPeriod > 12) return { error: 'Effective to: period must be 1 to 12.' };
        if (toFy * 100 + toPeriod < fromFy * 100 + fromPeriod) return { error: 'Effective to is before effective from.' };
    } else toPeriod = null;
    const reason = String(r.reason || '').trim();
    if (reason.length < 3) return { error: 'Give a reason (at least 3 characters) - it shows in the report and the audit log.' };
    if (reason.length > 300) return { error: 'Reason is longer than 300 characters.' };
    return { rule: { dimension, values, pattern, fromFy, fromPeriod, toFy, toPeriod, reason, active: r.active !== false } };
}

const applies = (rule, fy, period) => {
    const at = Number(fy) * 100 + Number(period);
    const from = rule.fromFy * 100 + rule.fromPeriod;
    const to = rule.toFy ? rule.toFy * 100 + (rule.toPeriod || 12) : Infinity;
    return rule.active && at >= from && at <= to;
};

const AMT = ['CYYTDAmount', 'PYYTDAmount', 'CYPeriodAmount', 'PYPeriodAmount'];
const r2 = (x) => Math.round(x * 100) / 100;
const keyOf = (r) => `${r.CompanyCode}|${r.ReportingKey}|${r.GLAccount}|${r.Site}`;

/** Rules in force for the selected fiscal year / period, compiled. */
function activeRules(rules, fy, period) {
    return rules.filter((r) => applies(r, fy, period)).sort((a, b) => a.id - b.id).map((r) => ({ ...r, match: compile(r), field: DIMENSIONS[r.dimension].field, level: DIMENSIONS[r.dimension].level }));
}

/** First active rule that excludes a row (summary rule first; detail rules only for detail rows). */
function firstMatch(row, active, { detail }) {
    for (const r of active) {
        if (r.level === 'detail' && !detail) continue;
        if (r.match(row[r.field])) return r;
    }
    return null;
}

function emptyTotals() { return { cy: 0, py: 0, cyP: 0, pyP: 0, lines: 0 }; }
function addTo(t, row, sign = 1) { t.cy += sign * row.CYYTDAmount; t.py += sign * row.PYYTDAmount; t.cyP += sign * row.CYPeriodAmount; t.pyP += sign * row.PYPeriodAmount; t.lines += 1; }
const roundT = (t) => ({ cy: r2(t.cy), py: r2(t.py), cyP: r2(t.cyP), pyP: r2(t.pyP), lines: t.lines });

/**
 * Apply rules to summary rows. `detail` = the period's detail rows (only read when a detail-level rule is active).
 * Returns { rows, excluded: { cy, py, cyP, pyP, lines, byRule: { [id]: totals } } }. Input rows are not modified.
 */
function applyToSummary(summary, active, detail) {
    const byRule = new Map(active.map((r) => [r.id, emptyTotals()]));
    const total = emptyTotals();
    const kept = [];
    for (const row of summary) {
        const rule = firstMatch(row, active, { detail: false });
        if (rule) { addTo(byRule.get(rule.id), row); addTo(total, row); continue; }
        kept.push({ ...row });
    }
    const touched = new Set();
    if (active.some((r) => r.level === 'detail') && detail) {
        const index = new Map(kept.map((r) => [keyOf(r), r]));
        for (const d of detail) {
            if (active.some((r) => r.level === 'summary' && r.match(d[r.field]))) continue; // already gone with its G/L
            const rule = firstMatch(d, active, { detail: true });
            if (!rule || rule.level !== 'detail') continue;
            addTo(byRule.get(rule.id), d); addTo(total, d);
            const s = index.get(keyOf(d));
            if (!s) continue;
            for (const k of AMT) s[k] = r2(s[k] - d[k]);
            s.CYvsPYVariance = r2(s.CYYTDAmount - s.PYYTDAmount);
            touched.add(s);
        }
    }
    // A row emptied by exclusions (and carrying no budget) leaves the report; rows that were zero in SAP stay as they were.
    const emptied = (s) => touched.has(s) && AMT.every((k) => Math.abs(s[k]) < 0.005) && !s.OBAnnualAmount && !s.RBAnnualAmount;
    const rows = kept.filter((s) => !emptied(s));
    return { rows, excluded: { ...roundT(total), byRule: Object.fromEntries([...byRule].map(([id, t]) => [id, roundT(t)])) } };
}

/** Detail rows minus excluded lines; the excluded ones are returned separately (for the drill-down note). */
function applyToDetail(detail, active) {
    const kept = []; const excluded = [];
    for (const d of detail) {
        const rule = firstMatch(d, active, { detail: true });
        if (rule) excluded.push({ ...d, ExcludedBy: rule.id }); else kept.push(d);
    }
    return { rows: kept, excluded };
}

module.exports = { DIMENSIONS, compile, validateRule, applies, activeRules, applyToSummary, applyToDetail, norm };
