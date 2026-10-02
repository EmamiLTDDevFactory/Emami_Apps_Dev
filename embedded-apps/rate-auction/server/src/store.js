import { createEngine } from './engine.js';
import { getStore, storeMode } from './sap/index.js';

// One engine per server process. With STORE_MODE=ecc the auction is saved into SAP custom tables after every
// change (and retried every second if SAP is unreachable), and loaded back at startup. No other database.
// Run ONE app instance per environment: the live auction state is held in this process.
const g = globalThis;
if (!g.__rateAuction) {
  const ecc = storeMode() === 'ecc';
  const engine = createEngine({ empty: ecc });
  const p = { enabled: ecc, loaded: !ecc, savedRev: -1, lastError: null, lastOkAt: null, chain: Promise.resolve(), ready: Promise.resolve() };
  g.__rateAuction = { engine, persist: p };

  const sync = () => {
    p.chain = p.chain.then(async () => {
      const store = getStore();
      const rev = engine.rev, snap = engine.snapshot();
      if (!store || rev === p.savedRev) return;
      if (!snap) { p.savedRev = rev; return; } // no auction yet: nothing to save
      try { await store.sync(snap); p.savedRev = rev; p.lastError = null; p.lastOkAt = Date.now(); }
      catch (e) { p.lastError = e.message; }
    });
    return p.chain;
  };
  g.__rateAuction.sync = sync;

  if (ecc) {
    // Load the latest auction from SAP. If SAP cannot be reached, keep trying every 5 seconds and refuse to start a
    // new auction meanwhile, so the stored one is never overwritten by mistake.
    const tryLoad = async () => {
      try {
        const st = await getStore().load();
        if (st) { engine.restore(st); p.savedRev = engine.rev; }
        p.loaded = true; p.lastError = null;
      } catch (e) {
        p.lastError = 'Could not load the auction from SAP: ' + e.message;
        setTimeout(tryLoad, 5000);
      }
    };
    p.ready = tryLoad();
  }
  setInterval(() => { engine.tick(Date.now()); if (ecc && p.loaded && engine.rev !== p.savedRev) sync(); }, 1000);
}
export const engine = g.__rateAuction.engine;
export const ready = () => g.__rateAuction.persist.ready;
export const isLoaded = () => g.__rateAuction.persist.loaded;

// Wait (up to waitMs) until SAP has the latest change. Never throws: a slow SAP must not block bidding.
export async function syncNow(waitMs = 4000) {
  const p = g.__rateAuction.persist;
  if (!p.enabled || !p.loaded) return !p.enabled;
  await Promise.race([g.__rateAuction.sync(), new Promise((r) => setTimeout(r, waitMs))]);
  return engine.rev === p.savedRev;
}

// session = { email, role } from this server's own session token (see auth.js). A vendor's seat in
// the auction is looked up from their email on every call, never stored in the token.
export function viewFor(session) {
  const now = Date.now();
  if (session.role !== 'admin') return engine.vendorView(engine.vendorIdFor(session.email, now), now);
  const p = g.__rateAuction.persist;
  return { ...engine.adminView(now), persist: { enabled: p.enabled, pending: p.enabled && engine.rev !== p.savedRev, lastError: p.lastError } };
}
