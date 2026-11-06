// Drafts of my responses. As built on SAP: there is no per-assignee "submitted" marker, so SAP stores only submitted responses and
// drafts live in this browser (localStorage), per user + track + workpaper + observation (lineItem|ownerLineItem). Every access is in
// try/catch: in a private window or with storage blocked the draft lasts only while the page is open.
import type { Track } from './types';

const PREFIX = 'aud_draft';
const memory = new Map<string, string>();

/** The signed-in hub user (the hub writes it at sign-in); the demo user in demo mode. Only used to keep drafts apart per person. */
export function draftUser(demo: boolean): string {
  if (demo) return 'demo';
  try { return (window.localStorage.getItem('emami_apps_user_email') || 'me').toLowerCase(); } catch { return 'me'; }
}

const keyOf = (user: string, track: Track, guid: string, obs: string) => `${PREFIX}:${user}:${track}:${guid}:${obs}`;

export function readDrafts(user: string, track: Track, guid: string, obsKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of obsKeys) {
    const full = keyOf(user, track, guid, k);
    let v: string | null = memory.get(full) ?? null;
    try { v = window.localStorage.getItem(full) ?? v; } catch { /* storage blocked */ }
    if (v !== null) out[k] = v;
  }
  return out;
}

export function writeDrafts(user: string, track: Track, guid: string, texts: Record<string, string>): boolean {
  let stored = true;
  for (const [k, v] of Object.entries(texts)) {
    const full = keyOf(user, track, guid, k);
    memory.set(full, v);
    try { window.localStorage.setItem(full, v); } catch { stored = false; }
  }
  return stored;
}

export function clearDrafts(user: string, track: Track, guid: string, obsKeys: string[]): void {
  for (const k of obsKeys) {
    const full = keyOf(user, track, guid, k);
    memory.delete(full);
    try { window.localStorage.removeItem(full); } catch { /* storage blocked */ }
  }
}
