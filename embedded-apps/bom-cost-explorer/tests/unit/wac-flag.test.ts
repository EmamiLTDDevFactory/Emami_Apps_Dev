import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WAC_ENABLED, WAC_RECON_WARN_PCT, wacNavVisible } from '@/lib/wac/flag';
import { WAC_SET } from '@/lib/wac/fields';
import { ENTITY_SET } from '@/lib/sap/entities';

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('feature flag', () => {
  it('is off by default, and so is the nav item (for an Admin too)', () => {
    expect(WAC_ENABLED).toBe(false);
    expect(WAC_RECON_WARN_PCT).toBe(2);
    expect(wacNavVisible(WAC_ENABLED, true)).toBe(false);
    expect(wacNavVisible(true, false)).toBe(false); // admin only
    expect(wacNavVisible(true, true)).toBe(true);
  });
  it('flag off: the route imports the screen only when on, the nav item makes no request, nothing shared was renamed', () => {
    expect(src('src/app/actual/page.tsx')).toMatch(/process\.env\.NEXT_PUBLIC_WAC_ENABLED === 'true' \? dynamic\(\(\) => import\('@\/components\/wac\/ActualVsSources'\)/);
    expect(src('src/components/Shell.tsx')).toMatch(/if \(\(WAC_ENABLED \|\| CK_ENABLED \|\| COGM_SO_ENABLED\) && email\) void fetchIsAdmin/);
    expect(Object.values(ENTITY_SET)).not.toContain('WacRowSet'); // the shared entity-set map is untouched
    expect(WAC_SET).toEqual({ ROWS: 'WacRowSet', COMPARE: 'WacCompareSet', COMP: 'WacCompSet', DOCS: 'WacDocSet' });
  });
  it('the WAC screen is the only place that calls fetchWac on its own (no existing screen imports lib/wac)', () => {
    for (const f of ['src/components/Explorer.tsx', 'src/components/freight/FreightCompare.tsx', 'src/lib/client/api.ts', 'src/lib/sap/service.ts']) expect(src(f)).not.toMatch(/lib\/wac/);
  });
});
