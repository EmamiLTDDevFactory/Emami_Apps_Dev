import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

interface AxeViolation { id: string; impact: string | null; help: string; nodes: Array<{ target: unknown[]; html: string }> }
declare global { interface Window { axe: { run: (ctx: unknown, opts?: unknown) => Promise<{ violations: AxeViolation[] }> } } }

// axe-core is read once per worker process and injected as a string, not read from disk for every check
let axeSource: string | undefined;
const source = (): string => (axeSource ??= fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8'));

/**
 * Runs axe-core and fails on serious or critical violations. `region`: CSS selectors to check instead of the whole page
 * (for example the tab panel when only its content changed; the page chrome is covered by the page-level checks).
 */
export async function expectNoSeriousViolations(page: Page, label: string, region?: string[]): Promise<void> {
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.addScriptTag({ content: source() });
  const context = region ? { include: region.map((r) => [r]) } : { exclude: [['nextjs-portal']] };
  const result = await page.evaluate((c) => window.axe.run(c, { resultTypes: ['violations'] }), context);
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const text = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => `${JSON.stringify(n.target)} ${n.html.slice(0, 100)}`).join('\n   ')}`).join('\n');
  expect(bad.length, `${label}: accessibility violations\n${text}`).toBe(0);
}
