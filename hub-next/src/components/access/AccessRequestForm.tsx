'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Search, Paperclip, X, CheckCircle2, AlertCircle, Send, FileText, Copy } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../theme/tokens';
import {
  AUDIT_CAPA_DEPOTS, AUDIT_CAPA_APP_ID, SORTED_APPS, AppIcon, Spinner, EMAIL_RE, auditCapaRoleNeedsDepot, cardStyle,
  chipStyle, errorTextStyle, inputStyle, inputWrapStyle, labelStyle, primaryBtnStyle, roleOptionsFor,
} from '../admin/adminShared';
import {
  ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_TOTAL_BYTES, fileToBase64, submitAccessRequest,
} from '../../lib/accessRequestsApi';
import { formatBytes } from './requestShared';

/** Apps every signed-in person already has (see backend OPEN_TO_ALL_APPS) — nothing to request. */
const NOT_REQUESTABLE = new Set(['auditee-response']);
const REQUESTABLE_APPS = SORTED_APPS.filter((a) => !NOT_REQUESTABLE.has(a.id));

interface Props {
  /** member: opened from inside the hub — the email is the session's and is locked. public: the login page's form. */
  mode: 'member' | 'public';
  initialFirstName?: string;
  initialLastName?: string;
  initialEmail?: string;
  onSubmitted?: (ref: string) => void;
  /** Called when "raise another" is chosen after a success. */
  onReset?: () => void;
}

type Selection = Record<string, { roles: string[]; depot: string }>;

/** The one form behind both entry points: names + email, which apps, which roles in each, why, and the supporting
 * mail/document. Nothing here decides access — it only files the ticket for a Super Admin to approve line by line. */
export default function AccessRequestForm({ mode, initialFirstName = '', initialLastName = '', initialEmail = '', onSubmitted, onReset }: Props) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(initialEmail);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>({});
  const [justification, setJustification] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? REQUESTABLE_APPS.filter((a) => a.name.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)) : REQUESTABLE_APPS;
  }, [query]);
  const selectedAppIds = Object.keys(selection);
  const totalRoles = selectedAppIds.reduce((n, id) => n + selection[id].roles.length, 0);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);

  const toggleApp = (appId: string) => {
    setSelection((cur) => {
      const next = { ...cur };
      if (next[appId]) delete next[appId];
      else next[appId] = { roles: [roleOptionsFor(appId)[0]], depot: '' };
      return next;
    });
  };
  const toggleRole = (appId: string, role: string) => {
    setSelection((cur) => {
      const entry = cur[appId];
      if (!entry) return cur;
      const roles = entry.roles.includes(role) ? entry.roles.filter((r) => r !== role) : [...entry.roles, role];
      if (roles.length === 0) return cur; // an app with no role would just be noise — untick the app instead
      return { ...cur, [appId]: { ...entry, roles } };
    });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError('');
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    if (next.length > MAX_ATTACHMENTS) return setError(`Attach at most ${MAX_ATTACHMENTS} files.`);
    if (next.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_TOTAL_BYTES) return setError('Attachments are too large — keep them under 4 MB in total.');
    setFiles(next);
  };

  const submit = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim()) return setError('Enter your first and last name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (selectedAppIds.length === 0) return setError('Select at least one application.');
    for (const id of selectedAppIds) {
      if (selection[id].roles.some((r) => id === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(r)) && !selection[id].depot) {
        return setError('Choose the depot for your Audit & CAPA role.');
      }
    }
    if (justification.trim().length < 10) return setError('Tell the approver why you need this access (at least a sentence).');
    if (files.length === 0) return setError('Attach the supporting mail or document, for example your manager\'s approval email.');
    setBusy(true);
    try {
      const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, data: await fileToBase64(f) })));
      const items = selectedAppIds.flatMap((appId) =>
        selection[appId].roles.map((role) => ({ appId, role, depot: appId === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(role) ? selection[appId].depot : null }))
      );
      const res = await submitAccessRequest({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), justification: justification.trim(), items, files: attachments });
      if (!res.ok) return setError(res.error);
      setDone(res.ref);
      onSubmitted?.(res.ref);
    } catch {
      setError('Could not read one of the files. Please re-attach it and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="ac-fade" style={{ textAlign: 'center', padding: '28px 8px' }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, margin: '0 auto 14px', backgroundColor: colors.greenTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={30} color={colors.green} />
        </div>
        <p style={{ margin: 0, fontSize: 20, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>Incident raised</p>
        <p style={{ margin: '8px auto 0', maxWidth: 380, fontSize: 13.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '20px' }}>
          A Super Admin will review each application and role. You will get an email at <b style={{ color: colors.ink }}>{email.trim().toLowerCase()}</b> with the outcome{mode === 'public' ? ', and your access is switched on automatically once approved' : ''}.
        </p>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(done).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {}); }}
          style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: radii.lg, border: `1px dashed ${colors.rust}66`, backgroundColor: `${colors.rust}0d`, cursor: 'pointer', fontSize: 16, letterSpacing: 0.6, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.rust }}
          title="Copy incident number"
        >
          {done} <Copy size={14} />
        </button>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{copied ? 'Copied.' : 'Keep this incident number — it is how you track the request.'}</p>
        {onReset && (
          <button type="button" className="ac-btn" onClick={onReset} style={{ marginTop: 18, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust }}>
            Done
          </button>
        )}
      </div>
    );
  }

  const field = (label: string, node: React.ReactNode, flex = 1) => (
    <div style={{ flex, minWidth: 150 }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      {node}
    </div>
  );
  const textInput = (value: string, set: (v: string) => void, opts: { placeholder?: string; locked?: boolean; type?: string; max?: number } = {}) => (
    <div className="ac-input" style={{ ...inputWrapStyle, backgroundColor: opts.locked ? colors.cream : colors.white }}>
      <input style={inputStyle} value={value} onChange={(e) => set(e.target.value)} placeholder={opts.placeholder} disabled={opts.locked || busy} type={opts.type || 'text'} maxLength={opts.max} autoCapitalize="none" />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {field('First name', textInput(firstName, setFirstName, { placeholder: 'First name', max: 60 }))}
        {field('Last name', textInput(lastName, setLastName, { placeholder: 'Last name', max: 60 }))}
      </div>
      {field('Email address', textInput(email, setEmail, { placeholder: 'you@company.com', locked: mode === 'member', type: 'email', max: 160 }))}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ ...labelStyle, flex: 1 }}>Applications and roles you need {totalRoles > 0 && <span style={{ color: colors.rust }}>· {selectedAppIds.length} app{selectedAppIds.length === 1 ? '' : 's'}, {totalRoles} role{totalRoles === 1 ? '' : 's'}</span>}</div>
          <div className="ac-input" style={{ ...inputWrapStyle, height: 34, width: 200, maxWidth: '100%' }}>
            <Search size={14} color={colors.inkSoft} />
            <input style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps" />
          </div>
        </div>
        <div className="ac-scroll" style={{ ...cardStyle, borderRadius: radii.xl, maxHeight: 340, overflowY: 'auto' }}>
          {filteredApps.length === 0 && <p style={{ margin: 16, fontSize: 13, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>No application matches “{query}”.</p>}
          {filteredApps.map((app, idx) => {
            const sel = selection[app.id];
            const roles = roleOptionsFor(app.id);
            return (
              <div key={app.id} style={{ borderTop: idx ? `1px solid ${colors.border}` : 'none', backgroundColor: sel ? `${colors.rust}07` : colors.white }}>
                <button type="button" onClick={() => toggleApp(app.id)} disabled={busy} aria-pressed={!!sel} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${sel ? colors.rust : colors.border}`, backgroundColor: sel ? colors.rust : colors.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {sel && <CheckCircle2 size={13} color={colors.white} />}
                  </span>
                  <AppIcon appId={app.id} size={30} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{app.name}</span>
                    <span style={{ display: 'block', fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>{app.cat}</span>
                  </span>
                </button>
                {sel && (
                  <div className="ac-fade" style={{ padding: '0 14px 12px 74px' }}>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ ...labelStyle, marginRight: 4 }}>Role</span>
                      {roles.map((r) => (
                        <button key={r} type="button" onClick={() => toggleRole(app.id, r)} disabled={busy} style={chipStyle(sel.roles.includes(r))}>{r}</button>
                      ))}
                    </div>
                    {app.id === AUDIT_CAPA_APP_ID && sel.roles.some(auditCapaRoleNeedsDepot) && (
                      <div className="ac-input" style={{ ...inputWrapStyle, marginTop: 8, maxWidth: 260 }}>
                        <select value={sel.depot} onChange={(e) => setSelection((c) => ({ ...c, [app.id]: { ...c[app.id], depot: e.target.value } }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">Choose your depot…</option>
                          {AUDIT_CAPA_DEPOTS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ margin: '6px 2px 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>The approver can approve or reject each application and role separately. A person holds one role per application, so if you tick more than one, the approver picks one.</p>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Why do you need this access?</div>
        <div className="ac-input" style={{ ...inputWrapStyle, height: 'auto', padding: '10px 12px', alignItems: 'flex-start' }}>
          <textarea style={{ ...inputStyle, height: 78, resize: 'vertical', lineHeight: '19px' }} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Your role, the work this is for, and who approved it" maxLength={2000} disabled={busy} />
        </div>
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Supporting mail or document (required)</div>
        <input ref={fileInput} type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        <button type="button" className="ac-btn" onClick={() => fileInput.current?.click()} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 12px', borderRadius: radii.lg, border: `1.5px dashed ${colors.border}`, backgroundColor: colors.cream, cursor: 'pointer', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust }}>
          <Paperclip size={16} /> Attach approval mail, screenshot or document
        </button>
        <p style={{ margin: '6px 2px 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>PDF, PNG, JPG, MSG, EML, DOC, DOCX or TXT — up to {MAX_ATTACHMENTS} files, 4 MB in total. Save the email as .msg or .eml, or print it to PDF.</p>
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {files.map((f) => (
              <div key={`${f.name}-${f.size}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: radii.md, border: `1px solid ${colors.border}`, backgroundColor: colors.white }}>
                <FileText size={16} color={colors.rust} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 11, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{formatBytes(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x !== f))} disabled={busy} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={15} color={colors.inkSoft} /></button>
              </div>
            ))}
            <span style={{ fontSize: 11, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{formatBytes(totalBytes)} of 4 MB</span>
          </div>
        )}
      </div>

      {mode === 'public' && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: radii.lg, backgroundColor: `${colors.uat}0d`, border: `1px solid ${colors.uatBorder}` }}>
          <AlertCircle size={16} color={colors.uat} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '17px' }}>You are not signed in, so the approver sees this request as <b>unverified</b>. Use your own email — the outcome is sent there, and sign-in always needs your Microsoft account or a link sent to that inbox.</p>
        </div>
      )}

      {error && <p style={{ ...errorTextStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} /> {error}</p>}

      <button type="button" className="ac-btn" onClick={submit} disabled={busy} style={{ ...primaryBtnStyle, height: 46, width: '100%', fontSize: 14 }}>
        {busy ? <><Spinner light /> Submitting…</> : <><Send size={15} /> Submit request</>}
      </button>
    </div>
  );
}
