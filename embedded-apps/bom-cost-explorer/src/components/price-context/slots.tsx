'use client';
/**
 * The ONLY file of the price context the existing screens import. Each slot is a no-op that renders nothing extra when the flag is off:
 * the check is the literal `process.env.NEXT_PUBLIC_PRICE_CONTEXT_ENABLED === 'true'`, which the build replaces with a constant, so the
 * require() below is dropped and none of the price-context code reaches any existing bundle. With the flag on, the real components
 * are used. (One screen = one <PriceScope> over the finished goods it shows; <PriceStrip> / <PriceHeads> / <PriceCells> read from it.)
 */
import type { ReactNode } from 'react';
import type { Fg } from '@/lib/price-context/fgs';

type Impl = typeof import('./impl');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl: Impl | null = process.env.NEXT_PUBLIC_PRICE_CONTEXT_ENABLED === 'true' ? (require('./impl') as Impl) : null;

export function PriceScope({ materials, plants, children }: { materials: string[]; plants?: string[]; children: ReactNode }) {
  return impl ? <impl.PriceScope materials={materials} plants={plants}>{children}</impl.PriceScope> : <>{children}</>;
}
export function PriceStrip(p: { matnr: string; plant?: string; costCurr?: string; std?: { value: string; curr: string }; compact?: boolean }) {
  return impl ? <impl.PriceStrip {...p} /> : null;
}
export function PriceHeads({ className }: { className: string }) {
  return impl ? <impl.PriceHeads className={className} /> : null;
}
export function PriceBlank({ className }: { className: string }) {
  return impl ? <impl.PriceBlank className={className} /> : null;
}
export function PriceCells(p: { matnr: string; plant: string; className: string; costCurr?: string; std?: { value: string; curr: string }; costValue?: string }) {
  return impl ? <impl.PriceCells {...p} /> : null;
}
export function PriceContextProvider({ email, children }: { email: string; children: ReactNode }) {
  return impl ? <impl.PriceContextProvider email={email}>{children}</impl.PriceContextProvider> : <>{children}</>;
}
export function PriceContextBar() {
  return impl ? <impl.PriceContextBar /> : null;
}
export function FgStrips(p: { fgs: Fg[]; costCurr?: string }) {
  return impl ? <impl.FgStrips {...p} /> : null;
}
