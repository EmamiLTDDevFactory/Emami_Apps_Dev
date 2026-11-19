# Costing dashboard - SAP side (EDS, client 900, transport EDSK9B0EM6)

`DashMisSet` (ZMM_BOM_COST_SRV): one row per brand, month to date (FTM) and financial year to date (YTM) COGM, budget vs actual.

- **Filter:** `Werks` (one or several plants, or-ed) and `DateTo` (as-of date). Without a plant: "Select at least one plant".
- **Actual:** `ZCL_MM_WAC_ACTUAL->read` (the WAC actual cost of the period, INR totals): RM + PM + perfume + conversion.
- **Budget:** `ZMM_BUDCOST_SUM-COST_PC` (per piece) of the latest approved version (`STATUS = 'A'`) of the financial year (K4 / T001-PERIV of HO00), per material and plant,
  x the ACTUAL produced quantity (flexed budget). Finished goods with no approved budget are counted in `FgNobud` and left out of the `*ActualCmp` / `*Budget` comparison
  (their actual stays in `*Actual`), so variance = `ActualCmp - Budget` compares like with like.
- **Objects:** structure `ZDASH_S_MIS`, class `ZCL_MM_DASH_MIS`, entity type `DashMis` / set `DashMisSet` added in `ZCL_ZMM_BOM_COST_MPC_EXT` (`dash_define`),
  GET handled by the `get_entityset` redefinition in `ZCL_ZMM_BOM_COST_DPC_EXT` (other sets go to the generated base). No auth object / PFCG role (as for the packing budget).
- **Not verified with real figures:** EDS holds budgets for 2022 only and zero actual cost, so the budget join was exercised only through "no approved budget" (correct empty result).
  Check one brand on QA / PRD against ZMM_BUDCOST_SUM and the WAC screen.
