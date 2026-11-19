'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { FieldKey, MaterialData } from '@/lib/types';
import { DESCRIPTION_MAX, KEY_FIELDS, KEY_FIELD_BY_KEY, LONG_TEXT_MAX, KeyFieldDef } from '@/lib/keyFields';
import { VIEWS } from '@/lib/materialViews';
import { ALL_SAP_VIEWS, SAP_VIEWS_OF, buildBindings, fromBackend, knownFields, toPatch } from '@/lib/mmMap';
import {
  DuplicateHit, buildDescription, checkDuplicates, saveRequest, startRequest, submitRequest,
} from '@/lib/mmApi';
import { useValueHelp } from '@/lib/mmValueHelp';
import { hierarchyText } from '@/lib/valueHelps';
import { vhText } from '@/lib/mmValueHelp';
import { LongTextField, ProductHierarchyField, ValueHelpField } from '../ValueHelp';
import KeyField from './KeyField';
import { ErrorState } from '../ui';
import {
  IconAlert, IconArrowRight, IconBuilding, IconChart, IconCheck, IconDoc, IconSearch, IconSparkle, IconTag, IconTruck,
} from '../icons';

const emptyData = (): MaterialData => {
  const d = { materialNumber: '' } as MaterialData;
  for (const f of KEY_FIELDS) d[f.key] = '';
  return d;
};

/** Fields the description builder asks for (main / sub / sub-sub group of the old description tool) */
const GROUPS = [
  { key: 'mainGroup', label: 'Main group', tech: 'MGRP', name: 'MGRP' },
  { key: 'subGroup', label: 'Sub group', tech: 'SGRP', name: 'SGRP' },
  { key: 'subSubGroup', label: 'Sub-sub group', tech: 'SSGR', name: 'SSGR' },
] as const;
type GroupKey = (typeof GROUPS)[number]['key'];

export default function NewRequest() {
  const router = useRouter();
  const { sessionState, sessionError, retrySession, notify, refreshInbox } = useMdm();

  const [data, setData] = useState<MaterialData>(emptyData);
  const [groups, setGroups] = useState<Record<GroupKey, string>>({ mainGroup: '', subGroup: '', subSubGroup: '' });
  const [mfrPart, setMfrPart] = useState('');
  const [selectedViews, setSelectedViews] = useState<Set<string>>(() => new Set(VIEWS.map((v) => v.id)));
  const [dups, setDups] = useState<DuplicateHit[] | null>(null);
  const [dupAck, setDupAck] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState<'' | 'dup' | 'desc' | 'draft' | 'submit'>('');
  const [tried, setTried] = useState(false);

  // Any change to the description or type invalidates the last duplicate check
  useEffect(() => { setDups(null); setDupAck(false); }, [data.description, data.materialType]);

  function set(k: FieldKey, v: string) {
    setData((d) => {
      const next: MaterialData = { ...d, [k]: v };
      // A dependent list is no longer valid when its parent changes
      if (k === 'plant') { next.storageLocation = ''; next.warehouseNo = ''; next.storageType = ''; }
      if (k === 'salesOrg') next.distChannel = '';
      if (k === 'warehouseNo') next.storageType = '';
      return next;
    });
    setErrors((e) => { const { [k]: _gone, ...rest } = e; return rest; });
  }

  const required = KEY_FIELDS.filter((f) => f.required);
  const missing = (k: FieldKey) => !data[k]?.trim();
  const complete = required.every((f) => !missing(f.key));
  const fieldMsg = (k: FieldKey) => errors[k] ?? (tried && KEY_FIELD_BY_KEY[k]?.required && missing(k) ? `${KEY_FIELD_BY_KEY[k]!.label} is required` : undefined);

  async function runDuplicates(): Promise<DuplicateHit[] | null> {
    setBusy('dup');
    try {
      const hits = await checkDuplicates(data.description.trim(), data.materialType);
      setDups(hits);
      return hits;
    } catch (e) {
      setGeneral(e instanceof Error ? e.message : 'The duplicate check failed.');
      return null;
    } finally { setBusy(''); }
  }

  async function build() {
    setBusy('desc');
    setGeneral('');
    try {
      const r = await buildDescription({ ...groups, description: data.description.trim(), manufacturerPart: mfrPart.trim() });
      set('description', r.text);
      if (r.truncated) notify('warning', `The description was shortened to ${DESCRIPTION_MAX} characters`);
    } catch (e) {
      setGeneral(e instanceof Error ? e.message : 'The description could not be built.');
    } finally { setBusy(''); }
  }

  async function start(submitNow: boolean) {
    setTried(true);
    setGeneral('');
    if (!complete) {
      setGeneral('Complete the required key data first.');
      return;
    }
    const hits = dups ?? (await runDuplicates());
    if (hits === null) return;
    if (hits.length && !dupAck) { setGeneral('Possible duplicates found. Review them and confirm before continuing.'); return; }

    setBusy(submitNow ? 'submit' : 'draft');
    let transId = '';
    try {
      const views = ALL_SAP_VIEWS.filter((sv) => VIEWS.some((v) => selectedViews.has(v.id) && SAP_VIEWS_OF[v.id].includes(sv)));
      const started = await startRequest({
        materialType: data.materialType, industrySector: data.industrySector, description: data.description.trim(),
        mainGroup: groups.mainGroup, subGroup: groups.subGroup, subSubGroup: groups.subSubGroup, manufacturerPart: mfrPart.trim(),
        plant: data.plant, storageLocation: data.storageLocation, salesOrg: data.salesOrg, distributionChannel: data.distChannel, views, draft: true,
      });
      transId = started.header.transId;
      // The start call carries the org data and the description; the rest of the key data is written to the new request
      const b = buildBindings(knownFields(started.data));
      const flat = fromBackend(started.data, b, started.header.objValue);
      for (const k of ['materialGroup', 'division', 'businessVertical', 'scheme', 'prodHierarchy', 'longText'] as const) if (data[k]) flat[k] = data[k];
      const patch = toPatch(flat, started.data, b);
      const hasWork = Object.keys(patch.single).length > 0 || Object.keys(patch.multi).length > 0;
      if (submitNow) {
        await submitRequest(transId, patch);
        notify('success', `Request ${transId} submitted for approval`);
      } else {
        if (hasWork) await saveRequest(transId, patch);
        notify('success', `Draft ${transId} saved`);
      }
      void refreshInbox();
      router.push(`/master/material/requests/view?id=${encodeURIComponent(transId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The request could not be saved.';
      if (transId) {
        // The request exists as a draft: continue on its page where SAP's messages are mapped to fields
        notify('error', `Request ${transId} was created as a draft, but: ${msg}`);
        router.push(`/master/material/requests/view?id=${encodeURIComponent(transId)}`);
      } else setGeneral(msg);
    } finally { setBusy(''); }
  }

  const kf = (key: FieldKey) => {
    const def = KEY_FIELD_BY_KEY[key] as KeyFieldDef;
    return <KeyField def={def} data={data} onChange={(v) => set(key, v)} error={fieldMsg(key)} />;
  };

  const descLen = data.description.length;
  const fieldOk = (k: FieldKey) => !missing(k);
  const doneCount = required.filter((f) => fieldOk(f.key)).length;
  const pct = Math.round((doneCount / required.length) * 100);
  const hierarchy = data.prodHierarchy ? hierarchyText(data.prodHierarchy).split(' › ') : [];
  const typeText = data.materialType ? vhText('MTART', {}, data.materialType) : '';
  const sectionProgress = (section: 'key' | 'org') => {
    const req = required.filter((f) => f.section === section);
    return { done: req.filter((f) => fieldOk(f.key)).length, total: req.length };
  };
  const keyP = sectionProgress('key');
  const orgP = sectionProgress('org');
  const steps = [
    { n: 1, label: 'Request type', done: true },
    { n: 2, label: 'Key data', done: keyP.done === keyP.total, p: keyP },
    { n: 3, label: 'Organizational data', done: orgP.done === orgP.total, p: orgP },
  ];
  const current = steps.find((s) => !s.done)?.n ?? 4;
  const goTo = (n: number) => document.getElementById(`sec-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (sessionState === 'error') {
    return <section className="card"><ErrorState title="Material master is not available" message={sessionError} onRetry={retrySession} /></section>;
  }

  return (
    <>
      <section className="home-banner nr-banner">
        <div className="home-banner-text">
          <p className="eyebrow"><IconSparkle size={13} /> MC · Create material</p>
          <h2>New material request</h2>
          <p>Fill in the key and organizational data and submit. SAP routes the request through its approval workflow; the material views are maintained by the levels it assigns.</p>
        </div>
        <ol className="nr-steps" aria-label="Steps">
          {steps.map((s) => (
            <li key={s.n} className={s.done ? 'done' : s.n === current ? 'current' : ''}>
              <button type="button" onClick={() => goTo(s.n)}>
                <span className="nr-step-dot" aria-hidden>{s.done ? <IconCheck size={13} /> : s.n}</span>
                <span className="nr-step-text">
                  <strong>{s.label}</strong>
                  <small>{s.done ? 'Complete' : s.p ? `${s.p.done} of ${s.p.total} required` : 'To do'}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="nr-layout">
        <div className="new-request">
          <section className="card nr-card" id="sec-1">
            <SectionHead n={1} title="Request type" text="This screen creates a new material. To change or extend a posted material, pick it in Material master data." done />
            <div className="ref-box">
              <span className="muted small">Change (MX) and extension (ME) start from a posted material: </span>
              <Link href="/master/material/data" className="btn btn-sm">Open posted materials <IconArrowRight size={14} /></Link>
            </div>
          </section>

          <section className="card nr-card" id="sec-2">
            <SectionHead n={2} title="Material creation: key data" text="Type a code, or press F4 / the search button to pick from the list. Every list is read from SAP." progress={keyP} />
            <FieldGroup icon={<IconTag size={14} />} title="Classification">
              <div className="grid-form key-grid">
                {kf('materialType')}
                {kf('industrySector')}
                {kf('materialGroup')}
                {kf('division')}
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconChart size={14} />} title="Commercial">
              <div className="grid-form key-grid">
                {kf('businessVertical')}
                {kf('scheme')}
                <ProductHierarchyField id="k-prodHierarchy" value={data.prodHierarchy} onChange={(v) => set('prodHierarchy', v)} error={fieldMsg('prodHierarchy')} />
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconDoc size={14} />} title="Description" last>
              <details className="desc-builder">
                <summary>Build the description from the group hierarchy</summary>
                <div className="grid-form key-grid">
                  <GroupPick def={GROUPS[0]} value={groups.mainGroup} params={{}} enabled onChange={(v) => setGroups({ mainGroup: v, subGroup: '', subSubGroup: '' })} />
                  <GroupPick def={GROUPS[1]} value={groups.subGroup} params={{ mainGroup: groups.mainGroup }} enabled={!!groups.mainGroup} onChange={(v) => setGroups((g) => ({ ...g, subGroup: v, subSubGroup: '' }))} />
                  <GroupPick def={GROUPS[2]} value={groups.subSubGroup} params={{ mainGroup: groups.mainGroup, subGroup: groups.subGroup }} enabled={!!groups.subGroup} onChange={(v) => setGroups((g) => ({ ...g, subSubGroup: v }))} />
                  <label className="field">
                    <span className="field-label">Manufacturer part</span>
                    <input id="k-mfrPart" value={mfrPart} onChange={(e) => setMfrPart(e.target.value)} maxLength={40} />
                  </label>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => void build()} disabled={busy === 'desc'}>{busy === 'desc' ? 'Building…' : 'Build description'}</button>
              </details>
              <div className="grid-form key-grid">
                <div className={`field field-wide ${fieldMsg('description') ? 'field-error' : ''}`}>
                  <label htmlFor="k-description" className="field-label">
                    Material description<span className="req">*</span><span className="tech">MAKTX</span>
                  </label>
                  <div className="desc-input">
                    <input
                      id="k-description"
                      value={data.description}
                      maxLength={DESCRIPTION_MAX}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="e.g. GLOWRA COLD CREAM 100ML"
                      aria-invalid={!!fieldMsg('description')}
                    />
                    <span className={`desc-count ${descLen >= DESCRIPTION_MAX ? 'desc-full' : ''}`}>{descLen}/{DESCRIPTION_MAX}</span>
                  </div>
                  <span className="desc-meter" aria-hidden><span style={{ width: `${(descLen / DESCRIPTION_MAX) * 100}%` }} /></span>
                  {fieldMsg('description') && <small className="err">{fieldMsg('description')}</small>}
                </div>
                <LongTextField value={data.longText} onChange={(v) => set('longText', v)} max={LONG_TEXT_MAX} error={fieldMsg('longText')} />
              </div>
              <div className="dup-row">
                <button type="button" className="btn" onClick={() => void runDuplicates()} disabled={!data.description.trim() || busy === 'dup'}><IconSearch size={15} /> {busy === 'dup' ? 'Checking…' : 'Check duplicates'}</button>
                {dups && dups.length === 0 && <span className="pill pill-ok"><IconCheck size={13} /> No duplicates found</span>}
                {!dups && data.description.trim() && <span className="muted small">Runs automatically when you proceed.</span>}
              </div>
              {dups && dups.length > 0 && (
                <div className="alert alert-warn dup-alert">
                  <p><IconAlert size={15} /> <strong>{dups.length} possible duplicate{dups.length > 1 ? 's' : ''}</strong> found by SAP</p>
                  <ul className="dup-cards">
                    {dups.map((d) => (
                      <li key={d.matnr}>
                        <span className="dup-score" style={{ ['--s' as string]: d.score }}>{d.score}%</span>
                        <span className="dup-text">
                          <strong>{d.description}</strong>
                          <small className="muted"><span className="matno">{d.matnr.replace(/^0+/, '')}</span>{d.materialType && ` · ${d.materialType}`}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <label className="check">
                    <input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} />
                    I have checked these and this is a different material
                  </label>
                </div>
              )}
            </FieldGroup>
          </section>

          <section className="card nr-card" id="sec-3">
            <SectionHead n={3} title="Organizational data" text="Storage location and warehouse follow the plant; the channel follows the sales org." progress={orgP} />
            <FieldGroup icon={<IconBuilding size={14} />} title="Plant and storage">
              <div className="grid-form key-grid">
                {kf('plant')}
                {kf('storageLocation')}
                {kf('warehouseNo')}
                {kf('storageType')}
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconTruck size={14} />} title="Sales" last>
              <div className="grid-form key-grid">
                {kf('salesOrg')}
                {kf('distChannel')}
              </div>
            </FieldGroup>
          </section>

          <section className="card nr-card" id="sec-4">
            <SectionHead n={4} title="Views" text="The views this request carries. SAP shows each level only what its field control allows." done />
            <div className="view-pick">
              {VIEWS.map((v) => (
                <label key={v.id} className="check">
                  <input
                    type="checkbox"
                    checked={selectedViews.has(v.id)}
                    disabled={!!v.mandatory}
                    onChange={(e) => setSelectedViews((s) => { const n = new Set(s); if (e.target.checked) n.add(v.id); else n.delete(v.id); return n; })}
                  />
                  {v.label}
                </label>
              ))}
            </div>
          </section>

          {general && (
            <div className="alert alert-error" role="alert"><p>{general}</p></div>
          )}
        </div>

        <aside className="nr-side" aria-label="Request summary">
          <section className="card summary-card">
            <div className="progress">
              <span className={`ring ${complete ? 'ring-done' : ''}`} style={{ ['--p' as string]: pct }} aria-hidden>
                <span>{complete ? <IconCheck size={18} /> : `${pct}%`}</span>
              </span>
              <span>
                <strong>{complete ? 'Ready to submit' : 'Complete the key data'}</strong>
                <small className="muted">{doneCount} of {required.length} required fields done</small>
              </span>
            </div>

            <ul className="checklist">
              {required.map((f) => {
                const ok = fieldOk(f.key);
                return (
                  <li key={f.key} className={ok ? 'done' : ''}>
                    <button type="button" onClick={() => document.getElementById(`k-${f.key}`)?.focus()}>
                      <span className="tick" aria-hidden>{ok && <IconCheck size={11} />}</span>
                      {f.label}
                      <span className="sr-only">{ok ? ' – done' : ' – open'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="preview">
              <span className="preview-label">Preview</span>
              <p className="preview-desc">{data.description.trim() || <span className="muted">Material description</span>}</p>
              <div className="preview-chips">
                {data.materialType && <span className="pill pill-accent">{data.materialType}{typeText && ` · ${typeText}`}</span>}
                {data.materialGroup && <span className="pill">MG {data.materialGroup}</span>}
                {data.division && <span className="pill">Div {data.division}</span>}
                {data.plant && <span className="pill">Plant {data.plant}</span>}
                {data.salesOrg && <span className="pill">{data.salesOrg}{data.distChannel && ` / ${data.distChannel}`}</span>}
              </div>
              {hierarchy.length > 1 && <p className="preview-ph">{hierarchy.join(' › ')}</p>}
            </div>

            <div className="side-actions">
              <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => void start(true)} disabled={!complete || !!busy}>
                {busy === 'submit' ? 'Submitting…' : 'Submit for approval'} <IconArrowRight size={16} />
              </button>
              <div className="side-actions-row">
                <button type="button" className="btn" onClick={() => void start(false)} disabled={!complete || !!busy}>{busy === 'draft' ? 'Saving…' : 'Save as draft'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => router.push('/master/material')}>Cancel</button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function GroupPick({ def, value, params, enabled, onChange }: {
  def: (typeof GROUPS)[number]; value: string; params: Record<string, string>; enabled: boolean; onChange: (v: string) => void;
}) {
  const vh = useValueHelp(def.name, params, enabled);
  return (
    <ValueHelpField
      id={`k-${def.key}`}
      label={def.label}
      tech={def.tech}
      value={value}
      options={vh.options}
      onChange={onChange}
      disabled={!enabled || vh.loading || !!vh.error || vh.options.length === 0}
      disabledHint={!enabled ? 'Choose the level above first' : vh.loading ? 'Loading the list from SAP…' : vh.error || (vh.options.length === 0 ? 'SAP returned no values' : undefined)}
    />
  );
}

function SectionHead({ n, title, text, progress, done }: { n: number; title: string; text?: string; progress?: { done: number; total: number }; done?: boolean }) {
  const complete = done ?? (progress ? progress.done === progress.total : false);
  return (
    <div className="section-head">
      <span className={`section-num ${complete ? 'section-num-done' : ''}`} aria-hidden>{complete ? <IconCheck size={15} /> : n}</span>
      <div className="section-head-text">
        <h3>{title}</h3>
        {text && <p className="muted">{text}</p>}
      </div>
      {progress && (
        <span className={`section-badge ${complete ? 'is-done' : ''}`}>
          {complete ? 'Complete' : `${progress.done} of ${progress.total}`}
          <span className="section-badge-bar"><span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></span>
        </span>
      )}
    </div>
  );
}

function FieldGroup({ icon, title, children, last }: { icon: React.ReactNode; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`fgroup ${last ? 'fgroup-last' : ''}`}>
      <div className="fgroup-head"><span className="fgroup-icon" aria-hidden>{icon}</span>{title}</div>
      {children}
    </div>
  );
}
