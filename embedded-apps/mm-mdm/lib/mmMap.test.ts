/**
 * Unit tests of lib/mmMap.ts (mapping of the flat screen model to the backend model and back).
 * Run: npm test   (node's test runner through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBindings, changedFields, normForCompare, fromBackend, fromValue, indexFieldControl, isDirty, knownFields, messageField, toFieldMessages, toPatch, toValue, viewSelected, SAP_VIEWS_OF,
} from './mmMap';
import type { BackendData, FieldControl } from './mmApi';
import { VIEWS } from './materialViews';

/** Shaped like GET /requests/:id of backend/mmMdm.js (fromOData: upper-case ABAP names, dates as YYYY-MM-DD only for catalogue DATS fields) */
const backend = (): BackendData => ({
  single: {
    Material: { MTART: 'FERT', MBRSH: 'F', MATKL: '401', SPART: '01', PRDHA: '010001000200030004000500', MEINS: 'PC', BRGEW: 1.5, NTGEW: '1.200', GEWEI: 'KG', KZEFF: 'X', MSTDE: '2026-01-31', NRFHG: '', PRDHA2: 'x' },
    Description: { SPRAS: 'EN', MAKTX: 'GLOWRA COLD CREAM 100ML' },
    Plant: { WERKS: '1000', DISMM: 'PD', MINBE: 5, NRFHG: 'NORM', AUSDT: '', XCHPF: true, STAWN: '33049990' },
    SalesOrg: { VKORG: '1000', VTWEG: '10', DWERK: '1000', VMSTD: '' },
    Valuation: { BKLAS: '7920', VPRSV: 'S', STPRS: '10.00', BWTAR: '' },
    StorageLocation: { LGORT: '0001', LGPBE: 'A-1' },
    WarehouseData: { LGNUM: 'K01' },
    StorageTypeData: { LGNUM: 'K01', LGTYP: '001' },
    ForecastParameter: { PRMOD: 'D', PRDAT: '2026-02-01' },
  },
  multi: {
    UnitOfMeasure: [
      { MEINH: 'CS', UMREZ: 12, UMREN: 1, EAN11: '' },
      { MEINH: 'KG', UMREZ: '1', UMREN: '1' },
    ],
    SalesTaxData: [
      { SRNO: '001', ALAND: 'IN', TATYP: 'JOIG', TAXKD: '0' },
      { SRNO: '002', ALAND: 'IN', TATYP: 'JTC1', TAXKD: '0' },
    ],
    TaxClassification: [{ ALAND: 'IN' }],
    LongText: [
      { MATNR: '', FID: 'GRUN', TEXT: 'Basic text' },
      { MATNR: '', FID: 'LTXT', TEXT: 'Key long text' },
    ],
    ProductionVersion: [{ SLNO: '0001', VERID: '0001', TEXT1: 'Standard', ADATU: '2026-01-01' }],
    ClassCharacteristic: [],
    InspectionType: [],
    ConsumptionData: [],
  },
  views: ['MARA_BASIC1', 'MARC_MRP1', 'TEXT'],
});

test('key data and view fields are read from their entities', () => {
  const d = backend();
  const flat = fromBackend(d);
  assert.equal(flat.materialType, 'FERT');
  assert.equal(flat.materialGroup, '401');
  assert.equal(flat.division, '01');
  assert.equal(flat.prodHierarchy, '010001000200030004000500');
  assert.equal(flat.description, 'GLOWRA COLD CREAM 100ML');
  assert.equal(flat.plant, '1000');
  assert.equal(flat.storageLocation, '0001');
  assert.equal(flat.salesOrg, '1000');
  assert.equal(flat.distChannel, '10');
  assert.equal(flat.warehouseNo, 'K01');
  assert.equal(flat.storageType, '001');
  assert.equal(flat.longText, 'Key long text');
  assert.equal(flat.baseUom, 'PC');
  assert.equal(flat.grossWeight, '1.5');       // number -> string
  assert.equal(flat.netWeight, '1.200');
  assert.equal(flat.assignEffVals, 'X');       // KZEFF 'X'
  assert.equal(flat.xPlantValidFrom, '2026-01-31'); // MSTDE date
  assert.equal(flat.mrpType, 'PD');            // MARC.DISMM
  assert.equal(flat.priceControl, 'S');        // MBEW.VPRSV, shown by 'ref' fields in other tabs through the same key
});

test('the entity follows the view table: MARC fields come from Plant, MBEW from Valuation, MVKE from SalesOrg', () => {
  const b = buildBindings(knownFields(backend()));
  const of = (tech: string) => Object.values(b.byKey).find((x) => x.tech === tech && !x.alias);
  assert.equal(of('DISMM')?.entity, 'Plant');
  assert.equal(of('BKLAS')?.entity, 'Valuation');
  assert.equal(of('DWERK')?.entity, 'SalesOrg');
  assert.equal(of('LGPBE')?.entity, 'StorageLocation'); // view 'MARC / MARD': not in Plant, found in StorageLocation
  assert.equal(of('LGNUM')?.key, 'warehouseNo');        // carried by the key field
  assert.equal(b.byKey.warehouseNo.entity, 'WarehouseData');
  assert.equal(b.byKey.storageType.entity, 'StorageTypeData');
});

test('a field no entity has stays unbound (never invented), classification included', () => {
  const b = buildBindings(knownFields(backend()));
  const lost = new Set(b.unbound.map((u) => u.tech));
  assert.ok(lost.has('ZSKUGRCODE'));   // Emami fields SAP did not return
  assert.ok(!lost.has('KSSK'));     // classification rows: bound to ClassCharacteristic
  assert.ok(lost.has('AUSP'));      // characteristic values: no entity of their own
  assert.ok(!lost.has('ZCOMMENT')); // comments: the request comments of the backend
  assert.equal(b.byKey.classAssignments.entity, 'ClassCharacteristic');
  assert.equal(b.byKey.initiatorComments.kind, 'comments');
  assert.equal(b.byKey.classCharacteristics, undefined);
});

test('a field SAP has but the static catalogue lacks binds through the returned row keys', () => {
  const d = backend();
  d.single.Material.ZSKUGRCODE = 'GR1';
  const b = buildBindings(knownFields(d));
  assert.equal(Object.values(b.byKey).find((x) => x.tech === 'ZSKUGRCODE')?.entity, 'Material');
  assert.equal(fromBackend(d, b).skuGrCode, 'GR1');
});

test('a second field with the same SAP column is a read-only mirror (alias)', () => {
  const b = buildBindings(knownFields(backend()));
  const nrfhg = Object.values(b.byKey).filter((x) => x.entity === 'Plant' && x.field === 'NRFHG');
  assert.ok(nrfhg.length >= 2);
  assert.equal(nrfhg.filter((x) => !x.alias).length, 1);
  assert.ok(nrfhg.some((x) => x.tech === 'NRFHG_P' && x.alias));
});

test('toPatch sends only what changed, keeps SAP types, and always the view flags', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  assert.deepEqual(toPatch(flat, d, b), { single: {}, multi: {}, views: ['MARA_BASIC1', 'MARC_MRP1', 'TEXT'] });
  assert.equal(isDirty(flat, d, b), false);

  flat.mrpType = 'VB';              // string
  flat.grossWeight = '2.5';         // SAP sent a number -> a number goes back
  flat.assignEffVals = '';          // checkbox 'X' -> ''
  flat.xPlantValidFrom = '';        // date cleared -> null
  flat.docType = 'PDF';             // unbound? ZEIAR is a MARA field
  const p = toPatch(flat, d, b);
  assert.deepEqual(p.single.Plant, { DISMM: 'VB' });
  assert.equal(p.single.Material.BRGEW, 2.5);
  assert.equal(p.single.Material.KZEFF, '');
  assert.equal(p.single.Material.MSTDE, null);
  assert.equal(p.single.Material.ZEIAR, 'PDF');
  assert.equal(isDirty(flat, d, b), true);

  // MARC.XCHPF is a boolean in SAP's answer: it goes back as a boolean
  const batch = Object.values(b.byKey).find((x) => x.tech === 'XCHPF' && x.entity === 'Plant' && !x.alias)!;
  assert.equal(flat[batch.key], 'X');
  flat[batch.key] = '';
  assert.strictEqual(toPatch(flat, d, b).single.Plant.XCHPF, false);
});

test('aliases and fields the user may not edit are never written', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  flat.mrpType = 'VB';
  flat.description = 'NEW TEXT';
  const none = toPatch(flat, d, b, () => false);
  assert.deepEqual(none.single, {});
  const onlyType = toPatch(flat, d, b, (x) => x.key === 'mrpType');
  assert.deepEqual(Object.keys(onlyType.single), ['Plant']);
});

test('units of measure round-trip and keep the rows SAP sent', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  const rows = JSON.parse(flat.uomConversions);
  assert.deepEqual(rows[0], { denominator: '1', altUnit: 'CS', numerator: '12', baseUnit: 'PC' });
  rows[0].numerator = '24';
  rows.push({ denominator: '1', altUnit: 'L', numerator: '2', baseUnit: 'PC' });
  flat.uomConversions = JSON.stringify(rows);
  const p = toPatch(flat, d, b);
  assert.equal(p.multi.UnitOfMeasure.length, 3);
  assert.equal(p.multi.UnitOfMeasure[0].UMREZ, 24);        // CS was numeric
  assert.equal(p.multi.UnitOfMeasure[0].EAN11, '');        // other columns of the row survive
  assert.equal(p.multi.UnitOfMeasure[2].MEINH, 'L');
  assert.equal(p.multi.LongText, undefined);               // untouched entities are not sent
});

test('removing a unit row omits it (the backend deletes rows missing from the list)', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  flat.uomConversions = JSON.stringify(JSON.parse(flat.uomConversions).slice(0, 1));
  assert.deepEqual(toPatch(flat, d, b).multi.UnitOfMeasure.map((r) => r.MEINH), ['CS']);
});

test('tax table: per country and category from SalesTaxData, the class is the only editable cell', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  const rows = JSON.parse(flat.taxData);
  assert.deepEqual(rows.map((r: Record<string, string>) => [r.country, r.taxCat, r.taxClass]), [['IN', 'JOIG', '0'], ['IN', 'JTC1', '0']]);
  rows[1].taxClass = '1';
  flat.taxData = JSON.stringify(rows);
  const p = toPatch(flat, d, b);
  assert.deepEqual(p.multi.SalesTaxData.map((r) => [r.SRNO, r.TATYP, r.TAXKD]), [['001', 'JOIG', '0'], ['002', 'JTC1', '1']]);
});

test('descriptions table is the single Description row; the key-data description wins over it', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  assert.deepEqual(JSON.parse(flat.descriptions), [{ lang: 'EN', text: 'GLOWRA COLD CREAM 100ML' }]);
  flat.descriptions = JSON.stringify([{ lang: 'EN', text: 'FROM TABLE' }]);
  assert.deepEqual(toPatch(flat, d, b).single.Description, { SPRAS: 'EN', MAKTX: 'FROM TABLE' });
  flat.description = 'FROM KEY DATA';
  assert.equal(toPatch(flat, d, b).single.Description.MAKTX, 'FROM KEY DATA');
});

test('long texts: key-data long text and the Text view map to LongText rows by FID, new rows are created', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  assert.equal(flat.basicDataText, 'Basic text');
  flat.basicDataText = 'Changed';
  flat.inspectionText = 'New inspection text';
  const p = toPatch(flat, d, b);
  const by = Object.fromEntries(p.multi.LongText.map((r) => [r.FID, r.TEXT]));
  assert.deepEqual(by, { GRUN: 'Changed', LTXT: 'Key long text', PRUE: 'New inspection text' });
});

test('first row of a multi-row entity carries single fields (production version) but a missing row is never created', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  assert.equal(b.byKey.versionText ? b.byKey.versionText.kind : 'row0', 'row0');
  const bd = Object.values(b.byKey).find((x) => x.tech === 'VERID');
  assert.equal(bd?.kind, 'row0');
  const flat = fromBackend(d, b);
  assert.equal(flat[bd!.key], '0001');
  flat[bd!.key] = '0002';
  assert.equal(toPatch(flat, d, b).multi.ProductionVersion[0].VERID, '0002');
  const noRow = backend(); noRow.multi.ProductionVersion = [];
  const b2 = buildBindings(knownFields(noRow));
  assert.equal(Object.values(b2.byKey).find((x) => x.tech === 'VERID'), undefined);
});

test('value conversion: dates (DATS text, /Date(ms)/, zero dates), flags and numbers', () => {
  assert.equal(fromValue('date', '/Date(1769817600000)/'), '2026-01-31');
  assert.equal(fromValue('date', '0000-00-00'), '');
  assert.equal(fromValue('date', '20260131'), '2026-01-31');
  assert.equal(fromValue('checkbox', true), 'X');
  assert.equal(fromValue('checkbox', false), '');
  assert.equal(fromValue('number', 3), '3');
  assert.equal(toValue('checkbox', 'X', true), true);
  assert.equal(toValue('checkbox', '', false), false);
  assert.equal(toValue('checkbox', 'X', 'X'), 'X');
  assert.equal(toValue('number', '', 7), 0);
  assert.equal(toValue('date', '2026-02-01', ''), '2026-02-01');
});

test('SAP messages are mapped to the screen field of their target', () => {
  const b = buildBindings(knownFields(backend()));
  assert.equal(messageField('Plant.DISMM', b)?.key, 'mrpType');
  assert.equal(messageField('Plant/DISMM', b)?.key, 'mrpType');
  assert.equal(messageField('MARA-MATKL', b)?.key, 'materialGroup');
  assert.equal(messageField('Description.MAKTX', b)?.key, 'description');
  assert.equal(messageField('Unknown.NOPE', b), null);
  const m = toFieldMessages([
    { severity: 'E', message: 'MRP type is required', target: 'Plant.DISMM', code: 'MM001' },
    { severity: 'W', message: 'Check the group', target: '', code: '' },
    { severity: 'S', message: 'ok', target: '', code: '' },
  ], b);
  assert.equal(m[0].field, 'mrpType');
  assert.equal(m[0].view, 'mrp1');
  assert.equal(m[1].field, undefined);
  assert.equal(m[2].severity, 'I');
});

test('field control: merged over SAP views, general rules separate, entity-wide rule for texts', () => {
  const fc: FieldControl = {
    MARC_MRP1: [
      { field: 'Plant.DISMM', shown: true, displayOnly: true, required: false, column: '', source: 'view' },
      { field: 'Plant.MINBE', shown: true, displayOnly: false, required: true, column: '', source: 'view' },
    ],
    MARC_MRP2: [{ field: 'Plant.DISMM', shown: true, displayOnly: false, required: false, column: '', source: 'view' }],
    '': [{ field: '.MTART', shown: true, displayOnly: true, required: true, column: '', source: 'general' }],
  };
  const idx = indexFieldControl(fc);
  assert.equal(idx.empty, false);
  assert.deepEqual(idx.of('Plant', 'DISMM'), { shown: true, displayOnly: false, required: false }); // editable in one view
  assert.equal(idx.of('Plant', 'MINBE')?.required, true);
  assert.equal(idx.general('MTART')?.displayOnly, true);
  assert.equal(idx.of('Plant', 'NOPE'), null);
  assert.equal(idx.ofEntity('Plant')?.shown, true);
  assert.equal(indexFieldControl({}).empty, true);
  // field control items extend what is known
  assert.ok(knownFields(null, fc).Plant.has('MINBE'));
});

test('a tab is shown when the request carries one of its SAP views (empty selection = all)', () => {
  assert.equal(viewSelected('mrp1', ['MARC_MRP1']), true);
  assert.equal(viewSelected('mrp2', ['MARC_MRP1']), false);
  assert.equal(viewSelected('mrp2', []), true);
  assert.equal(viewSelected('basic', ['MARA_BASIC2']), true);
  // every tab of the app is mapped to SAP views
  for (const v of VIEWS) assert.ok((SAP_VIEWS_OF[v.id] ?? []).length > 0, v.id);
});

const withClass = (): BackendData => {
  const d = backend();
  d.multi.ClassCharacteristic = [
    { SR_NO: '1', KLART: '023', CLASS: 'FG_COSM', KLTXT: 'Cosmetics', ATNAM: 'SHADE', ATBEZ: 'Shade', ATWRT: 'RED', ZAEHL: '1', STDCL: 'X' },
    { SR_NO: '2', KLART: '023', CLASS: 'FG_COSM', KLTXT: 'Cosmetics', ATNAM: 'PACK', ATBEZ: 'Pack', ATWRT: '', ZAEHL: '1' },
  ];
  return d;
};

test('classification rows are read from ClassCharacteristic and written back only where ATWRT changed', () => {
  const d = withClass();
  const b = buildBindings(knownFields(d));
  const flat = fromBackend(d, b);
  const rows = JSON.parse(flat.classAssignments);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { srNo: '1', klart: '023', cls: 'FG_COSM', kltxt: 'Cosmetics', char: 'Shade (SHADE)', value: 'RED' });
  assert.equal(JSON.stringify(toPatch(flat, d, b)), JSON.stringify({ single: {}, multi: {}, views: d.views }));

  rows[1].value = 'BOX';
  rows[0].cls = 'HACKED'; // read-only columns never travel
  flat.classAssignments = JSON.stringify(rows);
  const p = toPatch(flat, d, b);
  assert.equal(p.multi.ClassCharacteristic.length, 2);
  assert.deepEqual(p.multi.ClassCharacteristic[0], d.multi.ClassCharacteristic[0]);
  assert.deepEqual(p.multi.ClassCharacteristic[1], { ...d.multi.ClassCharacteristic[1], ATWRT: 'BOX' });
  // rows never invented or removed
  flat.classAssignments = JSON.stringify([{ srNo: '9', value: 'X' }]);
  assert.equal(toPatch(flat, d, b).multi.ClassCharacteristic.length, 2);
});

test('a request without classification rows shows none and sends none', () => {
  const d = backend();
  const b = buildBindings(knownFields(d));
  assert.equal(fromBackend(d, b).classAssignments, '[]');
});

test('normForCompare: empty forms are equal, numbers by value, flags and tables normalised', () => {
  assert.equal(normForCompare('text', null), normForCompare('text', ''));
  assert.equal(normForCompare('text', '  A '), 'A');
  assert.equal(normForCompare('number', '1.50'), normForCompare('number', 1.5));
  assert.equal(normForCompare('checkbox', 'true'), 'X');
  assert.equal(normForCompare('checkbox', undefined), '');
  assert.equal(normForCompare('table', '[]'), normForCompare('table', ''));
  assert.equal(normForCompare('table', '[{"b":" 1","a":"x"}]'), normForCompare('table', '[{"a":"x","b":"1"}]'));
});

test('changedFields lists the fields that differ from the base with their original value', () => {
  const base = backend();
  const live = backend();
  live.single.Plant.DISMM = 'VB';
  live.single.Material.BRGEW = '1.50';  // same number, other spelling: unchanged
  live.single.Material.KZEFF = '';      // flag cleared
  live.single.Plant.NRFHG = '';         // 'NORM' -> ''
  live.single.Description.MAKTX = ' GLOWRA COLD CREAM 100ML '; // trim: unchanged
  const b = buildBindings(knownFields(live));
  const ch = changedFields(fromBackend(live, b), fromBackend(base, b), b);
  assert.equal(ch.mrpType, 'PD');
  assert.equal(ch.assignEffVals, 'X');
  assert.equal(ch.grossWeight, undefined);
  assert.equal(ch.description, undefined);
  assert.deepEqual(changedFields(fromBackend(base, b), fromBackend(base, b), b), {});
});
