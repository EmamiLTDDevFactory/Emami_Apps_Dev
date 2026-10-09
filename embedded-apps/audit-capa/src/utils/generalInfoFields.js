// "Display of statutory licences" sub-fields of the checklist's General
// Information. Stored as keys of audits.general_info (jsonb) next to the
// older free-text `statutoryLicences`, which is kept for audits saved before.
export const STATUTORY_LICENCE_FIELDS = [
    { key: "fssaiLicNo", label: "FSSAI Lic No." },
    { key: "fssaiValidTill", label: "FSSAI Valid Till", date: true },
    { key: "gstNo", label: "GST No." },
    { key: "legalMetrologyPlierNo", label: "Legal Metrology - TN530 Plier No." },
    { key: "fireNoc", label: "Fire NOC" },
    { key: "shopEstablishmentLic", label: "Shop & Establishment Lic. / Gram Panchayat Lic." },
    { key: "coreUrbanRegionEconomy", label: "Core Urban Region Economy" },
    { key: "tradeLicNo", label: "Trade Lic No." },
];

// Pre-filled values for a new audit; only used when the key was never saved,
// so a value the auditor cleared stays cleared.
export const GENERAL_INFO_DEFAULTS = {
    purposeOfVisitAudit: "Yearly Audit",
    layoutDisplay: "Yes",
    insuranceCoverage: "Available at Head office",
};
