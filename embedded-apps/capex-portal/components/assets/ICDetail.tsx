'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Chip, ErrorBox, Field, Input, Modal, PageHeader, Spinner, TextArea, useAction, useToast } from '@/components/ui';
import { ApiError, create, fn, get, isOk, list, odataKey, update } from '@/lib/api';
import { useSession } from '@/lib/session';
import { PHOTO_EXTENSIONS, listDocuments, openDocument, uploadDocument, validateFile, type CapexDocument } from '@/lib/documents';
import type { CPE, CWIP, GRN, InstallCert, PurchaseOrder } from '@/lib/entities';
import { fmtDate, fmtInr, fmtInrFull, num, orDash, statusLabel, statusTone, toIsoDate } from '@/lib/format';
import { KV } from '@/components/procure/Bits';
import { PHOTO_LABELS, PHOTO_RULE_NOTE, TECH_SIGNOFF_MAX, buildIcPayload, icPermissions, isCapitalized, photoSlots, totalCost, validateIc, type IcDraft } from './icLogic';

const costStr = (v: string | number | undefined) => { const n = num(v); return n ? String(n) : ''; };

function toDraft(c: InstallCert): IcDraft {
  return {
    cwipid: c.Cwipid, cpeid: c.Cpeid, anlkl: c.Anlkl, kostl: c.Kostl, ebeln: c.Ebeln, mblnr: c.Mblnr, title: c.Title, werks: c.Werks,
    commissionDt: toIsoDate(c.CommissionDt), techSignoff: c.TechSignoff || '', remarks: c.Remarks || '',
    equipCost: costStr(c.EquipCost), freightCost: costStr(c.FreightCost), installCost: costStr(c.InstallCost),
  };
}

export default function ICDetail() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const newCpe = params.get('new') ?? '';
  const router = useRouter();
  const { role, isAdmin } = useSession();
  const { busy, run } = useAction();
  const toast = useToast();
  const [cert, setCert] = useState<InstallCert | null>(null);
  const [draft, setDraft] = useState<IcDraft | null>(null);
  const [meta, setMeta] = useState({ plantName: '', cpeTitle: '' });
  const [docs, setDocs] = useState<CapexDocument[]>([]);
  /** Photos picked but not yet sent to SAP, by slot index 0-2 (sent after the IC is saved, Fiori order). */
  const [picks, setPicks] = useState<Record<number, File>>({});
  /** IC created by a Save whose photo upload failed: Save again updates it, never creates a second one. */
  const [savedId, setSavedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (id) {
        const c = await get<InstallCert>(`InstallCertSet${odataKey(id)}`);
        if (!c) { setError(`Record ${id} was not found.`); return; }
        setCert(c); setDraft(toDraft(c)); setMeta({ plantName: c.PlantName, cpeTitle: c.Title }); setError('');
        setDocs(await listDocuments('IC', id).catch(() => [] as CapexDocument[]));
      } else if (newCpe) {
        // seed from CPE -> PO -> GRN -> CWIP (log #25: Cwipid/Anlkl/Kostl/Ebeln/Mblnr all come from these)
        const [cpe, pos, grns, cwips] = await Promise.all([
          get<CPE>(`CPESet${odataKey(newCpe)}`),
          list<PurchaseOrder>('PurchaseOrderSet').then((r) => r.rows),
          list<GRN>('GRNSet').then((r) => r.rows),
          list<CWIP>('CWIPSet').then((r) => r.rows),
        ]);
        if (!cpe) { setError(`Record ${newCpe} was not found.`); return; }
        const po = pos.find((p) => p.Cpeid === newCpe);
        const grn = po ? grns.find((g) => g.Ebeln === po.Ebeln) : undefined;
        const cwip = cwips.find((c) => c.Cpeid === newCpe);
        const equip = num(grn?.Value) || num(po?.Amount) || num(cpe.Amount);
        setCert(null);
        setMeta({ plantName: cpe.PlantName, cpeTitle: cpe.Title });
        setDraft({
          cwipid: cwip?.Cwipid || po?.Cwipid || '', cpeid: newCpe, anlkl: cwip?.Anlkl || '', kostl: cwip?.Kostl || '', ebeln: po?.Ebeln || '', mblnr: grn?.Mblnr || '',
          title: cpe.Title, werks: cpe.Werks, commissionDt: toIsoDate(new Date()), techSignoff: '', remarks: '',
          equipCost: equip ? String(equip) : '', freightCost: '', installCost: '',
        });
        setError('');
      } else setError('No installation certificate selected.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load the installation certificate.'); }
    finally { setLoading(false); }
  }, [id, newCpe]);
  useEffect(() => { load(); }, [load]);

  const isNew = !id;
  const perms = useMemo(() => (isNew ? { editable: true, canApprove: false } : icPermissions(cert?.Status || '', role, isAdmin)), [isNew, cert, role, isAdmin]);
  const slots = useMemo(() => photoSlots(docs), [docs]);
  const photoCount = slots.filter((s, i) => s.uploaded || picks[i]).length;
  const check = useMemo(() => (draft ? validateIc(draft, photoCount, true) : { errors: [], fields: {} }), [draft, photoCount]);

  if (loading && !draft) return <Spinner />;
  if (error || !draft) return <><PageHeader title="Installation Certificate" back={{ href: '/ic/', label: 'Installation Certificates' }} /><ErrorBox message={error || 'Not found.'} /></>;

  const set = (p: Partial<IcDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const total = totalCost(draft);
  const err = (k: keyof IcDraft) => (touched ? check.fields[k] : undefined);
  const status = cert?.Status || 'PENDING';

  const onSave = async () => {
    setTouched(true);
    if (check.errors.length) { setProblems(check.errors); return; }
    setProblems([]);
    const payload = buildIcPayload(draft, photoCount);
    const r = await run(async () => {
      let sid = id || savedId;
      if (sid) await update(`InstallCertSet${odataKey(sid)}`, payload);
      else {
        const res = (await create('InstallCertSet', payload)) as { Icid?: string; d?: { Icid?: string } } | null;
        sid = res?.Icid || res?.d?.Icid || '';
        if (!sid) throw new Error('SAP did not return the new installation certificate number.');
        setSavedId(sid);
      }
      // Photos only once the IC itself is saved (needs a real Icid); one fixed PHOTO1/2/3 slot replaces the old file.
      for (let i = 0; i < 3; i++) {
        const file = picks[i];
        if (!file) continue;
        try {
          await uploadDocument({ doctype: 'IC', docid: sid, category: 'PHOTO' + (i + 1), file, title: PHOTO_LABELS[i] });
          setPicks((p) => { const n = { ...p }; delete n[i]; return n; });
        } catch (e) {
          throw new Error(`Installation certificate ${sid} saved, but the photo "${PHOTO_LABELS[i]}" (${file.name}) could not be uploaded: ${e instanceof Error ? e.message : 'unknown error'} Press Save again to retry the remaining photos.`);
        }
      }
      return true;
    }, 'Installation certificate saved and sent to Finance.');
    if (r !== undefined) router.push('/ic/'); // list reloads on mount: no stale rows (log #23)
  };

  const pickPhoto = (i: number, input: HTMLInputElement) => {
    const f = input.files?.[0];
    if (!f) { setPicks((p) => { const n = { ...p }; delete n[i]; return n; }); return; }
    const bad = validateFile(f, { extensions: PHOTO_EXTENSIONS, maxMb: 10 });
    if (bad) { toast(bad, 'error'); input.value = ''; return; }
    setPicks((p) => ({ ...p, [i]: f }));
  };
  const viewPhoto = (i: number) => {
    const f = picks[i];
    if (f) {
      const url = URL.createObjectURL(f);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const d = docs.find((x) => x.Category === 'PHOTO' + (i + 1));
    if (d) openDocument(d).catch((e) => toast(e instanceof Error ? e.message : 'The photo could not be opened.', 'error'));
  };

  const doApprove = async () => {
    setConfirm(false);
    const r = await run(async () => {
      const res = await fn('CapitalizeAsset', { IcId: id, Amount: total });
      if (!isOk(res)) throw new Error(res.Message || 'Capitalization failed.');
      return res;
    }, 'Capitalized.');
    if (r) { setInfo(r.Message || 'Capitalization confirmed by SAP.'); await load(); }
  };
  const onApprove = () => {
    setTouched(true);
    if (check.errors.length) { setProblems(check.errors); return; }
    setProblems([]); setConfirm(true);
  };

  const ro = !perms.editable;
  const money = (k: 'equipCost' | 'freightCost' | 'installCost', label: string, req?: boolean) => (
    <Field label={`${label}${req ? ' *' : ''}`} error={err(k)}>
      <Input inputMode="decimal" value={draft[k]} disabled={ro} onChange={(e) => set({ [k]: e.target.value.replace(/[^\d.]/g, '') } as Partial<IcDraft>)} placeholder="0" />
    </Field>
  );

  return (
    <>
      <PageHeader title={isNew ? 'New Installation Certificate' : cert!.Icid} subtitle={draft.title} back={{ href: '/ic/', label: 'Installation Certificates' }}
        actions={<>
          {perms.editable && <Button variant="primary" disabled={busy} onClick={onSave}>{busy ? 'Saving...' : 'Save'}</Button>}
          {perms.canApprove && <Button variant="success" disabled={busy} onClick={onApprove}>Approve &amp; Capitalize</Button>}
          <Button onClick={() => window.print()}>Print</Button>
        </>} />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
        <Chip tone={statusTone(status)}>{statusLabel(status)}</Chip>
        <span className="text-sap-muted">{meta.plantName} &middot; CPE {draft.cpeid} &middot; PO {draft.ebeln || '-'}</span>
        <span className="ml-auto text-sap-muted">Total Capital Cost</span><b className="font-display text-lg">{fmtInr(total)}</b>
        {cert?.Anln1 && <span className="text-sap-muted">Asset {cert.Anln1}</span>}
      </div>
      {info && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800">{info}{cert?.Anln1 ? ` Asset number: ${cert.Anln1}.` : ''} <Link href="/capitalization/" className="font-bold underline">Open Capitalization</Link></div>}
      {problems.length > 0 && <div className="mb-3"><ErrorBox message={(perms.canApprove ? 'Cannot approve. ' : 'Cannot save. ') + problems.join(' ')} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Commissioning">
          <div className="grid gap-3">
            <Field label="Commissioning Date *" error={err('commissionDt')}>
              <Input type="date" value={draft.commissionDt} disabled={ro} onChange={(e) => set({ commissionDt: e.target.value })} />
            </Field>
            <Field label="Technical Sign-off *" error={err('techSignoff')} hint={`Name of the certifying engineer (max ${TECH_SIGNOFF_MAX} characters, as SAP stores it).`}>
              <Input value={draft.techSignoff} maxLength={TECH_SIGNOFF_MAX} disabled={ro} onChange={(e) => set({ techSignoff: e.target.value })} placeholder="Name of the certifying engineer" />
            </Field>
            <Field label="Remarks">
              <TextArea rows={3} maxLength={800} value={draft.remarks} disabled={ro} onChange={(e) => set({ remarks: e.target.value })} placeholder="Trial run results, output verified, handover confirmation." />
            </Field>
          </div>
        </Card>

        <Card title="Capitalization Cost Breakdown">
          <div className="grid gap-3">
            {money('equipCost', 'Equipment Cost (INR)', true)}
            {money('freightCost', 'Freight Cost (INR)')}
            {money('installCost', 'Installation & Commissioning (INR)')}
            <div className="flex items-center justify-between rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50 px-4 py-3">
              <div><div className="text-[11px] font-bold uppercase text-sap-muted">Total Capital Cost</div><div className="text-[11px] text-sap-muted">Booked to fixed asset on approval</div></div>
              <div className="font-display text-xl font-extrabold">{fmtInrFull(total)}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="Photographs (3 mandatory)"
        actions={<Chip tone={photoCount >= 3 ? 'success' : 'warning'}>{photoCount} of 3 attached</Chip>}>
        <p className="mb-3 text-[11px] text-sap-muted">{PHOTO_RULE_NOTE}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PHOTO_LABELS.map((label, i) => {
            const has = slots[i].uploaded || !!picks[i];
            return (
              <div key={label} className={`flex min-h-[6.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center ${has ? 'border-emerald-300 bg-emerald-50' : 'border-sap-line bg-[#F8F9FD]'}`}>
                <div className="text-lg">{has ? '✓' : '□'}</div>
                <div className="text-[12px] font-bold">{label} <span className="text-red-600">*</span></div>
                {has && <div className="break-all text-[11px] text-sap-muted">{picks[i] ? `${picks[i].name} (to upload on Save)` : slots[i].name}</div>}
                {has && <button type="button" className="text-[11px] font-bold text-plum hover:underline" onClick={() => viewPhoto(i)}>View</button>}
                {perms.editable && (
                  <input type="file" accept={PHOTO_EXTENSIONS.map((e) => '.' + e).join(',')} aria-label={`${label} photo`} onChange={(e) => pickPhoto(i, e.target)}
                    className="mt-1 block w-full text-[11px] file:mr-2 file:rounded-md file:border file:border-sap-line file:bg-white file:px-2 file:py-1" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {cert && isCapitalized(cert.Status) && (
        <Card className="mt-4" title="Fixed Asset">
          <dl className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
            <KV k="Asset Number">{orDash(cert.Anln1)}{cert.Anln2 ? ` / ${cert.Anln2}` : ''}</KV>
            <KV k="Capitalized On">{fmtDate(cert.CapitalizedOn)}</KV>
          </dl>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800">Fixed asset created in SAP. GL posting generated and depreciation started from the commissioning date.</div>
        </Card>
      )}

      <Modal open={confirm} title="Approve & Capitalize" onClose={() => setConfirm(false)}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="success" disabled={busy} onClick={doApprove}>Approve &amp; Capitalize</Button></>}>
        <p className="text-[12px]">Approve and capitalize <b>{cert?.Icid}</b>?</p>
        <p className="mt-2 text-[12px]">Capital cost: {fmtInrFull(total)}<br />Commissioning date: {fmtDate(draft.commissionDt)}</p>
        <p className="mt-2 text-[12px] text-sap-muted">SAP will create the fixed asset, generate the GL posting and start depreciation.</p>
      </Modal>
    </>
  );
}
