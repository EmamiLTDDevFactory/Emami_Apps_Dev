// Same-origin localStorage keys the hub's AuthContext writes on login (identical copy in every sibling embedded app).
const HUB_EMAIL_KEY = 'emami_apps_user_email';
const HUB_TOKEN_KEY = 'emami_apps_session_token';

export function getHubEmail(): string {
  try {
    return (localStorage.getItem(HUB_EMAIL_KEY) || '').trim();
  } catch {
    return '';
  }
}

/** The app has no login of its own: it opens only for a visitor the hub signed in. */
export function hasHubSession(): boolean {
  try {
    return Boolean(localStorage.getItem(HUB_TOKEN_KEY) && getHubEmail());
  } catch {
    return false;
  }
}

export const nameFromEmail = (e: string) =>
  (e.split('@')[0] || e).split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || e;
