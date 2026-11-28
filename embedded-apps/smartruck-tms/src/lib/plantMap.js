// Plant Map helpers (pure: no DOM, no React) - used by src/components/map and tested in tests/plantMap.test.mjs.
// Data comes from public/plant-locations.json (scripts/geocode-plants.py). Edits an admin makes by dragging a marker are kept as overrides.

export const OVERRIDE_KEY = 'smartruck_tms_plant_loc_overrides';

/** Type colours (also the legend). Ordered as shown. */
export const TYPES = [
  { id: 'Depot', color: '#2563eb', label: 'Depot' },
  { id: 'MWH', color: '#7c3aed', label: 'MWH' },
  { id: 'Unit', color: '#16a34a', label: 'Unit' },
  { id: '3P', color: '#d97706', label: '3P' },
  { id: 'Plant', color: '#64748b', label: 'Other plant' },
];
export const typeColor = (t) => (TYPES.find((x) => x.id === t) || TYPES[TYPES.length - 1]).color;

/** Same rule as scripts/geocode-plants.py: the plant code prefix, MWH when the planning tool says so. */
export function classify(code, sanjoyType = '') {
  if (sanjoyType === 'MWH') return 'MWH';
  const c = String(code || '').toUpperCase();
  return c.startsWith('DP') ? 'Depot' : c.startsWith('UN') ? 'Unit' : c.startsWith('3P') ? '3P' : 'Plant';
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const hasPoint = (p) => isNum(p.lat) && isNum(p.lon);
/** India bounding box: an edit outside it is refused. */
export const inIndia = (lat, lon) => isNum(lat) && isNum(lon) && lat >= 6 && lat <= 37 && lon >= 68 && lon <= 98;

/** Final coordinates = data file, replaced by an admin override. Overrides outside India or for unknown plants are ignored. */
export function mergeOverrides(plants, overrides) {
  const ov = overrides && typeof overrides === 'object' ? overrides : {};
  return plants.map((p) => {
    const o = ov[p.code];
    if (o && inIndia(o.lat, o.lon)) return { ...p, lat: o.lat, lon: o.lon, edited: true, original: hasPoint(p) ? { lat: p.lat, lon: p.lon } : null };
    return { ...p, edited: false };
  });
}

/** Plants that should be looked at by eye: not high confidence, or no coordinates. An edited plant counts as reviewed. */
export const needsReview = (p) => !p.edited && (!hasPoint(p) || p.confidence !== 'high');

export function filterPlants(plants, { types, state, q, reviewOnly } = {}) {
  const t = types && types.length ? new Set(types) : null;
  const s = String(q || '').trim().toLowerCase();
  return plants.filter((p) => (!t || t.has(p.type)) && (!state || p.state === state) && (!reviewOnly || needsReview(p))
    && (!s || [p.code, p.name, p.city, p.state, p.pincode].some((x) => String(x || '').toLowerCase().includes(s))));
}

export const states = (plants) => [...new Set(plants.map((p) => p.state).filter(Boolean))].sort();
export const countBy = (plants, key) => plants.reduce((m, p) => { const k = p[key] || '-'; m[k] = (m[k] || 0) + 1; return m; }, {});

const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV of the final coordinates (what is on the map, overrides included). */
export function toCsv(plants) {
  const head = ['Plant', 'Name', 'Type', 'City', 'State', 'PIN', 'Latitude', 'Longitude', 'Source', 'Confidence', 'Edited', 'Note'];
  const rows = plants.map((p) => [p.code, p.name, p.type, p.city, p.state, p.pincode, hasPoint(p) ? p.lat : '', hasPoint(p) ? p.lon : '', p.source || '', p.confidence || '', p.edited ? 'yes' : '', p.note || ''].map(csvCell).join(','));
  return [head.join(','), ...rows].join('\r\n');
}

/** Escape text for the HTML of a Leaflet popup. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE = { 'sanjoy-dp': 'Distribution Planning tool', pincode: 'PIN code geocode', city: 'City geocode', manual: 'Edited by an admin' };
export const sourceLabel = (p) => (p.edited ? SOURCE.manual : SOURCE[p.source] || 'No position');
