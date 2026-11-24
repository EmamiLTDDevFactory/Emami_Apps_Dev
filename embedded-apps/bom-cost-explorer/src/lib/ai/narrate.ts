/**
 * Facts-only narratives for the costing screens (MIS, bridge, Margin, Sales, Freight, data quality, budget rates ...).
 * A builder (lib/ai/builders) turns the figures on the screen into FACTS with deterministic code; Grok writes the words under the numbers rule
 * (lib/ai/validate.ts); with no key, an error or two failed checks the deterministic template is shown instead. Read-only: nothing is sent to SAP.
 * The latest narrative of each feature is kept in this tab (session storage) for the monthly review pack.
 */
import { answerFromFacts, makeClient, type FactsAnswer } from './gateway';
import { getApiKey, getModels, hasAiAccess } from './config';
import { NARRATOR_SYSTEM } from './prompts/narrator';
import type { Fact, FactBook } from './facts';
import type { AiAnswer } from './validate';

export interface NarrateSpec {
  /** key of the feature: 'mis', 'bridge', 'margin', 'sales', 'freight', 'dataquality', 'costing', 'budgetrate' ... */
  feature: string;
  title: string;
  facts: FactBook;
  /** what to write about (the facts carry every number) */
  task: string;
  /** deterministic text from the facts: used without a key and when the model fails */
  template: () => AiAnswer;
  /** words that look like numbers but are codes (plants, materials) */
  ignore?: string[];
  /** extra system text for this feature */
  system?: string;
}
export interface Narrative { spec: NarrateSpec; result: FactsAnswer; at: string }

/** Plain sentences from facts: "label: display unit [F1]", for the template. */
export function listTemplate(intro: string, facts: Fact[], max = 14): AiAnswer {
  return { paragraphs: [{ text: intro, facts: [] }, ...facts.slice(0, max).map((f) => ({ text: `${f.label}: ${f.display}${f.unit && f.unit !== '%' && !f.display.endsWith('lakh') ? ` ${f.unit}` : ''} [${f.id}]`, facts: [f.id] }))] };
}

/** Numbers inside the LABELS of the facts (a brand called "7 Oil", a pack of 100 ml) are names, not figures: the numbers rule must not ask for a fact for them. */
export const ignoreFor = (spec: NarrateSpec): string[] => Array.from(new Set([...(spec.ignore ?? []), ...spec.facts.list().flatMap((f) => f.label.match(/\d+(?:[.,]\d+)*/g) ?? [])]));

export async function narrate(spec: NarrateSpec, ctx: { user: string; system: string }): Promise<Narrative> {
  const facts = spec.facts.list();
  const template = spec.template;
  const at = new Date().toLocaleString('en-IN');
  let result: FactsAnswer;
  if (!hasAiAccess()) {
    result = { answer: template(), template: true, validatorOk: false, attempts: 0, usage: { input: 0, output: 0 }, error: 'No Grok API key: showing the plain summary. Add a key in AI settings for the written explanation.' };
  } else {
    result = await answerFromFacts({
      client: makeClient(getApiKey()), model: getModels().main, system: spec.system ? `${NARRATOR_SYSTEM}\n${spec.system}` : NARRATOR_SYSTEM, facts, task: spec.task, template,
      ignore: ignoreFor(spec), feature: spec.feature, user: ctx.user, question: spec.title, sapSystem: ctx.system,
    });
  }
  remember(spec, result, at);
  return { spec, result, at };
}

/* ---------- monthly review pack: the latest narrative of each feature, kept in this tab ---------- */
const PACK = 'bce:ai:pack';
export interface PackItem { feature: string; title: string; text: string; template: boolean; at: string }
const plain = (a: AiAnswer, byId: Map<string, Fact>) => {
  const clean = (t: string) => t.replace(/\s*\[F\d+\]/g, '');
  void byId;
  return [...a.paragraphs.map((p) => clean(p.text)), ...((a.checks ?? []).length ? ['What to check:', ...a.checks!.map((c) => `- ${clean(c.text)}`)] : [])].join('\n');
};
function remember(spec: NarrateSpec, r: FactsAnswer, at: string) {
  try {
    const list = JSON.parse(sessionStorage.getItem(PACK) || '[]') as PackItem[];
    const next = list.filter((x) => x.feature !== spec.feature);
    next.push({ feature: spec.feature, title: spec.title, text: plain(r.answer, new Map(spec.facts.list().map((f) => [f.id, f]))), template: r.template, at });
    sessionStorage.setItem(PACK, JSON.stringify(next));
  } catch { /* storage blocked: the pack just stays empty */ }
}
export const readPack = (): PackItem[] => { try { return JSON.parse(sessionStorage.getItem(PACK) || '[]'); } catch { return []; } };
export const clearPack = () => { try { sessionStorage.removeItem(PACK); } catch { /* ignore */ } };
export function packText(items: PackItem[], title = 'Costing review'): string {
  const head = `${title}\nPrepared ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} from the Costing Cockpit. Figures are SAP's; the wording is written by AI from those figures (marked "plain summary" when no AI text was available).\n`;
  return [head, ...items.map((i) => `${i.title}${i.template ? ' (plain summary)' : ''}\n${'-'.repeat(Math.min(60, i.title.length + 18))}\n${i.text}\n(as of ${i.at})`)].join('\n\n');
}
