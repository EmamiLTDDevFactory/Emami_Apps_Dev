'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminApiError } from '@/lib/admin/adminApi';
import { WfCfg, WfGroup, WfKey, WfMeta, WfMsg, wfApi } from '@/lib/admin/wfApi';
import { emptyGroup, keyText, newLevel, recount, snapshot, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconCopy, IconPlus, IconRefresh, IconSave, IconTrash, IconUndo } from '../../icons';
import { ErrorState, LoadingState } from '../../ui';
import LevelCard from './LevelCard';
import LogPanel from './LogPanel';
import PreviewPanel, { FlowStrip } from './PreviewPanel';
import ViewsPanel from './ViewsPanel';
import { ConfirmDialog, MessageBox, OkBox, VhInput } from './parts';

export type EditorTarget = { kind: 'existing'; key: WfKey } | { kind: 'new'; appId: string };
type Tab = 'levels' | 'views' | 'routing' | 'log';

/** One combination (application + generic fields): flow strip, levels with agents, tabs per level, routing check and history */
export default function GroupEditor({ target, cfg, meta, onDirty, onSaved, onDeleted, onCopy, onCancelNew }: {
  target: EditorTarget; cfg: WfCfg | undefined; meta: WfMeta; onDirty: (d: boolean) => void; onSaved: (k: WfKey) => void;
  onDeleted: (k: WfKey) => void; onCopy: (k: WfKey) => void; onCancelNew: () => void;
}) {
  const isNew = target.kind === 'new';
  const appId = isNew ? target.appId : target.key.appId;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState('');
  const [group, setGroup] = useState<WfGroup>(() => emptyGroup(appId));
  const [base, setBase] = useState(() => snapshot(emptyGroup(appId)));
  const [version, setVersion] = useState('');
  const [issues, setIssues] = useState<WfMsg[]>([]);
  const [open, setOpen] = useState(0);
  const [live, setLive] = useState<WfMsg[]>([]);
  const [tab, setTab] = useState<Tab>('levels');
  const [scope, setScope] = useState('L0');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'level'; lvl: string } | { kind: 'delete' } | { kind: 'force'; text: string }>(null);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const saved = !isNew;
  const dirty = state === 'ready' && snapshot(group) !== base;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const keyOf = (g: WfGroup): WfKey => ({ appId: g.appId, genType: g.genType, genField: g.genField, genField2: g.genField2, genField3: g.genField3, genField4: g.genField4 });
  const adopt = useCallback((g: WfGroup, ver: string, msgs: WfMsg[] = []) => {
    const first = g.levels.find((l) => l.typeLvl) || g.levels[0];
    setGroup(g); setBase(snapshot(g)); setVersion(ver); setIssues(msgs); setLive([]);
    setScope((s) => (s === 'L0' || g.levels.some((l) => l.lvl === s) ? s : first?.lvl || 'L0'));
  }, []);

  const key = target.kind === 'existing' ? target.key : null;
  const keyId = key ? keyText(key) : '';
  const load = useCallback(async () => {
    if (!key) return;
    setState('loading'); setLoadError(''); setStale(false);
    try {
      const r = await wfApi.getGroup(key);
      adopt(r.group, r.version, r.issues); setOpen(r.openRequests); setState('ready');
    } catch (e) { setLoadError((e as Error).message); setState('error'); }
  }, [keyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (key) { setSaveErr(null); setOk(''); setDelErr(null); load(); } }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // live validation by SAP while editing
  useEffect(() => {
    if (state !== 'ready' || !dirty || !group.appId) return;
    let alive = true;
    const t = setTimeout(() => {
      wfApi.validate(group, isNew ? 'create' : 'update').then((r) => { if (alive) setLive(r.messages); }).catch(() => { /* shown on save */ });
    }, 800);
    return () => { alive = false; clearTimeout(t); };
  }, [group, dirty, state, isNew]);

  const update = (g: WfGroup) => { setGroup(g); setOk(''); setSaveErr(null); };
  const setLevel = (i: number, l: ReturnType<typeof recount>) => update({ ...group, levels: group.levels.map((x, k) => (k === i ? l : x)) });
  const messages = saveErr ? [] : live;
  const flagged = useMemo(() => messages.filter((m) => m.severity === 'E' && m.target).map((m) => m.target as string), [messages]);

  async function save() {
    setSaving(true); setSaveErr(null); setOk(''); setStale(false);
    try {
      const r = await wfApi.save(group, isNew ? 'create' : 'update', version);
      adopt(r.group, r.version, []);
      setIssues(r.messages);
      setOk(`Saved. Change log run ${r.transId}: ${r.logRows} level/agent and ${r.viewLogRows} tab entries.`);
      onSaved(keyOf(r.group));
    } catch (e) {
      setSaveErr(e);
      if (e instanceof AdminApiError && e.messages.some((m) => m.code === 'STALE')) setStale(true);
    } finally { setSaving(false); }
  }

  async function del(force: boolean) {
    setBusy(true); setDelErr(null);
    try {
      await wfApi.remove(keyOf(group), force);
      setConfirm(null); onDirty(false); onDeleted(keyOf(group));
    } catch (e) {
      if (!force && e instanceof AdminApiError && e.messages.some((m) => m.code === 'OPEN_REQUESTS')) { setConfirm({ kind: 'force', text: e.messages[0].message }); }
      else { setConfirm(null); setDelErr(e); }
    } finally { setBusy(false); }
  }

  function goto(target: string) {
    if (target === 'L0') { setTab('views'); setScope('L0'); return; }
    const lvl = target.split('#')[0];
    setTab('levels');
    setTimeout(() => document.getElementById(`wf-level-${lvl}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function addLevel() {
    const l = newLevel(group);
    update({ ...group, levels: [...group.levels, l] });
    setTab('levels');
    setTimeout(() => document.getElementById(`wf-level-${l.lvl}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  if (state === 'loading') return <section className="card"><LoadingState text={`Loading ${keyId} from SAP…`} /></section>;
  if (state === 'error') return <section className="card"><ErrorState title="Could not load this combination" message={loadError} onRetry={load} /></section>;

  const fields = visibleKeyFields(cfg, [group]);
  const agentsN = group.levels.reduce((n, l) => n + l.agents.length, 0);
  const errN = messages.filter((m) => m.severity === 'E').length;
  const canSave = dirty && !saving && (group.genType !== '' || group.genField !== '' || group.genField2 !== '' || group.genField3 !== '' || group.genField4 !== '' || !isNew || cfg?.family !== 'MATERIAL');

  return (
    <section className="card wf-editor" ref={ref} aria-label={isNew ? 'New combination' : keyText(group)}>
      <div className="card-bar wf-editor-bar">
        <div>
          <h2>{isNew ? 'New combination' : keyText(group) || 'Combination'}</h2>
          <p className="muted">{cfg?.text || appId}{cfg?.wfId ? ` · workflow template ${cfg.wfId}` : ''}{open > 0 ? ` · ${open} request${open === 1 ? '' : 's'} running` : ''}</p>
        </div>
        <div className="wf-actions">
          {dirty && <span className="badge badge-warn" role="status">Unsaved changes</span>}
          {!isNew && <button type="button" className="btn btn-sm" onClick={() => onCopy(keyOf(group))} disabled={dirty} title={dirty ? 'Save or discard first' : ''}><IconCopy size={14} /> Copy</button>}
          {!isNew && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm({ kind: 'delete' })}><IconTrash size={14} /> Delete</button>}
          {!isNew && <button type="button" className="btn btn-sm" onClick={load} disabled={saving}><IconRefresh size={14} /> Reload</button>}
          {dirty && !isNew && <button type="button" className="btn btn-sm" onClick={load} disabled={saving}><IconUndo size={14} /> Discard</button>}
          {isNew && <button type="button" className="btn btn-sm" onClick={onCancelNew} disabled={saving}>Cancel</button>}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}><IconSave size={14} /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="wf-editor-body">
        {isNew && (
          <div className="wf-newkey">
            <p className="muted">Choose the values this definition applies to. A request uses a definition only when its values match exactly (a blank field matches only a blank field).</p>
            <div className="wf-keyfields">
              {fields.map((f) => (
                <VhInput key={f.field} id={`wf-new-${f.field}`} label={f.label} kind={f.vh} appId={appId} value={group[f.field]} onChange={(v) => update({ ...group, [f.field]: v })} />
              ))}
            </div>
          </div>
        )}
        {stale && <p className="alert alert-warn">Someone else saved this combination meanwhile. <button type="button" className="wf-link" onClick={load}>Reload it</button> and apply your changes again.</p>}
        <MessageBox error={saveErr} />
        <MessageBox error={delErr} />
        {ok && <OkBox>{ok}</OkBox>}

        <FlowStrip group={group} />

        {!dirty && issues.length > 0 && (
          <details className="wf-issues"><summary>{issues.filter((m) => m.severity === 'E').length} problem(s), {issues.filter((m) => m.severity !== 'E').length} hint(s) in the saved definition</summary><MessageBox messages={issues} onPick={goto} /></details>
        )}
        {dirty && messages.length > 0 && (
          <details className="wf-issues" open={errN > 0}><summary>{errN} error(s) to fix before saving, {messages.length - errN} hint(s)</summary><MessageBox messages={messages} onPick={goto} /></details>
        )}

        <div className="tabs wf-tabs" role="tablist" aria-label="Combination">
          {([['levels', `Levels and agents (${group.levels.length} / ${agentsN})`], ['views', 'Tabs per step'], ['routing', 'Routing preview'], ...(saved ? [['log', 'History']] : [])] as [Tab, string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="wf-tabbody" role="tabpanel">
          {tab === 'levels' && (
            <>
              <p className="muted wf-lead">The request starts with the <strong>Initiator</strong>, then goes through the <strong>Reviewer</strong> levels and ends at the <strong>Approver</strong> levels. Within a level, agents who <em>approve</em> get a work item; the others are only informed by mail.</p>
              {group.levels.length === 0 && <div className="empty"><p>No level yet. Without an Approver level SAP stops every request of this combination with "Please maintain Approver role".</p></div>}
              {group.levels.map((l, i) => (
                <LevelCard key={`${l.lvl}-${i}`} level={l} cfg={cfg} appId={appId} levelTexts={meta.levelTexts} departments={meta.departments} pirTypes={meta.pirTypes}
                  flagged={flagged} onChange={(nl) => setLevel(i, nl)} onRemove={() => setConfirm({ kind: 'level', lvl: l.lvl })} />
              ))}
              <button type="button" className="btn" onClick={addLevel}><IconPlus size={14} /> Add level</button>
            </>
          )}
          {tab === 'views' && <ViewsPanel group={group} cfg={cfg} onChange={update} scope={scope} setScope={setScope} />}
          {tab === 'routing' && <PreviewPanel group={group} cfg={cfg} saved={saved} dirty={dirty} />}
          {tab === 'log' && saved && <LogPanel appId={appId} cfg={cfg} fixedKey={keyOf(group)} auto />}
        </div>
      </div>

      {confirm?.kind === 'level' && (
        <ConfirmDialog title={`Remove level ${confirm.lvl}?`} confirmText="Remove level" danger onCancel={() => setConfirm(null)}
          onConfirm={() => { update({ ...group, levels: group.levels.filter((l) => l.lvl !== confirm.lvl) }); setConfirm(null); }}>
          <p>It will be deleted corresponding details of Agent and View visibility also. Do you want to continue?</p>
          <p>Nothing is written to SAP until you press Save.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog title="Delete this combination?" confirmText="Delete" danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => del(false)}>
          <p><strong>{keyText(group)}</strong></p>
          <p>It will be deleted corresponding details of Level Definition, Agent and View visibility also. It will be Updated in SAP. Do you want to continue?</p>
          <p>This happens immediately and is recorded in the change log. Requests of this combination that start afterwards fail until a definition exists again.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'force' && (
        <ConfirmDialog title="Requests are still running" confirmText="Delete anyway" danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => del(true)}>
          <p>{confirm.text}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
