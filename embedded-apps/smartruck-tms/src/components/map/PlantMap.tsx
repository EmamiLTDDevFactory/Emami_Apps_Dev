'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { Download, RotateCcw, Search, AlertTriangle, MapPin } from 'lucide-react';
import { useTms } from '../../lib/store';
import { Card, Pill } from '../ui';
import { OVERRIDE_KEY, TYPES, typeColor, mergeOverrides, needsReview, filterPlants, states as stateList, countBy, toCsv, hasPoint, esc, sourceLabel, inIndia } from '../../lib/plantMap.js';

const BASE = '/apps/smartruck-tms';

interface Plant { code: string; name: string; type: string; city: string; state: string; pincode: string; lat: number | null; lon: number | null; source: string | null; confidence: string | null; note: string; edited?: boolean; original?: { lat: number; lon: number } | null }
interface Data { builtAt: string; plants: Plant[]; missing: string[]; counts: { plants: number; withCoordinates: number }; attribution?: string }
type Overrides = Record<string, { lat: number; lon: number }>;

const readOverrides = (): Overrides => { try { return JSON.parse(window.localStorage.getItem(OVERRIDE_KEY) || '{}') || {}; } catch { return {}; } };
const writeOverrides = (o: Overrides) => { try { window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); } catch { /* private window */ } };
const CONF_TONE: Record<string, string> = { high: 'green', medium: 'amber', low: 'red' };

export default function PlantMap() {
  const t = useTms();
  const canEdit = t.can('plan.admin');                         // Admin ('*') or plan.admin
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [overrides, setOverrides] = useState<Overrides>({});
  const [types, setTypes] = useState<string[]>([]);
  const [state, setState] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'review'>('all');
  const [selected, setSelected] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [tilesBlocked, setTilesBlocked] = useState(false);   // the OpenStreetMap background could not be loaded (network / proxy)

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markers = useRef<Record<string, Leaflet.Marker>>({});
  const LRef = useRef<typeof Leaflet | null>(null);
  const fitted = useRef(false);

  useEffect(() => { setOverrides(readOverrides()); }, []);
  useEffect(() => {
    let off = false;
    fetch(`${BASE}/plant-locations.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Data) => { if (!off) setData(d); }).catch((e) => { if (!off) setErr(`The plant locations could not be loaded (${e.message}).`); });
    return () => { off = true; };
  }, []);

  const plants: Plant[] = useMemo(() => (data ? mergeOverrides(data.plants, overrides) : []), [data, overrides]);
  const shown: Plant[] = useMemo(() => filterPlants(plants, { types, state, q, reviewOnly: view === 'review' }), [plants, types, state, q, view]);
  const reviewCount = useMemo(() => plants.filter(needsReview).length, [plants]);
  const typeCounts = useMemo(() => countBy(plants, 'type'), [plants]);
  const edited = useMemo(() => plants.filter((p) => p.edited).length, [plants]);

  // ---- the map itself: created once, Leaflet is browser-only so it is imported here, not at module level
  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true, minZoom: 4, maxZoom: 17 }).setView([22.5, 80], 5);
      let okTiles = 0, badTiles = 0;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
      tiles.on('tileload', () => { okTiles++; setTilesBlocked(false); });
      tiles.on('tileerror', () => { badTiles++; if (!okTiles && badTiles >= 4) setTilesBlocked(true); });
      tiles.addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 50);
      // the container can get its size after the first paint (sidebar, tab or window change): keep Leaflet in step with it
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.invalidateSize(); }); ro.observe(mapEl.current); }
    })();
    return () => { dead = true; if (ro) ro.disconnect(); if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layerRef.current = null; markers.current = {}; } };
  }, []);

  const popupHtml = useCallback((p: Plant) => `
    <div style="min-width:210px;font:12px/1.45 system-ui,sans-serif">
      <div style="font-weight:800;font-size:13px">${esc(p.code)} <span style="font-weight:600;color:#475569">${esc(p.type)}</span>${p.edited ? ' <span style="background:#ccfbf1;color:#0f766e;border-radius:8px;padding:0 6px;font-weight:700">edited</span>' : ''}</div>
      <div>${esc(p.name)}</div>
      <div style="color:#475569">${esc([p.city, p.state, p.pincode].filter(Boolean).join(' · '))}</div>
      <div style="margin-top:4px">${p.lat != null ? `${p.lat.toFixed(5)}, ${p.lon!.toFixed(5)}` : ''}</div>
      <div style="margin-top:4px;color:#475569">${esc(sourceLabel(p))}${p.confidence && !p.edited ? ` · ${esc(p.confidence)} confidence` : ''}</div>
      ${p.note && !p.edited ? `<div style="margin-top:4px;color:#92400e">${esc(p.note)}</div>` : ''}
      ${p.edited && p.original ? `<div style="margin-top:4px;color:#475569">Data file: ${p.original.lat.toFixed(5)}, ${p.original.lon.toFixed(5)}</div>` : ''}
    </div>`, []);

  // ---- markers follow the filtered list
  useEffect(() => {
    const L = LRef.current, layer = layerRef.current, map = mapRef.current;
    if (!mapReady || !L || !layer || !map) return;
    layer.clearLayers(); markers.current = {};
    const pts: [number, number][] = [];
    for (const p of shown) {
      if (!hasPoint(p)) continue;
      const review = needsReview(p), color = typeColor(p.type);
      const ring = p.edited ? '#0d9488' : review ? '#f59e0b' : '#ffffff';
      const icon = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
        html: `<span data-plant="${esc(p.code)}" style="display:block;width:18px;height:18px;border-radius:50%;background:${color};border:3px solid ${ring};box-shadow:0 0 0 1px rgba(15,23,42,.45)${review && !p.edited ? ';outline:2px dashed #f59e0b;outline-offset:1px' : ''}"></span>` });
      const m = L.marker([p.lat as number, p.lon as number], { icon, title: `${p.code} ${p.name}`, draggable: canEdit, keyboard: true, riseOnHover: true }).addTo(layer);
      m.bindPopup(popupHtml(p));
      m.on('click', () => setSelected(p.code));
      if (canEdit) {
        m.on('dragend', () => {
          const ll = m.getLatLng();
          if (!inIndia(ll.lat, ll.lng)) { m.setLatLng([p.lat as number, p.lon as number]); return; }
          setOverrides((cur) => { const next = { ...cur, [p.code]: { lat: Math.round(ll.lat * 1e5) / 1e5, lon: Math.round(ll.lng * 1e5) / 1e5 } }; writeOverrides(next); return next; });
        });
      }
      markers.current[p.code] = m; pts.push([p.lat as number, p.lon as number]);
    }
    if (pts.length && (!fitted.current || types.length || state || q || view === 'review')) { map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 }); fitted.current = true; }
  }, [mapReady, shown, canEdit, popupHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  const fly = (p: Plant) => {
    setSelected(p.code);
    const m = markers.current[p.code], map = mapRef.current;
    if (m && map) { map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 11), { duration: 0.6 }); setTimeout(() => m.openPopup(), 650); }
  };
  const resetEdits = () => { if (!edited || !window.confirm(`Reset ${edited} edited location(s) to the data file?`)) return; writeOverrides({}); setOverrides({}); };
  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(plants)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `plant-locations-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const toggleType = (id: string) => setTypes((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (err) return <Card><p className="text-sm text-red" role="alert">{err}</p></Card>;
  const states = data ? stateList(plants) : [];

  return (
    <div className="space-y-3" data-testid="plant-map">
      <div className="flex flex-wrap items-center gap-2">
        {TYPES.filter((x) => typeCounts[x.id]).map((x) => {
          const on = types.includes(x.id);
          return <button key={x.id} onClick={() => toggleType(x.id)} aria-pressed={on} data-testid={`type-${x.id}`} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${on ? 'border-rust bg-rust/10 text-rust' : 'border-border text-inkSoft'}`}>
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: x.color }} />{x.label}<span className="font-semibold opacity-70">{typeCounts[x.id]}</span></button>;
        })}
        <select className="input !w-auto !py-1.5 text-xs font-bold" value={state} onChange={(e) => setState(e.target.value)} aria-label="State" data-testid="state-filter">
          <option value="">All states</option>{states.map((s: string) => <option key={s}>{s}</option>)}
        </select>
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
          <input className="input !w-56 !py-1.5 !pl-8 text-xs" placeholder="Search code, name, city, PIN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search plants" data-testid="plant-search" />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && edited > 0 && <button className="btn-ghost !py-1.5 !text-xs" onClick={resetEdits} data-testid="reset-edits"><RotateCcw size={13} /> Reset {edited} edit{edited === 1 ? '' : 's'}</button>}
          <button className="btn-ghost !py-1.5 !text-xs" onClick={exportCsv} disabled={!data} data-testid="export-csv"><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <Card pad={false} className="order-2 lg:order-1">
          <div className="flex items-center gap-1 border-b border-border p-2">
            <button onClick={() => setView('all')} data-testid="view-all" className={`rounded-lg px-3 py-1 text-xs font-bold ${view === 'all' ? 'bg-rust/10 text-rust' : 'text-inkSoft'}`}>All ({plants.length})</button>
            <button onClick={() => setView('review')} data-testid="view-review" className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold ${view === 'review' ? 'bg-amberBg text-amber' : 'text-inkSoft'}`}><AlertTriangle size={12} /> Needs review ({reviewCount})</button>
            <span className="hint ml-auto pr-1" data-testid="shown-count">{shown.length} shown</span>
          </div>
          <ul className="max-h-[62vh] divide-y divide-border overflow-y-auto" data-testid="plant-list">
            {!data && <li className="p-4 text-sm text-inkSoft">Loading…</li>}
            {data && !shown.length && <li className="p-4 text-sm text-inkSoft">No plant matches the filters.</li>}
            {shown.map((p) => (
              <li key={p.code}>
                <button onClick={() => (hasPoint(p) ? fly(p) : setSelected(p.code))} className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-appBg ${selected === p.code ? 'bg-rust/5' : ''}`} data-testid={`row-${p.code}`}>
                  <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: typeColor(p.type), opacity: hasPoint(p) ? 1 : 0.35 }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink">{p.code}<span className="truncate text-xs font-semibold text-inkSoft">{p.name}</span></span>
                    <span className="block truncate text-xs text-inkSoft">{[p.city, p.state, p.pincode].filter(Boolean).join(' · ') || 'No address in SAP'}</span>
                    {(needsReview(p) || p.edited) && <span className="mt-0.5 block text-[11px] text-amber">{p.edited ? 'Edited by an admin' : p.note || 'No position found'}</span>}
                  </span>
                  <span className="shrink-0">{p.edited ? <Pill tone="teal">edited</Pill> : !hasPoint(p) ? <Pill tone="red">no position</Pill> : p.confidence && p.confidence !== 'high' ? <Pill tone={CONF_TONE[p.confidence] ?? 'gray'}>{p.confidence}</Pill> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="relative order-1 overflow-hidden rounded-2xl border border-border lg:order-2">
          <div ref={mapEl} className="h-[62vh] min-h-[420px] w-full bg-[#e8eef5]" role="region" aria-label="Plant locations map" data-testid="map-canvas" />
          {tilesBlocked && <div className="absolute left-3 right-3 top-3 z-[1000] rounded-xl border border-amber bg-amber/10 p-2.5 text-xs font-bold text-ink shadow" data-testid="tiles-blocked">The map background (OpenStreetMap tiles) cannot be loaded from this network. The plants are still plotted below; ask IT to allow <span className="font-extrabold">tile.openstreetmap.org</span> to see the street map.</div>}
          <div className="absolute bottom-3 left-3 z-[1000] rounded-xl border border-border bg-white/95 p-2.5 text-xs shadow">
            <div className="mb-1 font-extrabold text-ink">Legend</div>
            {TYPES.filter((x) => typeCounts[x.id]).map((x) => <div key={x.id} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: x.color }} />{x.label}</div>)}
            <div className="mt-1 flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-amber" />Needs review</div>
            {canEdit && <div className="mt-1 flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-teal" />Edited</div>}
          </div>
          {data && <div className="absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-xl border border-border bg-white/95 px-2.5 py-1.5 text-xs font-bold text-ink shadow" data-testid="marker-count"><MapPin size={13} />{shown.filter(hasPoint).length} on map</div>}
        </div>
      </div>
      {data && (
        <p className="hint">
          {data.counts.withCoordinates} of {data.counts.plants} SAP plants have a position{data.missing.length ? ` (${data.missing.join(', ')} have no usable address)` : ''}. Positions come from the Distribution Planning tool and from PIN-code lookups ({data.attribution || 'OpenStreetMap'}); amber ones need a check by eye.
          {canEdit ? ' Admins can drag a marker to correct it; corrections are kept in this browser for now.' : ''}
        </p>
      )}
    </div>
  );
}
