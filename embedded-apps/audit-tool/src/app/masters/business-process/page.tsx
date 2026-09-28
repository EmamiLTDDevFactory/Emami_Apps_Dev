'use client';

// Port of the source Fiori app's businessProcess screen (businessProcess.controller.js/view +
// valueHepForBusinessProcess fragment). Reads ZMSD_BUSINESS_PROCESSSet; every write is a POST to
// the same set with Action I/C/D. "Sub Process" drills into subProcessList via the
// businessProcessValidate component model (BpGuid, Process).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page, Card, Toolbar, Field, Input, TextArea, Dialog, DataTable, Link, RadioGroup, type Column } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { useApp } from '../../../context/AppContext';
import { read, create } from '../../../lib/odata';
import { useNavTo } from '../../../lib/routes';

type Row = Record<string, any>;

export default function BusinessProcessPage() {
  const ui = useUi();
  const { mergeParams } = useApp();
  const navTo = useNavTo();

  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('bp');
  const [form, setForm] = useState({ Process: '', Department: '', ProcDesc: '' });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const flag = useRef<'I' | 'C' | 'D'>('I');
  const bpGuid = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const { results } = await read<Row>('/ZMSD_BUSINESS_PROCESSSet');
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      setRows(results);
    } catch {
      /* source error handler is empty */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    flag.current = 'I';
    setForm({ Process: '', Department: '', ProcDesc: '' });
    setErrors({});
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    flag.current = 'C';
    bpGuid.current = row.BpGuid;
    setForm({ Process: row.Process ?? '', Department: row.Department ?? '', ProcDesc: row.ProcDesc ?? '' });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const errs = {
      Process: form.Process.length === 0,
      Department: form.Department.length === 0,
      ProcDesc: form.ProcDesc.length === 0,
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    const f = flag.current === 'C' ? 'C' : 'I';
    const postObj: Record<string, unknown> = {
      Process: form.Process,
      Department: form.Department,
      ProcDesc: form.ProcDesc,
      Action: f,
    };
    if (f === 'C') postObj.BpGuid = bpGuid.current;
    try {
      await create('/ZMSD_BUSINESS_PROCESSSet', postObj);
      await load();
      ui.messageBox.success(f === 'C' ? 'Business Process Updated Successfully!!' : 'Business Process Created Successfully!!');
      setOpen(false);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const remove = (row: Row) => {
    flag.current = 'D';
    const postObj = {
      Process: row.Process,
      Department: row.Department,
      ProcDesc: row.ProcDesc,
      BpGuid: row.BpGuid,
      Action: 'D',
    };
    ui.messageBox.confirm('Do you want to delete the Business Process?', {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create('/ZMSD_BUSINESS_PROCESSSet', postObj);
          await load();
          ui.messageBox.success('Business Process Deleted Successfully!!');
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const openSubProcess = (row: Row) => {
    mergeParams('businessProcessValidate', { BpGuid: row.BpGuid, Process: row.Process });
    navTo('subProcessList');
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Process', header: 'Process' },
    { key: 'Department', header: 'Department' },
    { key: 'ProcDesc', header: 'Description' },
    { key: 'sub', header: 'Sub Process', render: (r) => <Link onClick={() => openSubProcess(r)}>Sub Process</Link> },
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
    <Page title="Business Process">
      <Card>
        <Toolbar className="mb-3 justify-end">
          <button type="button" className="btn-primary" onClick={openCreate}>
            Add New
          </button>
        </Toolbar>
        <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="60vh" />
      </Card>

      <Dialog
        open={open}
        title="Add Business Process"
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
        <div className="space-y-3">
          {/* Present in the source fragment but never read by the controller. */}
          <RadioGroup
            name="bpKind"
            value={kind}
            onChange={setKind}
            options={[
              { key: 'bp', text: 'Business Process' },
              { key: 'others', text: 'Others' },
            ]}
          />
          <Field label="Name" required>
            <Input className={err('Process')} value={form.Process} onChange={(e) => setForm((f) => ({ ...f, Process: e.target.value }))} />
          </Field>
          <Field label="Department" required>
            <Input className={err('Department')} value={form.Department} onChange={(e) => setForm((f) => ({ ...f, Department: e.target.value }))} />
          </Field>
          <Field label="Description" required>
            <TextArea rows={2} className={err('ProcDesc')} value={form.ProcDesc} onChange={(e) => setForm((f) => ({ ...f, ProcDesc: e.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
