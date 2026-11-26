# Material documents (SPEC_ / ARTWORK_) — read-only

Shows the latest **specification** and **artwork** PDF of an RM / PM / FG material in the Costing Cockpit.

| Object | What |
|---|---|
| `ZMATDOC_S_ROW` | row structure (`zmatdoc_s_row.ddls.txt`) |
| `ZCL_MM_MAT_DOCS` | read-only class (`zcl_mm_mat_docs.abap`) |
| `ZCL_ZMM_BOM_COST_MPC_EXT` | + `matdoc_define` (`mpc_matdoc_define.abap`) and `GET_LAST_MODIFIED` redefinition |
| `ZCL_ZMM_BOM_COST_DPC_EXT` | + `MatDocSet` branch (`dpc_matdoc_branch.abap`) |

Transports on EDS: **EDSK9B0EPT** (first build, imported to NWP), **EDSK9B0EQK** (26.11.2026: title rule for PRD titles `SPEC LBL ...` / `ARTWORK`, material key in both GOS forms (18 and zero-padded 70), `TITLE_TYPE` + ABAP Unit test include `zcl_mm_mat_docs.testclasses.abap`).

Rules
- Materials: `MARA-MTART` in ROH (RM), VERP / PKGN (PM), FERT (FG).
- Documents: GOS attachments (`SRGBTBREL`, BUS1001006, ATTA) whose `SOOD-OBJDES` starts with the word `SPEC` / `SPECIFICATION` or `ARTWORK` (alone, or followed by a space, `_` or `-`; case-insensitive) and whose file type is PDF. Changed 26.11.2026: PRD titles are `SPEC LBL FOR ...` and `ARTWORK` (no underscore), so the earlier `SPEC_` / `ARTWORK_` rule found nothing on NWP.
- GOS link key: `SRGBTBREL-INSTID_A` is the material number, or the same number zero-padded to 70 characters (5 of 110 links on EDS); both are read.
- Latest = newest attachment time (`SRGBTBREL-UTCTIME`).
- Content: `SO_DOCUMENT_READ_API1` (also reads documents in the content repository), returned base64 in chunks of 600,000 bytes. A document is only read for a material it is attached to.

`MatDocSet` filters: `Matnr` (required, up to 200), `DocType` SPEC / ART, `Mode` L latest (default) / V all versions / C content, `DocId`, `Chunk`.

`GET_LAST_MODIFIED`: bump `lc_model_ts` whenever the model changes, so every gateway server rebuilds the cached model by itself (no manual cache cleanup, which is what broke RigidSet on NWP).

App access: Manage Access role of this app `Admin` or `mat-docs` (fails closed).
