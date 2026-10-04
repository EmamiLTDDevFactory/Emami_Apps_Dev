/**
 * npm run check:metadata
 *
 * Fetches ZMM_BOM_COST_SRV/$metadata (same Basic auth / sap-client as the BFF) and FAILS if any
 * entity set, entity type, navigation or property named in src/lib/sap/fields.ts is missing -
 * the names in the service spec may differ slightly from what SAP really exposes. When one is
 * missing it prints the closest names SAP does have, so fixing fields.ts is a one-line change.
 * Type mismatches (e.g. Lookback is Edm.String, not an Int) are failures for selection fields,
 * because they change the $filter literal, and warnings elsewhere.
 *
 * Reads .env.local / .env. MOCK_SAP=true checks against the built-in mock.
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

type Kind = 's' | 'd' | 'i' | 'b' | 't';
const EDM_OK: Record<Kind, string[]> = {
  s: ['Edm.String'],
  d: ['Edm.Decimal', 'Edm.Double', 'Edm.Single'],
  i: ['Edm.Int16', 'Edm.Int32', 'Edm.Byte', 'Edm.SByte'],
  b: ['Edm.Boolean'],
  t: ['Edm.DateTime', 'Edm.DateTimeOffset'],
};

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
  return d[a.length][b.length];
}
const closest = (name: string, pool: string[]) => pool.map((p) => [p, lev(name, p)] as const).sort((x, y) => x[1] - y[1]).slice(0, 3).filter(([, s]) => s <= Math.max(3, name.length / 2)).map(([p]) => p);

async function main() {
  const { sapGetMetadata } = await import('../src/lib/sap/client');
  const F = await import('../src/lib/sap/fields');
  const xml = await sapGetMetadata();

  const types = new Map<string, { props: Map<string, string>; navs: Set<string> }>();
  for (const m of xml.matchAll(/<EntityType\b[^>]*\bName="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g)) {
    const props = new Map<string, string>();
    for (const p of m[2].matchAll(/<Property\b([^>]*)\/?>/g)) {
      const name = /\bName="([^"]+)"/.exec(p[1])?.[1];
      const type = /\bType="([^"]+)"/.exec(p[1])?.[1];
      if (name) props.set(name, type ?? '');
    }
    const navs = new Set(Array.from(m[2].matchAll(/<NavigationProperty\b[^>]*\bName="([^"]+)"/g), (x) => x[1]));
    types.set(m[1], { props, navs });
  }
  const sets = new Map(Array.from(xml.matchAll(/<EntitySet\b[^>]*\bName="([^"]+)"[^>]*\bEntityType="([^"]+)"/g), (m) => [m[1], m[2].split('.').pop()!]));

  const errors: string[] = [];
  const warnings: string[] = [];
  let checked = 0;

  const checkFields = (label: string, typeName: string, map: Record<string, readonly [string, Kind]>, strictTypes: boolean) => {
    const t = types.get(typeName);
    if (!t) return errors.push(`${label}: entity type ${typeName} not found in $metadata`);
    for (const [key, [sap, kind]] of Object.entries(map)) {
      checked++;
      const edm = t.props.get(sap);
      if (edm === undefined) {
        const hint = closest(sap, Array.from(t.props.keys()));
        errors.push(`${label}.${key}: property "${sap}" missing on ${typeName}${hint.length ? ` - did you mean ${hint.join(' / ')}?` : ''}`);
      } else if (!EDM_OK[kind].includes(edm)) {
        (strictTypes ? errors : warnings).push(`${label}.${key}: "${sap}" is ${edm}, fields.ts says kind '${kind}' (${EDM_OK[kind].join('/')})`);
      }
    }
  };

  for (const [k, setName] of Object.entries(F.ENTITY_SETS) as [keyof typeof F.ENTITY_SETS, string][]) {
    const typeName = sets.get(setName);
    if (!typeName) {
      errors.push(`Entity set ${setName} not found (sets in $metadata: ${Array.from(sets.keys()).join(', ')})`);
      continue;
    }
    if (typeName !== F.ENTITY_TYPES[k]) warnings.push(`${setName} uses type ${typeName} (fields.ts ENTITY_TYPES says ${F.ENTITY_TYPES[k]}) - checked against ${typeName}`);
    checkFields(setName, typeName, F.ENTITY_FIELDS[k] as Record<string, readonly [string, Kind]>, false);
    if ((F.SELECTION_SETS as readonly string[]).includes(k)) checkFields(`${setName}[selection]`, typeName, F.SELECTION as Record<string, readonly [string, Kind]>, true);
  }
  const clType = sets.get(F.ENTITY_SETS.CostLines);
  if (clType && !types.get(clType)?.navs.has(F.NAV_RATE_OPTIONS)) errors.push(`CostLines: navigation ${F.NAV_RATE_OPTIONS} missing (navs: ${Array.from(types.get(clType)?.navs ?? []).join(', ') || 'none'})`);
  const optType = types.has(F.ENTITY_TYPE_RATE_OPTION) ? F.ENTITY_TYPE_RATE_OPTION : undefined;
  if (!optType) errors.push(`Entity type ${F.ENTITY_TYPE_RATE_OPTION} not found (types: ${Array.from(types.keys()).join(', ')})`);
  else checkFields('RateOption', optType, F.RATE_OPTION as Record<string, readonly [string, Kind]>, false);

  console.log(`check:metadata - ${process.env.MOCK_SAP === 'true' ? 'MOCK SAP' : process.env.SAP_BASE_URL} - ${checked} property references checked`);
  for (const w of warnings) console.warn(`  WARN  ${w}`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s). Fix the SAP names in src/lib/sap/fields.ts (only that file).`);
    process.exit(1);
  }
  console.log('OK - every property used by the app exists in $metadata.');
}

main().catch((e) => {
  console.error(`check:metadata could not run: ${e.message}`);
  process.exit(2);
});
