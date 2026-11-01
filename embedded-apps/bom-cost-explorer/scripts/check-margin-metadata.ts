/**
 * npm run check:margin-metadata
 * Checks the Margin sets (CogmRowSet, CogmDriverSet, CogmSimSet, CogmAlertSet, CogmHistorySet, CogmBoardSet) of ZMM_BOM_COST_SRV against the system's
 * $metadata: every set, every property the screens read and the filter properties. The names follow the agreed contract and were NOT seen live when the
 * code was written (CogmRowSet answered 404 on NWP). Same connection settings as check:metadata (.env.local / .env).
 * Exit codes: 0 OK - 1 names missing - 2 not reachable. Fix names ONLY in src/lib/margin/fields.ts; then set MARGIN_SELECT=true to send $select.
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
  const { MARGIN_SET, MARGIN_FIELDS, MARGIN_FILTER } = await import('../src/lib/margin/fields');
  console.log(`check:margin-metadata → ${cfg.config.baseUrl}/$metadata  (system ${cfg.config.system})`);
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
  const F = MARGIN_FILTER;
  const entity = [F.Matnr, F.Werks, F.Market, F.Channel];
  const live = [F.Source, F.PriceDate, F.ExplQty, F.InclFrt, F.PriceSrcIn, F.VkorgIn, F.VtwegIn, F.SegmentIn, F.SoDaysIn, F.AuartIn, F.AuartEx, F.PstyvIn, F.PstyvEx, F.KdgrpIn, F.KdgrpEx, F.KunnrIn, F.KunnrEx];
  check(MARGIN_SET.ROW, MARGIN_FIELDS.ROW, [...entity, F.Prodha, F.Brand, ...live]);
  check(MARGIN_SET.DRIVER, MARGIN_FIELDS.DRIVER, [...entity, ...live]);
  check(MARGIN_SET.SIM, MARGIN_FIELDS.SIM, [...entity, F.Prodha, F.Brand, ...live, F.Scenario, F.NewMrp, F.NewSp, F.CogmDpct, F.CogmDabs, F.TgtRatioIn, F.TgtRemainIn]);
  check(MARGIN_SET.ALERT, MARGIN_FIELDS.ALERT, [...entity, F.Prodha, F.Brand, ...live, F.RuleIn]);
  check(MARGIN_SET.HISTORY, MARGIN_FIELDS.HISTORY, [...entity, F.DaysBack]);
  check(MARGIN_SET.BOARD, MARGIN_FIELDS.BOARD, [...entity, F.Prodha, F.Brand, ...live, F.GroupBy]);
  for (const k of ['PRICE', 'RULE', 'VOLUME', 'BUDGET', 'TARGET'] as const) check(MARGIN_SET[k], null, []);
  if (bad) { console.error(`\n  ✗ FAIL - fix the SAP names in src/lib/margin/fields.ts only.\n`); process.exit(1); }
  console.log('\n  OK - now MARGIN_SELECT=true can be set.\n');
}
main().catch((e) => { console.error(e); process.exit(2); });
