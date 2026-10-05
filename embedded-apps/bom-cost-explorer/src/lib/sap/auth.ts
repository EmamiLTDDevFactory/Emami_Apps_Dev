/**
 * Request headers towards the SAP gateway, built in ONE place from SAP_AUTH_MODE.
 * In the browser only `none` passes config validation (credentials must never be bundled);
 * basic / bearer / apikey are for node tools (check:metadata) against a gateway that needs them.
 * Nothing here is ever logged.
 */
import type { SapConfig } from './config';

export function authHeaders(c: SapConfig): Record<string, string> {
  switch (c.authMode) {
    case 'basic': {
      const raw = `${c.authUser ?? ''}:${c.authPassword ?? ''}`;
      const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(raw))) : Buffer.from(raw, 'utf8').toString('base64');
      return { Authorization: `Basic ${b64}` };
    }
    case 'bearer':
      return { Authorization: `Bearer ${c.authToken}` };
    case 'apikey':
      return { [c.authHeaderName as string]: c.authHeaderValue as string };
    default:
      return {};
  }
}
