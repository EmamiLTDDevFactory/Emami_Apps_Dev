import React, { useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { apiMasterData, getCurrentUserEmail } from '../shared/api.js';
import { activeValues } from '../shared/masterData.js';
import { Button, DirectoryPicker, Field, Modal } from './ui.jsx';
import { FilePicker, uploadAll } from './Attachments.jsx';
import { CATEGORY_HELP, CATEGORY_META, PRIORITY_META, dateOnly } from './model.js';
import ItLandscape from './ItLandscape.jsx';
import { AlertIcon, BoltIcon, InfoIcon, PaperclipIcon, SendIcon } from '../shared/icons.jsx';

const EMPTY = {
  title: '', requestingFunction: '', requestedBy: '', brdReference: '', description: '', justification: '',
  sapSystem: '', sapModules: [], category: '', financialImpact: '', priority: 'medium', requiredBy: '',
  isEmergency: false, emergencyReason: '', moduleLeadEmail: '', moduleLeadName: '', requestedByEmail: '',
};

/** Log (or edit) a change request. `request` set = edit mode; `attachments` = what it already has. */
export default function RequestForm({ request, attachments = [], onClose, onSaved }) {
  const editing = !!request;
  const [form, setForm] = useState(() => (editing ? {
    ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, request[k] ?? EMPTY[k]])),
    requiredBy: dateOnly(request.requiredBy), moduleLeadEmail: request.moduleLeadEmail || '',
    moduleLeadName: request.moduleLeadName || request.moduleLeadEmail || '', requestedByEmail: request.requestedByEmail || '',
  } : EMPTY));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  // Saved, but some documents did not upload: say which, then let the user carry on to the request.
  const [partial, setPartial] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const cat = CATEGORY_META[form.category];
  // Requesting functions are maintained by admins in Master Data (category 'requestingFunction').
  // IT SPOCs (and the person logging) are never the function's requester or the Module Lead, unless they are a Module Lead.
  const [notPickable, setNotPickable] = useState({ spocs: new Set(), leads: new Set(), me: (getCurrentUserEmail() || '').toLowerCase() });
  useEffect(() => {
    Promise.all([ccbApi.people('IT SPOC'), ccbApi.people('Module Lead')])
      .then(([s, l]) => setNotPickable((n) => ({ ...n, spocs: new Set(s.people.map((p) => p.email)), leads: new Set(l.people.map((p) => p.email)) })))
      .catch(() => {});
  }, []);
  // Raised by and Module Lead pick from the same people: IT SPOCs and the person filling in the form are
  // left out — unless they are also a Module Lead.
  const pickExclude = (p) => (notPickable.spocs.has(p.email) || p.email === notPickable.me) && !notPickable.leads.has(p.email);
  // Is the person filling in the form a Module Lead? Then they are this request's Module Lead.
  const isLead = notPickable.leads.has(notPickable.me) && (!editing || request.moduleLeadEmail === notPickable.me || !request.moduleLeadEmail);
  const [functions, setFunctions] = useState(null);
  const [areas, setAreas] = useState(null); // Dev Tracker's Area master data, grouped SAP / Non-SAP
  useEffect(() => {
    apiMasterData(getCurrentUserEmail())
      .then((rows) => { setFunctions(activeValues(rows, 'requestingFunction')); setAreas((rows || []).filter((r) => r.category === 'area' && r.active)); })
      .catch(() => { setFunctions([]); setAreas([]); });
  }, []);
  // An edited request keeps its function even if an admin has since retired that value.
  const functionOptions = functions && form.requestingFunction && !functions.includes(form.requestingFunction) ? [form.requestingFunction, ...functions] : functions || [];

  async function save(intent) {
    setError('');
    // Older requests keep a typed name until someone changes it.
    if (form.requestedBy && !form.requestedByEmail && form.requestedBy !== request?.requestedBy) return setError('Pick the person who raised the requirement from the list of Emami Apps users.');
    if (!isLead && form.moduleLeadName && !form.moduleLeadEmail && form.moduleLeadName !== (request?.moduleLeadName || request?.moduleLeadEmail)) return setError('Pick the Module Lead from the list of Emami Apps users, or clear the field.');
    setBusy(intent);
    try {
      const payload = {
        ...form, requiredBy: form.requiredBy || null,
        // A Module Lead logging a request is its Module Lead (the server sets the same).
        moduleLeadEmail: isLead && !editing ? notPickable.me : form.moduleLeadEmail || null, moduleLeadName: isLead && !editing ? null : form.moduleLeadEmail ? form.moduleLeadName : null, requestedByEmail: form.requestedByEmail || null,
      };
      const d = editing ? await ccbApi.updateRequest(request.id, payload) : await ccbApi.createRequest(payload, intent);
      if (files.length) {
        setBusy('upload');
        const failed = await uploadAll(d.request.id, files);
        if (failed.length) { setBusy(''); setPartial({ request: d.request, intent, failed }); return; }
      }
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
      footer={partial ? (
        <Button variant="primary" onClick={() => onSaved(partial.request, partial.intent)}>Continue to {partial.request.crNo}</Button>
      ) : (
        <>
          <Button onClick={onClose}>Cancel</Button>
          {busy === 'upload' ? (
            <Button variant="primary" busy>Uploading documents…</Button>
          ) : editing ? (
            <Button variant="primary" busy={busy === 'save'} onClick={() => save('save')}>Save changes</Button>
          ) : (
            <>
              <Button busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Save as draft</Button>
              <Button variant="primary" icon={SendIcon} busy={busy === 'submit'} disabled={!!busy} onClick={() => save('submit')}>{isLead ? 'Submit for feasibility review' : 'Submit to Module Lead'}</Button>
            </>
          )}
        </>
      )}
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
          <Field label="Raised by (function)" required group hint="Search active Emami Apps users and pick the person who raised the requirement.">
            <DirectoryPicker
              value={{ name: form.requestedBy, email: form.requestedByEmail }}
              exclude={pickExclude}
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
        <ItLandscape
          system={form.sapSystem}
          modules={form.sapModules}
          areas={areas}
          onChange={(sapSystem, sapModules) => setForm((f) => ({ ...f, sapSystem, sapModules }))}
        />
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
          {isLead ? (
            <div className="ccb-callout tone-blue" style={{ gridColumn: '1 / -1' }}>
              <InfoIcon size={15} />
              {editing && request.loggedBy !== notPickable.me
                ? <span>You are the <strong>Module Lead</strong> for this request.</span>
                : <span>You are the <strong>Module Lead</strong> for this request, so on submission it goes straight to the <strong>IT Application Head</strong> for the feasibility review.</span>}
            </div>
          ) : (
          <Field label="Module Lead" required wide group hint="The IT SPOC’s upline — search active Emami Apps users. Reviews the request before it goes to the IT Application Head, assigns the developer once it is approved, and gets its updates.">
            <DirectoryPicker
              value={{ name: form.moduleLeadName, email: form.moduleLeadEmail }}
              exclude={pickExclude}
              onChange={(p) => setForm((f) => ({ ...f, moduleLeadName: p.name, moduleLeadEmail: p.email }))}
            />
          </Field>
          )}
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
      <div className="ccb-form-section">
        <h4><span className="ccb-step-badge"><PaperclipIcon size={12} /></span>Attachments</h4>
        <p>The BRD, approvals, screenshots or anything else that supports the request. More can be added on the request page at any stage.</p>
        <FilePicker files={files} onChange={setFiles} existing={attachments} />
      </div>
      {partial && (
        <div className="ccb-error">
          <AlertIcon size={13} /> {partial.request.crNo} was saved, but {partial.failed.length === 1 ? 'one document' : `${partial.failed.length} documents`} did not upload: {partial.failed.join(' ')} You can attach {partial.failed.length === 1 ? 'it' : 'them'} from the request page.
        </div>
      )}
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
