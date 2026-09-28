'use client';

// Port of the source Fiori app's subProcessList screen (subProcessList.controller.js/view +
// valueHelpForSubProcessList fragment). Reads ZST_MSD_BUSINS_SUB_PROCSet filtered by the BpGuid in
// the businessProcessValidate component model; writes are POSTs with Action I/C/D. "Sub Activity"
// drills into subActivityList (BpGuid, BpSubGuid, SubProcess into the same model).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page, Card, Toolbar, Field, Input, Dialog, DataTable, Link, type Column } from '../../../../components/ui';
import { useUi } from '../../../../context/UiContext';
import { useApp } from '../../../../context/AppContext';
import { read, create, F } from '../../../../lib/odata';
import { useNavTo } from '../../../../lib/routes';

type Row = Record<string, any>;

export default function SubProcessListPage() {
  const ui = useUi();
  const { getParams, mergeParams } = useApp();
  const navTo = useNavTo();

  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('Sub Process List/');
  const [open, setOpen] = useState(false);
  const [processText, setProcessText] = useState('');
  const [form, setForm] = useState({ SubProcess: '', SubProcDesc: '', SubProcScore: '' });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const flag = useRef<'I' | 'C' | 'D'>('I');
  const editGuids = useRef<{ BpGuid?: string; BpSubGuid?: string }>({});

  const load = useCallback(async () => {
    const model = getParams<Record<string, any>>('businessProcessValidate');
    setTitle(`Sub Process List/${model.Process}`);
    try {
      const { results } = await read<Row>('/ZST_MSD_BUSINS_SUB_PROCSet', {
        filters: [F('BpGuid', 'EQ', model.BpGuid)],
      });
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      setRows(results);
    } catch {
      /* source error handler is empty */
    }
  }, [getParams]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    flag.current = 'I';
    const model = getParams<Record<string, any>>('businessProcessValidate');
    setProcessText(model.Process ?? '');
    setForm({ SubProcess: '', SubProcDesc: '', SubProcScore: '' });
    setErrors({});
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    flag.current = 'C';
    editGuids.current = { BpGuid: row.BpGuid, BpSubGuid: row.BpSubGuid };
    setProcessText(row.Process ?? '');
    setForm({
      SubProcess: row.SubProcess ?? '',
      SubProcDesc: row.SubProcDesc ?? '',
      SubProcScore: row.SubProcScore === null || row.SubProcScore === undefined ? '' : String(row.SubProcScore),
    });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const model = getParams<Record<string, any>>('businessProcessValidate');
    const errs = {
      SubProcess: form.SubProcess.length === 0,
      SubProcDesc: form.SubProcDesc.length === 0,
      SubProcScore: form.SubProcScore.length === 0,
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    const f = flag.current === 'C' ? 'C' : 'I';
    const postObj: Record<string, unknown> = {
      BpGuid: model.BpGuid,
      Process: processText,
      SubProcess: form.SubProcess,
      SubProcDesc: form.SubProcDesc,
      SubProcScore: form.SubProcScore,
      Action: f,
    };
    if (f === 'C') {
      postObj.BpGuid = editGuids.current.BpGuid;
      postObj.BpSubGuid = editGuids.current.BpSubGuid;
    }
    try {
      await create('/ZST_MSD_BUSINS_SUB_PROCSet', postObj);
      await load();
      ui.messageBox.success(f === 'C' ? 'Sub Process Updated Successfully!!' : 'Sub Process Created Successfully!!');
      setOpen(false);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const remove = (row: Row) => {
    flag.current = 'D';
    const postObj = {
      Process: row.Process,
      SubProcess: row.SubProcess,
      SubProcDesc: row.SubProcDesc,
      SubProcScore: row.SubProcScore,
      BpGuid: row.BpGuid,
      BpSubGuid: row.BpSubGuid,
      Action: 'D',
    };
    ui.messageBox.confirm('Do you want to delete the Sub Process?', {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create('/ZST_MSD_BUSINS_SUB_PROCSet', postObj);
          await load();
          ui.messageBox.success('Sub process Deleted Successfully!!');
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const openSubActivity = (row: Row) => {
    mergeParams('businessProcessValidate', { BpGuid: row.BpGuid, BpSubGuid: row.BpSubGuid, SubProcess: row.SubProcess });
    navTo('subActivityList');
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Process', header: 'Process' },
    { key: 'SubProcess', header: 'Sub Process' },
    { key: 'SubProcScore', header: 'Scores' },
    { key: 'sub', header: 'Sub Activity', render: (r) => <Link onClick={() => openSubActivity(r)}>Sub Activity</Link> },
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
    <Page title={title}>
      <Card>
        <Toolbar className="mb-3 justify-end">
          <button type="button" className="btn-primary" onClick={() => navTo('businessProcess')}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={openCreate}>
            Add New
          </button>
        </Toolbar>
        <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="60vh" />
      </Card>

      <Dialog
        open={open}
        title="Add Sub Process"
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
          <Field label="Status">
            <span className="text-[13px] text-ink">Process</span>
          </Field>
          <Field label="Process">
            <span className="text-[13px] text-ink">{processText}</span>
          </Field>
          <Field label="Name" required>
            <Input className={err('SubProcess')} value={form.SubProcess} onChange={(e) => setForm((f) => ({ ...f, SubProcess: e.target.value }))} />
          </Field>
          <Field label="Description" required>
            <Input className={err('SubProcDesc')} value={form.SubProcDesc} onChange={(e) => setForm((f) => ({ ...f, SubProcDesc: e.target.value }))} />
          </Field>
          <Field label="Scores" required>
            <Input className={err('SubProcScore')} value={form.SubProcScore} onChange={(e) => setForm((f) => ({ ...f, SubProcScore: e.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
