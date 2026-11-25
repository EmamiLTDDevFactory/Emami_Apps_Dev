/*
   OB (opening budget) / RB (revised budget).

   Source, per fiscal year, in this order:
     1. upload - an active uploaded version (Settings > Budget). OB and RB are versioned separately; each upload supersedes
        the previous active version of the same kind, and any version can be made active again (rollback).
     2. sap    - PUBEXP_BUDGET_SOURCE=sap: the CDS values (phase 2, budget table joined in the AMDP).
     3. mock   - seeded per reporting row x header from the actual run-rate, phased straight-line.

   Uploaded budgets are held per company x reporting row x header group (x site, optional) with 12 monthly amounts
   (straight-line when the file has none). They are added to the report as budget-only rows (IsBudget, no G/L, zero
   actuals), so a budget shows even where nothing has been spent yet; the budget fields of the SAP rows are set to 0.
*/
const { rng } = require('./mock');
const { headerGroup } = require('./config');

const r2 = (x) => Math.round(x * 100) / 100;
const UNIT = { lakh: 1e5, crore: 1e7, inr: 1 };
const KEY_RE = /^[A-Za-z0-9 _\-/&.()]{1,30}$/;
const MAX_ROWS = 20000;

function envBudgetSource() {
    return (process.env.PUBEXP_BUDGET_SOURCE || '').trim().toLowerCase() === 'sap' ? 'sap' : 'mock';
}

// ---------------------------------------------------------------- mock

/** Selected periods from a list, or 1..n from a single period (YTD up to n). */
function selected(periods) {
    if (Array.isArray(periods)) return periods.filter((p) => Number.isInteger(p) && p >= 1 && p <= 12);
    const n = Math.min(12, Math.max(1, Number(periods) || 12));
    return Array.from({ length: n }, (_, i) => i + 1);
}

/** Mock OB / RB from the run-rate of the selection (actuals of the selected periods / their number x 12), straight-line. */
function applyMockBudget(rows, fy, periods) {
    const p = selected(periods).length || 12;
    for (const row of rows) {
        const base = row.CYYTDAmount > 0 ? row.CYYTDAmount : row.PYYTDAmount > 0 ? row.PYYTDAmount : 0;
        const r = rng(`budget|${fy}|${row.ReportingKey}|${row.HeaderGroup || row.ReportHeader}`);
        const f1 = 0.95 + r() * 0.3;
        const f2 = 0.85 + r() * 0.25;
        const runRate = (base / p) * 12;
        row.OBAnnualAmount = r2(runRate * f1);
        row.RBAnnualAmount = r2(runRate * f1 * f2);
        row.OBYTDAmount = r2((row.OBAnnualAmount * p) / 12);
        row.RBYTDAmount = r2((row.RBAnnualAmount * p) / 12);
        row.CYvsRBYTDDeviation = r2(row.CYYTDAmount - row.RBYTDAmount);
    }
    return rows;
}

// ---------------------------------------------------------------- upload validation

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v).replace(/[,\s₹]/g, '').replace(/^\((.*)\)$/, '-$1');
    return s === '' || s === '-' || s === '–' ? null : Number(s);
};

/**
 * Check an upload (rows already read from Excel in the browser) and turn it into budget lines in INR.
 * input: { fy, kind: OB|RB, unit: lakh|crore|inr, rows: [{ row, key, header, site?, company?, annual?, months?: (number|'')[12], labels? }] }
 * known: Map reportingKey -> { companyCode, labels } from the SAP rows of the year (unknown keys are warnings, not errors).
 * Returns { lines, errors: [{ row, message }], warnings: [...], skipped, totals: { total, byHeader }, phasing }.
 */
function validateUpload(input, known, mapping) {
    const errors = []; const warnings = []; const lines = []; let skipped = 0;
    const fy = Number(input?.fy); const kind = String(input?.kind || '').toUpperCase(); const unit = String(input?.unit || '').toLowerCase();
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2099) errors.push({ row: 0, message: 'Fiscal year must be like 2026.' });
    if (kind !== 'OB' && kind !== 'RB') errors.push({ row: 0, message: 'Budget type must be OB (opening) or RB (revised).' });
    if (!UNIT[unit]) errors.push({ row: 0, message: 'Unit must be lakh, crore or inr.' });
    const rows = Array.isArray(input?.rows) ? input.rows : [];
    if (!rows.length) errors.push({ row: 0, message: 'The file has no budget lines.' });
    if (rows.length > MAX_ROWS) errors.push({ row: 0, message: `At most ${MAX_ROWS} lines per upload.` });
    if (errors.length) return { lines, errors, warnings, skipped, totals: { total: 0, byHeader: {} }, phasing: 'straight' };

    const mul = UNIT[unit];
    const seen = new Map();
    let monthly = 0; let straight = 0;
    const unknownKeys = new Set();
    for (const [i, r] of rows.entries()) {
        const at = Number(r?.row) || i + 2;
        const err = (m) => errors.push({ row: at, message: m });
        const key = String(r?.key ?? '').trim();
        if (!KEY_RE.test(key)) { err(`Reporting key "${key}" is missing or has characters that are not allowed.`); continue; }
        const g = headerGroup(r?.header, mapping);
        if (g.cls === 'UNMAPPED') { err(`Report header "${r?.header ?? ''}" is not a known header group (see Settings > Mappings).`); continue; }
        let site = String(r?.site ?? '').trim().toUpperCase();
        if (site === 'UNITS' || site === 'UNIT') site = 'UN';
        if (site && site !== 'HO' && site !== 'UN') { err(`Site "${r?.site}" must be HO, UN (Units) or blank.`); continue; }
        const company = String(r?.company ?? '').trim().toUpperCase();
        if (company && !/^[A-Z0-9]{4}$/.test(company)) { err(`Company code "${r?.company}" must be 4 letters or digits.`); continue; }
        const annualIn = num(r?.annual);
        const monthsIn = Array.isArray(r?.months) ? r.months.slice(0, 12).map(num) : [];
        if (Number.isNaN(annualIn) || monthsIn.some((m) => Number.isNaN(m))) { err('An amount is not a number.'); continue; }
        const hasMonths = monthsIn.some((m) => m !== null);
        let months; let annual;
        if (hasMonths) {
            months = Array.from({ length: 12 }, (_, k) => monthsIn[k] ?? 0);
            const sum = months.reduce((a, b) => a + b, 0);
            if (annualIn !== null && Math.abs(sum - annualIn) > 0.011) { err(`The 12 months add up to ${r2(sum)}, the annual amount is ${annualIn}.`); continue; }
            annual = annualIn ?? sum;
            monthly += 1;
        } else {
            annual = annualIn ?? 0;
            months = Array.from({ length: 12 }, () => annual / 12);
            straight += 1;
        }
        if (annual < 0 || months.some((m) => m < 0)) { err('Budget amounts cannot be negative.'); continue; }
        if (annual === 0) { skipped += 1; continue; }
        const k = `${company}|${key.toUpperCase()}|${g.id}|${site}`;
        if (seen.has(k)) { err(`Duplicate of row ${seen.get(k)} (same reporting key, header${site ? ', site' : ''}${company ? ', company' : ''}).`); continue; }
        seen.set(k, at);
        const ref = known.get(key) || known.get(key.toUpperCase());
        if (!ref) unknownKeys.add(key);
        const labels = { category: String(r?.labels?.category ?? '').slice(0, 60), range: String(r?.labels?.range ?? '').slice(0, 60), brand: String(r?.labels?.brand ?? '').slice(0, 60), line: String(r?.labels?.line ?? '').slice(0, 80) };
        lines.push({
            companyCode: company || ref?.companyCode || '', reportingKey: ref ? ref.key : key, headerGroup: g.id, site,
            annual: r2(annual * mul), months: months.map((m) => r2(m * mul)), labels,
        });
    }
    if (unknownKeys.size) warnings.push({ row: 0, message: `${unknownKeys.size} reporting key(s) have no actuals in SAP for this year yet (kept, shown with the labels from the file): ${[...unknownKeys].slice(0, 8).join(', ')}${unknownKeys.size > 8 ? ' …' : ''}` });
    if (skipped) warnings.push({ row: 0, message: `${skipped} line(s) left blank or zero (no budget) were skipped - normal for a template with every report line.` });
    const byHeader = {};
    for (const l of lines) byHeader[l.headerGroup] = r2((byHeader[l.headerGroup] || 0) + l.annual);
    const total = r2(lines.reduce((s, l) => s + l.annual, 0));
    return { lines, errors, warnings, skipped, totals: { total, byHeader }, phasing: monthly && straight ? 'mixed' : monthly ? 'monthly' : 'straight' };
}

// ---------------------------------------------------------------- apply uploaded versions

/**
 * Set the SAP rows' budget fields to 0 and add one budget-only row per company x reporting row x header x site.
 * active: { OB?: { lines }, RB?: { lines } }. Rows are already enriched (HeaderGroup etc.). periods = the selected
 * periods (budget "YTD" = their monthly budget added up) or a single period n (= 1..n).
 */
function applyUploadedBudget(rows, active, periods, mapping) {
    const sel = selected(periods);
    const tmpl = new Map();
    for (const r of rows) {
        r.OBAnnualAmount = 0; r.RBAnnualAmount = 0; r.OBYTDAmount = 0; r.RBYTDAmount = 0; r.CYvsRBYTDDeviation = r.CYYTDAmount;
        if (!tmpl.has(r.ReportingKey)) tmpl.set(r.ReportingKey, r);
    }
    const out = new Map();
    for (const kind of ['OB', 'RB']) {
        for (const l of active[kind]?.lines || []) {
            const k = `${l.companyCode}|${l.reportingKey}|${l.headerGroup}|${l.site}`;
            let b = out.get(k);
            if (!b) {
                const t = tmpl.get(l.reportingKey);
                const g = headerGroup(l.headerGroup, mapping);
                b = {
                    CompanyCode: l.companyCode || t?.CompanyCode || '', ReportingKey: l.reportingKey, GLAccount: '', Site: l.site || '', GLAccountName: '',
                    ReportHeader: g.label, ReportHeaderSequence: t?.ReportHeaderSequence ?? 0, FSVItem: '',
                    ProductGroup: t?.ProductGroup ?? l.labels?.category ?? '', SerialNo: t?.SerialNo ?? '', ItemCategory: t?.ItemCategory ?? l.labels?.category ?? '',
                    T1: t?.T1 ?? '', ProductRange: t?.ProductRange ?? l.labels?.range ?? '', T2: t?.T2 ?? '', ProductType: t?.ProductType ?? l.labels?.brand ?? '', T3: t?.T3 ?? '',
                    Product: t?.Product ?? l.labels?.line ?? l.reportingKey, MISHeading: t?.MISHeading ?? l.labels?.line ?? l.reportingKey, VisibleInMIS: t?.VisibleInMIS ?? 'X',
                    Currency: t?.Currency ?? 'INR', CYYTDAmount: 0, PYYTDAmount: 0, CYPeriodAmount: 0, PYPeriodAmount: 0, CYvsPYVariance: 0,
                    OBAnnualAmount: 0, RBAnnualAmount: 0, OBYTDAmount: 0, RBYTDAmount: 0, CYvsRBYTDDeviation: 0,
                    HeaderGroup: g.id, HeaderLabel: g.label, SpendClass: g.cls, InMIS: g.mis, Medium: '', Unmapped: false, IsBudget: true,
                };
                out.set(k, b);
            }
            const ytd = sel.reduce((a, q) => a + (Number(l.months[q - 1]) || 0), 0);
            if (kind === 'OB') { b.OBAnnualAmount = r2(b.OBAnnualAmount + l.annual); b.OBYTDAmount = r2(b.OBYTDAmount + ytd); }
            else { b.RBAnnualAmount = r2(b.RBAnnualAmount + l.annual); b.RBYTDAmount = r2(b.RBYTDAmount + ytd); b.CYvsRBYTDDeviation = r2(-b.RBYTDAmount); }
        }
    }
    return [...rows, ...out.values()];
}

module.exports = { applyMockBudget, envBudgetSource, validateUpload, applyUploadedBudget, UNIT };
