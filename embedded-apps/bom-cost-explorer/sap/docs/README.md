# Material documents (SPEC_ / ARTWORK_) — read-only

Shows the latest **specification** and **artwork** PDF of an RM / PM / FG material in the Costing Cockpit.

| Object | What |
|---|---|
| `ZMATDOC_S_ROW` | row structure (`zmatdoc_s_row.ddls.txt`) |
| `ZCL_MM_MAT_DOCS` | read-only class (`zcl_mm_mat_docs.abap`) |
| `ZCL_ZMM_BOM_COST_MPC_EXT` | + `matdoc_define` (`mpc_matdoc_define.abap`) and `GET_LAST_MODIFIED` redefinition |
| `ZCL_ZMM_BOM_COST_DPC_EXT` | + `MatDocSet` branch (`dpc_matdoc_branch.abap`) |

Transport on EDS: **EDSK9B0EPT**.

Rules
- Materials: `MARA-MTART` in ROH (RM), VERP / PKGN (PM), FERT (FG).
- Documents: GOS attachments (`SRGBTBREL`, BUS1001006, ATTA) whose `SOOD-OBJDES` starts with `SPEC_` or `ARTWORK_` (case-insensitive) and whose file type is PDF. "Artwork" without the underscore is not shown.
- Latest = newest attachment time (`SRGBTBREL-UTCTIME`).
- Content: `SO_DOCUMENT_READ_API1` (also reads documents in the content repository), returned base64 in chunks of 600,000 bytes. A document is only read for a material it is attached to.

`MatDocSet` filters: `Matnr` (required, up to 200), `DocType` SPEC / ART, `Mode` L latest (default) / V all versions / C content, `DocId`, `Chunk`.

`GET_LAST_MODIFIED`: bump `lc_model_ts` whenever the model changes, so every gateway server rebuilds the cached model by itself (no manual cache cleanup, which is what broke RigidSet on NWP).

App access: Manage Access role of this app `Admin` or `mat-docs` (fails closed).
