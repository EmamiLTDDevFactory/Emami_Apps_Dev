'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, TextArea, useAction } from '@/components/ui';
import { ApiError, fn, get, isOk, list, odataKey, q } from '@/lib/api';
import type { CPE, PurchaseOrder, ValueHelp, Vendor } from '@/lib/entities';
import { fmtInr, fmtInrFull, num } from '@/lib/format';
import { ASSET_CLASS_MAX, CREATE_CWIP_HAS_ASSET_DESC, EXEC_PROCESSES, assetClassDesc, buildCreateCwipParams, suggestAssetClass, validateCwip, type AssetClassOption, type CwipDraft } from './procureLogic';
import { AssetClassCombo } from './Bits';

type CpeWithVendors = CPE & { CPEToVendors?: { results?: Vendor[] } | Vendor[] };
const vendorsOf = (c: CpeWithVendors): Vendor[] => (Array.isArray(c.CPEToVendors) ? c.CPEToVendors : c.CPEToVendors?.results ?? []);

export default function CwipCreate() {
  const cpeId = useSearchParams().get('cpe') ?? '';
  const router = useRouter();
  const { busy, run } = useAction();
  const [cpe, setCpe] = useState<CpeWithVendors | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<AssetClassOption[]>([]);
  const [draft, setDraft] = useState<CwipDraft | null>(null);
  const [touched, setTouched] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState('');
  /** Full SAP text (up to 200 chars) from a failed push (EDSK9B0EQW: now a real HTTP 400, not a
   * generic 500) - shown in a persistent dialog, never a toast, so nothing is truncated or missed.
   * `banfn` set means the PR step succeeded before the PO step failed: the next push reuses it. */
  const [pushError, setPushError] = useState<{ message: string; banfn: string } | null>(null);
  const [poNumber, setPoNumber] = useState('');

  useEffect(() => {
    if (!cpeId) { setLoading(false); setError('No CPE selected. Open this screen from an approved CPE.'); return; }
    let live = true;
    setLoading(true);
    Promise.all([
      get<CpeWithVendors>(`CPESet${odataKey(cpeId)}`, { $expand: 'CPEToVendors' }),
      // asset classes: ValueHelpSet domain ASSETCLASS (log #50). Not fatal when empty: the box also accepts a typed code.
      list<ValueHelp>('ValueHelpSet', { $filter: `Domain eq ${q('ASSETCLASS')}` }).then((r) => r.rows).catch(() => [] as ValueHelp[]),
      // A prior attempt may have already created the PR (Banfn) before failing at the PO step.
      list<PurchaseOrder>('PurchaseOrderSet', { $filter: `Cpeid eq ${q(cpeId)}` }).then((r) => r.rows[0]?.Ebeln || '').catch(() => ''),
    ]).then(([c, vh, po]) => {
      if (!live) return;
      if (!c) { setError(`Record ${cpeId} was not found.`); return; }
      const opts = vh.filter((v) => !v.Domain || v.Domain === 'ASSETCLASS').sort((a, b) => num(a.Sortorder) - num(b.Sortorder) || a.Keyval.localeCompare(b.Keyval)).map((v) => ({ key: v.Keyval, text: v.Textval }));
      setClasses(opts);
      setCpe(c);
      setPoNumber(po);
      const sugg = suggestAssetClass(c.Capextype);
      const match = opts.find((o) => o.key === sugg);
      setDraft({
        assetClass: sugg, assetDesc: assetClassDesc(match), costCenter: '', profitCenter: 'PC-' + c.Werks,
        executionProcess: 'TURNKEY', timeframeWeeks: c.DeliveryWeeks ? String(c.DeliveryWeeks) : '', paymentTerms: c.Terms || '', remarks: '',
      });
    }).catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load the CPE.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cpeId]);

  const vendor = useMemo(() => (cpe ? vendorsOf(cpe).find((v) => v.Selected === 'X') : undefined), [cpe]);
  const check = useMemo(() => (draft ? validateCwip(draft) : { errors: [], fields: {} }), [draft]);
  const set = (patch: Partial<CwipDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  if (loading) return <Spinner />;
  if (error || !cpe || !draft) return <><PageHeader title="Create CWIP" back={{ href: '/cpe/', label: 'CPE list' }} /><ErrorBox message={error || 'Could not load the CPE.'} /></>;

  const approved = (cpe.Status || '').toUpperCase().startsWith('APPROVED');
  const err = (k: keyof CwipDraft) => (touched ? check.fields[k] : undefined);

  const onPush = () => {
    setTouched(true);
    if (vendor && !vendor.Lifnr?.trim()) { setProblems([`The selected vendor ${vendor.Vendorname || ''} has no SAP vendor code yet. An administrator sets it on the CPE (Actual Vendor Code) first.`]); return; }
    if (check.errors.length) { setProblems(check.errors); return; }
    setProblems([]);
    setConfirm(true);
  };
  /** Re-reads the CPE (Banfn gets set by SAP as soon as the PR step succeeds, even if the later PO
   * step then fails) and the PO raised against it, if any - EDSK9B0EQW: "reload the CWIP, CPE and
   * PO lists after the push" so this screen and CpeDetail both show the real current state, not
   * what was true before the push. */
  async function refreshAfterPush(): Promise<{ cpe: CpeWithVendors | null; po: string }> {
    const [freshCpe, pos] = await Promise.all([
      get<CpeWithVendors>(`CPESet${odataKey(cpeId)}`, { $expand: 'CPEToVendors' }).catch(() => null),
      list<PurchaseOrder>('PurchaseOrderSet', { $filter: `Cpeid eq ${q(cpeId)}` }).then((r) => r.rows).catch(() => [] as PurchaseOrder[]),
    ]);
    if (freshCpe) setCpe(freshCpe);
    const po = pos[0]?.Ebeln || '';
    setPoNumber(po);
    return { cpe: freshCpe, po };
  }

  const doPush = async () => {
    setConfirm(false);
    setPushError(null);
    const r = await run(async () => {
      // Caught locally (not re-thrown) so useAction's own toast never fires for this call - a
      // business error here can be up to ~200 chars and must show in full, in a persistent dialog,
      // never a toast (see the Modal below).
      try {
        const res = await fn('CreateCWIP', buildCreateCwipParams(cpeId, draft, CREATE_CWIP_HAS_ASSET_DESC));
        if (!isOk(res)) {
          const { cpe: fresh } = await refreshAfterPush();
          setPushError({ message: res.Message || 'SAP posting failed.', banfn: fresh?.Banfn || '' });
          return null;
        }
        await refreshAfterPush();
        return res;
      } catch (e) {
        const { cpe: fresh } = await refreshAfterPush();
        setPushError({ message: e instanceof ApiError || e instanceof Error ? e.message : 'SAP posting failed.', banfn: fresh?.Banfn || '' });
        return null;
      }
    });
    if (r) setDone(r.Message || 'Pushed to SAP successfully.');
  };

  return (
    <>
      <PageHeader title="Create CWIP" back={{ href: '/cpe/detail/?id=' + encodeURIComponent(cpeId), label: cpeId }}
        subtitle={`${cpe.Cpeid} - ${cpe.Title}`}
        actions={<><Button onClick={() => router.back()}>Cancel</Button><Button variant="primary" disabled={busy || !!done} onClick={onPush}>{busy ? 'Pushing...' : 'Push to SAP'}</Button></>} />

      <div className="mb-3 text-[12px] text-sap-muted">{cpe.PlantName} &middot; {fmtInr(cpe.Amount)} &middot; Vendor: {vendor?.Vendorname || '-'}</div>

      {!done && !pushError && cpe.Banfn && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
          A Purchase Requisition ({cpe.Banfn}) already exists for this CPE from an earlier push{poNumber ? <> and PO {poNumber} was also raised</> : ' - the PO step had not completed'}. Pushing again will not create a second PR.
        </div>
      )}

      {pushError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          <b>Push to SAP failed.</b>
          <p className="mt-1 whitespace-pre-wrap break-words">{pushError.message}</p>
          {pushError.banfn ? (
            <p className="mt-2 font-semibold">PR {pushError.banfn} created, PO failed. A retry reuses this PR - it will not create a second one.</p>
          ) : (
            <p className="mt-2 text-sap-muted">Nothing was created in SAP. Fix the issue above and push again.</p>
          )}
        </div>
      )}
      {done ? (
        <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          <b>Posted to SAP.</b> {done}<br />The budget commitment has been updated in real time.
          {cpe.Banfn && <div className="mt-1">PR: <b>{cpe.Banfn}</b>{poNumber && <> &middot; PO: <b>{poNumber}</b></>}</div>}
          <div className="mt-2"><Button variant="primary" onClick={() => router.push('/po/')}>Go to Purchase Orders</Button></div>
        </div>
      ) : approved ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-800">
          CPE is fully approved. Complete the fields below and push to SAP - the Internal Order, CWIP element and Purchase Order are created automatically.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
          This CPE is not shown as approved (status: {cpe.Status || '-'}). SAP will refuse the push unless the CPE is fully approved.
        </div>
      )}
      {problems.length > 0 && <div className="mb-4"><ErrorBox message={'Cannot push to SAP. ' + problems.join(' ')} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="CWIP / Asset Under Construction">
          <div className="grid gap-3">
            <Field label="Asset Class *" error={err('assetClass')} hint="Pick from the list or type a code (max 8 characters). Search by code or name.">
              <AssetClassCombo value={draft.assetClass} options={classes} max={ASSET_CLASS_MAX}
                onChange={(code) => set({ assetClass: code })}
                onPick={(o) => set({ assetClass: o.key, assetDesc: assetClassDesc(o) })} />
            </Field>
            <Field label="Asset Description" hint="Used as the description of the fixed asset when it is capitalized.">
              <Input value={draft.assetDesc} maxLength={50} onChange={(e) => set({ assetDesc: e.target.value })} placeholder="e.g. Injection Moulding Machine - Line 3" />
            </Field>
            <Field label="WBS Element"><Input value="" readOnly placeholder="Auto-generated by SAP on posting" className="bg-[#F4F6FC]" /></Field>
            <Field label="Cost Center *" error={err('costCenter')}><Input value={draft.costCenter} onChange={(e) => set({ costCenter: e.target.value })} placeholder="e.g. 1100-PROD-01" /></Field>
            <Field label="Profit Center"><Input value={draft.profitCenter} onChange={(e) => set({ profitCenter: e.target.value })} placeholder="e.g. PC-1100" /></Field>
          </div>
        </Card>

        <Card title="Purchase Order Details">
          <div className="grid gap-3">
            <Field label="Vendor"><Input value={vendor?.Vendorname || '-'} readOnly className="bg-[#F4F6FC]" /></Field>
            <Field label="PO Value"><Input value={fmtInrFull(cpe.Amount)} readOnly className="bg-[#F4F6FC]" /></Field>
            <Field label="Execution Process *">
              <Select value={draft.executionProcess} onChange={(e) => set({ executionProcess: e.target.value })}>
                {EXEC_PROCESSES.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
              </Select>
            </Field>
            <Field label="Execution Timeframe (weeks) *" error={err('timeframeWeeks')}>
              <Input type="number" min={1} value={draft.timeframeWeeks} onChange={(e) => set({ timeframeWeeks: e.target.value })} className="w-40" />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="grid gap-3">
          <Field label="Payment Terms *" error={err('paymentTerms')}>
            <TextArea rows={3} maxLength={800} value={draft.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })}
              placeholder="e.g. 30% advance against PI, 60% against dispatch documents, 10% after successful commissioning." />
          </Field>
          <Field label="Remarks">
            <TextArea rows={2} maxLength={600} value={draft.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Site readiness, liquidated damages, inspection requirements." />
          </Field>
        </div>
      </Card>

      <Modal open={confirm} title="Push to SAP" onClose={() => setConfirm(false)}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={doPush}>Push to SAP</Button></>}>
        <p className="text-[12px]">Push <b>{cpe.Cpeid}</b> to SAP?</p>
        <p className="mt-2 text-[12px] text-sap-muted">This creates the Internal Order, the CWIP element and the Purchase Order for {vendor?.Vendorname || 'the selected vendor'} at {fmtInr(cpe.Amount)}.</p>
      </Modal>
    </>
  );
}
