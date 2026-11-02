'use client';

import React, { useMemo, useState } from 'react';
import { Mail, Phone, Search, UserPlus, UserRound, Users, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AppRole, UserAccessEntry, UserAppGrant } from '../../types';
import { addAuthorizedUser, setAppAccess } from '../../lib/accessApi';
import { appColor, colors, fontWeights, fonts, gradients, radii } from '../../theme/tokens';
import { Segmented } from './UserDrawer';
import {
  AUDIT_CAPA_APP_ID, AUDIT_CAPA_DEPOTS, auditCapaRoleNeedsDepot, EMAIL_RE, SORTED_APPS,
  AppIcon, Spinner, chipStyle, chunk, errorTextStyle, ghostIconBtnStyle, inputStyle, inputWrapStyle, labelStyle,
  primaryBtnStyle, roleOptionsFor, secondaryBtnStyle,
} from './adminShared';

/** Folds the backend's auto-granted defaults (see server.js's DEFAULT_GRANTED_APPS) together with
 * whatever the admin explicitly picked, so a just-added row shows its true grants right away.
 * An explicit pick always wins over a default for the same app. */
function mergeAppGrants(defaults: UserAppGrant[] | undefined, explicit: UserAppGrant[]): UserAppGrant[] {
  const explicitIds = new Set(explicit.map((g) => g.appId));
  return [...(defaults || []).filter((g) => !explicitIds.has(g.appId)), ...explicit];
}
function parseBulkEmails(text: string): string[] {
  return Array.from(new Set(text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)));
}
type PersonName = { firstName: string; lastName: string };
const capitalise = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '');
/** A starting guess from the email (rahul.sharma@… → Rahul / Sharma) — the admin checks and corrects it. */
function guessName(email: string): PersonName {
  const parts = email.split('@')[0].split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
  return { firstName: capitalise(parts[0] || ''), lastName: parts.slice(1).map(capitalise).join(' ') };
}
const nameComplete = (n: PersonName) => !!n.firstName.trim() && !!n.lastName.trim();
const cleanName = (n: PersonName): PersonName => ({ firstName: n.firstName.replace(/\s+/g, ' ').trim(), lastName: n.lastName.replace(/\s+/g, ' ').trim() });

function normalizeIndianMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export default function AddUsersDialog({
  existingEmails,
  actingEmail,
  onClose,
  onAdded,
  notify,
}: {
  existingEmails: Set<string>;
  actingEmail: string | null;
  onClose: () => void;
  onAdded: (users: UserAccessEntry[]) => void;
  notify: (message: string, tone?: 'success' | 'error') => void;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bulkNames, setBulkNames] = useState<Record<string, PersonName>>({});
  const [mobile, setMobile] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [roles, setRoles] = useState<Record<string, AppRole | null>>({});
  const [depot, setDepot] = useState<string>(AUDIT_CAPA_DEPOTS[0]);
  const [appSearch, setAppSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const parsed = mode === 'bulk' ? parseBulkEmails(bulkText) : [];
  const bulkValid = parsed.filter((e) => EMAIL_RE.test(e) && !existingEmails.has(e));
  const bulkSkipped = parsed.length - bulkValid.length;
  const nameFor = (e: string) => bulkNames[e] ?? guessName(e);
  const bulkMissingNames = bulkValid.filter((e) => !nameComplete(nameFor(e))).length;
  const setBulkName = (e: string, patch: Partial<PersonName>) => { setBulkNames((p) => ({ ...p, [e]: { ...nameFor(e), ...patch } })); setError(''); };
  const granted = Object.entries(roles).filter((e): e is [string, AppRole] => !!e[1]);
  const visibleApps = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return q ? SORTED_APPS.filter((a) => a.name.toLowerCase().includes(q)) : SORTED_APPS;
  }, [appSearch]);

  const depotFor = (appId: string) => (appId === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(roles[appId]) ? depot : null);
  const close = () => {
    if (!busy) onClose();
  };

  const grantRoles = async (target: string, defaults: UserAppGrant[] | undefined) => {
    const results = await Promise.all(granted.map(([appId, role]) => setAppAccess(target, appId, role, depotFor(appId), actingEmail || undefined)));
    const explicit = granted.filter((_, i) => results[i].ok).map(([appId, role]) => ({ appId, role, depot: depotFor(appId) ?? undefined }));
    return { apps: mergeAppGrants(defaults, explicit), anyFailed: results.some((r) => !r.ok) };
  };

  const submitSingle = async () => {
    const value = email.trim().toLowerCase();
    const names = cleanName({ firstName, lastName });
    if (!nameComplete(names)) return setError('Enter both the first name and the last name.');
    if (!EMAIL_RE.test(value)) return setError('Enter a valid email address.');
    if (existingEmails.has(value)) return setError('This email already has access.');
    let normalized: string | undefined;
    if (mobile.trim()) {
      const m = normalizeIndianMobile(mobile.trim());
      if (!m) return setError('Enter a valid 10-digit Indian mobile number, or leave it blank.');
      normalized = m;
    }
    setError('');
    setBusy(true);
    try {
      const res = await addAuthorizedUser(value, names, actingEmail || undefined, normalized);
      if (!res.ok) return setError(res.error || 'Could not add this user.');
      const { apps, anyFailed } = await grantRoles(value, res.apps);
      onAdded([{ email: value, isActive: true, accessLevel: 'Viewer', mobile: normalized || null, ...names, apps }]);
      const who = `${names.firstName} ${names.lastName}`;
      notify(anyFailed ? `${who} added, but some app roles failed — open them to retry` : `${who} added with ${apps.length} app${apps.length === 1 ? '' : 's'}`, anyFailed ? 'error' : 'success');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async () => {
    if (bulkValid.length === 0) return setError('Paste at least one valid, new email address.');
    if (bulkMissingNames) return setError(`Enter the first and last name for everyone — ${bulkMissingNames} still missing.`);
    setError('');
    setBusy(true);
    setProgress({ done: 0, total: bulkValid.length });
    const added: UserAccessEntry[] = [];
    let failures = 0;
    try {
      for (const batch of chunk(bulkValid, 5)) {
        const results = await Promise.all(
          batch.map(async (e) => {
            const names = cleanName(nameFor(e));
            const res = await addAuthorizedUser(e, names, actingEmail || undefined);
            if (!res.ok) return null;
            const { apps } = await grantRoles(e, res.apps);
            return { email: e, isActive: true, accessLevel: 'Viewer' as const, ...names, apps };
          })
        );
        for (const r of results) {
          if (r) added.push(r);
          else failures += 1;
        }
        setProgress((p) => (p ? { ...p, done: p.done + batch.length } : null));
      }
      onAdded(added);
      notify(failures ? `${added.length} of ${bulkValid.length} added — ${failures} failed` : `${added.length} users added`, failures ? 'error' : 'success');
      onClose();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="ac-backdrop" onClick={close} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(21,17,41,0.42)', backdropFilter: 'blur(2px)' }} />
      <div className="ac-fade" role="dialog" aria-modal="true" style={{ position: 'relative', width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: colors.white, borderRadius: radii.xxxl, boxShadow: '0 30px 60px -20px rgba(21,17,41,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${colors.border}`, background: `linear-gradient(135deg, ${colors.rust}10, transparent 70%)` }}>
          <span style={{ width: 38, height: 38, borderRadius: radii.lg, background: `linear-gradient(135deg, ${gradients.primary.join(', ')})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserPlus size={18} color={colors.white} />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>Add people</p>
            <p style={{ margin: '1px 0 0', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>They can sign in as soon as they are added</p>
          </div>
          <button type="button" className="ac-btn" onClick={close} style={ghostIconBtnStyle} aria-label="Close"><X size={18} color={colors.inkSoft} /></button>
        </div>

        <div className="ac-scroll" style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Segmented
            options={[{ value: 'single', label: 'One person' }, { value: 'bulk', label: 'Many at once' }]}
            value={mode}
            onChange={(m) => { setMode(m as 'single' | 'bulk'); setError(''); }}
          />

          {mode === 'single' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>First name <span style={{ color: '#E11D48' }}>*</span></span>
                <div className="ac-input" style={inputWrapStyle}>
                  <UserRound size={14} color={colors.inkSoft} />
                  <input autoFocus required maxLength={60} value={firstName} onChange={(e) => { setFirstName(e.target.value); setError(''); }} placeholder="Rahul" style={inputStyle} />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Last name <span style={{ color: '#E11D48' }}>*</span></span>
                <div className="ac-input" style={inputWrapStyle}>
                  <UserRound size={14} color={colors.inkSoft} />
                  <input required maxLength={60} value={lastName} onChange={(e) => { setLastName(e.target.value); setError(''); }} placeholder="Sharma" style={inputStyle} />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Work email <span style={{ color: '#E11D48' }}>*</span></span>
                <div className="ac-input" style={inputWrapStyle}>
                  <Mail size={14} color={colors.inkSoft} />
                  <input value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && submitSingle()} placeholder="name@emamigroup.com" style={inputStyle} />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Mobile <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(optional)</span></span>
                <div className="ac-input" style={inputWrapStyle}>
                  <Phone size={14} color={colors.inkSoft} />
                  <input value={mobile} onChange={(e) => { setMobile(e.target.value); setError(''); }} placeholder="98xxxxxxxx" style={inputStyle} />
                </div>
              </label>
            </div>
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>Emails</span>
              <textarea
                autoFocus
                value={bulkText}
                onChange={(e) => { setBulkText(e.target.value); setError(''); }}
                placeholder={'Paste emails — commas, spaces or one per line\n\nrahul.sharma@emamigroup.com\npriya.das@emamigroup.com'}
                rows={5}
                className="ac-input"
                style={{ ...inputWrapStyle, height: 'auto', minHeight: 110, padding: '10px 12px', fontSize: 13, fontFamily: fonts.sansRegular, color: colors.ink, outline: 'none', resize: 'vertical' }}
              />
              {parsed.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>
                  <CheckCircle2 size={14} color={colors.green} /> <b style={{ color: colors.ink }}>{bulkValid.length}</b> ready to add
                  {bulkSkipped > 0 && <span> · {bulkSkipped} skipped (invalid or already added)</span>}
                </span>
              )}
              {bulkValid.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>
                    Names <span style={{ color: '#E11D48' }}>*</span>{' '}
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· filled in from each email — check and correct them</span>
                  </span>
                  <div className="ac-scroll" style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, maxHeight: 220, overflowY: 'auto' }}>
                    {bulkValid.map((e, i) => {
                      const n = nameFor(e);
                      const missing = !nameComplete(n);
                      const cell: React.CSSProperties = { ...inputWrapStyle, height: 32, flex: '1 1 110px', minWidth: 0, borderColor: missing ? '#E11D48' : undefined };
                      return (
                        <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderTop: i ? `1px solid ${colors.border}` : 'none' }}>
                          <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e}>{e}</span>
                          <div className="ac-input" style={cell}><input aria-label={`First name for ${e}`} maxLength={60} value={n.firstName} onChange={(ev) => setBulkName(e, { firstName: ev.target.value })} placeholder="First name" style={inputStyle} /></div>
                          <div className="ac-input" style={cell}><input aria-label={`Last name for ${e}`} maxLength={60} value={n.lastName} onChange={(ev) => setBulkName(e, { lastName: ev.target.value })} placeholder="Last name" style={inputStyle} /></div>
                        </div>
                      );
                    })}
                  </div>
                  {bulkMissingNames > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#E11D48' }}>
                      <AlertTriangle size={13} /> {bulkMissingNames} {bulkMissingNames === 1 ? 'person needs' : 'people need'} a first and last name
                    </span>
                  )}
                </div>
              )}
            </label>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <span style={labelStyle}>App access {mode === 'bulk' && '· applied to everyone'} · {granted.length} selected</span>
              {granted.length > 0 && (
                <button type="button" onClick={() => setRoles({})} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust }}>Clear</button>
              )}
            </div>
            <div className="ac-input" style={{ ...inputWrapStyle, height: 36, marginBottom: 8 }}>
              <Search size={14} color={colors.inkSoft} />
              <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Find an app…" style={inputStyle} />
            </div>
            <div className="ac-scroll" style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, maxHeight: 280, overflowY: 'auto' }}>
              {visibleApps.map((app, i) => (
                <div key={app.id} style={{ padding: '8px 12px', borderTop: i === 0 ? 'none' : `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <AppIcon appId={app.id} size={26} />
                    <span style={{ flex: 1, minWidth: 120, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: roles[app.id] ? colors.ink : colors.inkSoft }}>{app.name}</span>
                    <Segmented
                      size="sm"
                      accent={appColor(app.id)}
                      options={[{ value: null, label: 'None' }, ...roleOptionsFor(app.id).map((r) => ({ value: r, label: r }))]}
                      value={roles[app.id] ?? null}
                      onChange={(r) => setRoles((p) => ({ ...p, [app.id]: r }))}
                    />
                  </div>
                  {app.id === AUDIT_CAPA_APP_ID && auditCapaRoleNeedsDepot(roles[app.id]) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 36, flexWrap: 'wrap' }}>
                      {AUDIT_CAPA_DEPOTS.map((d) => (
                        <button key={d} type="button" onClick={() => setDepot(d)} style={{ ...chipStyle(depot === d, appColor(app.id)), padding: '4px 10px', fontSize: 11.5 }}>{d}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>Default apps (e.g. Mediclaim, Term Policy) are granted automatically.</p>
          </div>

          {!!error && <p style={{ ...errorTextStyle, margin: 0 }}>{error}</p>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10, backgroundColor: colors.cream }}>
          <span style={{ flex: 1, fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>
            {progress ? `Adding ${progress.done}/${progress.total}…` : 'New people start as Viewer.'}
          </span>
          <button type="button" className="ac-btn" onClick={close} disabled={busy} style={secondaryBtnStyle}>Cancel</button>
          <button type="button" className="ac-btn" onClick={mode === 'single' ? submitSingle : submitBulk} disabled={busy || (mode === 'single' ? !email.trim() || !firstName.trim() || !lastName.trim() : bulkValid.length === 0 || bulkMissingNames > 0)} style={primaryBtnStyle}>
            {busy ? <Spinner light size={14} /> : mode === 'single' ? <UserPlus size={15} /> : <Users size={15} />}
            {mode === 'single' ? 'Add person' : `Add ${bulkValid.length || ''} people`}
          </button>
        </div>
      </div>
    </div>
  );
}
