/**
 * SAP service: ZLIFE_INS_SRV (OData V2, package ZEMAMI_MEDICLAIM) - the rebuilt Web Dynpro ZWD_MEDICAIM_NOMINEE (Term Life part).
 * Reached like every SAP-integrated embedded app: straight from the browser through the shared Azure SAP gateway at
 * /api/<SYSTEM>/<SERVICE>/... The gateway signs in to SAP with its technical user and does the CSRF handshake, so SAP does not
 * know the person: every call carries the hub login Email (see termPolicyApi.ts).
 *
 * NGD (Development hub) for now, like Mediclaim: the Azure gateway only knows the hubs NGD / NGQ / NWP (it answers "Invalid Landscape"
 * for EDS), and the hub reaches the EDS backend, where ZCL_LIFE_INS_UTILS and ZLIFE_INS_SRV live, through a system alias.
 * PRD switches SAP_SYSTEM to NWP when the service is registered there.
 */
export const SAP_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api';
export const SAP_SYSTEM = process.env.NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM ?? 'NGD';
export const SAP_SERVICE = 'ZLIFE_INS_SRV';
export const SAP_BASE_URL = `${SAP_GATEWAY}/${SAP_SYSTEM}/${SAP_SERVICE}`;
