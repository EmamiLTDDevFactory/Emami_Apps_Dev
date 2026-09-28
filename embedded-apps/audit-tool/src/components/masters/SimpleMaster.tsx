'use client';

// Shared screen for the source app's single-table masters (verticalMaster, observationCategory,
// riskCategory, locationTypeMaster, legalEntityTypeMaster, subEntityTypeMaster, industryMaster,
// stateMaster, cityMaster, departmentMaster). They all do the same thing: on route match, GET
// <EntitySet> (no filter) and number the rows with slNo; "Add New" opens a dialog with
// flag = "I"; the row edit button opens it pre-filled with flag = "C"; the row delete button
// confirms and POSTs with flag = "D". Every write is a POST (ODataModel.create) to the same entity
// set, with the Action flag telling SAP what to do. Each screen's own entity set, payload keys,
// validations and message texts come from its MasterConfig (see src/components/masters/configs.ts).
import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { create, read } from '../../lib/odata';
import { useUi } from '../../context/UiContext';
import { useNavTo } from '../../lib/routes';
import { Card, DataTable, Dialog, Field, Input, Page, RadioGroup, Select, TextArea, type Column, type Option } from '../ui';
import { LiveClock } from '../home/LiveClock';

export type MasterFlag = 'I' | 'C' | 'D';
export type Row = Record<string, any> & { slNo: number };

export interface MasterField {
  key: string;
  label: string;
  /** Shows the required asterisk (the fragment's Label required="true"). */
  required?: boolean;
  /** Actually checked on Save (only some required fields are validated by the source). */
  validate?: boolean;
  kind?: 'input' | 'textarea' | 'select' | 'radio';
  /** 'select': entity set whose rows fill the dropdown, and the property used for key & text. */
  optionsEntitySet?: string;
  optionsKey?: string;
  /** 'radio': display-only radio options (not posted by the source). */
  radioOptions?: string[];
}

export interface MasterConfig {
  title: string;
  entitySet: string;
  dialogTitle: string;
  columns: { header: string; key: string; value?: (row: Row) => unknown; width?: string }[];
  fields: MasterField[];
  /** Save payload for Add (flag I) / Edit (flag C). */
  savePayload: (flag: 'I' | 'C', values: Record<string, string>) => Record<string, unknown>;
  /** Dialog values when editing a row. */
  editValues: (row: Row) => Record<string, string>;
  deletePayload: (row: Row) => Record<string, unknown>;
  createdMsg: string;
  updatedMsg: string;
  deletedMsg: string;
  confirmDeleteMsg: string;
}

export default function SimpleMaster({ config }: { config: MasterConfig }) {
  const ui = useUi();
  const navTo = useNavTo();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [flag, setFlag] = useState<MasterFlag>('I');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [selectOptions, setSelectOptions] = useState<Record<string, Option[]>>({});

  const load = useCallback(async () => {
    try {
      const { results } = await read<Record<string, any>>(`/${config.entitySet}`);
      let serialNo = 1;
      setRows(results.map((r) => ({ ...r, slNo: serialNo++ })));
    } catch {
      // Source error handlers are empty for these reads.
    }
  }, [config.entitySet]);

  useEffect(() => {
    load();
  }, [load]);

  // Dialog Selects bound directly to an OData entity set (e.g. City Master's State list).
  useEffect(() => {
    config.fields
      .filter((f) => f.kind === 'select' && f.optionsEntitySet)
      .forEach(async (f) => {
        try {
          const { results } = await read<Record<string, any>>(`/${f.optionsEntitySet}`);
          const k = f.optionsKey || f.key;
          setSelectOptions((o) => ({ ...o, [f.key]: results.map((r) => ({ key: String(r[k] ?? ''), text: String(r[k] ?? '') })) }));
        } catch {
          /* no options */
        }
      });
  }, [config.fields]);

  const blankValues = (): Record<string, string> => {
    const v: Record<string, string> = {};
    for (const f of config.fields) {
      // sap.m.Select forceSelection defaults to true: clearing the key re-selects the first item.
      if (f.kind === 'select') v[f.key] = selectOptions[f.key]?.[0]?.key ?? '';
      else if (f.kind === 'radio') v[f.key] = f.radioOptions?.[0] ?? '';
      else v[f.key] = '';
    }
    return v;
  };

  const openAdd = () => {
    setFlag('I');
    setValues(blankValues());
    setErrors({});
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setFlag('C');
    setValues({ ...blankValues(), ...config.editValues(row) });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const nextErrors: Record<string, boolean> = {};
    let error = false;
    for (const f of config.fields) {
      if (f.validate && (values[f.key] || '').length === 0) {
        error = true;
        nextErrors[f.key] = true;
      }
    }
    setErrors(nextErrors);
    if (error) {
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    try {
      await create(`/${config.entitySet}`, config.savePayload(flag as 'I' | 'C', values));
      load();
      ui.messageBox.success(flag === 'C' ? config.updatedMsg : config.createdMsg);
      setOpen(false);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const remove = (row: Row) => {
    setFlag('D');
    const payload = config.deletePayload(row);
    ui.messageBox.confirm(config.confirmDeleteMsg, {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create(`/${config.entitySet}`, payload);
          load();
          ui.messageBox.success(config.deletedMsg);
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const columns: Column<Row>[] = [
    ...config.columns.map((c) => ({ key: c.key, header: c.header, value: c.value, width: c.width })),
    {
      key: '__action',
      header: 'Action',
      width: '6rem',
      render: (row: Row) => (
        <div className="flex gap-1">
          <button type="button" aria-label="Edit" onClick={() => openEdit(row)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-rust">
            <Pencil size={14} />
          </button>
          <button type="button" aria-label="Delete" onClick={() => remove(row)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-red">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Page title={config.title} onBack={() => navTo('secondImage')} actions={<LiveClock />}>
      <Card>
        <div className="mb-3 flex justify-end">
          <button type="button" className="btn-primary" onClick={openAdd}>
            Add New
          </button>
        </div>
        <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="60vh" />
      </Card>

      <Dialog
        open={open}
        title={config.dialogTitle}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn-primary" onClick={save}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {config.fields.map((f) => {
            const err = errors[f.key] ? '!border-red !ring-red' : '';
            const set = (v: string) => setValues((s) => ({ ...s, [f.key]: v }));
            if (f.kind === 'radio') {
              return (
                <RadioGroup
                  key={f.key}
                  name={f.key}
                  value={values[f.key] || ''}
                  onChange={set}
                  options={(f.radioOptions || []).map((o) => ({ key: o, text: o }))}
                />
              );
            }
            return (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.kind === 'textarea' ? (
                  <TextArea rows={2} className={err} value={values[f.key] || ''} onChange={(e) => set(e.target.value)} />
                ) : f.kind === 'select' ? (
                  <Select value={values[f.key] || ''} onChange={set} options={selectOptions[f.key] || []} className={errors[f.key] ? 'rounded-lg ring-1 ring-red' : ''} />
                ) : (
                  <Input className={err} value={values[f.key] || ''} onChange={(e) => set(e.target.value)} />
                )}
              </Field>
            );
          })}
        </div>
      </Dialog>
    </Page>
  );
}
