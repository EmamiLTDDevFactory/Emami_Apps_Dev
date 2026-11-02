'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, Users, Mail, Phone, Smartphone, Briefcase, Building2, UserRound, X, Copy, Check } from 'lucide-react';
import { searchPeople, getPersonCard, type PersonSummary, type PersonCard } from '../../../lib/authApi';
import { Initials } from '../../../components/admin/adminShared';
import { colors, fonts, fontWeights, radii } from '../../../theme/tokens';

/** People — any signed-in user can find any active Emami Apps user and see their basic details
 * (name, email, job title, department, work phones, manager). Backed by GET /me/people (backend/orgProfile.js). */
export default function PeoplePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchPeople(q).then((r) => {
        if (id !== seq.current) return;
        setLoading(false);
        if (r.ok) { setResults(r.people || []); setError(''); }
        else { setResults([]); setError(r.error || 'Could not search people right now.'); }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = query.trim();
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: radii.xl, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Users size={20} color={colors.rust} />
        </div>
        <p style={{ fontSize: 22, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>People</p>
        <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 4, marginBottom: 0, textAlign: 'center' }}>
          Find anyone on Emami Apps by name, email, job title or department.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 520, borderRadius: radii.pill, padding: '0 16px', height: 44, backgroundColor: colors.white, border: `1px solid ${colors.border}`, marginTop: 18 }}>
          <Search size={15} color={colors.inkSoft} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: colors.ink, fontFamily: fonts.sansRegular, border: 'none', outline: 'none', background: 'transparent', height: '100%' }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
              <X size={15} color={colors.inkSoft} />
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {q.length < 2 ? (
          <Hint icon={Search} text="Type at least 2 letters to search." />
        ) : error ? (
          <Hint icon={X} text={error} tone="error" />
        ) : loading && !results.length ? (
          <Hint icon={Search} text="Searching…" />
        ) : !results.length ? (
          <Hint icon={UserRound} text={`No one found for “${q}”.`} />
        ) : (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>
              {results.length === 50 ? 'Showing the first 50 matches. Type more to narrow it down.' : `${results.length} ${results.length === 1 ? 'person' : 'people'}`}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {results.map((p) => (
                <li key={p.email}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.email)}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.xl, border: `1px solid ${selected === p.email ? colors.rust : colors.border}`, backgroundColor: colors.white, cursor: 'pointer' }}
                  >
                    <Initials email={p.email} name={p.name} size={40} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, color: colors.ink, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: colors.inkSoft, fontFamily: fonts.sansRegular, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[p.jobTitle, p.department].filter(Boolean).join(' · ') || p.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {selected && <PersonPanel email={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Hint({ icon: Icon, text, tone }: { icon: React.ElementType; text: string; tone?: 'error' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 16px', color: tone === 'error' ? '#E11D48' : colors.inkSoft }}>
      <Icon size={22} />
      <p style={{ margin: 0, fontSize: 13, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, textAlign: 'center' }}>{text}</p>
    </div>
  );
}

function PersonPanel({ email, onClose }: { email: string; onClose: () => void }) {
  const [state, setState] = useState<{ email: string; person?: PersonCard; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    setState(null);
    setCopied(false);
    getPersonCard(email).then((r) => { if (live) setState({ email, person: r.person, error: r.ok ? undefined : r.error }); });
    return () => { live = false; };
  }, [email]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = state?.person;
  const copyEmail = () => {
    navigator.clipboard?.writeText(email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(21,17,41,0.32)' }} />
      <aside role="dialog" aria-modal="true" aria-label="Person details" style={{ position: 'relative', width: '100%', maxWidth: 420, height: '100%', backgroundColor: colors.white, boxShadow: '-20px 0 40px -20px rgba(21,17,41,0.35)', overflowY: 'auto' }}>
        <div style={{ padding: '20px 56px 18px 20px', display: 'flex', alignItems: 'center', gap: 14, background: `linear-gradient(135deg, ${colors.rust}0f, transparent 70%)`, borderBottom: `1px solid ${colors.border}` }}>
          <Initials email={email} name={p?.name} size={52} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, color: colors.ink, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? (state?.error ? email : 'Loading…')}</p>
            {p?.jobTitle && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{p.jobTitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: radii.md, border: `1px solid ${colors.border}`, background: colors.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={colors.inkSoft} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {state?.error ? (
            <p style={{ margin: 0, fontSize: 13, color: '#E11D48', fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>{state.error}</p>
          ) : !p ? (
            <p style={{ margin: 0, fontSize: 13, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>Loading details…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Row icon={Mail} label="Email">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <a href={`mailto:${p.email}`} style={{ color: colors.rust, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</a>
                  <button type="button" onClick={copyEmail} aria-label="Copy email" title="Copy email" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}>
                    {copied ? <Check size={14} color={colors.green} /> : <Copy size={14} color={colors.inkSoft} />}
                  </button>
                </span>
              </Row>
              <Row icon={Briefcase} label="Job title">{p.jobTitle || <Muted />}</Row>
              <Row icon={Building2} label="Department">{p.department || <Muted />}</Row>
              <Row icon={Phone} label="Work phone">
                {p.businessPhones.length ? p.businessPhones.map((n) => <a key={n} href={`tel:${n}`} style={{ display: 'block', color: colors.rust, textDecoration: 'none' }}>{n}</a>) : <Muted />}
              </Row>
              {p.mobilePhone && (
                <Row icon={Smartphone} label="Mobile (directory)"><a href={`tel:${p.mobilePhone}`} style={{ color: colors.rust, textDecoration: 'none' }}>{p.mobilePhone}</a></Row>
              )}
              <Row icon={UserRound} label="Reports to">
                {p.managers.length ? (
                  p.managers.map((m) => (
                    <span key={m.level} style={{ display: 'block', marginBottom: 4 }}>
                      <span style={{ color: colors.ink }}>{m.displayName || m.mail || '—'}</span>
                      {m.jobTitle && <span style={{ color: colors.inkSoft }}> · {m.jobTitle}</span>}
                      <span style={{ color: colors.inkSoft, fontSize: 11 }}> ({m.level === 1 ? 'manager' : "manager's manager"})</span>
                    </span>
                  ))
                ) : <Muted />}
              </Row>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: radii.md, backgroundColor: `${colors.rust}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color={colors.rust} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.inkSoft, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>{label}</p>
        <div style={{ marginTop: 2, fontSize: 13, color: colors.ink, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, wordBreak: 'break-word' }}>{children}</div>
      </div>
    </div>
  );
}

const Muted = () => <span style={{ color: colors.inkSoft, fontFamily: fonts.sansRegular }}>Not in the directory</span>;
