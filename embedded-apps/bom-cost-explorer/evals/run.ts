/**
 * Runs evals/golden.json against the REAL model (ANTHROPIC_API_KEY) and the mock SAP. Reports the pass rate.
 *   npm run eval            (AI_EVAL_MODEL to override the model, default claude-sonnet-5-5)
 * A case passes when: the numbers rule holds (no template), every expected tool was called, refusals call no SAP tool,
 * expect_contains / expect_not_contains hold, and the confirm answer is honoured.
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
process.env.MOCK_SAP = 'true';
process.env.MOCK_SAP_DELAY_MS = '0';

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('Set ANTHROPIC_API_KEY to run the evals.'); process.exit(2); }
  const { ask, newConversation } = await import('../src/lib/ai/assistant');
  const { api } = await import('../src/lib/client/api');
  const { defaultQuery } = await import('../src/lib/query/schema');
  const { clearAiResults } = await import('../src/lib/ai/tools/registry');
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
  const client = new Anthropic({ apiKey: key });
  const model = process.env.AI_EVAL_MODEL || 'claude-sonnet-5-5';
  const q = { ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'], inclBudget: true, budgetYr: 2026 };
  let pass = 0; let run = 0;
  for (const c of golden.cases) {
    if (c.skip) { console.log(`- ${c.id} skipped: ${c.skip}`); continue; }
    run++;
    clearAiResults();
    const result = c.current ? await api.cost(q) : null;
    if (result && c.inject_maktx) result.rows.forEach((r) => { r.Maktx = c.inject_maktx; });
    const r = await ask({ client, model, conv: newConversation(), question: c.question, system: 'NGD', user: 'eval', current: result ? { query: q, result } : null, confirm: async () => c.confirm !== false });
    const text = r.answer.paragraphs.map((p) => p.text).join(' ');
    const called = r.tools.map((t) => t.name);
    const problems: string[] = [];
    if (r.template) problems.push('template used (numbers rule failed)');
    for (const t of c.expect_tools) if (!called.includes(t)) problems.push(`tool ${t} not called`);
    if (c.refuse && called.some((t) => ['run_costing', 'compare_plants'].includes(t))) problems.push('ran SAP on a refusal case');
    for (const s of c.expect_contains ?? []) if (!text.toLowerCase().includes(String(s).toLowerCase())) problems.push(`missing "${s}"`);
    for (const s of c.expect_not_contains ?? []) if (text.includes(s)) problems.push(`contains "${s}"`);
    if (!problems.length) pass++;
    console.log(`${problems.length ? 'x' : '✓'} ${c.id} ${c.question}${problems.length ? `  -> ${problems.join('; ')}` : ''}`);
  }
  const rate = run ? pass / run : 0;
  console.log(`\nPass rate ${(rate * 100).toFixed(1)}% (${pass}/${run}), target ${(golden.target_pass_rate * 100).toFixed(0)}%.`);
  process.exit(rate >= golden.target_pass_rate ? 0 : 1);
}
void main();
