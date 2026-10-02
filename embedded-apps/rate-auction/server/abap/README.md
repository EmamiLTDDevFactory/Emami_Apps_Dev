# ABAP objects for the Rate Auction platform (SAP ECC)

STARTER CODE, never compiled or run in a SAP system. Your ABAP developer creates it in DEV, activates it,
tests it and reviews it. The full step-by-step guide is the Claude document "SAP ECC Backend: Step-by-Step Build Guide".

Order of work
1. `01_ddic.md`              data elements, structures, 6 tables, lock object
2. `fm/`                     one file per function module (Z_AUC_*), plus LZAUCF01_forms.abap for the include
3. `reports/ZAUC_TEST_READ`  proves the read modules work, no RFC needed
4. `reports/ZAUC_TEST_SAVE`  proves save, load, the threshold checks and the OVER_CAP flag
5. `reports/ZAUC_INTEGRITY`  audit report: bids above threshold, bids from vendors who were not invited

Every function module must be Remote-Enabled (SE37, Attributes tab). Parameter names must match exactly:
the Node.js code in lib/sap/rfc.js and lib/sap/ecc-store.js calls them by name.
Classic syntax is used on purpose so it works on older ECC 6.0 support packages.

Threshold rule: THRESHOLD in ZAUC_HDR is the highest bid a vendor may place. The platform refuses higher bids
before saving. Z_AUC_SAVE_AUCTION refuses a threshold that is zero or above the ceiling. Z_AUC_SAVE_BIDS
saves any bid above the threshold with OVER_CAP = X so it shows up in ZAUC_INTEGRITY.

Security: the technical user needs authorization object S_RFC for function group ZAUC and nothing else of value.
