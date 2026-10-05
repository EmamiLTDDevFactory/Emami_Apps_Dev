/**
 * $metadata check shared by `npm run check:metadata` and the /admin/connection page: parses
 * EntityType / EntitySet / NavigationProperty / Property and verifies every entity set
 * (entities.ts), the RateOptions navigation and every property (fields.ts: result fields and the
 * selection / filter list, with per-set types) the code uses. Suggestions are case- and
 * underscore-insensitive.
 */
import { ENTITY_SET, NAV_RATE_OPTIONS, SELECTION_SETS, type EntitySetKey } from './entities';
import { ENTITY_TYPE_RATE_OPTION, FIELDS_BY_SET, OPTIONAL_PROPS, RATE_OPTION, SELECTION, selectionField, type FieldKind } from './fields';

const EDM_OK: Record<FieldKind, string[]> = {
  s: ['Edm.String'],
  d: ['Edm.Decimal', 'Edm.Double', 'Edm.Single'],
  i: ['Edm.Int16', 'Edm.Int32', 'Edm.Byte', 'Edm.SByte'],
  b: ['Edm.Boolean'],
  t: ['Edm.DateTime', 'Edm.DateTimeOffset'],
  f: ['Edm.String'],
};

export interface ParsedMetadata {
  sets: Map<string, string>; // set -> entity type
  types: Map<string, { props: Map<string, { type: string; filterable: boolean }>; propOrder: string[]; navs: Set<string> }>;
}

export function parseMetadata(xml: string): ParsedMetadata {
  const types: ParsedMetadata['types'] = new Map();
  for (const m of xml.matchAll(/<EntityType\b[^>]*\bName="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g)) {
    const props = new Map<string, { type: string; filterable: boolean }>();
    const propOrder: string[] = [];
    for (const p of m[2].matchAll(/<Property\b([^>]*)\/?>/g)) {
      const name = /\bName="([^"]+)"/.exec(p[1])?.[1];
      if (!name) continue;
      propOrder.push(name);
      props.set(name, { type: /\bType="([^"]+)"/.exec(p[1])?.[1] ?? '', filterable: !/sap:filterable="false"/.test(p[1]) });
    }
    types.set(m[1], { props, propOrder, navs: new Set(Array.from(m[2].matchAll(/<NavigationProperty\b[^>]*\bName="([^"]+)"/g), (x) => x[1])) });
  }
  const sets = new Map(Array.from(xml.matchAll(/<EntitySet\b[^>]*\bName="([^"]+)"[^>]*\bEntityType="([^"]+)"/g), (m) => [m[1], m[2].split('.').pop()!]));
  return { sets, types };
}

const norm = (s: string) => s.toLowerCase().replace(/_/g, '');
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function closest(name: string, pool: string[]): string {
  const n = norm(name);
  const exact = pool.find((p) => norm(p) === n);
  if (exact) return exact;
  const best = pool.map((p) => [p, lev(n, norm(p))] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(n.length / 3)) ? best[0] : '-';
}

export interface CheckRow { area: string; name: string; status: 'OK' | 'MISSING' | 'TYPE' | 'WARN'; detail: string }

export function checkMetadata(md: ParsedMetadata) {
  const rows: CheckRow[] = [];
  const checkProps = (area: string, typeName: string, map: Record<string, readonly [string, FieldKind]>, isFilter: boolean) => {
    const t = md.types.get(typeName)!;
    const pool = Array.from(t.props.keys());
    for (const [sap, kind] of Object.values(map)) {
      const p = t.props.get(sap);
      if (!p && OPTIONAL_PROPS.has(sap)) rows.push({ area, name: sap, status: 'WARN', detail: 'optional (fields.ts OPTIONAL_PROPS) - not in the service; shown as 0 / not requested' });
      else if (!p) rows.push({ area, name: sap, status: 'MISSING', detail: `closest: ${closest(sap, pool)}` });
      else if (!EDM_OK[kind].includes(p.type)) rows.push({ area, name: sap, status: isFilter ? 'TYPE' : 'WARN', detail: `${p.type}, fields.ts kind '${kind}' expects ${EDM_OK[kind].join('/')}` });
      else if (isFilter) rows.push({ area, name: sap, status: p.filterable ? 'OK' : 'WARN', detail: p.filterable ? 'sap:filterable=true' : 'sap:filterable="false" - SAP may reject it in $filter' });
      else rows.push({ area, name: sap, status: 'OK', detail: p.type });
    }
  };
  let costLineType: string | null = null;
  for (const [key, setName] of Object.entries(ENTITY_SET) as [EntitySetKey, string][]) {
    const typeName = md.sets.get(setName);
    if (!typeName || !md.types.has(typeName)) {
      rows.push({ area: 'EntitySet', name: setName, status: 'MISSING', detail: `closest: ${closest(setName, Array.from(md.sets.keys()))}` });
      continue;
    }
    rows.push({ area: 'EntitySet', name: setName, status: 'OK', detail: `type ${typeName}` });
    checkProps(setName, typeName, FIELDS_BY_SET[key] as Record<string, readonly [string, FieldKind]>, false);
    if ((SELECTION_SETS as readonly string[]).includes(key)) {
      const sel = Object.fromEntries(Object.keys(SELECTION).map((k) => [k, selectionField(key, k as keyof typeof SELECTION)]));
      checkProps(`${setName} $filter`, typeName, sel as Record<string, readonly [string, FieldKind]>, true);
    }
    if (key === 'COST_LINES') {
      costLineType = typeName;
      const navs = md.types.get(typeName)!.navs;
      rows.push(navs.has(NAV_RATE_OPTIONS)
        ? { area: 'Navigation', name: NAV_RATE_OPTIONS, status: 'OK', detail: `on ${typeName}` }
        : { area: 'Navigation', name: NAV_RATE_OPTIONS, status: 'MISSING', detail: `closest: ${closest(NAV_RATE_OPTIONS, Array.from(navs))}` });
    }
  }
  const optType = md.types.has(ENTITY_TYPE_RATE_OPTION) ? ENTITY_TYPE_RATE_OPTION : Array.from(md.types.keys()).find((t) => norm(t).includes('rateoption'));
  if (optType) checkProps(`RateOptions (${optType})`, optType, RATE_OPTION as Record<string, readonly [string, FieldKind]>, false);
  else rows.push({ area: 'EntityType', name: ENTITY_TYPE_RATE_OPTION, status: 'MISSING', detail: `types: ${Array.from(md.types.keys()).join(', ')}` });

  const bad = rows.filter((r) => r.status === 'MISSING' || r.status === 'TYPE');
  const warn = rows.filter((r) => r.status === 'WARN');
  const filterRows = rows.filter((r) => r.area.endsWith('$filter'));
  return {
    rows,
    ok: bad.length === 0,
    counts: { ok: rows.length - bad.length - warn.length, warn: warn.length, bad: bad.length, filterable: filterRows.filter((r) => r.status === 'OK').length, filterTotal: filterRows.length },
    hasRateOptionsNav: rows.some((r) => r.area === 'Navigation' && r.status === 'OK'),
    costLineFirstProps: costLineType ? md.types.get(costLineType)!.propOrder.slice(0, 10) : [],
  };
}
