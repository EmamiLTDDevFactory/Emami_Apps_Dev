# SAP side of the CAPEX Portal (EDS, transport EDSK9B0EO6)

Additive changes to the live Fiori service ZCAPEX_PORTAL_SRV so the Emami Apps can use it. Fiori behaviour is unchanged.

1. **Identity** - `zcl_capex_auth=>effective_user()`. The Azure gateway signs in as one technical user (WDA_AUDIT). The hub sends the
   signed-in person's e-mail + a shared secret as the custom query options `zcpxmail` / `zcpxkey`; `effective_user()` maps it to the one
   active ZCAPEX_USER row. No/invalid e-mail or key, unknown e-mail, or a caller not in PROXY_USERS -> `sy-uname`, exactly as before.
   Every business `sy-uname` in the zcl_capex_* classes and the DPC_EXT now calls `effective_user()`.
   **Config rows needed on each system (ZCAPEX_CONFIG):** `PROXY_SECRET` (long random; empty = channel off), `PROXY_USERS` (default WDA_AUDIT).
   Same secret in the hub server .env as `CAPEX_PROXY_SECRET`.
2. **Documents** - entity `DocXfer` / `DocXferSet` (file as base64 `Content`): create = upload, filtered read = download. The old raw-body+Slug upload
   and `$value` still work; both uploads share `store_document`.
3. `classes/*.abap` are the full sources as activated on EDS. `gen/*.py` are the scripts used to produce + deploy them through ADT
   (stateful lock, PUT with corrNr, check run, activation of ALL changed classes in one call). Password is a placeholder.
Gotchas: activate every changed class in ONE call; ADT lines max 255 chars; re-fetch `$metadata` after any MPC change.
