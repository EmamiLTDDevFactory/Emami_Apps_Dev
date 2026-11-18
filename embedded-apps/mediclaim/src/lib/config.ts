/**
 * SAP service: ZMEDICLAIM_SRV (OData V2, code-based model ZMEDICLAIM_MDL, package ZEMAMI_MEDICLAIM) - the rebuilt Web Dynpro
 * ZWD_MEDICAIM. Reached the same way every SAP-integrated embedded app does it (see gate-entry/src/lib/config.ts): straight from the
 * browser through the shared Azure SAP gateway at /api/<SYSTEM>/<SERVICE>/... The gateway logs on to SAP with its technical user
 * and does the CSRF handshake, so SAP does not know the person: every call carries the hub login Email (see mediclaim.ts).
 *
 * NGD (Development) for now. PRD will switch SAP_SYSTEM to NWP when the service is registered there.
 */
export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = 'NGD';
export const SAP_SERVICE = 'ZMEDICLAIM_SRV';
export const SAP_BASE_URL = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;

export const APP_TITLE = 'Mediclaim';
