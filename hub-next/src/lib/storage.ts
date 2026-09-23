// Replaces AsyncStorage now that this only ever runs in a browser (no native target) — plain
// localStorage under the hood, same as AsyncStorage's own web implementation used, so persisted
// keys (e.g. emami_apps_session_token) still line up with what same-origin embedded apps expect
// to find there.
export const storage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Best-effort — a blocked/full localStorage shouldn't crash the caller.
    }
  },
  removeItems(keys: string[]): void {
    try {
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Best-effort.
    }
  },
};
