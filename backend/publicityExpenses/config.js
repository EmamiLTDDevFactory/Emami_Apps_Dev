/*
   Publicity Expenses - report header mapping, spend classes and media buckets.

   Header groups follow the MIS layout ("ATL BTL Expenses Summary report layout.xlsx", row 5), in this order:
     ATL, MODELLING, FILM PROD, BTL, BTL SALES, CREATIVE   -> GR TOTAL MIS
     DSR AND OTHER EXP                                    -> + MIS = GR TOTAL LR
   ReportHeader comes from ZREP_SEQ_MAP-RPTHDR. It is matched after upper-casing and dropping everything that is not a
   letter or digit, so "Film Prod", "FILM PROD" and "FILM-PROD" are the same group; aliases cover short forms. A header
   that matches nothing is kept as its own group (class UNMAPPED) and still counts in GR TOTAL LR, so totals always
   equal the G/L.

   Spend class (ATL / BTL / OTHER) per group: the layout tags Modelling, Film Prod and Creative as production work for
   media campaigns, so they count as ATL; BTL Sales counts as BTL; DSR and other expenses stay outside the ATL : BTL
   ratio (they are part of GR TOTAL LR only). Change the `cls` values below if Finance classifies them differently.
*/
const layout = require('./layout.json');

const GROUPS = [
    { id: 'ATL', label: 'ATL', cls: 'ATL', mis: true, aliases: ['ATL', 'ABOVETHELINE'] },
    { id: 'MODELLING', label: 'Modelling', cls: 'ATL', mis: true, aliases: ['MODELLING', 'MODELING', 'MODEL'] },
    { id: 'FILM PROD', label: 'Film Prod', cls: 'ATL', mis: true, aliases: ['FILMPROD', 'FILMPRODUCTION', 'FILM'] },
    { id: 'BTL', label: 'BTL', cls: 'BTL', mis: true, aliases: ['BTL', 'BELOWTHELINE'] },
    { id: 'BTL SALES', label: 'BTL Sales', cls: 'BTL', mis: true, aliases: ['BTLSALES'] },
    { id: 'CREATIVE', label: 'Creative', cls: 'ATL', mis: true, aliases: ['CREATIVE'] },
    { id: 'DSR AND OTHER EXP', label: 'DSR & Other Exp', cls: 'OTHER', mis: false, aliases: ['DSRANDOTHEREXP', 'DSROTHEREXP', 'DSR', 'DSRANDOTHEREXPENSES'] },
];

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ALIAS = new Map();
for (const g of GROUPS) for (const a of g.aliases) ALIAS.set(a, g);

/*
   Admin overrides (Settings > Mappings, stored as setting "mapping"):
     { groups: { [groupId]: { cls, mis } },        spend class / GR Total MIS membership of a group
       aliases: { [normalisedHeader]: groupId },    a ReportHeader from SAP the built-in list does not know -> a group
       glMedia: { [glWithoutLeadingZeros]: bucket } }  media / activity bucket of a G/L account
*/
const CLASSES = ['ATL', 'BTL', 'OTHER'];

function groupWith(g, mapping) {
    const o = mapping?.groups?.[g.id];
    return { id: g.id, label: g.label, cls: CLASSES.includes(o?.cls) ? o.cls : g.cls, mis: typeof o?.mis === 'boolean' ? o.mis : g.mis };
}

/** ReportHeader -> { id, label, cls, mis }. Unknown headers keep their own name (class UNMAPPED) unless an alias maps them. */
function headerGroup(reportHeader, mapping) {
    const n = norm(reportHeader);
    const g = ALIAS.get(n) || GROUPS.find((x) => x.id === mapping?.aliases?.[n]);
    if (g) return groupWith(g, mapping);
    const name = String(reportHeader || '').trim() || 'No report header';
    return { id: name.toUpperCase(), label: name, cls: 'UNMAPPED', mis: false };
}

/*
   Media / activity bucket per G/L account. ATL accounts by number (layout row 7); BTL and other accounts by
   keywords in the G/L name, so a new account lands in a sensible bucket without a code change.
*/
const ATL_MEDIA = {
    '507929': 'TV', '507927': 'Print', '507926': 'Print', '507930': 'Digital', '507932': 'Digital', '507933': 'Digital',
    '507934': 'Digital', '507928': 'Radio', '507931': 'Cinema', '508034': 'Sponsorship', '508028': 'Sponsorship',
    '508042': 'Other ATL', '508033': 'Other ATL',
};
const KEYWORDS = [
    ['E-commerce', /E\s?-?COM/],
    ['Free issue & sampling', /FREE\s+ISSU|SAMPL/],
    ['Visibility & in-store', /WINDOW|DISPLAY|POP\b|POP MAT|BANNER|HOARDING|BOARD|NEON|WALL PAINT|POSTER|STICKER|MERCHANDIS|IN SHOP|VAN PAINT|RICKSHOW|MOBILE VAN/],
    ['Consumer & trade promotion', /SCHEME|CAMPAIGN|PROMOTION|LISTING|DEALER|MARKET DEVELOP|GIFT|LAUNCH|EXHIBITION|FAIR|ROAD SHOW|DOOR TO DOOR|CELEBRIT|CONFERENCE|SEMINAR|RURAL|CALENDAR|SOUVEN/],
    ['Research', /RESEARCH|SURVEY|MARKET STUDY|MARKET REPORTER/],
    ['Production & creative', /FILM|CREATIVE|MODEL|PHOTOGRAPH|ART WORK|VIDEO/],
    ['Field force (DSR)', /DSR|MERC[HA]*NDISER|FIELD FORCE|DOCTOR/],
];
const BUCKETS = ['TV', 'Digital', 'Print', 'Radio', 'Cinema', 'Sponsorship', 'Other ATL', 'Free issue & sampling', 'Visibility & in-store',
    'Consumer & trade promotion', 'E-commerce', 'Research', 'Production & creative', 'Field force (DSR)', 'Other BTL', 'Other'];

function medium(glAccount, glName, group, mapping) {
    const n = String(glAccount || '').replace(/^0+/, '');
    const o = mapping?.glMedia?.[n];
    if (o && BUCKETS.includes(o)) return o;
    if (ATL_MEDIA[n]) return ATL_MEDIA[n];
    const name = String(glName || '').toUpperCase();
    for (const [label, re] of KEYWORDS) if (re.test(name)) return label;
    if (group && group.cls === 'ATL') return 'Other ATL';
    if (group && group.cls === 'BTL') return 'Other BTL';
    return 'Other';
}

/** Names of the layout's G/L accounts (used when SAP sends no text and by the mock). */
const GL_NAMES = new Map(layout.glAccounts.map((g) => [g.gl.replace(/^0+/, ''), g.name]));

const NON_BRAND = ['Misc - Unit non Brand', 'Misc - HO non Brand', 'IBD non Brand', 'Not covered by mapping logic', 'Brand - hierarchy not found'];
const UNMAPPED_GROUPS = new Set(['NOT COVERED BY MAPPING LOGIC', 'BRAND - HIERARCHY NOT FOUND']);
const isUnmapped = (productGroup) => UNMAPPED_GROUPS.has(String(productGroup || '').trim().toUpperCase());

/** What the app shows for the mapping (GET /config), overrides applied. */
function publicConfig(mapping) {
    const groups = GROUPS.map((g) => groupWith(g, mapping));
    return {
        groups,
        defaults: GROUPS.map(({ id, label, cls, mis, aliases }) => ({ id, label, cls, mis, aliases })),
        totals: [
            { id: 'GR TOTAL MIS', label: 'GR Total MIS', of: groups.filter((g) => g.mis).map((g) => g.id) },
            { id: 'GR TOTAL LR', label: 'GR Total LR', of: ['GR TOTAL MIS', ...groups.filter((g) => !g.mis).map((g) => g.id)], includesUnmapped: true },
        ],
        nonBrand: NON_BRAND,
        classes: CLASSES,
        buckets: BUCKETS,
    };
}

/** Validate a mapping from Settings. Returns { mapping } or { error }. */
function validateMapping(input) {
    const out = { groups: {}, aliases: {}, glMedia: {} };
    for (const [id, o] of Object.entries(input?.groups || {})) {
        if (!GROUPS.some((g) => g.id === id)) return { error: `Unknown header group ${id}.` };
        if (!CLASSES.includes(o?.cls)) return { error: `Class of ${id} must be ATL, BTL or OTHER.` };
        out.groups[id] = { cls: o.cls, mis: !!o.mis };
    }
    for (const [h, id] of Object.entries(input?.aliases || {})) {
        const n = norm(h);
        if (!n || n.length > 40) return { error: `Report header "${h}" is not valid.` };
        if (!GROUPS.some((g) => g.id === id)) return { error: `"${h}" must map to a known header group.` };
        out.aliases[n] = id;
    }
    for (const [gl, b] of Object.entries(input?.glMedia || {})) {
        const n = String(gl).trim().replace(/^0+(?=\d)/, '');
        if (!/^\d{1,10}$/.test(n)) return { error: `G/L "${gl}" must be digits.` };
        if (!BUCKETS.includes(b)) return { error: `Bucket "${b}" for G/L ${n} is not one of the media / activity buckets.` };
        out.glMedia[n] = b;
    }
    if (Object.keys(out.aliases).length > 200 || Object.keys(out.glMedia).length > 2000) return { error: 'Too many mapping entries.' };
    return { mapping: out };
}

module.exports = { GROUPS, CLASSES, BUCKETS, headerGroup, medium, GL_NAMES, NON_BRAND, isUnmapped, publicConfig, validateMapping, norm };
