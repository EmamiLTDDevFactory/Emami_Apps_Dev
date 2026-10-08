/**
 * SAP service: ZMM_GATE_ENTRY_SRV (OData V2, SEGW project ZMM_GATE_ENTRY_MDL) on NGD, through the shared Azure SAP
 * gateway that every SAP-integrated embedded app calls directly from the browser (/api/<SYSTEM>/<SERVICE>/... - see
 * shelf-life-deviation/src/lib/config.ts). The gateway logs on to SAP with its technical user and does the CSRF
 * handshake, so SAP sees that user (REQ_BY, plant and cancel authority), not the person signed in to the hub.
 */
export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = 'NGD';
export const SAP_SERVICE = 'ZMM_GATE_ENTRY_SRV';
export const SAP_BASE_URL = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const APP_TITLE = 'Gate Entry';
