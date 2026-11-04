import { StatusCode, User } from './types';

/**
 * Demo copy of the workflow configuration (WF_DEF, WF_LVL, WF_ROLE, USR_DEP).
 * In live mode these come from SAP at run time; the front end keeps no copy.
 * Levels follow Material_view_MDM.docx (material type FERT).
 */
export interface LevelDef {
  level: number;
  team: string;
  department: string;
  /** Last level: approval posts the material */
  final?: boolean;
}

/** Which views each level sees and maintains comes from the backend (getViewVisibility in lib/service.ts) */
export const LEVELS: LevelDef[] = [
  { level: 1, team: 'Sales Team', department: 'SALES' },
  { level: 2, team: 'Sales Team CRS', department: 'SALES_CRS' },
  { level: 3, team: 'Legal Team', department: 'LEGAL' },
  { level: 4, team: 'Quality Team', department: 'QUALITY' },
  { level: 5, team: 'Supply Chain', department: 'SCM' },
  { level: 6, team: 'CQA Team', department: 'CQA' },
  { level: 7, team: 'Approver MDM Team', department: 'MDM', final: true },
];

export const levelDef = (level: number) => LEVELS.find((l) => l.level === level);

/** Workflow definition per material type. FERT, FRT2 and WIP share the same 7-level flow. */
const FG_CREATE = { id: 'WF_FG_CREATE', levels: [1, 2, 3, 4, 5, 6, 7] };
export const WORKFLOW_DEFS: Record<string, { id: string; levels: number[] }> = {
  FERT: FG_CREATE,
  FRT2: FG_CREATE,
  WIP: FG_CREATE,
};
export const WORKFLOW_TYPES = Object.keys(WORKFLOW_DEFS);

/**
 * Where a resubmitted request goes after a send back.
 * "routing exactly as today" – to confirm with the functional owners.
 */
export const RESUBMIT_TO: 'FIRST_LEVEL' | 'SENDING_LEVEL' = 'FIRST_LEVEL';

export const USERS: User[] = [
  { id: 'RSHARMA', name: 'Rahul Sharma', department: 'Initiator', level: null },
  { id: 'NKAPOOR', name: 'Neha Kapoor', department: 'Sales Team', level: 1 },
  { id: 'VRAO', name: 'Vikram Rao', department: 'Sales Team CRS', level: 2 },
  { id: 'SIYER', name: 'Sunita Iyer', department: 'Legal Team', level: 3 },
  { id: 'AMENON', name: 'Arjun Menon', department: 'Quality Team', level: 4 },
  { id: 'KREDDY', name: 'Kavya Reddy', department: 'Supply Chain', level: 5 },
  { id: 'IKHAN', name: 'Imran Khan', department: 'CQA Team', level: 6 },
  { id: 'AMEHTA', name: 'Anil Mehta', department: 'Approver MDM Team', level: 7 },
];

export const userById = (id: string) => USERS.find((u) => u.id === id);
export const userName = (id: string) => userById(id)?.name ?? id;

export const STATUS: Record<StatusCode, { label: string; cls: string }> = {
  '00': { label: 'Draft', cls: 'badge-neutral' },
  '01': { label: 'In approval', cls: 'badge-info' },
  '02': { label: 'Sent back', cls: 'badge-warn' },
  '03': { label: 'Rejected', cls: 'badge-error' },
  '04': { label: 'Forwarded', cls: 'badge-forward' },
  '05': { label: 'Approved and posted', cls: 'badge-success' },
};

export const APPS = [
  { id: 'MC', label: 'Create material', phase: 'Built now', enabled: true },
  { id: 'MX', label: 'Change material', phase: 'Phase 2', enabled: false },
  { id: 'ME', label: 'Extend material', phase: 'Phase 2', enabled: false },
] as const;
