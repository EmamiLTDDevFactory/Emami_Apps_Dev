# Packing material budget rate - SAP side (EDS, client 900, transport EDSK9B0EJP)

Copies of what is active on EDS (2026-11-18). Tables `ZPKG_BUD_SCEN/ITEM/OVR/LOG` follow the PM Budget Rate spec;
`ZPKG_BUD_ITEM` got an extra `BR` column (budgeted rate, missing in the spec table). No auth object / PFCG role is used:
`ZCL_PKG_BUDGET_CALC->auth` is empty on purpose.

- `zcl_pkg_budget_calc.abap` - calc class (create / edit / recalc / revert / copy / submit / finalise / reopen / delete) on the spec tables.
  Also `scen_list`, `item_list`, `ovr_list` map the spec tables to the (unchanged) OData structures `ZPKG_S_*`.
  Scenario extras that have no table column (rate priority, material-group filter, base scenario) are kept as tags in `ORIGIN_GRP_SEL`.
- `zcx_pkg_bud.abap` - exception class with text (spec section 02).
- `zcl_zmm_bom_cost_mpc_ext.abap` - adds freight / landed / group-value properties to `PkgItem` on top of the generated model.
- `ZCL_ZMM_BOM_COST_DPC_EXT`: only the 3 Pkg GET methods changed (they call the calc class list methods).
- Number range object `ZPKGBUD` (interval 01) was created by direct insert into TNRO/TNROT/NRIV: it is NOT in a transport. Transport it with SNUM or recreate it on QA/PRD.

Rules confirmed on EDS data: ZBUD KBETR is stored x10 (100.00 = 10 %), so factor = KBETR / 10. BOM share p(i) = STPO item quantity (BOM base 1, items sum to 100).
BOM % can never be overridden. Packing materials live in the production plants (UN01, UN08 ...), ZBUD materials + BOMs in HO00.
