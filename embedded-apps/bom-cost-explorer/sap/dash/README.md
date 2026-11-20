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

## DashSalesSet (Sales view)
Invoiced sales of finished goods (MARA-MTART FERT), INR invoices only, billing items of the filter plants (`Werks`) between `DateFrom` and `DateTo`. Grain `B` = brand, `S` = SKU x distribution channel (TVTWT text).
- **Sold qty** = billed qty in the base unit (x UMVKZ / UMVKN); billing category M (invoice) and P (debit memo) add, N (cancellation) and O (credit memo) subtract, S adds. Pro forma (U) and others are not counted.
- **GSV** = KONV condition `ZSAL` (kinak blank) of the same item; an item without ZSAL counts its net value (no deduction). **NSV** = VBRP-NETWR. **Deductions** = GSV - NSV.
- **COGM** = actual cost per piece of the same period (ZCL_MM_WAC_ACTUAL: RM + PM + perfume + conversion / produced qty, all filter plants, per material) x SOLD qty. SKUs with no production in the period have no COGM:
  they are counted in `SkuNocogm`, stay in sales, and are left out of the margin (`NsvCmp` is the NSV of the SKUs that have a cost, so margin = NsvCmp - Cogm).
- Objects: `ZDASH_S_SALES`, `ZCL_MM_DASH_SALES`, entity `DashSales` / `DashSalesSet` (`dash_sales_define` in MPC_EXT), dispatch in the DPC_EXT redefinition.
- Verified on EDS only for the shape and the no-ZSAL case; GSV with ZSAL and COGM with real production need QA / PRD data. The rule is the recommended default (GSV = ZSAL, NSV = NETWR); correct it in `ZCL_MM_DASH_SALES` if finance defines it differently.

## DashPvmSet (price-volume-mix-cost bridge), ZSALES_BUD_TGT, ZMIS_ALERT_THR
- **Tables** (transparent, package ZEMAMI, task EDSK9B0EM7): `ZSALES_BUD_TGT` (key GJAHR, VERSION, MATNR, VTWEG; STATUS, BUD_QTY, BUD_NSV_PC, BUD_COGM_PC) and `ZMIS_ALERT_THR`
  (key METRIC, CATEGORY = material group; RED_PCT, AMBER_PCT, HIGH_BAD). A table name is 16 characters at most, hence ZMIS_ALERT_THR. Created with `create_tables.classrun.abap` (DDIF_TABL_PUT); ADT cannot create tables on this release.
  `ZMIS_ALERT_THR` has the default row GM / blank category / 18 / 22. `ZSALES_BUD_TGT` is EMPTY: the sales budget must be loaded (SE16N / SM30 or an upload) before the bridge shows anything.
- **Bridge** (`ZCL_SALES_PVM_BRIDGE`): budget = latest approved version (STATUS A) of the financial year; actual = `ZCL_MM_DASH_SALES` SKU x channel rows. Only lines with a budget and an actual cost (or no sales) are bridged.
  Price = SUM((Pa-Pb) x Qa); Cost = SUM((COGMb-COGMa) x Qa); Volume = (Qa_tot-Qb_tot) x average budget margin; Mix = SUM((Qa - Qb x Qa_tot/Qb_tot) x Mb). The spec's literal Volume formula
  SUM((Qa-Qb) x Mb) already contains the mix effect, so it equals Volume + Mix here; that way the four effects add up exactly to the margin change (checked with a two-SKU hand example: 1200 -> 1000 = -20 + 0 - 80 - 100). An 'Unexplained' row would appear if they ever did not.
- `DashThreshSet` reads `ZMIS_ALERT_THR`; `DashSalesSet` now also returns `Matkl` for the category bands.

## Margin analysis (DashMarginSet, request EDSK9B0EMZ)
- Objects: structure ZDASH_S_MARGIN, class ZCL_MM_DASH_MARGIN, MPC_EXT `dash_margin_define`, DPC_EXT get_entityset branch `DashMarginSet`.
- Conditions: MRP ZMRP (ZNMR if none); selling price ZP12; GST JOIG+JOCG+JOSG; channel margin retailer ZREM+ZTDP, distributor ZDIM+ZTDM, super stockist ZSSM+ZTSM;
  invoice cost RM ZRMP, PM ZPMP, perfume ZPFP, overhead ZOHP; consumer scheme ZRSP/ZPSP/ZFCP/ZOSP; trade scheme ZRTS/ZPTP/ZFTS/ZOTP. The inactive flag KINAK is ignored (cost conditions carry 'Y').
- Budget: ZMM_FBUDCOST_SUM, GJAHR of the financial year of the to date, STATUS 'A', highest VERSION, key ZSKUGRCODECRS + ZBUSINESS + ZSCHEME (MARA), MTART FERT; average of RM_COST / PM_COST / PERFUME_COST over the rows of that version; overhead = MACHINE + LABOUR + POWER + STEAM + LABOUR3P (fixed columns, per piece; COST_PC excludes them). No match = BUD_FLAG 'NBC'.
- Grain S = SKU, C = customer, B = brand (billing item, INR, vbtyp M/P/S +, N/O -). "As per current COGM" is NOT read in SAP: the front end loads the business data set (CSV, per piece by SKU).
- Gotcha: a SORTED TABLE row cannot go to a CHANGING parameter (write-protected): copy it, change, MODIFY TABLE.
- Test class ZCL_TMP_MGN_T in $TMP (classrun) can be deleted.
