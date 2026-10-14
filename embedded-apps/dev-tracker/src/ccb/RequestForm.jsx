import React, { useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { Button, Field, Modal } from './ui.jsx';
import { CATEGORY_HELP, CATEGORY_META, PRIORITY_META, SAP_MODULES, SAP_SYSTEMS, dateOnly } from './model.js';
import { AlertIcon, BoltIcon, InfoIcon, SendIcon } from '../shared/icons.jsx';

const EMPTY = {
  title: '', requestingFunction: '', requestedBy: '', brdReference: '', description: '', justification: '',
  sapSystem: 'ECC', sapModules: [], category: '', financialImpact: '', priority: 'medium', requiredBy: '',
  isEmergency: false, emergencyReason: '', moduleLeadEmail: '',
};

/** Log (or edit) a change request. `request` set = edit mode. */
export default function RequestForm({ request, onClose, onSaved }) {
  const editing = !!request;
  const [form, setForm] = useState(() => (editing ? {
    ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, request[k] ?? EMPTY[k]])),
    requiredBy: dateOnly(request.requiredBy), moduleLeadEmail: request.moduleLeadEmail || '',
  } : EMPTY));
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { ccbApi.people().then((d) => setPeople(d.people)).catch(() => {}); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const toggleModule = (m) => setForm((f) => ({ ...f, sapModules: f.sapModules.includes(m) ? f.sapModules.filter((x) => x !== m) : [...f.sapModules, m] }));
  const cat = CATEGORY_META[form.category];
  const functions = useMemo(() => ['Finance', 'Commercial', 'Sales', 'Marketing', 'Supply Chain', 'Manufacturing', 'Quality', 'Procurement', 'HR', 'Audit & Control', 'IT'], []);

  async function save(intent) {
    setError('');
    setBusy(intent);
    try {
      const payload = { ...form, requiredBy: form.requiredBy || null, moduleLeadEmail: form.moduleLeadEmail || null };
      const d = editing ? await ccbApi.updateRequest(request.id, payload) : await ccbApi.createRequest(payload, intent);
      onSaved(d.request, intent);
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  }

  return (
    <Modal
      width={860}
      title={editing ? `Edit ${request.crNo}` : 'Log a change request'}
      sub={editing ? 'Changes are recorded in the request’s audit trail.' : 'Steps 2–3 of the CCB process: log the function’s requirement and categorise it against the CCB scope.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {editing ? (
            <Button variant="primary" busy={busy === 'save'} onClick={() => save('save')}>Save changes</Button>
          ) : (
            <>
              <Button busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Save as draft</Button>
              <Button variant="primary" icon={SendIcon} busy={busy === 'submit'} disabled={!!busy} onClick={() => save('submit')}>Submit for feasibility review</Button>
            </>
          )}
        </>
      }
    >
      <div className="ccb-form-section">
        <h4><span className="ccb-step-badge">1</span>Business requirement</h4>
        <p>What the function needs, as described in its Business Requirement Document.</p>
        <div className="ccb-form-grid">
          <Field label="Title" required wide>
            <input className="ccb-input" value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Credit limit check on depot sales orders" />
          </Field>
          <Field label="Requesting function" required>
            <input className="ccb-input" list="ccb-functions" value={form.requestingFunction} onChange={set('requestingFunction')} placeholder="e.g. Finance" />
            <datalist id="ccb-functions">{functions.map((f) => <option key={f} value={f} />)}</datalist>
          </Field>
          <Field label="Raised by (function)" required hint="Who raised the requirement in the function.">
            <input className="ccb-input" value={form.requestedBy} onChange={set('requestedBy')} placeholder="Name of the requester" />
          </Field>
          <Field label="BRD reference" hint="Document number or link to the Business Requirement Document." wide>
            <input className="ccb-input" value={form.brdReference} onChange={set('brdReference')} placeholder="e.g. BRD-FIN-2026-014 or a SharePoint link" />
          </Field>
          <Field label="Requirement" required wide>
            <textarea className="ccb-textarea" value={form.description} onChange={set('description')} placeholder="Describe the change the function needs and the process it affects." />
          </Field>
          <Field label="Business justification" required wide>
            <textarea className="ccb-textarea" value={form.justification} onChange={set('justification')} placeholder="Why it is needed: benefit, risk addressed, compliance, savings." />
          </Field>
        </div>
      </div>

      <div className="ccb-form-section">
        <h4><span className="ccb-step-badge">2</span>SAP landscape</h4>
        <p>Where the change lands. The IT Application Head assesses the inter-module impact.</p>
        <div className="ccb-form-grid">
          <Field label="SAP system" required group>
            <div className="ccb-chips">
              {SAP_SYSTEMS.map((s) => (
                <button key={s} type="button" className={`ccb-chip-toggle${form.sapSystem === s ? ' on' : ''}`} onClick={() => set('sapSystem')(s)}>{s}</button>
              ))}
            </div>
          </Field>
          <Field label="SAP modules" hint="Select every module the change touches." group>
            <div className="ccb-chips">
              {SAP_MODULES.map((m) => (
                <button key={m} type="button" className={`ccb-chip-toggle${form.sapModules.includes(m) ? ' on' : ''}`} onClick={() => toggleModule(m)}>{m}</button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="ccb-form-section">
        <h4><span className="ccb-step-badge">3</span>CCB categorisation</h4>
        <p>Decides the approval route: in-scope requests go to the CCB; reports and cosmetic changes are approved by the IT Application Head.</p>
        <div className="ccb-cat-grid">
          {Object.entries(CATEGORY_META).map(([key, c]) => (
            <button key={key} type="button" className={`ccb-cat ${c.inScope ? 'in' : 'out'}${form.category === key ? ' on' : ''}`} onClick={() => set('category')(key)}>
              <span className="ccb-cat-tag">{c.inScope ? 'Within CCB scope' : 'Outside CCB scope'}</span>
              <strong>{c.label}</strong>
              <span>{CATEGORY_HELP[key]}</span>
            </button>
          ))}
        </div>
        {cat && (
          <div className={`ccb-callout ${cat.inScope ? 'tone-indigo' : 'tone-teal'}`} style={{ marginTop: 12 }}>
            <InfoIcon size={15} />
            <span>{cat.inScope
              ? <>After the feasibility review this request goes on the <strong>next CCB meeting agenda</strong> for a decision.</>
              : <>Outside CCB scope: the <strong>IT Application Head approves it directly</strong> after the feasibility review.</>}
            </span>
          </div>
        )}
        <div className="ccb-form-grid" style={{ marginTop: 14 }}>
          <Field label="Financial impact" hint="Estimated value or effect on financials, if any." wide>
            <input className="ccb-input" value={form.financialImpact} onChange={set('financialImpact')} placeholder="e.g. Affects GL postings for depot transfers; ~₹2 Cr monthly volume" />
          </Field>
        </div>
      </div>

      <div className="ccb-form-section">
        <h4><span className="ccb-step-badge">4</span>Planning</h4>
        <p>Carried into the Dev Tracker assignment once approved.</p>
        <div className="ccb-form-grid">
          <Field label="Priority" required>
            <select className="ccb-select" value={form.priority} onChange={set('priority')}>
              {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Required by">
            <input className="ccb-input" type="date" value={form.requiredBy} onChange={set('requiredBy')} />
          </Field>
          <Field label="SAP Module Lead" hint="Assigns the developer after approval." wide>
            <select className="ccb-select" value={form.moduleLeadEmail} onChange={set('moduleLeadEmail')}>
              <option value="">Not decided yet</option>
              {people.map((p) => <option key={p.email} value={p.email}>{p.name}{p.name !== p.email ? ` · ${p.email}` : ''}</option>)}
            </select>
          </Field>
        </div>
        <label className="ccb-switch" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={form.isEmergency} onChange={set('isEmergency')} />
          <div>
            <strong><BoltIcon size={13} /> Urgent business need or critical system issue</strong>
            <span>The IT Application Head may approve without prior board approval. It must be justified in writing, informed to the CCB within 5 business days and ratified at the next CCB meeting.</span>
          </div>
        </label>
        {form.isEmergency && (
          <Field label="Justification for urgency" required wide>
            <textarea className="ccb-textarea" value={form.emergencyReason} onChange={set('emergencyReason')} placeholder="What breaks or what is lost if this waits for the next CCB meeting?" />
          </Field>
        )}
      </div>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
