/**
 * npm run check:budget-metadata
 * Checks the Budget costing sets of ZMM_BOM_COST_SRV against the system's $metadata: every set, every property the screens read, every filter property
 * and the POST payload properties. Same connection settings as check:metadata (.env.local / .env).
 * Exit codes: 0 OK · 1 names missing · 2 not reachable. The Azure gateway may refuse $metadata; run it against the Gateway over VPN.
 * Fix names ONLY in src/lib/budget/fields.ts.
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
  const F = await import('../src/lib/budget/fields');
  console.log(`check:budget-metadata → ${cfg.config.baseUrl}/$metadata  (system ${cfg.config.system})`);
  let xml: string;
  try { xml = await sapGetMetadata(); } catch (e) { console.error(`\n  ✗ Could not fetch $metadata: ${(e as Error).message}\n`); process.exit(2); }
  const md = parseMetadata(xml);
  const filterNames = Array.from(new Set(Object.values(F.BUDGET_FILTER)));
  const selectionSets: (keyof typeof F.BUDGET_SET)[] = ['SUMMARY', 'SPLIT', 'CHECK'];
  const checks: { key: keyof typeof F.BUDGET_SET; wanted: string[] }[] = [
    { key: 'SUMMARY', wanted: [...Object.values(F.BUDGET_SUMMARY).map(([n]) => n), ...filterNames.filter((n) => n !== 'Rowid' && n !== 'Gjahr' && n !== 'Version')] },
    { key: 'SPLIT', wanted: [...Object.values(F.BUDGET_SPLIT).map(([n]) => n), ...filterNames.filter((n) => n !== 'Gjahr' && n !== 'Version')] },
    { key: 'CHECK', wanted: [...Object.values(F.BUDGET_CHECK).map(([n]) => n), ...filterNames.filter((n) => n !== 'Gjahr' && n !== 'Version')] },
    { key: 'PENDING', wanted: [...Object.values(F.BUDGET_PENDING).map(([n]) => n), 'AppUser'] },
    { key: 'PENDING_DET', wanted: [...Object.values(F.BUDGET_PENDING_DET).map(([n]) => n), 'AppUser'] },
    { key: 'INIT', wanted: [...Object.values(F.BUDGET_INIT_RESULT).map(([n]) => n), 'AppUser', 'RunIds', 'Remarks', 'ExclDiv'] },
    { key: 'APPROVE', wanted: [...Object.values(F.BUDGET_APPROVE_RESULT).map(([n]) => n), 'AppUser', 'Remarks1'] },
  ];
  void selectionSets;
  let bad = 0;
  for (const { key, wanted } of checks) {
    const setName = F.BUDGET_SET[key];
    const type = md.sets.get(setName);
    if (!type) { console.log(`  ✗ entity set ${setName} is missing`); bad++; continue; }
    const props = md.types.get(type)?.props;
    if (!props) { console.log(`  ✗ ${setName}: entity type ${type} not found`); bad++; continue; }
    const missing = Array.from(new Set(wanted)).filter((n) => !props.has(n));
    if (missing.length) { console.log(`  ✗ ${setName}: missing ${missing.join(', ')}`); bad++; } else console.log(`  ✓ ${setName} (${type}): ${props.size} properties, all used names present`);
  }
  if (bad) { console.error(`\n  ✗ FAIL - fix the SAP names in src/lib/budget/fields.ts only.\n`); process.exit(1); }
  console.log('\n  OK\n');
}
main().catch((e) => { console.error(e); process.exit(2); });
