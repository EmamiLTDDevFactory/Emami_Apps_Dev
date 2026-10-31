/**
 * npm run check:ck-so-metadata
 * Checks the CK13N sets (CkListSet, CkHeaderSet, CkCompSet, CkItemSet), the sales-price sets (SoAreaVHSet, SoFilterVHSet, SoPriceSet,
 * SoPricingSet, SoProcSet, SoCondSet) and CogmRowSet of ZMM_BOM_COST_SRV against the system's $metadata: every set, every property the
 * screens read and the filter properties. These sets were NOT published on any SAP system when the code was written (all 404), so the
 * names follow the agreed contract; run this as soon as SAP publishes them. Same connection settings as check:metadata (.env.local / .env).
 * Exit codes: 0 OK · 1 names missing · 2 not reachable. Fix names ONLY in src/lib/ck/fields.ts and src/lib/so/fields.ts.
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

async function main() {
  const { loadSapConfig } = await import('../src/lib/sap/config');
  const cfg = loadSapConfig('localhost');
  if (!cfg.ok) { console.error(`\n  ✗ ${cfg.error}\n`); process.exit(2); }
  const { sapGetMetadata } = await import('../src/lib/sap/client');
  const { parseMetadata } = await import('../src/lib/sap/metadataCheck');
  const { CK_SET, CK_FIELDS, CK_FILTER } = await import('../src/lib/ck/fields');
  const { SO_SET, SO_FIELDS, SO_FILTER, COGM_FILTER } = await import('../src/lib/so/fields');
  console.log(`check:ck-so-metadata → ${cfg.config.baseUrl}/$metadata  (system ${cfg.config.system})`);
  let xml: string;
  try { xml = await sapGetMetadata(); } catch (e) { console.error(`\n  ✗ Could not fetch $metadata: ${(e as Error).message}\n`); process.exit(2); }
  const md = parseMetadata(xml);
  let bad = 0;
  const check = (setName: string, fields: Record<string, readonly [string, string]> | null, filters: string[]) => {
    const type = md.sets.get(setName);
    if (!type) { console.log(`  ✗ entity set ${setName} is missing`); bad++; return; }
    const props = md.types.get(type)?.props;
    if (!props) { console.log(`  ✗ ${setName}: entity type ${type} not found`); bad++; return; }
    const wanted = [...(fields ? Object.values(fields).map(([n]) => n) : []), ...filters];
    const missing = Array.from(new Set(wanted)).filter((n) => !props.has(n));
    if (missing.length) { console.log(`  ✗ ${setName}: missing ${missing.join(', ')}`); bad++; } else console.log(`  ✓ ${setName} (${type}): ${props.size} properties, all used names present`);
  };
  const ckFilters = Object.values(CK_FILTER);
  check(CK_SET.LIST, CK_FIELDS.LIST, ckFilters);
  check(CK_SET.HEADER, CK_FIELDS.HEADER, ckFilters.filter((n) => !['DateFrom', 'DateTo', 'CurOnly'].includes(n)));
  check(CK_SET.COMP, CK_FIELDS.COMP, ckFilters.filter((n) => !['DateFrom', 'DateTo', 'CurOnly', 'Klvar', 'Status'].includes(n)));
  check(CK_SET.ITEM, CK_FIELDS.ITEM, ckFilters.filter((n) => !['DateFrom', 'DateTo', 'CurOnly', 'Klvar', 'Status'].includes(n)));
  const common = Object.values(SO_FILTER).filter((n) => n !== 'KindIn' && n !== 'KalsmIn');
  check(SO_SET.AREA, SO_FIELDS.AREA, common);
  check(SO_SET.FILTER, SO_FIELDS.FILTER, [...common, 'KindIn']);
  check(SO_SET.PRICE, SO_FIELDS.PRICE, common);
  check(SO_SET.PRICING, SO_FIELDS.PRICING, common);
  check(SO_SET.PROC, SO_FIELDS.PROC, ['KalsmIn']);
  check(SO_SET.COND, SO_FIELDS.COND, []);
  check(SO_SET.COGM, SO_FIELDS.COGM, [...Object.values(COGM_FILTER), ...common.filter((n) => !['MatnrIn', 'WerksIn', 'DaysBack', 'DateTo'].includes(n))]);
  if (bad) { console.error(`\n  ✗ FAIL - fix the SAP names in src/lib/ck/fields.ts or src/lib/so/fields.ts only.\n`); process.exit(1); }
  console.log('\n  OK\n');
}
main().catch((e) => { console.error(e); process.exit(2); });
