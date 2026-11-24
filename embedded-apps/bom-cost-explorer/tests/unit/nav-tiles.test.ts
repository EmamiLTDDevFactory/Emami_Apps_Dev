import { describe, expect, it } from 'vitest';
import { navSections, tileAllowed, tileOf } from '@/lib/nav/sections';

const flags = { wac: true, ck: true, so: true, psum: true, marginRole: 'Admin', budgetRole: 'Admin' };
const ids = (t: string[] | null) => navSections({ ...flags, tiles: t }).flatMap((s) => s.items.map((i) => i.id));

describe('screen limit (Manage Access tiles)', () => {
  it('maps margin and plan screens onto one id each', () => {
    expect(tileOf('margin-alerts')).toBe('margin');
    expect(tileOf('upload')).toBe('plan');
    expect(tileOf('mode-B')).toBe('mode-B');
  });
  it('null means no limit', () => {
    expect(tileAllowed(null, 'margin-data')).toBe(true);
    expect(ids(null)).toEqual(ids(undefined as unknown as null));
  });
  it('a list only keeps its screens and drops empty sections', () => {
    const sections = navSections({ ...flags, tiles: ['mode-B', 'freight'] });
    expect(sections.flatMap((s) => s.items.map((i) => i.id))).toEqual(['mode-B', 'freight']);
    expect(sections.map((s) => s.id)).toEqual(['costing', 'analysis']);
  });
  it('a margin tile keeps every margin screen', () => {
    expect(ids(['margin']).every((id) => id.startsWith('margin'))).toBe(true);
  });
});
