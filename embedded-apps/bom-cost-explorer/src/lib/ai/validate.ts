/**
 * The numbers rule. Every number in an AI answer must match a cited fact (an id written in the paragraph, or listed in
 * its `facts`) within the rounding of the decimals shown. The model never calculates.
 *
 * Recognised numbers: integers and decimals, Indian (1,23,456.78) and Western (123,456.78) grouping, negatives (- or −),
 * percentages, ranges (1.2-1.5, 1.2 to 1.5: both ends checked), "1.4 lakh", "2 crore", "3.5 thousand".
 * Ignored: fact ids [F3], years (1900-2100 written without decimals), dates (14.10.2026, 2026-10-14, 14/10/2026, 14 Oct 2026),
 * times (06:00), plant codes and material numbers (passed in `ignore`, or words like FG1001 / 100003292 - an integer of
 * 7+ digits without grouping), and numbers glued to letters (H2, R1, Q3, ZFR1).
 * Match: |stated - fact| <= half a unit of the last decimal shown (a multiplier scales it); signs are compared as
 * magnitudes, so "down by 1.42 [F3]" matches F3 = -1.42.
 */
import { D, type Decimal } from '../cost/decimal';
import { citedIds, type Fact } from './facts';

export interface Paragraph { text: string; facts?: string[] }
export interface AiAnswer { paragraphs: Paragraph[]; checks?: Paragraph[] }
export interface NumberHit { raw: string; value: Decimal; tolerance: Decimal; percent: boolean; index: number }
export interface ValidationError { paragraph: number; number: string; reason: string }
export interface ValidationResult { ok: boolean; errors: ValidationError[]; checked: number }

const MULT: Record<string, number> = { thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7 };

/** Strips what must never count as a number. */
function blank(text: string, ignore: string[]): string {
  let t = text.replace(/\[F\d+\]/g, (m) => ' '.repeat(m.length));
  const kill = (re: RegExp) => { t = t.replace(re, (m) => ' '.repeat(m.length)); };
  kill(/\b\d{1,2}([./-])\d{1,2}\1\d{2,4}\b/g); // 14.10.2026, 14/10/26 (same separator twice, so 1.20-1.50 stays a range)
  kill(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g); // ISO
  kill(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi);
  kill(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi);
  kill(/\b\d{1,2}:\d{2}(:\d{2})?\b/g); // times
  kill(/\b[A-Za-z]+\d+[A-Za-z\d]*\b/g); // FG1001, H2, ZFR1, BD10
  kill(/\b\d+[A-Za-z][A-Za-z\d]*\b/g); // 1000m, 2026a - glued codes (a unit after a space is kept)
  for (const w of ignore.filter(Boolean)) kill(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'));
  return t;
}

const NUM = /(?<![\d.,])([-−–]?)(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s*%)?(?:\s*(thousand|lakhs?|lacs?|crores?|cr)\b)?/gi;

export function extractNumbers(text: string, ignore: string[] = []): NumberHit[] {
  const t = blank(text, ignore);
  const out: NumberHit[] = [];
  for (const m of t.matchAll(NUM)) {
    const [raw, sign, body, pct, mult] = m;
    const plain = body.replace(/,/g, '');
    // years and long ids written without grouping
    if (!body.includes(',') && !body.includes('.') && !pct && !mult) {
      const n = Number(plain);
      if (plain.length === 4 && n >= 1900 && n <= 2100) continue;
      if (plain.length >= 7) continue;
    }
    const dec = plain.includes('.') ? plain.split('.')[1].length : 0;
    const k = mult ? MULT[mult.toLowerCase()] : 1;
    let value = D(plain).times(k);
    if (sign === '-' || sign === '−') value = value.neg();
    const tolerance = D(0.5).times(D(10).pow(-dec)).times(k);
    out.push({ raw: raw.trim(), value, tolerance, percent: !!pct, index: m.index ?? 0 });
  }
  return out;
}

/** True when the stated number matches the fact within the shown rounding (magnitudes compared). */
export function matches(hit: NumberHit, f: Fact): boolean {
  const fv = D(f.value).abs();
  const hv = hit.value.abs();
  if (hv.minus(fv).abs().lte(hit.tolerance)) return true;
  // the fact's own display rounding (e.g. fact 1.4237 shown as 1.42)
  const shown = D(fv.toFixed(f.dp));
  return hv.minus(shown).abs().lte(hit.tolerance);
}

export function validateParagraphs(paras: Paragraph[], facts: Fact[], ignore: string[] = [], offset = 0): ValidationError[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const errors: ValidationError[] = [];
  paras.forEach((p, i) => {
    const ids = [...new Set([...citedIds(p.text), ...(p.facts ?? [])])];
    for (const id of ids) if (!byId.has(id)) errors.push({ paragraph: i + offset, number: id, reason: `unknown fact id ${id}` });
    const cand = ids.map((id) => byId.get(id)).filter(Boolean) as Fact[];
    for (const hit of extractNumbers(p.text, ignore)) {
      if (!cand.some((f) => matches(hit, f))) {
        errors.push({ paragraph: i + offset, number: hit.raw, reason: cand.length ? 'no cited fact has this value' : 'number without a fact id' });
      }
    }
  });
  return errors;
}

export function validateAnswer(answer: AiAnswer, facts: Fact[], ignore: string[] = []): ValidationResult {
  const paras = answer.paragraphs ?? [];
  const checks = answer.checks ?? [];
  const errors = [...validateParagraphs(paras, facts, ignore), ...validateParagraphs(checks, facts, ignore, paras.length)];
  const checked = [...paras, ...checks].reduce((a, p) => a + extractNumbers(p.text, ignore).length, 0);
  return { ok: errors.length === 0, errors, checked };
}

/** Parses the model's JSON answer (tolerates a ```json fence); null when it is not the expected shape. */
export function parseAnswer(text: string): AiAnswer | null {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(s.slice(start, end + 1));
    if (Array.isArray(j?.paragraphs) && j.paragraphs.every((p: unknown) => typeof (p as Paragraph)?.text === 'string')) return j as AiAnswer;
    if (typeof j?.text === 'string') return { paragraphs: [{ text: j.text, facts: j.facts }] };
    return null;
  } catch {
    return null;
  }
}

/** The list of problems, for the one regeneration request. */
export const errorsForModel = (e: ValidationError[]) => e.map((x) => `- "${x.number}": ${x.reason}`).join('\n');
