/**
 * Facts: every number the AI may state. Deterministic code (never the model) computes the values; each gets an id
 * F1, F2, ... that the model must write after the number ("up by 1.42 INR [F3]"). lib/ai/validate.ts checks it.
 *   { id, label, value (full precision string), display (formatted), unit, source: "<tool>.<path>", dp }
 */
import { D, type Decimal } from '../cost/decimal';
import { fmtNum } from '../format';

export interface Fact {
  id: string;
  label: string;
  value: string; // full precision
  display: string; // as the model should show it
  unit: string; // 'INR', 'INR/pc', '%', 'pcs', 'KG', 'count', ...
  source: string;
  dp: number;
}

export interface FactOptions { unit?: string; source: string; dp?: number }

export class FactBook {
  private facts: Fact[] = [];
  private byKey = new Map<string, string>();

  /** Adds a fact (same label + value + unit returns the existing id) and returns its id. */
  add(label: string, value: Decimal | string | number, o: FactOptions): string {
    const unit = o.unit ?? '';
    const dp = o.dp ?? (unit === '%' ? 2 : unit === 'count' || unit === 'pcs' ? 0 : 2);
    const v = D(value as string);
    const key = `${label}|${v.toString()}|${unit}`;
    const hit = this.byKey.get(key);
    if (hit) return hit;
    const id = `F${this.facts.length + 1}`;
    const display = unit === '%' ? `${v.toFixed(dp)}%` : fmtNum(v, dp, unit.startsWith('INR') ? 'INR' : 'X');
    this.facts.push({ id, label, value: v.toString(), display, unit, source: o.source, dp });
    this.byKey.set(key, id);
    return id;
  }

  list(): Fact[] { return [...this.facts]; }
  get(id: string): Fact | undefined { return this.facts.find((f) => f.id === id); }
  get size() { return this.facts.length; }

  /** Facts as the model receives them (no hidden fields). */
  forModel() { return this.facts.map(({ id, label, value, display, unit }) => ({ id, label, value, display, unit })); }
}

/** "[F3]" ids found in a text. */
export const citedIds = (text: string) => [...text.matchAll(/\[F(\d+)\]/g)].map((m) => `F${m[1]}`);
