'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMdm } from '@/lib/store';
import { FieldKey, MaterialData, Message } from '@/lib/types';
import { KEY_FIELDS, KEY_FIELD_BY_KEY, defaultsForType } from '@/lib/fieldConfig';
import { HELP_PARENT, HelpId, getValueHelp, helpText, hierarchyText, isValidValue } from '@/lib/valueHelps';
import { emptyMaterial } from '@/lib/mockData';
import { APPS, LEVELS, WORKFLOW_DEFS } from '@/lib/workflowConfig';
import {
  DESCRIPTION_MAX, DuplicateHit, LONG_TEXT_MAX, Result, checkDuplicate, saveDraft, startAndSubmit, startRequest, submit, validateKeyData,
} from '@/lib/service';
import { LongTextField, ProductHierarchyField, ValueHelpField } from '../ValueHelp';
import {
  IconAlert, IconArrowRight, IconBuilding, IconChart, IconCheck, IconCopy, IconDoc, IconLock, IconSearch, IconSparkle, IconTag, IconTruck,
} from '../icons';

/** Key and organizational data taken over from a reference material (description is never copied) */
const COPY_FROM_REFERENCE: FieldKey[] = KEY_FIELDS.map((f) => f.key).filter((k) => k !== 'description' && k !== 'longText');

/** Fields whose list depends on another one, and what to tell the user until the parent is filled */
const PARENT_HINT: Partial<Record<HelpId, string>> = {
  storageLocation: 'Choose a plant first',
  warehouseNo: 'Choose a plant first',
  distChannel: 'Choose a sales org first',
  storageType: 'Choose a warehouse first',
};

export default function NewRequest() {
  const router = useRouter();
  const params = useSearchParams();
  const { db, user, run, notify } = useMdm();

  // ?id=MC...: the initiator corrects a draft or a sent-back request on this same screen
  const editId = params.get('id') ?? '';
  const editing = editId ? db.requests.find((x) => x.transId === editId) : undefined;
  const canEdit = !!editing && editing.initiator === user.id && (editing.status === '00' || editing.status === '02');
  const sentBackNote = editing?.status === '02' ? [...editing.history].reverse().find((h) => h.status === '02')?.comment : undefined;

  const [data, setData] = useState<MaterialData>(emptyMaterial);
  const loadedId = useRef('');
  const [refNo, setRefNo] = useState(params.get('ref') ?? '');
  const [copiedFrom, setCopiedFrom] = useState('');
  const [dups, setDups] = useState<DuplicateHit[] | null>(null);
  const [dupAck, setDupAck] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tried, setTried] = useState(false);

  const ref = refNo.trim() ? db.materials.find((x) => x.materialNumber === refNo.trim()) : undefined;

  // Live check of the key data: Proceed stays disabled until this is clean
  const liveErrors = useMemo(() => validateKeyData({ ...data, description: data.description.trim() }), [data]);
  const complete = liveErrors.length === 0;

  // Any change to the description invalidates the last duplicate check
  useEffect(() => {
    setDups(null);
    setDupAck(false);
  }, [data.description]);

  // Load the request being corrected (once it is available from the store)
  useEffect(() => {
    if (editing && loadedId.current !== editing.transId) {
      loadedId.current = editing.transId;
      setData(editing.data);
    }
  }, [editing]);

  // Copy from reference when opened with ?ref=
  useEffect(() => {
    if (params.get('ref') && ref) copyReference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k: FieldKey, v: string) {
    setData((d) => {
      let next: MaterialData = { ...d, [k]: v };
      if (k === 'materialType' && v !== d.materialType) next = { ...next, ...defaultsForType(v) };
      // Clear dependent fields whose value is no longer allowed (plant > storage location, ...)
      let changed = true;
      while (changed) {
        changed = false;
        for (const [child, parent] of Object.entries(HELP_PARENT) as [HelpId, HelpId][]) {
          const ck = child as FieldKey;
          if (next[ck] && (!next[parent as FieldKey] || !isValidValue(child, next[ck], next))) {
            next = { ...next, [ck]: '' };
            changed = true;
          }
        }
      }
      return next;
    });
    setMessages((ms) => ms.filter((x) => x.field !== k));
  }

  function copyReference() {
    if (!ref) return;
    const { createdBy: _b, createdOn: _c, transId: _t, ...refData } = ref;
    const copy: MaterialData = { ...emptyMaterial(), ...refData, materialNumber: '', description: '', longText: '' };
    COPY_FROM_REFERENCE.forEach((k) => (copy[k] = ref[k]));
    setData(copy);
    setCopiedFrom(`${ref.materialNumber} – ${ref.description}`);
    setMessages([]);
  }

  function runDuplicateCheck(): DuplicateHit[] {
    const hits = checkDuplicate(db, data.description.trim(), editing?.transId);
    setDups(hits);
    return hits;
  }

  /** submitNow: send to level 1; otherwise keep it as a draft */
  function start(submitNow: boolean) {
    setTried(true);
    if (!complete) {
      setMessages(liveErrors);
      notify('error', liveErrors[0]?.text ?? 'Complete the key data first');
      return;
    }
    const hits = dups ?? runDuplicateCheck();
    if (hits.length && !dupAck) {
      setMessages([{ severity: 'E', text: 'Possible duplicates found. Review them and confirm before continuing.' }]);
      return;
    }
    const res: Result = run((d) =>
      canEdit
        ? (submitNow ? submit(d, editing!.transId, data, user, '') : saveDraft(d, editing!.transId, data, user))
        : (submitNow ? startAndSubmit(d, data, user) : startRequest(d, data, user)),
    );
    if (!res.ok) {
      setMessages(res.messages);
      notify('error', res.messages[0]?.text ?? 'Request could not be saved');
      return;
    }
    const id = res.request!.transId;
    notify('success', submitNow ? `Request ${id} ${editing?.status === '02' ? 'resubmitted' : 'submitted'} – sent to level 1 (Sales Team)` : `Draft ${id} saved`);
    router.push(`/master/material/requests/view?id=${encodeURIComponent(id)}`);
  }

  /** Error for a field: from the last action, or (after a first attempt) from the live check */
  const fieldMsg = (k: FieldKey) => messages.find((x) => x.field === k)?.text ?? (tried ? liveErrors.find((x) => x.field === k)?.text : undefined);
  const general = messages.filter((x) => !x.field);

  const vh = (k: FieldKey) => {
    const def = KEY_FIELD_BY_KEY[k]!;
    const help = def.help!;
    const parent = HELP_PARENT[help];
    const options = getValueHelp(help, data);
    const parentMissing = !!parent && !data[parent as FieldKey];
    const noValues = !parentMissing && options.length === 0;
    return (
      <ValueHelpField
        id={`k-${k}`}
        label={def.label}
        tech={def.tech}
        required={def.required}
        value={data[k]}
        options={options}
        onChange={(v) => set(k, v)}
        disabled={parentMissing || noValues}
        disabledHint={parentMissing ? PARENT_HINT[help] : noValues ? 'No values for this selection' : undefined}
        error={fieldMsg(k)}
        blockedReason={k === 'materialType' ? (v) => (WORKFLOW_DEFS[v] ? undefined : 'no workflow yet') : undefined}
      />
    );
  };

  if (editId && !canEdit) {
    return (
      <div className="card gate-card">
        <span className="gate-icon" aria-hidden><IconLock size={24} /></span>
        <div>
          <h2>Request {editId} cannot be changed here</h2>
          <p className="muted">Only the initiator can change the key data, and only while the request is a draft or has been sent back.</p>
        </div>
        <Link href={editing ? `/master/material/requests/view?id=${encodeURIComponent(editId)}` : '/master/material'} className="btn btn-primary">{editing ? 'Open the request' : 'Go to my work'} <IconArrowRight size={15} /></Link>
      </div>
    );
  }

  if (user.level !== null) {
    return (
      <div className="card gate-card">
        <span className="gate-icon" aria-hidden><IconLock size={24} /></span>
        <div>
          <h2>Only initiators start material requests</h2>
          <p className="muted">You are signed in as a level {user.level} agent. Switch to an initiator in the top bar to start a request, or review the work waiting at your level.</p>
        </div>
        <Link href="/master/material" className="btn btn-primary">Go to my work <IconArrowRight size={15} /></Link>
      </div>
    );
  }

  const descLen = data.description.length;
  const required = KEY_FIELDS.filter((f) => f.required);
  const fieldOk = (k: FieldKey) => !!data[k].trim() && !liveErrors.some((e) => e.field === k);
  const doneCount = required.filter((f) => fieldOk(f.key)).length;
  const pct = Math.round((doneCount / required.length) * 100);
  const hierarchy = data.prodHierarchy ? hierarchyText(data.prodHierarchy).split(' › ') : [];
  const typeText = data.materialType ? helpText('materialType', data.materialType) : '';

  // Progress per section (required fields only)
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

  return (
    <>
      <section className="home-banner nr-banner">
        <div className="home-banner-text">
          <p className="eyebrow"><IconSparkle size={13} /> MC · Create material</p>
          <h2>{canEdit ? `${editing!.status === '02' ? 'Correct' : 'Edit'} request ${editing!.transId}` : 'New material request'}</h2>
          <p>Fill in the key and organizational data and submit. The material views are then maintained by the {LEVELS.length} approval levels before the material is posted in SAP.</p>
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
          {sentBackNote && (
            <div className="alert alert-warn" role="status">
              <p><IconAlert size={15} /> <strong>Sent back for correction</strong></p>
              <p>{sentBackNote}</p>
            </div>
          )}
          <section className="card nr-card" id="sec-1">
            <SectionHead n={1} title="Request type" text="Create is available now; change and extension follow in phase 2." done />
            <div className="app-options">
              {APPS.map((a) => (
                <div key={a.id} className={`app-option ${a.enabled ? 'selected' : 'disabled'}`} aria-disabled={!a.enabled}>
                  <span className="app-id">{a.id}</span>
                  <span className="app-text">
                    <strong>{a.label}</strong>
                    <small>{a.phase}</small>
                  </span>
                  {a.enabled && <span className="app-check" aria-hidden><IconCheck size={14} /></span>}
                </div>
              ))}
            </div>
            <div className="ref-box">
              <span className="ref-icon" aria-hidden><IconCopy size={18} /></span>
              <label className="field">
                <span className="field-label">Copy from reference material <span className="optional">optional – takes over key, org and view data</span></span>
                <div className="input-row">
                  <input value={refNo} onChange={(e) => setRefNo(e.target.value.trim())} placeholder="Material number, e.g. 100000101" maxLength={18} list="ref-materials" />
                  <datalist id="ref-materials">
                    {db.materials.map((m) => <option key={m.materialNumber} value={m.materialNumber}>{m.description}</option>)}
                  </datalist>
                  <button type="button" className="btn" onClick={copyReference} disabled={!ref}>Copy</button>
                </div>
                {refNo && !ref && <small className="err">Material {refNo} not found</small>}
                {ref && !copiedFrom && <small className="muted">{ref.description}</small>}
                {copiedFrom && <small className="ok"><IconCheck size={12} /> Copied from {copiedFrom}</small>}
              </label>
            </div>
          </section>

          <section className="card nr-card" id="sec-2">
            <SectionHead n={2} title="Material creation: key data" text="Type a code, or press F4 / the search button to pick from the list." progress={keyP} />
            <FieldGroup icon={<IconTag size={14} />} title="Classification">
              <div className="grid-form key-grid">
                {vh('materialType')}
                {vh('industrySector')}
                {vh('materialGroup')}
                {vh('division')}
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconChart size={14} />} title="Commercial">
              <div className="grid-form key-grid">
                {vh('businessVertical')}
                {vh('scheme')}
                <ProductHierarchyField id="k-prodHierarchy" value={data.prodHierarchy} onChange={(v) => set('prodHierarchy', v)} error={fieldMsg('prodHierarchy')} />
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconDoc size={14} />} title="Description" last>
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
                <button type="button" className="btn" onClick={runDuplicateCheck} disabled={!data.description.trim()}><IconSearch size={15} /> Check duplicates</button>
                {dups && dups.length === 0 && <span className="pill pill-ok"><IconCheck size={13} /> No duplicates found</span>}
                {!dups && data.description.trim() && <span className="muted small">Runs automatically when you proceed.</span>}
              </div>
              {dups && dups.length > 0 && (
                <div className="alert alert-warn dup-alert">
                  <p><IconAlert size={15} /> <strong>{dups.length} possible duplicate{dups.length > 1 ? 's' : ''}</strong> by phonetic match</p>
                  <ul className="dup-cards">
                    {dups.map((d) => (
                      <li key={d.id}>
                        <span className="dup-score" style={{ ['--s' as string]: d.score }}>{d.score}%</span>
                        <span className="dup-text">
                          <strong>{d.description}</strong>
                          <small className="muted"><span className="matno">{d.id}</span> · {d.kind.toLowerCase()} · plant {d.plant}</small>
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
                {vh('plant')}
                {vh('storageLocation')}
                {vh('warehouseNo')}
                {vh('storageType')}
              </div>
            </FieldGroup>
            <FieldGroup icon={<IconTruck size={14} />} title="Sales" last>
              <div className="grid-form key-grid">
                {vh('salesOrg')}
                {vh('distChannel')}
              </div>
            </FieldGroup>
          </section>


          {general.length > 0 && (
            <div className="alert alert-error" role="alert">
              {general.map((g, i) => <p key={i}>{g.text}</p>)}
            </div>
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

            {!complete && doneCount === required.length && liveErrors[0] && <p className="err small">{liveErrors[0].text}</p>}

            <div className="side-actions">
              <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => start(true)} disabled={!complete}>
                {editing?.status === '02' ? 'Resubmit for approval' : 'Submit for approval'} <IconArrowRight size={16} />
              </button>
              <div className="side-actions-row">
                <button type="button" className="btn" onClick={() => start(false)} disabled={!complete}>Save as draft</button>
                <button type="button" className="btn btn-ghost" onClick={() => router.push(canEdit ? `/master/material/requests/view?id=${encodeURIComponent(editing!.transId)}` : '/master/material')}>Cancel</button>
              </div>
            </div>

            <div className="next-flow">
              <span className="preview-label">What happens next</span>
              <ol className="flow-dots" aria-label="Approval path">
                <li className="me" title="You: key data and submit">You</li>
                {LEVELS.map((l) => <li key={l.level} title={`L${l.level} ${l.team}`}>L{l.level}</li>)}
                <li className="end" title="Posted in SAP"><IconCheck size={11} /></li>
              </ol>
              <small className="muted">You only fill in this screen. After you submit, each level maintains or reviews the material views assigned to it, and the MDM team posts the material.</small>
            </div>
          </section>
        </aside>
      </div>
    </>
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
