/*
   Mock OB (opening budget) / RB (revised budget) until the budget table is joined in the AMDP (phase 2).

   Applied to summary rows when the budget source is "mock" (default; PUBEXP_BUDGET_SOURCE=sap uses SAP's values).
   Seeded per reporting row x report header, so a brand's budget is consistent across its G/L lines and the same
   every time:
     run-rate      = CY YTD (else PY YTD) / period x 12
     OB annual     = run-rate x 0.95..1.25        RB annual = OB x 0.85..1.10
     OB / RB YTD   = annual x period / 12 (straight-line phasing)
   CYvsRBYTDDeviation = CY YTD - RB YTD.
*/
const { rng } = require('./mock');

const r2 = (x) => Math.round(x * 100) / 100;

function budgetSource() {
    return (process.env.PUBEXP_BUDGET_SOURCE || '').trim().toLowerCase() === 'sap' ? 'sap' : 'mock';
}

function applyMockBudget(rows, fy, period) {
    const p = Math.min(12, Math.max(1, Number(period) || 12));
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

module.exports = { applyMockBudget, budgetSource };
