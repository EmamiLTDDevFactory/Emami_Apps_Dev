'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PackResult } from '../lib/packer';

export const TYPE_COLORS = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#00a3a3', '#c9a227', '#6c7a89'];
type View = 'iso' | 'side' | 'top' | 'door';

/** Interactive 3D truck: cartons run in one by one (door end -> their place), unused space can be shown in red. Orbit with the mouse. */
export default function TruckViewer({ result, colorOf, autoPlay }: { result: PackResult; colorOf: (typeId: string) => string; autoPlay: number }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPos: (n: number) => void; view: (v: View) => void; free: (on: boolean) => void } | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);        // cartons per second
  const [showFree, setShowFree] = useState(true);
  const posRef = useRef(0), playRef = useRef(true), speedRef = useRef(60);
  const total = result.cartons.length;
  playRef.current = playing; speedRef.current = speed;

  useEffect(() => {
    const el = host.current; if (!el) return;
    const T = result.truck, S = 0.01;                       // cm -> m
    const L = T.lengthCm * S, W = T.widthCm * S, H = T.heightCm * S;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4f5f7');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.target.set(L / 2, H / 3, W / 2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(L, H * 3, W * 2); scene.add(sun);
    // truck coords (x along, y across, z up) -> three (x, z, y)
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x * S, z * S, y * S);
    const disposables: { dispose: () => void }[] = [];
    const add = <T extends THREE.Object3D>(o: T) => { scene.add(o); return o; };

    // truck shell: floor grid, translucent walls, outline, cab block at the front (x = 0)
    const grid = add(new THREE.GridHelper(Math.max(L, W) * 1.6, Math.round(Math.max(L, W) * 1.6 / 0.5), 0xb8bec8, 0xdadee4)); grid.position.set(L / 2, -0.002, W / 2);
    const shellGeo = new THREE.BoxGeometry(L, H, W); disposables.push(shellGeo);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }); disposables.push(shellMat);
    const shell = add(new THREE.Mesh(shellGeo, shellMat)); shell.position.set(L / 2, H / 2, W / 2);
    const edges = new THREE.EdgesGeometry(shellGeo); disposables.push(edges);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x1f3b63 }); disposables.push(lineMat);
    const outline = add(new THREE.LineSegments(edges, lineMat)); outline.position.copy(shell.position);
    const cabGeo = new THREE.BoxGeometry(1.5, H * 0.75, W * 0.95); disposables.push(cabGeo);
    const cabMat = new THREE.MeshLambertMaterial({ color: 0x5b6470 }); disposables.push(cabMat);
    const cab = add(new THREE.Mesh(cabGeo, cabMat)); cab.position.set(-0.75 - 0.02, H * 0.375, W / 2);

    // cartons: one InstancedMesh per type, filled in loading order so "count" = how many have entered
    const typeIds = [...new Set(result.cartons.map((c) => c.typeId))];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1); disposables.push(boxGeo);
    const meshes = new Map<string, THREE.InstancedMesh>(), seqs = new Map<string, number[]>();
    const slot = new Map<number, { type: string; i: number }>();
    for (const id of typeIds) {
      const cs = result.cartons.filter((c) => c.typeId === id);
      const mat = new THREE.MeshLambertMaterial({ color: colorOf(id) }); disposables.push(mat);
      const m = new THREE.InstancedMesh(boxGeo, mat, cs.length); m.count = 0; m.frustumCulled = false;
      const list: number[] = [];
      cs.forEach((c, i) => { list.push(c.seq); slot.set(c.seq, { type: id, i }); });
      meshes.set(id, m); seqs.set(id, list); scene.add(m);
    }
    const dummy = new THREE.Object3D(); const GAP = 0.97;
    const place = (seq: number, slideX = 0) => {
      const c = result.cartons[seq], s = slot.get(seq)!, m = meshes.get(s.type)!;
      const p = P(c.x + c.l / 2 + slideX, c.y + c.w / 2, c.z + c.h / 2);
      dummy.position.copy(p); dummy.scale.set(c.l * S * GAP, c.h * S * GAP, c.w * S * GAP); dummy.updateMatrix();
      m.setMatrixAt(s.i, dummy.matrix);
    };
    for (let i = 0; i < result.cartons.length; i++) place(i);
    for (const m of meshes.values()) m.instanceMatrix.needsUpdate = true;

    // block outlines (appear once the whole block is in) show the row / layer pattern
    const blockEnd: number[] = []; let acc = 0;
    const blockLines: THREE.LineSegments[] = [];
    const blockMat = new THREE.LineBasicMaterial({ color: 0x0d1b2a, transparent: true, opacity: 0.55 }); disposables.push(blockMat);
    for (const b of result.blocks) {
      acc += b.count; blockEnd.push(acc);
      const g = new THREE.BoxGeometry(b.nx * b.a * S, b.nz * b.c * S, b.ny * b.b * S); disposables.push(g);
      const eg = new THREE.EdgesGeometry(g); disposables.push(eg);
      const ls = new THREE.LineSegments(eg, blockMat);
      ls.position.copy(P(b.x + (b.nx * b.a) / 2, b.y + (b.ny * b.b) / 2, b.z + (b.nz * b.c) / 2)); ls.visible = false;
      scene.add(ls); blockLines.push(ls);
    }
    // unused space: translucent red boxes (only pockets that matter)
    const freeGroup = new THREE.Group(); scene.add(freeGroup);
    const fMat = new THREE.MeshBasicMaterial({ color: 0xe0443e, transparent: true, opacity: 0.16, depthWrite: false }); disposables.push(fMat);
    const fLine = new THREE.LineBasicMaterial({ color: 0xe0443e, transparent: true, opacity: 0.55 }); disposables.push(fLine);
    for (const f of result.free) {
      if ((f.dx * f.dy * f.dz) / 1e6 < 0.03) continue;
      const g = new THREE.BoxGeometry(f.dx * S, f.dz * S, f.dy * S); disposables.push(g);
      const eg = new THREE.EdgesGeometry(g); disposables.push(eg);
      const mesh = new THREE.Mesh(g, fMat), ls = new THREE.LineSegments(eg, fLine);
      const c = P(f.x + f.dx / 2, f.y + f.dy / 2, f.z + f.dz / 2); mesh.position.copy(c); ls.position.copy(c);
      freeGroup.add(mesh, ls);
    }
    freeGroup.visible = false;

    const applyPos = (p: number) => {
      const n = Math.floor(p);
      for (const [id, m] of meshes) { const list = seqs.get(id)!; let c = 0; while (c < list.length && list[c] < n) c++; m.count = c; }
      blockLines.forEach((ls, i) => { ls.visible = blockEnd[i] <= n; });
    };
    const flyIn = (p: number) => {                          // the newest cartons slide in from the door end into their place
      const n = Math.floor(p), window_ = 4;
      for (let s = Math.max(0, n - window_); s < Math.min(total, n + 1); s++) {
        const c = result.cartons[s], age = Math.min(1, Math.max(0, (p - s) / window_));
        const ease = 1 - Math.pow(1 - age, 3);
        place(s, (1 - ease) * (T.lengthCm + 120 - c.x));
        meshes.get(slot.get(s)!.type)!.instanceMatrix.needsUpdate = true;
      }
    };
    let freeOn = true;
    const setView = (v: View) => {
      const d = Math.max(L, W, H);
      const tg = new THREE.Vector3(L / 2, H / 3, W / 2); controls.target.copy(tg);
      if (v === 'iso') camera.position.set(L * 0.5 + d * 0.9, H * 1.5 + d * 0.35, W * 0.5 + d * 1.1);
      if (v === 'side') camera.position.set(L / 2, H / 2, W / 2 + d * 1.6);
      if (v === 'top') camera.position.set(L / 2, d * 1.7, W / 2 + 0.001);
      if (v === 'door') camera.position.set(L + d * 1.5, H / 2, W / 2);
      camera.lookAt(tg); controls.update();
    };
    setView('iso');
    api.current = {
      setPos: (n) => { posRef.current = n; applyPos(n); for (let s = 0; s < total; s++) place(s); for (const m of meshes.values()) m.instanceMatrix.needsUpdate = true; freeGroup.visible = freeOn && n >= total; },
      view: setView, free: (on) => { freeOn = on; freeGroup.visible = on && Math.floor(posRef.current) >= total; },
    };
    posRef.current = autoPlay ? 0 : total; applyPos(posRef.current); setPos(posRef.current);

    const resize = () => { const w = el.clientWidth, h = Math.max(260, el.clientHeight); renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = `${h}px`; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0, last = performance.now(), lastShown = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playRef.current && posRef.current < total) {
        posRef.current = Math.min(total, posRef.current + speedRef.current * dt);
        applyPos(posRef.current); flyIn(posRef.current);
        if (posRef.current >= total) { for (let s = Math.max(0, total - 6); s < total; s++) place(s); for (const m of meshes.values()) m.instanceMatrix.needsUpdate = true; setPlaying(false); }
      }
      freeGroup.visible = freeOn && Math.floor(posRef.current) >= total;
      const shown = Math.floor(posRef.current); if (shown !== lastShown) { lastShown = shown; setPos(shown); }
      controls.update(); renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setPlaying(!!autoPlay && total > 0);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      for (const d of disposables) d.dispose();
      for (const m of meshes.values()) m.dispose();
      renderer.dispose(); el.removeChild(renderer.domElement); api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, autoPlay]);

  const done = pos >= total;
  const Btn = ({ children, onClick, on }: { children: React.ReactNode; onClick: () => void; on?: boolean }) => <button onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-bold ${on ? 'border-rust bg-rust/10 text-rust' : 'border-border bg-white text-ink'}`}>{children}</button>;
  return (
    <div className="space-y-2">
      <div ref={host} className="w-full overflow-hidden rounded-lg border border-border" style={{ height: 460 }} />
      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => { if (done) { api.current?.setPos(0); } setPlaying((p) => !p || done); }}>{done ? 'Replay' : playing ? 'Pause' : 'Play'}</Btn>
        <input type="range" className="min-w-[160px] flex-1" min={0} max={total} value={Math.floor(pos)} onChange={(e) => { setPlaying(false); const n = Number(e.target.value); api.current?.setPos(n); setPos(n); }} />
        <span className="w-28 text-right text-xs font-bold tabular-nums">{Math.floor(pos)} / {total} cartons</span>
        <label className="flex items-center gap-1 text-xs">Speed <select className="input !py-0.5 !text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={15}>Slow</option><option value={60}>Normal</option><option value={200}>Fast</option><option value={800}>Very fast</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-inkSoft">View</span>
        <Btn onClick={() => api.current?.view('iso')}>3D</Btn><Btn onClick={() => api.current?.view('side')}>Side</Btn><Btn onClick={() => api.current?.view('top')}>Top</Btn><Btn onClick={() => api.current?.view('door')}>Door end</Btn>
        <label className="ml-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={showFree} onChange={(e) => { setShowFree(e.target.checked); api.current?.free(e.target.checked); }} /> Highlight unused space (red) when loading is complete</label>
        <span className="hint ml-auto">Drag to rotate, scroll to zoom. Cab is on the left, the door on the right.</span>
      </div>
    </div>
  );
}
