// Release status per app (backend/appStages.js on the access backend, same server as accessApi.ts).
import type { AppStage } from '../types';
import { isAppStage } from '../data/appStages';
import { authFetch } from './authFetch';

const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

export interface StoredStage {
  stage: AppStage;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Stages an admin has set, by app id. Apps missing here keep their default from mockData. null = could not load. */
export async function getAppStages(): Promise<Record<string, StoredStage> | null> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/app-stages`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;
    const out: Record<string, StoredStage> = {};
    Object.entries(data.stages ?? {}).forEach(([id, v]: [string, any]) => {
      if (isAppStage(v?.stage)) out[id] = { stage: v.stage, updatedBy: v.updatedBy ?? null, updatedAt: v.updatedAt ?? null };
    });
    return out;
  } catch {
    return null;
  }
}

export async function setAppStage(appId: string, stage: AppStage): Promise<{ ok: boolean; saved?: StoredStage; error?: string }> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/admin/apps/${encodeURIComponent(appId)}/stage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not change the app status.' };
    return { ok: true, saved: { stage: data.stage, updatedBy: data.updatedBy ?? null, updatedAt: data.updatedAt ?? null } };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
