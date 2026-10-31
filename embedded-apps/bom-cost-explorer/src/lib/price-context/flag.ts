/** Price context (MRP, selling price, standard cost next to the rate sources on the existing screens). Off by default. */
export const PRICE_CONTEXT_ENABLED = String(process.env.NEXT_PUBLIC_PRICE_CONTEXT_ENABLED ?? 'false').toLowerCase() === 'true';
export const adminOnlyNav = (enabled: boolean, isAdmin: boolean): boolean => enabled && isAdmin;
