/**
 * Plant authorisation. The SAP service user can see every plant, so the BFF enforces what each
 * person may cost: the plants come from the session token (hub claim, or PLANT_ACCESS at sign-in)
 * and are checked on EVERY request and on every row SAP sends back.
 */
export const ALL = '*';

function accessMap(): Record<string, string[]> {
  try {
    const raw = JSON.parse(process.env.PLANT_ACCESS || '{}') as Record<string, string[] | string>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim().toUpperCase()).filter(Boolean);
    return out;
  } catch {
    console.error('[auth] PLANT_ACCESS is not valid JSON - nobody gets any plant.');
    return {};
  }
}

export function plantsForEmail(email: string): string[] {
  const m = accessMap();
  return m[email.toLowerCase()] ?? m[ALL] ?? [];
}

export const hasAll = (allowed: readonly string[]) => allowed.includes(ALL);
export const plantAllowed = (allowed: readonly string[], plant: string) => hasAll(allowed) || allowed.includes(plant.toUpperCase());

/** Plants in the request the user may not use (empty = all fine). */
export function forbiddenPlants(allowed: readonly string[], requested: readonly string[]): string[] {
  if (hasAll(allowed)) return [];
  return Array.from(new Set(requested.filter((p) => p && !plantAllowed(allowed, p))));
}
