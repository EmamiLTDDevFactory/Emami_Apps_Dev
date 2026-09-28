'use client';

// Users master — port of controller/userDetails.controller.js, view/userDetails.view.xml and
// fragments/valueHepForNewUser.fragment.xml. GET ZUSER_MASTERSet on load; Add (Action I) / Edit
// (Action C) / Delete (Action D) all POST to ZUSER_MASTERSet. The Department dropdowns (toolbar
// filter and dialog) are both bound to /ZDEPARTMENT_MASTERSet. The toolbar's department filter and
// the search field each replace the table's single binding filter, as in the source.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { applyFilters, create, F, read, sapErrorMessage, type Filter } from '../../../lib/odata';
import { useUi } from '../../../context/UiContext';
import { useNavTo } from '../../../lib/routes';
import { isValidEmail } from '../../../lib/formatter';
import { Card, DataTable, Dialog, Field, Input, Page, RadioGroup, SearchField, Select, TextArea, type Column, type Option } from '../../../components/ui';
import { LiveClock } from '../../../components/home/LiveClock';

type UserRow = Record<string, any> & { slNo: number };

interface Form {
  Fname: string;
  Lname: string;
  Email: string;
  Contact: string;
  Department: string;
  IsDeptHead: 'Yes' | 'No';
  IsAuditHead: 'Yes' | 'No';
  IsAuditManager: 'Yes' | 'No';
  AuditRole: string;
  Address: string;
  Designation: string;
}

const EMPTY_FORM: Form = {
  Fname: '',
  Lname: '',
  Email: '',
  Contact: '',
  Department: '',
  // RadioButtonGroup's default selectedIndex is 0 ("Yes").
  IsDeptHead: 'Yes',
  IsAuditHead: 'Yes',
  IsAuditManager: 'Yes',
  AuditRole: '',
  Address: '',
  Designation: '',
};

const YES_NO: Option[] = [
  { key: 'Yes', text: 'Yes' },
  { key: 'No', text: 'No' },
];

export default function UsersPage() {
  const ui = useUi();
  const navTo = useNavTo();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [tableFilter, setTableFilter] = useState<Filter[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [flag, setFlag] = useState<'I' | 'C' | 'D'>('I');
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [emailError, setEmailError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { results } = await read<Record<string, any>>('/ZUSER_MASTERSet');
      let serialNo = 1;
      setRows(results.map((r) => ({ ...r, slNo: serialNo++ })));
    } catch (err) {
      ui.messageBox.error(sapErrorMessage(err));
    }
  }, [ui]);

  useEffect(() => {
    load();
    read<Record<string, any>>('/ZDEPARTMENT_MASTERSet')
      .then(({ results }) => setDepartments(results.map((r) => ({ key: String(r.Department ?? ''), text: String(r.Department ?? '') }))))
      .catch(() => setDepartments([]));
  }, [load]);

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);

  // handleSearch: Fname Contains <value>; empty -> no filter.
  const onSearch = (v: string) => {
    setSearch(v);
    setTableFilter(v.length === 0 ? [] : [F('Fname', 'Contains', v)]);
  };

  // onDepartment: Department EQ <key>; blank -> all users.
  const onDepartment = (key: string) => {
    setDeptFilter(key);
    setTableFilter(key ? [F('Department', 'EQ', key)] : []);
  };

  // handleclear
  const onClear = () => {
    setTableFilter([]);
    setDeptFilter('');
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setFlag('I');
    setForm(EMPTY_FORM);
    setErrors({});
    setEmailError(false);
    setOpen(true);
  };

  const openEdit = (r: UserRow) => {
    setFlag('C');
    setForm({
      Fname: String(r.Fname ?? ''),
      Lname: String(r.Lname ?? ''),
      Email: String(r.Email ?? ''),
      Contact: String(r.Contact ?? ''),
      Department: String(r.Department ?? ''),
      AuditRole: String(r.AuditRole ?? ''),
      Address: String(r.Address ?? ''),
      Designation: String(r.Designation ?? ''),
      IsDeptHead: r.IsDeptHead === 'X' ? 'Yes' : 'No',
      IsAuditHead: r.IsAuditHead === 'X' ? 'Yes' : 'No',
      IsAuditManager: r.IsAuditManager === 'X' ? 'Yes' : 'No',
    });
    setErrors({});
    setEmailError(false);
    setOpen(true);
  };

  // handleValidateEmail (on change/blur)
  const validateEmail = () => {
    const v = form.Email;
    if (v !== '' && !isValidEmail(v)) {
      ui.messageBox.error('The Entered Email Is Invalid.');
      setEmailError(true);
    } else {
      setEmailError(false);
    }
  };

  const save = async () => {
    const e: Partial<Record<keyof Form, boolean>> = {};
    (['Fname', 'Lname', 'Email', 'Contact'] as const).forEach((k) => {
      if (form[k].length === 0) e[k] = true;
    });
    setErrors(e);
    if (Object.keys(e).length > 0) {
      ui.messageBox.error('Please fill all the mandatory fields');
      return;
    }
    const postObj = {
      Fname: form.Fname,
      Lname: form.Lname,
      Email: form.Email,
      Contact: form.Contact,
      Designation: form.Designation,
      Department: form.Department,
      AuditRole: form.AuditRole,
      Action: flag,
      Address: form.Address,
      IsDeptHead: form.IsDeptHead === 'Yes' ? 'X' : 'Y',
      IsAuditHead: form.IsAuditHead === 'Yes' ? 'X' : 'Y',
      IsAuditManager: form.IsAuditManager === 'Yes' ? 'X' : 'Y',
    };
    try {
      await create('/ZUSER_MASTERSet', postObj);
      load();
      ui.messageBox.success(flag === 'C' ? 'User Updated Successfully!!' : 'User Created Successfully!!');
      setOpen(false);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const remove = (r: UserRow) => {
    setFlag('D');
    const postObj = {
      Fname: r.Fname,
      Lname: r.Lname,
      Email: r.Email,
      Contact: r.Contact,
      Department: r.Department,
      AuditRole: r.AuditRole,
      Action: 'D',
      Address: r.Address,
      IsDeptHead: r.IsDeptHead,
      IsAuditHead: r.IsAuditHead,
      IsAuditManager: r.IsAuditManager,
    };
    ui.messageBox.confirm('Do you want to delete the user?', {
      onClose: async (action) => {
        if (action !== 'OK') return;
        try {
          await create('/ZUSER_MASTERSet', postObj);
          load();
          ui.messageBox.success('User Deleted Successfully!!');
        } catch {
          ui.messageBox.error('Internal Server error');
        }
      },
    });
  };

  const columns: Column<UserRow>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Fname', header: 'First Name' },
    { key: 'Lname', header: 'Last Name' },
    { key: 'Email', header: 'Email', width: '12rem' },
    { key: 'Contact', header: 'Contact' },
    { key: 'AuditRole', header: 'Role' },
    // Source cell is bound to "{}" — always blank.
    { key: 'Status', header: 'Status', render: () => '' },
    {
      key: '__action',
      header: 'Action',
      width: '6rem',
      render: (r) => (
        <div className="flex gap-1">
          <button type="button" aria-label="Edit" onClick={() => openEdit(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-rust">
            <Pencil size={14} />
          </button>
          <button type="button" aria-label="Delete" onClick={() => remove(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-red">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const err = (k: keyof Form) => (errors[k] ? '!border-red !ring-red' : '');

  return (
    <Page title="Users" onBack={() => navTo('secondImage')} actions={<LiveClock />}>
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-[14px] font-bold text-ink">Users</h2>
          <Select value={deptFilter} onChange={onDepartment} options={departments} placeholder="" width="12rem" />
          <SearchField value={search} onChange={onSearch} placeholder="Type To Search" className="w-48" />
          <button type="button" className="btn-primary" onClick={openAdd}>
            Add New
          </button>
          <button type="button" className="btn-primary" onClick={onClear}>
            Clear
          </button>
        </div>
        <DataTable columns={columns} rows={visibleRows} growingThreshold={10} maxHeight="60vh" />
      </Card>

      <Dialog
        open={open}
        title="Add User"
        onClose={() => setOpen(false)}
        width="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={save}>
              Add
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First Name" required>
            <Input className={err('Fname')} value={form.Fname} onChange={(e) => set('Fname', e.target.value)} />
          </Field>
          <Field label="Last Name" required>
            <Input className={err('Lname')} value={form.Lname} onChange={(e) => set('Lname', e.target.value)} />
          </Field>
          <Field label="Email" required>
            <Input
              className={errors.Email || emailError ? '!border-red !ring-red' : ''}
              value={form.Email}
              onChange={(e) => set('Email', e.target.value)}
              onBlur={validateEmail}
            />
          </Field>
          <Field label="Contact No" required>
            <Input type="number" className={err('Contact')} value={form.Contact} onChange={(e) => set('Contact', e.target.value)} />
          </Field>
          <Field label="Department" required>
            <Select value={form.Department} onChange={(v) => set('Department', v)} options={departments} placeholder="" />
          </Field>
          <Field label="Audit Role">
            <Input value={form.AuditRole} onChange={(e) => set('AuditRole', e.target.value)} />
          </Field>
          <Field label="Is Department Head" required>
            <RadioGroup name="IsDeptHead" value={form.IsDeptHead} onChange={(v) => set('IsDeptHead', v as Form['IsDeptHead'])} options={YES_NO} />
          </Field>
          <Field label="Is Audit Head" required>
            <RadioGroup name="IsAuditHead" value={form.IsAuditHead} onChange={(v) => set('IsAuditHead', v as Form['IsAuditHead'])} options={YES_NO} />
          </Field>
          <Field label="Is Audit Manager" required>
            <RadioGroup
              name="IsAuditManager"
              value={form.IsAuditManager}
              onChange={(v) => set('IsAuditManager', v as Form['IsAuditManager'])}
              options={YES_NO}
            />
          </Field>
          <Field label="Designation">
            <Input value={form.Designation} onChange={(e) => set('Designation', e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <TextArea rows={2} value={form.Address} onChange={(e) => set('Address', e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
