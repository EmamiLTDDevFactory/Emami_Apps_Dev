/**
 * THE single place SAP entity set names live (property names: fields.ts). Verify both against the
 * live service with `npm run check:metadata`.
 */
export const SERVICE = 'ZMM_BOM_COST_SRV';

export const ENTITY_SET = {
  COST_LINES: 'CostLineSet',
  RATES: 'RateRowSet',
  FREIGHT: 'FreightRowSet',
  RMPM: 'RmPmRowSet',
  PLANTS: 'PlantVHSet',
  MATERIALS: 'MaterialVHSet',
  CONFIG: 'ConfigItemSet',
} as const;

export type EntitySetKey = keyof typeof ENTITY_SET;

/** Must equal the navigation property name on CostLineSet's entity type in $metadata. The rate
 * option entity is NOT addressable on its own: only ever reached via $expand on CostLineSet. */
export const NAV_RATE_OPTIONS = 'RateOptions';

export const MODE_TO_ENTITY = {
  B: ENTITY_SET.COST_LINES, // BOM costing
  C: ENTITY_SET.COST_LINES, // plant comparison (same set, Mode filter = 'C')
  R: ENTITY_SET.RATES,
  F: ENTITY_SET.FREIGHT,
  M: ENTITY_SET.RMPM,
} as const;

/** Same as MODE_TO_ENTITY, as ENTITY_SET keys (for per-set field lookups in fields.ts). */
export const MODE_TO_SET_KEY = { B: 'COST_LINES', C: 'COST_LINES', R: 'RATES', F: 'FREIGHT', M: 'RMPM' } as const satisfies Record<keyof typeof MODE_TO_ENTITY, EntitySetKey>;

/** Sets driven by the selection ($filter) properties; Matnr and Werks are mandatory on each. */
export const SELECTION_SETS = ['COST_LINES', 'RATES', 'FREIGHT', 'RMPM'] as const satisfies readonly EntitySetKey[];
