/**
 * Mapping between the screen model (flat MaterialData, lib/types.ts) and the backend model of /me/mm-mdm
 * (data.single[Entity][FIELD], data.multi[Entity] = rows, data.views = SAP view names).
 *
 * Pure functions, no React, no I/O: unit-tested in lib/mmMap.test.ts.
 *
 * The entity of a field is decided by its SAP name (`tech`) and the table of the view that shows it (MARA -> Material, MARC -> Plant,
 * MARD -> StorageLocation, MBEW -> Valuation, MVKE -> SalesOrg, MLGN -> WarehouseData, MLGT -> StorageTypeData, MPOP -> ForecastParameter,
 * MAKT -> Description ...). A field binds only to an entity that really HAS it: the keys of the rows SAP returned, the items of
 * GET /fieldcontrol and the static fallback in lib/mmCatalogue.ts decide. A field nobody has stays UNBOUND (never shown, never written).
 */
import type { MaterialData } from './types';
import { KNOWN_FIELDS } from './mmCatalogue';
import { KEY_FIELDS } from './keyFields';
import { VIEWS, type FieldDef, type ViewDef } from './materialViews';
import type { BackendData, FieldControl, Row } from './mmApi';

/* ------------------------------------------------------------------ */
/* Static knowledge                                                     */
/* ------------------------------------------------------------------ */

export const SINGLE_ENTITIES = ['Material', 'Description', 'Plant', 'SalesOrg', 'Valuation', 'StorageLocation', 'WarehouseData', 'StorageTypeData', 'EanData', 'ForecastParameter'] as const;
export const MULTI_ENTITIES = ['UnitOfMeasure', 'TaxClassification', 'SalesTaxData', 'InspectionType', 'ClassCharacteristic', 'ProductionVersion', 'ConsumptionData', 'LongText'] as const;

const ENTITY_OF_TABLE: Record<string, string> = {
  MARA: 'Material', MARC: 'Plant', MARD: 'StorageLocation', MBEW: 'Valuation', MVKE: 'SalesOrg', MLGN: 'WarehouseData', MLGT: 'StorageTypeData',
  MPOP: 'ForecastParameter', MAKT: 'Description', QMAT: 'InspectionType', MLAN: 'TaxClassification',
};

/** Views whose fields also live in the first row of a multi-row entity (production version, consumption, inspection types) */
const EXTRA_ROW0: Record<string, string[]> = { costing1: ['ProductionVersion'], forecast: ['ConsumptionData'], quality: ['InspectionType'] };

/** SAP view names (flags of /INOWITS/M_VWSEL) behind each tab of the app. Used for the view selection and for hiding unselected tabs. */
export const SAP_VIEWS_OF: Record<string, string[]> = {
  basic: ['MARA_BASIC1', 'MARA_BASIC2', 'MARA_BASIC3', 'MARA_BASIC_3', 'RMCL_CLASS', 'MEAN_EAN'],
  salesOrg1: ['MVKE_SORG1'],
  salesTax: ['MVKE_SORG1_TAX', 'MVKE_SORG_TAX'],
  salesOrg2: ['MVKE_SORG2'],
  salesPlant: ['MARC_GEN'],
  ftExport: ['MARC_FT_EXP'],
  purchasing: ['MARC_PURC'],
  workSched: ['WORK_SCHEDULE'],
  ftImport: ['MARC_FT_IMP'],
  mrp1: ['MARC_MRP1'], mrp2: ['MARC_MRP2'], mrp3: ['MARC_MRP3'], mrp4: ['MARC_MRP4'],
  forecast: ['PROP_FORC', 'PROP_CONS'],
  storage1: ['MARA_PLNT1', 'PLNT_STCK', 'ST_LOC_STCK'],
  storage2: ['MARA_PLNT2'],
  wm1: ['MLGN_WHM1'], wm2: ['MLGT_WHM2'],
  quality: ['QMAT_QM'],
  acct1: ['MBEW_ACC1'], acct2: ['MBEW_ACC2'], costing1: ['MARC_COST1'], costing2: ['MBEW_COST2'],
  text: ['TEXT', 'MARM_UOM'],
};
export const ALL_SAP_VIEWS: string[] = Array.from(new Set(Object.values(SAP_VIEWS_OF).flat()));

/** True when the request carries one of this tab's SAP views (an empty selection means "all", as nothing was restricted) */
export const viewSelected = (viewId: string, selected: string[]): boolean =>
  !selected.length || (SAP_VIEWS_OF[viewId] ?? []).some((v) => selected.includes(v));

/** Long text ids (MM_TEXT-FID): key-data long text and the four texts of the Text view */
const LONGTEXT_FID: Record<string, string> = { TDLINE: 'LTXT', GRUN: 'GRUN', PRUE: 'PRUE', IVER: 'IVER', '0001': '0001' };
/** Suffixes the app adds to a SAP name to tell two fields of different tabs apart (NRFHG / NRFHG_P). */
const ALIAS_SUFFIX = /^(.+?)_(P|M|V|S|WS|C|R|E|Q|U|W|2)$/;

/* ------------------------------------------------------------------ */
/* Known fields                                                         */
/* ------------------------------------------------------------------ */

export type Known = Record<string, Set<string>>;

/** Fields an entity is known to have: static catalogue + keys of the returned rows + items of the field control */
export function knownFields(data?: BackendData | null, fc?: FieldControl | null): Known {
  const k: Known = {};
  const add = (e: string, f: string) => { if (e && f) (k[e] = k[e] ?? new Set()).add(f.toUpperCase()); };
  for (const [e, fs] of Object.entries(KNOWN_FIELDS)) fs.forEach((f) => add(e, f));
  if (data) {
    for (const [e, row] of Object.entries(data.single ?? {})) Object.keys(row ?? {}).forEach((f) => add(e, f));
    for (const [e, rows] of Object.entries(data.multi ?? {})) if (rows?.[0]) Object.keys(rows[0]).forEach((f) => add(e, f));
  }
  if (fc) for (const items of Object.values(fc)) for (const it of items) { const [e, f] = splitField(it.field); add(e, f); }
  return k;
}

/** 'Plant.DISMM' -> ['Plant','DISMM']; '.MTART' (general rule without entity) -> ['','MTART'] */
export function splitField(field: string): [string, string] {
  const i = field.lastIndexOf('.');
  return i < 0 ? ['', field] : [field.slice(0, i), field.slice(i + 1)];
}

/* ------------------------------------------------------------------ */
/* Bindings                                                             */
/* ------------------------------------------------------------------ */

export type BindingKind = 'scalar' | 'row0' | 'longtext' | 'table' | 'comments';
export interface Binding {
  /** App field key (MaterialData key) */
  key: string;
  tech: string;
  kind: BindingKind;
  entity: string;
  /** ABAP field (scalar, row0), FID (longtext) */
  field: string;
  type: FieldDef['type'];
  /** Read-only mirror of a column another field already owns (NRFHG_P of NRFHG): shown, never written */
  alias?: boolean;
  viewId?: string;
  /** table fields: how rows are mapped */
  table?: 'uom' | 'tax' | 'descriptions' | 'class';
}
export interface Bindings {
  byKey: Record<string, Binding>;
  /** Fields (key + label) no entity has: never shown, never written */
  unbound: { key: string; label: string; tech: string; viewId: string }[];
}

const candidatesOf = (v: ViewDef): { entity: string; row0: boolean }[] => {
  const base = v.table.split('/').map((t) => ENTITY_OF_TABLE[t.trim()]).filter(Boolean);
  const seen = new Set<string>();
  const out: { entity: string; row0: boolean }[] = [];
  for (const e of base) if (!seen.has(e)) { seen.add(e); out.push({ entity: e, row0: (MULTI_ENTITIES as readonly string[]).includes(e) }); }
  for (const e of EXTRA_ROW0[v.id] ?? []) if (!seen.has(e)) { seen.add(e); out.push({ entity: e, row0: true }); }
  return out;
};

/** Key-data fields: explicit entity, checked against what SAP has like every other field */
const KEY_BINDING: Record<string, { entity: string; field: string; kind?: BindingKind }> = {
  materialType: { entity: 'Material', field: 'MTART' },
  industrySector: { entity: 'Material', field: 'MBRSH' },
  materialGroup: { entity: 'Material', field: 'MATKL' },
  businessVertical: { entity: 'Material', field: 'ZZBUSVERT' },
  scheme: { entity: 'Material', field: 'ZZSCHEME' },
  prodHierarchy: { entity: 'Material', field: 'PRDHA' },
  division: { entity: 'Material', field: 'SPART' },
  description: { entity: 'Description', field: 'MAKTX' },
  longText: { entity: 'LongText', field: 'LTXT', kind: 'longtext' },
  plant: { entity: 'Plant', field: 'WERKS' },
  storageLocation: { entity: 'StorageLocation', field: 'LGORT' },
  salesOrg: { entity: 'SalesOrg', field: 'VKORG' },
  distChannel: { entity: 'SalesOrg', field: 'VTWEG' },
  warehouseNo: { entity: 'WarehouseData', field: 'LGNUM' },
  storageType: { entity: 'StorageTypeData', field: 'LGTYP' },
};

export function buildBindings(known: Known = knownFields()): Bindings {
  const byKey: Record<string, Binding> = {};
  const unbound: Bindings['unbound'] = [];
  const has = (e: string, f: string) => !!known[e]?.has(f);
  const taken = new Set<string>(); // Entity.FIELD already owned by a field

  for (const kf of KEY_FIELDS) {
    const b = KEY_BINDING[kf.key];
    if (!b) continue;
    if (b.kind === 'longtext' || has(b.entity, b.field)) {
      byKey[kf.key] = { key: kf.key, tech: kf.tech, kind: b.kind ?? 'scalar', entity: b.entity, field: b.field, type: kf.key === 'longText' ? 'textarea' : 'text' };
      if (!b.kind) taken.add(`${b.entity}.${b.field}`);
    } else unbound.push({ key: kf.key, label: kf.label, tech: kf.tech, viewId: '' });
  }

  for (const v of VIEWS) {
    const cands = candidatesOf(v);
    for (const f of v.fields) {
      if (byKey[f.key]) continue;
      if (f.type === 'attachments') continue; // handled by the attachment routes, not by the entities
      const lost = () => unbound.push({ key: f.key, label: f.label, tech: f.tech, viewId: v.id });
      if (f.tech === 'ZCOMMENT') {
        // not a SAP field: the request comments of the backend (GET/POST /requests/:id/comments), shown as a comments panel
        byKey[f.key] = { key: f.key, tech: f.tech, kind: 'comments', entity: '', field: f.tech, type: f.type, viewId: v.id };
        continue;
      }
      if (f.type === 'table') {
        const t = f.tech === 'MARM' ? 'uom' : f.tech === 'TAXKM' ? 'tax' : f.tech === 'MAKT' ? 'descriptions' : f.tech === 'KSSK' ? 'class' : '';
        const entity = t === 'uom' ? 'UnitOfMeasure' : t === 'tax' ? 'SalesTaxData' : t === 'class' ? 'ClassCharacteristic' : 'Description';
        // classification: rows of ClassCharacteristic exactly as SAP sent them; AUSP (characteristic values) has no entity of its own and stays unbound
        if (t && (t !== 'class' || has(entity, 'ATWRT'))) byKey[f.key] = { key: f.key, tech: f.tech, kind: 'table', entity, field: f.tech, type: 'table', viewId: v.id, table: t as Binding['table'] };
        else lost();
        continue;
      }
      if (LONGTEXT_FID[f.tech] && f.type === 'textarea') {
        byKey[f.key] = { key: f.key, tech: f.tech, kind: 'longtext', entity: 'LongText', field: LONGTEXT_FID[f.tech], type: 'textarea', viewId: v.id };
        continue;
      }
      let hit: { entity: string; row0: boolean; field: string; alias: boolean } | null = null;
      for (const c of cands) {
        if (has(c.entity, f.tech)) { hit = { ...c, field: f.tech, alias: false }; break; }
      }
      if (!hit) {
        const m = ALIAS_SUFFIX.exec(f.tech);
        if (m) for (const c of cands) if (has(c.entity, m[1])) { hit = { ...c, field: m[1], alias: true }; break; }
      }
      if (!hit) { lost(); continue; }
      const own = `${hit.entity}.${hit.field}`;
      const alias = hit.alias || taken.has(own);
      taken.add(own);
      byKey[f.key] = { key: f.key, tech: f.tech, kind: hit.row0 ? 'row0' : 'scalar', entity: hit.entity, field: hit.field, type: f.type, alias, viewId: v.id };
    }
  }
  return { byKey, unbound };
}

/* ------------------------------------------------------------------ */
/* Values                                                               */
/* ------------------------------------------------------------------ */

const DATE_MS = /\/Date\((-?\d+)/;

/** Backend value -> screen string */
export function fromValue(type: FieldDef['type'] | 'select', v: unknown): string {
  if (v === null || v === undefined) return '';
  if (type === 'checkbox') return v === true || v === 'X' || v === 'x' || v === 'true' ? 'X' : '';
  if (type === 'date') {
    const s = String(v);
    const m = DATE_MS.exec(s);
    if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
    if (/^0{4,8}/.test(s.replace(/-/g, ''))) return '';
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return s.slice(0, 10);
  }
  if (typeof v === 'boolean') return v ? 'X' : '';
  return String(v);
}

/** Screen string -> backend value, keeping the type SAP used for that field (boolean / number / string) */
export function toValue(type: FieldDef['type'] | 'select', v: string, before: unknown): unknown {
  if (type === 'checkbox') return typeof before === 'boolean' ? v === 'X' : v === 'X' ? 'X' : '';
  if (type === 'date') return v ? v : null;
  if (typeof before === 'number') return v === '' ? 0 : Number(v);
  return v;
}

const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

/* ------------------------------------------------------------------ */
/* Backend -> screen                                                    */
/* ------------------------------------------------------------------ */

const parseRows = (s: string | undefined): Record<string, string>[] => {
  if (!s) return [];
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
};
/** Identity of a classification row: SAP's SR_NO, else its position */
const classRowId = (r: Row, i: number) => (r.SR_NO !== undefined && r.SR_NO !== null && r.SR_NO !== '' ? String(r.SR_NO) : `#${i}`);
const fid = (rows: Row[] | undefined, f: string) => (rows ?? []).find((r) => String(r.FID ?? '') === f);

export function fromBackend(data: BackendData, b: Bindings = buildBindings(knownFields(data)), materialNumber = ''): MaterialData {
  const flat: MaterialData = { materialNumber } as MaterialData;
  for (const bd of Object.values(b.byKey)) {
    let v = '';
    if (bd.kind === 'scalar') v = fromValue(bd.type, data.single?.[bd.entity]?.[bd.field]);
    else if (bd.kind === 'row0') v = fromValue(bd.type, data.multi?.[bd.entity]?.[0]?.[bd.field]);
    else if (bd.kind === 'longtext') v = String(fid(data.multi?.LongText, bd.field)?.TEXT ?? '');
    else if (bd.kind === 'table') v = JSON.stringify(readTable(bd, data));
    flat[bd.key] = v; // 'comments' stays empty: it is not data of the request
  }
  return flat;
}

function readTable(bd: Binding, data: BackendData): Record<string, string>[] {
  if (bd.table === 'uom') {
    return (data.multi?.UnitOfMeasure ?? []).map((r) => ({
      denominator: fromValue('number', r.UMREN), altUnit: fromValue('select', r.MEINH), numerator: fromValue('number', r.UMREZ),
      baseUnit: fromValue('select', data.single?.Material?.MEINS),
    }));
  }
  if (bd.table === 'tax') {
    return (data.multi?.SalesTaxData ?? []).map((r) => ({
      country: fromValue('text', r.ALAND), countryName: '', taxCat: fromValue('text', r.TATYP), taxCatName: '', taxClass: fromValue('select', r.TAXKD),
    }));
  }
  if (bd.table === 'class') {
    return (data.multi?.ClassCharacteristic ?? []).map((r, i) => {
      const atnam = fromValue('text', r.ATNAM), atbez = fromValue('text', r.ATBEZ);
      return {
        srNo: classRowId(r, i), klart: fromValue('text', r.KLART), cls: fromValue('text', r.CLASS), kltxt: fromValue('text', r.KLTXT),
        char: atbez && atnam && atbez !== atnam ? `${atbez} (${atnam})` : atbez || atnam, value: fromValue('text', r.ATWRT),
      };
    });
  }
  if (bd.table === 'descriptions') {
    const d = data.single?.Description;
    return d && (d.MAKTX || d.SPRAS) ? [{ lang: fromValue('select', d.SPRAS), text: fromValue('text', d.MAKTX) }] : [];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Screen -> backend (patch)                                            */
/* ------------------------------------------------------------------ */

/**
 * The data to PUT / send with an action: only what changed against `base` (the data as loaded), plus ALL view flags (the backend
 * rewrites the flags from data.views on every write, so omitting them would clear them).
 * `editable` limits the fields that may be written (the ones field control lets this user change); undefined = every bound, non-alias field.
 */
export function toPatch(flat: MaterialData, base: BackendData, b: Bindings = buildBindings(knownFields(base)), editable?: (bd: Binding) => boolean): BackendData {
  const out: BackendData = { single: {}, multi: {}, views: [...(base.views ?? [])] };
  const origin = fromBackend(base, b);
  const touch = (e: string): Row => (out.single[e] = out.single[e] ?? {});

  // tables first, scalars after (the key-data description wins over the first row of the descriptions table)
  const order = Object.values(b.byKey).sort((x, y) => Number(y.kind === 'table') - Number(x.kind === 'table'));
  for (const bd of order) {
    if (bd.alias || (editable && !editable(bd))) continue;
    const now = flat[bd.key] ?? '';
    if (now === (origin[bd.key] ?? '')) continue;
    if (bd.kind === 'scalar') {
      const before = base.single?.[bd.entity]?.[bd.field];
      touch(bd.entity)[bd.field] = toValue(bd.type, now, before);
    } else if (bd.kind === 'row0') {
      const row = base.multi?.[bd.entity]?.[0];
      if (!row) continue; // no row to put the value into: a row cannot be created without its key
      const rows = (out.multi[bd.entity] = out.multi[bd.entity] ?? (base.multi[bd.entity] ?? []).map((r) => ({ ...r })));
      rows[0][bd.field] = toValue(bd.type, now, row[bd.field]);
    } else if (bd.kind === 'longtext') {
      const rows = (out.multi.LongText = out.multi.LongText ?? (base.multi?.LongText ?? []).map((r) => ({ ...r })));
      const hit = rows.find((r) => String(r.FID ?? '') === bd.field);
      if (hit) hit.TEXT = now;
      else if (now) rows.push({ MATNR: String(rows[0]?.MATNR ?? ''), FID: bd.field, TEXT: now });
    } else if (bd.kind === 'table') writeTable(bd, now, base, out);
  }
  return out;
}

function writeTable(bd: Binding, json: string, base: BackendData, out: BackendData) {
  const rows = parseRows(json);
  if (bd.table === 'uom') {
    const prev = new Map((base.multi?.UnitOfMeasure ?? []).map((r) => [String(r.MEINH ?? ''), r]));
    out.multi.UnitOfMeasure = rows.filter((r) => r.altUnit).map((r) => {
      const was = prev.get(r.altUnit) ?? {};
      return { ...was, MEINH: r.altUnit, UMREZ: toValue('number', r.numerator ?? '', was.UMREZ), UMREN: toValue('number', r.denominator ?? '', was.UMREN) };
    });
  } else if (bd.table === 'tax') {
    const prev = new Map((base.multi?.SalesTaxData ?? []).map((r) => [`${r.ALAND}|${r.TATYP}`, r]));
    const next: Row[] = [];
    for (const r of rows) {
      const was = prev.get(`${r.country}|${r.taxCat}`);
      if (was) next.push({ ...was, TAXKD: r.taxClass ?? '' }); // rows are fixed: SAP made them, the user only sets the class
    }
    out.multi.SalesTaxData = next;
  } else if (bd.table === 'class') {
    // rows are SAP's: never added, removed or re-keyed; only ATWRT of a row whose value changed is written
    const now = new Map(rows.map((r) => [r.srNo, r.value ?? '']));
    out.multi.ClassCharacteristic = (base.multi?.ClassCharacteristic ?? []).map((r, i) => {
      const id = classRowId(r, i);
      return now.has(id) && fromValue('text', r.ATWRT) !== now.get(id) ? { ...r, ATWRT: toValue('text', now.get(id)!, r.ATWRT) } : { ...r };
    });
  } else if (bd.table === 'descriptions') {
    const first = rows[0];
    if (first) Object.assign(out.single.Description = out.single.Description ?? {}, { SPRAS: first.lang ?? '', MAKTX: first.text ?? '' });
  }
}

/* ------------------------------------------------------------------ */
/* Changed fields (MX: against the live values the request started from) */
/* ------------------------------------------------------------------ */

/** Normal form for comparing two screen values: trimmed strings, numbers by value, tables row by row, empty = empty */
export function normForCompare(type: FieldDef['type'] | 'select', v: unknown): string {
  if (v === null || v === undefined) return '';
  if (type === 'table') {
    let rows: unknown;
    try { rows = typeof v === 'string' ? (v ? JSON.parse(v) : []) : v; } catch { return String(v).trim(); }
    if (!Array.isArray(rows)) return '';
    return JSON.stringify(rows.map((r: Record<string, unknown>) => Object.fromEntries(Object.keys(r ?? {}).sort().map((k) => [k, normForCompare('text', r[k])]))));
  }
  const s = String(v).trim();
  if (s === '') return '';
  if (type === 'number') { const n = Number(s); return Number.isFinite(n) ? String(n) : s; }
  if (type === 'checkbox') return s === 'X' || s === 'x' || s === 'true' ? 'X' : '';
  return s;
}

/**
 * Fields of the screen whose value differs from the base (both flat models, made by fromBackend with the same bindings).
 * Returns key -> the original (base) value as a screen string. Mirrors (alias) and comments are never compared.
 */
export function changedFields(flat: MaterialData, baseFlat: MaterialData, b: Bindings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const bd of Object.values(b.byKey)) {
    if (bd.alias || bd.kind === 'comments') continue;
    const was = baseFlat[bd.key] ?? '';
    if (normForCompare(bd.type, flat[bd.key]) !== normForCompare(bd.type, was)) out[bd.key] = was;
  }
  return out;
}

/** Does the screen differ from what was loaded? (drives "unsaved changes") */
export function isDirty(flat: MaterialData, base: BackendData, b: Bindings): boolean {
  const orig = fromBackend(base, b);
  return Object.values(b.byKey).some((bd) => !bd.alias && (flat[bd.key] ?? '') !== (orig[bd.key] ?? ''));
}

/* ------------------------------------------------------------------ */
/* SAP messages -> fields                                               */
/* ------------------------------------------------------------------ */

export interface FieldMessage { severity: 'E' | 'W' | 'I'; text: string; view?: string; field?: string }

/**
 * Finds the screen field a SAP message is about. `target` is whatever SAP sent (Entity.FIELD, Entity/FIELD, MARC-DISMM, FIELD ...); the
 * first token that is the SAP name of a bound field wins, preferring the entity named in the same target.
 */
export function messageField(target: string, b: Bindings): { key: string; viewId: string } | null {
  if (!target) return null;
  const tokens = target.toUpperCase().split(/[^A-Z0-9_]+/).filter(Boolean);
  const entities = new Set<string>([...SINGLE_ENTITIES, ...MULTI_ENTITIES].filter((e) => tokens.includes(e.toUpperCase())));
  const list = Object.values(b.byKey);
  for (const t of tokens) {
    const ofField = list.filter((x) => x.field.toUpperCase() === t && x.kind !== 'table');
    const pick = ofField.find((x) => entities.has(x.entity) && !x.alias) ?? ofField.find((x) => entities.has(x.entity)) ?? ofField.find((x) => !x.alias) ?? ofField[0];
    if (pick) return { key: pick.key, viewId: pick.viewId ?? '' };
  }
  return null;
}

export function toFieldMessages(messages: { severity: string; message: string; target: string; code?: string }[], b: Bindings): FieldMessage[] {
  return messages.map((m) => {
    const hit = messageField(m.target, b);
    const sev = (['E', 'W', 'I'].includes(m.severity) ? m.severity : m.severity === 'S' ? 'I' : 'E') as 'E' | 'W' | 'I';
    return { severity: sev, text: m.message, ...(hit ? { field: hit.key, view: hit.viewId || undefined } : {}) };
  });
}

/* ------------------------------------------------------------------ */
/* Field control                                                        */
/* ------------------------------------------------------------------ */

export interface Control { shown: boolean; displayOnly: boolean; required: boolean }
export interface ControlIndex {
  empty: boolean;
  of(entity: string, field: string): Control | null;
  /** key-data rule (Source 'general') by SAP field name */
  general(field: string): Control | null;
  /** Merged rule of every field SAP lists for an entity (for texts and tables, whose rows have no single field) */
  ofEntity(entity: string): Control | null;
}

/** Merges the items of every SAP view: shown if any view shows it, display-only only if every view says so, required if any view does */
export function indexFieldControl(fc: FieldControl | null | undefined): ControlIndex {
  const byEF = new Map<string, Control>();
  const byField = new Map<string, Control>();
  const general = new Map<string, Control>();
  const byEntity = new Map<string, Control>();
  let n = 0;
  const merge = (m: Map<string, Control>, key: string, it: { shown: boolean; displayOnly: boolean; required: boolean }) => {
    const c = m.get(key);
    if (!c) m.set(key, { shown: it.shown, displayOnly: it.displayOnly, required: it.required });
    else { c.shown = c.shown || it.shown; c.displayOnly = c.displayOnly && it.displayOnly; c.required = c.required || it.required; }
  };
  for (const items of Object.values(fc ?? {})) {
    for (const it of items) {
      n++;
      const [e, f] = splitField(it.field);
      if (it.source === 'general' || !e) { merge(general, f, it); continue; }
      merge(byEF, `${e}.${f}`, it);
      merge(byEntity, e, it);
      merge(byField, f, it);
    }
  }
  return {
    empty: n === 0,
    of: (e, f) => byEF.get(`${e}.${f}`) ?? byField.get(f) ?? null,
    general: (f) => general.get(f) ?? null,
    ofEntity: (e) => byEntity.get(e) ?? null,
  };
}
