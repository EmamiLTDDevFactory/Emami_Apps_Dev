// Records the BOM Simulator tutorial: steps with narration (macOS say, voice Rishi), on-screen captions and click
// highlights, against the mock SAP. Writes video.webm + timings.json into OUT.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { watchRoute } from './watchMock.mjs';
const [OUT, EX] = process.argv.slice(2);
const BASE = 'http://localhost:3297/apps/bom-cost-explorer';

const steps = [];
const ch = (title) => steps.push({ chapter: title });
const st = (text, action, opts = {}) => steps.push({ text, action, ...opts });

/* ======================= script ======================= */
ch('1. Welcome and layout');
st('Welcome to the BOM Simulator. This app costs Emami finished goods straight from SAP. It explodes the bill of materials, prices every component, and shows the cost per piece.', async (p) => {});
st('The header shows which SAP system you are working in. Here it is the development system. On the live site it shows NWP, production.', async (p, h) => h(p.getByText(/SAP NGD/).first()));
st('The left pane switches between the screens: BOM costing, Plant comparison, Rates, Freight, R M and P M, and the Production Plan.', async (p, h) => h(p.getByRole('complementary', { name: 'Modes' }).first()));
st('The Tutorial button in the top bar opens this video at any time. Use the chapter list beside the video to jump straight to a topic.', async (p, h) => h(p.getByRole('button', { name: /Tutorial/ }).first()));

ch('2. Choosing what to cost');
st('Start with What to cost. Type part of a material number or description, and SAP suggests the matching materials.', async (p, h) => { const i = p.getByLabel(/^Materials/).first(); await h(i); await i.click(); await i.pressSequentially('FG10', { delay: 120 }); await p.waitForTimeout(1500); });
st('Press Enter to add a material. You can also paste a whole list, separated by commas, spaces or new lines.', async (p) => { const i = p.getByLabel(/^Materials/).first(); await i.fill('FG1001'); await i.press('Enter'); });
st('Or pick by brand, product and C R S. Each level narrows the list below it, and you can select materials from the result.', async (p, h) => { const b = p.getByRole('button', { name: /Or pick by Brand/ }).first(); await h(b); await b.click(); await p.waitForTimeout(2200); const c = p.getByRole('button', { name: 'Close' }).first(); if (await c.count()) await c.click(); });
st('Choose one or more plants. Tip: leave the materials empty to cost every finished good of the chosen plants in one go.', async (p, h) => { const i = p.getByLabel(/^Plants/).first(); await h(i); await i.click(); await i.fill('1000'); await i.press('Enter'); });
st('Explosion quantity is the number of finished pieces to cost. Results are also shown per single piece.', async (p, h) => h(p.getByText('Explosion quantity').first()));
st('B O M levels limits how deep the bill of materials is exploded. All explodes every level.', async (p, h) => h(p.getByText('BOM levels').first()));
st('Rate look-back is how many days of purchase history SAP uses to find a rate. A donor plant lends its rates when a plant has none of its own.', async (p, h) => h(p.getByText('Rate look-back').first()));
st('Rate source priority decides which rate SAP picks: the first source in this list that has a rate wins. Untick a source to exclude it, or drag to change the order.', async (p, h) => h(p.getByText('Rate source priority').first()));
st('Freight can be included or excluded, using actual or standard freight.', async (p, h) => h(p.getByText('Include freight').first()));
st('Compare to budget adds the budget rates. Stock coverage adds cover days, and As of a date costs with the rates that were valid on a past date.', async (p, h) => { const b = p.getByRole('radio', { name: 'Compare to budget' }); await h(b); await b.click(); });
st('Press Run in SAP. A costing run takes a few seconds. The bar shows the progress, and you can cancel at any time.', async (p, h) => { const b = p.getByRole('button', { name: 'Run in SAP' }); await h(b); await b.click(); await p.getByRole('treegrid', { name: 'BOM cost tree' }).waitFor({ timeout: 60000 }); });

ch('3. Reading the BOM tree');
st('SAP messages show warnings from the run, for example rates taken from another plant, or old rates that were ignored.', async (p, h) => h(p.getByText(/SAP messages/).first()));
st('The total shows the cost of the whole run in Indian rupees, with the rate priority SAP used.', async (p, h) => h(p.getByText('Total', { exact: true }).first()));
st('The B O M tree lists country, plant, finished good, and every component level. Click an arrow to expand or collapse a level, or use Expand all.', async (p, h) => { const b = p.getByRole('button', { name: 'Expand all' }); await h(b); await b.click(); });
st('Columns lets you choose which columns to show, and column presets save your favourite layouts.', async (p, h) => { const b = p.getByRole('button', { name: /^Columns/ }); await h(b); await b.click(); await p.waitForTimeout(1800); await p.keyboard.press('Escape'); });
st('Click a freight value to see the freight break-up by condition type: the purchase order, the rate, and how it matches the cost line.', async (p, h) => { const b = p.getByRole('button', { name: 'Show freight break-up' }).first(); await h(b); await b.click(); await p.waitForTimeout(2600); await p.keyboard.press('Escape'); });
st('Click any component row to open its details: quantities, every rate option SAP found, freight, budget and coverage. You can also enter a manual rate as a what if. It is marked as simulated and never changes SAP.', async (p, h) => { const r = p.getByRole('row').filter({ hasText: 'PM0001' }).first(); await h(r); await r.click(); await p.waitForTimeout(3500); await p.keyboard.press('Escape'); });

ch('4. Dashboard, simulator and scenarios');
st('The Dashboard summarises the cost by category, rate source and plant, with stock cover days.', async (p, h) => { const t = p.getByRole('tab', { name: 'Dashboard' }); await h(t); await t.click(); });
st('The Simulator tries what ifs in your browser: re-pick rates, change rates by source, freight, exchange rates or quantity, or change single component rates. Simulated figures are marked S I M.', async (p, h) => { const t = p.getByRole('tab', { name: /Simulator/ }); await h(t); await t.click(); });
st('Data quality lists the lines that need attention: missing rates, M B E W only rates, donor plants and zero quantities.', async (p, h) => { const t = p.getByRole('tab', { name: /Data quality/ }); await h(t); await t.click(); });
st('Scenarios save a selection with its settings, so you can run it again later and compare versions side by side.', async (p, h) => { const t = p.getByRole('tab', { name: 'Scenarios' }); await h(t); await t.click(); });

ch('5. Rate sources, rate summary and coverage');
st('Rate sources compares every source for each component, and shows the cheapest option and the possible saving.', async (p, h) => { const t = p.getByRole('tab', { name: 'Rate sources' }); await h(t); await t.click(); await p.waitForTimeout(1500); });
st('Rate summary shows all rate types at once: the cost per piece of each finished good on every rate type, and the R M and P M rates per unit, with the lowest highlighted.', async (p, h) => { const t = p.getByRole('tab', { name: 'Rate summary' }); await h(t); await t.click(); await p.waitForTimeout(1500); });
st('Rate coverage shows how many components each source priced, and which components have no rate at all.', async (p, h) => { const t = p.getByRole('tab', { name: 'Rate coverage' }); await h(t); await t.click(); });

ch('6. Export, print and share');
st('Excel downloads every column with a parameters sheet. C S V suits other tools, Print gives a clean report, and Share copies a link that opens this same selection.', async (p, h) => { await h(p.getByRole('button', { name: /Excel/ }).first()); await p.waitForTimeout(900); await h(p.getByRole('button', { name: /Share/ }).first()); });

ch('7. AI: explain change and ask');
st('Explain change tells you why the cost per piece moved, compared with a previous run, the budget, an earlier SAP date, or a saved scenario.', async (p, h) => { await p.getByRole('tab', { name: 'BOM tree' }).click(); const b = p.getByRole('button', { name: /Explain change/ }); await h(b); await b.click(); await p.getByLabel('Baseline').selectOption('budget'); await p.getByRole('button', { name: /^Explain$/ }).click(); await p.waitForTimeout(2500); });
st('The waterfall splits the change into quantity, rate, freight and exchange rate effects. Every number in the text carries a fact id that you can hover to see where it came from.', async (p) => { await p.mouse.wheel(0, 400); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); });
st('Ask opens the costing assistant. Ask questions in plain language; it answers from SAP through read-only tools, and asks you to confirm before any SAP run.', async (p, h) => { const b = p.getByRole('button', { name: /^Ask$/ }); await h(b); await b.click(); await p.waitForTimeout(2200); await p.getByRole('button', { name: 'Close assistant' }).click(); });
st('Add your own Claude A P I key in A I settings. The key stays in your browser and is sent only to Anthropic.', async (p, h) => { const b = p.getByRole('button', { name: 'AI settings' }).first(); await h(b); await b.click(); await p.waitForTimeout(2200); await p.getByRole('button', { name: 'Cancel' }).click(); });

ch('8. Plant comparison');
st('Plant comparison costs one bill of materials in several plants. Choose the B O M plant, and the plants to compare.', async (p, h) => { const b = p.getByRole('button', { name: /^Plant comparison/ }); await h(b); await b.click(); await p.waitForTimeout(800);
  const bp = p.getByLabel(/^BOM plant/).first(); if (await bp.count()) { try { await bp.selectOption('1000'); } catch { await bp.click(); await bp.fill('1000'); await bp.press('Enter'); } }
  const cp = p.getByLabel(/^Compare in plants/).first(); if (await cp.count()) { await cp.click(); await cp.fill('1100'); await cp.press('Enter'); await cp.fill('BD10'); await cp.press('Enter'); } });
st('Run it, and each component cost appears side by side for every plant, converted to rupees, so the cheapest plant is easy to see.', async (p) => { await p.getByRole('button', { name: 'Run in SAP' }).click(); await p.waitForTimeout(4000); });

ch('9. Rates, freight and R M P M lists');
st('Rates lists the rate records SAP found in the look-back window for the chosen materials and plants.', async (p, h) => { const b = p.getByRole('button', { name: /^Rates/ }); await h(b); await b.click(); await p.waitForTimeout(600); await p.getByRole('button', { name: 'Run in SAP' }).click(); await p.waitForTimeout(3500); });
st('Freight shows the freight per purchase order, actual against standard.', async (p, h) => { const b = p.getByRole('button', { name: /^Freight/ }); await h(b); await b.click(); await p.waitForTimeout(600); await p.getByRole('button', { name: 'Run in SAP' }).click(); await p.waitForTimeout(3500); });
st('R M and P M shows the exploded raw and packing material requirement for the chosen materials.', async (p, h) => { const b = p.getByRole('button', { name: /^RM \/ PM/ }); await h(b); await b.click(); await p.waitForTimeout(600); await p.getByRole('button', { name: 'Run in SAP' }).click(); await p.waitForTimeout(3500); });

ch('10. Production plans');
st('Production plans live under Plans. The list shows every plan and plant in SAP, with the number of rows.', async (p, h) => { const l = p.getByRole('link', { name: /^Plans/ }).first(); await h(l); await l.click(); await p.waitForTimeout(2500); });
st('Open a plan, then choose the plants at the top. Every tab works on the plants you choose.', async (p) => { await p.goto(`${BASE}/plan/view/?plan=FY27-BASE&werks=1000&werks=1100&werks=BD10`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); });
st('Entries lists the plan rows with their monthly quantities. Planners can edit or delete rows here.', async (p, h) => { const t = p.getByRole('tab', { name: 'Entries' }); await h(t); await t.click(); await p.waitForTimeout(1500); });
st('Breakup and cost explodes the whole plan in SAP and prices it. The tree is grouped by plan country, plant and finished good.', async (p, h) => { await p.getByRole('tab', { name: /Breakup/ }).click(); const b = p.getByRole('button', { name: 'Run in SAP' }); await h(b); await b.click(); await p.getByText('Plan cost').first().waitFor({ timeout: 60000 }); await p.waitForTimeout(800); });
st('F G per piece compares the cost per piece on budget, M B E W, consumption and the current rates.', async (p, h) => { const t = p.getByRole('radio', { name: 'FG per pc' }); await h(t); await t.click(); await p.waitForTimeout(2000); });
st('Simulate changes component costs by category, for one component code in every product, or for a single finished good, and shows the impact per product and in total. Quick scenarios apply common increases in one click.', async (p, h) => { await p.getByRole('radio', { name: 'Simulate' }).click(); await p.waitForTimeout(800); const b = p.getByRole('button', { name: 'Inflation mix' }); await h(b); await b.click(); await p.waitForTimeout(1500); });
st('Plant drill-down rolls the cost up by plant, then finished good, then component. Savings and exposure compares the rates with budget, actual and the cheapest option. K P Is show the cost mix, A B C classes and the components that move the cost most.', async (p) => { for (const t of ['Plant drill-down', 'Savings & exposure', 'KPIs, sensitivity & scenarios']) { await p.getByRole('tab', { name: t }).click(); await p.waitForTimeout(1600); } });
st('Requirement lists every component with its monthly quantity, and Used in shows the finished goods that use it.', async (p, h) => { await p.getByRole('tab', { name: 'Requirement' }).click(); await p.waitForTimeout(800); const r = p.getByRole('button', { name: /Load requirement|Reload requirement/ }); if (await r.count()) await r.click(); await p.getByText('Component quantity summary').waitFor({ timeout: 60000 }); const u = p.locator('button[aria-expanded]').filter({ hasText: 'FG' }).first(); await h(u); await u.click(); await p.waitForTimeout(1500); });
st('Rate simulation changes one component rate with the slider, a percentage or a new rate, and shows the effect on each product and on the whole plan.', async (p, h) => { await p.getByRole('tab', { name: 'Rate simulation' }).click(); const s = p.getByLabel('Rate change percent', { exact: true }); await h(s); await s.fill('8'); await p.waitForTimeout(2000); });
st('Budget rates H 1 and H 2 applies the second half budget revision. Savings versus actual compares the budget with the actual for the months that have passed.', async (p) => { await p.getByRole('tab', { name: 'Budget rates H1 / H2' }).click(); await p.waitForTimeout(1600); await p.getByRole('tab', { name: 'Savings vs actual' }).click(); await p.waitForTimeout(1800); });
st('Checks lists bill of materials and master data problems, W I P covers semi-finished goods, and Scenarios compares plan what ifs.', async (p, h) => { const t = p.getByRole('tab', { name: 'Checks' }); await h(t); await t.click(); await p.waitForTimeout(1500); });
st('Upload plan downloads the Excel template, checks your file, and saves the plan to SAP.', async (p, h) => { const l = p.getByRole('link', { name: /^Upload plan/ }).first(); await h(l); await l.click(); await p.waitForTimeout(2500); });

ch('11. Daily cost watch');
st('The daily cost watch keeps an eye on costs for you. Open Cost watch under Monitoring. Every morning at six, the server costs your watch items in SAP and compares them with yesterday, the last seven days and thirty days ago.', async (p, h) => { const l = p.getByRole('link', { name: /^Cost watch/ }).first(); await h(l); await l.click(); await p.getByText('Daily cost watch').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200); });
st('The alerts inbox counts the high, medium and low alerts. Severity comes from the rupee impact on the volume: high from fifty thousand rupees, medium from five thousand.', async (p, h) => { await h(p.getByText('High', { exact: true }).first().locator('xpath=ancestor::div[2]')); });
st('Each alert names the rule that fired: cost per piece moved, a component rate moved, a weaker rate source, a freight jump, an exchange rate move, a B O M change, low cover or a plan check. Filter by status, plant, rule or severity.', async (p, h) => { const r = p.getByLabel('Rule'); await h(r); await r.selectOption('R2'); await p.waitForTimeout(1500); await r.selectOption(''); await p.waitForTimeout(800); });
st('Click an alert to see the evidence: the impact in rupees, the change per piece, and each component before and after, with its rate source, rate, freight and exchange rate.', async (p, h, clear) => { const row = p.locator('tbody tr').filter({ hasText: 'Menthol' }).first(); await h(row); await row.click(); await clear(); await p.waitForTimeout(2200); });
st('Acknowledge an alert once it is handled, or snooze it for seven or thirty days. Open the costing runs the same costing in the explorer, where Explain change breaks the move down.', async (p, h, clear) => { const b = p.getByRole('button', { name: /Acknowledge/ }).last(); await h(b); await b.click(); await clear(); await p.waitForTimeout(1200); await h(p.getByRole('link', { name: 'Open the costing' })); await p.waitForTimeout(1200); await clear(); await p.getByRole('button', { name: 'Close', exact: true }).click(); });
st('Watch items decide what is watched. Planners and Admins create them, and the list shows the open alerts and the last run of each.', async (p, h) => { const t = p.getByRole('radio', { name: 'Watch items' }); await h(t); await t.click(); await p.waitForTimeout(1500); });
st('A watch item has the finished goods and plants, the quantity basis, an optional plan for the planned volume, the rate priority and costing settings, the thresholds, and who gets the morning email digest.', async (p, h) => { const b = p.getByRole('button', { name: /New watch item/ }); await h(b); await b.click(); await p.waitForTimeout(700); await p.getByPlaceholder(/Navratna oils/).fill('Pain balms - Kolkata'); await p.getByPlaceholder('FG1001 FG1002').fill('FG3001 FG3002'); await p.getByPlaceholder('1000 1100').fill('1000'); await p.getByText(/^Thresholds/).click(); await p.waitForTimeout(1800); });
st('Save it, and press Run now to test it straight away. An alert is emailed again only after seven days, or when it gets twenty five percent worse, so the digest stays short.', async (p, h) => { await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(1000); const r = p.getByTitle('Run now').first(); await h(r); await r.click(); await p.waitForTimeout(1500); });
st('Admins see the run log and the digest log: each SAP run with its time, lines and alerts, and each email that went out.', async (p, h) => { const t = p.getByRole('radio', { name: 'Admin' }); await h(t); await t.click(); await p.waitForTimeout(2200); });

ch('12. Wrap-up');
st('That completes the tour. Open the Tutorial at any time, use Explain change or Ask whenever you need help understanding a cost, and let the cost watch tell you each morning what moved.', async (p) => { await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000); });

// TUTORIAL_ONLY=11 rehearses one chapter (from the start page) without re-recording the rest.
if (process.env.TUTORIAL_ONLY) {
  const keep = []; let on = false;
  for (const s of steps) { if (s.chapter) on = s.chapter.startsWith(`${process.env.TUTORIAL_ONLY}.`); if (on) keep.push(s); }
  steps.splice(0, steps.length, ...keep);
}

/* ======================= narration ======================= */
const VOICE = 'Rishi';
let n = 0;
for (const s of steps) {
  if (!s.text) continue;
  s.audio = `${OUT}/n${String(n++).padStart(3, '0')}.aiff`;
  // macOS say can hang now and then: give each clip a minute and retry
  for (let k = 0; ; k++) {
    try { execFileSync('say', ['-v', VOICE, '-r', '178', '-o', s.audio, s.text], { timeout: 60000 }); break; } catch (e) { if (k >= 2) throw e; }
  }
  const info = execFileSync('afinfo', [s.audio]).toString();
  s.dur = Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 4);
}
console.log('narration', steps.filter((s) => s.text).reduce((a, s) => a + s.dur, 0).toFixed(0), 's');

/* ======================= recording ======================= */
const b = await chromium.launch({ executablePath: EX });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } }, acceptDownloads: true });
await ctx.route('**/me/cost-watch/**', watchRoute);
await ctx.route('**/access/me**', (r) => r.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role: 'Planner' }] } }));
await ctx.addInitScript(() => { localStorage.setItem('emami_apps_user_email', 'trainer@emamigroup.com'); localStorage.setItem('emami_apps_session_token', 't'); });
const p = await ctx.newPage();
const t0 = Date.now();
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });

const overlay = async (chapter, text) => p.evaluate(([chapter, text]) => {
  let o = document.getElementById('tut-cap');
  if (!o) {
    o = document.createElement('div'); o.id = 'tut-cap';
    o.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:1080px;width:calc(100% - 80px);background:rgba(20,16,48,.92);color:#fff;border-radius:14px;padding:12px 18px;font:500 17px/1.45 system-ui,sans-serif;z-index:2147483647;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    document.body.appendChild(o);
  }
  o.innerHTML = `<div style="font:700 11px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#b9b0ff;margin-bottom:3px">${chapter}</div>${text}`;
}, [chapter, text]);
const ring = async (loc) => {
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 2500 });
    const bb = await loc.boundingBox({ timeout: 2500 });
    if (!bb) return;
    await p.evaluate((bb) => {
      let r = document.getElementById('tut-ring');
      if (!r) { r = document.createElement('div'); r.id = 'tut-ring'; document.body.appendChild(r); }
      r.style.cssText = `position:fixed;left:${bb.x - 6}px;top:${bb.y - 6}px;width:${bb.width + 12}px;height:${bb.height + 12}px;border:3px solid #ff3d7f;border-radius:12px;box-shadow:0 0 0 4000px rgba(10,8,30,.18);z-index:2147483646;pointer-events:none;transition:all .25s`;
    }, bb);
    await p.waitForTimeout(500);
  } catch { /* element not found: keep going */ }
};
const clearRing = () => p.evaluate(() => document.getElementById('tut-ring')?.remove()).catch(() => {});

const timings = []; const failures = [];
let chapter = '';
for (const s of steps) {
  if (s.chapter) { chapter = s.chapter; timings.push({ chapter, at: (Date.now() - t0) / 1000 }); continue; }
  const at = (Date.now() - t0) / 1000;
  await overlay(chapter, s.text).catch(() => {});
  const start = Date.now();
  try { await s.action(p, ring, clearRing); } catch (e) { failures.push(`${chapter} | ${s.text.slice(0, 60)}: ${e.message.split('\n')[0]}`); }
  await overlay(chapter, s.text).catch(() => {}); // pages may have navigated
  const spent = (Date.now() - start) / 1000;
  const rest = Math.max(0.6, s.dur + 0.7 - spent);
  await p.waitForTimeout(rest * 1000);
  await clearRing();
  timings.push({ text: s.text, audio: s.audio, at, dur: s.dur, end: (Date.now() - t0) / 1000 });
}
await p.waitForTimeout(800);
const vpath = await p.video().path();
await ctx.close(); await b.close();
fs.copyFileSync(vpath, `${OUT}/video.webm`);
fs.writeFileSync(`${OUT}/timings.json`, JSON.stringify(timings, null, 1));
console.log('failures:', failures.length ? failures : 'none');
console.log('length', ((Date.now() - t0) / 1000).toFixed(0), 's');
