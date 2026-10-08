'use client';

import React, { useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { AppStage } from '../../types';
import { STAGES, stageDef } from '../../data/appStages';
import { useAppStages } from '../../context/AppStagesContext';
import { setAppStage } from '../../lib/appStagesApi';
import { colors, fontWeights, fonts, radii } from '../../theme/tokens';
import StageBadge from '../StageBadge';
import {
  AppIcon, SORTED_APPS, Spinner, cardStyle, displayName, inputStyle, inputWrapStyle, sectionSubStyle, sectionTitleStyle, timeAgo,
} from './adminShared';

/** Admin Center "App status" tab: how many apps sit in each release stage (KPI tiles, click to filter) and a picker
 * per app. A change is saved to the access backend (backend/appStages.js) and shows on every open hub's tiles within
 * one AppStagesContext poll; this tab and the admin's own tiles update at once. */
export default function AppStatusPanel({ notify, isWide }: { notify: (m: string, t?: 'success' | 'error') => void; isWide: boolean }) {
  const { stageOf, stored, applySaved } = useAppStages();
  const [filter, setFilter] = useState<AppStage | 'none' | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const counts = new Map<AppStage | 'none', number>();
  SORTED_APPS.forEach((a) => {
    const k = stageOf(a.id) ?? 'none';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const total = SORTED_APPS.length;
  const q = search.trim().toLowerCase();
  const rows = SORTED_APPS.filter((a) => (filter === null || (stageOf(a.id) ?? 'none') === filter) && (!q || a.name.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)));

  const change = async (appId: string, name: string, stage: AppStage) => {
    if (stage === stageOf(appId)) return;
    setSaving(appId);
    const r = await setAppStage(appId, stage);
    setSaving(null);
    if (r.ok && r.saved) {
      applySaved(appId, r.saved);
      notify(`${name} is now ${stageDef(stage).name}.`);
    } else {
      notify(r.error || 'Could not change the app status.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isWide ? `repeat(${STAGES.length}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
        {STAGES.map((s) => {
          const n = counts.get(s.stage) ?? 0;
          const active = filter === s.stage;
          return (
            <button
              key={s.stage}
              type="button"
              className="ac-card"
              onClick={() => setFilter(active ? null : s.stage)}
              aria-pressed={active}
              title={active ? 'Show all apps' : `Show ${s.name} apps`}
              style={{ ...cardStyle, padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, borderColor: active ? s.color : colors.border, boxShadow: active ? `0 0 0 3px ${s.color}22` : cardStyle.boxShadow, borderTop: `4px solid ${s.color}` }}
            >
              <span style={{ fontSize: 26, lineHeight: '30px', fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: n ? colors.ink : colors.inkSoft }}>{n}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: s.color }}>{s.stage}</span>
                {s.name !== s.stage && <span style={{ fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>{s.name}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p style={sectionTitleStyle}>Release status across {total} apps</p>
          {(counts.get('none') ?? 0) > 0 && (
            <button type="button" onClick={() => setFilter(filter === 'none' ? null : 'none')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: filter === 'none' ? colors.rust : colors.inkSoft }}>
              {counts.get('none')} without a status
            </button>
          )}
        </div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12, gap: 2, backgroundColor: colors.appBg }}>
          {STAGES.map((s) => {
            const n = counts.get(s.stage) ?? 0;
            return n ? <span key={s.stage} title={`${s.name}: ${n}`} style={{ flex: n, backgroundColor: s.color }} /> : null;
          })}
          {(counts.get('none') ?? 0) > 0 && <span title={`No status: ${counts.get('none')}`} style={{ flex: counts.get('none'), backgroundColor: colors.border }} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
          {STAGES.map((s) => (
            <span key={s.stage} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
              {s.stage} · {Math.round(((counts.get(s.stage) ?? 0) / total) * 100)}%
            </span>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={sectionTitleStyle}>Change an app&apos;s status</p>
            <p style={sectionSubStyle}>Shown as the badge on the app&apos;s tile in Emami Apps for everyone.</p>
          </div>
          <div className="ac-input" style={{ ...inputWrapStyle, width: isWide ? 260 : '100%' }}>
            <Search size={15} color={colors.inkSoft} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps…" style={inputStyle} aria-label="Search apps" />
            {!!search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={14} color={colors.inkSoft} /></button>}
          </div>
          {filter !== null && (
            <button type="button" onClick={() => setFilter(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '6px 12px', background: colors.white, cursor: 'pointer', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>
              {filter === 'none' ? 'No status' : filter} <X size={13} />
            </button>
          )}
        </div>
        {rows.map((a, i) => {
          const stage = stageOf(a.id);
          const meta = stored[a.id];
          const color = stage ? stageDef(stage).color : colors.inkSoft;
          return (
            <div key={a.id} className="ac-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`, flexWrap: isWide ? 'nowrap' : 'wrap' }}>
              <AppIcon appId={a.id} size={32} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ margin: 0, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{a.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>
                  {a.cat}
                  {meta?.updatedAt ? ` · changed ${timeAgo(meta.updatedAt)}${meta.updatedBy ? ` by ${displayName(meta.updatedBy)}` : ''}` : stage ? ' · default status' : ''}
                </p>
              </div>
              {stage ? <StageBadge stage={stage} /> : <span style={{ fontSize: 11, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft }}>No status</span>}
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: color, pointerEvents: 'none' }} />
                <select
                  value={stage ?? ''}
                  disabled={saving === a.id}
                  onChange={(e) => void change(a.id, a.name, e.target.value as AppStage)}
                  aria-label={`Status of ${a.name}`}
                  style={{ appearance: 'none', height: 34, minWidth: 240, padding: '0 30px 0 26px', borderRadius: radii.lg, border: `1px solid ${colors.border}`, backgroundColor: colors.white, color: colors.ink, fontSize: 12.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, cursor: 'pointer' }}
                >
                  {!stage && <option value="" disabled>Set a status…</option>}
                  {STAGES.map((s, n) => <option key={s.stage} value={s.stage}>{n + 1}. {s.stage === s.name ? s.name : `${s.stage} - ${s.name}`}</option>)}
                </select>
                <span style={{ position: 'absolute', right: 10, display: 'flex', pointerEvents: 'none' }}>{saving === a.id ? <Spinner size={13} /> : <ChevronDown size={14} color={colors.inkSoft} />}</span>
              </label>
            </div>
          );
        })}
        {!rows.length && <p style={{ margin: 0, padding: 20, fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>No apps match.</p>}
      </div>
    </div>
  );
}
