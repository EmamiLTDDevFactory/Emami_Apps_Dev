'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Card, Button, Field, Input, Select, TextArea, Chip, Modal, Spinner, ErrorBox, useAction, useToast } from '@/components/ui';
import { ApiError, create, fn, get, isOk, list, odataKey } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useList } from '@/lib/useData';
import type { Budget, BudgetCashFlow, BudgetItem, DoaRule } from '@/lib/entities';
import { num, fmtInr, fmtInrFull, fyDigits, currentFiscalYear, isStatus } from '@/lib/format';
import { metricsForDisplay, metricWarnings } from '@/lib/finance';
import { resolveDOA } from '@/lib/rules';
import { documentsEnabled, DOCUMENTS_OFF_NOTE } from '@/lib/documents';
import Combo from './Combo';
import { useBudgetOptions } from './useOptions';
import {
  HURDLE_RATE, DEFAULT_JUSTIF_MIN_CHARS, buildBudgetPayload, buildTemplateSheets, draftFromParsed, effectiveAmount, emptyCashFlows, itemsTotal,
  newDraft, parseBudgetSheet, validateDraft, type BudgetDraft, type DraftItem, type MetricValues, type ParsedBudget,
} from './logic';

const msg = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);
const TEMPLATE_INVALID = "This file doesn't look like the Budget template - please download a fresh copy and fill that in instead.";
const TEMPLATE_EMPTY = 'The uploaded file has no data rows - fill in at least one line item row below the header.';

interface BulkResult { title: string; id?: string; ok: boolean; submitted?: boolean; warnings: string[]; error?: string }

export default function BudgetCreate() {
  return <Suspense fallback={<Spinner />}><Inner /></Suspense>;
}

function Inner() {
  const editId = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const toast = useToast();
  const { busy, run } = useAction();
  const { plants: userPlants, fiscalYear, cfgNum } = useSession();
  const { plants, capexTypes, categories, loading: optsLoading, error: optsError } = useBudgetOptions();
  const rules = useList<DoaRule>('DoaRuleSet', { $expand: 'DoaRuleToChain' });
  const justifMin = cfgNum('JUSTIF_MIN_CHARS', DEFAULT_JUSTIF_MIN_CHARS);

  const [draft, setDraft] = useState<BudgetDraft>(() => newDraft(''));
  const [loadingDraft, setLoadingDraft] = useState(!!editId);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [bulk, setBulk] = useState<{ file: string; results: BulkResult[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof BudgetDraft>(k: K, v: BudgetDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // ---- load an existing DRAFT for editing (BudgetEdit route) ----
  useEffect(() => {
    if (!editId) { setLoadingDraft(false); return; }
    let live = true;
    (async () => {
      try {
        const key = `BudgetSet${odataKey(editId)}`;
        const b = await get<Budget>(key);
        if (!live) return;
        if (!b) { toast(`Record ${editId} could not be found.`, 'error'); router.replace('/budget/'); return; }
        if (!isStatus(b.Status, 'DRAFT')) { toast('Only a DRAFT budget can be edited.', 'error'); router.replace(`/budget/detail/?id=${encodeURIComponent(editId)}`); return; }
        const [fl, it] = await Promise.all([list<BudgetCashFlow>(`${key}/BudgetToCashFlows`), list<BudgetItem>(`${key}/BudgetToItems`)]);
        if (!live) return;
        const cf = emptyCashFlows();
        fl.rows.forEach((r) => { const i = (parseInt(r.Yearnr, 10) || 0) - 1; if (i >= 0 && i < cf.length) cf[i] = num(r.Amount) ? String(num(r.Amount)) : ''; });
        setDraft({
          budgetId: b.Budgetid, fiscalYear: b.Fiscalyear, title: b.Title, plant: b.Werks, capexType: b.Capextype, category: b.Category,
          amount: String(num(b.Investment) || num(b.AmtApproved) || ''), justification: b.Justification, expectedBenefit: b.ExpectedBenefit || '',
          metricsEnabled: b.MetricsOn === 'X', cf,
          items: it.rows.slice().sort((a, c) => a.Itemno.localeCompare(c.Itemno)).map((r, i) => ({ id: `existing-${i}`, title: r.ItemTitle, amount: String(num(r.Amount) || ''), remarks: r.Remarks || '' })),
        });
      } catch (e) { if (live) setLoadError(msg(e, 'Could not load the draft.')); }
      finally { if (live) setLoadingDraft(false); }
    })();
    return () => { live = false; };
  }, [editId, router, toast]);

  // ---- defaults for a NEW budget once the lists are known ----
  useEffect(() => {
    if (editId) return;
    setDraft((d) => {
      let n = d;
      if (!d.plant && plants.length) n = { ...n, plant: plants[0].key };
      if (capexTypes.length && !capexTypes.some((o) => o.key === d.capexType)) n = { ...n, capexType: capexTypes[0].key };
      if (categories.length && !categories.some((o) => o.key === d.category)) n = { ...n, category: categories[0].key };
      return n;
    });
  }, [editId, plants, capexTypes, categories]);

  // ---- live numbers ----
  const amount = effectiveAmount(draft);
  const metrics = useMemo<MetricValues>(
    () => (draft.metricsEnabled ? metricsForDisplay(amount, draft.cf, HURDLE_RATE) : { irr: null, npv: null, payback: null }),
    [draft.metricsEnabled, draft.cf, amount]);
  const warn = metricWarnings(metrics, HURDLE_RATE);
  const doa = useMemo(() => resolveDOA(rules.rows, draft.capexType, amount, 'BUD').chain, [rules.rows, draft.capexType, amount]);
  const fyDigitsNow = fyDigits(fiscalYear) || currentFiscalYear();

  const payload = useCallback((d: BudgetDraft) => {
    const m = d.metricsEnabled ? metricsForDisplay(effectiveAmount(d), d.cf, HURDLE_RATE) : { irr: null, npv: null, payback: null };
    return buildBudgetPayload(d, m, fyDigitsNow);
  }, [fyDigitsNow]);

  // ---- items ----
  const addItem = () => setDraft((d) => ({ ...d, items: [...d.items, { id: `${Date.now()}-${d.items.length}`, title: '', amount: '', remarks: '' }] }));
  const setItem = (id: string, patch: Partial<DraftItem>) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const removeItem = (id: string) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));

  // ---- save draft / submit ----
  const afterSave = (id: string) => router.push(draft.budgetId ? `/budget/detail/?id=${encodeURIComponent(id)}` : '/budget/');

  async function saveDraft() {
    if (!draft.title.trim()) { toast('Enter at least a budget title before saving a draft.', 'error'); return; }
    const editing = !!draft.budgetId;
    const id = await run(async () => {
      // Edit = the same deep POST with the existing Budgetid (Budget Items email); PUT would drop cash flows/items.
      const r = await create<{ Budgetid?: string }>('BudgetSet', payload(draft));
      return r.Budgetid || draft.budgetId || '';
    }, editing ? 'Draft updated.' : 'Draft saved.');
    if (id !== undefined) afterSave(id);
  }

  function askSubmit() {
    const errs = validateDraft(draft, justifMin);
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setConfirm(true);
  }

  async function submit() {
    setConfirm(false);
    const first = doa[0]?.role || 'Finance';
    const done = await run(async () => {
      const r = await create<{ Budgetid?: string }>('BudgetSet', payload(draft));
      const id = r.Budgetid || draft.budgetId || '';
      // create only ever makes a DRAFT; the DOA chain starts when SubmitDocument runs
      try {
        const s = await fn('SubmitDocument', { DocType: 'BUD', DocId: id });
        if (!isOk(s)) throw new Error(s.Message || 'SAP did not accept the submission.');
      } catch (e) {
        toast(`Budget ${id} was created but could not be routed for approval. ${msg(e, '')} It has been saved as a draft - open it and submit again.`, 'error');
        return { id, submitted: false };
      }
      return { id, submitted: true };
    });
    if (!done) return;
    if (done.submitted) toast(`Budget ${done.id} submitted. Routed to ${first}. On final approval the SAP Internal Order will be created automatically and the budget reserved.`, 'success');
    router.push('/budget/');
  }

  // ---- Excel ----
  async function downloadTemplate() {
    try {
      const XLSX = await import('xlsx');
      const s = buildTemplateSheets({ plants, capexTypes, categories });
      const wb = XLSX.utils.book_new();
      const t = XLSX.utils.aoa_to_sheet(s.template);
      t['!cols'] = s.template[0].map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, t, 'Budget Template');
      const ins = XLSX.utils.aoa_to_sheet(s.instructions);
      ins['!cols'] = [{ wch: 70 }];
      XLSX.utils.book_append_sheet(wb, ins, 'Instructions');
      XLSX.writeFile(wb, 'Budget_Upload_Template.xlsx');
    } catch { toast('Could not create the template.', 'error'); }
  }

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    let aoa: unknown[][];
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const name = wb.SheetNames.includes('Budget Template') ? 'Budget Template' : wb.SheetNames[0];
      const sheet = name ? wb.Sheets[name] : undefined;
      if (!sheet) { toast(TEMPLATE_INVALID, 'error'); return; }
      aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
    } catch { toast(TEMPLATE_INVALID, 'error'); return; }

    const parsed = parseBudgetSheet(aoa, { plants, capexTypes, categories, defaultPlant: userPlants[0]?.code || plants[0]?.key || '', defaultCapexType: capexTypes[0]?.key, defaultCategory: categories[0]?.key });
    if (parsed.kind === 'error') { toast(parsed.reason === 'empty' ? TEMPLATE_EMPTY : TEMPLATE_INVALID, 'error'); return; }
    if (parsed.kind === 'form') {
      // nothing to group by: fill the form from the first row for the user to complete by hand
      const p = parsed.budget;
      setDraft((d) => ({ ...d, plant: p.plant || d.plant, capexType: p.capexType || d.capexType, category: p.category || d.category,
        justification: p.justification || d.justification, expectedBenefit: p.expectedBenefit || d.expectedBenefit,
        metricsEnabled: p.metricsEnabled, cf: p.cf, items: p.items, amount: p.items.length ? '' : d.amount }));
      if (p.warnings.length) toast(`Filled the form from ${file.name}, but some values weren't recognised and need to be picked manually: ${p.warnings.join(', ')}`, 'info');
      else toast(`Filled the form from ${file.name} (${p.items.length} line item(s)).`, 'success');
      return;
    }
    await bulkImport(parsed.budgets, file.name);
  }

  /** Every Budget Title in the file becomes its own budget: create, then SubmitDocument (log #128-#132). */
  async function bulkImport(budgets: ParsedBudget[], fileName: string) {
    const results = await run(async () => {
      const out: BulkResult[] = [];
      for (const p of budgets) {
        const d = draftFromParsed(p);
        if (!d.title || !(effectiveAmount(d) > 0)) { out.push({ title: p.title || '(untitled)', ok: false, warnings: [], error: `Budget "${p.title || '(untitled)'}" has no title or no line items with an amount and was skipped.` }); continue; }
        try {
          const r = await create<{ Budgetid?: string }>('BudgetSet', payload(d));
          const id = r.Budgetid || '';
          try {
            const s = await fn('SubmitDocument', { DocType: 'BUD', DocId: id });
            if (!isOk(s)) throw new Error(s.Message || 'SAP did not accept the submission.');
            out.push({ title: p.title, id, ok: true, submitted: true, warnings: p.warnings });
          } catch (e) { out.push({ title: p.title, id, ok: true, submitted: false, warnings: p.warnings, error: msg(e, 'Submission failed.') }); }
        } catch (e) { out.push({ title: p.title, ok: false, warnings: [], error: msg(e, 'Could not create the budget.') }); }
      }
      return out;
    });
    if (results) { setBulk({ file: fileName, results }); setDraft(newDraft(plants[0]?.key ?? '', { capexType: capexTypes[0]?.key, category: categories[0]?.key })); }
  }

  const back = () => router.push(draft.budgetId ? `/budget/detail/?id=${encodeURIComponent(draft.budgetId)}` : '/budget/');
  const title = editId ? 'Edit Capex Budget' : 'Create Capex Budget';

  if (loadingDraft) return <><PageHeader title={title} back={{ href: '/budget/', label: 'Budgets' }} /><Spinner /></>;
  if (loadError) return <><PageHeader title={title} back={{ href: '/budget/', label: 'Budgets' }} /><ErrorBox message={loadError} /></>;

  const hasItems = draft.items.length > 0;
  const showErr = errors.length > 0;
  const justLen = draft.justification.trim().length;
  const fmtM = (v: number | null, f: (n: number) => string) => (v === null || isNaN(v) ? '—' : f(v));

  return (
    <>
      <PageHeader title={title} back={{ href: editId ? `/budget/detail/?id=${encodeURIComponent(editId)}` : '/budget/', label: editId ? 'Budget' : 'Budgets' }} />
      {optsError && <div className="mb-3"><ErrorBox message={optsError} /></div>}
      {errors.length > 0 && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          <div className="mb-1 font-bold">Cannot submit</div>
          <ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="space-y-4">
        <Card title="Fill from Excel" hint="Download the template, fill it in Excel (one row per line item - repeat for multiple line items under the same budget, or just one row for a single line item, repeat the whole block again for another budget with a different Budget Title), then upload it. Every budget found in the file is created and submitted for approval automatically - no form filling, Save Draft, or Submit click needed.">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { void downloadTemplate(); }} disabled={optsLoading}>Download Template</Button>
            <Button variant="secondary" disabled={busy || optsLoading} onClick={() => fileRef.current?.click()}>Upload Filled Template</Button>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" aria-label="Upload filled template" onChange={(e) => { void onFile(e.target.files?.[0]); }} />
            {busy && <span className="text-[12px] text-sap-muted">Working…</span>}
          </div>
        </Card>

        <Card title="Budget Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget Title *" error={showErr && !draft.title.trim() ? 'Required' : undefined}>
              <Input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Manufacturing Capacity Expansion" maxLength={120} />
            </Field>
            <Field label="Plant / Unit *" error={showErr && !draft.plant ? 'Required' : undefined}>
              <Combo options={plants} value={draft.plant} onChange={(k) => set('plant', k)} placeholder="Search by plant code or name" invalid={showErr && !draft.plant} />
            </Field>
            <Field label="Capex Type *">
              <Select value={draft.capexType} onChange={(e) => set('capexType', e.target.value)}>
                {!capexTypes.some((o) => o.key === draft.capexType) && <option value={draft.capexType}>{draft.capexType}</option>}
                {capexTypes.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </Select>
            </Field>
            <Field label="Category *">
              <Select value={draft.category} onChange={(e) => set('category', e.target.value)}>
                {!categories.some((o) => o.key === draft.category) && <option value={draft.category}>{draft.category}</option>}
                {categories.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </Select>
            </Field>
            <Field label="Budget Amount (₹) *" error={showErr && !(amount > 0) ? 'Enter an amount greater than zero' : undefined}
              hint={hasItems ? 'Computed automatically from the items below' : undefined}>
              <Input type="number" inputMode="decimal" min={0} step="any" placeholder="0" readOnly={hasItems}
                value={hasItems ? String(itemsTotal(draft.items)) : draft.amount} onChange={(e) => set('amount', e.target.value)} />
            </Field>
            <Field label="Funding Source"><div className="flex h-8 items-center text-[12px] font-semibold">New Budget Allocation</div></Field>
          </div>
        </Card>

        <Card title="Budget Line Items" hint="Add line items to build up the budget amount automatically. Leave empty to enter a single amount above instead.">
          {draft.items.length === 0 && <p className="py-2 text-[12px] text-sap-muted">No line items added yet.</p>}
          <div className="space-y-2">
            {draft.items.map((it, i) => (
              <div key={it.id} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <Field label={i === 0 ? 'Item Title' : <span className="sm:sr-only">Item Title</span>}><Input value={it.title} onChange={(e) => setItem(it.id, { title: e.target.value })} placeholder="Item title" /></Field>
                <Field label={i === 0 ? 'Amount (₹)' : <span className="sm:sr-only">Amount</span>}><Input type="number" inputMode="decimal" min={0} step="any" className="text-right" value={it.amount} onChange={(e) => setItem(it.id, { amount: e.target.value })} placeholder="Amount" /></Field>
                <Field label={i === 0 ? 'Remarks' : <span className="sm:sr-only">Remarks</span>}><Input value={it.remarks} onChange={(e) => setItem(it.id, { remarks: e.target.value })} placeholder="Remarks" /></Field>
                <Button variant="danger" aria-label={`Delete item ${i + 1}`} title="Delete" onClick={() => removeItem(it.id)}>{'✕'}</Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={addItem}>+ Add Item</Button>
            {hasItems && <span className="text-[12px] font-bold">{fmtInrFull(itemsTotal(draft.items))} ({draft.items.length} item{draft.items.length === 1 ? '' : 's'})</span>}
          </div>
        </Card>

        <Card title="Justification & Benefits">
          <div className="space-y-4">
            <Field label="Business Justification *" error={showErr && justLen < justifMin ? `At least ${justifMin} characters (${justLen} so far)` : undefined}
              hint={`${draft.justification.length}/1000`}>
              <TextArea rows={4} maxLength={1000} value={draft.justification} onChange={(e) => set('justification', e.target.value)}
                placeholder="Why is this investment needed? Reference capacity, compliance, obsolescence or cost data." />
            </Field>
            <Field label="Expected Benefit" hint={`${draft.expectedBenefit.length}/600`}>
              <TextArea rows={3} maxLength={600} value={draft.expectedBenefit} onChange={(e) => set('expectedBenefit', e.target.value)}
                placeholder="Quantify the benefit: throughput gain, cost saving per annum, rejection reduction." />
            </Field>
            {!documentsEnabled() && <p className="text-[11px] text-sap-muted">{DOCUMENTS_OFF_NOTE}</p>}
          </div>
        </Card>

        <Card title="Financial Evaluation"
          actions={<label className="flex items-center gap-2 text-[12px] font-bold"><input type="checkbox" role="switch" checked={draft.metricsEnabled} onChange={(e) => set('metricsEnabled', e.target.checked)} />Enable financial metrics</label>}>
          {!draft.metricsEnabled ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">Financial computation is switched off for this request.</p>
          ) : (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Field label="Investment"><div className="flex h-8 items-center text-[12px] font-semibold">{fmtInrFull(amount)}</div></Field>
                <Field label="Discount / Hurdle Rate"><div className="flex h-8 items-center text-[12px] font-semibold">{HURDLE_RATE}%</div></Field>
              </div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Projected Net Cash Inflows</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {draft.cf.map((v, i) => (
                  <Field key={i} label={`Year ${i + 1}`}>
                    <Input type="number" inputMode="decimal" step="any" placeholder="0" value={v} onChange={(e) => setDraft((d) => ({ ...d, cf: d.cf.map((x, j) => (j === i ? e.target.value : x)) }))} />
                  </Field>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-sap-muted">Amounts in ₹. Enter net cash inflow per year. IRR, NPV and payback update as you type; SAP recalculates them when the budget is saved.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricBox label="IRR" value={fmtM(metrics.irr, (n) => `${n.toFixed(1)}%`)} foot={`hurdle ${HURDLE_RATE.toFixed(1)}%`} />
                <MetricBox label="NPV" value={fmtM(metrics.npv, (n) => fmtInr(n))} foot="at hurdle rate" />
                <MetricBox label="Payback" value={fmtM(metrics.payback, (n) => `${n.toFixed(1)} yrs`)} foot="discounted" />
              </div>
              {(warn.irrBelowHurdle || warn.npvNegative) && (
                <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  {warn.irrBelowHurdle && <>IRR of {metrics.irr?.toFixed(1)}% is below the hurdle rate of {HURDLE_RATE.toFixed(1)}%. Justify or revise the cash flow projection. </>}
                  {warn.npvNegative && <>NPV is negative. This investment does not create value at the current hurdle rate.</>}
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Approval Route (auto-resolved from DOA)">
          {!(amount > 0) ? <p className="text-[12px] text-sap-muted">Enter a capex type and amount to see who this will be routed to.</p>
            : rules.loading ? <Spinner /> : rules.error ? <ErrorBox message={rules.error} onRetry={rules.reload} />
            : doa.length === 0 ? <p className="text-[12px] text-sap-muted">No DOA rule matches this capex type and amount.</p>
            : (
              <ol className="space-y-2">
                {doa.map((s) => (
                  <li key={s.level} className="flex items-center gap-3 text-[12px]">
                    <Chip tone="info">{`L${s.level}`}</Chip>
                    <div className="min-w-0 flex-1"><div className="font-bold">{s.role}</div><div className="text-[11px] text-sap-muted">{s.approverName || s.approver}</div></div>
                    <span className="text-[11px] text-sap-muted">{s.slaDays} days SLA</span>
                  </li>
                ))}
              </ol>
            )}
        </Card>
      </div>

      <div className="sticky bottom-0 -mx-1 mt-4 flex flex-wrap justify-end gap-2 border-t border-sap-line bg-white/85 px-1 py-3 backdrop-blur">
        <Button disabled={busy} onClick={() => { void saveDraft(); }}>Save Draft</Button>
        <Button variant="primary" disabled={busy} onClick={askSubmit}>Submit</Button>
        <Button disabled={busy} onClick={back}>Cancel</Button>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit Budget"
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => { void submit(); }}>Submit</Button></>}>
        <p className="text-[13px]">Submit budget of {fmtInrFull(amount)} for approval?</p>
        <p className="mt-2 text-[12px] text-sap-muted">It will be routed to {doa[0]?.role || 'Finance'} first.</p>
      </Modal>

      <Modal open={!!bulk} wide title="Bulk Import" onClose={() => { const any = bulk?.results.some((r) => r.ok); setBulk(null); if (any) router.push('/budget/'); }}
        footer={<Button variant="primary" onClick={() => { const any = bulk?.results.some((r) => r.ok); setBulk(null); if (any) router.push('/budget/'); }}>OK</Button>}>
        {bulk && <BulkSummary file={bulk.file} results={bulk.results} />}
      </Modal>
    </>
  );
}

function MetricBox({ label, value, foot }: { label: string; value: string; foot: string }) {
  return <div className="glass rounded-xl px-4 py-3"><div className="text-[11px] font-bold uppercase text-sap-muted">{label}</div><div className="font-display text-xl font-extrabold">{value}</div><div className="text-[11px] text-sap-muted">{foot}</div></div>;
}

function BulkSummary({ file, results }: { file: string; results: BulkResult[] }) {
  const submitted = results.filter((r) => r.ok && r.submitted);
  const draftOnly = results.filter((r) => r.ok && !r.submitted);
  const failed = results.filter((r) => !r.ok);
  return (
    <div className="space-y-3 text-[12px]">
      <p><b>{file}</b>: {submitted.length} submitted for approval{draftOnly.length ? `, ${draftOnly.length} saved as draft only (could not be submitted automatically)` : ''}{failed.length ? `, ${failed.length} could not be created at all` : ''}.</p>
      <ul className="space-y-1.5">
        {results.map((r, i) => (
          <li key={`${r.title}-${i}`} className="rounded-lg border border-sap-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{r.title}</span>{r.id && <span className="text-sap-muted">{r.id}</span>}
              <Chip tone={r.ok ? (r.submitted ? 'success' : 'warning') : 'error'}>{r.ok ? (r.submitted ? 'Submitted' : 'Draft only') : 'Failed'}</Chip>
            </div>
            {r.error && <div className="mt-1 text-red-700">{r.error}</div>}
            {r.warnings.length > 0 && <div className="mt-1 text-amber-700">Values not recognised and defaulted: {r.warnings.join(', ')}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
