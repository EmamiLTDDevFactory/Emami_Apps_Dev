/** The finished goods a screen shows, for the price strips. Only what is on screen: nothing more is ever priced. */
export interface Fg { matnr: string; plant: string; text: string }

export function fgsOfLines(lines: ReadonlyArray<{ Headmat: string; Hwerks: string; Headtxt: string }>): Fg[] {
  const m = new Map<string, Fg>();
  for (const l of lines) if (l.Headmat && !m.has(`${l.Hwerks}|${l.Headmat}`)) m.set(`${l.Hwerks}|${l.Headmat}`, { matnr: l.Headmat, plant: l.Hwerks, text: l.Headtxt });
  return [...m.values()];
}
/** Paged tables (freight, RM / PM) fetch their own rows: the finished goods of the selection are what they show. */
export function fgsOfSelection(materials: readonly string[], plants: readonly string[]): Fg[] {
  const out: Fg[] = [];
  for (const m of new Set(materials.map((x) => x.trim()).filter(Boolean))) out.push({ matnr: m, plant: plants.length === 1 ? plants[0] : '', text: '' });
  return out;
}
export const materialsOf = (fgs: Fg[]): string[] => Array.from(new Set(fgs.map((f) => f.matnr)));
