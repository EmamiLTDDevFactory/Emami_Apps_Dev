/**
 * Material views (tabs) for material types FERT, FRT2 and WIP, following the SAP
 * "Material Master : Initial Screen" (Web Dynpro) of the old app: every heading,
 * block and field in the same order.
 *
 * - Which level sees and maintains which view is NOT set here: it comes from the backend
 *   (View Visibility), see getViewVisibility in lib/service.ts and the mock lib/viewVisibility.ts.
 * - `ref` fields show a value maintained elsewhere (base unit, material group, ...),
 *   display-only, exactly like the greyed fields on the SAP screen.
 * - Value lists are MOCK data, to be replaced by SAP value helps.
 */
import { Opt, PLANTS } from './valueHelps';

export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea' | 'ref' | 'table' | 'attachments';

export interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'readonly';
  options?: Opt[];
  required?: boolean;
}

export interface FieldDef {
  key: string;
  label: string;
  tech: string;
  type: FieldType;
  options?: Opt[];
  required?: boolean;
  maxLength?: number;
  integer?: boolean;
  pattern?: { re: RegExp; text: string };
  /** Shown after the input, e.g. "Days" or "%" */
  unit?: string;
  /** Always display-only (calculated by SAP) */
  readOnly?: boolean;
  /** Table: column definitions; rows stored as JSON */
  columns?: ColumnDef[];
  /** Table: rows are given, only cells can change */
  fixedRows?: boolean;
  wide?: boolean;
}

export interface GroupDef {
  title: string;
  fields: FieldDef[];
}

export type ViewCategory = 'Basic' | 'Sales' | 'Foreign trade' | 'Purchasing' | 'Production and MRP' | 'Plant and storage' | 'Warehouse' | 'Quality' | 'Accounting and costing' | 'Texts';

export interface ViewDef {
  id: string;
  label: string;
  table: string;
  category: ViewCategory;
  /** Always part of the request (cannot be deselected) */
  mandatory?: boolean;
  groups: GroupDef[];
  /** Fields this view maintains (no ref / read-only fields), derived */
  fields: FieldDef[];
}

/* ------------------------------------------------------------------ */
/* Field helpers                                                        */
/* ------------------------------------------------------------------ */

const o = (pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));
type X = Partial<FieldDef>;
const T = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'text', ...x });
const N = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'number', ...x });
const D = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'date', ...x });
const C = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'checkbox', ...x });
const S = (key: string, label: string, tech: string, options: Opt[], x: X = {}): FieldDef => ({ key, label, tech, type: 'select', options, ...x });
const TA = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'textarea', wide: true, ...x });
/** Display of a value maintained in another view or on the key data screen */
const R = (key: string, label: string): FieldDef => ({ key, label, tech: '', type: 'ref' });

/* ------------------------------------------------------------------ */
/* Value lists (mock)                                                   */
/* ------------------------------------------------------------------ */

export const UOM = o([['PC', 'pieces'], ['EA', 'each'], ['CS', 'case'], ['KG', 'Kilogram'], ['G', 'Gram'], ['L', 'Litre'], ['ML', 'Millilitre']]);
const WEIGHT_UNITS = o([['KG', 'Kilogram'], ['G', 'Gram']]);
const VOLUME_UNITS = o([['L', 'Litre'], ['ML', 'Millilitre'], ['M3', 'Cubic metre']]);
const MATL_STATUS = o([['01', 'Blocked for procurement'], ['02', 'Blocked for production'], ['Z1', 'Phase-out']]);
const ITEM_CAT = o([['NORM', 'Standard item'], ['NOR', 'Standard item'], ['ERLA', 'Structure / main item'], ['LEIS', 'Service']]);
const EAN_CAT = o([['HE', 'Manufacturer EAN'], ['IE', 'In-store EAN']]);
const DIST_CHAINS = o([['00', 'Internal Distribution'], ['10', 'General Trade'], ['20', 'Modern Trade'], ['30', 'E-Commerce'], ['40', 'Export']]);
const TAX_CLASS = o([['0', 'Taxable under GST / exempt'], ['1', 'Taxable']]);
const STATS_GRP = o([['1', "'A' Material"], ['2', "'B' Material"], ['3', "'C' Material"]]);
const PRICING_GRP = o([['01', 'Standard'], ['02', 'Premium']]);
const REBATE_GRP = o([['01', 'Standard rebate'], ['02', 'Special rebate']]);
const ACCT_ASSIGN = o([['01', 'Domestic revenues'], ['02', 'Foreign revenues'], ['05', 'Finished Goods']]);
const REPLACEMENT = o([['', 'No'], ['A', 'Replacement part']]);
const DISCOUNT_KIND = o([['', 'Not eligible for discount in kind'], ['1', 'Eligible']]);
const AVAIL_CHECK = o([['02', 'Individual requirements'], ['KP', 'No check']]);
const TRANS_GRP = o([['0001', 'On pallets'], ['0002', 'In cartons']]);
const LOADING_GRP = o([['0001', 'Crane'], ['0002', 'Forklift'], ['0003', 'Manual']]);
export const PROFIT_CENTERS = o([['UN08', 'VAPI'], ['UN13', 'PANTNAGAR'], ['UN05', 'GUWAHATI']]);
const SERIAL_LEVEL = o([['', 'Serialization at stock level'], ['1', 'Serialization at equipment level']]);
const EXEMPT_CERT = o([['', 'Not Relevant'], ['A', 'Manufacturer declaration'], ['B', 'Supplier certificate']]);
const COUNTRIES = o([['IN', 'India'], ['AE', 'Utd.Arab Emir.'], ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['US', 'United States']]);
const REGIONS = o([['WB', 'West Bengal'], ['AS', 'Assam'], ['UK', 'Uttarakhand'], ['HP', 'Himachal Pradesh'], ['GJ', 'Gujarat']]);
const VAR_ORDER_UNIT = o([['', 'Not active'], ['1', 'Active']]);
export const PURCH_GROUPS = o([['001', 'Herbs & Extracts'], ['002', 'Chemicals & Oils'], ['003', 'Packaging']]);
const TAX_IND = o([['0', 'Material 0%'], ['1', 'Material 5%'], ['2', 'Material 18%']]);
const FREE_GOODS = o([['', 'Not eligible for free goods discount'], ['1', 'Eligible']]);
const SCHED_PROFILE = o([['PI01', 'Finished Product - UN13'], ['PI02', 'Semi-finished - UN13']]);
const MRP_TYPES = o([['PD', 'MRP'], ['VB', 'Reorder point'], ['ND', 'No planning']]);
export const MRP_CONTROLLERS = o([['001', 'PERSON 1'], ['002', 'PERSON 2'], ['003', 'PERSON 3']]);
const LOT_SIZES = o([['EX', 'Lot-for-lot order quantity'], ['FX', 'Fixed order quantity'], ['WB', 'Weekly lot size']]);
const ABC = o([['A', 'Important part'], ['B', 'Less important part'], ['C', 'Relatively unimportant']]);
const PROC_TYPES = o([['', 'No procurement'], ['E', 'In-house production'], ['F', 'External procurement'], ['X', 'Both procurement types']]);
const BATCH_ENTRY = o([['', 'Batch in goods receipt'], ['1', 'Batch at order release'], ['2', 'Batch at order creation']]);
const BACKFLUSH = o([['1', 'Always backflush'], ['2', 'Work center decides']]);
const JIT = o([['', 'No JIT'], ['1', 'JIT schedules']]);
const SAFETY_TIME = o([['', 'Ignore safety time'], ['1', 'For independent requirements'], ['2', 'For all requirements']]);
const SCHED_MARGIN = o([['000', 'No float'], ['001', 'Float 1 day']]);
const CALENDARS = o([['PCL', 'Planning Calendar'], ['MON', 'Monthly calendar']]);
const PERIOD_IND = o([['M', 'Monthly'], ['W', 'Weekly'], ['D', 'Daily'], ['P', 'Posting period']]);
const STRATEGY = o([['10', 'Make-to-stock production'], ['11', 'Make-to-stock / gross reqmts'], ['40', 'Planning with final assembly']]);
const CONSUMPTION = o([['1', 'Backward consumption only'], ['2', 'Backward / forward'], ['3', 'Forward consumption only'], ['4', 'Forward/backward consumption']]);
const MIXED_MRP = o([['', 'No mixed MRP'], ['1', 'Subassembly planning'], ['2', 'Gross requirements planning']]);
const CROSS_PROJECT = o([['', 'Check individual'], ['1', 'Cross-project']]);
const SELECTION = o([['1', 'Selection by order quantity'], ['2', 'Selection by production version'], ['3', 'Selection by explosion date']]);
const INDIV_COLL = o([['', 'Individual and collective'], ['1', 'Individual only'], ['2', 'Collective only']]);
const DEP_REQ = o([['1', 'Materials for dependent reqmts'], ['2', 'No dependent requirements']]);
const DISCONTIN = o([['', 'Not discontinued'], ['1', 'Single discontinuation'], ['2', 'Simultaneous']]);
const PUSH = o([['', 'Pull'], ['X', 'Push']]);
const FORECAST_MODEL = o([['J', 'Automatic model selection'], ['D', 'Constant model'], ['T', 'Trend model'], ['S', 'Seasonal model']]);
const TIME_UNIT = o([['D', 'Day'], ['M', 'Month']]);
const SLED_PERIOD = o([['M', 'Month'], ['D', 'Day'], ['W', 'Week']]);
const ROUNDING_RULE = o([['+', 'End of chosen period'], ['-', 'Start of chosen period'], ['', 'No rounding']]);
const STORAGE_COND = o([['01', 'Normal'], ['02', 'Cool and dry'], ['03', 'Hazardous goods store']]);
const TWO_STEP = o([['', '2-step not relevant'], ['1', '2-step picking']]);
const PROPOSED_UOM = o([['', 'Base unit of measure'], ['A', 'Alternative unit']]);
const QM_CONTROL = o([['0000', 'Del. release, no certificate'], ['0001', 'Release with certificate']]);
const CERT_TYPES = o([['COA', 'Certificate of analysis'], ['GMP', 'GMP certificate']]);
export const VAL_CLASSES = o([['7920', 'Finished products'], ['7900', 'Semi-finished products'], ['3000', 'Raw materials']]);
const PRICE_CONTROL = o([['S', 'Standard price'], ['V', 'Moving average price']]);
const CURRENCIES = o([['INR', 'Indian Rupee'], ['USD', 'US Dollar'], ['EUR', 'Euro']]);
const CLASS_TYPES = o([['023', 'Batch'], ['001', 'Material class']]);
const DOC_TYPES = o([['SPEC', 'Specification'], ['ART', 'Artwork'], ['COA', 'Certificate'], ['OTH', 'Other']]);
const LANGUAGES = o([['EN', 'English'], ['HI', 'Hindi']]);

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

type RawView = Omit<ViewDef, 'fields'>;

const RAW_VIEWS: RawView[] = [
  {
    id: 'basic', label: 'Basic Data', table: 'MARA', category: 'Basic', mandatory: true,
    groups: [
      {
        title: 'General Data',
        fields: [
          S('baseUom', 'Base UOM', 'MEINS', UOM, { required: true }),
          T('extMatlGroup', 'Ext. Matl Group', 'EXTWG', { maxLength: 18 }),
          R('materialGroup', 'Material Group'),
          T('oldMaterialNo', 'Old material number', 'BISMT', { maxLength: 40 }),
          R('division', 'Division'),
          T('labOffice', 'Lab/Office', 'LABOR', { maxLength: 3 }),
          T('productAllocation', 'Product allocation', 'KOSCH'),
          S('xPlantStatus', 'X-plant matl status', 'MSTAE', MATL_STATUS),
          D('xPlantValidFrom', 'Valid from', 'MSTDE'),
          C('assignEffVals', 'Assign effect. vals', 'KZEFF'),
          S('genItemCatGroup', 'GenItemCatGroup', 'MTPOS_MARA', ITEM_CAT),
          T('authGroup', 'Authorization Group', 'BEGRU', { maxLength: 4 }),
          R('prodHierarchy', 'Product Hierarchy'),
          T('uniqueCode', 'Unique Code', 'ZZUNIQUE'),
        ],
      },
      {
        title: 'Dimension/EANs Data',
        fields: [
          N('grossWeight', 'Gross Weight', 'BRGEW'),
          S('weightUnit', 'Weight unit', 'GEWEI', WEIGHT_UNITS),
          N('netWeight', 'Net Weight', 'NTGEW'),
          T('matlGrpPackMatls', 'Matl Grp Pack. Matls', 'MAGRV', { maxLength: 4 }),
          N('volume', 'Volume', 'VOLUM'),
          S('volumeUnit', 'Volume Unit', 'VOLEH', VOLUME_UNITS),
          T('sizeDimensions', 'Size/dimensions', 'GROES', { maxLength: 32 }),
          T('ean', 'EAN/UPC', 'EAN11', { maxLength: 18 }),
          S('eanCategory', 'EAN Category', 'NUMTP', EAN_CAT),
        ],
      },
      { title: 'Basic Data Texts', fields: [S('textLanguage', 'Language', 'SPRAS', LANGUAGES)] },
      {
        title: 'Emami Business Specific Data',
        fields: [
          N('skuSize', 'SKU Size', 'ZZSKUSIZE'),
          R('businessVertical', 'Business Vertical'),
          T('skuGrCode', 'SKU GR Code', 'ZZSKUGR'),
          T('skuGroup', 'SKU Group', 'ZZSKUGRP'),
          T('brandCode', 'Brand Code', 'ZZBRAND'),
          T('salesBrand', 'Sales Brand', 'ZZSBRAND'),
          T('crsSkuGrCode', 'CRS SKU GR Code', 'ZZCRSSKUGR'),
          T('crsSkuGroup', 'CRS SKU Group', 'ZZCRSSKUGRP'),
          T('sCode', 'S. Code', 'ZZSCODE'),
          R('scheme', 'Scheme'),
          N('schemePct', 'Scheme %', 'ZZSCHPCT', { unit: '%' }),
          T('materialCategory', 'Material Category', 'ZZMATCAT'),
          T('crsProducts', 'CRS Products', 'ZZCRSPROD'),
          T('productGroup', 'Product Group', 'ZZPRODGRP'),
          T('skuGroupCode', 'SKU Group (code)', 'ZZSKUGRPC'),
        ],
      },
      {
        title: 'Emami - Mold Management',
        fields: [
          T('moldDesignCode', 'Mold Design Code', 'ZZMOLD', { maxLength: 10 }),
          T('planningCode', 'Planning Code', 'ZZPLANCODE'),
          T('designCode', 'Design Code', 'ZZDESIGN'),
        ],
      },
      {
        title: 'Emami - IMD Data',
        fields: [
          T('imdProductName', 'Product Name', 'ZZIMDPROD'),
          T('imdBrandCode', 'Brand Code', 'ZZIMDBRAND'),
          T('imdMaterialCategory', 'Material Category', 'ZZIMDMATCAT'),
          T('imdSegment', 'Segment', 'ZZIMDSEG'),
          T('imdSeasonCode', 'Season Code', 'ZZIMDSEASON'),
          T('imdSchemeCode', 'Scheme Code', 'ZZIMDSCHEME'),
          T('imdRange', 'Range', 'ZZIMDRANGE'),
        ],
      },
      {
        title: 'Other Data',
        fields: [
          T('prodInspMemo', 'Prod./insp. memo', 'FERTH', { maxLength: 18 }),
          T('indStdDesc', 'Ind.Std Desc', 'NORMT', { maxLength: 18 }),
          T('pageFormat', 'Page format', 'FORMT', { maxLength: 4 }),
          C('cadIndicator', 'CAD Indicator', 'CADKZ'),
          T('basicMaterial', 'Basic material', 'WRKST', { maxLength: 48 }),
          T('medium', 'Medium', 'MEDIUM'),
          T('dgIndProfile', 'DGIndProfile', 'PROFL'),
          T('dgPackagingStatus', 'DG Packaging Status', 'DG_PACK_STATUS'),
          T('packagingCode', 'Packaging Code', 'PACKCODE'),
          C('evtRelevant', 'Evt.relevant', 'EVT_RELEVANT'),
          C('inBulkLiquid', 'In bulk/liquid', 'ILOOS'),
          C('highlyViscous', 'Highly viscous', 'IHIVI'),
          C('gdsRelevant', 'GDS-Relevant', 'GDS_RELEVANT'),
        ],
      },
      {
        title: 'Design Doc. Data',
        fields: [
          T('sapEquipmentCode', 'SAP Equipment Code', 'ZEINR', { maxLength: 22 }),
          T('docType', 'Document type', 'ZEIAR', { maxLength: 3 }),
          T('docVersion', 'Doc. Version', 'ZEIVR', { maxLength: 2 }),
          T('pageNumber', 'Page number', 'BLATT', { maxLength: 3 }),
          T('docPageFormat', 'Page format', 'ZEIFO', { maxLength: 4 }),
          T('docChangeNo', 'Doc.change no', 'AESZN', { maxLength: 6 }),
          N('noOfSheets', 'No. of sheets', 'BLANZ', { integer: true }),
          C('matConfigurable', 'Mat. is configurable', 'KZKFG'),
          T('crossPlantCm', 'Cross-Plant CM', 'SATNR'),
        ],
      },
      {
        title: 'Classification',
        fields: [
          S('classType', 'Class Type', 'KLART', CLASS_TYPES),
          {
            key: 'classAssignments', label: 'Assignment', tech: 'KSSK', type: 'table', wide: true,
            columns: [
              { key: 'cls', label: 'Class', type: 'text' },
              { key: 'desc', label: 'Description', type: 'text' },
              { key: 'std', label: 'Std. Class', type: 'checkbox' },
              { key: 'status', label: 'Status', type: 'text' },
              { key: 'icon', label: 'Icon', type: 'readonly' },
              { key: 'item', label: 'Item', type: 'number' },
            ],
          },
          {
            key: 'classCharacteristics', label: 'Characteristics Value', tech: 'AUSP', type: 'table', wide: true, fixedRows: true,
            columns: [
              { key: 'desc', label: 'Description', type: 'readonly' },
              { key: 'value', label: 'Char. Value', type: 'text' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'salesOrg1', label: 'Sales Org Data 1', table: 'MVKE', category: 'Sales',
    groups: [
      {
        title: 'General Data',
        fields: [
          S('so1DistChannel', 'Distribu. Channel', 'VTWEG', DIST_CHAINS),
          R('baseUom', 'Base Unit'),
          R('division', 'Division'),
          S('salesUnit', 'Sales Unit', 'VRKME', UOM),
          C('salesUnitNotVar', 'Sales Unit not var.', 'SCHME'),
          T('so1UomGroup', 'UoM Group', 'MEGRU', { maxLength: 4 }),
          S('xDistChainStatus', 'X-distr.chain Stat', 'MSTAV', MATL_STATUS),
          D('xDistChainValidFrom', 'Valid From', 'MSTDV'),
          S('dchainSpecStatus', 'DChain-spec', 'VMSTA', MATL_STATUS),
          D('dchainSpecValidFrom', 'Valid From', 'VMSTD'),
          S('deliveringPlant', 'Delivery Plant', 'DWERK', PLANTS),
          R('materialGroup', 'Material Group'),
          C('cashDiscount', 'Cash Discount', 'SKTOF'),
        ],
      },
      {
        title: 'Qty. Stipulations',
        fields: [
          N('minOrderQty', 'Min.Order Qty', 'AUMNG'),
          N('minDelyQty', 'Min. Dely Qty', 'LFMNG'),
          N('deliveryUnit', 'Delivery Unit', 'SCMNG'),
          S('deliveryUnitUom', 'Unit of Measure', 'SCHME', UOM),
          T('so1RoundingProfile', 'Rnding Profile', 'RDPRF', { maxLength: 4 }),
        ],
      },
    ],
  },
  {
    id: 'salesTax', label: 'Sales Org - Tax Data', table: 'MLAN', category: 'Sales',
    groups: [
      {
        title: 'Tax Data',
        fields: [
          {
            key: 'taxData', label: 'Tax classification per country', tech: 'TAXKM', type: 'table', wide: true, fixedRows: true,
            columns: [
              { key: 'country', label: 'Country', type: 'readonly' },
              { key: 'countryName', label: 'Country Name', type: 'readonly' },
              { key: 'taxCat', label: 'Tax category', type: 'readonly' },
              { key: 'taxCatName', label: 'Tax Category Name', type: 'readonly' },
              { key: 'taxClass', label: 'Tax classific.', type: 'select', options: TAX_CLASS, required: true },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'salesOrg2', label: 'Sales Org Data 2', table: 'MVKE', category: 'Sales',
    groups: [
      {
        title: 'Grouping Data',
        fields: [
          S('matlStatsGroup', 'Matl Stats Grp', 'VERSG', STATS_GRP),
          S('materialPricingGroup', 'Mat. Pricing Grp', 'KONDM', PRICING_GRP),
          S('volRebateGroup', 'Vol Rebate Grp', 'BONUS', REBATE_GRP),
          S('accountAssignmentGroup', 'Acct Asgnmt Grp', 'KTGRM', ACCT_ASSIGN),
          R('genItemCatGroup', 'GenItemCatGroup'),
          S('itemCategoryGroup', 'Item Cat Group', 'MTPOS', ITEM_CAT),
          T('prRefMatl', 'Pr. Ref Matl', 'PMATN', { maxLength: 40 }),
          R('prodHierarchy', 'Prod.Hierarchy'),
          T('commissionGroup', 'Commision Grp', 'PROVG', { maxLength: 2 }),
          T('materialGroup1', 'MaterialGroup 1', 'MVGR1', { maxLength: 3 }),
          T('materialGroup2', 'MaterialGroup 2', 'MVGR2', { maxLength: 3 }),
          T('materialGroup3', 'MaterialGroup 3', 'MVGR3', { maxLength: 3 }),
          T('materialGroup4', 'MaterialGroup 4', 'MVGR4', { maxLength: 3 }),
          T('materialGroup5', 'MaterialGroup 5', 'MVGR5', { maxLength: 3 }),
        ],
      },
      {
        title: 'Product Attributes',
        fields: Array.from({ length: 10 }, (_, i) => C(`productAttr${i + 1}`, `Product att.${i + 1}`, `PRAT${i === 9 ? 'A' : i + 1}`)),
      },
    ],
  },
  {
    id: 'salesPlant', label: 'Sales - Gen / Plant', table: 'MARC', category: 'Sales',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          S('replacementPart', 'Replacemt part', 'ATPKZ', REPLACEMENT),
          R('grossWeight', 'Gross Weight'),
          R('weightUnit', 'Weight unit'),
          S('discountInKind', 'Discount in kind', 'NRFHG', DISCOUNT_KIND),
          R('netWeight', 'Net Weight'),
          T('materialFreightGroup', 'Material frieght grp', 'MFRGR', { maxLength: 8 }),
          S('availabilityCheck', 'Availity check', 'MTVFP', AVAIL_CHECK),
          C('approvedBatchRec', 'Aprovd Batch rec. req.', 'KZECH'),
          C('batchManagement', 'BatchManagement', 'XCHPF'),
        ],
      },
      {
        title: 'Shiping Data',
        fields: [
          S('transportGroup', 'Trans. Group', 'TRAGR', TRANS_GRP),
          S('loadingGroup', 'Loading Group', 'LADGR', LOADING_GRP),
          N('setupTime', 'Setup time', 'VRVEZ'),
          N('processingTime', 'Processing time', 'VBEAZ'),
          N('baseQuantity', 'Base quantity', 'VBAMG'),
          T('matlGrpPckmat', 'Matl Grp Pckmat', 'MAGRV', { maxLength: 4 }),
          C('negStocks', 'Neg. stocks', 'XMCNG'),
          S('profitCenter', 'Profit Center', 'PRCTR', PROFIT_CENTERS),
          T('serialNoProfile', 'SerialNoProfile', 'SERNP', { maxLength: 4 }),
          T('distProfile', 'Dist.prof', 'FPRFM', { maxLength: 3 }),
          S('serializLevel', 'SerializLevel', 'SERLV', SERIAL_LEVEL),
        ],
      },
    ],
  },
  {
    id: 'ftExport', label: 'Foreign Trade Export', table: 'MARC', category: 'Foreign trade',
    groups: [
      {
        title: 'Foreign Trade Data',
        fields: [
          T('hsnCode', 'Comm/imp. code', 'STAWN', { maxLength: 8, pattern: { re: /^\d{8}$/, text: 'Comm./imp. code (HSN) must be 8 digits' } }),
          T('expImpGroup', 'Exp/imp group', 'MTVER', { maxLength: 4 }),
          T('casNo', 'CAS no.(pharm)', 'CASNR', { maxLength: 15 }),
          T('prodcomNo', 'PRODCOM no', 'GPNUM', { maxLength: 9 }),
          T('controlCode', 'Control code', 'STEUC', { maxLength: 16 }),
          S('exemptionCert', 'ExemptionCert', 'PREFE', EXEMPT_CERT),
          T('exemptCertNo', 'Exempt.cert.no', 'PRENO', { maxLength: 8 }),
          D('exemptCertDate', 'Iss.date of ex.cert', 'PREND'),
          C('militaryGoods', 'Military goods', 'ITARK'),
        ],
      },
      {
        title: 'Market Organization Data',
        fields: [
          S('countryOfOrigin', 'Country of origin', 'HERKL', COUNTRIES),
          S('regionOfOrigin', 'Region. of origin', 'HERKR', REGIONS),
          T('capProdListNo', 'CAP prod.list.no', 'MOWNR', { maxLength: 12 }),
          T('capProdGroup', 'CAP prod.group', 'MOGRU', { maxLength: 6 }),
          T('vendorDeclStatus', 'Vendr decl.status', 'PREND_V', { maxLength: 1 }),
          T('preferenceStatus', 'Preference status', 'PREFE_S', { maxLength: 1 }),
        ],
      },
    ],
  },
  {
    id: 'purchasing', label: 'Purchasing Data', table: 'MARC', category: 'Purchasing',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          S('orderUnit', 'Order Unit', 'BSTME', UOM),
          S('varOrderUnit', 'Var. Order Unit', 'VABME', VAR_ORDER_UNIT),
          S('purchasingGroup', 'Purchsing Group', 'EKGRP', PURCH_GROUPS),
          R('materialGroup', 'Material Group'),
          S('plantMatlStatus', 'Plant-sp.matl status', 'MMSTA', MATL_STATUS),
          D('plantMatlValidFrom', 'Valid From', 'MMSTD'),
          S('taxIndicator', 'Tax Indicator for material', 'TAXIM', TAX_IND),
          S('qualFreeGoods', 'Qual.f.FreeGoodsDis.', 'NRFHG_P', FREE_GOODS),
          T('matFreightGroup', 'Mat. Freight grp', 'MFRGR_P', { maxLength: 8 }),
          C('autoPO', 'Autom. PO', 'KAUTB'),
          R('batchManagement', 'BatchManagement'),
        ],
      },
      {
        title: 'Purchasing/Manufacture Data',
        fields: [
          T('purchValueKey', 'Purch. value key', 'EKWSL', { maxLength: 4 }),
          N('rem1', '1st Rem./Exped.', 'MAHN1', { integer: true, unit: 'Days' }),
          N('rem2', '2nd Rem./Exped.', 'MAHN2', { integer: true, unit: 'Days' }),
          N('rem3', '3rd Rem./Exped.', 'MAHN3', { integer: true, unit: 'Days' }),
          N('stdValDelivDateVar', 'StdValDelivDateVar', 'USEQU_V', { integer: true }),
          N('underdelTolerance', 'Underdel. Tolerance', 'UNTTO', { unit: '%' }),
          N('overdelTolerance', 'Overdeliv.Tolerance', 'UEBTO', { unit: '%' }),
          N('minDelQtyPct', 'Min. Del. Qty in %', 'MINLS', { unit: '%' }),
          C('unlimitedOverdel', 'Unlimited', 'UEBTK'),
          C('acknowledgementReqd', 'Acknowl. Reqd', 'KZABS'),
          N('grProcessingTime', 'GR Processing Time', 'WEBAZ', { integer: true, unit: 'Days' }),
          C('postToInspStock', 'Post to insp. stk', 'INSMK'),
          C('criticalPart', 'Critical Part', 'KZKRI'),
          T('quotaArrUsage', 'Quota arr.usage', 'USEQU', { maxLength: 1 }),
          C('sourceList', 'Source list', 'KORDB'),
          T('jitIndicator', 'JIT Indicator', 'FABKZ', { maxLength: 1 }),
          T('manufPartNo', 'Manufact. Part No.', 'MFRPN', { maxLength: 40 }),
          T('manufPartProfile', 'Manufact Part Profile', 'MPROF', { maxLength: 4 }),
          T('manufacturer', 'Manufacturer', 'MFRNR', { maxLength: 10 }),
        ],
      },
    ],
  },
  {
    id: 'workSched', label: 'Work Scheduling', table: 'MARC', category: 'Production and MRP',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base UOM'),
          S('unitOfIssue', 'Unit of Issue', 'AUSME', UOM),
          S('productionUnit', 'Production Unit', 'FRTME', UOM),
          S('psMatlStatus', 'PS Matl. Status', 'MMSTA_PS', MATL_STATUS),
          T('prodSupervisor', 'Prodn Supervisor', 'FEVOR', { maxLength: 3 }),
          T('prodStorLoc', 'Prod.Stor.Loc', 'LGPRO', { maxLength: 4 }),
          S('prodSchedProfile', 'Prod.Sched.Prof', 'SFCPF', SCHED_PROFILE, { required: true }),
          T('matGrouping', 'Mat. Grouping', 'MATGR', { maxLength: 20 }),
          T('overallProfile', 'Overall Profile', 'UEPRF', { maxLength: 7 }),
          C('inspStock', 'Insp. Stock', 'INSMK_WS'),
          R('criticalPart', 'Critical Part'),
          C('versionIndicator', 'Version Indicator', 'VERKZ'),
          C('batchRecReq', 'Batch rec. req', 'KZECH_WS'),
          R('batchManagement', 'Batch Management'),
          S('batchEntry', 'Batch Entry', 'KZECH_E', BATCH_ENTRY),
        ],
      },
    ],
  },
  {
    id: 'ftImport', label: 'Foreign Trade Import', table: 'MARC', category: 'Foreign trade',
    groups: [
      {
        title: 'Foreign Trade Data',
        fields: [
          R('hsnCode', 'Comm/imp.code'),
          R('expImpGroup', 'Exp/imp group'),
          R('casNo', 'CAS no.(pharm)'),
          R('prodcomNo', 'PRODCOM no'),
          R('controlCode', 'Control code'),
          R('exemptionCert', 'ExemptionCertificate'),
          R('exemptCertNo', 'Exemption.cert.no'),
          R('exemptCertDate', 'Iss.date of ex.cert.'),
          R('militaryGoods', 'Military goods'),
          S('importCountry', 'Country', 'LAND1', COUNTRIES),
        ],
      },
      {
        title: 'Origin/EU Market Org/Preferences',
        fields: [
          R('countryOfOrigin', 'Ctry of origin'),
          R('regionOfOrigin', 'Region of origin'),
          R('capProdListNo', 'CAP prod. list no'),
          R('capProdGroup', 'CAP prod. group'),
          R('preferenceStatus', 'Pref. status'),
          R('vendorDeclStatus', 'Vendr decl.status'),
        ],
      },
    ],
  },
  {
    id: 'mrp1', label: 'Data - MRP 1', table: 'MARC', category: 'Production and MRP',
    groups: [
      {
        title: 'General / MRP Procedure',
        fields: [
          R('baseUom', 'Base Unit'),
          T('mrpGroup', 'MRP group', 'DISGR', { maxLength: 4 }),
          R('purchasingGroup', 'Purch.Group'),
          S('abcIndicator', 'ABC Indicator', 'MAABC', ABC),
          R('plantMatlValidFrom', 'Valid From'),
          R('plantMatlStatus', 'Plant-sp.matl status'),
          S('mrpType', 'MRP Type', 'DISMM', MRP_TYPES),
          N('reorderPoint', 'Reorder Point', 'MINBE'),
          N('planningTimeFence', 'Plng time fence', 'FXHOR', { integer: true }),
          T('planningCycle', 'Planning cycle', 'LFRHY', { maxLength: 3 }),
          S('mrpController', 'MRP Controller', 'DISPO', MRP_CONTROLLERS, { required: true }),
          T('commCode', 'Comm Code', 'STAWN_M', { maxLength: 17 }),
        ],
      },
      {
        title: 'Lot Size Data',
        fields: [
          S('lotSize', 'Lot size', 'DISLS', LOT_SIZES, { required: true }),
          N('minLotSize', 'Min.Lot size', 'BSTMI'),
          N('maxLotSize', 'Max.Lot size', 'BSTMA'),
          N('fixedLotSize', 'Fixed lot size', 'BSTFE'),
          N('maxStockLevel', 'Max stock Level', 'MABST'),
          N('orderingCosts', 'Ordering costs', 'LOSFX'),
          T('storageCostsInd', 'Storage costs', 'LAGPR', { maxLength: 1 }),
          N('assemblyScrap', 'Assembly scrap', 'AUSSS', { unit: '%' }),
          N('taktTime', 'Takt time', 'TAKZT', { integer: true }),
          T('mrpRoundingProfile', 'Rnding Profile', 'RDPRF_M', { maxLength: 4 }),
          N('roundingValue', 'Rounding value', 'BSTRF'),
          T('mrpUomGroup', 'UoM Group', 'MEGRU_M', { maxLength: 4 }),
        ],
      },
    ],
  },
  {
    id: 'mrp2', label: 'Data - MRP 2', table: 'MARC', category: 'Production and MRP',
    groups: [
      {
        title: 'Procurement / Scheduling',
        fields: [
          S('procurementType', 'Procurement type', 'BESKZ', PROC_TYPES),
          R('batchEntry', 'Batch Entry'),
          T('specialProcurement', 'SpecProcurement', 'SOBSL', { maxLength: 2 }),
          R('prodStorLoc', 'Prod.stor.location'),
          R('quotaArrUsage', 'Quota arr.usage'),
          T('defaultSupplyArea', 'Default supply area', 'VSPVB', { maxLength: 10 }),
          S('backflush', 'Backflush', 'RGEKZ', BACKFLUSH),
          T('storageLocForEp', 'Storage loc. for EP', 'LGFSB', { maxLength: 4 }),
          S('jitDeliverySched', 'JIT DeliverSched.', 'FABKZ_M', JIT),
          T('stockDetGroup', 'Stock det. grp', 'EPRIO', { maxLength: 4 }),
          C('bulkMaterial', 'Bulk Material', 'SCHGT'),
          N('inHouseProduction', 'In-house productin', 'DZEIT', { integer: true, unit: 'Days' }),
          N('plannedDeliveryDays', 'Pland.Deliv.Time', 'PLIFZ', { integer: true, unit: 'Days' }),
          R('grProcessingTime', 'GR Proc Time'),
          S('planningCalendar', 'Planig calendar', 'MRPPP', CALENDARS),
          S('schedMarginKey', 'SchedMargin key', 'FHORI', SCHED_MARGIN, { required: true }),
        ],
      },
      {
        title: 'Net Req. Calculations',
        fields: [
          N('safetyStock', 'Safety Stock', 'EISBE'),
          N('serviceLevel', 'Service level(%)', 'LGRAD', { unit: '%' }),
          N('minSafetyStock', 'Min Safety Stock', 'EISLO'),
          T('coverageProfile', 'Coverage profile', 'RWPRO', { maxLength: 3 }),
          T('safetyTimePeriodProfile', 'STime period profile', 'SHPRO', { maxLength: 3 }),
          N('safetyTime', 'Safety time/act.cov.', 'SHZET', { integer: true, unit: 'Days' }),
          S('safetyTimeInd', 'Safety time ind', 'SHFLG', SAFETY_TIME),
        ],
      },
    ],
  },
  {
    id: 'mrp3', label: 'Data - MRP 3', table: 'MARC', category: 'Production and MRP',
    groups: [
      {
        title: 'Forecast Req./ Planning Data',
        fields: [
          S('periodIndicator', 'Period Indicator', 'PERKZ', PERIOD_IND),
          T('fiscalYearVariant', 'Fiscal.Year Variant', 'PERIV', { maxLength: 2 }),
          T('splittingIndicator', 'Splitting Indicator', 'AUFTL', { maxLength: 1 }),
          S('strategyGroup', 'Strategy group', 'STRGR', STRATEGY),
          S('consumptionMode', 'Consumption mode', 'VRMOD', CONSUMPTION),
          N('bwdConsumption', 'BWD consumption per.', 'VINT1', { integer: true }),
          N('fwdConsumption', 'Fwd consumption per.', 'VINT2', { integer: true }),
          S('mixedMrp', 'Mixed MRP', 'MISKZ', MIXED_MRP),
          T('planningMaterial', 'Planing material', 'VPMAT', { maxLength: 40 }),
          S('planningPlant', 'Planning plant', 'VPWRK', PLANTS),
          N('planningConvFactor', 'PlngConvFactor', 'UMREF'),
          S('planningMatlBaseUnit', 'Plng matl BUnit', 'VPBME', UOM),
        ],
      },
      {
        title: 'Availability / Plant-specific configuration',
        fields: [
          R('availabilityCheck', 'Availability.check'),
          N('totalReplLeadTime', 'Tot. repl. lead time', 'WZEIT', { integer: true, unit: 'Days' }),
          S('crossProject', 'Cross-project', 'KZPSP', CROSS_PROJECT),
          T('configurableMatl', 'Confble matl', 'STDPD', { maxLength: 40 }),
          C('variantInd', 'Variant', 'KZVAR'),
          C('planningVariant', 'PlanningVariant', 'KZPLV'),
        ],
      },
    ],
  },
  {
    id: 'mrp4', label: 'Data - MRP 4', table: 'MARC', category: 'Production and MRP',
    groups: [
      {
        title: 'Bom explosions/dependend Req. & Discontin. Ind',
        fields: [
          S('selectionMethod', 'Selection Method', 'ALTSL', SELECTION),
          N('compScrap', 'Comp scrap (%)', 'KAUSF', { unit: '%' }),
          S('indivColl', 'Indiv./coll.', 'SBDKZ', INDIV_COLL),
          T('reqmtsGrouping', 'Reqmts grouping', 'KZBED', { maxLength: 1 }),
          C('mrpVersion', 'Version', 'VERKZ_M'),
          C('remAllowed', 'REM allowed', 'SAUFT'),
          S('mrpDepRequirements', 'MRP Dep.Requirements', 'AHDIS', DEP_REQ),
          S('discontinuationInd', 'Discontin. Indictor', 'KZAUS', DISCONTIN),
          D('effOut', 'Eff.-out', 'AUSDT'),
          T('followUpMatl', 'Follow-Up Matl', 'NFMAT', { maxLength: 40 }),
        ],
      },
      {
        title: 'Repetetive manuf./assembly/ Storage Loc.',
        fields: [
          C('repetitiveMfg', 'Repetative mfg', 'SAUFT_R'),
          T('remProfile', 'REM Profile', 'SFEPR', { maxLength: 4 }),
          T('actionControl', 'Action Control', 'MDACH', { maxLength: 2 }),
          S('pushDistribution', 'Push Distribution', 'SHFLG_P', PUSH),
          N('deploymentHorizon', 'Deployment horizon', 'DPLHO', { integer: true }),
          T('fairShareRule', 'Fair share rule', 'DPLFS', { maxLength: 1 }),
          T('slocMrpIndicator', 'SLoc MRP Indicator', 'DISKZ', { maxLength: 1 }),
          T('specProcTypeSloc', 'Spec.proc.type: SLoc', 'LSOBS', { maxLength: 2 }),
          R('reorderPoint', 'Reorder point'),
          N('replenishmentQty', 'Replenishment qty', 'LBSTF'),
        ],
      },
      { title: 'Customer terrifs / Legal Control Data', fields: [C('materialMemo', 'Material memo', 'MEMO')] },
    ],
  },
  {
    id: 'forecast', label: 'Data - Forcasting', table: 'MPOP', category: 'Production and MRP',
    groups: [
      {
        title: 'General / No. of period req. Data',
        fields: [
          R('baseUom', 'Base Unit'),
          S('forecastModel', 'Forecast Model', 'PRMOD', FORECAST_MODEL, { required: true }),
          R('periodIndicator', 'Period Indicator'),
          D('lastForecast', 'Last forecast', 'PRDAT'),
          R('fiscalYearVariant', 'Fi.Year Variant'),
          T('refMatlCons', 'Ref. matl: cons.', 'VRBMT', { maxLength: 40 }),
          S('refPlantCons', 'Ref.plant: cons.', 'VRBWK', PLANTS),
          D('dateTo', 'Date to', 'VRBDT'),
          N('multiplier', 'Multiplier', 'VRBFK'),
          N('histPeriods', 'Hist. periods', 'PERAN', { integer: true }),
          N('forecastPeriods', 'Forecast Periods', 'ANZPR', { integer: true }),
          N('periodsPerSeason', 'Periods/season', 'PERIO', { integer: true }),
          N('initPeriods', 'Init. periods', 'PERIN', { integer: true }),
          N('fixedPeriods', 'Fixed periods', 'FIMON', { integer: true }),
        ],
      },
      {
        title: 'Control Data',
        fields: [
          T('initialization', 'Initialization', 'KZINI', { maxLength: 1 }),
          N('trackingLimit', 'Tracking Limit', 'SIGGR'),
          C('autoReset', 'Autom.reset', 'AUTRU'),
          T('modelSelection', 'Model selection', 'MODAW', { maxLength: 1 }),
          T('selectionProcedure', 'Selection Procedure', 'MODAV', { maxLength: 1 }),
          C('paramOptimization', 'Param. Optimization', 'KZPAR'),
          T('optimizationLevel', 'Optimiz.level', 'OPGRA', { maxLength: 1 }),
          T('weightingGroup', 'Weighting group', 'GEWGR', { maxLength: 2 }),
          C('correctionFactors', 'Correction Factors', 'KZKFK'),
          N('alphaFactor', 'Alpha Factor', 'ALPHA'),
          N('betaFactor', 'Beta Factor', 'BETA1'),
          N('gammaFactor', 'Gamma Factor', 'GAMMA'),
          N('deltaFactor', 'Delta Factor', 'DELTA'),
        ],
      },
    ],
  },
  {
    id: 'storage1', label: 'Plant Data - Storage 1', table: 'MARC / MARD', category: 'Plant and storage',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          R('unitOfIssue', 'Unit of issue'),
          T('storageBin', 'Storage Bin', 'LGPBE', { maxLength: 10 }),
          T('pickingArea', 'Picking area', 'LWMKB', { maxLength: 3 }),
          T('tempConditions', 'Temperature', 'TEMPB', { maxLength: 2 }),
          S('storageConditions', 'Storage conditions', 'RAUBE', STORAGE_COND),
          T('containerReq', 'Container Req.', 'BEHVO', { maxLength: 2 }),
          T('hazMaterialNo', 'Haz. material No.', 'STOFF', { maxLength: 18 }),
          T('ccPhysInvInd', 'CC phys.inv.ind', 'ABCIN', { maxLength: 1 }),
          C('ccIndFixed', 'CC ind. fixed', 'CCFIX'),
          N('grSlipsQty', 'GR slips quantity', 'WESCH'),
          T('labelType', 'Label type', 'ETIAR', { maxLength: 2 }),
          T('labelForm', 'Label form', 'ETIFO', { maxLength: 2 }),
          R('approvedBatchRec', 'Apprvd Btch rec. req.'),
          R('batchManagement', 'Batch Management'),
        ],
      },
      {
        title: 'Shelf life Data',
        fields: [
          N('maxStoragePeriod', 'Max. Storage', 'MAXLZ', { integer: true }),
          S('storageTimeUnit', 'Time unit', 'LZEIH', TIME_UNIT),
          N('minRemainingShelfLife', 'Min. Rem. Shelf Life', 'MHDRZ', { integer: true }),
          N('storagePct', 'Storage %', 'MHDLP', { unit: '%' }),
          N('totalShelfLife', 'Total shelf life', 'MHDHB', { integer: true }),
          S('periodIndSled', 'Period Ind. for SLED', 'IPRKZ', SLED_PERIOD),
          S('roundingRuleSled', 'Rounding rule', 'RDMHD', ROUNDING_RULE),
        ],
      },
    ],
  },
  {
    id: 'storage2', label: 'Plant Data - Storage 2', table: 'MARA / MARC', category: 'Plant and storage',
    groups: [
      {
        title: 'Weight/Volume Data',
        fields: [
          R('grossWeight', 'Gross Weight'),
          R('weightUnit', 'Weight unit'),
          R('netWeight', 'Net Weight'),
          R('volume', 'Volume'),
          R('volumeUnit', 'Volume unit'),
          R('sizeDimensions', 'Size/dimentions'),
        ],
      },
      {
        title: 'General Plant Parameters',
        fields: [
          R('negStocks', 'Neg.stocks inPlant'),
          R('profitCenter', 'Profit Center'),
          T('logisticsGroup', 'Logistics group', 'LOGGR', { maxLength: 4 }),
          R('serialNoProfile', 'Serial NoProfile'),
          R('serializLevel', 'SerializLevel'),
          R('distProfile', 'Dist.profile'),
          R('stockDetGroup', 'Stock determ. group'),
        ],
      },
    ],
  },
  {
    id: 'wm1', label: 'Warehouse Mgmt. 1', table: 'MLGN', category: 'Warehouse',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('warehouseNo', 'Warehouse No.'),
          R('baseUom', 'Base Unit'),
          R('hazMaterialNo', 'Haz. Material no.'),
          S('wmUnit', 'WM unit', 'LVSME', UOM),
          R('grossWeight', 'Gross Weight'),
          R('weightUnit', 'Unit of Weight'),
          R('unitOfIssue', 'Unit of Issue'),
          R('volume', 'Volume'),
          R('volumeUnit', 'Volume Unit'),
          S('proposedUom', 'Proposed UoM from material', 'VOMEM', PROPOSED_UOM),
          N('capacityUsage', 'Capacity usage', 'KZKUP'),
          T('capConsUnit', 'Cap. cons. unit', 'KZKUP_U', { maxLength: 3 }),
          T('pickingStorageType', 'Picking storage type', 'PLKPT', { maxLength: 3 }),
          C('wmApprBatchRec', 'Appr.batch rec. req.', 'KZECH_W'),
        ],
      },
      {
        title: 'Storage Strategies',
        fields: [
          T('stockRemoval', 'Stock removal', 'LTKZA', { maxLength: 3 }),
          T('stockPlacement', 'Stock placement', 'LTKZE', { maxLength: 3 }),
          T('storageSectionInd', 'Storage Section Ind.', 'LGBKZ', { maxLength: 3 }),
          T('bulkStorage', 'Bulk storage', 'BLOCK', { maxLength: 2 }),
          T('specialMovement', 'Special movement', 'BSSKZ', { maxLength: 1 }),
          C('messageToIm', 'Message to IM', 'KZMBF'),
          S('twoStepPicking', '2-step picking', 'L2SKR', TWO_STEP),
          C('allowAddnToStock', 'Allow addn to stock', 'KZZUL'),
        ],
      },
    ],
  },
  {
    id: 'wm2', label: 'Warehouse Mgmt. 2', table: 'MLGT', category: 'Warehouse',
    groups: [
      {
        title: 'Storage bin stock',
        fields: [
          R('plant', 'Plant'),
          R('warehouseNo', 'Ware House No.'),
          R('storageType', 'Storage Type'),
          T('wmStorageBin', 'Storage Bin', 'LGPLA', { maxLength: 10 }),
          T('wmPickingArea', 'Picking Area', 'KOBER', { maxLength: 3 }),
          N('maxBinQty', 'Maximum bin Qty', 'LPMAX'),
          N('controlQty', 'Control qty', 'NSMNG'),
          N('minBinQty', 'Minimum bin Qty', 'LPMIN'),
          N('replenishQty', 'Replenish Qty', 'RDMNG'),
          N('roundingQty', 'Rounding Qty', 'RDMNG_R'),
        ],
      },
      {
        title: 'Palletization Data',
        fields: [
          N('leQty1', 'LE Qty', 'LHMG1'), S('leUom1', 'Unit Of Measure', 'LHME1', UOM), T('suType1', 'Stor. Unit type', 'LETY1', { maxLength: 3 }),
          N('leQty2', 'LE Qty2', 'LHMG2'), S('leUom2', 'Unit Of Measure2', 'LHME2', UOM), T('suType2', 'Stor. Unit type2', 'LETY2', { maxLength: 3 }),
          N('leQty3', 'LE Qty3', 'LHMG3'), S('leUom3', 'Unit Of Measure3', 'LHME3', UOM), T('suType3', 'Stor. Unit type3', 'LETY3', { maxLength: 3 }),
        ],
      },
    ],
  },
  {
    id: 'quality', label: 'Quality Management', table: 'MARC / QMAT', category: 'Quality',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          R('unitOfIssue', 'Unit of Issue'),
          T('qmMatAuth', 'QM mat. auth.', 'QMATA', { maxLength: 6 }),
          C('qmDocRequired', 'Doc. required', 'KZDKZ'),
          R('grProcessingTime', 'GR proc. time'),
          N('inspectionInterval', 'Inspection Interval', 'PRFRQ', { integer: true, unit: 'Days' }),
          T('catalogProfile', 'Catalog profile', 'RBNRM', { maxLength: 9 }),
          D('qmValidFrom', 'Valid from', 'QMVAL'),
        ],
      },
      {
        title: 'Procurement Data',
        fields: [
          S('psMatlStatusQm', 'P-S matl status', 'MMSTA_Q', MATL_STATUS),
          C('qmProcActive', 'QM procurement', 'QMPUR'),
          S('qmControlKey', 'QM Control Key', 'SSQSS', QM_CONTROL),
          S('certificateType', 'CertificateType', 'QZGTP', CERT_TYPES),
          T('targetQmSystem', 'Target QM sys.', 'QSSYS', { maxLength: 4 }),
          T('techDelTerms', 'Tech.del.terms', 'QSSYS_T', { maxLength: 4 }),
          C('inspSetup', 'Insp. setup', 'QMATV'),
          R('postToInspStock', 'Post to insp. stk'),
        ],
      },
    ],
  },
  {
    id: 'acct1', label: 'Accounting Data 1', table: 'MBEW', category: 'Accounting and costing',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          T('valuationCat', 'Valuation Cat.', 'BWTTY', { maxLength: 1 }),
          T('valuationType', 'Valuation Type', 'BWTAR', { maxLength: 10 }),
          S('currency', 'Currency', 'WAERS', CURRENCIES),
          T('currentPeriod', 'Current Period', 'LFMON', { maxLength: 2 }),
          R('division', 'Division'),
          T('priceDeterm', 'Price Determ.', 'MLAST', { maxLength: 1 }),
          S('valuationClass', 'Valuat Class', 'BKLAS', VAL_CLASSES, { required: true }),
          C('mlActive', 'ML act.', 'MLMAA'),
        ],
      },
      {
        title: 'Current Valuation Data',
        fields: [
          T('vcSalesOrderStock', 'VC: Sal. Ord. Stk', 'EKLAS', { maxLength: 4 }),
          T('projectStockVc', 'Project stk Val. cl.', 'QKLAS', { maxLength: 4 }),
          S('priceControl', 'Price Control', 'VPRSV', PRICE_CONTROL, { required: true }),
          N('priceUnit', 'Price Unit', 'PEINH', { integer: true }),
          N('movingPrice', 'Moving Price', 'VERPR'),
          N('standardPrice', 'Standard Price', 'STPRS'),
          N('totalStock', 'Total stock', 'LBKUM', { readOnly: true }),
          N('totalValue', 'Total Value', 'SALK3', { readOnly: true }),
          C('valuationUnit', 'Valuation Un', 'KALKZ'),
          N('futurePrice', 'Future Price', 'ZKPRS'),
          D('futurePriceValidFrom', 'Valid From', 'ZKDAT'),
          N('previousPrice', 'Previous Price', 'VJSTP'),
          D('lastPriceChange', 'Last price change', 'LAEPR', { readOnly: true }),
        ],
      },
    ],
  },
  {
    id: 'acct2', label: 'Accounting Data 2', table: 'MBEW', category: 'Accounting and costing',
    groups: [
      {
        title: 'Determination of lowest value',
        fields: [
          N('taxPrice1', 'Tax Price 1', 'BWPRS'), N('taxPrice2', 'Tax Price 2', 'BWPS1'), N('taxPrice3', 'Tax Price 3', 'VJBWS'),
          N('commPrice1', 'Commercial price 1', 'BWPRH'), N('commPrice2', 'Commercial price 2', 'BWPH1'), N('commPrice3', 'Commercial price 3', 'VJBWH'),
          T('devaluationInd', 'Devaluation ind', 'ABWKZ', { maxLength: 2 }),
          N('lowestValuePriceUnit', 'Price Unit', 'PEINH_2', { integer: true }),
        ],
      },
      {
        title: 'LIFO Data',
        fields: [
          C('lifoRelevant', 'LIFO/FIFO-Rel.', 'XLIFO'),
          T('lifoPool', 'LIFO pool', 'MYPOL', { maxLength: 4 }),
        ],
      },
    ],
  },
  {
    id: 'costing1', label: 'Data - Costing 1', table: 'MARC / MBEW', category: 'Accounting and costing',
    groups: [
      {
        title: 'General Data',
        fields: [
          R('baseUom', 'Base Unit'),
          C('doNotCost', 'Do Not Cost', 'NCOST'),
          T('originGroup', 'Origin group', 'HRKFT', { maxLength: 4 }),
          C('withQtyStructure', 'With Qty Structure', 'EKALR'),
          C('materialOrigin', 'Material origin', 'HKMAT'),
          T('overheadGroup', 'Overhead Group', 'KOSGR', { maxLength: 10 }),
          T('varianceKey', 'Variance key', 'AWSLS', { maxLength: 6 }),
          R('plantMatlStatus', 'Plant-sp.matl status'),
          R('plantMatlValidFrom', 'Valid from'),
          R('profitCenter', 'Profit Center'),
        ],
      },
      {
        title: 'Quantity structure data',
        fields: [
          T('alternativeBom', 'Alternative Bom', 'STLAL', { maxLength: 2 }),
          T('bomUsage', 'BOM Usage', 'STLAN', { maxLength: 1 }),
          T('taskListGroup', 'Group', 'PLNNR', { maxLength: 8 }),
          T('groupCounter', 'Group Counter', 'APLAL', { maxLength: 2 }),
          T('taskListType', 'Task List Type', 'PLNTY', { maxLength: 1 }),
          T('specProcCosting', 'SpecProcrmt Costing', 'SOBSK', { maxLength: 2 }),
          N('costingLotSize', 'Cstg Lot Size', 'LOSGR'),
          C('costingVersion', 'Version', 'VERKZ_C'),
          T('productionVersion', 'Production. Version', 'FVIDK', { maxLength: 4 }),
          T('prodVersion', 'Prod. Version', 'VERID', { maxLength: 4 }),
          T('prodVersionText', 'Text', 'TEXT1', { maxLength: 40 }),
          D('prodVersionValidFrom', 'Valid from', 'ADATU'),
          D('prodVersionValidTo', 'Valid to', 'BDATU'),
          R('remAllowed', 'REM allowed'),
        ],
      },
    ],
  },
  {
    id: 'costing2', label: 'Data - Costing 2', table: 'MBEW', category: 'Accounting and costing',
    groups: [
      {
        title: 'Std. cost estimate / Planned prices',
        fields: [
          T('futPeriodFy', 'Period / Fiscal Year', 'PDATZ', { maxLength: 3 }),
          T('futFiscalYear', 'Fut. Perid/Fscal Year', 'LFGJA_Z', { maxLength: 4 }),
          N('futPlannedPrice', 'Fut. Pland Price', 'ZPLPR'),
          T('curPeriod', 'Current Period', 'PDATL', { maxLength: 3 }),
          T('curFiscalYear', 'Current FYear', 'LFGJA_L', { maxLength: 4 }),
          N('curPlannedPrice', 'Current Plnd year', 'LPLPR'),
          T('prevPeriod', 'Previous Period', 'PDATV', { maxLength: 3 }),
          T('prevFiscalYear', 'Previous FYear', 'LFGJA_V', { maxLength: 4 }),
          N('prevPlannedPrice', 'Prev.Plnd Price', 'VPLPR'),
          N('plannedPrice1', 'Plnned Price1', 'ZPLP1'), N('plannedPrice2', 'Plnned Price2', 'ZPLP2'), N('plannedPrice3', 'Plnned Price3', 'ZPLP3'),
          D('plannedPriceDate1', 'Plnd Price date1', 'ZPLD1'), D('plannedPriceDate2', 'Plnd Price date2', 'ZPLD2'), D('plannedPriceDate3', 'Plnd Price date3', 'ZPLD3'),
        ],
      },
      {
        title: 'Valuation Data',
        fields: [
          R('valuationClass', 'Valuation Class'),
          R('valuationCat', 'Valuation Cat'),
          R('vcSalesOrderStock', 'VC: Sal. Ord stk'),
          R('projectStockVc', 'Project stk VC'),
          R('priceControl', 'Price Control'),
          R('currentPeriod', 'Current Period'),
          R('priceUnit', 'Price Unit'),
          R('currency', 'Currency'),
          R('movingPrice', 'Moving Price'),
          R('standardPrice', 'Standard Price'),
        ],
      },
    ],
  },
  {
    id: 'text', label: 'Material - Text', table: 'MAKT / STXH', category: 'Texts', mandatory: true,
    groups: [
      {
        title: 'Descriptions',
        fields: [
          {
            key: 'descriptions', label: 'Descriptions per language', tech: 'MAKT', type: 'table', wide: true,
            columns: [
              { key: 'lang', label: 'Language', type: 'select', options: LANGUAGES, required: true },
              { key: 'text', label: 'Description', type: 'text', required: true },
            ],
          },
        ],
      },
      { title: 'Basic Data Text', fields: [TA('basicDataText', 'Basic data text', 'GRUN')] },
      {
        title: 'Units of Measure',
        fields: [
          {
            key: 'uomConversions', label: 'Alternative units of measure', tech: 'MARM', type: 'table', wide: true,
            columns: [
              { key: 'denominator', label: 'Denominator', type: 'number' },
              { key: 'altUnit', label: 'AlternativeUnit', type: 'select', options: UOM },
              { key: 'numerator', label: 'Y', type: 'number' },
              { key: 'baseUnit', label: 'Base Unit', type: 'readonly' },
            ],
          },
        ],
      },
      { title: 'Inspection Text', fields: [TA('inspectionText', 'Inspection text', 'PRUE')] },
      { title: 'Internal Comment', fields: [TA('internalComment', 'Internal comment', 'IVER')] },
      { title: 'Sales Text', fields: [TA('salesText', 'Sales text', '0001')] },
      {
        title: 'Attachment Details',
        fields: [{ key: 'attachments', label: 'Uploaded files', tech: 'GOS', type: 'attachments', wide: true, options: DOC_TYPES }],
      },
      { title: 'Comments', fields: [TA('initiatorComments', 'Comments', 'ZCOMMENT')] },
    ],
  },
];

export const VIEWS: ViewDef[] = RAW_VIEWS.map((v) => ({
  ...v,
  fields: v.groups.flatMap((g) => g.fields).filter((f) => f.type !== 'ref' && !f.readOnly),
}));

export const VIEW_CATEGORIES: ViewCategory[] = ['Basic', 'Sales', 'Foreign trade', 'Purchasing', 'Production and MRP', 'Plant and storage', 'Warehouse', 'Quality', 'Accounting and costing', 'Texts'];

/** Fixed rows of the tax table (countries and tax categories of the sales org, MLAN) */
export const TAX_ROWS = [
  { country: 'AE', countryName: 'Utd.Arab Emir.', taxCat: 'UTXJ', taxCatName: 'Tax Jurisdict.Code', taxClass: '1' },
  { country: 'BD', countryName: 'Bangladesh', taxCat: 'UTXJ', taxCatName: 'Tax Jurisdict.Code', taxClass: '1' },
  { country: 'IN', countryName: 'India', taxCat: 'JOIG', taxCatName: 'IN: Integrated GST', taxClass: '0' },
  { country: 'IN', countryName: 'India', taxCat: 'JTC1', taxCatName: 'IN: 206C(1H) Goods', taxClass: '0' },
  { country: 'LK', countryName: 'Sri Lanka', taxCat: 'UTXJ', taxCatName: 'Tax Jurisdict.Code', taxClass: '1' },
];

/** Batch class (023) assignment and characteristics */
export const CLASS_ROWS = [{ cls: 'Z_PRD_DATE', desc: 'MANUFACTURING DATE', std: '', status: '1', icon: 'Released', item: '10' }];
export const CHAR_ROWS = [
  { desc: 'Date when Batch Was Produced', value: '' },
  { desc: 'Deletion Ind. for Batches', value: '' },
  { desc: 'Country of Origin', value: '' },
];

/** Rule-engine defaults for FERT / FRT2 / WIP (fields marked (R) on the SAP screen) */
export function viewDefaults(type: string): Record<string, string> {
  return {
    baseUom: 'PC', weightUnit: 'KG', textLanguage: 'EN', genItemCatGroup: 'NORM', classType: '023',
    classAssignments: JSON.stringify(CLASS_ROWS), classCharacteristics: JSON.stringify(CHAR_ROWS),
    so1DistChannel: '00', cashDiscount: 'X',
    taxData: JSON.stringify(TAX_ROWS),
    matlStatsGroup: '1', accountAssignmentGroup: '05', itemCategoryGroup: 'NORM',
    availabilityCheck: '02', transportGroup: '0001', loadingGroup: '0001', profitCenter: 'UN08',
    varOrderUnit: '', taxIndicator: '0', autoPO: 'X', stdValDelivDateVar: '0',
    prodSchedProfile: 'PI01',
    mrpType: 'PD', mrpController: '001', lotSize: 'EX',
    backflush: '2', planningCalendar: 'PCL', schedMarginKey: '000',
    periodIndicator: 'M', strategyGroup: '11', consumptionMode: '4', bwdConsumption: '14', fwdConsumption: '14', mixedMrp: '2',
    selectionMethod: '2', mrpDepRequirements: '1',
    forecastModel: 'J',
    periodIndSled: 'M', roundingRuleSled: '+',
    qmControlKey: '0000', inspSetup: 'X',
    valuationClass: type === 'WIP' ? '7900' : '7920', priceControl: 'S', currency: 'INR', currentPeriod: '00', priceUnit: '1',
    withQtyStructure: 'X', varianceKey: '000001',
    uomConversions: JSON.stringify([{ denominator: '1', altUnit: 'KG', numerator: '1', baseUnit: 'PC' }]),
  };
}
