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
}

export interface Meta {
  source: 'sap' | 'mock';
  budget: 'sap' | 'mock';
  system: string;
  fy: string;
  period: number;
  company: string;
  fetchedAt: string;
}

export interface GroupDef { id: string; label: string; cls: 'ATL' | 'BTL' | 'OTHER' | 'UNMAPPED'; mis: boolean }
export interface AppConfig {
  groups: GroupDef[];
  totals: { id: string; label: string; of: string[]; includesUnmapped?: boolean }[];
  nonBrand: string[];
}

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
  reconciliation: { detailCy: number; summaryCy: number; difference: number; costCenters: number; lines: number };
  meta: Meta;
}

export interface Filters {
  fy: string;
  period: number;
  company: string;
  site: string[]; // HO / UN
  groups: string[]; // HeaderGroup ids
  categories: string[]; // ItemCategory
  brands: string[]; // ProductType
}
