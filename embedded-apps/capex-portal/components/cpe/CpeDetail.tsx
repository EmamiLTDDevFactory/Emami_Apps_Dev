'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader, Card, Button, Chip, DataTable, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Tabs, TextArea, useAction, useToast, type Column } from '@/components/ui';
import { fn, get, isOk, list, odataKey, q, type FnResult } from '@/lib/api';
import { useSession } from '@/lib/session';
import { DOC_CATEGORIES, DOC_EXTENSIONS, DOC_MAX_MB, listDocuments, uploadDocument, validateFile, type CapexDocument } from '@/lib/documents';
import type { CPE, PurchaseOrder } from '@/lib/entities';
import DocActions from '@/components/documents/DocActions';
import { fmtDate, fmtDays, inLakhs, num, orDash, statusLabel, statusTone } from '@/lib/format';
import { isUnitTechnicalRole } from '@/lib/rules';
import Timeline, { useApprovalChain } from '@/components/approvals/Timeline';
import { categoryLabel, uploadCategories } from './uploads';
import { MetricTiles, Strip, VendorCards, VendorScorecard } from './Bits';
import { canReviseAmount, canSetVendorCode } from './features';
import { canEvaluate, canUploadDocs, missingCategories, savingText, savingVsL1, slaBanner, sortedVendors, submitCpeParams } from './logic';

const POST_APPROVAL = ['APPROVED', 'CAPITALIZED', 'COMPLETED'];

function assertOk(r: FnResult | undefined, fallback: string): FnResult {
  if (r && r.Success !== undefined && !isOk(r)) throw new Error(r.Message || fallback);
  return r ?? {};
}

const KV = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-sap-line/60 py-2 sm:flex-row sm:gap-3">
    <dt className="w-40 shrink-0 text-[11px] font-bold text-sap-muted">{k}</dt>
    <dd className="min-w-0 text-[12.5px] font-semibold text-sap-ink">{children}</dd>
  </div>
);

export default function CpeDetail() {
  const id = useSearchParams().get('id') ?? '';
  const toast = useToast();
  const session = useSession();
  const { busy, run } = useAction();

  const [cpe, setCpe] = useState<CPE | null>(null);
  const [docs, setDocs] = useState<CapexDocument[]>([]);
  const [docsErr, setDocsErr] = useState('');
  /** The PO raised against this CPE, if any (EDSK9B0EQW: shown alongside Banfn after a CWIP push). */
  const [poNumber, setPoNumber] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [revise, setRevise] = useState<null | { amount: string; reason: string; file: File | null }>(null);
  const [vendorCode, setVendorCode] = useState('');
  const [upload, setUpload] = useState<null | { category: string; title: string; note: string; file: File | null }>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const row = await get<CPE>('CPESet' + odataKey(id), { $expand: 'CPEToVendors,CPEToCashFlows' });
      if (!row) { setState('missing'); return; }
      setCpe(row);
      setState('ready');
      setTick((t) => t + 1);
      // Documents and the linked PO are separate lookups; a failure in either must not hide the CPE.
      listDocuments('CPE', id).then((r) => { setDocs(r); setDocsErr(''); })
        .catch((e) => { setDocs([]); setDocsErr(e instanceof Error ? e.message : 'Could not load documents.'); });
      list<PurchaseOrder>('PurchaseOrderSet', { $filter: `Cpeid eq ${q(id)}` })
        .then((r) => setPoNumber(r.rows[0]?.Ebeln || ''))
        .catch(() => setPoNumber(''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the CPE.');
      setState('error');
    }
  }, [id]);
  useEffect(() => { if (id) void load(); else { setError('No CPE was given.'); setState('error'); } }, [id, load]);

  const vendors = useMemo(() => (cpe ? sortedVendors(cpe) : []), [cpe]);
  const saving = useMemo(() => savingVsL1(vendors), [vendors]);
  const status = cpe?.Status ?? '';
  const selectedLifnr = vendors.find((v) => v.selected)?.lifnr ?? '';
  useEffect(() => { setVendorCode(selectedLifnr); }, [selectedLifnr]);
  const chain = useApprovalChain('CPE', id, cpe?.Doaid ?? '', cpe?.CurrLevel ?? '', status, tick);

  /** EDSK9B0EQW (2026-11-27): SubmitCPE now runs check_attachments and refuses with a 400 if a
   * mandatory document is missing. Check locally first so the person sees exactly what's missing
   * and can upload it right away, instead of a raw backend rejection after confirming Submit. */
  function trySubmit() {
    const missing = missingCategories(docs.map((d) => d.Category), vendors.length);
    if (missing.length) {
      toast(`Required documents are missing: ${missing.map(categoryLabel).join(', ')}.`, 'error');
      setUpload({ category: missing[0], title: '', note: '', file: null });
      return;
    }
    setConfirmSubmit(true);
  }

  const resubmit = () => { setConfirmSubmit(false); return run(async () => {
    if (!cpe) return;
    const r = assertOk(await fn('SubmitCPE', submitCpeParams(cpe.Cpeid, cpe.Budgetid, cpe.Amount, cpe.PoolBudgetid, cpe.PoolAmount)), 'SAP could not submit the CPE.');
    toast(r.Message || `${cpe.Cpeid} submitted.`, 'success');
    await load();
  }); };

  const saveVendorCode = () => run(async () => {
    if (!vendorCode.trim()) throw new Error('Actual vendor code is not yet set for this CPE.');
    assertOk(await fn('SetCpeVendorCode', { CpeId: id, Lifnr: vendorCode.trim() }), 'SAP could not save the vendor code.');
    await load();
  }, 'Vendor code saved.');

  const doUpload = () => run(async () => {
    if (!upload) return;
    if (!upload.file) throw new Error('Choose a file to upload.');
    const bad = validateFile(upload.file, { extensions: (session.config.DOC_EXTENSIONS || DOC_EXTENSIONS.join(',')).split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()), maxMb: session.cfgNum('DOC_MAX_MB', DOC_MAX_MB) });
    if (bad) throw new Error(bad);
    await uploadDocument({ doctype: 'CPE', docid: id, category: upload.category, file: upload.file, title: upload.title.trim() || undefined, note: upload.note.trim() });
    setUpload(null);
    await load();
  }, 'Document uploaded.');

  const confirmRevise = () => run(async () => {
    if (!revise) return;
    const errs: string[] = [];
    if (!(num(revise.amount) > 0)) errs.push('Enter a new amount greater than zero.');
    if (!revise.reason.trim()) errs.push('Reason is required.');
    // The supporting document (category AMT_REV) goes up first, the revision only once that worked.
    if (!revise.file) errs.push('Attach the supporting document.');
    if (errs.length) throw new Error(errs.join(' '));
    const bad = validateFile(revise.file!, { extensions: (session.config.DOC_EXTENSIONS || DOC_EXTENSIONS.join(',')).split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()), maxMb: session.cfgNum('DOC_MAX_MB', DOC_MAX_MB) });
    if (bad) throw new Error(bad);
    await uploadDocument({ doctype: 'CPE', docid: id, category: 'AMT_REV', file: revise.file!, title: 'Amount revision', note: revise.reason.trim().slice(0, 255) });
    assertOk(await fn('ReviseCpeAmount', { CpeId: id, NewAmount: num(revise.amount), Reason: revise.reason }), 'SAP could not revise the amount.');
    setRevise(null);
    await load();
  }, 'Amount revised.');

  if (state === 'loading' && !cpe) return <><PageHeader title="CPE" back={{ href: '/cpe/', label: 'All CPEs' }} /><Spinner /></>;
  if (state === 'missing') return <><PageHeader title="CPE" back={{ href: '/cpe/', label: 'All CPEs' }} /><Card><Empty>CPE {id} could not be found, or it is not available to you.</Empty></Card></>;
  if (state === 'error' || !cpe) return <><PageHeader title="CPE" back={{ href: '/cpe/', label: 'All CPEs' }} /><ErrorBox message={error} onRetry={load} /></>;

  const isDraft = status === 'DRAFT';
  const days = Number(cpe.DaysPending) || 0;
  const showVendorCode = canSetVendorCode() && POST_APPROVAL.includes(status) && session.hubAdmin;
  const showRevise = canReviseAmount() && session.hubAdmin && status === 'APPROVED';
  const docCols: Column<CapexDocument>[] = [
    { key: 'file', header: 'File', render: (d) => <><div className="font-semibold">{d.DocTitle || d.Filename}</div>{d.DocTitle && d.DocTitle !== d.Filename && <div className="text-[11px] text-sap-muted">{d.Filename}</div>}</> },
    { key: 'cat', header: 'Category', hideBelow: 'sm', render: (d) => <Chip tone="info">{d.CategoryText || d.Category}</Chip> },
    { key: 'note', header: 'Note', hideBelow: 'lg', render: (d) => orDash(d.Note) },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'md', render: (d) => d.SizeText },
    { key: 'by', header: 'Uploaded', align: 'right', hideBelow: 'md', render: (d) => <><div>{d.UploadedByName || d.UploadedBy}</div><div className="text-[11px] text-sap-muted">{fmtDate(d.UploadedOn)}</div></> },
    { key: 'act', header: '', align: 'right', render: (d) => <DocActions doc={d} onRemoved={canUploadDocs(status) ? () => setDocs((x) => x.filter((y) => y.Docseq !== d.Docseq || y.Doctype !== d.Doctype || y.Docid !== d.Docid)) : undefined} /> },
  ];

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{cpe.Cpeid}<Chip tone={statusTone(status)}>{statusLabel(status)}</Chip></span>}
        subtitle={`${cpe.Title} · ${cpe.PlantName} · ${cpe.CategoryText || cpe.Category} · Budget ${cpe.Budgetid}`}
        back={{ href: '/cpe/', label: 'All CPEs' }}
        actions={<div className="text-right"><div className="text-[11px] text-white/75">CPE amount</div><div className="font-display text-xl font-extrabold">{inLakhs(cpe.Amount)}</div><div className="text-[11px] text-white/75">With {cpe.CurrLevel || '-'}</div></div>}
      />

      <div className="space-y-3">
        {status === 'BLOCKED' && <Strip tone="error">{cpe.BlockReason || 'This CPE is blocked.'}</Strip>}
        {days > 3 && <Strip tone="warning">{slaBanner(days, cpe.CurrLevel, fmtDays)}</Strip>}

        {showVendorCode && (
          <Card title="Actual Vendor Code" hint="The SAP vendor number the purchase order will be raised on. Letters or digits, up to 10; numbers are padded with zeros. Locked once a PO exists.">
            <div className="flex flex-wrap items-end gap-3">
              <Input className="w-48" maxLength={10} placeholder="Actual vendor code is not yet set for this CPE." value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} aria-label="Actual vendor code" />
              <Button variant="primary" disabled={busy} onClick={saveVendorCode}>Save</Button>
            </div>
          </Card>
        )}

        <Tabs
          value={tab} onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'vendors', label: 'Vendor Comparison', count: vendors.length },
            { id: 'fin', label: 'Financial Metrics' },
            { id: 'appr', label: 'Approval Chain' },
            { id: 'docs', label: 'Attachments', count: docs.length },
          ]}
        />

        {tab === 'overview' && (
          <Card>
            <dl className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <KV k="CPE ID">{cpe.Cpeid}</KV>
              <KV k="Budget ID"><Link href={`/budget/detail/?id=${encodeURIComponent(cpe.Budgetid)}`} className="text-plum hover:underline">{cpe.Budgetid}</Link></KV>
              <KV k="Plant">{cpe.PlantName}</KV>
              <KV k="Capex type">{cpe.Capextype}</KV>
              <KV k="Created by">{cpe.CreatedByName || cpe.CreatedBy}</KV>
              <KV k="Created on">{fmtDate(cpe.CreatedOn)}</KV>
              <KV k="Delivery (weeks)">{cpe.DeliveryWeeks ? cpe.DeliveryWeeks : '-'}</KV>
              <KV k="Technical compliance">{cpe.TechCompliant === 'X' ? <Chip tone="success">Compliant</Chip> : <Chip tone="warning">Pending sign-off</Chip>}</KV>
              <KV k="Purchase Requisition">{orDash(cpe.Banfn)}</KV>
              <KV k="Purchase Order">{poNumber ? <Link href={`/po/detail/?id=${encodeURIComponent(poNumber)}`} className="text-plum hover:underline">{poNumber}</Link> : (cpe.Banfn ? <span className="text-amber-700">PR created, PO failed - <Link href={`/cwip/create/?cpe=${encodeURIComponent(cpe.Cpeid)}`} className="underline">retry the push</Link></span> : orDash(''))}</KV>
            </dl>
            {([['Technical specifications', cpe.Specs], ['Terms & conditions', cpe.Terms], ['Technical remarks', cpe.TechRemark]] as const).map(([k, v]) => (
              <div key={k} className="mt-4">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-sap-muted">{k}</div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{orDash(v)}</p>
              </div>
            ))}
            {cpe.SingleVendJust && (
              <div className="mt-4"><div className="text-[11px] font-extrabold uppercase tracking-wide text-sap-muted">Single vendor justification</div><p className="mt-1 whitespace-pre-wrap text-[12.5px]">{cpe.SingleVendJust}</p></div>
            )}
          </Card>
        )}

        {tab === 'vendors' && (
          <div className="space-y-4">
            <VendorCards vendors={vendors} />
            {cpe.Nonl1Justif && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="text-[12px] font-extrabold text-amber-900">Non-L1 selection justification</div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px]">{cpe.Nonl1Justif}</p>
                {savingText(saving) && <p className="mt-1.5 text-[11px] text-sap-muted">{savingText(saving)}</p>}
              </div>
            )}
            <Card title="Vendor scorecard"><VendorScorecard vendors={vendors} /></Card>
          </div>
        )}

        {tab === 'fin' && (
          <Card>
            {cpe.MetricsOn !== 'X'
              ? <Strip>Financial computation is switched off for this request.</Strip>
              : <MetricTiles irr={cpe.Irr === '' ? null : Number(cpe.Irr)} npv={cpe.Npv === '' ? null : Number(cpe.Npv)} payback={cpe.Payback === '' ? null : Number(cpe.Payback)} />}
          </Card>
        )}

        {tab === 'appr' && <Card><Timeline chain={chain.chain} loading={chain.loading} /></Card>}

        {tab === 'docs' && (
          <Card title="Attachments"
            actions={canUploadDocs(status) ? <Button onClick={() => setUpload({ category: 'GEN', title: '', note: '', file: null })}>Upload document</Button> : undefined}>
            {docsErr && <ErrorBox message={docsErr} />}
            <DataTable columns={docCols} rows={docs} rowKey={(d) => `${d.Doctype}|${d.Docid}|${d.Docseq}`} empty="No documents attached." />
          </Card>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap justify-end gap-2 border-t border-sap-line bg-white/90 px-1 py-3 backdrop-blur print:hidden">
        {isDraft && <Link href={`/cpe/create/?id=${encodeURIComponent(cpe.Cpeid)}`} className="btn btn-secondary">Edit</Link>}
        {isDraft && <Button variant="primary" disabled={busy} onClick={trySubmit}>Submit</Button>}
        {canEvaluate(status, isUnitTechnicalRole(session.role), session.isAdmin) && <Link href={`/evaluation/?id=${encodeURIComponent(cpe.Cpeid)}`} className="btn btn-secondary">Evaluation</Link>}
        {status === 'APPROVED' && <Link href={`/cwip/create/?cpe=${encodeURIComponent(cpe.Cpeid)}`} className="btn btn-primary">Create CWIP</Link>}
        {showRevise && <Button onClick={() => setRevise({ amount: String(num(cpe.Amount)), reason: '', file: null })}>Revise Amount</Button>}
        <Button onClick={() => window.print()}>Print</Button>
        <Link href="/cpe/" className="btn btn-secondary">Back</Link>
      </div>

      <Modal open={confirmSubmit} title="Submit CPE" onClose={() => setConfirmSubmit(false)} footer={<><Button onClick={() => setConfirmSubmit(false)}>No</Button><Button variant="primary" onClick={resubmit}>Yes, submit</Button></>}>
        <p className="text-[13px]">Submit {inLakhs(cpe.Amount)} CPE for evaluation and approval?</p>
      </Modal>

      <Modal open={!!upload} title="Upload document" onClose={() => setUpload(null)} footer={<><Button onClick={() => setUpload(null)}>Cancel</Button><Button variant="primary" disabled={busy || !upload?.file} onClick={doUpload}>Upload</Button></>}>
        {upload && (
          <div className="space-y-3">
            <Field label="Category *" hint="A fixed slot (RFQ, Quotation, TCC, Negotiation, Justification) replaces the file already in it; General adds another.">
              <Select value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })}>
                {uploadCategories(DOC_CATEGORIES, session.hubAdmin).map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </Select>
            </Field>
            <Field label="Title"><Input maxLength={120} value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></Field>
            <Field label="Note"><TextArea rows={2} maxLength={255} value={upload.note} onChange={(e) => setUpload({ ...upload, note: e.target.value })} /></Field>
            <Field label="File *"><input type="file" aria-label="File" className="text-[11px]" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!revise} title="Revise Amount" onClose={() => setRevise(null)} footer={<><Button onClick={() => setRevise(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={confirmRevise}>Revise</Button></>}>
        {revise && (
          <div className="space-y-3">
            <Field label="New amount (₹) *"><Input type="number" min="0" value={revise.amount} onChange={(e) => setRevise({ ...revise, amount: e.target.value })} /></Field>
            <Field label="Reason *"><TextArea rows={3} value={revise.reason} onChange={(e) => setRevise({ ...revise, reason: e.target.value })} /></Field>
            <Field label="Supporting document *" hint="Uploaded first (category Amount Revision), then the amount is revised. Only an approved CPE with no purchase order yet can be revised."><input type="file" aria-label="Supporting document" className="text-[11px]" onChange={(e) => setRevise({ ...revise, file: e.target.files?.[0] ?? null })} /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}
