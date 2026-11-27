'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Card, Button, Field, Input, TextArea, Kpi, Modal, ErrorBox, Spinner, useAction, useToast } from '@/components/ui';
import Combo from '@/components/budget/Combo';
import { create, fn, get, isOk, odataKey, type FnResult } from '@/lib/api';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import { documentsEnabled, listDocuments, type CapexDocument } from '@/lib/documents';
import type { Budget, CPE } from '@/lib/entities';
import { fmtDays, inLakhs, isStatus, num } from '@/lib/format';
import { budgetAvailable, checkBudget, resolveDOA, skipUnitTechnical } from '@/lib/rules';
import { MetricTiles, Strip, useDoaRules } from './Bits';
import AttachmentMatrix from './AttachmentMatrix';
import VendorTable from './VendorTable';
import {
  buildCpePayload, draftFromCpe, draftMetrics, emptyDraft, fieldErrors, newVendor, nonL1Narrative, nonL1Selected, patchVendor, resizeAttachmentSlots,
  selectVendor, submitCpeParams, validateDraft, withRanks, type CpeDraft, type DraftVendor,
} from './logic';
import { uploadAll } from './uploads';

const createdId = (r: unknown): string => {
  const o = r as { Cpeid?: string; d?: { Cpeid?: string } } | null;
  return o?.Cpeid || o?.d?.Cpeid || '';
};

/** SubmitCPE answers { Success, Message }; throw SAP's own message when it says no. */
function assertOk(r: FnResult | undefined, fallback: string): FnResult {
  if (r && r.Success !== undefined && !isOk(r)) throw new Error(r.Message || fallback);
  return r ?? {};
}

export default function CpeCreate() {
  const router = useRouter();
  const toast = useToast();
  const preselect = useSearchParams().get('budget') ?? '';
  /** /cpe/create/?id=<Cpeid>: edit an existing DRAFT/BLOCKED CPE in place (EDSK9B0EQW, 2026-11-27)
   * instead of always creating a new one. */
  const editId = useSearchParams().get('id') ?? '';
  const session = useSession();
  const { fiscalYear, cfgNum, config } = session;
  const { busy, run } = useAction();

  const budgets = useList<Budget>('BudgetSet', { $filter: "Status eq 'APPROVED'" });
  const doa = useDoaRules();

  const [draft, setDraft] = useState<CpeDraft>(() => emptyDraft(preselect));
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetErr, setBudgetErr] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState<string[]>([]);
  /** CPE already created in SAP by a Submit whose SubmitCPE failed: a retry only re-submits it, never creates a duplicate.
   * Stays blank even when editing an existing draft (draft.cpeId carries that instead) - the FIRST Save Draft / Submit
   * of this visit must still actually run persist() so the edited fields really get sent, with Cpeid in the payload
   * updating the CPE in place rather than being skipped as "already created this session". */
  const [created, setCreated] = useState('');
  const [failed, setFailed] = useState<{ id: string; message: string; stage: 'upload' | 'submit' } | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(!!editId);
  const [loadError, setLoadError] = useState('');
  const files = useRef<Record<string, File>>({});
  /** Slots already sent to SAP for the created CPE: a retry uploads only the failed / remaining files. */
  const uploaded = useRef<Set<string>>(new Set());

  // ---- load an existing DRAFT/BLOCKED CPE for editing ----
  useEffect(() => {
    if (!editId) { setLoadingDraft(false); return; }
    let live = true;
    (async () => {
      try {
        const cpe = await get<CPE>('CPESet' + odataKey(editId), { $expand: 'CPEToVendors,CPEToCashFlows' });
        if (!live) return;
        if (!cpe) { toast(`Record ${editId} could not be found.`, 'error'); router.replace('/cpe/'); return; }
        if (!isStatus(cpe.Status, 'DRAFT') && !isStatus(cpe.Status, 'BLOCKED')) {
          toast('Only a Draft or Blocked CPE can be edited.', 'error');
          router.replace(`/cpe/detail/?id=${encodeURIComponent(editId)}`);
          return;
        }
        const docs = await listDocuments('CPE', editId).catch(() => [] as CapexDocument[]);
        if (!live) return;
        setDraft(draftFromCpe(cpe, docs));
        try {
          const b = await get<Budget>('BudgetSet' + odataKey(cpe.Budgetid));
          if (live && b) setBudget(b);
        } catch { /* the Approved/Committed/Available strip just won't show; editing itself still works */ }
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the CPE.');
      } finally {
        if (live) setLoadingDraft(false);
      }
    })();
    return () => { live = false; };
  }, [editId, router, toast]);

  const rules = useMemo(() => ({
    threeQuoteLimit: cfgNum('THREE_QUOTE_LIMIT', 1000000), specsMinChars: cfgNum('SPECS_MIN_CHARS', 15), nonL1MinChars: cfgNum('NONL1_MIN_CHARS', 25),
  }), [cfgNum]);
  const maxMb = cfgNum('DOC_MAX_MB', 10);
  const extensions = config.DOC_EXTENSIONS || 'pdf,xls,xlsx,doc,docx,jpg,jpeg,png,msg,zip';

  const approved = useMemo(() => budgets.rows.filter((b) => isStatus(b.Status, 'APPROVED')).sort((a, b) => b.Budgetid.localeCompare(a.Budgetid)), [budgets.rows]);
  const budgetOptions = useMemo(() => approved.map((b) => ({ key: b.Budgetid, text: `${b.Title} (${inLakhs(b.AmtApproved)})` })), [approved]);

  /** Pull plant / type / category from the budget so they are never re-typed, and re-read the live budget for the block. */
  async function applyBudget(id: string) {
    setBudgetErr('');
    const listed = approved.find((b) => b.Budgetid === id) ?? null;
    setBudget(listed);
    if (listed) setDraft((d) => ({ ...d, budgetId: id, plant: listed.Werks, plantName: listed.PlantName, capexType: listed.Capextype, category: listed.CategoryText || listed.Category, categoryCode: listed.Category }));
    else setDraft((d) => ({ ...d, budgetId: id }));
    if (!id) { setBudget(null); setDraft((d) => ({ ...d, plant: '', plantName: '', capexType: '', category: '', categoryCode: '' })); return; }
    try {
      const live = await get<Budget>('BudgetSet' + odataKey(id));
      if (live) {
        setBudget(live);
        setDraft((d) => (d.budgetId === id ? { ...d, plant: live.Werks, plantName: live.PlantName, capexType: live.Capextype, category: live.CategoryText || live.Category, categoryCode: live.Category } : d));
      }
    } catch (e) {
      if (!listed) setBudgetErr(e instanceof Error ? e.message : 'Could not read the budget.');
    }
  }
  // A budget handed over from Budget Detail (?budget=...) is applied once the approved list is in.
  // Never when editing (?id=...) - the loaded CPE's own budget/plant/category already came from draftFromCpe.
  const applied = useRef('');
  useEffect(() => {
    if (!editId && preselect && !budgets.loading && applied.current !== preselect) { applied.current = preselect; void applyBudget(preselect); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, preselect, budgets.loading, budgets.rows]);

  // ---- derived: budget availability, metrics, DOA preview, non-L1
  const amount = num(draft.amount);
  const available = budget ? budgetAvailable({ approved: budget.AmtApproved, committed: budget.AmtCommitted, spent: budget.AmtSpent }) : 0;
  const check = checkBudget(available, amount);
  const budgetSufficient = !budget || check.sufficient;
  const metrics = useMemo(() => draftMetrics(draft), [draft]);
  const route = useMemo(
    () => (amount > 0 && draft.capexType ? skipUnitTechnical(resolveDOA(doa.rows, draft.capexType, amount, 'CPE').chain) : []),
    [doa.rows, draft.capexType, amount],
  );
  const showNonL1 = nonL1Selected(draft.vendors);
  const narrative = useMemo(() => nonL1Narrative(draft.vendors, 'create'), [draft.vendors]);
  const bad = showErrors ? fieldErrors(draft, rules) : {};
  const quotesShort = amount > rules.threeQuoteLimit && draft.vendors.length < 3;

  const set = <K extends keyof CpeDraft>(k: K, v: CpeDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setVendors = (f: (v: DraftVendor[]) => DraftVendor[]) => setDraft((d) => ({ ...d, vendors: f(d.vendors) }));

  const addVendor = () => setVendors((vs) => withRanks([...vs, newVendor(vs)]));
  const patch = (id: string, p: Partial<DraftVendor>) => setVendors((vs) => ('quote' in p ? withRanks(patchVendor(vs, id, p)) : patchVendor(vs, id, p)));
  const removeVendor = (id: string) => setVendors((vs) => withRanks(vs.filter((v) => v.id !== id)));

  // ---- save / submit
  async function persist(): Promise<string> {
    const id = createdId(await create('CPESet', buildCpePayload(draft, fiscalYear, metrics)));
    if (!id) throw new Error('SAP did not return the new CPE number.');
    return id;
  }

  const saveDraft = () => run(async () => {
    if (!draft.title.trim()) throw new Error('Enter at least a CPE title before saving a draft.');
    if (!draft.budgetId) throw new Error('Select a budget before saving a draft.');
    let id = created;
    if (!id) { id = await persist(); setCreated(id); }
    try {
      await uploadAll(id, draft.attachments, files.current, uploaded.current);
    } catch (e) {
      // The CPE stays a DRAFT in SAP; show which file failed and SAP's message. Retry Upload sends only what is left.
      setFailed({ id, message: e instanceof Error ? e.message : 'Document upload failed.', stage: 'upload' });
      return;
    }
    toast(`Draft ${id} saved.`, 'success');
    router.push('/cpe/');
  });

  function trySubmit() {
    setShowErrors(true);
    const errs = validateDraft(draft, { ...rules, budgetSufficient, documentsEnabled: documentsEnabled() }); // mandatory documents: Submit only, never Save Draft
    if (errs.length) { setErrorsOpen(errs); return; }
    setConfirm(true);
  }

  const submit = () => {
    setConfirm(false);
    return run(async () => {
      let id = created;
      let stage: 'upload' | 'submit' = 'upload';
      try {
        if (!id) { id = await persist(); setCreated(id); }
        // Order (BUILD_GUIDE): create CPESet -> documents -> SubmitCPE. An upload failure stops before SubmitCPE.
        await uploadAll(id, draft.attachments, files.current, uploaded.current);
        stage = 'submit';
        const r = assertOk(await fn('SubmitCPE', submitCpeParams(id, draft.budgetId, amount)), 'SAP could not submit the CPE.');
        toast(`${r.Message || id + ' submitted.'} Budget availability has been re-checked and the commitment reserved.`, 'success');
        router.push('/cpe/');
      } catch (e) {
        if (!id) throw e; // nothing was created: stay on the form with everything typed
        // The CPE exists as a DRAFT in SAP: keep it, show SAP's message, and let the person open it to submit again.
        setFailed({ id, message: e instanceof Error ? e.message : 'SAP could not route the CPE.', stage });
      }
    });
  };

  const noBudget = !draft.budgetId;
  const title = editId ? 'Edit CPE' : 'Create CPE';
  const back = { href: editId ? `/cpe/detail/?id=${encodeURIComponent(editId)}` : '/cpe/', label: editId ? 'CPE' : 'All CPEs' };

  if (loadingDraft) return <><PageHeader title={title} back={back} /><Spinner /></>;
  if (loadError) return <><PageHeader title={title} back={back} /><ErrorBox message={loadError} /></>;

  return (
    <>
      <PageHeader title={title} back={back} />
      {budgets.error && <ErrorBox message={budgets.error} onRetry={budgets.reload} />}

      <div className="space-y-4">
        {/* 1. budget + live availability */}
        <Card title="Select Approved Budget">
          {budgets.loading && !budgets.rows.length ? <Spinner /> : (
            <Combo options={budgetOptions} value={draft.budgetId} onChange={(k) => void applyBudget(k)} placeholder="Select an approved budget" />
          )}
          {budgetErr && <ErrorBox message={budgetErr} />}
          {!budgets.loading && !budgets.error && approved.length === 0 && <p className="mt-2 text-[12px] text-sap-muted">There is no approved budget you can raise a CPE against.</p>}
          {budget && (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Approved" value={inLakhs(budget.AmtApproved)} />
              <Link href="/po/" target="_blank" className="block"><Kpi label="Committed" value={inLakhs(budget.AmtCommitted)} foot="Open POs" onClick={() => undefined} /></Link>
              <Link href="/grn/" target="_blank" className="block"><Kpi label="Spent" value={inLakhs(budget.AmtSpent)} foot="Posted GRNs" onClick={() => undefined} /></Link>
              <Kpi label="Available" value={inLakhs(available)} tone={available > 0 ? 'success' : 'error'} />
            </div>
          )}
          {budget && amount > 0 && (
            <Strip className="mt-3" tone={check.sufficient ? 'success' : 'error'}>
              {check.sufficient
                ? `Budget available. Request of ${inLakhs(amount)} is within available ${inLakhs(check.available)}.`
                : `BLOCKED — request of ${inLakhs(amount)} exceeds available ${inLakhs(check.available)}. Shortfall ${inLakhs(check.shortfall)}.`}
            </Strip>
          )}
          {!noBudget && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12px] font-semibold">
                <input type="checkbox" checked={draft.singleCpe}
                  onChange={(e) => setDraft((d) => ({ ...d, singleCpe: e.target.checked, attachments: resizeAttachmentSlots(d.attachments, e.target.checked) }))} />
                Single Vendor
              </label>
              {draft.singleCpe && (
                <Input className={`w-full sm:w-80 ${bad.single ? 'border-red-400' : ''}`} placeholder="Justification for single vendor (mandatory)" aria-label="Single vendor justification"
                  value={draft.singleVendorJustification} onChange={(e) => set('singleVendorJustification', e.target.value)} />
              )}
            </div>
          )}
        </Card>

        {!noBudget && (
          <>
            {/* 2. details */}
            <Card title="CPE Details" hint="Plant, capex type and category are auto-filled from the budget">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="CPE title *" error={bad.title ? 'CPE title is required.' : undefined}>
                  <Input className={bad.title ? 'border-red-400' : ''} placeholder="e.g. Automatic Packaging Machine — Line 3" value={draft.title} onChange={(e) => set('title', e.target.value)} />
                </Field>
                <Field label="CPE amount (₹) *" error={bad.amount ? 'Enter an amount greater than zero.' : undefined}>
                  <Input className={bad.amount ? 'border-red-400' : ''} type="number" inputMode="decimal" min="0" placeholder="0" value={draft.amount} onChange={(e) => set('amount', e.target.value)} />
                </Field>
                <Field label="Plant"><Input readOnly className="bg-[#F6F7FD]" value={draft.plantName} /></Field>
                <Field label="Capex type"><Input readOnly className="bg-[#F6F7FD]" value={draft.capexType} /></Field>
                <Field label="Category"><Input readOnly className="bg-[#F6F7FD]" value={draft.category} /></Field>
                <Field label="Delivery (weeks)"><Input className="w-32" type="number" inputMode="numeric" min="0" placeholder="0" value={draft.deliveryWeeks} onChange={(e) => set('deliveryWeeks', e.target.value)} /></Field>
              </div>
              <Field className="mt-3" label="Technical specifications *" error={bad.specs ? `Technical specifications are required (at least ${rules.specsMinChars} characters).` : undefined}>
                <TextArea className={bad.specs ? 'border-red-400' : ''} rows={3} maxLength={1500} placeholder="Capacity, make, model, certification, utilities, interfaces." value={draft.specs} onChange={(e) => set('specs', e.target.value)} />
              </Field>
              <Field className="mt-3" label="Terms & conditions">
                <TextArea rows={3} maxLength={1000} placeholder="Payment milestones, warranty, delivery, penalty clauses." value={draft.terms} onChange={(e) => set('terms', e.target.value)} />
              </Field>
            </Card>

            {/* 3. vendors */}
            <Card title="Vendor Comparison" actions={<Button onClick={addVendor}>+ Add vendor quote</Button>}>
              {quotesShort && <Strip tone="warning" className="mb-3">Capex above ₹10 L requires L1, L2 and L3 quotes.</Strip>}
              <VendorTable vendors={draft.vendors} onPatch={patch} onSelect={(id) => setVendors((vs) => selectVendor(vs, id))} onRemove={removeVendor} />
              {showNonL1 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="text-[12px] font-extrabold text-amber-900">Selected vendor is not L1. A written justification is mandatory.</div>
                  <Field className="mt-2" label="Non-L1 selection justification *" error={bad.nonL1 ? `A non-L1 selection requires a written justification of at least ${rules.nonL1MinChars} characters.` : undefined}>
                    <TextArea className={bad.nonL1 ? 'border-red-400' : ''} rows={3} maxLength={1000}
                      placeholder="State the reason: quality, delivery, total cost of ownership, or strategic considerations."
                      value={draft.nonL1Justification} onChange={(e) => set('nonL1Justification', e.target.value)} />
                  </Field>
                  {narrative && <p className="mt-1.5 text-[11px] text-sap-muted">{narrative}</p>}
                </div>
              )}
            </Card>
          </>
        )}

        {/* attachments */}
        <Card title="Document Attachments">
          <AttachmentMatrix
            att={draft.attachments} single={draft.singleCpe} maxMb={maxMb} extensions={extensions}
            onChange={(f) => setDraft((d) => ({ ...d, attachments: f(d.attachments) }))}
            getFile={(id) => files.current[id]}
            onFile={(id, f) => { uploaded.current.delete(id); if (f) files.current[id] = f; else delete files.current[id]; }}
          />
        </Card>

        {!noBudget && (
          <>
            {/* 4. financial evaluation */}
            <Card title="Financial Evaluation"
              actions={<label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={draft.metricsEnabled} onChange={(e) => set('metricsEnabled', e.target.checked)} />Enable financial metrics</label>}>
              {!draft.metricsEnabled ? <Strip>Financial computation is switched off for this request.</Strip> : (
                <>
                  <div className="mb-3 text-[12px]"><span className="font-bold text-sap-muted">Discount / hurdle rate </span><span className="font-extrabold">{draft.hurdleRate}%</span></div>
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-sap-muted">Projected net cash inflows (₹)</div>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {draft.cf.map((v, i) => (
                      <Field key={i} label={`Year ${i + 1}`}>
                        <Input type="number" inputMode="decimal" placeholder="0" value={v}
                          onChange={(e) => setDraft((d) => ({ ...d, cf: d.cf.map((x, j) => (j === i ? e.target.value : x)) as CpeDraft['cf'] }))} />
                      </Field>
                    ))}
                  </div>
                  <MetricTiles {...metrics} />
                </>
              )}
            </Card>

            {/* 5. DOA preview */}
            {amount > 0 && (
              <Card title="Approval Route (auto-resolved from DOA)">
                {doa.loading && !doa.rows.length ? <Spinner /> : doa.error ? <ErrorBox message={doa.error} onRetry={doa.reload} /> : route.length === 0 ? (
                  <p className="text-[12px] text-sap-muted">No active DOA rule covers this capex type and amount.</p>
                ) : (
                  <ol className="space-y-2">
                    {route.map((s) => (
                      <li key={s.level} className="flex flex-wrap items-center gap-3 text-[12px]">
                        <span className="chip border-blue-200 bg-blue-50 text-blue-800">{s.level}</span>
                        <div className="min-w-0 flex-1"><div className="font-bold">{s.role}</div><div className="text-[11px] text-sap-muted">{s.approverName || s.approver}</div></div>
                        <span className="text-[11px] text-sap-muted">{fmtDays(s.slaDays)} SLA</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap justify-end gap-2 border-t border-sap-line bg-white/90 px-1 py-3 backdrop-blur">
        <Button onClick={saveDraft} disabled={busy}>{created ? 'Retry Upload' : 'Save Draft'}</Button>
        <Button variant="primary" onClick={trySubmit} disabled={busy || (!!budget && !check.sufficient)}>{created ? 'Retry Submit' : 'Submit'}</Button>
        <Link href={back.href} className="btn btn-secondary">Cancel</Link>
      </div>

      <Modal open={errorsOpen.length > 0} title="Cannot submit" onClose={() => setErrorsOpen([])} footer={<Button variant="primary" onClick={() => setErrorsOpen([])}>OK</Button>}>
        <ul className="list-disc space-y-1.5 pl-5 text-[12.5px]">{errorsOpen.map((e) => <li key={e}>{e}</li>)}</ul>
      </Modal>

      <Modal open={confirm} title="Submit CPE" onClose={() => setConfirm(false)}
        footer={<><Button onClick={() => setConfirm(false)}>No</Button><Button variant="primary" onClick={submit}>Yes, submit</Button></>}>
        <p className="text-[13px]">Submit {inLakhs(amount)} CPE for evaluation and approval?</p>
        <p className="mt-2 text-[12.5px] text-sap-muted">
          It will go to Unit Technical for evaluation first, then to {route.length ? route[0].role : 'the next approver'}.
        </p>
      </Modal>

      <Modal open={!!failed} title="Submission Incomplete" onClose={() => setFailed(null)}
        footer={<><Button onClick={() => setFailed(null)}>Stay here</Button>{failed && <Link href={`/cpe/detail/?id=${encodeURIComponent(failed.id)}`} className="btn btn-primary">Open draft {failed.id}</Link>}</>}>
        <p className="text-[13px]">{failed?.stage === 'upload'
          ? `CPE ${failed?.id} was saved as a draft, but a document could not be uploaded. It has not been submitted.`
          : `CPE ${failed?.id} was created but could not be routed for evaluation.`}</p>
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{failed?.message}</p>
        <p className="mt-2 text-[12.5px] text-sap-muted">It is kept as a draft. {failed?.stage === 'upload' ? 'Use Retry Upload or Retry Submit here: only the files not yet sent are uploaded, and no second CPE is created.' : 'Open it and submit again, or use Retry Submit here.'}</p>
      </Modal>
    </>
  );
}
