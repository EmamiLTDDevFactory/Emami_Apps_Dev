/**
 * Plant-wide costing (implicit mode of the BOM costing screen): one plant, Materials left empty = every header material
 * of that plant, costed in batches with no time limit. Off unless PLANT_WIDE_ENABLED / NEXT_PUBLIC_PLANT_WIDE_ENABLED
 * is true at build time; off = the screen behaves exactly as before.
 */
import type { CostQuery } from '../query/schema';

const env = (v: string | undefined) => (v ?? '').trim();
const int = (v: string | undefined, d: number) => { const n = Math.trunc(Number(env(v))); return Number.isFinite(n) && env(v) !== '' ? n : d; };

export interface PlantWideSettings {
  enabled: boolean;
  /** MaterialVHSet answers at most this many rows per call; exactly this many may mean a cut list. */
  vhCap: number;
  /** Headers per costing request (SAP accepts at most 50). */
  batch: number;
  mtart: string[];
  concurrency: number;
  /** 0 = no confirmation; above 0 a plain confirm button when more headers than this are found. */
  confirmAbove: number;
}

export function plantWideSettings(e: Record<string, string | undefined> = {
  enabled: process.env.NEXT_PUBLIC_PLANT_WIDE_ENABLED,
  vhCap: process.env.NEXT_PUBLIC_VH_CAP,
  batch: process.env.NEXT_PUBLIC_PLANT_WIDE_BATCH,
  mtart: process.env.NEXT_PUBLIC_PLANT_WIDE_MTART,
  concurrency: process.env.NEXT_PUBLIC_PLANT_WIDE_MAX_CONCURRENCY,
  confirmAbove: process.env.NEXT_PUBLIC_PLANT_WIDE_CONFIRM_ABOVE,
}): PlantWideSettings {
  const mtart = env(e.mtart || 'FERT').split(',').map((m) => m.trim().toUpperCase()).filter(Boolean);
  return {
    enabled: env(e.enabled).toLowerCase() === 'true',
    vhCap: Math.max(1, int(e.vhCap, 500)),
    batch: Math.min(50, Math.max(1, int(e.batch, 25))),
    mtart: mtart.length ? mtart : ['FERT'],
    concurrency: Math.max(1, int(e.concurrency, 1)),
    confirmAbove: Math.max(0, int(e.confirmAbove, 0)),
  };
}

export const PLANT_WIDE = plantWideSettings();
export const PLANT_WIDE_ENABLED = PLANT_WIDE.enabled;

type Trigger = Pick<CostQuery, 'mode' | 'materials' | 'plants'>;

/** The mode is active only with the flag on, BOM costing, exactly one plant and Materials empty. */
export const isPlantWide = (q: Trigger, enabled = PLANT_WIDE_ENABLED) => enabled && q.mode === 'B' && q.materials.length === 0 && q.plants.length === 1;

/** Flag on, Materials empty, several plants: Run stays disabled with a hint. */
export const needsOnePlant = (q: Trigger, enabled = PLANT_WIDE_ENABLED) => enabled && q.mode === 'B' && q.materials.length === 0 && q.plants.length > 1;
