/** Property names are the CDS / OData names (ZC_ATLBTL_EXP_SUMMARY, ZC_ATLBTL_EXP_DETAIL). */
export interface Amounts {
  CYYTDAmount: number;
  PYYTDAmount: number;
  CYPeriodAmount: number;
  PYPeriodAmount: number;
  CYvsPYVariance: number;
  OBAnnualAmount: number;
  RBAnnualAmount: number;
  OBYTDAmount: number;
  RBYTDAmount: number;
  CYvsRBYTDDeviation: number;
}

export interface SummaryRow extends Amounts {
  CompanyCode: string;
  ReportingKey: string;
  GLAccount: string;
  Site: string; // HO | UN
  GLAccountName: string;
  ReportHeader: string;
  ReportHeaderSequence: number;
  FSVItem: string;
  ProductGroup: string;
  SerialNo: string;
  ItemCategory: string;
  T1: string;
  ProductRange: string;
  T2: string;
  ProductType: string;
  T3: string;
  Product: string;
  MISHeading: string;
  VisibleInMIS: string;
  Currency: string;
  // Added by the backend
  HeaderGroup: string;
  HeaderLabel: string;
  SpendClass: 'ATL' | 'BTL' | 'OTHER' | 'UNMAPPED';
  InMIS: boolean;
  Medium: string;
  Unmapped: boolean;
  /** Budget-only row from an uploaded OB / RB version (no G/L, zero actuals). */
  IsBudget?: boolean;
}

export interface Sku {
  Material: string;
  SKUSize: string;
  Product: string;
  SkuGroupKey: string;
  BaseUnit: string;
  Season?: string;
}

export interface DetailRow extends SummaryRow {
  CostCenter: string;
  ProfitCenter: string;
  CostCenterType: string;
  CostCenterName: string;
  ControllingArea: string;
  MappingRule: string;
  LookupField: string;
  DerivedCostCenterNo: string;
  ProductHierarchy: string;
  SalesBrand: string;
  SkuGroupKey: string;
  to_NetSaleMaster?: Sku[];
  ExcludedBy?: number;
}

export interface ExclusionMeta { rules: number; cy: number; py: number; cyP?: number; lines: number; byRule: { id: number; dimension: string; reason: string; cy: number; py: number; lines: number }[] }

export interface Meta {
  source: 'sap' | 'mock';
  budget: 'sap' | 'mock' | 'upload';
  budgetVersions?: Record<string, { id: number; version: number; uploadedBy: string; uploadedAt: string; total: number }>;
  system: string;
  fy: string;
  period: number;
  company: string;
  exclusionsOn: boolean;
  /** Rows SAP (or the mock) returned for the period, before exclusions. */
  sourceRows?: number;
  exclusions?: ExclusionMeta;
  fetchedAt: string;
}

export interface GroupDef { id: string; label: string; cls: 'ATL' | 'BTL' | 'OTHER' | 'UNMAPPED'; mis: boolean; aliases?: string[] }
export interface Dimension { id: string; label: string; level: 'summary' | 'detail' }
export interface AppConfig {
  groups: GroupDef[];
  defaults: GroupDef[];
  totals: { id: string; label: string; of: string[]; includesUnmapped?: boolean }[];
  nonBrand: string[];
  classes: string[];
  buckets: string[];
  dimensions: Dimension[];
}

export interface Me { email: string; role: 'Admin' | 'User'; admin: boolean }

export interface Rule {
  id: number; dimension: string; values: string[]; pattern: string;
  fromFy: number; fromPeriod: number; toFy: number | null; toPeriod: number | null;
  reason: string; active: boolean; createdBy: string; createdAt: string; updatedBy: string | null; updatedAt: string | null;
}
export interface Impact { cy: number; py: number; lines: number; matched?: number }
export interface RuleWithImpact extends Rule { inForce: boolean; impact: Impact }
export interface Candidate { value: string; name: string; info: string; cy: number; py: number; lines: number; ruleIds: number[] }

export interface BudgetVersion { id: number; fy: number; kind: 'OB' | 'RB'; version: number; status: 'active' | 'superseded'; note: string | null; fileName: string | null; unit: string; phasing: string; lineCount: number; total: number; uploadedBy: string; uploadedAt: string; byHeader?: Record<string, number> }
export interface BudgetStatus { source: 'upload' | 'mock' | 'sap'; active: Partial<Record<'OB' | 'RB', BudgetVersion>>; versions: BudgetVersion[] }
export interface TemplateLine { key: string; company: string; header: string; headerLabel: string; site: string; category: string; range: string; brand: string; line: string; cy: number; py: number; annual: number | null; months: number[] | null }
export interface UploadRow { row: number; key: string; header: string; site?: string; company?: string; annual?: number | string | null; months?: (number | string | null)[]; labels?: { category?: string; range?: string; brand?: string; line?: string } }
export interface UploadResult {
  errors: { row: number; message: string }[]; errorCount: number; warnings: { row: number; message: string }[]; lineCount: number; skipped: number;
  totals: { total: number; byHeader: Record<string, number> }; phasing: string; previous: { version: number; total: number; byHeader: Record<string, number> } | null; saved: BudgetVersion | null;
}
export interface BudgetLine { companyCode: string; reportingKey: string; headerGroup: string; site: string; annual: number; months: number[]; labels: Record<string, string> }

export interface Mapping { groups: Record<string, { cls: string; mis: boolean }>; aliases: Record<string, string>; glMedia: Record<string, string> }
export interface MappingInfo {
  mapping: Mapping; config: AppConfig;
  headersSeen: { header: string; groupId: string; cls: string; cy: number }[];
  gls: { gl: string; name: string; groupId: string; header: string; bucket: string; defaultBucket: string; overridden: boolean; cy: number }[];
}
export interface AuditEntry { id: number; at: string; actor: string; action: string; detail: Record<string, unknown> }

export interface TrendMonth { period: number; cy: number; py: number; byGroup: Record<string, { cy: number; py: number }> }

export interface Bucket { key: string; cy: number; py: number; rows: number; name?: string; site?: string; type?: string; lookup?: string }
export interface Breakdown {
  bySite: Bucket[];
  byProfitCenter: Bucket[];
  byCostCenterType: Bucket[];
  byRule: Bucket[];
  byProductGroup: Bucket[];
  topCostCenters: Bucket[];
  unmapped: { cy: number; rows: number; byGroup: Bucket[] };
  reconciliation: { detailCy: number; summaryCy: number; difference: number; glTotal: number; excludedCy: number; glCheck: number; costCenters: number; lines: number };
  excludedByRule: Bucket[];
  meta: Meta;
}

export interface Filters {
  fy: string;
  period: number;
  company: string;
  site: string[]; // HO / UN
  groups: string[]; // HeaderGroup ids
  categories: string[]; // ItemCategory
  brands: string[]; // ProductRange (brand family)
  /** false = show the report without the exclusion rules (for checking). */
  excl: boolean;
}
