import { HistoryEntry, MaterialData, MaterialRecord, MdmRequest, StatusCode, ViewId } from './types';
import { ALL_FIELD_KEYS, ALL_VIEW_IDS } from './fieldConfig';
import { viewDefaults } from './materialViews';
import { levelDef, userById } from './workflowConfig';

const KEY_DATA_KEYS = [
  'materialNumber', 'materialType', 'industrySector', 'materialGroup', 'businessVertical', 'scheme', 'prodHierarchy', 'division',
  'description', 'longText', 'plant', 'storageLocation', 'salesOrg', 'distChannel', 'warehouseNo', 'storageType',
];

/** Empty record: key data plus every view field of lib/materialViews.ts */
export const emptyMaterial = (): MaterialData =>
  Object.fromEntries([...KEY_DATA_KEYS, ...ALL_FIELD_KEYS].map((k) => [k, ''])) as MaterialData;

/** A fully maintained FERT data set (key data from the initiator, views from the reviewers, rule defaults applied) */
const full = (d: Partial<MaterialData>): MaterialData => ({
  ...emptyMaterial(),
  ...viewDefaults('FERT'),
  materialType: 'FERT', industrySector: 'F', businessVertical: '01', scheme: '0',
  storageLocation: '0003', salesOrg: '1000', distChannel: '10',
  oldMaterialNo: '', volume: '', volumeUnit: 'ML', eanCategory: 'HE',
  skuSize: '1', brandCode: '100010001', crsSkuGrCode: '100010001', crsProducts: '100010001', moldDesignCode: '0000000000',
  batchManagement: 'X', countryOfOrigin: 'IN', regionOfOrigin: 'WB', purchasingGroup: '001',
  procurementType: 'E', abcIndicator: 'A', plannedDeliveryDays: '0', inHouseProduction: '2',
  storageConditions: '02', totalShelfLife: '1095', minRemainingShelfLife: '365',
  qmProcActive: 'X', certificateType: 'COA', inspectionInterval: '30',
  ...d,
  deliveringPlant: d.deliveringPlant ?? d.plant ?? '',
  descriptions: JSON.stringify([{ lang: 'EN', text: d.description ?? '' }]),
  importCountry: 'IN',
});

const rec = (d: MaterialData, transId: string, createdOn: string): MaterialRecord => ({ ...d, transId, createdOn, createdBy: 'Rahul Sharma' });

export const SEED_MATERIALS: MaterialRecord[] = [
  rec(full({ materialNumber: '100000101', materialGroup: '401', division: '01', prodHierarchy: '001001001002001001', description: 'GLOWRA FAIRNESS CREAM 50G', plant: '1000', warehouseNo: 'K01', storageType: '001', grossWeight: '0.065', netWeight: '0.05', hsnCode: '33049910', standardPrice: '85' }), 'MC0000000981', '2026-06-04T10:00:00+05:30'),
  rec(full({ materialNumber: '100000102', materialGroup: '402', division: '02', prodHierarchy: '001002001002001001', description: 'COOLBREEZE COOL TALC 200G', plant: '1100', warehouseNo: 'G01', storageType: '002', grossWeight: '0.23', netWeight: '0.2', hsnCode: '33049120', standardPrice: '120' }), 'MC0000000990', '2026-07-15T12:30:00+05:30'),
  rec(full({ materialNumber: '100000103', materialGroup: '404', division: '03', prodHierarchy: '002001001002001001', description: 'VEDARA PAIN BALM 25ML', plant: '1200', grossWeight: '0.04', netWeight: '0.03', hsnCode: '30049011', standardPrice: '95', profitCenter: 'UN13', mrpController: '002' }), 'MC0000001004', '2026-08-22T09:10:00+05:30'),
  rec(full({ materialNumber: '100000104', materialGroup: '407', division: '04', prodHierarchy: '003001001002001001', description: 'PUREHARVEST MUSTARD OIL 1L', plant: '1300', grossWeight: '0.95', netWeight: '0.91', hsnCode: '15149120', standardPrice: '180', profitCenter: 'UN05', mrpController: '003', purchasingGroup: '002' }), 'MC0000001011', '2026-09-30T16:45:00+05:30'),
];

const h = (at: string, userId: string, action: string, status: StatusCode, comment?: string): HistoryEntry => {
  const u = userById(userId)!;
  return { at, by: u.name, department: u.department, level: u.level, action, status, comment };
};
const submitted = (at: string): HistoryEntry => h(at, 'RSHARMA', 'Submitted', '01');
const approvedBy = (level: number, at: string, comment?: string): HistoryEntry => {
  const ids = ['NKAPOOR', 'VRAO', 'SIYER', 'AMENON', 'KREDDY', 'IKHAN', 'AMEHTA'];
  const next = levelDef(level + 1);
  return h(at, ids[level - 1], next ? `Approved – sent to level ${level + 1} (${next.team})` : 'Approved', '01', comment);
};

const req = (r: Omit<MdmRequest, 'appId' | 'views' | 'initiator' | 'materialNumber'> & Partial<MdmRequest>): MdmRequest => ({
  appId: 'MC', views: ALL_VIEW_IDS as ViewId[], initiator: 'RSHARMA', materialNumber: '', ...r,
});

const coldCream = full({ materialGroup: '401', division: '01', prodHierarchy: '001001002002001001', description: 'GLOWRA COLD CREAM 100ML', plant: '1000', warehouseNo: 'K01', storageType: '001', grossWeight: '0.13', netWeight: '0.1', standardPrice: '' });
const chyawanprash = full({ materialGroup: '404', division: '03', prodHierarchy: '002001002001001001', description: 'VEDARA CHYAWANPRASH 500G', plant: '1200', grossWeight: '0.6', netWeight: '0.5', hsnCode: '30049011', standardPrice: '', profitCenter: 'UN13', mrpController: '002' });
const coolOil = full({ materialGroup: '413', division: '02', prodHierarchy: '001002002002001001', description: 'COOLBREEZE COOL OIL 180ML', plant: '1100', warehouseNo: 'G01', storageType: '001', grossWeight: '0.2', netWeight: '0.17', hsnCode: '33059011', standardPrice: '' });
const antiseptic = full({ materialGroup: '409', division: '05', prodHierarchy: '002002001002001001', description: 'HERBOCARE ANTISEPTIC CREAM 40ML', longText: 'Ayurvedic antiseptic cream, 40 ml tube, carton of 144.', plant: '1000', warehouseNo: 'K01', storageType: '003', grossWeight: '0.055', netWeight: '0.04', hsnCode: '30049011', standardPrice: '68', profitCenter: 'UN13', mrpController: '002' });
const honey = full({ materialGroup: '407', division: '04', prodHierarchy: '003001002002001001', description: 'PUREHARVEST HONEY 500G', plant: '1300', grossWeight: '0.5', netWeight: '0.5', hsnCode: '04090000', ean: '8901248100125', standardPrice: '', profitCenter: 'UN05', mrpController: '003' });
const talc400 = full({ materialGroup: '402', division: '02', prodHierarchy: '001002001003002002', scheme: 'C', description: 'COOLBREEZE COOL TALC 400G HERBAL', plant: '1000', warehouseNo: 'K02', storageType: '002', grossWeight: '0.45', netWeight: '0.4', hsnCode: '33049120', standardPrice: '210' });
const trialPack = full({ materialGroup: '401', division: '01', prodHierarchy: '001001001001001004', description: 'GLOWRA FAIRNESS CREAM 25G TRIAL', plant: '1000', grossWeight: '0.035', netWeight: '0.025', hsnCode: '33049910', standardPrice: '' });

export const SEED_REQUESTS: MdmRequest[] = [
  req({
    transId: 'MC0000001021', status: '00', level: 0, data: coldCream,
    createdOn: '2026-10-29T17:20:00+05:30', changedOn: '2026-10-29T17:20:00+05:30',
    history: [h('2026-10-29T17:20:00+05:30', 'RSHARMA', 'Saved as draft', '00')],
  }),
  req({
    transId: 'MC0000001022', status: '01', level: 1, data: chyawanprash,
    createdOn: '2026-10-28T11:00:00+05:30', changedOn: '2026-10-28T11:05:00+05:30',
    history: [submitted('2026-10-28T11:05:00+05:30')],
  }),
  req({
    transId: 'MC0000001023', status: '01', level: 3, data: coolOil,
    createdOn: '2026-10-26T09:30:00+05:30', changedOn: '2026-10-28T15:10:00+05:30',
    history: [submitted('2026-10-26T09:40:00+05:30'), approvedBy(1, '2026-10-27T10:15:00+05:30'), approvedBy(2, '2026-10-28T15:10:00+05:30', 'Transport group kept as cartons; depot to confirm if pallets are needed for modern trade.')],
  }),
  req({
    transId: 'MC0000001024', status: '01', level: 7, data: antiseptic,
    createdOn: '2026-10-19T10:00:00+05:30', changedOn: '2026-10-29T12:00:00+05:30',
    history: [
      submitted('2026-10-19T10:10:00+05:30'), approvedBy(1, '2026-10-20T11:00:00+05:30'), approvedBy(2, '2026-10-21T09:30:00+05:30'),
      approvedBy(3, '2026-10-22T14:00:00+05:30', 'HSN 30049011 confirmed for ayurvedic antiseptic cream.'), approvedBy(4, '2026-10-24T10:20:00+05:30'),
      approvedBy(5, '2026-10-27T16:40:00+05:30'), approvedBy(6, '2026-10-29T12:00:00+05:30'),
    ],
  }),
  req({
    transId: 'MC0000001025', status: '02', level: 0, sentBackFrom: 4, data: honey,
    createdOn: '2026-10-21T13:00:00+05:30', changedOn: '2026-10-28T10:30:00+05:30',
    history: [
      submitted('2026-10-21T13:10:00+05:30'), approvedBy(1, '2026-10-22T09:00:00+05:30'), approvedBy(2, '2026-10-23T11:20:00+05:30'), approvedBy(3, '2026-10-26T15:30:00+05:30'),
      h('2026-10-28T10:30:00+05:30', 'AMENON', 'Sent back to initiator', '02', 'Honey is packed at Kolkata, not Baddi. Please change the plant to 1000 and pick the storage location again.'),
    ],
  }),
  req({
    transId: 'MC0000001026', status: '04', level: 5, forward: { to: 'SIYER', by: 'KREDDY', level: 5 }, data: talc400,
    createdOn: '2026-10-20T08:30:00+05:30', changedOn: '2026-10-29T15:00:00+05:30',
    history: [
      submitted('2026-10-20T08:40:00+05:30'), approvedBy(1, '2026-10-21T10:00:00+05:30'), approvedBy(2, '2026-10-22T10:00:00+05:30'),
      approvedBy(3, '2026-10-23T12:00:00+05:30'), approvedBy(4, '2026-10-27T09:45:00+05:30'),
      h('2026-10-29T15:00:00+05:30', 'KREDDY', 'Forwarded to Sunita Iyer for input', '04', 'Talc will be sourced from an imported supplier for 6 months. Does this change country of origin or HSN?'),
    ],
  }),
  req({
    transId: 'MC0000001027', status: '03', level: 2, data: trialPack,
    createdOn: '2026-10-15T10:00:00+05:30', changedOn: '2026-10-17T11:30:00+05:30',
    history: [
      submitted('2026-10-15T10:05:00+05:30'), approvedBy(1, '2026-10-16T09:20:00+05:30'),
      h('2026-10-17T11:30:00+05:30', 'VRAO', 'Rejected', '03', 'Trial packs are not saleable. Raise them under material group 410 (FG Samples).'),
    ],
  }),
  req({
    transId: 'MC0000001011', status: '05', level: 7, materialNumber: '100000104', data: SEED_MATERIALS[3],
    createdOn: '2026-09-18T09:00:00+05:30', changedOn: '2026-09-30T16:45:00+05:30',
    history: [
      submitted('2026-09-18T09:05:00+05:30'), approvedBy(1, '2026-09-19T10:00:00+05:30'), approvedBy(2, '2026-09-21T10:00:00+05:30'),
      approvedBy(3, '2026-09-23T10:00:00+05:30'), approvedBy(4, '2026-09-24T10:00:00+05:30'), approvedBy(5, '2026-09-26T10:00:00+05:30'),
      approvedBy(6, '2026-09-29T10:00:00+05:30'), h('2026-09-30T16:44:00+05:30', 'AMEHTA', 'Approved', '05'),
      { at: '2026-09-30T16:45:00+05:30', by: 'SAP', department: 'System', level: null, action: 'Posted – material 100000104 created', status: '05' },
    ],
  }),
];
