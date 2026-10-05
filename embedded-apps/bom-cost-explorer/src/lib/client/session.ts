'use client';
import { useEffect, useState } from 'react';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Same as every sibling embedded app: no login of its own. Reaching the app is valid only because
 * the Emami Apps hub already signed the person in - its same-origin localStorage holds the email
 * and session token (cleared by the hub on logout).
 */
const HUB_EMAIL_KEY = 'emami_apps_user_email';
export const HUB_TOKEN_KEY = 'emami_apps_session_token';

export interface HubSession {
  email: string;
}

export function readHubSession(): HubSession | null {
  try {
    const email = localStorage.getItem(HUB_EMAIL_KEY);
    const token = localStorage.getItem(HUB_TOKEN_KEY);
    if (email && token) return { email: email.trim().toLowerCase() };
    // Local development against the mock (never in a normal build).
    return process.env.NEXT_PUBLIC_MOCK_SAP === 'true' ? { email: 'developer@example.com' } : null;
  } catch {
    return null;
  }
}

/** 'checking' until mounted, then the hub session or null (not signed in to the hub). */
export function useHubSession(): HubSession | null | 'checking' {
  const [s, setS] = useState<HubSession | null | 'checking'>('checking');
  useEffect(() => setS(readHubSession()), []);
  return s;
}
