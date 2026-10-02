// All SAP field names live in this one file, so fixing them against your system is a one-file change.
// IMPORTANT: names below follow the standard S/4HANA released APIs
//   API_PRODUCT_SRV, API_INFORECORD_PROCESS_SRV, API_PURCHASECONTRACT_PROCESS_SRV
// but they MUST be verified against your system's $metadata (see the guide, step 6) before go-live.

// Our unit codes -> SAP unit of measure (table T006). TRIP is not a standard SAP unit:
// Basis / functional team must create it, or map to an existing one.
export const UOM_TO_SAP = { EA: 'PC', KG: 'KG', MT: 'TO', TRIP: 'TRIP', L: 'L' };
export const UOM_FROM_SAP = { PC: 'EA', ST: 'EA', EA: 'EA', KG: 'KG', TO: 'MT', L: 'L', TRIP: 'TRIP' };

// Info record category: 0 standard, 1 subcontracting, 2 pipeline, 3 consignment.
export const INFO_CATEGORY = { Standard: '0', Subcontracting: '1', Pipeline: '2', Consignment: '3' };

// OData V2 Edm.DateTime literal from a yyyy-mm-dd string.
export const sapDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return '/Date(' + Date.UTC(y, m - 1, d) + ')/';
};
// OData V2 Edm.Decimal travels as a string.
export const dec = (n, places = 2) => Number(n).toFixed(places);

export const pad10 = (code) => String(code).replace(/\D/g, '').padStart(10, '0'); // vendor numbers

export function toInfoRecordBody(p) {
  const f = p.form;
  return {
    Supplier: pad10(f.vendorCode),
    Material: f.material,
    PurchasingInfoRecordCategory: INFO_CATEGORY[f.infoCategory] ?? '0',
    to_PurgInfoRecdOrgPlantData: {
      results: [{
        PurchasingOrganization: f.purchOrg,
        Plant: f.plant,
        PurchasingGroup: f.purchGroup,
        Currency: f.currency,
        PurchaseOrderPriceUnit: UOM_TO_SAP[f.uom] || f.uom,
        MaterialPriceUnitQty: dec(f.priceUnit, 0),
        NetPriceAmount: dec(f.netPrice),
        MaterialPlannedDeliveryDurationInDays: String(f.plannedDelivDays),
        MinimumPurchaseOrderQuantity: f.minQty ? dec(f.minQty, 3) : undefined,
        TaxCode: f.taxCode,
        IncotermsClassification: f.incoterms,
        PaymentTerms: f.paymentTerms,
      }],
    },
  };
}

export function toContractBody(p) {
  const f = p.form;
  return {
    PurchaseContractType: String(f.contractType).slice(0, 2), // WK or MK
    Supplier: pad10(f.vendorCode),
    PurchasingOrganization: f.purchOrg,
    PurchasingGroup: f.purchGroup,
    DocumentCurrency: f.currency,
    ValidityStartDate: sapDate(f.validFrom),
    ValidityEndDate: sapDate(f.validTo),
    PaymentTerms: f.paymentTerms,
    IncotermsClassification: f.incoterms,
    to_PurchaseContractItem: {
      results: [{
        Material: f.material,
        PurchaseContractItemText: (f.shortText + ' / ' + p.auctionRef).slice(0, 40), // auction ref makes the document traceable
        Plant: f.plant,
        OrderQuantityUnit: UOM_TO_SAP[f.uom] || f.uom,
        TargetQuantity: f.targetQty ? dec(f.targetQty, 3) : undefined,
        NetPriceAmount: dec(f.netPrice),
        NetPriceQuantity: '1',
        TaxCode: f.taxCode || undefined,
      }],
    },
  };
}

// SAP product -> our material shape. descriptions: [{Language, ProductDescription}]
export function fromProduct(prod, lang) {
  const d = (prod.to_Description?.results || []).find((x) => x.Language === lang) || (prod.to_Description?.results || [])[0];
  return {
    code: prod.Product,
    desc: d ? d.ProductDescription : prod.Product,
    type: prod.ProductType,
    uom: UOM_FROM_SAP[prod.BaseUnit] || prod.BaseUnit,
    lastRate: null, // fetched on demand with getLastRate()
  };
}


// ---------- SAP ECC (RFC to custom Z function modules) ----------
export const ymd = (iso) => String(iso).replace(/-/g, ''); // yyyy-mm-dd -> yyyymmdd (ABAP DATS)

// Structure ZAUC_S_INFOREC. The ABAP function Z_AUC_CREATE_INFOREC receives exactly this.
export function toEccInfoRecord(p) {
  const f = p.form;
  return {
    LIFNR: pad10(f.vendorCode), MATNR: f.material, INFO_CAT: INFO_CATEGORY[f.infoCategory] ?? '0',
    EKORG: f.purchOrg, EKGRP: f.purchGroup, WERKS: f.plant,
    NETPR: dec(f.netPrice, 2), WAERS: f.currency, PEINH: dec(f.priceUnit, 0), BPRME: UOM_TO_SAP[f.uom] || f.uom,
    VALID_FROM: ymd(f.validFrom), VALID_TO: ymd(f.validTo), PLIFZ: String(f.plannedDelivDays),
    MWSKZ: f.taxCode, INCO1: f.incoterms, ZTERM: f.paymentTerms, MINBM: f.minQty ? dec(f.minQty, 3) : '0',
    AUC_REF: p.auctionRef,
  };
}

// Structure ZAUC_S_CONTRACT for Z_AUC_CREATE_CONTRACT.
export function toEccContract(p) {
  const f = p.form;
  return {
    CTYPE: String(f.contractType).slice(0, 2), LIFNR: pad10(f.vendorCode),
    EKORG: f.purchOrg, EKGRP: f.purchGroup, WAERS: f.currency,
    KDATB: ymd(f.validFrom), KDATE: ymd(f.validTo), ZTERM: f.paymentTerms, INCO1: f.incoterms,
    MATNR: f.material, TXZ01: String(f.shortText).slice(0, 40), WERKS: f.plant, MEINS: UOM_TO_SAP[f.uom] || f.uom,
    KTMNG: f.targetQty ? dec(f.targetQty, 3) : '0', TARGET_VAL: f.targetValue ? dec(f.targetValue, 2) : '0',
    NETPR: dec(f.netPrice, 2), PEINH: '1', MWSKZ: f.taxCode || '', AUC_REF: p.auctionRef,
  };
}
