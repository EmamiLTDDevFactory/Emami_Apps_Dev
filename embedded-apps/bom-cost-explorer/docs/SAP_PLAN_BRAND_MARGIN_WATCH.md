# SAP plan: Brand Margin Watch dashboard

Service: `ZMM_BOM_COST_SRV` (same gateway the BOM Simulator already uses; NGD, NGQ, NWP).
Audience: SAP ABAP / Gateway team, with the BOM Simulator team as consumer.
Layout reference: the sample dashboard "Brand Margin Watch" (sample data only).

## 1. What the dashboard needs

Per **brand, product and SKU** (finished goods), for a chosen **sales period** (30 / 60 / 90 days), **sales organisation** and **channel**:

| Dashboard element | Needs from SAP |
|---|---|
| Net sales, units | Billed quantity and net value per material, sales org, channel, month |
| Average MRP, margin on MRP | Latest MRP per material (and sales org / channel) |
| Margin on selling price | Latest net selling price per material (and sales org / channel) |
| Margin at CK13N standard | Standard cost per unit from the last released CK13N estimate, split RM / PM / perfume / conversion |
| Margin at selected rate type | Cost per unit with each component valued at the chosen rate type: selected price (SAP's pick per BOM line), C-MAP, actual (weighted average), info record, contract |
| Margin bridge | The component split of both costs above, per unit |
| Monthly margin trend | Monthly margin history for the same cost basis |
| Brand / product / SKU grouping | Hierarchy of each material |
| Action label, simulator | Computed in the browser from the above. No SAP logic. Volume response to a price rise is a screen setting, not SAP data. |

## 2. What already exists and what is missing

| Need | Existing set | Status |
|---|---|---|
| Sales org and channel lists | `SoAreaVHSet` | Live on NWP. Reuse. |
| Brand / product / SKU levels | `HierVHSet`, `MaterialVHSet` | Live. Reuse (already drives the Brand > Product > SKU picker). |
| MRP and net selling price, last order | `SoPriceSet` (needs `VkorgIn`; Mrp, Sp, Vtweg, Audat, DaysOld) | Live on NWP. Reuse for "last MRP and selling price". |
| CK13N standard cost, components | `CkHeaderSet`, `CkCompSet`, `CkItemSet` | Header and components live. Items unverified. |
| Cost at SAP's selected rate, per BOM line | `CostLineSet` (SelSource, SelRatePcInr, CompCostInr, CompOgrp) | Live. Heavy: costs one FG at a time. |
| Cost per rate type, per BOM line | `CostLineSet?$expand=RateOptions` (Source = CONTRACT / INFOREC / MARKT / CONSUMP / MBEW) | Live where supported. Heavy. |
| COGM row per FG | `CogmRowSet` (CogmStd, CogmCur, CogmAct, Mrp, SellPrice, ratios) | Live on NGQ. No perfume split. No rate-type input. NWP errors on `ActCogm` (SAP fix pending). |
| Weighted-average cost | `WacRowSet` (`ActCogm`) | NGD/NGQ have it, NWP errors until transport is fixed. |
| Monthly margin history | `CogmHistorySet` | Unverified (0 rows seen). |
| Margin thresholds / targets | `CogmRuleSet`, `CogmTargetSet` | Unverified. |
| **Sales quantity and value, 90 days, by sales org and channel** | none | **Missing. This is the main gap.** |
| **Cost per FG at a chosen rate type, with RM / PM / perfume / conversion split, in one call** | none (only line by line via `CostLineSet`) | **Missing. Needed for speed at brand level.** |
| **Cost history by month at a chosen rate type** | `CogmHistorySet` unverified | Likely missing. |

## 3. New and changed objects

### 3.1 `SalesValueSet` (new, required)

Billed sales aggregated by material, sales organisation, channel and month.

Filters (all optional except `DaysBack`): `DaysBack` (int, default 90), `DateTo`, `VkorgIn`, `VtwegIn`, `MatnrIn`, `BrandIn`, `ProductIn`, `SkuIn`, `WerksIn`.

Properties:

| Property | Type | Note |
|---|---|---|
| `Matnr`, `Maktx` | string | |
| `Vkorg`, `Vtweg` | string | Sales organisation, distribution channel |
| `Month` | string `YYYYMM` | One row per material, org, channel, month |
| `Uom` | string | Base unit |
| `Qty` | decimal | Billed quantity in base unit, returns netted |
| `NetValue` | decimal | Net value (VBRP-NETWR) in `Curr` |
| `Curr` | string | Document currency |
| `NetValueInr` | decimal | In INR at billing-date rate, so mixed-currency orgs add up |
| `NBills` | int | Number of billing lines |
| `Msg` | string | |

Source and rules (confirm with SD):
* Tables `VBRK` (header, `FKDAT`, `VKORG`, `VTWEG`, `FKART`, `FKSTO`, `RFBSK`) join `VBRP` (`MATNR`, `FKIMG`, `NETWR`, `VRKME`).
* Exclude cancelled documents (`FKSTO = 'X'`) and the cancellation documents themselves. Credit notes and returns reduce the value (negative billing types), free goods / samples excluded by billing type or item category. Agree the exclusion list with SD and write it into the service.
* Use billing date `FKDAT`, not order date.
* Performance: select through the `VBRK` date index, then `VBRP`. For ranges above 90 days or all-plant runs, read a pre-aggregated table filled by a nightly job (`ZSD_SALES_AGG`: material, org, channel, month, qty, value) instead of the live join.

Authority: standard sales-organisation authority check (`V_VBRK_VKO`) so a user sees only the orgs they are allowed.

### 3.2 `MarginBrandSet` (new, recommended)

One row per finished good with the figures the dashboard table needs, computed once in ABAP so the browser does not cost every FG line by line.

Filters: `Werks`, `MatnrIn`, `BrandIn`, `ProductIn`, `SkuIn`, `VkorgIn`, `VtwegIn`, `DaysBack`, `RateType` (`SELECTED`, `CMAP`, `ACTUAL`, `INFOREC`, `CONTRACT`).

Properties:

| Property | Note |
|---|---|
| `Matnr`, `Maktx`, `Werks`, `Brand`, `Product`, `Sku` | From the material hierarchy |
| `Curr`, `Uom` | |
| `Mrp`, `SellPrice`, `PriceFrom` | Latest, same logic as `SoPriceSet` |
| `StdRm`, `StdPm`, `StdPerf`, `StdConv`, `StdTotal` | Last released CK13N, per unit |
| `RtRm`, `RtPm`, `RtPerf`, `RtConv`, `RtTotal` | Per unit with components valued at `RateType` |
| `RtSource` | Rate type actually used |
| `NoRateCnt` | Components with no rate at that type (so the screen can flag gaps) |
| `Qty`, `NetValue`, `NetValueInr` | From the same logic as 3.1, for the chosen filters |
| `Msg` | |

Rules:
* `RateType = SELECTED` uses the rate SAP selected per BOM line today (the `CostLineSet` selection). The other types take the matching `RateOptions` source for each line, and a line without that source reads as "no rate" and is counted in `NoRateCnt`. It does not fall back silently.
* Perfume is a component group of its own (today `CogmRowSet` has none). Define the perfume group once (material group or material type list, confirm with the business) and use it in both Std and Rt columns.
* A nullable amount is returned empty, never 0, so the screen shows n/a.

If 3.2 cannot be built quickly, the dashboard can run on `CogmRowSet` + `SoPriceSet` + `CostLineSet` for a small selection, but brand-level views of hundreds of FGs would be slow. Treat 3.2 as the performance item.

### 3.3 Monthly history (new or fix)

Needed for the trend chart: per material (or brand / product through the hierarchy), per month, the margin cost at the chosen rate type.

Either verify and fix `CogmHistorySet`, or add `MarginMonthSet` with `Matnr`, `Month`, `RtTotal`, `StdTotal`, `SellPrice`, `Mrp`, `Qty`, `RateType`. Snapshot at month end by a job; history of rates cannot be rebuilt later from live data.

### 3.4 Fix `ActCogm` on NWP (existing issue)

NWP answers every `WacRowSet` request with "Property 'ActCogm' of data object 'WacRow' has no Internal type assigned". Transport the DDIC change so `ActCogm` has an internal type on NWP, as on NGD and NGQ.

### 3.5 Targets and thresholds (optional)

If brand teams want "erosion against target margin" and not only against the CK13N standard: confirm `CogmTargetSet` (material or brand, target margin %, valid from/to) and `CogmRuleSet`, and publish them read-only.

## 4. Phases

| Phase | Content | Needs from SAP | Result on the dashboard |
|---|---|---|---|
| 1 | Margin against standard, no sales value | Nothing new. Use `CogmRowSet`, `SoPriceSet`, `CostLineSet`, `HierVHSet`. Fix 3.4 on NWP. | Table, bridge and simulator for a selected set of FGs. Sales value shown as n/a. |
| 2 | Sales value | 3.1 `SalesValueSet` | Net sales, units, channel / org filter, weighted margins, gross profit lost in rupees. |
| 3 | Brand-level speed and rate types | 3.2 `MarginBrandSet` | All brands and products open fast; selected price / C-MAP / actual / info record / contract in the dropdown. |
| 4 | Trend and targets | 3.3, 3.5 | Monthly margin chart, target line. |

## 5. Acceptance checks (per phase)

1. `SalesValueSet` for one FG, one org, one channel, 90 days equals the sum in VF03 / `VBRP` for the same selection (quantity and value), cancellations and returns netted.
2. `Qty` x average price is consistent with `NetValue` within rounding; `NetValueInr` matches the billing document INR value.
3. `MarginBrandSet` `StdTotal` equals the CK13N total for the same estimate; `RtTotal` with `RateType = SELECTED` equals the `CostLineSet` total for the same FG, plant and quantity.
4. For each `RateType`, `NoRateCnt` equals the count of BOM lines without that source in `RateOptions`.
5. Empty amounts are empty strings in the response, not zero.
6. A user without authority for a sales organisation gets no rows for it.
7. A 90-day read for all FGs of one plant answers in under 15 seconds (or the pre-aggregated table is used).

## 6. Questions to settle with SAP and the business

1. Which billing types count as sales (exclude samples, free goods, inter-company, stock transfers)?
2. Channel: is `VTWEG` the channel the business means, or is a customer group / segment used (the existing `SoPriceSet` also has a `Segment`)?
3. Which currency do export orgs bill in, and is INR at billing-date rate right for the sum?
4. Which materials count as perfume (the dashboard splits RM / PM / perfume / conversion)?
5. Is "selected price" the rate SAP picks per BOM line today (priority order), or a different rule?
6. Brand, product and SKU: do these come from `HierVHSet` only, or are some taken from the product hierarchy `PRODH` / material group?
7. History: from which date should monthly snapshots be kept?

## 7. Not SAP work

* Price response (volume change per 1 % price rise) is a setting in the simulator, not from SAP, unless the business wants it derived from billing history.
* The labels MRP revision / formulation change / packaging change come from simple rules in the browser (price rise needed to restore the margin, and the largest cost increase). The thresholds are agreed with brand teams.
* Everything stays read-only: the dashboard never writes to SAP.
