import React, { useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { apiMasterData, getCurrentUserEmail } from '../shared/api.js';
import { activeValues } from '../shared/masterData.js';
import { Button, DirectoryPicker, Field, Modal } from './ui.jsx';
import { AREA_MODULES, CATEGORY_HELP, CATEGORY_META, IT_AREAS, PRIORITY_META, dateOnly } from './model.js';
import { AlertIcon, BoltIcon, InfoIcon, SendIcon } from '../shared/icons.jsx';

const EMPTY = {
  title: '', requestingFunction: '', requestedBy: '', brdReference: '', description: '', justification: '',
  sapSystem: '', sapModules: [], category: '', financialImpact: '', priority: 'medium', requiredBy: '',
  isEmergency: false, emergencyReason: '', moduleLeadEmail: '', moduleLeadName: '', requestedByEmail: '',
};

/** Log (or edit) a change request. `request` set = edit mode. */
export default function RequestForm({ request, onClose, onSaved }) {
  const editing = !!request;
  const [form, setForm] = useState(() => (editing ? {
    ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, request[k] ?? EMPTY[k]])),
    requiredBy: dateOnly(request.requiredBy), moduleLeadEmail: request.moduleLeadEmail || '',
    moduleLeadName: request.moduleLeadName || request.moduleLeadEmail || '', requestedByEmail: request.requestedByEmail || '',
  } : EMPTY));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const toggleModule = (m) => setForm((f) => ({ ...f, sapModules: f.sapModules.includes(m) ? f.sapModules.filter((x) => x !== m) : [...f.sapModules, m] }));
  const cat = CATEGORY_META[form.category];
  // Requesting functions are maintained by admins in Master Data (category 'requestingFunction').
  const [functions, setFunctions] = useState(null);
  useEffect(() => {
    apiMasterData(getCurrentUserEmail())
      .then((rows) => setFunctions(activeValues(rows, 'requestingFunction')))
      .catch(() => setFunctions([]));
  }, []);
  // An edited request keeps its function even if an admin has since retired that value.
  const functionOptions = functions && form.requestingFunction && !functions.includes(form.requestingFunction) ? [form.requestingFunction, ...functions] : functions || [];

  async function save(intent) {
    setError('');
    // Older requests keep a typed name until someone changes it.
    if (form.requestedBy && !form.requestedByEmail && form.requestedBy !== request?.requestedBy) return setError('Pick the person who raised the requirement from the directory list.');
    if (form.moduleLeadName && !form.moduleLeadEmail && form.moduleLeadName !== (request?.moduleLeadName || request?.moduleLeadEmail)) return setError('Pick the Module Lead from the directory list, or clear the field.');
    setBusy(intent);
    try {
      const payload = {
        ...form, requiredBy: form.requiredBy || null,
        moduleLeadEmail: form.moduleLeadEmail || null, moduleLeadName: form.moduleLeadEmail ? form.moduleLeadName : null, requestedByEmail: form.requestedByEmail || null,
      };
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
          <Field label="Requesting function" required hint={functions && !functions.length ? 'No functions set up yet — an admin adds them in Master Data › Requesting Function.' : undefined}>
            <select className="ccb-select" value={form.requestingFunction} onChange={set('requestingFunction')} disabled={functions === null || !functionOptions.length}>
              <option value="">{functions === null ? 'Loading…' : 'Select the function'}</option>
              {functionOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Raised by (function)" required group hint="Search the Emami directory and pick the person who raised the requirement.">
            <DirectoryPicker
              value={{ name: form.requestedBy, email: form.requestedByEmail }}
              onChange={(p) => setForm((f) => ({ ...f, requestedBy: p.name, requestedByEmail: p.email }))}
            />
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
        <h4><span className="ccb-step-badge">2</span>IT landscape</h4>
        <p>Where the change lands. The IT Application Head assesses the impact on other systems and modules.</p>
        <div className="ccb-form-grid">
          <Field label="IT area" required group wide>
            <div className="ccb-chips">
              {IT_AREAS.map((s) => (
                <button key={s} type="button" className={`ccb-chip-toggle${form.sapSystem === s ? ' on' : ''}`} onClick={() => set('sapSystem')(s)}>{s}</button>
              ))}
            </div>
          </Field>
          <Field label="Systems / modules affected" hint="Pick every system or module the change touches, or add your own." group wide>
            <div className="ccb-chips">
              {[...new Set([...(AREA_MODULES[form.sapSystem] || []), ...form.sapModules])].map((m) => (
                <button key={m} type="button" className={`ccb-chip-toggle${form.sapModules.includes(m) ? ' on' : ''}`} onClick={() => toggleModule(m)}>{m}</button>
              ))}
              <input
                className="ccb-input"
                style={{ width: 200, padding: '5px 10px', borderRadius: 999, fontSize: 11.5 }}
                maxLength={30}
                placeholder="+ Add another, press Enter"
                onKeyDown={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (e.key === 'Enter' && v) {
                    e.preventDefault();
                    if (!form.sapModules.includes(v)) toggleModule(v);
                    e.currentTarget.value = '';
                  }
                }}
              />
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
          <Field label="Module Lead" wide group hint="The IT SPOC’s upline — search the Emami directory. Assigns the developer once the request is approved and gets its updates.">
            <DirectoryPicker
              value={{ name: form.moduleLeadName, email: form.moduleLeadEmail }}
              onChange={(p) => setForm((f) => ({ ...f, moduleLeadName: p.name, moduleLeadEmail: p.email }))}
            />
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
