/**
 * Material views (tabs) for material types FERT, FRT2 and WIP, following the SAP
 * "Material Master : Initial Screen" (Web Dynpro) of the old app: every heading,
 * block and field in the same order.
 *
 * - Which fields a level sees, may change or must fill comes from SAP (GET /fieldcontrol), never from here.
 * - `ref` fields show a value maintained elsewhere (base unit, material group, ...),
 *   display-only, exactly like the greyed fields on the SAP screen.
 * - Select fields carry no value list: the list is read live from SAP (value help named like the field, see lib/mmValueHelp.ts).
 */

export interface Opt { value: string; label: string }

export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea' | 'ref' | 'table' | 'attachments';

export interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'readonly';
  /** Select column: name of the SAP value help that lists the values */
  help?: string;
  required?: boolean;
}

export interface FieldDef {
  key: string;
  label: string;
  tech: string;
  type: FieldType;
  /** Select field: SAP value help name; defaults to `tech` */
  help?: string;
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
  /** Table: SAP keeps at most this many rows */
  maxRows?: number;
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

type X = Partial<FieldDef>;
const T = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'text', ...x });
const N = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'number', ...x });
const D = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'date', ...x });
const C = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'checkbox', ...x });
const S = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'select', ...x });
const TA = (key: string, label: string, tech: string, x: X = {}): FieldDef => ({ key, label, tech, type: 'textarea', wide: true, ...x });
/** Display of a value maintained in another view or on the key data screen */
const R = (key: string, label: string): FieldDef => ({ key, label, tech: '', type: 'ref' });


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
          S('baseUom', 'Base UOM', 'MEINS', { required: true }),
          T('extMatlGroup', 'Ext. Matl Group', 'EXTWG', { maxLength: 18 }),
          R('materialGroup', 'Material Group'),
          T('oldMaterialNo', 'Old material number', 'BISMT', { maxLength: 40 }),
          R('division', 'Division'),
          T('labOffice', 'Lab/Office', 'LABOR', { maxLength: 3 }),
          T('productAllocation', 'Product allocation', 'KOSCH'),
          S('xPlantStatus', 'X-plant matl status', 'MSTAE'),
          D('xPlantValidFrom', 'Valid from', 'MSTDE'),
          C('assignEffVals', 'Assign effect. vals', 'KZEFF'),
          S('genItemCatGroup', 'GenItemCatGroup', 'MTPOS_MARA'),
          T('authGroup', 'Authorization Group', 'BEGRU', { maxLength: 4 }),
          R('prodHierarchy', 'Product Hierarchy'),
          T('uniqueCode', 'Unique Code', 'ZCODE'),
        ],
      },
      {
        title: 'Dimension/EANs Data',
        fields: [
          N('grossWeight', 'Gross Weight', 'BRGEW'),
          S('weightUnit', 'Weight unit', 'GEWEI'),
          N('netWeight', 'Net Weight', 'NTGEW'),
          T('matlGrpPackMatls', 'Matl Grp Pack. Matls', 'MAGRV', { maxLength: 4 }),
          N('volume', 'Volume', 'VOLUM'),
          S('volumeUnit', 'Volume Unit', 'VOLEH'),
          T('sizeDimensions', 'Size/dimensions', 'GROES', { maxLength: 32 }),
          T('ean', 'EAN/UPC', 'EAN11', { maxLength: 18 }),
          S('eanCategory', 'EAN Category', 'NUMTP'),
        ],
      },
      { title: 'Basic Data Texts', fields: [S('textLanguage', 'Language', 'SPRAS')] },
      {
        title: 'Emami Business Specific Data',
        fields: [
          N('skuSize', 'SKU Size', 'ZSKUSIZE'),
          R('businessVertical', 'Business Vertical'),
          T('skuGrCode', 'SKU GR Code', 'ZSKUGRCODE'),
          T('skuGroup', 'SKU Group', 'ZSKUGROUP'),
          T('brandCode', 'Product Code', 'ZBRANDCODE'),
          T('salesBrand', 'Product Description', 'ZSALESBRAND'),
          T('crsSkuGrCode', 'CRS SKU Group Code', 'ZSKUGRCODECRS'),
          T('crsSkuGroup', 'CRS SKU Group Description', 'ZSKUGROUPCRS'),
          T('sCode', 'S. Code', 'ZMVGR5'),
          R('scheme', 'Scheme'),
          N('schemePct', 'Scheme %', 'ZZSCHEMEP', { unit: '%' }),
          T('materialCategory', 'Material Category', 'ZZMATCAT'),
          T('zzMtypeCode', 'Material Type (Emami)', 'ZZMTYPE_CODE'),
          T('zzMstypeCode', 'Material Sub Type', 'ZZMSTYPE_CODE'),
          T('zzRmType', 'RM Sub Type', 'ZZRM_TYPE'),
          T('zzDistCode', 'Distribution', 'ZZDIST_CODE'),
          T('zzMsource', 'Source', 'ZZMSOURCE'),
          T('zzCountry', 'Country', 'ZZRMPM_COUNTRY'),
          T('zzOriginCode', 'Origin Group', 'ZZORIGIN_CODE'),
          T('zzMatGrp', 'Material Group (Emami)', 'ZZMAT_GRP'),
          T('zzPackCode', 'Pack Size', 'ZZPACK_CODE'),
          T('zzPackUnit', 'Pack Unit', 'ZZPACK_UNIT'),
          T('zzBrandCode', 'Brand', 'ZZBRAND_CODE'),
          T('zzSubBrand', 'Sub-Brand', 'ZZSUB_BRAND'),
          T('zzProdForm', 'Product Form', 'ZZPROD_FORM'),
          T('zzPromoBrand', 'Promo Brand', 'ZZPROMO_BRAND'),
          T('zzPromoSubBrand', 'Promo Sub-Brand', 'ZZPROMO_SUB_BRAND'),
          T('zzPromoPack', 'Promo Pack Size', 'ZZPROMO_PACK'),
          T('zzPromoPackUnit', 'Promo Pack Unit', 'ZZPROMO_PACK_UNIT'),
          T('zzFreeText', 'Free Text to Material Description', 'ZZFREE_TEXT'),
          T('zzParentCode', 'Parent Code', 'ZZPARENT_CODE'),
          T('zzParentMat', 'Parent Material', 'ZZPARENT_MAT'),
          T('zzVersion', 'Version Number', 'ZZP_VERSION'),
        ],
      },
      {
        title: 'Emami - Mold Management',
        fields: [
          T('zzCompPart', 'Component Part', 'ZZCOMP_PART'),
          T('zzRunner', 'Runner Type', 'ZZRUNNER'),
          T('zzGran', 'Granules Grade', 'ZZGRAN'),
          T('zzMach', 'Machine Master Code', 'ZZMACH'),
          N('zzCavityNo', 'No. of Cavity', 'ZZCAVITY_NO'),
          N('zzRunCavity', 'Running Cavity', 'ZZRUN_CAVITY'),
          N('zzCycTime', 'Cycle Time in Sec.', 'ZZCYC_TIME'),
          N('zzFacProd', 'Factor Production Efficiency', 'ZZFAC_PROD'),
          N('zzHoursDay', 'Hours Day', 'ZZHOURS_DAY'),
          T('zzMdsCode', 'Design Code', 'ZZMDS_CODE'),
          N('zzMoldLife', 'Mold Life in Years', 'ZZMOLD_LIFE'),
          N('zzMoldShots', 'Shots in Million', 'ZZMOLD_SHOTS'),
          T('zzPlanCode', 'Planning Code', 'ZZPLAN_CODE'),
          T('zzFgCode', 'FG Design Code', 'ZZFG_CODE'),
        ],
      },
      {
        title: 'Emami - IMD Data',
        fields: [
          T('imdProductName', 'Product Name', 'ZPRODC'),
          T('imdBrandCode', 'Brand Code', 'BRAND'),
          T('imdMaterialCategory', 'Material Category', 'CATAG'),
          T('imdSegment', 'Segment', 'SEGMN'),
          T('imdSeasonCode', 'Season Code', 'SEASON'),
          T('imdSchemeCode', 'Scheme Code', 'SCHEME'),
          T('imdRange', 'Range', 'RANGE'),
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
          S('classType', 'Class Type', 'KLART'),
          {
            key: 'classAssignments', label: 'Assignment', tech: 'KSSK', type: 'table', wide: true, fixedRows: true,
            columns: [
              { key: 'klart', label: 'Class type', type: 'readonly' },
              { key: 'cls', label: 'Class', type: 'readonly' },
              { key: 'kltxt', label: 'Class text', type: 'readonly' },
              { key: 'char', label: 'Characteristic', type: 'readonly' },
              { key: 'value', label: 'Value', type: 'text' },
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
          S('so1DistChannel', 'Distribu. Channel', 'VTWEG'),
          R('baseUom', 'Base Unit'),
          R('division', 'Division'),
          S('salesUnit', 'Sales Unit', 'VRKME'),
          C('salesUnitNotVar', 'Sales Unit not var.', 'SCHME'),
          T('so1UomGroup', 'UoM Group', 'MEGRU', { maxLength: 4 }),
          S('xDistChainStatus', 'X-distr.chain Stat', 'MSTAV'),
          D('xDistChainValidFrom', 'Valid From', 'MSTDV'),
          S('dchainSpecStatus', 'DChain-spec', 'VMSTA'),
          D('dchainSpecValidFrom', 'Valid From', 'VMSTD'),
          S('deliveringPlant', 'Delivery Plant', 'DWERK', { help: 'WERKS' }),
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
          S('deliveryUnitUom', 'Unit of Measure', 'SCHME'),
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
              { key: 'taxClass', label: 'Tax classific.', type: 'select', help: 'TAXKD', required: true },
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
          S('matlStatsGroup', 'Matl Stats Grp', 'VERSG'),
          S('materialPricingGroup', 'Mat. Pricing Grp', 'KONDM'),
          S('volRebateGroup', 'Vol Rebate Grp', 'BONUS'),
          S('accountAssignmentGroup', 'Acct Asgnmt Grp', 'KTGRM'),
          R('genItemCatGroup', 'GenItemCatGroup'),
          S('itemCategoryGroup', 'Item Cat Group', 'MTPOS'),
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
          S('replacementPart', 'Replacemt part', 'ATPKZ'),
          R('grossWeight', 'Gross Weight'),
          R('weightUnit', 'Weight unit'),
          S('discountInKind', 'Discount in kind', 'NRFHG'),
          R('netWeight', 'Net Weight'),
          T('materialFreightGroup', 'Material frieght grp', 'MFRGR', { maxLength: 8 }),
          S('availabilityCheck', 'Availity check', 'MTVFP'),
          C('approvedBatchRec', 'Aprovd Batch rec. req.', 'KZECH'),
          C('batchManagement', 'BatchManagement', 'XCHPF'),
        ],
      },
      {
        title: 'Shiping Data',
        fields: [
          S('transportGroup', 'Trans. Group', 'TRAGR'),
          S('loadingGroup', 'Loading Group', 'LADGR'),
          N('setupTime', 'Setup time', 'VRVEZ'),
          N('processingTime', 'Processing time', 'VBEAZ'),
          N('baseQuantity', 'Base quantity', 'VBAMG'),
          T('matlGrpPckmat', 'Matl Grp Pckmat', 'MAGRV', { maxLength: 4 }),
          C('negStocks', 'Neg. stocks', 'XMCNG'),
          S('profitCenter', 'Profit Center', 'PRCTR'),
          T('serialNoProfile', 'SerialNoProfile', 'SERNP', { maxLength: 4 }),
          T('distProfile', 'Dist.prof', 'FPRFM', { maxLength: 3 }),
          S('serializLevel', 'SerializLevel', 'SERLV'),
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
          S('exemptionCert', 'ExemptionCert', 'PREFE'),
          T('exemptCertNo', 'Exempt.cert.no', 'PRENO', { maxLength: 8 }),
          D('exemptCertDate', 'Iss.date of ex.cert', 'PREND'),
          C('militaryGoods', 'Military goods', 'ITARK'),
        ],
      },
      {
        title: 'Market Organization Data',
        fields: [
          S('countryOfOrigin', 'Country of origin', 'HERKL'),
          S('regionOfOrigin', 'Region. of origin', 'HERKR'),
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
          S('orderUnit', 'Order Unit', 'BSTME'),
          S('varOrderUnit', 'Var. Order Unit', 'VABME'),
          S('purchasingGroup', 'Purchsing Group', 'EKGRP'),
          R('materialGroup', 'Material Group'),
          S('plantMatlStatus', 'Plant-sp.matl status', 'MMSTA'),
          D('plantMatlValidFrom', 'Valid From', 'MMSTD'),
          S('taxIndicator', 'Tax Indicator for material', 'TAXIM'),
          S('qualFreeGoods', 'Qual.f.FreeGoodsDis.', 'NRFHG_P'),
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
          S('unitOfIssue', 'Unit of Issue', 'AUSME'),
          S('productionUnit', 'Production Unit', 'FRTME'),
          S('psMatlStatus', 'PS Matl. Status', 'MMSTA_PS'),
          T('prodSupervisor', 'Prodn Supervisor', 'FEVOR', { maxLength: 3 }),
          T('prodStorLoc', 'Prod.Stor.Loc', 'LGPRO', { maxLength: 4 }),
          S('prodSchedProfile', 'Prod.Sched.Prof', 'SFCPF', { required: true }),
          T('matGrouping', 'Mat. Grouping', 'MATGR', { maxLength: 20 }),
          T('overallProfile', 'Overall Profile', 'UEPRF', { maxLength: 7 }),
          C('inspStock', 'Insp. Stock', 'INSMK_WS'),
          R('criticalPart', 'Critical Part'),
          C('versionIndicator', 'Version Indicator', 'VERKZ'),
          C('batchRecReq', 'Batch rec. req', 'KZECH_WS'),
          R('batchManagement', 'Batch Management'),
          S('batchEntry', 'Batch Entry', 'KZECH_E'),
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
          S('importCountry', 'Country', 'LAND1'),
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
          S('abcIndicator', 'ABC Indicator', 'MAABC'),
          R('plantMatlValidFrom', 'Valid From'),
          R('plantMatlStatus', 'Plant-sp.matl status'),
          S('mrpType', 'MRP Type', 'DISMM'),
          N('reorderPoint', 'Reorder Point', 'MINBE'),
          N('planningTimeFence', 'Plng time fence', 'FXHOR', { integer: true }),
          T('planningCycle', 'Planning cycle', 'LFRHY', { maxLength: 3 }),
          S('mrpController', 'MRP Controller', 'DISPO', { required: true }),
          T('commCode', 'Comm Code', 'STAWN_M', { maxLength: 17 }),
        ],
      },
      {
        title: 'Lot Size Data',
        fields: [
          S('lotSize', 'Lot size', 'DISLS', { required: true }),
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
          S('procurementType', 'Procurement type', 'BESKZ'),
          R('batchEntry', 'Batch Entry'),
          T('specialProcurement', 'SpecProcurement', 'SOBSL', { maxLength: 2 }),
          R('prodStorLoc', 'Prod.stor.location'),
          R('quotaArrUsage', 'Quota arr.usage'),
          T('defaultSupplyArea', 'Default supply area', 'VSPVB', { maxLength: 10 }),
          S('backflush', 'Backflush', 'RGEKZ'),
          T('storageLocForEp', 'Storage loc. for EP', 'LGFSB', { maxLength: 4 }),
          S('jitDeliverySched', 'JIT DeliverSched.', 'FABKZ_M'),
          T('stockDetGroup', 'Stock det. grp', 'EPRIO', { maxLength: 4 }),
          C('bulkMaterial', 'Bulk Material', 'SCHGT'),
          N('inHouseProduction', 'In-house productin', 'DZEIT', { integer: true, unit: 'Days' }),
          N('plannedDeliveryDays', 'Pland.Deliv.Time', 'PLIFZ', { integer: true, unit: 'Days' }),
          R('grProcessingTime', 'GR Proc Time'),
          S('planningCalendar', 'Planig calendar', 'MRPPP'),
          S('schedMarginKey', 'SchedMargin key', 'FHORI', { required: true }),
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
          S('safetyTimeInd', 'Safety time ind', 'SHFLG'),
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
          S('periodIndicator', 'Period Indicator', 'PERKZ'),
          T('fiscalYearVariant', 'Fiscal.Year Variant', 'PERIV', { maxLength: 2 }),
          T('splittingIndicator', 'Splitting Indicator', 'AUFTL', { maxLength: 1 }),
          S('strategyGroup', 'Strategy group', 'STRGR'),
          S('consumptionMode', 'Consumption mode', 'VRMOD'),
          N('bwdConsumption', 'BWD consumption per.', 'VINT1', { integer: true }),
          N('fwdConsumption', 'Fwd consumption per.', 'VINT2', { integer: true }),
          S('mixedMrp', 'Mixed MRP', 'MISKZ'),
          T('planningMaterial', 'Planing material', 'VPMAT', { maxLength: 40 }),
          S('planningPlant', 'Planning plant', 'VPWRK', { help: 'WERKS' }),
          N('planningConvFactor', 'PlngConvFactor', 'UMREF'),
          S('planningMatlBaseUnit', 'Plng matl BUnit', 'VPBME'),
        ],
      },
      {
        title: 'Availability / Plant-specific configuration',
        fields: [
          R('availabilityCheck', 'Availability.check'),
          N('totalReplLeadTime', 'Tot. repl. lead time', 'WZEIT', { integer: true, unit: 'Days' }),
          S('crossProject', 'Cross-project', 'KZPSP'),
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
          S('selectionMethod', 'Selection Method', 'ALTSL'),
          N('compScrap', 'Comp scrap (%)', 'KAUSF', { unit: '%' }),
          S('indivColl', 'Indiv./coll.', 'SBDKZ'),
          T('reqmtsGrouping', 'Reqmts grouping', 'KZBED', { maxLength: 1 }),
          C('mrpVersion', 'Version', 'VERKZ_M'),
          C('remAllowed', 'REM allowed', 'SAUFT'),
          S('mrpDepRequirements', 'MRP Dep.Requirements', 'AHDIS'),
          S('discontinuationInd', 'Discontin. Indictor', 'KZAUS'),
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
          S('pushDistribution', 'Push Distribution', 'SHFLG_P'),
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
          S('forecastModel', 'Forecast Model', 'PRMOD', { required: true }),
          R('periodIndicator', 'Period Indicator'),
          D('lastForecast', 'Last forecast', 'PRDAT'),
          R('fiscalYearVariant', 'Fi.Year Variant'),
          T('refMatlCons', 'Ref. matl: cons.', 'VRBMT', { maxLength: 40 }),
          S('refPlantCons', 'Ref.plant: cons.', 'VRBWK', { help: 'WERKS' }),
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
          S('storageConditions', 'Storage conditions', 'RAUBE'),
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
          S('storageTimeUnit', 'Time unit', 'LZEIH'),
          N('minRemainingShelfLife', 'Min. Rem. Shelf Life', 'MHDRZ', { integer: true }),
          N('storagePct', 'Storage %', 'MHDLP', { unit: '%' }),
          N('totalShelfLife', 'Total shelf life', 'MHDHB', { integer: true }),
          S('periodIndSled', 'Period Ind. for SLED', 'IPRKZ'),
          S('roundingRuleSled', 'Rounding rule', 'RDMHD'),
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
          S('wmUnit', 'WM unit', 'LVSME'),
          R('grossWeight', 'Gross Weight'),
          R('weightUnit', 'Unit of Weight'),
          R('unitOfIssue', 'Unit of Issue'),
          R('volume', 'Volume'),
          R('volumeUnit', 'Volume Unit'),
          S('proposedUom', 'Proposed UoM from material', 'VOMEM'),
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
          S('twoStepPicking', '2-step picking', 'L2SKR'),
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
          N('leQty1', 'LE Qty', 'LHMG1'), S('leUom1', 'Unit Of Measure', 'LHME1'), T('suType1', 'Stor. Unit type', 'LETY1', { maxLength: 3 }),
          N('leQty2', 'LE Qty2', 'LHMG2'), S('leUom2', 'Unit Of Measure2', 'LHME2'), T('suType2', 'Stor. Unit type2', 'LETY2', { maxLength: 3 }),
          N('leQty3', 'LE Qty3', 'LHMG3'), S('leUom3', 'Unit Of Measure3', 'LHME3'), T('suType3', 'Stor. Unit type3', 'LETY3', { maxLength: 3 }),
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
          S('psMatlStatusQm', 'P-S matl status', 'MMSTA_Q'),
          C('qmProcActive', 'QM procurement', 'QMPUR'),
          S('qmControlKey', 'QM Control Key', 'SSQSS'),
          S('certificateType', 'CertificateType', 'QZGTP'),
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
          S('currency', 'Currency', 'WAERS'),
          T('currentPeriod', 'Current Period', 'LFMON', { maxLength: 2 }),
          R('division', 'Division'),
          T('priceDeterm', 'Price Determ.', 'MLAST', { maxLength: 1 }),
          S('valuationClass', 'Valuat Class', 'BKLAS', { required: true }),
          C('mlActive', 'ML act.', 'MLMAA'),
        ],
      },
      {
        title: 'Current Valuation Data',
        fields: [
          T('vcSalesOrderStock', 'VC: Sal. Ord. Stk', 'EKLAS', { maxLength: 4 }),
          T('projectStockVc', 'Project stk Val. cl.', 'QKLAS', { maxLength: 4 }),
          S('priceControl', 'Price Control', 'VPRSV', { required: true }),
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
            key: 'descriptions', label: 'Descriptions per language', tech: 'MAKT', type: 'table', wide: true, maxRows: 1,
            columns: [
              { key: 'lang', label: 'Language', type: 'select', help: 'SPRAS', required: true },
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
              { key: 'altUnit', label: 'AlternativeUnit', type: 'select', help: 'MEINS' },
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
        fields: [{ key: 'attachments', label: 'Uploaded files', tech: 'GOS', type: 'attachments', wide: true }],
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
