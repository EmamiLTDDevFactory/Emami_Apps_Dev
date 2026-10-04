/**
 * npm run check:metadata
 *
 *  a) fetches <SAP_BASE_URL>/$metadata with the BFF's own Basic auth / sap-client,
 *  b) parses EntityType / EntitySet / NavigationProperty / Property names,
 *  c) FAILS (exit 1) with a readable table when an entity set from entities.ts (ENTITY_SET), the
 *     navigation NAV_RATE_OPTIONS, or any property from fields.ts (result fields + the selection /
 *     filter list) is missing - with the closest existing name as a suggestion (case- and
 *     underscore-insensitive),
 *  d) reports whether every filter property is sap:filterable="true".
 *
 * Exit codes: 0 all good · 1 names missing · 2 could not fetch / wrong service name.
 * Reads .env.local / .env. MOCK_SAP=true checks the built-in mock.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const f of ['.env.local', '.env']) {
  const p = join(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

type Kind = 's' | 'd' | 'i' | 'b' | 't' | 'f';
const EDM_OK: Record<Kind, string[]> = {
  s: ['Edm.String'],
  d: ['Edm.Decimal', 'Edm.Double', 'Edm.Single'],
  i: ['Edm.Int16', 'Edm.Int32', 'Edm.Byte', 'Edm.SByte'],
  b: ['Edm.Boolean'],
  t: ['Edm.DateTime', 'Edm.DateTimeOffset'],
  f: ['Edm.String'],
};

const norm = (s: string) => s.toLowerCase().replace(/_/g, '');
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Exact match ignoring case/underscores first, else the nearest by edit distance. */
function closest(name: string, pool: string[]): string {
  const n = norm(name);
  const exact = pool.find((p) => norm(p) === n);
  if (exact) return exact;
  const best = pool.map((p) => [p, lev(n, norm(p))] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(n.length / 3)) ? best[0] : '-';
}

interface Row { area: string; name: string; status: 'OK' | 'MISSING' | 'TYPE' | 'WARN'; detail: string }

function table(rows: Row[]) {
  const head = ['Area', 'Name in code', 'Status', 'Suggestion / detail'];
  const cells = rows.map((r) => [r.area, r.name, r.status, r.detail]);
  const w = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c: string[]) => `  ${c.map((x, i) => x.padEnd(w[i])).join('  │  ')}`;
  console.log(line(head));
  console.log(`  ${w.map((n) => '─'.repeat(n)).join('──┼──')}`);
  for (const c of cells) console.log(line(c));
}

async function main() {
  const { sapGetMetadata } = await import('../src/lib/sap/client');
  const F = await import('../src/lib/sap/fields');
  const E = await import('../src/lib/sap/entities');
  const target = process.env.MOCK_SAP === 'true' ? 'MOCK SAP' : process.env.SAP_BASE_URL;
  console.log(`check:metadata → ${target}/$metadata`);

  let xml: string;
  try {
    xml = await sapGetMetadata();
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    if (err.code === 'NO_SERVICE') {
      console.error(`\n  ✗ SERVICE NOT FOUND: SAP Gateway says "${err.message}".`);
      console.error(`    SAP_BASE_URL must end in /${E.SERVICE} and the service must be registered (and its system alias set)`);
      console.error('    in /IWFND/MAINT_SERVICE on this Gateway. Check the name/version with Basis.\n');
    } else console.error(`\n  ✗ Could not fetch $metadata: ${err.message}\n`);
    process.exit(2);
  }

  const types = new Map<string, { props: Map<string, { type: string; filterable: boolean }>; navs: Set<string> }>();
  for (const m of xml.matchAll(/<EntityType\b[^>]*\bName="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g)) {
    const props = new Map<string, { type: string; filterable: boolean }>();
    for (const p of m[2].matchAll(/<Property\b([^>]*)\/?>/g)) {
      const name = /\bName="([^"]+)"/.exec(p[1])?.[1];
      if (!name) continue;
      props.set(name, { type: /\bType="([^"]+)"/.exec(p[1])?.[1] ?? '', filterable: !/sap:filterable="false"/.test(p[1]) });
    }
    types.set(m[1], { props, navs: new Set(Array.from(m[2].matchAll(/<NavigationProperty\b[^>]*\bName="([^"]+)"/g), (x) => x[1])) });
  }
  const sets = new Map(Array.from(xml.matchAll(/<EntitySet\b[^>]*\bName="([^"]+)"[^>]*\bEntityType="([^"]+)"/g), (m) => [m[1], m[2].split('.').pop()!]));

  const rows: Row[] = [];
  const optional: ReadonlySet<string> = F.OPTIONAL_PROPS;
  const checkProps = (area: string, typeName: string, map: Record<string, readonly [string, Kind]>, isFilter: boolean) => {
    const t = types.get(typeName)!;
    const pool = Array.from(t.props.keys());
    for (const [sap, kind] of Object.values(map)) {
      const p = t.props.get(sap);
      if (!p && optional.has(sap)) rows.push({ area, name: sap, status: 'WARN', detail: 'optional (fields.ts OPTIONAL_PROPS) - not in the service; app shows it as 0 / not requested' });
      else if (!p) rows.push({ area, name: sap, status: 'MISSING', detail: `closest: ${closest(sap, pool)}` });
      else if (!EDM_OK[kind].includes(p.type)) rows.push({ area, name: sap, status: isFilter ? 'TYPE' : 'WARN', detail: `${p.type}, fields.ts kind '${kind}' expects ${EDM_OK[kind].join('/')}` });
      else if (isFilter) rows.push({ area, name: sap, status: p.filterable ? 'OK' : 'WARN', detail: p.filterable ? 'sap:filterable=true' : 'sap:filterable="false" - SAP may reject it in $filter' });
    }
  };

  for (const [key, setName] of Object.entries(E.ENTITY_SET) as [keyof typeof E.ENTITY_SET, string][]) {
    const typeName = sets.get(setName);
    if (!typeName || !types.has(typeName)) {
      rows.push({ area: 'EntitySet', name: setName, status: 'MISSING', detail: `closest: ${closest(setName, Array.from(sets.keys()))}` });
      continue;
    }
    rows.push({ area: 'EntitySet', name: setName, status: 'OK', detail: `type ${typeName}` });
    checkProps(setName, typeName, F.FIELDS_BY_SET[key] as Record<string, readonly [string, Kind]>, false);
    if ((E.SELECTION_SETS as readonly string[]).includes(key)) {
      const sel = Object.fromEntries(Object.keys(F.SELECTION).map((k) => [k, F.selectionField(key, k as keyof typeof F.SELECTION)]));
      checkProps(`${setName} $filter`, typeName, sel as Record<string, readonly [string, Kind]>, true);
    }
    if (key === 'COST_LINES') {
      const navs = types.get(typeName)!.navs;
      rows.push(navs.has(E.NAV_RATE_OPTIONS)
        ? { area: 'Navigation', name: E.NAV_RATE_OPTIONS, status: 'OK', detail: `on ${typeName}` }
        : { area: 'Navigation', name: E.NAV_RATE_OPTIONS, status: 'MISSING', detail: `closest: ${closest(E.NAV_RATE_OPTIONS, Array.from(navs))}` });
    }
  }
  // Rate option properties: resolve the target type through the association end if possible,
  // else by the configured name.
  const optType = types.has(F.ENTITY_TYPE_RATE_OPTION) ? F.ENTITY_TYPE_RATE_OPTION : Array.from(types.keys()).find((t) => norm(t).includes('rateoption'));
  if (optType) checkProps(`RateOptions (${optType})`, optType, F.RATE_OPTION as Record<string, readonly [string, Kind]>, false);
  else rows.push({ area: 'EntityType', name: F.ENTITY_TYPE_RATE_OPTION, status: 'MISSING', detail: `types: ${Array.from(types.keys()).join(', ')}` });

  const bad = rows.filter((r) => r.status === 'MISSING' || r.status === 'TYPE');
  const warn = rows.filter((r) => r.status === 'WARN');
  const ok = rows.length - bad.length - warn.length;
  const verbose = process.argv.includes('--all');
  console.log('');
  table(verbose ? rows : rows.filter((r) => r.status !== 'OK' || r.area === 'EntitySet' || r.area === 'Navigation'));
  const filterRows = rows.filter((r) => r.area.endsWith('$filter'));
  console.log(`\n  ${ok} OK · ${warn.length} warning(s) · ${bad.length} problem(s) · filter properties filterable: ${filterRows.filter((r) => r.status === 'OK').length}/${filterRows.length}${verbose ? '' : ' (use --all to list every property)'}`);
  if (bad.length) {
    console.error(`\n  ✗ FAIL - fix the names in src/lib/sap/fields.ts (properties) or src/lib/sap/entities.ts (sets / navigation) only.\n`);
    process.exit(1);
  }
  console.log('\n  ✓ OK - every entity set, the RateOptions navigation and every property the app uses exist in $metadata.\n');
}

main().catch((e) => {
  console.error(`check:metadata could not run: ${(e as Error).message}`);
  process.exit(2);
});
