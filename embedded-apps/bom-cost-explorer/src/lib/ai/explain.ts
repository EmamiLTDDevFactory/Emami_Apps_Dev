/**
 * Cost-change explainer: variance result -> FACTS (every number the model may use) -> model narrative under the
 * numbers rule, or the deterministic template (no model) when there is no key, the call fails or validation fails twice.
 */
import { D } from '../cost/decimal';
import { FactBook } from './facts';
import { answerFromFacts, type AiClient, type FactsAnswer } from './gateway';
import { EXPLAINER_SYSTEM } from './prompts/explainer';
import type { AiAnswer } from './validate';
import type { ExplainResult, EffectType } from './variance';

export interface ExplainContext { sku: string; headtxt: string; plant: string; baselineLabel: string; currentLabel: string; system: string }

export interface ExplainFacts { book: FactBook; ids: { total0: string; total1: string; delta: string; pct?: string; effects: Partial<Record<EffectType, string>>; drivers: { idnrk: string; id: string; label: string }[]; unexplained?: string } }

export function explainFacts(r: ExplainResult, c: ExplainContext): ExplainFacts {
  const b = new FactBook();
  const src = 'explain_change';
  const ids: ExplainFacts['ids'] = {
    total0: b.add(`Cost per piece, ${c.baselineLabel}`, r.total0, { unit: 'INR/pc', source: `${src}.total0` }),
    total1: b.add(`Cost per piece, ${c.currentLabel}`, r.total1, { unit: 'INR/pc', source: `${src}.total1` }),
    delta: b.add('Total change per piece', r.delta, { unit: 'INR/pc', source: `${src}.delta` }),
    effects: {},
    drivers: [],
  };
  if (r.deltaPct) ids.pct = b.add('Total change in percent', r.deltaPct, { unit: '%', source: `${src}.deltaPct` });
  for (const [t, v] of Object.entries(r.effects) as [EffectType, ReturnType<typeof D>][]) {
    if (!v.isZero()) ids.effects[t] = b.add(`${t} effect per piece`, v, { unit: 'INR/pc', source: `${src}.effects.${t}` });
  }
  for (const d of r.topDrivers) {
    const what = d.kind === 'new' ? 'new component' : d.kind === 'removed' ? 'removed component' : d.kind === 'unit changed' ? 'unit changed' : d.label ?? 'change';
    const sw = d.source0 !== d.source1 && d.kind === 'changed' ? ` (${d.source0 || 'no rate'} to ${d.source1 || 'no rate'})` : '';
    ids.drivers.push({ idnrk: d.idnrk, label: `${what}${sw}`, id: b.add(`Change from component ${d.idnrk}: ${what}${sw}`, d.delta, { unit: 'INR/pc', source: `${src}.byComponent.${d.idnrk}` }) });
  }
  if (r.unexplained.abs().gt(D('0.01'))) ids.unexplained = b.add('Unexplained remainder per piece', r.unexplained, { unit: 'INR/pc', source: `${src}.unexplained` });
  b.add('New components', r.newComponents.length, { unit: 'count', source: `${src}.newComponents` });
  b.add('Removed components', r.removedComponents.length, { unit: 'count', source: `${src}.removedComponents` });
  b.add('Source switches', r.sourceSwitches.length, { unit: 'count', source: `${src}.sourceSwitches` });
  return { book: b, ids };
}

/** Plain sentences from the facts, without any model. */
export function explainTemplate(r: ExplainResult, f: ExplainFacts, c: ExplainContext): AiAnswer {
  const d = (id: string) => f.book.get(id)!.display;
  const dir = r.delta.gt(0) ? 'went up' : r.delta.lt(0) ? 'went down' : 'did not change';
  const paragraphs: AiAnswer['paragraphs'] = [];
  if (r.warnings.length) paragraphs.push({ text: `Note: ${r.warnings.join(' ')}`, facts: [] });
  paragraphs.push({
    text: `The cost per piece of ${c.sku} ${dir}${r.delta.isZero() ? '' : ` by ${d(f.ids.delta).replace('-', '')} INR [${f.ids.delta}]`}${f.ids.pct ? ` (${d(f.ids.pct).replace('-', '')} [${f.ids.pct}])` : ''}, from ${d(f.ids.total0)} INR [${f.ids.total0}] to ${d(f.ids.total1)} INR [${f.ids.total1}].`,
    facts: [f.ids.delta, f.ids.total0, f.ids.total1, ...(f.ids.pct ? [f.ids.pct] : [])],
  });
  const eff = Object.entries(f.ids.effects).sort((a, b) => D(f.book.get(b[1]!)!.value).abs().cmp(D(f.book.get(a[1]!)!.value).abs()));
  if (eff.length) paragraphs.push({ text: `By effect: ${eff.map(([t, id]) => `${t} ${d(id!)} INR [${id}]`).join('; ')}.`, facts: eff.map(([, id]) => id!) });
  if (f.ids.drivers.length) paragraphs.push({ text: `Biggest drivers: ${f.ids.drivers.slice(0, 5).map((x) => `${x.idnrk} (${x.label}) ${d(x.id)} INR [${x.id}]`).join('; ')}.`, facts: f.ids.drivers.slice(0, 5).map((x) => x.id) });
  if (f.ids.unexplained) paragraphs.push({ text: `Unexplained remainder: ${d(f.ids.unexplained)} INR [${f.ids.unexplained}].`, facts: [f.ids.unexplained] });
  const checks: AiAnswer['paragraphs'] = [];
  if (r.sourceSwitches.length) checks.push({ text: `Check the rate source switches with procurement (${r.sourceSwitches.slice(0, 3).map((x) => x.idnrk).join(', ')}).`, facts: [] });
  if (r.unitChanges.length) checks.push({ text: `Check the unit changes with master data (${r.unitChanges.map((x) => x.idnrk).join(', ')}).`, facts: [] });
  if (r.newComponents.length || r.removedComponents.length) checks.push({ text: 'Check the BOM changes with planning.', facts: [] });
  return { paragraphs, checks };
}

export async function explainWithModel(client: AiClient | null, model: string, r: ExplainResult, c: ExplainContext, user: string): Promise<FactsAnswer & { facts: ExplainFacts }> {
  const facts = explainFacts(r, c);
  const template = () => explainTemplate(r, facts, c);
  if (!client) return { answer: template(), template: true, validatorOk: false, attempts: 0, usage: { input: 0, output: 0 }, facts, error: 'No Grok API key: showing the template. Add a key in AI settings for a written explanation.' };
  const task = `Explain the cost change of ${c.sku} (${c.headtxt}) in plant ${c.plant}, ${c.baselineLabel} versus ${c.currentLabel}. Warnings: ${r.warnings.length ? r.warnings.join(' ') : 'none'}.`;
  const res = await answerFromFacts({ client, model, system: EXPLAINER_SYSTEM, facts: facts.book.list(), task, template, ignore: [c.plant, c.sku], feature: 'explain', user, question: task, sapSystem: c.system });
  return { ...res, facts };
}
