'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, TextArea, useAction } from '@/components/ui';
import { ApiError, fn, get, isOk, list, odataKey, q } from '@/lib/api';
import type { CPE, ValueHelp, Vendor } from '@/lib/entities';
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

  useEffect(() => {
    if (!cpeId) { setLoading(false); setError('No CPE selected. Open this screen from an approved CPE.'); return; }
    let live = true;
    setLoading(true);
    Promise.all([
      get<CpeWithVendors>(`CPESet${odataKey(cpeId)}`, { $expand: 'CPEToVendors' }),
      // asset classes: ValueHelpSet domain ASSETCLASS (log #50). Not fatal when empty: the box also accepts a typed code.
      list<ValueHelp>('ValueHelpSet', { $filter: `Domain eq ${q('ASSETCLASS')}` }).then((r) => r.rows).catch(() => [] as ValueHelp[]),
    ]).then(([c, vh]) => {
      if (!live) return;
      if (!c) { setError(`Record ${cpeId} was not found.`); return; }
      const opts = vh.filter((v) => !v.Domain || v.Domain === 'ASSETCLASS').sort((a, b) => num(a.Sortorder) - num(b.Sortorder) || a.Keyval.localeCompare(b.Keyval)).map((v) => ({ key: v.Keyval, text: v.Textval }));
      setClasses(opts);
      setCpe(c);
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
    if (check.errors.length) { setProblems(check.errors); return; }
    setProblems([]);
    setConfirm(true);
  };
  const doPush = async () => {
    setConfirm(false);
    const r = await run(async () => {
      const res = await fn('CreateCWIP', buildCreateCwipParams(cpeId, draft, CREATE_CWIP_HAS_ASSET_DESC));
      if (!isOk(res)) throw new Error(res.Message || 'SAP posting failed.');
      return res;
    });
    if (r) setDone(r.Message || 'Pushed to SAP successfully.');
  };

  return (
    <>
      <PageHeader title="Create CWIP" back={{ href: '/cpe/detail/?id=' + encodeURIComponent(cpeId), label: cpeId }}
        subtitle={`${cpe.Cpeid} - ${cpe.Title}`}
        actions={<><Button onClick={() => router.back()}>Cancel</Button><Button variant="primary" disabled={busy || !!done} onClick={onPush}>{busy ? 'Pushing...' : 'Push to SAP'}</Button></>} />

      <div className="mb-3 text-[12px] text-sap-muted">{cpe.PlantName} &middot; {fmtInr(cpe.Amount)} &middot; Vendor: {vendor?.Vendorname || '-'}</div>

      {done ? (
        <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          <b>Posted to SAP.</b> {done}<br />The budget commitment has been updated in real time.
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
            <Field label="Asset Description" hint={CREATE_CWIP_HAS_ASSET_DESC ? undefined : 'Not sent to SAP yet: the live CreateCWIP has no description parameter.'}>
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
