'use client';

// One component for the four near-identical legal entity screens of the source Fiori app —
// legalEntity, legalSubEntity1, legalSubEntity2, legalSubEntity3 (controllers + views + their
// valueHepForLegalEntity / valueHepForLegalSubEntity1/2/3 fragments). Each level is described by a
// LevelConfig below: entity set, read filter, table/dialog captions and the exact create/update/
// delete payloads its controller builds. All writes are POSTs to the same entity set with
// Action "I" (create) / "C" (change) / "D" (delete), exactly as in the source.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page, Card, Toolbar, Field, Select, Input, Dialog, DataTable, Link, type Column, type Option } from '../ui';
import { useUi } from '../../context/UiContext';
import { useApp } from '../../context/AppContext';
import { read, create, F, Or, type Filter } from '../../lib/odata';
import { useNavTo, type RouteName } from '../../lib/routes';
import { isValidEmail } from '../../lib/formatter';

export type LegalRow = Record<string, any>;

/** Dialog field values, named after the fragment's Inputs/Selects (content indexes 3..29). */
export interface LegalForm {
  Name: string; // [3]
  SubEntityType: string; // [5]
  LegalStatus: string; // [7]
  AddressLine1: string; // [9]
  AddressLine2: string; // [11]
  ZstateNm: string; // [13] Select
  ZcityNm: string; // [15] Select
  Pincode: string; // [17]
  ContactPerson: string; // [19]
  LandlineNo: string; // [21]
  MobileNo: string; // [23]
  Email: string; // [25]
  Status: string; // [27]
  PerResApl: string; // [29]
}

export const EMPTY_FORM: LegalForm = {
  Name: '',
  SubEntityType: '',
  LegalStatus: '',
  AddressLine1: '',
  AddressLine2: '',
  ZstateNm: '',
  ZcityNm: '',
  Pincode: '',
  ContactPerson: '',
  LandlineNo: '',
  MobileNo: '',
  Email: '',
  Status: '',
  PerResApl: '',
};

/** Guid context of the current screen (from the "legalSubEntity" component model) plus the guids
 * captured from the row being edited — the controller's this.LglEntGuid / this.LglEntSubguidL1.. */
export type Guids = Record<string, any>;

export interface LevelConfig {
  entitySet: string;
  /** Header title (BlockLayout Title) */
  headerTitle: string;
  /** Table header toolbar title */
  tableTitle?: string;
  dialogTitle: string;
  parentLabel: string;
  parentText: string;
  /** Which row property the "Type Name" column shows */
  typeColumn: 'NameType' | 'SubEntityType';
  /** "legalSubEntity" model properties this screen reads into its guid context on load */
  contextKeys: string[];
  buildFilters: (params: Record<string, any>) => Filter[] | undefined;
  /** Guid keys copied from the edited row (handle*EditPress) */
  editGuidKeys: string[];
  /** Fields the edit handler fills from the row; any other field is reset to blank. */
  editFill: (row: LegalRow) => Partial<LegalForm>;
  savePayload: (form: LegalForm, flag: 'I' | 'C', guids: Guids) => Record<string, unknown>;
  deletePayload: (row: LegalRow) => Record<string, unknown>;
  deleteConfirm: string;
  msgCreated: string;
  msgUpdated: string;
  msgDeleted: string;
  /** Sub Entities link: which row keys go into the "legalSubEntity" model, and where to go */
  drill?: { keys: string[]; route: RouteName };
  /** Toolbar "Back" button target (sub levels only) */
  backRoute?: RouteName;
}

export default function LegalEntityLevel({ config }: { config: LevelConfig }) {
  const ui = useUi();
  const { getParams, mergeParams } = useApp();
  const navTo = useNavTo();

  const [rows, setRows] = useState<LegalRow[]>([]);
  const [cities, setCities] = useState<LegalRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LegalForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [emailError, setEmailError] = useState(false);
  const flag = useRef<'I' | 'C' | 'D'>('I');
  const guids = useRef<Guids>({});

  // _objPatternMatched: read the guid context, then the entity set with this level's filter.
  const load = useCallback(async () => {
    const params = getParams<Record<string, any>>('legalSubEntity');
    const ctx: Guids = {};
    for (const k of config.contextKeys) ctx[k] = params[k];
    guids.current = ctx;
    try {
      const { results } = await read<LegalRow>(`/${config.entitySet}`, { filters: config.buildFilters(params) });
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      setRows(results);
    } catch {
      /* source error handler is empty */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  // The fragment's State and City Selects are both bound to {/ZST_CITYSet}.
  useEffect(() => {
    read<LegalRow>('/ZST_CITYSet')
      .then(({ results }) => setCities(results))
      .catch(() => setCities([]));
  }, []);

  const stateOptions: Option[] = useMemo(() => dedupeOptions(cities, 'ZstateNm'), [cities]);
  const cityOptions: Option[] = useMemo(() => dedupeOptions(cities, 'ZcityNm'), [cities]);

  // sap.m.Select with forceSelection (the default): a key not in the list — including the
  // setSelectedKey(null) reset — falls back to the first item.
  const forceKey = (key: string | undefined, options: Option[]) =>
    key && options.some((o) => o.key === key) ? key : options[0]?.key ?? '';

  const set = (k: keyof LegalForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    flag.current = 'I';
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setEmailError(false);
    setDialogOpen(true);
  };

  const openEdit = (row: LegalRow) => {
    flag.current = 'C';
    const g: Guids = { ...guids.current };
    for (const k of config.editGuidKeys) g[k] = row[k];
    guids.current = g;
    const filled = config.editFill(row);
    const next: LegalForm = { ...EMPTY_FORM };
    (Object.keys(filled) as (keyof LegalForm)[]).forEach((k) => {
      const v = filled[k];
      next[k] = v === null || v === undefined ? '' : String(v);
    });
    setForm(next);
    setErrors({});
    setEmailError(false);
    setDialogOpen(true);
  };

  const effectiveForm = (): LegalForm => ({
    ...form,
    ZstateNm: forceKey(form.ZstateNm, stateOptions),
    ZcityNm: forceKey(form.ZcityNm, cityOptions),
  });

  const save = async () => {
    // Mandatory: Name [3], Sub Entity Type [5], Contact Person [19], Email [25]
    const errs: Record<string, boolean> = {
      Name: form.Name.length === 0,
      SubEntityType: form.SubEntityType.length === 0,
      ContactPerson: form.ContactPerson.length === 0,
      Email: form.Email.length === 0,
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    const f = flag.current === 'C' ? 'C' : 'I';
    const payload = config.savePayload(effectiveForm(), f, guids.current);
    try {
      await create(`/${config.entitySet}`, payload);
      await load();
      ui.messageBox.success(f === 'C' ? config.msgUpdated : config.msgCreated);
      setDialogOpen(false);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const remove = (row: LegalRow) => {
    flag.current = 'D';
    const payload = config.deletePayload(row);
    ui.messageBox.confirm(config.deleteConfirm, {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create(`/${config.entitySet}`, payload);
          await load();
          ui.messageBox.success(config.msgDeleted);
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const drill = (row: LegalRow) => {
    if (!config.drill) return;
    const values: Record<string, any> = {};
    for (const k of config.drill.keys) values[k] = row[k];
    mergeParams('legalSubEntity', values);
    navTo(config.drill.route);
  };

  // handleValidateEmail (BaseController) — on change, flags an invalid address but doesn't block save.
  const validateEmail = () => {
    if (form.Email !== '' && !isValidEmail(form.Email)) {
      setEmailError(true);
      ui.messageBox.error('The Entered Email Is Invalid.');
    } else {
      setEmailError(false);
    }
  };

  const columns: Column<LegalRow>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Name', header: 'Name' },
    { key: config.typeColumn, header: 'Type Name' },
    { key: 'ContactPerson', header: 'Contact Person' },
    { key: 'Email', header: 'Email' },
    { key: 'DateTimeStamp', header: 'Created on' },
    config.drill
      ? { key: 'subEntity', header: 'Sub Entity', render: (r) => <Link onClick={() => drill(r)}>Sub Entities</Link> }
      : { key: 'SubEntity', header: 'Sub Entity' },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <div className="flex gap-1">
          <button type="button" aria-label="Edit" onClick={() => openEdit(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-rust">
            <Pencil size={15} />
          </button>
          <button type="button" aria-label="Delete" onClick={() => remove(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-red">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const err = (k: string) => (errors[k] ? '!border-red !ring-red' : '');

  return (
    <Page title={config.headerTitle}>
      <Card>
        <Toolbar className="mb-3 items-center">
          {config.tableTitle && <h2 className="flex-1 text-[13.5px] font-bold text-ink">{config.tableTitle}</h2>}
          {!config.tableTitle && <div className="flex-1" />}
          {config.backRoute && (
            <button type="button" className="btn-primary" onClick={() => navTo(config.backRoute as RouteName)}>
              Back
            </button>
          )}
          <button type="button" className="btn-primary" onClick={openCreate}>
            Add New
          </button>
        </Toolbar>
        <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="60vh" />
      </Card>

      <Dialog
        open={dialogOpen}
        title={config.dialogTitle}
        onClose={() => setDialogOpen(false)}
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={save}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDialogOpen(false)}>
              Close
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={config.parentLabel} className="sm:col-span-2">
            <span className="text-[13px] text-ink">{config.parentText}</span>
          </Field>
          <Field label="Name" required>
            <Input className={err('Name')} value={form.Name} onChange={(e) => set('Name')(e.target.value)} />
          </Field>
          <Field label="Sub Entity Type" required>
            <Input className={err('SubEntityType')} value={form.SubEntityType} onChange={(e) => set('SubEntityType')(e.target.value)} />
          </Field>
          <Field label="Legal Status">
            <Input value={form.LegalStatus} onChange={(e) => set('LegalStatus')(e.target.value)} />
          </Field>
          <Field label="Address Line 1">
            <Input value={form.AddressLine1} onChange={(e) => set('AddressLine1')(e.target.value)} />
          </Field>
          <Field label="Address Line 2">
            <Input value={form.AddressLine2} onChange={(e) => set('AddressLine2')(e.target.value)} />
          </Field>
          <Field label="State">
            <Select value={forceKey(form.ZstateNm, stateOptions)} onChange={set('ZstateNm')} options={stateOptions} />
          </Field>
          <Field label="City">
            <Select value={forceKey(form.ZcityNm, cityOptions)} onChange={set('ZcityNm')} options={cityOptions} />
          </Field>
          <Field label="Pin Code">
            <Input type="number" value={form.Pincode} onChange={(e) => set('Pincode')(e.target.value.slice(0, 6))} />
          </Field>
          <Field label="Contact Person" required>
            <Input className={err('ContactPerson')} value={form.ContactPerson} onChange={(e) => set('ContactPerson')(e.target.value)} />
          </Field>
          <Field label="Landline No.">
            <Input type="number" value={form.LandlineNo} onChange={(e) => set('LandlineNo')(e.target.value)} />
          </Field>
          <Field label="Mobile No.">
            <Input type="number" value={form.MobileNo} onChange={(e) => set('MobileNo')(e.target.value)} />
          </Field>
          <Field label="Email" required>
            <Input
              className={err('Email') || (emailError ? '!border-red !ring-red' : '')}
              value={form.Email}
              onChange={(e) => set('Email')(e.target.value)}
              onBlur={validateEmail}
            />
          </Field>
          <Field label="Status">
            <Input value={form.Status} onChange={(e) => set('Status')(e.target.value)} />
          </Field>
          <Field label="Person Repsonsible Applicable">
            <Input value={form.PerResApl} onChange={(e) => set('PerResApl')(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}

function dedupeOptions(rows: LegalRow[], key: string): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const r of rows) {
    const v = r[key] === null || r[key] === undefined ? '' : String(r[key]);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ key: v, text: v });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Level configurations — payloads/filters transcribed from each source controller.
// ---------------------------------------------------------------------------------------------

/** Full payload built by legalEntity / legalSubEntity1 / legalSubEntity2's save handlers. Note the
 * source sends NameType = the Name input ([3]), not the Sub Entity Type input. */
function fullSavePayload(form: LegalForm, flag: string): Record<string, unknown> {
  return {
    Name: form.Name,
    SubEntityType: form.SubEntityType,
    LegalStatus: form.LegalStatus,
    NameType: form.Name,
    AddressLine1: form.AddressLine1,
    AddressLine2: form.AddressLine2,
    ZstateNm: form.ZstateNm,
    ZcityNm: form.ZcityNm,
    Pincode: form.Pincode,
    ContactPerson: form.ContactPerson,
    LandlineNo: form.LandlineNo,
    MobileNo: form.MobileNo,
    Email: form.Email,
    Status: form.Status,
    PerResApl: form.PerResApl,
    Action: flag,
  };
}

function fullRowFields(row: LegalRow): Record<string, unknown> {
  return {
    Name: row.Name,
    SubEntityType: row.SubEntityType,
    LegalStatus: row.LegalStatus,
    NameType: row.NameType,
    AddressLine1: row.AddressLine1,
    AddressLine2: row.AddressLine2,
    ZstateNm: row.ZstateNm,
    ZcityNm: row.ZcityNm,
    Pincode: row.Pincode,
    ContactPerson: row.ContactPerson,
    LandlineNo: row.LandlineNo,
    MobileNo: row.MobileNo,
    Email: row.Email,
    Status: row.Status,
    PerResApl: row.PerResApl,
  };
}

function fullEditFill(row: LegalRow): Partial<LegalForm> {
  return {
    Name: row.Name,
    SubEntityType: row.SubEntityType,
    LegalStatus: row.LegalStatus,
    AddressLine1: row.AddressLine1,
    AddressLine2: row.AddressLine2,
    ZstateNm: row.ZstateNm,
    ZcityNm: row.ZcityNm,
    Pincode: row.Pincode,
    ContactPerson: row.ContactPerson,
    LandlineNo: row.LandlineNo,
    MobileNo: row.MobileNo,
    Email: row.Email,
    Status: row.Status,
    PerResApl: row.PerResApl,
  };
}

export const LEGAL_ENTITY: LevelConfig = {
  entitySet: 'ZST_MSD_LGL_ENT_EMAMI_GRPSet',
  headerTitle: 'Customer branch list',
  tableTitle: 'Emami Group',
  dialogTitle: 'Add Legal Entity',
  parentLabel: 'Name',
  parentText: 'Emami Group',
  typeColumn: 'NameType',
  contextKeys: [],
  buildFilters: () => undefined,
  editGuidKeys: ['LglEntGuid'],
  editFill: fullEditFill,
  savePayload: (form, flag, g) => {
    const p = fullSavePayload(form, flag);
    if (flag === 'C') p.LglEntGuid = g.LglEntGuid;
    return p;
  },
  deletePayload: (row) => ({ LglEntGuid: row.LglEntGuid, ...fullRowFields(row), Action: 'D' }),
  deleteConfirm: 'Do you want to delete the Legal Entity?',
  msgCreated: 'Legal Entity Created Successfully!!',
  msgUpdated: 'Legal Entity Updated Successfully!!',
  msgDeleted: 'Legal Entity Deleted Successfully!!',
  drill: { keys: ['LglEntGuid'], route: 'legalSubEntity1' },
};

export const LEGAL_SUB_ENTITY_1: LevelConfig = {
  entitySet: 'ZSTR_MSD_SUB_LGL_ENTSet',
  headerTitle: 'Customer Branch List',
  tableTitle: 'Emami Group > Emami Limited',
  dialogTitle: 'Add Sub Entity',
  parentLabel: 'Parent',
  parentText: 'Emami Limited',
  typeColumn: 'SubEntityType',
  contextKeys: ['LglEntGuid'],
  buildFilters: (p) => [F('LglEntGuid', 'EQ', p.LglEntGuid)],
  editGuidKeys: ['LglEntGuid', 'LglEntSubguidL1'],
  editFill: fullEditFill,
  savePayload: (form, flag, g) => {
    const p = fullSavePayload(form, flag);
    if (flag === 'C') {
      p.LglEntGuid = g.LglEntGuid;
      p.LglEntSubguidL1 = g.LglEntSubguidL1;
    } else {
      p.LglEntGuid = g.LglEntGuid;
    }
    return p;
  },
  // Source quirk kept as-is: key "LglEntSubguid1" read from the misspelt row property
  // "LglEntSubgrid1" (always undefined, so it's dropped from the JSON body).
  deletePayload: (row) => ({
    LglEntGuid: row.LglEntGuid,
    LglEntSubguid1: row.LglEntSubgrid1,
    ...fullRowFields(row),
    Action: 'D',
  }),
  deleteConfirm: 'Do you want to delete the Sub Entity?',
  msgCreated: 'Sub Entity Created Successfully!!',
  msgUpdated: 'Sub Entity Updated Successfully!!',
  msgDeleted: 'Sub Entity Deleted Successfully!!',
  drill: { keys: ['LglEntGuid', 'LglEntSubguidL1'], route: 'legalSubEntity2' },
  backRoute: 'legalEntity',
};

export const LEGAL_SUB_ENTITY_2: LevelConfig = {
  entitySet: 'ZSTR_MSD_SUBL2_LGLENSet',
  headerTitle: 'Customer Branch List',
  tableTitle: 'Emami Group > Emami Limited > HO',
  dialogTitle: 'Add Sub Entity',
  parentLabel: 'Parent',
  parentText: 'Emami Limited',
  typeColumn: 'SubEntityType',
  contextKeys: ['LglEntGuid', 'LglEntSubguidL1'],
  // Source: new Filter([filter1, filter2], false) — an OR, kept as-is.
  buildFilters: (p) => [Or([F('LglEntGuid', 'EQ', p.LglEntGuid), F('LglEntSubguidL1', 'EQ', p.LglEntSubguidL1)])],
  editGuidKeys: ['LglEntGuid', 'LglEntSubguidL1', 'LglEntSubguidL2'],
  editFill: fullEditFill,
  savePayload: (form, flag, g) => {
    const p = fullSavePayload(form, flag);
    if (flag === 'C') {
      p.LglEntGuid = g.LglEntGuid;
      p.LglEntSubguidL1 = g.LglEntSubguidL1;
      p.LglEntSubguidL2 = g.LglEntSubguidL2;
    } else {
      p.LglEntGuid = g.LglEntGuid;
      p.LglEntSubguidL1 = g.LglEntSubguidL1;
    }
    return p;
  },
  deletePayload: (row) => ({
    LglEntGuid: row.LglEntGuid,
    LglEntSubguidL1: row.LglEntSubguidL1,
    LglEntSubguidL2: row.LglEntSubguidL2,
    ...fullRowFields(row),
    Action: 'D',
  }),
  deleteConfirm: 'Do you want to delete the Sub Entity?',
  msgCreated: 'Sub Entity Created Successfully!!',
  msgUpdated: 'Sub Entity Updated Successfully!!',
  msgDeleted: 'Sub Entity Deleted Successfully!!',
  drill: { keys: ['LglEntGuid', 'LglEntSubguidL1', 'LglEntSubguidL2'], route: 'legalSubEntity3' },
  backRoute: 'legalSubEntity1',
};

export const LEGAL_SUB_ENTITY_3: LevelConfig = {
  entitySet: 'ZSTR_ZMSD_SUBL3_LGLENSet',
  headerTitle: 'Customer Branch List',
  tableTitle: 'Emami Group > Emami Limited > HO > Kolkata Office',
  dialogTitle: 'Add Sub Entity',
  parentLabel: 'Parent',
  parentText: 'Emami Group',
  typeColumn: 'NameType',
  contextKeys: ['LglEntGuid', 'LglEntSubguidL1', 'LglEntSubguidL2'],
  // Source: new Filter([filter1, filter2, filter3], false) — an OR, kept as-is.
  buildFilters: (p) => [
    Or([
      F('LglEntGuid', 'EQ', p.LglEntGuid),
      F('LglEntSubguidL1', 'EQ', p.LglEntSubguidL1),
      F('LglEntSubguidL2', 'EQ', p.LglEntSubguidL2),
    ]),
  ],
  editGuidKeys: ['LglEntGuid', 'LglEntSubguidL1', 'LglEntSubguidL2', 'LglEntSubguidL3'],
  // Source fills Name, Sub Entity Type (<- NameType), Contact Person, Email; blanks the rest.
  editFill: (row) => ({ Name: row.Name, SubEntityType: row.NameType, ContactPerson: row.ContactPerson, Email: row.Email }),
  // Source sends only these four fields; NameType comes from the Sub Entity Type input ([5]).
  savePayload: (form, flag, g) => {
    const p: Record<string, unknown> = {
      Name: form.Name,
      NameType: form.SubEntityType,
      ContactPerson: form.ContactPerson,
      Email: form.Email,
      Action: flag,
    };
    if (flag === 'C') {
      p.LglEntGuid = g.LglEntGuid;
      p.LglEntSubguidL1 = g.LglEntSubguidL1;
      p.LglEntSubguidL2 = g.LglEntSubguidL2;
      p.LglEntSubguidL3 = g.LglEntSubguidL3;
    } else {
      p.LglEntGuid = g.LglEntGuid;
      p.LglEntSubguidL1 = g.LglEntSubguidL1;
      p.LglEntSubguidL2 = g.LglEntSubguidL2;
    }
    return p;
  },
  deletePayload: (row) => ({
    LglEntGuid: row.LglEntGuid,
    LglEntSubguidL1: row.LglEntSubguidL1,
    LglEntSubguidL2: row.LglEntSubguidL2,
    LglEntSubguidL3: row.LglEntSubguidL3,
    Name: row.Name,
    NameType: row.NameType,
    ContactPerson: row.ContactPerson,
    Email: row.Email,
    Action: 'D',
  }),
  deleteConfirm: 'Do you want to delete the Sub Entity?',
  msgCreated: 'Sub Entity Created Successfully!!',
  msgUpdated: 'Sub Entity Updated Successfully!!',
  msgDeleted: 'Sub Entity Deleted Successfully!!',
  backRoute: 'legalSubEntity2',
};
