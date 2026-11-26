/*
   Mock data for Publicity Expenses, shaped exactly like the two OData views (same property names), so the app can be
   built and demonstrated before / without SAP. Used when PUBEXP_SAP_ODATA_ROOT is not set or PUBEXP_SOURCE=mock.

   Structure (rows, product hierarchy, G/L accounts per report header) comes from the MIS layout (layout.json: labels
   only). Every amount is synthetic: a seeded random generator, so the same year / period always gives the same
   numbers and drill-down totals match the summary. Amounts are in INR (company code currency), like HSL in SAP.
   Two company codes: 1000 for everything, and EM01 (a second, smaller company) on part of the brand rows, so the
   company filter can be tried with more than one company.
*/
const layout = require('./layout.json');
const { NON_BRAND } = require('./config');

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function rng(seed) {
    let a = typeof seed === 'number' ? seed : hash(seed);
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pad = (n, w = 3) => String(n).padStart(w, '0');
const round2 = (x) => Math.round(x * 100) / 100;

const GL_BY_HEADER = {};
for (const g of layout.glAccounts) (GL_BY_HEADER[g.header] ||= []).push(g);
const ATL_SHARE = { 507929: 0.42, 507930: 0.1, 507932: 0.09, 507933: 0.05, 507934: 0.06, 507927: 0.07, 507926: 0.02, 507928: 0.03, 507931: 0.02, 508034: 0.04, 508028: 0.01, 508042: 0.02, 508033: 0.005 };

// Fiscal periods 1..12 = Apr..Mar. Summer brands peak Mar-Jun, winter brands Oct-Jan, the rest get a festive bump.
const SUMMER = /TALC|DERMI|NAVRATNA|NR |NRO|NRXT|COOL|POWDER|PRICKLY|SHOWER|SUN/i;
const WINTER = /BP |BORO|BALM|CHYAWAN|CHAWAN|KESARI|COUGH|HONEY|LOTION|COLD|RUB|PETRO/i;
function season(product) {
    if (SUMMER.test(product)) return [1.5, 1.6, 1.3, 0.8, 0.6, 0.6, 0.7, 0.6, 0.6, 0.7, 1.0, 1.4];
    if (WINTER.test(product)) return [0.5, 0.5, 0.6, 0.7, 0.9, 1.3, 1.7, 1.7, 1.6, 1.3, 0.7, 0.5];
    return [0.9, 0.9, 0.9, 1.0, 1.0, 1.2, 1.3, 1.1, 1.0, 0.9, 0.9, 0.9];
}

/** Report rows: brand rows from the layout + the non-brand product groups of the mapping logic. */
const ROWS = (() => {
    const out = [];
    const idx = { cat: new Map(), range: new Map(), type: new Map() };
    const key = (m, k) => { if (!m.has(k)) m.set(k, m.size + 1); return pad(m.get(k)); };
    layout.rows.forEach((r, i) => {
        out.push({
            ReportingKey: `BR${pad(i + 1)}`, SerialNo: pad(i + 1), ItemCategory: r.category, ProductGroup: r.category,
            T1: key(idx.cat, r.category), ProductRange: r.range, T2: key(idx.range, `${r.category}|${r.range}`),
            ProductType: r.type, T3: key(idx.type, `${r.range}|${r.type}`), Product: r.product, MISHeading: r.product,
            VisibleInMIS: r.visible ? 'X' : '', _brand: true, _visible: r.visible,
        });
    });
    NON_BRAND.forEach((g, i) => out.push({
        ReportingKey: `NB${pad(i + 1)}`, SerialNo: '', ItemCategory: '', ProductGroup: g, T1: '', ProductRange: '', T2: '',
        ProductType: '', T3: '', Product: '', MISHeading: '', VisibleInMIS: 'X', _brand: false, _visible: true,
    }));
    return out;
})();

/** One amount line per company x row x G/L x site with 12 CY and 12 PY monthly amounts. Built once per fiscal year. */
const LINES = new Map();
function lines(fy) {
    if (LINES.has(fy)) return LINES.get(fy);
    const out = [];
    for (const row of ROWS) {
        const r = rng(`${fy}|${row.ReportingKey}`);
        const misc = /^MISC|^OTHER/i.test(row.ItemCategory) || /^MISC/i.test(row.Product);
        let weight;
        if (!row._brand) weight = row.ProductGroup.startsWith('Not covered') ? 9e6 : 2.5e7 * (0.4 + r());
        else if (!row._visible) weight = r() < 0.12 ? 3e5 * r() : 0;
        else if (misc) weight = r() < 0.35 ? 4e6 * r() * (r() < 0.25 ? -1 : 1) : 0;
        else weight = Math.exp(18.4 + 1.3 * (r() - 0.5) * 2) * (r() < 0.15 ? 3 : 1); // log-normal brand budget (INR / year)
        if (!weight) continue;
        const big = Math.abs(weight) > 6e7;
        const pick = [];
        // ATL media for the bigger brands; production, creative, BTL and DSR for most rows.
        if (row._brand && big) for (const g of GL_BY_HEADER.ATL) if (r() < 0.25 + (ATL_SHARE[+g.gl] || 0) * 2) pick.push([g, (ATL_SHARE[+g.gl] || 0.01) * 0.55 * (0.5 + r())]);
        if (row._brand && big && r() < 0.5) pick.push([GL_BY_HEADER.MODELLING[0], 0.02 * r()]);
        if (row._brand && big) for (const g of GL_BY_HEADER['FILM PROD']) if (r() < 0.35) pick.push([g, 0.03 * r()]);
        if (row._brand && r() < 0.6) for (const g of GL_BY_HEADER.CREATIVE) if (r() < 0.5) pick.push([g, 0.015 * r()]);
        const btl = GL_BY_HEADER.BTL;
        const nBtl = big ? 8 + Math.floor(r() * 8) : 2 + Math.floor(r() * 4);
        for (let k = 0; k < nBtl; k++) pick.push([btl[Math.floor(r() * btl.length)], (big ? 0.3 : 0.75) / nBtl * (0.4 + r())]);
        for (const g of GL_BY_HEADER['BTL SALES']) if (r() < (big ? 0.5 : 0.15)) pick.push([g, 0.03 * r()]);
        for (const g of GL_BY_HEADER['DSR AND OTHER EXP']) if (r() < (row._brand ? 0.12 : 0.3)) pick.push([g, 0.04 * r()]);
        const merged = new Map();
        for (const [g, share] of pick) merged.set(g.gl, { g, share: (merged.get(g.gl)?.share || 0) + share });
        const sea = season(row.Product || row.ProductGroup);
        const growth = 0.85 + r() * 0.45; // CY vs PY
        // EM01: own random stream, so company 1000 keeps the same numbers it always had.
        const rc = rng(`${fy}|${row.ReportingKey}|EM01`);
        const em01 = row._brand && rc() < 0.2;
        for (const { g, share } of merged.values()) {
            const header = g.header;
            const hoShare = header === 'ATL' || header === 'MODELLING' || header === 'FILM PROD' || header === 'CREATIVE' ? (r() < 0.9 ? 1 : 0.85)
                : header === 'DSR AND OTHER EXP' ? 0.2 : !row._brand && row.ProductGroup.includes('Unit') ? 0 : 0.6;
            const annual = weight * share;
            for (const [site, part] of [['HO', hoShare], ['UN', 1 - hoShare]]) {
                if (part <= 0.001) continue;
                const cy = [], py = [];
                for (let m = 0; m < 12; m++) {
                    const noise = 0.55 + r() * 0.9;
                    const v = (annual * part / 12) * sea[m] * noise;
                    cy.push(round2(v));
                    py.push(round2((v / growth) * (0.8 + r() * 0.4)));
                }
                out.push({ row, gl: g, site, company: '1000', cy, py });
                if (em01 && rc() < 0.6) {
                    const f = 0.15 + rc() * 0.35;
                    out.push({ row, gl: g, site, company: 'EM01', cy: cy.map((v) => round2(v * f)), py: py.map((v) => round2(v * f * (0.7 + rc() * 0.6))) });
                }
            }
        }
    }
    LINES.set(fy, out);
    return out;
}

const sum = (a, n) => a.slice(0, n).reduce((x, y) => x + y, 0);
const strip = ({ _brand, _visible, ...rest }) => rest; // eslint-disable-line no-unused-vars

/**
 * Amounts of a line for a period as the views give them: YTD and the period alone, plus each period alone
 * (CYP01Amount..PYP12Amount, SAP change 2026-11-26). PUBEXP_MOCK_MONTHS=off answers like the views before that change.
 */
function amounts(line, period) {
    const cyYtd = round2(sum(line.cy, period)); const pyYtd = round2(sum(line.py, period));
    const out = {
        Currency: 'INR', CYYTDAmount: cyYtd, PYYTDAmount: pyYtd, CYPeriodAmount: line.cy[period - 1], PYPeriodAmount: line.py[period - 1],
        CYvsPYVariance: round2(cyYtd - pyYtd), OBAnnualAmount: 0, RBAnnualAmount: 0, OBYTDAmount: 0, RBYTDAmount: 0, CYvsRBYTDDeviation: cyYtd,
    };
    if (process.env.PUBEXP_MOCK_MONTHS !== 'off') {
        for (let m = 0; m < 12; m++) { out[`CYP${pad(m + 1, 2)}Amount`] = line.cy[m]; out[`PYP${pad(m + 1, 2)}Amount`] = line.py[m]; }
    }
    return out;
}

const matches = (obj, where) => Object.entries(where || {}).every(([k, v]) => {
    const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '');
    return !list.length || list.includes(obj[k]);
});

/** ZC_ATLBTL_EXP_SUMMARY rows (grain: company x reporting row x G/L x site). */
function summary(fy, period, where) {
    const p = Math.min(12, Math.max(1, period));
    return lines(fy).map((l) => ({
        CompanyCode: l.company, ...strip(l.row), GLAccount: l.gl.gl, Site: l.site, GLAccountName: l.gl.name,
        ReportHeader: l.gl.header, ReportHeaderSequence: l.gl.headerSeq, FSVItem: `ATLBTL${pad(l.gl.headerSeq, 2)}`, ...amounts(l, p),
    })).filter((r) => matches(r, where));
}

const RULES_HO = [['R03', 'KOSTL'], ['R05', 'ZZBRND_IMD'], ['R06', 'KOSTL']];
const RULES_UN = [['R01', 'KOSTL'], ['R02', 'ZZUNIQUE_KEY_IMD']];
const NB_RULE = { 'Misc - Unit non Brand': 'R10', 'Misc - HO non Brand': 'R09', 'IBD non Brand': 'R08', 'Not covered by mapping logic': 'R99', 'Brand - hierarchy not found': 'R07' };
const SIZES = ['25 G', '50 G', '100 G', '50 ML', '100 ML', '200 ML', '400 ML'];

/** Derived number of a reporting row (3 digits) and the 9-character SKU group key of its brand rows. */
const numOf = (row) => pad(Number(row.SerialNo || 900 + Object.keys(NB_RULE).indexOf(row.ProductGroup)) % 1000);
const skuKeyOf = (row) => (row._brand ? `${pad(Number(row.T1), 2)}${pad(Number(row.T3), 3)}${numOf(row)}`.slice(0, 9) : '');

/**
 * ZI_ATLBTL_NETSALEMASTER (ZNET_SALE_MASTER, the target of to_NetSaleMaster) as the live entity set answers: 1-4 SKUs
 * per brand row, SkuGroupKey = the first 9 characters of SkuGroupCode (ZSKUGRCODECRS).
 */
let masterRows = null;
function skuMaster() {
    if (masterRows) return masterRows;
    const out = [];
    const seen = new Set();
    for (const row of ROWS) {
        const key = skuKeyOf(row);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const rs = rng(`sku|${key}`);
        const n = 1 + Math.floor(rs() * 4);
        for (let s = 0; s < n; s++) {
            out.push({
                SerialNo: row.SerialNo, ItemCategory: row.ItemCategory, T1: row.T1, ProductRange: row.ProductRange, T2: row.T2, ProductType: row.ProductType,
                T3: row.T3, Product: row.Product, T4: `${row.T3}.${pad(s + 1, 2)}`, SKUSize: SIZES[Math.floor(rs() * SIZES.length)], Material: `400${numOf(row)}${s}`,
                SkuGroupKey: key, BaseUnit: 'EA', SkuGroupCode: `${key}${pad(Math.floor(rs() * 9000) + 1000, 4)}`, Season: '', MISHeading: row.MISHeading, VisibleInMIS: row.VisibleInMIS,
            });
        }
    }
    masterRows = out;
    return out;
}

/** ZC_ATLBTL_EXP_DETAIL rows: each summary line split over 1-3 cost centres; with expand, SKUs under to_NetSaleMaster. */
function detail(fy, period, where, { expand = false } = {}) {
    const p = Math.min(12, Math.max(1, period));
    const out = [];
    for (const l of lines(fy)) {
        const base = { CompanyCode: l.company, ...strip(l.row), GLAccount: l.gl.gl, Site: l.site };
        if (!matches(base, where)) continue;
        const em = l.company === 'EM01';
        const seed = `${fy}|${l.row.ReportingKey}|${l.gl.gl}|${l.site}${em ? '|EM01' : ''}`;
        const r = rng(seed);
        const n = 1 + Math.floor(r() * 3);
        const weights = Array.from({ length: n }, () => 0.3 + r());
        const total = weights.reduce((a, b) => a + b, 0);
        const a = amounts(l, p);
        const num = numOf(l.row);
        // Each month is split over the cost centres (the last one takes the rest), YTD / period come from the split
        // months, so the lines add up to the summary in every period and to the month fields.
        const leftCy = [...l.cy]; const leftPy = [...l.py];
        for (let k = 0; k < n; k++) {
            const f = weights[k] / total;
            const cyM = l.cy.map((v, m) => (k === n - 1 ? round2(leftCy[m]) : round2(v * f)));
            const pyM = l.py.map((v, m) => (k === n - 1 ? round2(leftPy[m]) : round2(v * f)));
            cyM.forEach((v, m) => { leftCy[m] = round2(leftCy[m] - v); });
            pyM.forEach((v, m) => { leftPy[m] = round2(leftPy[m] - v); });
            const part = amounts({ cy: cyM, py: pyM }, p);
            delete part.Currency;
            const [rule, lookup] = l.row._brand ? (l.site === 'HO' ? RULES_HO : RULES_UN)[Math.floor(r() * (l.site === 'HO' ? 3 : 2))] : [NB_RULE[l.row.ProductGroup] || 'R99', 'KOSTL'];
            const cc = (l.site === 'HO' ? `${em ? 'EI' : 'EH'}${num}${k ? k : ''}` : `${em ? 'EU' : 'UN'}${pad(1 + Math.floor(r() * 6), 2)}${num}`);
            const row = {
                ...base, ProfitCenter: l.site === 'HO' ? `${em ? 'EIHO' : 'EMHO'}${pad(1 + (k % 3), 2)}` : `${em ? 'EIUN' : 'EMUN'}${pad(1 + Math.floor(r() * 6), 2)}`,
                CostCenter: cc, CostCenterType: l.row._brand ? 'B' : (r() < 0.5 ? 'M' : 'S'), ControllingArea: '1000', ChartOfAccounts: 'EMLC',
                GLAccountName: l.gl.name, CostCenterName: l.row._brand ? `${l.row.Product.slice(0, 28)} - ${l.site}` : `${l.row.ProductGroup.slice(0, 28)}`,
                CostCenterCompanyCode: l.company, CostCenterProfitCenter: '', FSVVersion: 'ZATL', FSVItem: `ATLBTL${pad(l.gl.headerSeq, 2)}`,
                ReportHeader: l.gl.header, ReportHeaderSequence: l.gl.headerSeq, MappingRule: rule, LookupField: lookup, DerivedCostCenterNo: num,
                ProductHierarchy: l.row._brand ? `0${pad(Number(l.row.T1), 2)}${pad(Number(l.row.T3), 3)}${num}0` : '', SalesBrand: l.row._brand ? l.row.ProductType : '',
                SkuGroupKey: skuKeyOf(l.row),
                ...a, ...part,
            };
            if (expand) row.to_NetSaleMaster = row.SkuGroupKey ? skuMaster().filter((x) => x.SkuGroupKey === row.SkuGroupKey) : [];
            out.push(row);
        }
    }
    return out;
}

module.exports = { summary, detail, skuMaster, rng, hash, ROWS };
