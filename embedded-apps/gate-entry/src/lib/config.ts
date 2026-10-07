/**
 * SAP service: ZGATE_ENTRY_SRV (OData V2, SEGW) through the shared Azure SAP gateway that every SAP-integrated
 * embedded app calls directly from the browser (/api/<SYSTEM>/<SERVICE>/... - see shelf-life-deviation/src/lib/config.ts).
 * The gateway logs on to SAP with its technical user and does the CSRF handshake; the signed-in hub user's email
 * travels with every call (see gate.ts) so the SAP logic can apply plant authorization (ZGATE_AUTH) per person.
 */
export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = 'NGD';
export const SAP_SERVICE = 'ZGATE_ENTRY_SRV';
export const SAP_BASE_URL = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const APP_TITLE = 'Gate Entry';
