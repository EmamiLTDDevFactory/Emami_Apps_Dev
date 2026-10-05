/**
 * Equivalent of manifest.json -> sap.app.dataSources.mainService.
 *
 * Same shared Azure SAP gateway every other SAP-integrated embedded app calls directly from the
 * browser (/api/<SYSTEM>/<SERVICE>/<EntitySet> — see fm-po-deviation/src/lib/sapClient.ts and
 * audit-tool/src/lib/odata.ts). The original UI5 app used the relative
 * /sap/opu/odata/sap/ZQM_SLED_APPROVAL_SRV/ because it was hosted on the ABAP server itself.
 */
export const SAP_BASE_URL =
  'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZQM_SLED_APPROVAL_SRV';

/** next.config.js basePath — plain <img>/<a> tags don't get it prepended automatically. */
export const BASE_PATH = '/apps/shelf-life-deviation';

export const APP_TITLE = 'Shelf Life Deviation'; // hub tile name
export const APP_DESCRIPTION =
  'CPD Category Head approval worklist and CADE Z-Report for shelf-life deviation GRNs'; // i18n>appDescription
