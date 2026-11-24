/* Generated from docs/metadata.live.xml (ZCAPEX_PORTAL_SRV on EDS, 2026-11-24). Do not edit by hand.
 * SAP OData V2 JSON: Edm.Decimal and Edm.Int64 arrive as strings, Edm.DateTime as "/Date(ms)/" strings, ABAP flags as "X" or "". */

/** key: Budgetid */
export interface Budget {
  Budgetid: string;
  IsCommonpool: string;
  MetricsOn: string;
  PlantName: string;
  CategoryText: string;
  Fiscalyear: string;
  AmtAvailable: string;
  Title: string;
  Capextype: string;
  CurrLevel: string;
  Category: string;
  DaysPending: number;
  AmtApproved: string;
  Doaid: string;
  AmtCommitted: string;
  SubmittedByName: string;
  AmtSpent: string;
  ExpectedBenefit: string;
  Werks: string;
  Waers: string;
  Status: string;
  Aufnr: string;
  SubmittedBy: string;
  SubmittedOn: string;
  ApprovedOn: string;
  Justification: string;
  Investment: string;
  HurdleRate: string;
  Irr: string;
  Npv: string;
  Payback: string;
  FundingSrc: string;
  SrcAufnr: string;
  CreatedBy: string;
  CreatedOn: string;
  CreatedAt: string;
  ChangedBy: string;
  ChangedOn: string;
  ChangedAt: string;
  BudgetToCashFlows?: unknown;
  BudgetToCPEs?: unknown;
  BudgetToItems?: unknown;
}

/** key: Budgetid, Yearnr */
export interface BudgetCashFlow {
  Budgetid: string;
  Yearnr: string;
  Amount: string;
  Waers: string;
}

/** key: Cpeid */
export interface CPE {
  BudgetTitle: string;
  TechCompliant: string;
  SingleVendJust: string;
  Banfn: string;
  IsQuota: string;
  Cpeid: string;
  MetricsOn: string;
  Budgetid: string;
  RolloutFlag: string;
  Fiscalyear: string;
  PlantName: string;
  Title: string;
  CategoryText: string;
  Werks: string;
  Capextype: string;
  DaysPending: number;
  Category: string;
  SlaState: string;
  Amount: string;
  TechBy: string;
  TechOn: string;
  Waers: string;
  Status: string;
  CurrLevel: string;
  HurdleRate: string;
  Investment: string;
  Specs: string;
  Irr: string;
  Terms: string;
  DeliveryWeeks: number;
  Npv: string;
  Payback: string;
  PoolBudgetid: string;
  TechRemark: string;
  PoolAmount: string;
  SelVendor: string;
  BlockReason: string;
  Nonl1Justif: string;
  Doaid: string;
  SavingVsL1: string;
  SubmittedBy: string;
  SubmittedOn: string;
  ApprovedOn: string;
  CreatedBy: string;
  CreatedByName: string;
  CreatedOn: string;
  CreatedAt: string;
  ChangedBy: string;
  ChangedOn: string;
  CPEToVendors?: unknown;
  CPEToCashFlows?: unknown;
  CPEToDocuments?: unknown;
  CPEToApprovalSteps?: unknown;
  CPEToCWIP?: unknown;
  CPEToBudget?: unknown;
}

/** key: Cpeid, Vendorseq */
export interface Vendor {
  Cpeid: string;
  Quality: number;
  GstCompliant: string;
  Selected: string;
  Vendorseq: string;
  Ranking: string;
  Lifnr: string;
  Vendorname: string;
  QuoteAmt: string;
  Totalcost: string;
  Waers: string;
  DeliveryDays: number;
  WarrantyMon: string;
}

/** key: Doctype, Docid, Docseq */
export interface Document {
  Doctype: string;
  DocTitle: string;
  SizeText: string;
  Note: string;
  Docid: string;
  CategoryText: string;
  UploadedByName: string;
  Docseq: string;
  Filename: string;
  Category: string;
  Mimetype: string;
  Filesize: number;
  UploadedBy: string;
  UploadedOn: string;
}

/** key: Cyclenr, Doctype, Docid, Levelnr */
export interface ApprovalStep {
  IsCurrent: string;
  Cyclenr: string;
  Escalated: string;
  Doctype: string;
  IsAuto: string;
  ApproverName: string;
  Rollout: string;
  Docid: string;
  Levelnr: string;
  Role: string;
  Approver: string;
  ActualAppr: string;
  Status: string;
  SlaDays: number;
  ReachedOn: string;
  ActedOn: string;
  DueOn: string;
  Comments: string;
}

/** key: Cwipid */
export interface CWIP {
  Budgetid: string;
  Cwipid: string;
  Cpeid: string;
  PlantName: string;
  Aufnr: string;
  Title: string;
  Ebeln: string;
  Werks: string;
  Amount: string;
  CreatedBy: string;
  CreatedOn: string;
  Waers: string;
  Status: string;
  Pspnr: string;
  Anlkl: string;
  PaymentTerms: string;
  TimeframeWks: number;
  ExecProcess: string;
  Kostl: string;
  Prctr: string;
  Remarks: string;
  CWIPToPOs?: unknown;
}

/** key: Ebeln */
export interface PurchaseOrder {
  Ebeln: string;
  GrnPosted: string;
  PlantName: string;
  Cpeid: string;
  Zterm: string;
  Cwipid: string;
  Lifnr: string;
  Vendorname: string;
  Title: string;
  Werks: string;
  Amount: string;
  Waers: string;
  Status: string;
  IssuedOn: string;
  ExpDelivery: string;
  PaymentTerms: string;
  GrnValue: string;
  Inco1: string;
  Inco2: string;
  PurchaseOrderToGRNs?: unknown;
}

/** key: Mblnr, Mjahr, Zeile */
export interface GRN {
  Ebelp: string;
  Mblnr: string;
  Mjahr: string;
  Zeile: string;
  Ebeln: string;
  Title: string;
  Werks: string;
  Matnr: string;
  Qty: string;
  Meins: string;
  Value: string;
  Waers: string;
  PostedOn: string;
  Status: string;
}

/** key: Icid */
export interface InstallCert {
  TechSignoff: string;
  Cwipid: string;
  Icid: string;
  Cpeid: string;
  PlantName: string;
  Anlkl: string;
  Ebeln: string;
  Kostl: string;
  Mblnr: string;
  CurrLevel: string;
  Title: string;
  Anln2: string;
  Werks: string;
  CommissionDt: string;
  PhotoCount: number;
  CreatedBy: string;
  Status: string;
  CreatedOn: string;
  EquipCost: string;
  FreightCost: string;
  InstallCost: string;
  TotalCost: string;
  Waers: string;
  TechSignDt: string;
  Remarks: string;
  Anln1: string;
  CapitalizedOn: string;
  InstallCertToPhotos?: unknown;
}

/** key: Cwipid */
export interface CwipAgeing {
  Cwipid: string;
  PlantName: string;
  Cpeid: string;
  CreatedOn: string;
  AgeDays: number;
  Title: string;
  AgeingBucket: string;
  Werks: string;
  Amount: string;
  Icid: string;
  IcStatus: string;
  Waers: string;
  Risk: string;
  Status: string;
}

/** key: Quotaid */
export interface QuotaItem {
  Quotaid: string;
  PlantName: string;
  Werks: string;
  CurrLevel: string;
  Fiscalyear: string;
  CreatedByName: string;
  Title: string;
  ApprovedByName: string;
  Amount: string;
  Waers: string;
  Status: string;
  Justification: string;
  CreatedBy: string;
  CreatedOn: string;
  ApprovedBy: string;
  ApprovedOn: string;
}

/** key: Werks, Fiscalyear */
export interface QuotaSummary {
  PlantName: string;
  Used: string;
  Werks: string;
  Fiscalyear: string;
  Reserved: string;
  Itemcount: number;
  Yearcap: string;
  Singlecap: string;
  Waers: string;
  Remaining: string;
}

/** key: Doaid */
export interface DoaRule {
  CapextypeText: string;
  Active: string;
  Doaid: string;
  Capextype: string;
  AmountTo: string;
  AmountFrom: string;
  Waers: string;
  RangeText: string;
  ValidFrom: string;
  ValidTo: string;
  DoaRuleToChain?: unknown;
}

/** key: Doaid, Seqnr */
export interface DoaChain {
  ApproverName: string;
  Mandatory: string;
  Doaid: string;
  Seqnr: string;
  Role: string;
  Approver: string;
  SlaDays: number;
}

/** key: Auditid */
export interface AuditLog {
  Auditid: string;
  Username: string;
  Doctype: string;
  LogTs: string;
  Docid: string;
  Action: string;
  Comments: string;
  Userid: string;
  Role: string;
  LogDate: string;
  LogTime: string;
}

/** key: Notifid */
export interface Notification1 {
  Icon: string;
  ReadOn: string;
  IsRead: string;
  SentOn: string;
  SentAt: string;
  Notifid: string;
  Doctype: string;
  ParamName: string;
  Docid: string;
  ParamValue: string;
  SentTs: string;
  Title: string;
  Message: string;
  NotifType: string;
  Route: string;
}

/** key: Fiscalyear */
export interface DashboardKpi {
  TotalBudget: string;
  ApprovedCpe: string;
  Committed: string;
  Fiscalyear: string;
  Spent: string;
  Capitalized: string;
  Available: string;
  Waers: string;
  CwipPending: string;
  CwipAssets: number;
  CwipAvgAge: number;
  PendingCount: number;
  PendingValue: string;
  SlaBreachCount: number;
  CycleTimeDays: number;
  CycleTimeBefore: number;
  SavingsYtd: string;
}

/** key: Cpeid */
export interface ApprovalInbox {
  Cpeid: string;
  Doctype: string;
  Priority: string;
  Budgetid: string;
  PlantName: string;
  SubmittedByName: string;
  Title: string;
  ReachedOn: string;
  Werks: string;
  Capextype: string;
  DueOn: string;
  Category: string;
  DaysPending: number;
  Amount: string;
  SlaState: string;
  Waers: string;
  Status: string;
  CurrLevel: string;
  SubmittedBy: string;
  SubmittedOn: string;
}

/** key: Cpeid, Yearnr */
export interface CpeCashFlow {
  Cpeid: string;
  Yearnr: string;
  Amount: string;
  Waers: string;
}

/** key: Fiscalyear, Period */
export interface DashTrend {
  Fiscalyear: string;
  Period: string;
  MonthText: string;
  Committed: string;
  Spent: string;
  Waers: string;
}

/** key: Fiscalyear, Category */
export interface DashCategory {
  Fiscalyear: string;
  Category: string;
  CategoryText: string;
  Approved: string;
  Committed: string;
  Spent: string;
  Waers: string;
}

/** key: Domain, Keyval */
export interface ValueHelp {
  Domain: string;
  Keyval: string;
  Textval: string;
  Sortorder: string;
}

/** key: Userid */
export interface CurrentUser {
  Userid: string;
  IsAdmin: string;
  Fullname: string;
  IsGlobal: string;
  Email: string;
  Active: string;
  Role: string;
  Unit: string;
  Fiscalyear: string;
  UserToPlants?: unknown;
}

/** key: Userid, Werks */
export interface UserPlant {
  Userid: string;
  Werks: string;
  PlantName: string;
}

/** key: Param */
export interface Config {
  Param: string;
  Value: string;
}

/** key: Lifnr */
export interface Vend {
  Name1: string;
  Lifnr: string;
}

/** key: Budgetid, Itemno */
export interface BudgetItem {
  Budgetid: string;
  Itemno: string;
  ItemTitle: string;
  Amount: string;
  Waers: string;
  Remarks: string;
  CreatedBy: string;
  CreatedOn: string;
  CreatedAt: string;
  ChangedBy: string;
  ChangedOn: string;
  ChangedAt: string;
}

/** key: Doctype, Docid, Docseq */
export interface DocXfer {
  Doctype: string;
  Docid: string;
  Docseq: string;
  Category: string;
  Filename: string;
  DocTitle: string;
  Note: string;
  Mimetype: string;
  Content: string;
}
