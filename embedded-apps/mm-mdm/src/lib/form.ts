import formDefinition from '@/data/form_definition.json';
import type { FieldControl, FieldFlags } from './types';

export interface FieldMeta {
  entity: string;
  name: string;
  prop: string;
  label: string;
  type: string;
  len: number;
  dec: number;
  de: string;
  domain: string;
  check: string;
  conv: string;
  refTable: string;
  refField: string;
  fixed: Array<{ v: string; t: string }>;
  key: boolean;
}

export interface ViewDef {
  id: string;
  title: string;
  entity: string;
  multi: boolean;
  fields: string[];
}

interface FormDefinition {
  types: string[];
  views: ViewDef[];
  fields: Record<string, FieldMeta>;
  layout: Record<string, Record<string, Array<[string, number, number, number, string, string]>>>;
}

export const FORM = formDefinition as unknown as FormDefinition;

export const HD_MEANS_SHOWN = (process.env.NEXT_PUBLIC_HD_MEANS_SHOWN ?? 'true') !== 'false';

// Fields that the generic mandatory check never reports (customisation in /INOWITS/CL_WD_DYNAMIC_TOOL)
export const MANDATORY_EXCLUDED = new Set(['PLIFZ', 'STCD4']);

export const ENTITY_SINGLE = ['Material', 'Description', 'Plant', 'SalesOrg', 'Valuation', 'StorageLocation', 'WarehouseData', 'StorageTypeData', 'EanData', 'ForecastParameter'];
export const ENTITY_MULTI = ['UnitOfMeasure', 'TaxClassification', 'SalesTaxData', 'InspectionType', 'ClassCharacteristic', 'ProductionVersion', 'ConsumptionData', 'LongText'];

export function viewById(id: string): ViewDef | undefined {
  return FORM.views.find((v) => v.id === id);
}

export function fieldMeta(key: string): FieldMeta | undefined {
  return FORM.fields[key];
}

/** Field control from the static form definition (mock mode, and fallback while SAP is not connected). */
export function staticFieldControl(materialType: string): FieldControl {
  const out: FieldControl = {};
  const lay = FORM.layout[materialType] ?? FORM.layout[FORM.types[0]] ?? {};
  for (const view of FORM.views) {
    const rows = lay[view.id];
    if (rows && rows.length) {
      out[view.id] = rows.map(([field, hd, dsply, rqr, col, src]) => ({
        field,
        shown: HD_MEANS_SHOWN ? hd === 1 || src === 'none' : hd === 0,
        displayOnly: dsply === 1,
        required: rqr === 1,
        column: (col as FieldFlags['column']) ?? '',
        source: (src as FieldFlags['source']) ?? 'none'
      }));
    } else {
      out[view.id] = view.fields.map((field) => ({ field, shown: true, displayOnly: false, required: false, column: '', source: 'none' as const }));
    }
  }
  return out;
}

export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}
