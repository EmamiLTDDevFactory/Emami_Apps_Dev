export type PkgStatus = 'D' | 'C' | 'S' | 'F' | 'X';
export type EditLevel = 'R' | 'Z' | 'P';
export type EditRule = 'S' | 'P' | 'A';
export type PkgActionName = 'CREATE' | 'EDIT' | 'REVERT' | 'RECALC' | 'COPY' | 'SUBMIT' | 'FINALIZE' | 'DELETE' | 'REOPEN';

export interface PkgScen {
  ScenId: string; Descr: string; BudgetVersion: number; Status: string; ValidFrom: string; ValidTo: string; BudgetYear: string; KeyDate: string;
  Werks: string; Prio: string; Norm: string; BaseScenId: string; CreatedBy: string; FinalBy: string;
}

/** Header row (Idnrk = '') and component row (Idnrk set) share one entity set. */
export interface PkgItem {
  ScenId: string; Matnr: string; Idnrk: string; Maktx: string; Mtart: string; Matkl: string; RateSrc: string;
  BasicRateSap: number; BasicRateUsed: number; BudgetRateSap: number; BudgetRate: number; Variance: number; VariancePct: number;
  Waers: string; Peinh: number; Meins: string; MsgFlags: string;
  PctSap: number; PctUsed: number; ZbudSap: number; ZbudUsed: number; CompBaseRate: number; CompBudRate: number;
  /** Header rows only: origin group, ZBUD material, freight (per base unit, group currency), landed rate and group value. */
  OriginGrp: string; ZbudMatnr: string; AltBomUsed: string; GroupCurr: string; GroupValue: number;
  FrtCond1: string; FrtCond2: string; FrtCond3: string; FrtCond4: string; FrtRate1: number; FrtRate2: number; FrtRate3: number; FrtRate4: number;
  FrtTotal: number; FrtCurr: string; LandedRate: number; LandedCurr: string;
  /** Purchase history (12 months to the key date, same source as Raw Material Load History), summed over plants */
  NetQty: number; NetValue: number;
  /** Main plant of the material (the plant with the highest net quantity) */
  Werks: string;
}

export interface PkgOvr {
  ScenId: string; OvrDate: string; OvrTime: string; OvrUser: string; Level: string; Matnr: string; Matkl: string; Idnrk: string; Rule: string; OldValue: string; NewValue: string;
}

export interface PkgGroup { head: PkgItem; comps: PkgItem[] }

export interface PkgActionBody {
  action: PkgActionName; scenId?: string;
  werks?: string; descr?: string; validFrom?: string; validTo?: string; keyDate?: string; budgetVersion?: number | string;
  mtartSel?: string; matklSel?: string; matnrSel?: string; prio?: string; norm?: string;
  level?: EditLevel; rule?: EditRule; value?: string; scopeMatnr?: string; scopeMatkl?: string; scopeIdnrk?: string;
}
export interface PkgResult { ScenId: string; Msg: string; RowsZcomp: number; RowsZcompn: number; RowsSkip: number }

export interface NewScenarioForm {
  werks: string; descr: string; validFrom: string; validTo: string; keyDate: string; budgetVersion: string;
  mtart: string[]; matkl: string; matnr: string; prio: string[]; norm: boolean;
}
