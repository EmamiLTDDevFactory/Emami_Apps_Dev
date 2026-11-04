/**
 * MOCK of the SAP "MDM : Workflow Maintenance" > View Visibility table.
 *
 * In live mode the backend decides which views each level sees and whether it may change
 * them; the portal only asks `getViewVisibility(materialType, level)` in lib/service.ts.
 * The rows below copy Material_view_MDM.docx (material type FERT) so the demo behaves like
 * SAP today. Replace this file with the backend call – the screens do not change.
 *
 * Row shape expected from the backend (one row per material type, level and view):
 *   materialType  MTART, e.g. FERT
 *   level         0 = initiator (Normal view), 1..7 = reviewer level (Preliminary view)
 *   view          portal view id (see lib/materialViews.ts; SAP view name in brackets below)
 *   readOnly      true = display only ("Rea..." column), false = the level may change it
 */
import { ViewId } from './types';

export interface ViewVisibilityRow {
  materialType: string;
  level: number;
  view: ViewId;
  readOnly: boolean;
}

type Row = [level: number, view: ViewId, readOnly: boolean];

const ALL: ViewId[] = [
  'basic', 'salesOrg1', 'salesTax', 'salesOrg2', 'salesPlant', 'ftExport', 'purchasing', 'workSched', 'ftImport',
  'mrp1', 'mrp2', 'mrp3', 'mrp4', 'forecast', 'storage1', 'storage2', 'wm1', 'wm2', 'quality',
  'acct1', 'acct2', 'costing1', 'costing2', 'text',
];

const FG_ROWS: Row[] = [
  // Initiator: fills only the key data screen; sees Basic Data and Material Descriptions/Text for information
  [0, 'basic', true], // BASIC DATA 1 / BASIC DATA 2 (MARA_B...)
  [0, 'text', true], // MATERIAL DESCRIPTIONS (MAKT_DE...)

  // L1 Sales Team – all open for input
  [1, 'basic', false], // BASIC DATA 1
  [1, 'storage1', false], // GENERAL PLANT DATA / STORAGE (MARA_PL...)
  [1, 'salesPlant', false], // SALES: GENERAL/PLANT DATA (MARC_GEN)
  [1, 'mrp1', false], // MRP 1
  [1, 'mrp2', false], // MRP 2
  [1, 'salesOrg1', false], // SALES: SALES ORG. DATA 1 (MVKE_S...)
  [1, 'salesTax', false], // SALES TAX
  [1, 'salesOrg2', false], // SALES: SALES ORG. DATA 2

  // L2 Sales Team CRS – review only
  [2, 'basic', true],
  [2, 'salesPlant', true],
  [2, 'salesOrg1', true],
  [2, 'salesTax', true],
  [2, 'salesOrg2', true],

  // L3 Legal Team
  [3, 'ftExport', false], // FOREIGN TRADE: EXPORT DATA (MARC_FT...)
  [3, 'ftImport', false], // FOREIGN TRADE: IMPORT DATA

  // L4 Quality Team
  [4, 'basic', false],
  [4, 'costing1', false], // COSTING 1 (MARC_C...)
  [4, 'mrp1', false],
  [4, 'mrp2', false],
  [4, 'mrp3', false],
  [4, 'mrp4', false],
  [4, 'purchasing', false], // PURCHASING (MARC_P...)
  [4, 'acct1', false], // ACCOUNTING 1 (MBEW_A...)
  [4, 'acct2', false], // ACCOUNTING 2
  [4, 'costing2', false], // COSTING 2 (MBEW_C...)
  [4, 'quality', false], // QUALITY MANAGEMENT (QMAT_QM)
  [4, 'text', false], // TEXT (BASIC, PURCHASING, ...)
  [4, 'workSched', false], // WORK SCHEDULE (WORK_S...)

  // L5 Supply Chain
  [5, 'basic', false],

  // L6 CQA Team
  [6, 'storage1', false], // GENERAL PLANT DATA / STORAGE
  [6, 'mrp1', false],

  // L7 Approver MDM Team – sees every view, changes only Foreign Trade Export
  ...ALL.map((v): Row => [7, v, v !== 'ftExport']),
];

/** FERT, FRT2 and WIP share the same workflow and the same visibility (demo) */
export const VIEW_VISIBILITY: ViewVisibilityRow[] = ['FERT', 'FRT2', 'WIP'].flatMap((materialType) =>
  FG_ROWS.map(([level, view, readOnly]) => ({ materialType, level, view, readOnly })),
);
