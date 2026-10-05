/**
 * Material cost breakup categories (business rule, one place):
 *   Perfume = material type ROH and material group 106
 *   RM      = material type ROH (any other group)
 *   PM      = material type PKGN or VERP
 *   Other   = anything else costed as a leaf (services, trading goods...)
 */
import type { CostLine } from '../sap/fields';

export type CostCategory = 'RM' | 'PERFUME' | 'PM' | 'OTHER';
export const CATEGORIES: CostCategory[] = ['RM', 'PERFUME', 'PM', 'OTHER'];
export const CATEGORY_LABEL: Record<CostCategory, string> = { RM: 'RM', PERFUME: 'Perfume', PM: 'PM', OTHER: 'Other' };

const RM_TYPES = new Set(['ROH']);
const PM_TYPES = new Set(['PKGN', 'VERP']);
const PERFUME_GROUPS = new Set(['106']);

/** Material group as SAP stores it may carry leading zeros ("0106") - compare without them. */
const normGroup = (g: string) => g.trim().replace(/^0+(?=\d)/, '');

export function costCategory(r: Pick<CostLine, 'Mtart' | 'Matkl'>): CostCategory {
  const type = (r.Mtart || '').trim().toUpperCase();
  if (RM_TYPES.has(type)) return PERFUME_GROUPS.has(normGroup(r.Matkl || '')) ? 'PERFUME' : 'RM';
  if (PM_TYPES.has(type)) return 'PM';
  return 'OTHER';
}
