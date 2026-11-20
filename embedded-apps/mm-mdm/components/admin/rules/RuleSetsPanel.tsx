'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rulesApi, RuleApp, RuleScreen, RuleSetRow } from '@/lib/admin/rulesApi';
import { ErrorState, LoadingState } from '../../ui';
import { IconPlus, IconRefresh } from '../../icons';
import RuleEditor from './RuleEditor';
import RuleTester from './RuleTester';
import { ConfirmDialog } from './parts';

type Load = 'loading' | 'ready' | 'error';

/** Application -> screen -> rule sets (MAINTAIN_RULES header + "Rule Set" table), editor next to it */
export default function RuleSetsPanel({ canEdit }: { canEdit: boolean }) {
  const [apps, setApps] = useState<RuleApp[]>([]);
  const [appsState, setAppsState] = useState<Load>('loading');
  const [appsError, setAppsError] = useState('');
  const [app, setApp] = useState('');
  const [screens, setScreens] = useState<RuleScreen[]>([]);
  const [screensState, setScreensState] = useState<Load>('ready');
  const [screensError, setScreensError] = useState('');
  const [fgroup, setFgroup] = useState('');
  const [sets, setSets] = useState<RuleSetRow[]>([]);
  const [setsState, setSetsState] = useState<Load>('ready');
  const [setsError, setSetsError] = useState('');
  const [selected, setSelected] = useState<string>(''); // rule set id, 'new' or ''
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const reqSets = useRef(0);

  const loadApps = useCallback(() => {
    setAppsState('loading');
    rulesApi.apps()
      .then((r) => { setApps(r); setAppsError(''); setAppsState('ready'); })
      .catch((e: Error) => { setAppsError(e.message); setAppsState('error'); });
  }, []);
  useEffect(() => { loadApps(); }, [loadApps]);

  const loadScreens = useCallback((a: string) => {
    if (!a) { setScreens([]); return; }
    setScreensState('loading');
    rulesApi.screens(a)
      .then((r) => { setScreens(r); setScreensError(''); setScreensState('ready'); })
      .catch((e: Error) => { setScreensError(e.message); setScreensState('error'); });
  }, []);

  const loadSets = useCallback((fg: string) => {
    if (!fg) { setSets([]); return; }
    const mine = ++reqSets.current;
    setSetsState('loading');
    rulesApi.sets(fg)
      .then((r) => { if (mine === reqSets.current) { setSets(r); setSetsError(''); setSetsState('ready'); } })
      .catch((e: Error) => { if (mine === reqSets.current) { setSetsError(e.message); setSetsState('error'); } });
  }, []);

  /** Run an action that would drop unsaved edits only after the user agreed */
  const guard = (fn: () => void) => { if (dirty) setPending(() => fn); else fn(); };

  const pickApp = (a: string) => guard(() => { setApp(a); setFgroup(''); setSets([]); setSelected(''); setDirty(false); loadScreens(a); });
  const pickScreen = (fg: string) => guard(() => { setFgroup(fg); setSelected(''); setDirty(false); loadSets(fg); });
  const pickSet = (id: string) => { if (id !== selected) guard(() => { setSelected(id); setDirty(false); }); };

  const screen = screens.find((s) => s.fgroup === fgroup);
  const afterChange = (id: string) => { loadSets(fgroup); loadScreens(app); loadApps(); setSelected(id); };

  if (appsState === 'loading') return <section className="card"><LoadingState /></section>;
  if (appsState === 'error') return <section className="card"><ErrorState message={appsError} onRetry={loadApps} /></section>;

  return (
    <>
      <section className="card">
        <div className="grid-form rl-pick">
          <div className="field">
            <label className="field-label" htmlFor="rl-app">Application</label>
            <select id="rl-app" value={app} onChange={(e) => pickApp(e.target.value)}>
              <option value="">Select an application…</option>
              {apps.map((a) => <option key={a.app} value={a.app}>{a.app} · {a.text} ({a.setCount} rule sets)</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="rl-screen">Screen</label>
            <select id="rl-screen" value={fgroup} onChange={(e) => pickScreen(e.target.value)} disabled={!app || screensState !== 'ready'}>
              <option value="">{!app ? 'Select an application first' : screensState === 'loading' ? 'Loading screens…' : 'Select a screen…'}</option>
              {screens.map((s) => <option key={s.fgroup} value={s.fgroup}>{s.fgroup} · {s.screen} · {s.screenDesc} ({s.setCount})</option>)}
            </select>
            <small className="muted">The rule sets of one screen, as in the old Search.</small>
          </div>
        </div>
        {screensState === 'error' && <ErrorState title="Could not load the screens" message={screensError} onRetry={() => loadScreens(app)} />}
      </section>

      {fgroup && (
        <section className="card card-flush">
          <div className="card-bar">
            <h2>Rule sets{screen ? ` of ${screen.screen}` : ''}</h2>
            <div className="rl-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadSets(fgroup)}><IconRefresh size={14} /> Refresh</button>
              {canEdit && <button type="button" className="btn btn-primary btn-sm" onClick={() => guard(() => { setSelected('new'); setDirty(false); })}><IconPlus size={14} /> New rule set</button>}
            </div>
          </div>
          {setsState === 'loading' && <LoadingState />}
          {setsState === 'error' && <ErrorState message={setsError} onRetry={() => loadSets(fgroup)} />}
          {setsState === 'ready' && sets.length === 0 && <div className="empty"><p>No results found. This screen has no rule sets yet.</p></div>}
          {setsState === 'ready' && sets.length > 0 && (
            <div className="table-wrap">
              <table className="table rl-sets">
                <thead><tr><th>Rule set</th><th>Description</th><th>Sets field</th><th className="rl-num">Rules</th></tr></thead>
                <tbody>
                  {sets.map((s) => (
                    <tr key={s.ruleSetId} className={s.ruleSetId === selected ? 'rl-sel' : ''} aria-selected={s.ruleSetId === selected}>
                      <td><button type="button" className="row-link rl-linkbtn" onClick={() => pickSet(s.ruleSetId)}>{s.ruleSetId}</button></td>
                      <td>{s.description}</td>
                      <td>{s.outputField ? <span className="pill">{s.outputField}</span> : <span className="muted">—</span>}</td>
                      <td className="rl-num">{s.ruleCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {fgroup && screen && selected && (
        <RuleEditor
          key={selected}
          app={app}
          screen={screen}
          ruleSetId={selected === 'new' ? null : selected}
          canEdit={canEdit}
          onDirty={setDirty}
          onChanged={afterChange}
          onDeleted={() => { setSelected(''); setDirty(false); loadSets(fgroup); loadScreens(app); loadApps(); }}
        />
      )}

      {app && <RuleTester app={app} />}

      {pending && (
        <ConfirmDialog title="Discard unsaved changes?" confirmText="Discard" danger onCancel={() => setPending(null)} onConfirm={() => { const fn = pending; setPending(null); fn(); }}>
          <p>You changed the rule set and did not save it. Please save the changes in Rule and proceed, or discard them.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
