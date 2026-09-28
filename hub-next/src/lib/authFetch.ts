// fetch() for the hub backend's access/admin routes, which now require the caller's own Emami Apps
// session token (backend/server.js requireAccessManager) instead of trusting an `actingEmail` in
// the request. The token is the JWT the hub stores at sign-in (AuthContext's
// emami_apps_session_token); a request without one simply gets a 401 from those routes.
import { storage } from './storage';

const AUTH_TOKEN_STORAGE_KEY = 'emami_apps_session_token';

export function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = storage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}
