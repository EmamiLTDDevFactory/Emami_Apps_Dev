/**
 * SAP service: ZLIFE_INS_SRV (OData V2, package ZEMAMI_MEDICLAIM) - the rebuilt Web Dynpro ZWD_MEDICAIM_NOMINEE (Term Life part).
 * Reached like every SAP-integrated embedded app: straight from the browser through the shared Azure SAP gateway at
 * /api/<SYSTEM>/<SERVICE>/... The gateway signs in to SAP with its technical user and does the CSRF handshake, so SAP does not
 * know the person: every call carries the hub login Email (see termPolicyApi.ts).
 *
 * EDS is where the business class ZCL_LIFE_INS_UTILS lives. Change SAP_SYSTEM here (or build with
 * NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM) when the service is registered on another system.
 */
export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = process.env.NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM ?? 'EDS';
export const SAP_SERVICE = 'ZLIFE_INS_SRV';
export const SAP_BASE_URL = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;
