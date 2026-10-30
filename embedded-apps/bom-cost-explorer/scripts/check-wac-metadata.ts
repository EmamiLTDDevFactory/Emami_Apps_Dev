/**
 * npm run check:wac-metadata
 * Checks the four WAC entity sets of ZMM_BOM_COST_SRV (Actual vs rate sources) against the system's $metadata: every set,
 * every property the screen reads, and every filter property. Same connection settings as check:metadata (.env.local / .env).
 * Exit codes: 0 OK · 1 names missing · 2 not reachable. The Azure gateway may refuse $metadata; the live calls still work.
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
  const { WAC_SET, WAC_FIELDS, WAC_FILTER } = await import('../src/lib/wac/fields');
  console.log(`check:wac-metadata → ${cfg.config.baseUrl}/$metadata  (system ${cfg.config.system})`);
  let xml: string;
  try { xml = await sapGetMetadata(); } catch (e) { console.error(`\n  ✗ Could not fetch $metadata: ${(e as Error).message}\n`); process.exit(2); }
  const md = parseMetadata(xml);
  let bad = 0;
  for (const [key, setName] of Object.entries(WAC_SET) as [keyof typeof WAC_SET, string][]) {
    const type = md.sets.get(setName);
    if (!type) { console.log(`  ✗ entity set ${setName} is missing`); bad++; continue; }
    const props = md.types.get(type)?.props;
    if (!props) { console.log(`  ✗ ${setName}: entity type ${type} not found`); bad++; continue; }
    const wanted = [...Object.values(WAC_FIELDS[key]).map(([n]) => n), ...Object.values(WAC_FILTER)];
    const missing = Array.from(new Set(wanted)).filter((n) => !props.has(n) && !(n === 'Prodha' && key !== 'ROWS') && !(/^(SrcIn|GrpIn)$/.test(n) && key !== 'COMPARE' && !props.has(n)));
    if (missing.length) { console.log(`  ✗ ${setName}: missing ${missing.join(', ')}`); bad++; } else console.log(`  ✓ ${setName} (${type}): ${props.size} properties, all used names present`);
  }
  if (bad) { console.error(`\n  ✗ FAIL - fix the SAP names in src/lib/wac/fields.ts only.\n`); process.exit(1); }
  console.log('\n  OK\n');
}
main().catch((e) => { console.error(e); process.exit(2); });
