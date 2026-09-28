'use client';

// Port of the source Fiori app's subActivityList screen (subActivityList.controller.js/view +
// valueHelpForSubActivity fragment). Reads ZST_MSD_BUSINS_ACTIVITYSet filtered by BpGuid AND
// BpSubGuid from the businessProcessValidate component model; writes are POSTs with Action I/C/D.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page, Card, Toolbar, Field, Input, Dialog, DataTable, type Column } from '../../../../components/ui';
import { useUi } from '../../../../context/UiContext';
import { useApp } from '../../../../context/AppContext';
import { read, create, F, And } from '../../../../lib/odata';
import { useNavTo } from '../../../../lib/routes';

type Row = Record<string, any>;

export default function SubActivityListPage() {
  const ui = useUi();
  const { getParams } = useApp();
  const navTo = useNavTo();

  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('Sub Process List/');
  const [open, setOpen] = useState(false);
  const [processText, setProcessText] = useState('');
  const [subProcessText, setSubProcessText] = useState('');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const flag = useRef<'I' | 'C' | 'D'>('I');
  const editGuids = useRef<{ BpGuid?: string; BpSubGuid?: string; BpActvtGuid?: string }>({});

  const load = useCallback(async () => {
    const model = getParams<Record<string, any>>('businessProcessValidate');
    // Source concatenates Process and SubProcess with no separator.
    setTitle(`Sub Process List/${model.Process}${model.SubProcess}`);
    try {
      const { results } = await read<Row>('/ZST_MSD_BUSINS_ACTIVITYSet', {
        filters: [And([F('BpGuid', 'EQ', model.BpGuid), F('BpSubGuid', 'EQ', model.BpSubGuid)])],
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
    setSubProcessText(model.SubProcess ?? '');
    setName('');
    setNameError(false);
    setOpen(true);
  };

  // The source view wires the row buttons to handleSubActivityListEditPress/DeletePress, which don't
  // exist (the controller's handlers are named handleBusinessProcessEditPress/DeletePress), so the
  // buttons never worked there. Wired here to those handlers, the evident intent. The edit handler
  // only fills Name; Process/Sub Process are shown from the row so the update isn't posted with
  // whatever the dialog last displayed.
  const openEdit = (row: Row) => {
    flag.current = 'C';
    editGuids.current = { BpGuid: row.BpGuid, BpSubGuid: row.BpSubGuid, BpActvtGuid: row.BpActvtGuid };
    setProcessText(row.Process ?? '');
    setSubProcessText(row.SubProcess ?? '');
    setName(row.SubActivity ?? '');
    setNameError(false);
    setOpen(true);
  };

  const save = async () => {
    const model = getParams<Record<string, any>>('businessProcessValidate');
    if (name.length === 0) {
      setNameError(true);
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    setNameError(false);
    const f = flag.current === 'C' ? 'C' : 'I';
    const postObj: Record<string, unknown> = {
      BpGuid: model.BpGuid,
      BpSubGuid: model.BpSubGuid,
      Process: processText,
      SubProcess: subProcessText,
      SubActivity: name,
      Action: f,
    };
    if (f === 'C') {
      postObj.BpGuid = editGuids.current.BpGuid;
      postObj.BpSubGuid = editGuids.current.BpSubGuid;
      postObj.BpActvtGuid = editGuids.current.BpActvtGuid;
    }
    try {
      await create('/ZST_MSD_BUSINS_ACTIVITYSet', postObj);
      await load();
      ui.messageBox.success(f === 'C' ? 'Sub Activity Updated Successfully!!' : 'Sub Activity Created Successfully!!');
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
      SubActivity: row.SubActivity,
      BpGuid: row.BpGuid,
      BpSubGuid: row.BpSubGuid,
      BpActvtGuid: row.BpActvtGuid,
      Action: 'D',
    };
    ui.messageBox.confirm('Do you want to delete the Sub Activity?', {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create('/ZST_MSD_BUSINS_ACTIVITYSet', postObj);
          await load();
          ui.messageBox.success('Sub Activity Deleted Successfully!!');
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Process', header: 'Process' },
    { key: 'SubProcess', header: 'Sub Process' },
    { key: 'SubActivity', header: 'Activity' },
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

  return (
    <Page title={title}>
      <Card>
        <Toolbar className="mb-3 justify-end">
          <button type="button" className="btn-primary" onClick={() => navTo('subProcessList')}>
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
          <Field label="Process">
            <span className="text-[13px] text-ink">{processText}</span>
          </Field>
          <Field label="Sub Process">
            <span className="text-[13px] text-ink">{subProcessText}</span>
          </Field>
          <Field label="Name" required>
            <Input className={nameError ? '!border-red !ring-red' : ''} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
