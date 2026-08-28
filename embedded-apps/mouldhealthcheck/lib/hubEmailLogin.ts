// Same-origin localStorage key the hub's own AuthContext.tsx writes on login (see
// emami_apps_user_email in the main app's src/context/AuthContext.tsx). Reading it here is what
// lets this app skip its own login screen entirely — anyone who reached /apps/mouldhealthcheck
// already signed in through the hub. Same pattern as non-ctc-expense/rc-portal/market-rate.
const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

export function getHubEmail(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}
