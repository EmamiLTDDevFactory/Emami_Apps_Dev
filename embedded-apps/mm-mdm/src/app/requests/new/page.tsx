'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Combobox } from '@/components/Combobox';
import { useValueHelpState } from '@/components/useValueHelp';
import { CASCADE_PARENT_HINT, cascadeParams, type HelpParams } from '@/lib/valuehelp';
import { FORM } from '@/lib/form';
import type { DuplicateHit, Message } from '@/lib/types';

// The tabs the initiator can pick (flags of /INOWITS/M_VWSEL)
const SELECTABLE = ['MARA_BASIC1', 'MARA_BASIC2', 'MARA_PLNT1', 'MARA_PLNT2', 'MARC_GEN', 'MARC_PURC', 'MARC_MRP1', 'MARC_MRP2', 'MARC_MRP3', 'MARC_MRP4', 'MARC_COST1', 'MARC_FT_EXP', 'MARC_FT_IMP',
  'MVKE_SORG1', 'MVKE_SORG2', 'MVKE_SORG1_TAX', 'MVKE_SORG_TAX', 'MBEW_ACC1', 'MBEW_ACC2', 'MBEW_COST2', 'MARM_UOM', 'MEAN_EAN', 'MLGN_WHM1', 'MLGT_WHM2', 'QMAT_QM', 'PROP_FORC', 'PROP_CONS', 'RMCL_CLASS', 'WORK_SCHEDULE'];

export default function NewRequest() {
  const router = useRouter();
  const [mtart, setMtart] = useState('');
  const [mbrsh, setMbrsh] = useState('F');
  const [mg, setMg] = useState(''); const [sg, setSg] = useState(''); const [ssg, setSsg] = useState('');
  const [desc, setDesc] = useState(''); const [mfr, setMfr] = useState('');
  const [plant, setPlant] = useState(''); const [sloc, setSloc] = useState(''); const [vkorg, setVkorg] = useState(''); const [vtweg, setVtweg] = useState('');
  const [views, setViews] = useState<string[]>(['MARA_BASIC1', 'MARA_BASIC2']);
  const [preview, setPreview] = useState({ text: '', truncated: false });
  const [dups, setDups] = useState<DuplicateHit[] | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  // Value help lists (searchable comboboxes, one request per list per session). The description groups cascade: each list is
  // loaded for the material type and the choices above it, and only once those are made.
  const lists = {
    mtart: useValueHelpState('MTART'), mbrsh: useValueHelpState('MBRSH'),
    mgrp: useValueHelpState('MGRP', cascadeParams('MGRP', { mtart })), sgrp: useValueHelpState('SGRP', cascadeParams('SGRP', { mtart, mgrp: mg })), ssgr: useValueHelpState('SSGR', cascadeParams('SSGR', { mtart, mgrp: mg, sgrp: sg })),
    werks: useValueHelpState('WERKS'), lgort: useValueHelpState('LGORT'), vkorg: useValueHelpState('VKORG'), vtweg: useValueHelpState('VTWEG'),
  };
  const [types, sectors, mgs, sgs, ssgs, plants, slocs, orgs, chans] = [lists.mtart, lists.mbrsh, lists.mgrp, lists.sgrp, lists.ssgr, lists.werks, lists.lgort, lists.vkorg, lists.vtweg].map((l) => l.items);
  const text = (list: { key: string; text: string }[], k: string) => list.find((x) => x.key === k)?.text ?? '';

  // Description rule runs in SAP (BuildDescription); the screen only shows the result
  useEffect(() => {
    const t = setTimeout(() => {
      api.buildDescription({ mainGroup: text(mgs, mg), subGroup: text(sgs, sg), subSubGroup: text(ssgs, ssg), description: desc, manufacturerPart: mfr }).then(setPreview).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mg, sg, ssg, desc, mfr, mgs, sgs, ssgs]);

  const viewDefs = useMemo(() => SELECTABLE.map((id) => FORM.views.find((v) => v.id === id)).filter(Boolean) as typeof FORM.views, []);
  const toggle = (id: string) => setViews((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const checkDup = async () => { setDups(null); setDups(await api.duplicates({ description: preview.text || desc, materialType: mtart })); };
  const start = async (draft: boolean) => {
    setBusy(true); setMsgs([]);
    try {
      const r = await api.start({ materialType: mtart, industrySector: mbrsh, description: preview.text || desc, mainGroup: text(mgs, mg), subGroup: text(sgs, sg), subSubGroup: text(ssgs, ssg), manufacturerPart: mfr, plant, storageLocation: sloc, salesOrg: vkorg, distributionChannel: vtweg, views, draft });
      router.push(`/requests/view?id=${r.header.transId}`);
    } catch (e) {
      setMsgs(e instanceof ApiError ? (e.messages.length ? e.messages : [{ code: String(e.status), message: e.message, severity: 'E' }]) : [{ code: '', message: 'Unexpected error', severity: 'E' }]);
    } finally { setBusy(false); }
  };

  const sel = (id: string, label: string, v: string, set: (s: string) => void, state: { items: { key: string; text: string }[]; loading: boolean; error: boolean }, req = false, parentHint = '') => (
    <div className="field"><label className="lbl" htmlFor={id}>{label}{req && <span className="req">*</span>}</label>
      <Combobox id={id} value={v} onChange={set} items={state.items} loading={state.loading} error={state.error} disabled={!!parentHint} disabledHint={parentHint} /></div>
  );
  const hint = (name: string, p: HelpParams | null) => (p === null ? CASCADE_PARENT_HINT[name] : '');

  return (
    <>
      <h1>New material request</h1>
      <p className="muted">Step 1 of 2: key data. After you start the request you fill in the selected tabs and submit it.</p>
      {msgs.length > 0 && <div className="card" role="alert">{msgs.map((m, i) => <div key={i} style={{ color: 'var(--err)' }}>{m.message}</div>)}</div>}
      <div className="grid2">
        <div className="card">
          <h2>Material</h2>
          {sel('mtart', 'Material type', mtart, (v) => { setMtart(v); setMg(''); setSg(''); setSsg(''); }, lists.mtart, true)}
          {sel('mbrsh', 'Industry sector', mbrsh, setMbrsh, lists.mbrsh, true)}
          {sel('mg', 'Main group', mg, (v) => { setMg(v); setSg(''); setSsg(''); }, lists.mgrp, false, hint('MGRP', cascadeParams('MGRP', { mtart })))}
          {sel('sg', 'Sub group', sg, (v) => { setSg(v); setSsg(''); }, lists.sgrp, false, hint('SGRP', cascadeParams('SGRP', { mtart, mgrp: mg })))}
          {sel('ssg', 'Sub sub group', ssg, setSsg, lists.ssgr, false, hint('SSGR', cascadeParams('SSGR', { mtart, mgrp: mg, sgrp: sg })))}
          <div className="field"><label className="lbl" htmlFor="desc">Description<span className="req">*</span></label><input id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="field"><label className="lbl" htmlFor="mfr">Manufacturer part number</label><input id="mfr" value={mfr} onChange={(e) => setMfr(e.target.value)} /></div>
          <div className="field"><label className="lbl">Material description (40 characters)</label><input readOnly value={preview.text} aria-live="polite" />{preview.truncated && <div className="msg w">The text was cut to 40 characters.</div>}</div>
          <button type="button" onClick={checkDup} disabled={!desc}>Check for duplicates</button>
          {dups && (
            <div style={{ marginTop: 10 }}>
              {dups.length === 0 ? <p className="muted">No similar materials found.</p> : (
                <table><thead><tr><th>Material</th><th>Description</th><th>Type</th></tr></thead><tbody>{dups.map((d, i) => <tr key={i}><td>{d.matnr}</td><td>{d.description}</td><td>{d.materialType}</td></tr>)}</tbody></table>
              )}
            </div>
          )}
        </div>
        <div className="card">
          <h2>Organization data</h2>
          {sel('plant', 'Plant', plant, setPlant, lists.werks)}
          {sel('sloc', 'Storage location', sloc, setSloc, lists.lgort)}
          {sel('vkorg', 'Sales organization', vkorg, setVkorg, lists.vkorg)}
          {sel('vtweg', 'Distribution channel', vtweg, setVtweg, lists.vtweg)}
          <h2 style={{ marginTop: 16 }}>Tabs to fill in</h2>
          <div className="row" style={{ marginBottom: 8 }}><button type="button" onClick={() => setViews(SELECTABLE)}>Select all</button><button type="button" onClick={() => setViews([])}>Select none</button></div>
          <div style={{ columns: 2 }}>
            {viewDefs.map((v) => (
              <label key={v.id} style={{ display: 'block' }}><input type="checkbox" checked={views.includes(v.id)} onChange={() => toggle(v.id)} /> {v.title}</label>
            ))}
          </div>
        </div>
      </div>
      <div className="row">
        <button className="primary" disabled={busy || !mtart || !desc || !views.length} onClick={() => start(false)}>Start request</button>
        <button disabled={busy || !mtart || !desc || !views.length} onClick={() => start(true)}>Save as draft</button>
      </div>
    </>
  );
}
