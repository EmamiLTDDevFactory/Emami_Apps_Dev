/**
 * Client of the RULES admin area (SAP class ZCL_MM_MDM_ADM_RULES) through the hub: default-value rules engine maintenance,
 * the runtime test (EvaluateRules) and the field control versions. Always live; an error carries SAP's own messages.
 */
import { adminCall } from './adminApi';

export interface RuleApp { app: string; text: string; screenCount: number; setCount: number }
export interface RuleScreen { fgroup: string; app: string; screen: string; screenDesc: string; setCount: number }
export interface RuleSetRow {
  ruleSetId: string; fgroup: string; app: string; screen: string; screenDesc: string; description: string; filterValue: string;
  ruleCount: number; itemCount: number; outputField: string;
}
/** One row of a rule: Input (I) = condition, Output (R) = value to default */
export interface RuleItem {
  ruleId: string; datele: string; value: string; condition: string; ftype: 'I' | 'R' | string; dateleDesc: string; ptype: string; isDefault: boolean;
}
export interface RuleSetDetail { ruleSetId: string; fgroup: string; app: string; screen: string; description: string; filterValue: string; items: RuleItem[] }
export interface FieldHelpRow { datele: string; text: string; source: 'CONFIG' | 'DICT' | string }
export interface DuplicateRow { ruleId: string; dupRuleSetId: string; dupRuleId: string; ruleSetDesc: string; datele: string; value: string; ftype: string; dateleDesc: string }
export interface EvalResult { field: string; value: string; ruleSetId: string; ruleId: string; ruleSetDesc: string; overridable: boolean; marker: string; conflict: boolean }

export interface FieldVersion { vrsn: string; rows: number }
export interface FieldType { mtart: string; text: string; activeVersion: string; versions: FieldVersion[] }
export interface FieldView { view: string; label: string; headings: number; fields: number; visible: number; required: number; displayOnly: number }
export interface FieldRow { cnt: string; view: string; field: string; dname: string; text: string; visible: boolean; required: boolean; displayOnly: boolean; col: string; heading: boolean }
export interface FieldChange { cnt: string; visible: boolean; required: boolean; displayOnly: boolean }
export interface DeptOverride { appType: string; level: string; dept: string; mtart: string; field: string; displayOnly: boolean; required: boolean }
export interface UserDept { user: string; dept: string }

const call = <T>(op: string, payload: Record<string, unknown> = {}) => adminCall<T>('RULES', op, payload);

export const rulesApi = {
  apps: () => call<{ apps: RuleApp[] }>('Apps').then((r) => r.apps),
  screens: (app: string) => call<{ screens: RuleScreen[] }>('Screens', { app }).then((r) => r.screens),
  sets: (fgroup: string) => call<{ sets: RuleSetRow[] }>('Sets', { fgroup }).then((r) => r.sets),
  getSet: (ruleSetId: string) => call<RuleSetDetail>('GetSet', { ruleSetId }),
  saveSet: (p: { ruleSetId?: string; app: string; fgroup: string; description: string; filterValue: string }) =>
    call<{ ruleSetId: string; created: boolean; message: string }>('SaveSet', p),
  deleteSet: (ruleSetId: string) => call<{ message: string; itemsDeleted: number }>('DeleteSet', { ruleSetId }),
  saveRules: (ruleSetId: string, items: RuleItem[]) => call<{ rules: number; items: number; message: string }>('SaveRules', { ruleSetId, items }),
  deleteRule: (ruleSetId: string, ruleId: string) => call<{ message: string }>('DeleteRule', { ruleSetId, ruleId }),
  validate: (ruleSetId: string, items?: RuleItem[]) =>
    call<{ duplicates: DuplicateRow[]; message: string }>('Validate', { ruleSetId, ...(items ? { items } : {}) }),
  fieldHelp: (app: string, screen: string, q: string) => call<{ fields: FieldHelpRow[] }>('FieldHelp', { app, screen, q }).then((r) => r.fields),
  evaluate: (app: string, values: { field: string; value: string }[], screen = '') =>
    call<{ setsEvaluated: number; results: EvalResult[] }>('Evaluate', { app, screen, values }),

  fieldTypes: () => call<{ types: FieldType[] }>('FieldTypes').then((r) => r.types),
  fieldViews: (mtart: string, vrsn: string) => call<{ vrsn: string; views: FieldView[] }>('FieldViews', { mtart, vrsn }),
  fieldRows: (mtart: string, vrsn: string, view: string) => call<{ vrsn: string; rows: FieldRow[] }>('FieldRows', { mtart, vrsn, view }),
  publishField: (mtart: string, changes: FieldChange[]) =>
    call<{ previousVersion: string; newVersion: string; rowsChanged: number; message: string }>('PublishField', { mtart, changes }),
  deleteFieldVersion: (mtart: string, vrsn: string) => call<{ message: string }>('DeleteFieldVersion', { mtart, vrsn }),
  overrides: () => call<{ overrides: DeptOverride[]; userDepartments: UserDept[] }>('Overrides'),
};
