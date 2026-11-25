'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Card, Button, Field, TextArea, ErrorBox, Modal, Spinner, useAction, useToast } from '@/components/ui';
import { fn, get, isOk, odataKey, type FnResult } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { CPE } from '@/lib/entities';
import { inLakhs } from '@/lib/format';
import { isUnitTechnicalRole, resolveDOA, skipUnitTechnical } from '@/lib/rules';
import { Strip, VendorScorecard, useDoaRules } from './Bits';
import { canEvaluate, isUnderEvaluation, nonL1Narrative, nonL1Selected, selectVendor as pickOne, sortedVendors, validateEvaluation, type VendorView } from './logic';

function assertOk(r: FnResult | undefined, fallback: string): FnResult {
  if (r && r.Success !== undefined && !isOk(r)) throw new Error(r.Message || fallback);
  return r ?? {};
}

type Dialog = null | { kind: 'errors'; list: string[] } | { kind: 'return' } | { kind: 'submit' };

export default function Evaluation() {
  const router = useRouter();
  const toast = useToast();
  const id = useSearchParams().get('id') ?? '';
  const session = useSession();
  const { busy, run } = useAction();
  const doa = useDoaRules();

  const [cpe, setCpe] = useState<CPE | null>(null);
  const [vendors, setVendors] = useState<VendorView[]>([]);
  const [compliant, setCompliant] = useState(false);
  const [remark, setRemark] = useState('');
  const [justification, setJustification] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showErrors, setShowErrors] = useState(false);

  const cfg = useMemo(() => ({
    threeQuoteLimit: session.cfgNum('THREE_QUOTE_LIMIT', 1000000), specsMinChars: session.cfgNum('SPECS_MIN_CHARS', 15), nonL1MinChars: session.cfgNum('NONL1_MIN_CHARS', 25),
  }), [session]);

  // Always a fresh read (never trust a cached list): SAP hides an UNDER_EVALUATION CPE from everyone but its Unit Technical
  // approver(s), the initiator and an admin (EDSK9B0EA7, log #135), so "not mine" and "does not exist" both come back as a 404.
  const load = useCallback(async () => {
    setState('loading');
    try {
      const row = await get<CPE>('CPESet' + odataKey(id), { $expand: 'CPEToVendors' });
      if (!row) { toast(`This CPE is not available to you (${id}).`, 'error'); router.replace('/cpe/'); return; }
      setCpe(row);
      setVendors(sortedVendors(row));
      setCompliant(row.TechCompliant === 'X');
      setRemark(row.TechRemark || '');
      setJustification(row.Nonl1Justif || '');
      setState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the CPE.');
      setState('error');
    }
  }, [id, router, toast]);
  useEffect(() => { if (id) void load(); else { setError('No CPE was given.'); setState('error'); } }, [id, load]);

  const mayEvaluate = !!cpe && canEvaluate(cpe.Status, isUnitTechnicalRole(session.role), session.isAdmin);
  // Visible but not under evaluation (or not mine to evaluate) -> the read-only detail, once the profile is in.
  useEffect(() => {
    if (state !== 'ready' || !cpe || session.loading) return;
    if (!mayEvaluate) {
      toast(isUnderEvaluation(cpe.Status)
        ? `CPE ${cpe.Cpeid} is awaiting technical evaluation by its Unit Technical approver.`
        : `CPE ${cpe.Cpeid} is no longer awaiting technical evaluation.`, 'warning');
      router.replace(`/cpe/detail/?id=${encodeURIComponent(cpe.Cpeid)}`);
    }
  }, [state, cpe, session.loading, mayEvaluate, router, toast]);

  const amount = Number(cpe?.Amount) || 0;
  const showNonL1 = nonL1Selected(vendors);
  const narrative = useMemo(() => nonL1Narrative(vendors, 'evaluation'), [vendors]);
  const quotesShort = amount > cfg.threeQuoteLimit && vendors.length < 3;
  const errs = useMemo(
    () => validateEvaluation({ technicalRemark: remark, vendors, amount, nonL1Justification: justification }, cfg),
    [remark, vendors, amount, justification, cfg],
  );
  const selected = vendors.find((v) => v.selected);
  const params = () => ({
    CpeId: id, TechCompliant: compliant ? 'X' : '', TechRemark: remark, VendorSeq: selected?.id ?? '', Justification: justification,
  });
  const next = useMemo(() => {
    const first = cpe ? skipUnitTechnical(resolveDOA(doa.rows, cpe.Capextype, amount, 'CPE').chain)[0] : undefined;
    return first ? first.role : 'the next approver';
  }, [cpe, doa.rows, amount]);

  const save = () => run(async () => {
    assertOk(await fn('SaveEvaluation', params()), 'SAP could not save the evaluation.');
    await load();
  }, 'Evaluation saved.');

  function submit() {
    setShowErrors(true);
    if (errs.length) { setDialog({ kind: 'errors', list: errs }); return; }
    setDialog(compliant ? { kind: 'submit' } : { kind: 'return' });
  }

  const doReturn = () => { setDialog(null); return run(async () => {
    assertOk(await fn('ReturnCPE', { CpeId: id, Comment: remark }), 'SAP could not return the CPE.');
    toast('CPE returned to the initiator.', 'success');
    router.push('/cpe/');
  }); };

  const doSubmit = () => { setDialog(null); return run(async () => {
    assertOk(await fn('SubmitEvaluation', params()), 'SAP could not submit the evaluation.');
    toast('Evaluation submitted. CPE routed for approval.', 'success');
    router.push('/cpe/');
  }); };

  if (state === 'loading') return <><PageHeader title="Evaluation" back={{ href: '/cpe/', label: 'All CPEs' }} /><Spinner /></>;
  if (state === 'error' || !cpe) return <><PageHeader title="Evaluation" back={{ href: '/cpe/', label: 'All CPEs' }} /><ErrorBox message={error} onRetry={load} /></>;
  if (!mayEvaluate) return <><PageHeader title="Evaluation" back={{ href: '/cpe/', label: 'All CPEs' }} /><Spinner label="Opening the CPE" /></>;

  const initiator = cpe.CreatedByName || cpe.CreatedBy;
  return (
    <>
      <PageHeader title={`${cpe.Cpeid} — ${cpe.Title}`} subtitle={`${cpe.PlantName} · ${inLakhs(cpe.Amount)}`} back={{ href: `/cpe/detail/?id=${encodeURIComponent(cpe.Cpeid)}`, label: 'CPE detail' }} />
      <div className="space-y-4">
        <Card title="Technical Evaluation">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-sap-muted">Technical specifications</div>
          <p className="mb-3 whitespace-pre-wrap text-[12.5px]">{cpe.Specs || '-'}</p>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" checked={compliant} onChange={(e) => setCompliant(e.target.checked)} />
            Equipment meets required specifications
          </label>
          <Field className="mt-3" label="Technical remarks *" error={showErrors && remark.trim().length < cfg.specsMinChars ? `Technical remarks are required (at least ${cfg.specsMinChars} characters).` : undefined}>
            <TextArea rows={3} maxLength={1000} placeholder="State which specification points were verified and how." value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
          {!compliant && <Strip tone="warning" className="mt-3">Marking the equipment non-compliant returns the CPE to the initiator with your remarks.</Strip>}
        </Card>

        <Card title="Commercial Evaluation">
          {quotesShort && <Strip tone="warning" className="mb-3">Capex above ₹10 L requires L1, L2 and L3 quotes.</Strip>}
          <VendorScorecard vendors={vendors} select={{ onPick: (vid) => setVendors((vs) => pickOne(vs, vid)) }} />
          {showNonL1 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="text-[12px] font-extrabold text-amber-900">Selected vendor is not L1. A written justification is mandatory.</div>
              <Field className="mt-2" label="Non-L1 selection justification *" error={showErrors && justification.trim().length < cfg.nonL1MinChars ? `A non-L1 selection requires a written justification of at least ${cfg.nonL1MinChars} characters.` : undefined}>
                <TextArea rows={3} maxLength={1000} placeholder="State the reason: quality, delivery, total cost of ownership, or strategic considerations." value={justification} onChange={(e) => setJustification(e.target.value)} />
              </Field>
              {narrative && <p className="mt-1.5 text-[11px] text-sap-muted">{narrative}</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap justify-end gap-2 border-t border-sap-line bg-white/90 px-1 py-3 backdrop-blur">
        <Button onClick={save} disabled={busy}>Save</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>Submit</Button>
        <Link href={`/cpe/detail/?id=${encodeURIComponent(cpe.Cpeid)}`} className="btn btn-secondary">Cancel</Link>
      </div>

      <Modal open={dialog?.kind === 'errors'} title="Cannot submit evaluation" onClose={() => setDialog(null)} footer={<Button variant="primary" onClick={() => setDialog(null)}>OK</Button>}>
        <ul className="list-disc space-y-1.5 pl-5 text-[12.5px]">{dialog?.kind === 'errors' && dialog.list.map((e) => <li key={e}>{e}</li>)}</ul>
      </Modal>
      <Modal open={dialog?.kind === 'return'} title="Return CPE" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>No</Button><Button variant="danger" onClick={doReturn}>Return to initiator</Button></>}>
        <p className="text-[13px]">The equipment is marked NOT compliant. The CPE will be returned to {initiator} with your remarks.</p>
        <p className="mt-2 text-[12.5px] text-sap-muted">Continue?</p>
      </Modal>
      <Modal open={dialog?.kind === 'submit'} title="Submit Evaluation" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>No</Button><Button variant="primary" onClick={doSubmit}>Yes, submit</Button></>}>
        <p className="text-[13px]">Submit the evaluation and route this CPE for approval?</p>
        <p className="mt-2 text-[12.5px] text-sap-muted">It will go to {next} first.</p>
      </Modal>
    </>
  );
}
