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

/** ReportHeader -> { id, label, cls, mis }. Unknown headers keep their own name (class UNMAPPED). */
function headerGroup(reportHeader) {
    const g = ALIAS.get(norm(reportHeader));
    if (g) return { id: g.id, label: g.label, cls: g.cls, mis: g.mis };
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
function medium(glAccount, glName, group) {
    const n = String(glAccount || '').replace(/^0+/, '');
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

/** What the app shows for the mapping (GET /config). */
function publicConfig() {
    return {
        groups: GROUPS.map(({ id, label, cls, mis }) => ({ id, label, cls, mis })),
        totals: [
            { id: 'GR TOTAL MIS', label: 'GR Total MIS', of: GROUPS.filter((g) => g.mis).map((g) => g.id) },
            { id: 'GR TOTAL LR', label: 'GR Total LR', of: ['GR TOTAL MIS', ...GROUPS.filter((g) => !g.mis).map((g) => g.id)], includesUnmapped: true },
        ],
        nonBrand: NON_BRAND,
    };
}

module.exports = { GROUPS, headerGroup, medium, GL_NAMES, NON_BRAND, isUnmapped, publicConfig, norm };
