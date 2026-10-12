/**
 * Rate option rows from either SAP shape, flattened to one type. Names of the direct set live here;
 * the expanded navigation reuses RATE_OPTION from lib/sap/fields.ts (unchanged).
 *
 * direct:  RateOptionSet?$filter=<costing filter>  -> RATE_OPTION + the extra per-component fields below
 * expand:  CostLineSet?...&$expand=RateOptions      -> RATE_OPTION under each line; Cost / TotCost absent
 */
import { RATE_OPTION, type FieldKind, type RateOption } from '../sap/fields';

type FieldMap = Record<string, readonly [string, FieldKind]>;

export const RATE_OPTION_SET = 'RateOptionSet';

/** Extra properties only the direct set has. Selected / Haschild are ABAP char flags kept as text. */
export const RATE_OPTION_DIRECT: FieldMap = {
  ...RATE_OPTION,
  Cost: ['Cost', 'd'],
  FrtPcLoc: ['FrtPcLoc', 'd'],
  TotCostLoc: ['TotCostLoc', 'd'],
  TotCostInr: ['TotCostInr', 'd'],
  Selected: ['Selected', 's'],
  Haschild: ['Haschild', 's'],
  Idnrk: ['Idnrk', 's'],
  Maktx: ['Maktx', 's'],
  Mtart: ['Mtart', 's'],
  Meins: ['Meins', 's'],
  Level: ['Level', 'i'],
  ProdQty: ['ProdQty', 'd'],
  Vendor: ['Vendor', 's'],
  Vname: ['Vname', 's'],
};

/** Parent keys selected with $expand (the join key back to the cost line). */
export const EXPAND_PARENT: FieldMap = {
  Seqnr: ['Seqnr', 'i'],
  Hwerks: ['Hwerks', 's'],
  Headmat: ['Headmat', 's'],
};

/** One flat rate option. Direct-only fields are undefined when the options came from the expand. */
export type RateOptionRow = RateOption & {
  Cost?: string;
  FrtPcLoc?: string;
  TotCostLoc?: string;
  TotCostInr?: string;
  Selected?: string;
  Haschild?: string;
  Idnrk?: string;
  Maktx?: string;
  Mtart?: string;
  Meins?: string;
  Level?: number;
  ProdQty?: string;
  Vendor?: string;
  Vname?: string;
};

export const RATE_SOURCE_ORDER = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] as const;

/** Join key between an option and its cost line. */
export const optionKey = (o: { Seqnr: number; Hwerks: string; Headmat: string }) => `${o.Seqnr}|${o.Hwerks}|${o.Headmat}`;
