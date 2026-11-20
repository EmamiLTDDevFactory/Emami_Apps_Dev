'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { ExtensionInput, ScopeRow, getPostedScope, startChange, startExtension } from '@/lib/mmApi';
import { ErrorState, LoadingState, requestHref } from '../ui';
import LiveVh from './LiveVh';
import { IconArrowRight, IconBox, IconEdit, IconLayers } from '../icons';

/** What a material has in SAP, from the scope rows (plants with storage locations, sales areas) */
function useScope(matnr: string) {
  const [rows, setRows] = useState<ScopeRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError(''); setRows(null);
    getPostedScope(matnr).then(setRows).catch((e: Error) => setError(e.message));
  }, [matnr]);
  useEffect(() => { load(); }, [load]);
  const plants = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach((r) => { if (r.plant && !m.has(r.plant)) m.set(r.plant, r.plantText); });
    return [...m].map(([code, text]) => ({ code, text }));
  }, [rows]);
  const locations = useMemo(() => (rows ?? []).filter((r) => r.plant && r.storageLocation), [rows]);
  const areas = useMemo(() => {
    const m = new Map<string, ScopeRow>();
    (rows ?? []).forEach((r) => { if (r.salesOrg) m.set(`${r.salesOrg}/${r.distributionChannel}`, r); });
    return [...m.values()];
  }, [rows]);
  return { rows, error, load, plants, locations, areas };
}

const areaKey = (r: ScopeRow) => `${r.salesOrg}/${r.distributionChannel}`;
const areaText = (r: ScopeRow) => `${r.salesOrg}${r.salesOrgText ? ` ${r.salesOrgText}` : ''} / ${r.distributionChannel}${r.distributionChannelText ? ` ${r.distributionChannelText}` : ''}`;

function Header({ matnr, kind }: { matnr: string; kind: 'MX' | 'ME' }) {
  return (
    <section className="home-banner nr-banner">
      <div className="home-banner-text">
        <p className="eyebrow">{kind === 'MX' ? <IconEdit size={13} /> : <IconLayers size={13} />} {kind} · {kind === 'MX' ? 'Change material' : 'Extend material'}</p>
        <h2>{kind === 'MX' ? 'Change' : 'Extend'} material {matnr.replace(/^0+/, '')}</h2>
        <p>{kind === 'MX'
          ? 'Choose the plant, storage location and sales area you want to change. SAP copies the live data into a change request and routes it for approval.'
          : 'Say what the material is extended to. SAP starts an extension request and routes it for approval; only the new level needs to be maintained.'}</p>
      </div>
    </section>
  );
}

function Missing() {
  return (
    <section className="card"><ErrorState title="No material chosen" message="Open this screen from a posted material (Material master data)." /><Link href="/master/material/data" className="btn">Posted materials</Link></section>
  );
}

/** MX: pick the org level to change, then start the change request */
export function ChangeStart({ matnr }: { matnr: string }) {
  const router = useRouter();
  const { notify, refreshInbox } = useMdm();
  const sc = useScope(matnr);
  const [plant, setPlant] = useState('');
  const [sloc, setSloc] = useState('');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!matnr) return <Missing />;

  const locs = sc.locations.filter((l) => l.plant === plant);

  async function start() {
    setBusy(true); setError('');
    try {
      const a = sc.areas.find((x) => areaKey(x) === area);
      const r = await startChange({ matnr, plant, storageLocation: sloc, salesOrg: a?.salesOrg ?? '', distributionChannel: a?.distributionChannel ?? '' });
      notify('success', `Change request ${r.header.transId} started`);
      void refreshInbox();
      router.push(requestHref(r.header.transId));
    } catch (e) { setError(e instanceof Error ? e.message : 'The change request could not be started.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header matnr={matnr} kind="MX" />
      <section className="card nr-card">
        <div className="section-head">
          <span className="section-num" aria-hidden><IconBox size={15} /></span>
          <div className="section-head-text"><h3>Scope of the change</h3><p className="muted">What this material has in SAP. Leave all three empty to change the general (client) data only.</p></div>
        </div>
        {sc.error && <ErrorState message={sc.error} onRetry={sc.load} />}
        {!sc.rows && !sc.error && <LoadingState text="Reading the scope of the material from SAP…" />}
        {sc.rows && (
          <div className="scope-grid">
            <label className="field">
              <span className="field-label">Plant<span className="tech">WERKS</span></span>
              <select id="c-plant" value={plant} onChange={(e) => { setPlant(e.target.value); setSloc(''); }}>
                <option value="">No plant</option>
                {sc.plants.map((p) => <option key={p.code} value={p.code}>{p.code}{p.text ? ` – ${p.text}` : ''}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Storage location<span className="tech">LGORT</span></span>
              <select id="c-sloc" value={sloc} onChange={(e) => setSloc(e.target.value)} disabled={!plant}>
                <option value="">{plant ? 'No storage location' : 'Choose a plant first'}</option>
                {locs.map((l) => <option key={l.storageLocation} value={l.storageLocation}>{l.storageLocation}{l.storageLocationText ? ` – ${l.storageLocationText}` : ''}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Sales area<span className="tech">VKORG / VTWEG</span></span>
              <select id="c-area" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">No sales area</option>
                {sc.areas.map((a) => <option key={areaKey(a)} value={areaKey(a)}>{areaText(a)}</option>)}
              </select>
            </label>
          </div>
        )}
        {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
        <div className="form-actions">
          <Link href="/master/material/data" className="btn btn-ghost">Cancel</Link>
          <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy || !sc.rows}>{busy ? 'Starting…' : 'Start change request'} <IconArrowRight size={15} /></button>
        </div>
      </section>
    </>
  );
}

type ExtType = 'P' | 'S' | 'V';
const TYPES: { id: ExtType; title: string; text: string }[] = [
  { id: 'P', title: 'New plant or storage location', text: 'Extend to a plant, or to another storage location of a plant' },
  { id: 'S', title: 'New sales area', text: 'Extend to a sales organization and distribution channel' },
  { id: 'V', title: 'New valuation type', text: 'Add a valuation type (split valuation) for a plant' },
];

/** ME: pick what the material is extended to, then start the extension request */
export function ExtensionStart({ matnr }: { matnr: string }) {
  const router = useRouter();
  const { notify, refreshInbox } = useMdm();
  const sc = useScope(matnr);
  const [type, setType] = useState<ExtType>('P');
  const [f, setF] = useState({ plant: '', storageLocation: '', salesOrg: '', distributionChannel: '', valuationType: '', sourcePlant: '', sourceArea: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!matnr) return <Missing />;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === 'plant' ? { storageLocation: '' } : {}), ...(k === 'salesOrg' ? { distributionChannel: '' } : {}) }));

  const ready = type === 'P' ? !!f.plant : type === 'S' ? !!f.salesOrg && !!f.distributionChannel : !!f.valuationType.trim() && !!f.plant;

  async function start() {
    setBusy(true); setError('');
    const src = sc.areas.find((x) => areaKey(x) === f.sourceArea);
    const body: ExtensionInput = {
      type, matnr,
      ...(type === 'P' ? { plant: f.plant, storageLocation: f.storageLocation, sourcePlant: f.sourcePlant } : {}),
      ...(type === 'S' ? { salesOrg: f.salesOrg, distributionChannel: f.distributionChannel, sourceSalesOrg: src?.salesOrg ?? '', sourceDistributionChannel: src?.distributionChannel ?? '' } : {}),
      ...(type === 'V' ? { plant: f.plant, valuationType: f.valuationType.trim() } : {}),
    };
    try {
      const r = await startExtension(body);
      notify('success', `Extension request ${r.header.transId} started`);
      void refreshInbox();
      router.push(requestHref(r.header.transId));
    } catch (e) { setError(e instanceof Error ? e.message : 'The extension request could not be started.'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header matnr={matnr} kind="ME" />
      <section className="card nr-card">
        <div className="section-head">
          <span className="section-num" aria-hidden><IconLayers size={15} /></span>
          <div className="section-head-text"><h3>Extend to</h3><p className="muted">The material already exists in: {sc.rows ? (`${sc.plants.map((p) => p.code).join(', ') || 'no plant'}; ${sc.areas.map(areaKey).join(', ') || 'no sales area'}`) : 'reading from SAP…'}</p></div>
        </div>
        {sc.error && <ErrorState message={sc.error} onRetry={sc.load} />}
        <div className="radio-cards" role="radiogroup" aria-label="Extension type">
          {TYPES.map((t) => (
            <label key={t.id} className={`radio-card ${type === t.id ? 'on' : ''}`}>
              <input type="radio" name="ext-type" checked={type === t.id} onChange={() => setType(t.id)} />
              <span><strong>{t.title}</strong><small>{t.text}</small></span>
            </label>
          ))}
        </div>

        <div className="scope-grid" style={{ marginTop: 14 }}>
          {(type === 'P' || type === 'V') && (
            <LiveVh id="e-plant" label={type === 'P' ? 'New plant' : 'Plant'} tech="WERKS" name="WERKS" value={f.plant} onChange={(v) => set('plant', v)} required />
          )}
          {type === 'P' && (
            <>
              <LiveVh id="e-sloc" label="New storage location" tech="LGORT" name="LGORT" params={{ werks: f.plant }} enabled={!!f.plant} disabledHint="Choose a plant first" value={f.storageLocation} onChange={(v) => set('storageLocation', v)} />
              <label className="field">
                <span className="field-label">Copy from plant<span className="tech">source</span></span>
                <select id="e-srcplant" value={f.sourcePlant} onChange={(e) => set('sourcePlant', e.target.value)}>
                  <option value="">Let SAP choose</option>
                  {sc.plants.map((p) => <option key={p.code} value={p.code}>{p.code}{p.text ? ` – ${p.text}` : ''}</option>)}
                </select>
              </label>
            </>
          )}
          {type === 'S' && (
            <>
              <LiveVh id="e-vkorg" label="New sales org" tech="VKORG" name="VKORG" value={f.salesOrg} onChange={(v) => set('salesOrg', v)} required />
              <LiveVh id="e-vtweg" label="New distribution channel" tech="VTWEG" name="VTWEG" params={{ vkorg: f.salesOrg }} enabled={!!f.salesOrg} disabledHint="Choose a sales org first" value={f.distributionChannel} onChange={(v) => set('distributionChannel', v)} required />
              <label className="field">
                <span className="field-label">Copy from sales area<span className="tech">source</span></span>
                <select id="e-srcarea" value={f.sourceArea} onChange={(e) => set('sourceArea', e.target.value)}>
                  <option value="">Let SAP choose</option>
                  {sc.areas.map((a) => <option key={areaKey(a)} value={areaKey(a)}>{areaText(a)}</option>)}
                </select>
              </label>
            </>
          )}
          {type === 'V' && (
            <label className="field">
              <span className="field-label">Valuation type<span className="req">*</span><span className="tech">BWTAR</span></span>
              <input id="e-bwtar" value={f.valuationType} maxLength={10} onChange={(e) => set('valuationType', e.target.value.toUpperCase())} spellCheck={false} autoComplete="off" />
            </label>
          )}
        </div>
        {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
        <div className="form-actions">
          <Link href="/master/material/data" className="btn btn-ghost">Cancel</Link>
          <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy || !ready}>{busy ? 'Starting…' : 'Start extension request'} <IconArrowRight size={15} /></button>
        </div>
      </section>
    </>
  );
}
