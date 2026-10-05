import type { EdmTime } from "./odata";

/** Entity "Action" of ZQM_SLED_APPROVAL_SRV (fields used by the UI). */
export interface ActionEntity {
  __metadata?: { id?: string; uri?: string; type?: string };
  InspectLot?: string;
  Plant?: string;
  StorageLoc?: string;
  Matnr?: string;
  Batch?: string;
  MatDesc?: string;
  VendName?: string;
  GrnQty?: string | number;
  GrnDate?: Date | null;
  ManfuctDate?: Date | null;
  ActSledDate?: Date | null;
  ApprName?: string;
  ApprDate?: Date | null;
  ApprTime?: EdmTime | string | null;
  Status?: string;
  RejRes?: string;
  [key: string]: any;
}

/** Entity "User" of ZQM_SLED_APPROVAL_SRV, read with $expand=NAV_UserToAction */
export interface UserEntity {
  Flag?: string;
  NAV_UserToAction?: { results: ActionEntity[] };
  [key: string]: any;
}

export interface Kpi {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}
