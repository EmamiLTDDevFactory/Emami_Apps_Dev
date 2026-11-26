'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildDemoDb, iso, NOW } from './demo';
import { ApiError, isLiveMode, liveApi, type Me } from './liveApi';
import { ROLE_PERMS, type AppUser, type Db, type InvStatus, type Order, type Shipment, type ShipStatus, type Bid } from './types';

const KEY = 'smartruck_tms_demo_db_v1';
const FLOW: ShipStatus[] = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'];

interface Ctx {
  db: Db; me: AppUser; unitId: string; setUnitId: (u: string) => void; setMe: (id: string) => void; allUnits: boolean; setAllUnits: (v: boolean) => void;
  now: number; can: (perm: string) => boolean; scoped: <T extends { unitId: string }>(rows: T[]) => T[]; toast: (msg: string, kind?: 'ok' | 'err') => void;
  toasts: { id: number; msg: string; kind: 'ok' | 'err' }[];
  mode: 'demo' | 'live'; modeKnown: boolean; liveState: { ready: boolean; error: string; integrations?: Me['integrations'] };
  createOrder: (o: Omit<Order, 'id' | 'oin' | 'createdAt' | 'createdBy' | 'status' | 'remarks'>) => Promise<string>;
  /** Live only (demo answers locally): SAP posting of an approved invoice, payment sync, master sync, PO/SO check, e-way bill, reports, import. */
  postSap: (invoiceId: string) => Promise<void>;
  syncPayments: () => Promise<void>; syncMasters: () => Promise<void>;
  checkPoSo: (po: string, so: string) => Promise<{ valid: boolean; message: string; simulated?: boolean }>;
  ewayCheck: (sin: string) => Promise<{ status?: string; validUpto?: string; simulated?: boolean }>;
  catalog: () => Promise<Record<string, string[]> | null>;
  report: (name: string) => Promise<Record<string, string | number>[] | null>;
  importData: (payload: unknown, dryRun: boolean) => Promise<{ ok: boolean; errors?: string[]; counts: Record<string, number> }>;
  /** Outward tracking command (live only). Resolves to the server result, or undefined after showing the server's message. */
  cmd: <R = Record<string, unknown>>(c: Record<string, unknown>) => Promise<R | undefined>;
  orderAction: (id: string, a: 'cancel' | 'delete' | 'duplicate' | 'rebook' | 'toBid', remark?: string) => void;
  addRemark: (id: string, text: string) => void;
  allocate: (orderId: string, carrierId: string, price?: number) => void;
  assign: (sin: string, vehicleNo: string, driver: string, phone: string) => void;
  advance: (sin: string) => void;
  patchShipment: (sin: string, patch: Partial<Shipment>, logText: string) => void;
  cancelShipment: (sin: string) => void;
  placeBid: (orderId: string, carrierId: string, price: number) => void;
  awardBid: (orderId: string, carrierId: string) => void;
  setInvoice: (id: string, st: InvStatus) => void;
  bulkInvoice: (ids: string[], st: InvStatus) => void;
  addVoucher: (carrierId: string, amount: number) => void;
  addNote: (kind: 'Debit' | 'Credit', carrierId: string, amount: number, reason: string, sin: string) => void;
  patchCarrier: (id: string, patch: Partial<Db['carriers'][number]>) => void;
  addCarrier: (name: string) => void;
  addCustomer: (name: string, zone: string, contact: string) => void;
  saveUser: (u: AppUser) => void;
  markRead: () => void;
  resetDemo: () => void;
}

const C = createContext<Ctx | null>(null);
export const useTms = () => { const c = useContext(C); if (!c) throw new Error('useTms outside provider'); return c; };

function load(): Db {
  try { const raw = window.localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Db; } catch { /* ignore */ }
  return buildDemoDb();
}

export function TmsProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Db>(() => buildDemoDb());
  const [ready, setReady] = useState(false);
  const [meId, setMeId] = useState('U1');
  const [allUnits, setAllUnits] = useState(false);
  const [unitId, setUnitId] = useState('UN13');
  const [offset, setOffset] = useState(0);
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);
  const tid = useRef(0);
  // Mode is resolved after mount so the static prerender and the first client render agree (no hydration mismatch).
  const [live, setLive] = useState(false);
  const [modeKnown, setModeKnown] = useState(false);
  useEffect(() => { setLive(isLiveMode()); setModeKnown(true); }, []);
  const [liveMe, setLiveMe] = useState<Me | null>(null);
  const [liveErr, setLiveErr] = useState('');
  const [liveReady, setLiveReady] = useState(false);
  const inflight = useRef(0);
  const held = useRef<string[]>([]);

  useEffect(() => {
    if (live || !modeKnown) return;
    setDb(load()); try { const m = window.localStorage.getItem(KEY + '_me'); if (m) setMeId(m); } catch { /* ignore */ } setReady(true);
  }, [live, modeKnown]);
  useEffect(() => { if (!ready || live) return; try { window.localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }, [db, ready, live]);

  // Live: who am I, then the data; refreshed every 5 s (tracking and auctions move on the server) and whenever the scope changes.
  const loadLive = useCallback(async (all: boolean) => {
    try {
      const [m, d] = await Promise.all([liveApi.me(), liveApi.db(all)]);
      setLiveMe(m); setDb(d.db); setMeId(m.user.id); setLiveErr(''); setLiveReady(true);
      if (!m.user.units.includes(unitId) && m.user.units[0]) setUnitId(m.user.units[0]);
    } catch (e) { setLiveErr(e instanceof ApiError ? e.message : 'Could not load Trip Trail.'); setLiveReady(true); }
  }, [unitId]);
  useEffect(() => { if (!live) return; loadLive(allUnits); const t = setInterval(() => { if (inflight.current === 0) liveApi.db(allUnits).then((d) => setDb(d.db)).catch(() => null); }, 5000); return () => clearInterval(t); }, [live, allUnits]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = live && liveMe ? liveMe.user : (db.users.find((u) => u.id === meId) ?? db.users[0]);
  const now = live ? Date.now() : NOW + offset;

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    if (live && kind === 'ok' && inflight.current > 0) { held.current.push(msg); return; }
    const id = ++tid.current; setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, [live]);

  const can = useCallback((perm: string) => (live && liveMe ? liveMe.perms.includes('*') || liveMe.perms.includes(perm) : me.roles.some((r) => r === 'Admin' || ROLE_PERMS[r]?.perms.some((p) => p.key === perm || p.key === '*'))), [me, live, liveMe]);
  const scoped = useCallback(<T extends { unitId: string }>(rows: T[]) => (allUnits ? rows.filter((r) => me.units.includes(r.unitId)) : rows.filter((r) => r.unitId === unitId)), [allUnits, me, unitId]);

  // Simulation clock: every 2.5s moves in-transit vehicles and now and then a vendor bids on an open auction.
  useEffect(() => {
    if (!ready || live) return;
    const t = setInterval(() => {
      setOffset((o) => o + 60_000);
      setDb((d) => {
        const shipments = d.shipments.map((s) => s.status === 'In Transit' && s.tracking !== 'No GPS' ? { ...s, progress: Math.min(0.97, s.progress + 0.004) } : s);
        let orders = d.orders; let notifications = d.notifications;
        const open = d.orders.filter((o) => o.bid?.status === 'Open');
        if (open.length && Math.random() < 0.18) {
          const o = open[Math.floor(Math.random() * open.length)]; const b = o.bid!;
          const last = b.bids.length ? Math.min(...b.bids.map((x) => x.price)) : b.startPrice;
          const step = b.diffType === 'Percentage' ? last * (b.diffValue / 100) : b.diffValue;
          const price = Math.round(last - step * (1 + Math.random() * 2));
          const free = b.vendors[Math.floor(Math.random() * b.vendors.length)];
          orders = d.orders.map((x) => x.id === o.id ? { ...x, bid: { ...b, bids: [...b.bids, { carrierId: free, price, at: iso(NOW + offset) }] } } : x);
          notifications = [{ id: `N${Date.now()}`, at: iso(NOW + offset), level: 'info' as const, text: `New bid ₹${price.toLocaleString('en-IN')} on ${o.id}`, read: false }, ...notifications].slice(0, 30);
        }
        return { ...d, shipments, orders, notifications };
      });
    }, 2500);
    return () => clearInterval(t);
  }, [ready, offset, live]);

  const act = (d: Db) => `${me.name}`;
  const mut = (fn: (d: Db) => Db) => setDb((d) => fn(d));
  const logTo = (s: Shipment, text: string, actor: string): Shipment => ({ ...s, log: [...s.log, { at: iso(now), actor, text }] });

  const mkShipments = (d: Db, o: Order, carrierId: string, price: number): { shipments: Shipment[]; seq: number } => {
    let seq = d.seq; const out: Shipment[] = [];
    const [p, dl] = [o.stops.find((s) => s.type === 'P')!, o.stops.filter((s) => s.type === 'D').slice(-1)[0]];
    const a = d.locs.find((l) => l.id === p.locId)!; const b = d.locs.find((l) => l.id === dl.locId)!;
    const km = Math.round(Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 100) * 1.28);
    for (let v = 0; v < o.vehicles; v++) {
      seq++;
      out.push({
        sin: `SIN${seq}${v + 1}`, orderId: o.id, unitId: o.unitId, type: 'Primary', direction: 'Outbound', status: 'Accepted', carrierId, vehicleNo: '—', vehicleType: o.vehicleType, driver: '—', phone: '—',
        provider: 'Jio', consent: 'Pending', tracking: 'No GPS', ePod: 'Pending', freight: price, fromLocId: p.locId, toLocId: dl.locId, pickupAt: p.at, progress: 0, delayH: 0, lr: '', km,
        ewayExpiry: iso(new Date(p.at).getTime() + Math.max(24, km / 40 + 12) * 3600_000), material: o.material, qty: o.qty, customerId: o.customerId,
        log: [{ at: iso(now), actor: me.name, text: 'Shipment created by allocation' }, { at: iso(now), actor: 'Carrier Admin', text: 'Carrier accepted shipment' }],
      });
    }
    return { shipments: out, seq };
  };

  const value: Ctx = {
    mode: 'demo', modeKnown, liveState: { ready: true, error: '' },
    postSap: async (invoiceId) => { value.setInvoice(invoiceId, 'Billed'); },
    syncPayments: async () => undefined, syncMasters: async () => undefined,
    checkPoSo: async () => ({ valid: true, simulated: true, message: 'Demo mode - PO / SO not verified in SAP.' }),
    ewayCheck: async () => ({ simulated: true, status: 'ACTIVE' }),
    catalog: async () => null, report: async () => null,
    importData: async () => ({ ok: false, errors: ['Import is available in live mode only.'], counts: {} }),
    cmd: async () => { toast('Outward tracking needs the live server. Open this app with ?mode=live.', 'err'); return undefined; },
    db, me, unitId, setUnitId, setMe: (id) => { setMeId(id); try { window.localStorage.setItem(KEY + '_me', id); } catch { /* ignore */ } }, allUnits, setAllUnits, now, can, scoped, toast, toasts,
    createOrder: async (o) => {
      let id = '';
      mut((d) => {
        const seq = d.seq + 1; id = `ORD${seq}`;
        const bid = o.bid ? { ...o.bid, status: 'Open' as const, bids: [] } : undefined;
        return { ...d, seq, orders: [{ ...o, bid, id, oin: `OIN-${o.unitId}-${seq}`, createdAt: iso(now), createdBy: me.name, status: 'Open', remarks: [] }, ...d.orders],
          notifications: o.mode === 'BID' ? [{ id: `N${Date.now()}`, at: iso(now), level: 'info', text: `Bid order ${id} posted — ${o.bid?.vendors.length ?? 0} vendors invited by email/SMS`, read: false }, ...d.notifications] : d.notifications };
      });
      return id;
    },
    orderAction: (id, a, remark) => mut((d) => {
      const o = d.orders.find((x) => x.id === id); if (!o) return d;
      if (a === 'delete') return { ...d, orders: d.orders.filter((x) => x.id !== id) };
      if (a === 'cancel') return { ...d, orders: d.orders.map((x) => x.id === id ? { ...x, status: 'Cancelled', remarks: [...x.remarks, `Cancelled by ${me.name}${remark ? `: ${remark}` : ''}`] } : x), shipments: d.shipments.map((s) => s.orderId === id && s.status !== 'Completed' ? logTo({ ...s, status: 'Cancelled' }, 'Order cancelled', me.name) : s) };
      if (a === 'toBid') return { ...d, orders: d.orders.map((x) => x.id === id ? { ...x, mode: 'BID', bid: { startPrice: 25000, expiresAt: iso(now + 4 * 3600_000), diffType: 'Percentage', diffValue: 1, paymentTerms: 'Net 30', vendors: d.carriers.filter((c) => !c.blocked).map((c) => c.id), bids: [], status: 'Open' } } : x) };
      const seq = d.seq + 1;
      return { ...d, seq, orders: [{ ...o, id: `ORD${seq}`, oin: `OIN-${o.unitId}-${seq}`, createdAt: iso(now), createdBy: me.name, status: 'Open', remarks: [a === 'rebook' ? `Re-booked from ${o.id}` : `Duplicate of ${o.id}`], bid: undefined, mode: 'FTL' }, ...d.orders], };
    }),
    addRemark: (id, text) => mut((d) => ({ ...d, orders: d.orders.map((o) => o.id === id ? { ...o, remarks: [...o.remarks, `${me.name}: ${text}`] } : o) })),
    allocate: (orderId, carrierId, price) => mut((d) => {
      const o = d.orders.find((x) => x.id === orderId); if (!o) return d;
      const c = d.carriers.find((x) => x.id === carrierId)!;
      const { shipments, seq } = mkShipments(d, o, carrierId, price ?? 28000);
      return { ...d, seq, shipments: [...shipments, ...d.shipments], orders: d.orders.map((x) => x.id === orderId ? { ...x, status: 'Active', remarks: [...x.remarks, `Allocated to ${c.name} by ${me.name}`] } : x) };
    }),
    assign: (sin, vehicleNo, driver, phone) => mut((d) => ({ ...d, shipments: d.shipments.map((s) => s.sin === sin ? logTo({ ...s, status: 'Assigned', vehicleNo, driver, phone, lr: s.lr || `LR${770000 + Math.floor(Math.random() * 9999)}`, consent: 'Pending' }, `Vehicle ${vehicleNo} and driver ${driver} assigned; SIM consent SMS sent`, me.name) : s) })),
    advance: (sin) => mut((d) => ({ ...d, shipments: d.shipments.map((s) => {
      if (s.sin !== sin) return s; const i = FLOW.indexOf(s.status); if (i < 0 || i >= FLOW.length - 1) return s; const next = FLOW[i + 1];
      const n = { ...s, status: next, progress: next === 'In Transit' ? 0.05 : next === 'At Delivery' || next === 'Completed' ? 1 : s.progress, tracking: s.consent === 'Granted' && s.tracking === 'No GPS' ? 'Active' as const : s.tracking };
      return logTo(n, `Status moved to ${next}`, me.name);
    }) })),
    patchShipment: (sin, patch, text) => mut((d) => ({ ...d, shipments: d.shipments.map((s) => s.sin === sin ? logTo({ ...s, ...patch }, text, me.name) : s) })),
    cancelShipment: (sin) => mut((d) => ({ ...d, shipments: d.shipments.map((s) => s.sin === sin ? logTo({ ...s, status: 'Cancelled' }, 'Shipment cancelled', me.name) : s) })),
    placeBid: (orderId, carrierId, price) => mut((d) => ({ ...d, orders: d.orders.map((o) => o.id === orderId && o.bid ? { ...o, bid: { ...o.bid, bids: [...o.bid.bids, { carrierId, price, at: iso(now) }] } as Bid } : o) })),
    awardBid: (orderId, carrierId) => mut((d) => {
      const o = d.orders.find((x) => x.id === orderId); if (!o?.bid) return d;
      const price = Math.min(...o.bid.bids.filter((b) => b.carrierId === carrierId).map((b) => b.price));
      const { shipments, seq } = mkShipments(d, o, carrierId, price);
      return { ...d, seq, shipments: [...shipments, ...d.shipments], orders: d.orders.map((x) => x.id === orderId ? { ...x, status: 'Active', bid: { ...x.bid!, status: 'Awarded', winner: carrierId, awardedPrice: price }, remarks: [...x.remarks, `Bid awarded to ${d.carriers.find((c) => c.id === carrierId)?.name} at ₹${price} by ${me.name}; converted to order`] } : x) };
    }),
    setInvoice: (id, st) => mut((d) => ({ ...d, invoices: d.invoices.map((i) => i.id === id ? { ...i, status: st, sapDoc: st === 'Billed' && !i.sapDoc ? `190${5000000 + Math.floor(Math.random() * 99999)}` : i.sapDoc, history: [...i.history, { at: iso(now), actor: me.name, text: `Status → ${st}${st === 'Billed' ? ' (posted to SAP FI)' : ''}` }] } : i) })),
    bulkInvoice: (ids, st) => mut((d) => ({ ...d, invoices: d.invoices.map((i) => ids.includes(i.id) ? { ...i, status: st, sapDoc: st === 'Billed' && !i.sapDoc ? `190${5000000 + Math.floor(Math.random() * 99999)}` : i.sapDoc, history: [...i.history, { at: iso(now), actor: me.name, text: `Status → ${st} (bulk)` }] } : i) })),
    addVoucher: (carrierId, amount) => mut((d) => ({ ...d, vouchers: [{ id: `PV-${1001 + d.vouchers.length}`, carrierId, amount, status: 'Draft', date: iso(now), invoices: [] }, ...d.vouchers] })),
    addNote: (kind, carrierId, amount, reason, sin) => mut((d) => ({ ...d, notes: [{ id: `${kind === 'Debit' ? 'DN' : 'CN'}-${500 + d.notes.length}`, kind, carrierId, amount, reason, date: iso(now), sin }, ...d.notes] })),
    patchCarrier: (id, patch) => mut((d) => ({ ...d, carriers: d.carriers.map((c) => c.id === id ? { ...c, ...patch } : c) })),
    addCarrier: (name) => mut((d) => ({ ...d, carriers: [...d.carriers, { id: `C${String(d.carriers.length + 1).padStart(3, '0')}`, name, code: `V${100900 + d.carriers.length}`, type: 'Broker', shortName: name.split(' ')[0].toUpperCase(), paymentTerms: 'Net 30', weightage: 0, blocked: false, rating: 4, fleet: 0, lanes: [], rejectionPct: 0, fulfilledPct: 100 }] })),
    addCustomer: (name, zone, contact) => mut((d) => ({ ...d, customers: [...d.customers, { id: `K${d.customers.length + 1}`, name, rCode: `R${40500 + d.customers.length}`, zone, contact, csl: me.name, segment: 'General Trade' }] })),
    saveUser: (u) => mut((d) => ({ ...d, users: d.users.some((x) => x.id === u.id) ? d.users.map((x) => x.id === u.id ? u : x) : [...d.users, u] })),
    markRead: () => mut((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) })),
    resetDemo: () => { setDb(buildDemoDb()); setOffset(0); },
  };
  void act;

  // ---- live mode: the same interface, every change is a command the server validates (RBAC, unit scope, rules) and returns the new data
  const run = async <R,>(c: Record<string, unknown>): Promise<R | undefined> => {
    inflight.current++;
    try {
      const r = await liveApi.cmd<R>({ ...c, allUnits });
      setDb(r.db);
      const msgs = held.current; held.current = []; inflight.current--;
      msgs.forEach((m) => toast(m));
      return r.result;
    } catch (e) {
      held.current = []; inflight.current--;
      toast(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.', 'err');
      return undefined;
    }
  };
  const liveValue: Ctx = {
    ...value, mode: 'live', modeKnown, liveState: { ready: liveReady, error: liveErr, integrations: liveMe?.integrations },
    setMe: () => undefined, resetDemo: () => undefined,
    cmd: (c) => run(c) as never,
    createOrder: async (o) => (await run<{ orderId: string }>({ type: 'createOrder', ...o }))?.orderId ?? '',
    orderAction: (id, action, remark) => { void run({ type: 'orderAction', id, action, remark }); },
    addRemark: (id, text) => { void run({ type: 'addRemark', id, text }); },
    allocate: (orderId, carrierId, price) => { void run({ type: 'allocate', orderId, carrierId, price }); },
    assign: (sin, vehicleNo, driver, phone) => { void run({ type: 'assign', sin, vehicleNo, driver, phone }); },
    advance: (sin) => { void run({ type: 'advance', sin }); },
    patchShipment: (sin, patch, note) => { void run({ type: 'patchShipment', sin, patch, note }); },
    cancelShipment: (sin) => { void run({ type: 'cancelShipment', sin }); },
    placeBid: (orderId, carrierId, price) => { void run({ type: 'placeBid', orderId, carrierId, price }); },
    awardBid: (orderId, carrierId) => { void run({ type: 'awardBid', orderId, carrierId }); },
    setInvoice: (id, to) => { void run({ type: 'setInvoice', id, to }); },
    bulkInvoice: (ids, to) => { void run({ type: 'bulkInvoice', ids, to }); },
    addVoucher: (carrierId, amount) => { void run({ type: 'addVoucher', carrierId, amount }); },
    addNote: (kind, carrierId, amount, reason, sin) => { void run({ type: 'addNote', kind, carrierId, amount, reason, sin }); },
    patchCarrier: (id, patch) => { void run({ type: 'patchCarrier', id, patch }); },
    addCarrier: (name) => { void run({ type: 'addCarrier', name }); },
    addCustomer: (name, zone, contact) => { void run({ type: 'addCustomer', name, zone, contact }); },
    saveUser: (user) => { void run({ type: 'saveUser', user }); },
    markRead: () => { void run({ type: 'markRead' }); },
    postSap: async (id) => { await run({ type: 'postInvoiceSap', id }); },
    syncPayments: async () => { await run({ type: 'syncPayments' }); },
    syncMasters: async () => { await run({ type: 'syncMasters' }); },
    checkPoSo: async (po, so) => (await run<{ valid: boolean; message: string; simulated?: boolean }>({ type: 'checkPoSo', po, so })) ?? { valid: false, message: 'The check could not run.' },
    ewayCheck: async (sin) => (await run<{ status?: string; validUpto?: string; simulated?: boolean }>({ type: 'ewayCheck', sin })) ?? {},
    catalog: async () => { try { return (await liveApi.reportCatalog()).catalog; } catch { return null; } },
    report: async (name) => { try { return await liveApi.report(name, allUnits); } catch (e) { toast(e instanceof ApiError ? e.message : 'Report failed.', 'err'); return []; } },
    importData: async (payload, dryRun) => {
      try { const r = await liveApi.importData(payload, dryRun); if (!dryRun && r.ok) await loadLive(allUnits); return r; }
      catch (e) { return { ok: false, errors: [e instanceof ApiError ? e.message : 'Import failed.'], counts: {} }; }
    },
  };
  const final = live ? liveValue : value;
  const mv = useMemo(() => final, [db, me, allUnits, unitId, now, toasts, liveMe, liveReady, liveErr, live, modeKnown]); // eslint-disable-line react-hooks/exhaustive-deps
  return <C.Provider value={mv}>{children}</C.Provider>;
}
