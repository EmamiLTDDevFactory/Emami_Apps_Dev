/**
 * Rigid packing cost of finished goods (RigidSet Mode 'G'): per FG piece, from the last saved ZRIGID rates of its rigid packing items. Best effort and additive: every failure
 * (set not published, no saved rate, timeout) leaves the screen exactly as it was (no column, no message). Read-only.
 */
import Decimal from 'decimal.js';
import { fetchRigid } from './service';
import type { RigidRow } from './fields';
import { dd, strip0 } from './model';

export interface FgRigidItem { comp: string; compTxt: string; qty: Decimal; landed1000: Decimal; resin1000: Decimal; conv1000: Decimal; validFrom: string | null; validTo: string | null; mould: string; lifnr: string; flag: string }
export interface FgRigid { matnr: string; werks: string; perPc: Decimal; resin: Decimal; conv: Decimal; other: Decimal; items: number; flag: string; list: FgRigidItem[] }

export function parseFgRigid(rows: RigidRow[]): Map<string, FgRigid> {
  const m = new Map<string, FgRigid>();
  for (const r of rows) if (r.Grain === 'G') {
    const perPc = dd(r.LandRate), resin = dd(r.MatCost), conv = dd(r.ConvCost);
    m.set(strip0(r.Matnr), { matnr: strip0(r.Matnr), werks: r.Werks, perPc, resin, conv, other: perPc.minus(resin).minus(conv), items: r.Nmould, flag: r.Flag, list: [] });
  }
  for (const r of rows) if (r.Grain === 'R') m.get(strip0(r.Matnr))?.list.push({ comp: strip0(r.Comp), compTxt: r.CompTxt, qty: dd(r.CompQty), landed1000: dd(r.LandRate), resin1000: dd(r.MatCost), conv1000: dd(r.ConvCost), validFrom: r.ValidFrom, validTo: r.ValidTo, mould: strip0(r.Mould), lifnr: strip0(r.Lifnr), flag: r.Flag });
  return m;
}

/** Reads the finished goods in chunks of 25 per plant, calling onPart after each chunk. Never throws. */
export async function loadFgRigid(fgs: { matnr: string; werks: string }[], onPart: (m: Map<string, FgRigid>) => void, signal?: AbortSignal): Promise<void> {
  const byPlant = new Map<string, string[]>();
  for (const f of fgs) { const w = (f.werks || '').trim().toUpperCase(); if (!w || !f.matnr) continue; const l = byPlant.get(w) ?? []; if (!l.includes(strip0(f.matnr))) l.push(strip0(f.matnr)); byPlant.set(w, l); }
  const all = new Map<string, FgRigid>();
  for (const [werks, list] of byPlant) {
    for (let i = 0; i < list.length; i += 25) {
      if (signal?.aborted) return;
      try {
        const r = await fetchRigid({ matnr: list.slice(i, i + 25), werks, mode: 'G' }, signal);
        for (const [k, v] of parseFgRigid(r.rows)) all.set(`${werks}|${k}`, v);
        onPart(new Map(all));
      } catch { /* additive: a failed chunk only leaves those finished goods without the column */ }
    }
  }
}
