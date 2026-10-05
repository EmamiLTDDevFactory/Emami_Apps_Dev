/**
 * npm run check:metadata  [--all]
 *
 * Fetches <SAP_BASE_URL>/$metadata (SAP_BASE_URL = SAP_GATEWAY_HOST/api/SAP_SYSTEM/SAP_SERVICE,
 * auth per SAP_AUTH_MODE) and fails with a table when an entity set, the RateOptions navigation
 * or any property the code uses is missing - same check as the /admin/connection page
 * (src/lib/sap/metadataCheck.ts). Exit codes: 0 OK · 1 names missing · 2 not reachable /
 * wrong service name. Reads .env.local / .env; MOCK_SAP=true checks the built-in mock.
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

function table(rows: { area: string; name: string; status: string; detail: string }[]) {
  const head = ['Area', 'Name in code', 'Status', 'Suggestion / detail'];
  const cells = rows.map((r) => [r.area, r.name, r.status, r.detail]);
  const w = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (c: string[]) => `  ${c.map((x, i) => x.padEnd(w[i])).join('  │  ')}`;
  console.log(line(head));
  console.log(`  ${w.map((n) => '─'.repeat(n)).join('──┼──')}`);
  for (const c of cells) console.log(line(c));
}

async function main() {
  const { loadSapConfig } = await import('../src/lib/sap/config');
  const cfg = loadSapConfig('localhost');
  if (!cfg.ok) {
    console.error(`\n  ✗ ${cfg.error}\n`);
    process.exit(2);
  }
  const { sapGetMetadata } = await import('../src/lib/sap/client');
  const { parseMetadata, checkMetadata } = await import('../src/lib/sap/metadataCheck');
  const { SERVICE } = await import('../src/lib/sap/entities');
  console.log(`check:metadata → ${cfg.config.baseUrl}/$metadata  (system ${cfg.config.system}, auth ${cfg.config.authMode})`);
  let xml: string;
  try {
    xml = await sapGetMetadata();
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'NO_SERVICE') {
      console.error(`\n  ✗ SERVICE NOT FOUND: SAP Gateway says "${err.message}".`);
      console.error(`    SAP_SERVICE must be ${SERVICE} and the service must be registered on ${cfg.config.system} (/IWFND/MAINT_SERVICE).\n`);
    } else console.error(`\n  ✗ Could not fetch $metadata: ${err.message}\n    (The Azure gateway may not pass $metadata through; run against the Gateway itself if so.)\n`);
    process.exit(2);
  }
  const r = checkMetadata(parseMetadata(xml));
  const verbose = process.argv.includes('--all');
  console.log('');
  table(verbose ? r.rows : r.rows.filter((x) => x.status !== 'OK' || x.area === 'EntitySet' || x.area === 'Navigation'));
  console.log(`\n  ${r.counts.ok} OK · ${r.counts.warn} warning(s) · ${r.counts.bad} problem(s) · filter properties filterable: ${r.counts.filterable}/${r.counts.filterTotal}${verbose ? '' : ' (use --all to list every property)'}`);
  if (!r.ok) {
    console.error(`\n  ✗ FAIL - fix the names in src/lib/sap/fields.ts (properties) or src/lib/sap/entities.ts (sets / navigation) only.\n`);
    process.exit(1);
  }
  console.log('\n  ✓ OK - every entity set, the RateOptions navigation and every property the app uses exist in $metadata.\n');
}

main().catch((e) => {
  console.error(`check:metadata could not run: ${(e as Error).message}`);
  process.exit(2);
});
