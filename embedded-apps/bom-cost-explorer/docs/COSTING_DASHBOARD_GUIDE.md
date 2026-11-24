# Costing dashboard: what every tab does

Where: Costing Cockpit, Analysis, **Costing dashboard** (`/dashboard/`). Tabs: MIS, Sales view, Cost breakup, Margin, Budget & rates, AI insights.
All figures are INR. SAP does the heavy work (OData service `ZMM_BOM_COST_SRV`); the browser only adds up, divides and colours. No tab writes to SAP.

## Words used on every tab
| Term | Meaning |
|---|---|
| Plant (billing) | The plant on the invoice item (`VBRP-WERKS`). For sales this is usually a **depot** (DP01, DP02 ...) that sells but does not produce. |
| Plant (production) | The plant that makes the goods (process orders). Actual cost exists only here. |
| FG | Finished good, material type `FERT`. |
| GSV | Gross sales value, the price before discounts. |
| NSV | Net sales value, the billing net value before GST (`VBRP-NETWR`). |
| COGM | Cost of goods manufactured: raw material + packing + perfume + conversion. |
| Budget cost | Approved budget cost per piece, latest approved version of the financial year. |
| NBC | "No Budgeted Cost": no approved budget row exists for the item (or it is trading goods). |
| Lakh | 1,00,000. Tables say "(L)" when the column is in lakh rupees. |

## 1. MIS
**Question it answers:** is the actual COGM above or below the approved budget, by brand?
- **Inputs:** production plants (for example UN13, UN08) and an "As of" date.
- **Actual:** SAP's actual cost of the period for the FGs produced in those plants (RM + PM + perfume + conversion), for month to date (FTM) and financial year to date (YTM).
- **Budget:** the approved budget cost per piece x the **actual** produced quantity (a flexed budget, so volume differences do not show as cost variance).
- **Variance** = actual - budget; **variance %** = variance / budget x 100, measured only on FGs that have a budget.
- **Colour:** red above 3 %, amber above 2 %, otherwise green.
- **Coverage:** FGs with no approved budget are counted ("FG no budget") and left out of the comparison.
- **SAP:** `DashMisSet` (class `ZCL_MM_DASH_MIS`). The budget is read from `ZMM_FBUDCOST_SUM`, like the Margin tab: status A, financial year of the as-of date, latest version, key WERKS (production plant) + CRSSKU + business vertical + scheme + material type (MARA); cost per piece = RM + PM + perfume + machine + labour + power + steam + labour 3P.
- **Drill-down:** click a brand to see its finished goods (YTM quantity, actual and budget per piece, variance %) and the budget key SAP matched in `ZMM_FBUDCOST_SUM` (or could not match). "Show the N finished goods without approved budget" lists the ones behind the warning with the key that was looked for. SAP: the same `DashMisSet` with `Grain eq 'F'` (transport `EDSK9B0EP0`).
- **Variance bridge (staged):** below the table, "Run the bridge" reads `DashBridgeSet` (`ZCL_MM_COGM_BRIDGE`, structure `ZDASH_S_BRIDGE`, transport `EDSK9B0EP0`): budget (flexed) -> raw material / packing / perfume **rate** and **usage** -> material variance of finished goods not analysed -> **overheads** -> mix -> currency -> unexplained -> actual. Rate and usage are split per component from the process-order consumption against `ZMM_FBUDCOST_DET` (usage = (actual qty - budget qty) x budget rate; rate = actual value - actual qty x budget rate) for the finished goods with the largest material variance (config `BRIDGE_FG_MAX`, default 15; `BRIDGE_ORD_MAX`, default 300 orders). Overheads = actual conversion - budget machine, labour, power, steam, labour 3P. **Mix** (no planned volumes: `ZSALES_BUD_TGT` is empty) and **currency** (no budget exchange rate) show n/a with the reason.

## 2. Sales view
**Question:** how much did we invoice, and what is the margin against actual cost?
- **Inputs:** plants (blank = all plants; they carry the actual cost), materials (optional: type or pick Brand, Product, SKU, Material, up to 50), sales organisation and channel (optional), from and to date.
- **Invoices taken:** billing date in the period, FERT, INR; invoice and debit memo add, cancellation and credit memo subtract.
- **GSV:** condition `ZSAL` of the item (an item without `ZSAL` counts its net value, so no deduction). **NSV:** billing net value. **Deductions** = GSV - NSV.
- **COGM (sold volume):** SAP actual cost **per piece** of the period for that material in the **cost plants** x the **sold** quantity.
- **Gross margin** = NSV - COGM, only for lines that have an actual cost. **GM %** = gross margin / NSV x 100; colour from the bands in `ZMIS_ALERT_THR` (default red below 18 %, amber below 22 %).
- **Cost plants:** the plant box filters the BILLING plant (a depot such as DP01 sells but does not produce). The actual cost per piece is always read in every plant, for the materials that were sold, over the same dates, and averaged by produced quantity. So a depot now shows COGM, COGM/pc, GM/pc and GM %. A line still shows "no actual cost" when the material was not produced in the period; if the cost read itself failed (for example too many rows) SAP adds the reason to the note.
- **Sold qty** is shown in pieces. Rows are sorted by NSV.
- **Bridge at the bottom (price, volume, mix, cost):** needs an approved sales budget in `ZSALES_BUD_TGT`. It is empty, so the bridge says "No approved sales budget".
- **SAP:** `DashSalesSet` (`ZCL_MM_DASH_SALES`), `DashPvmSet` (`ZCL_SALES_PVM_BRIDGE`), `DashThreshSet` (table `ZMIS_ALERT_THR`).

**Product drill-down and invoice details (Sales view, MIS, Cost breakup, Margin):** a brand row opens its products (Sales view: click the brand; MIS: click the brand, finished goods are grouped by product; Cost breakup: "By product" table; Margin: Group by "Brand · product"). Product = the product-hierarchy code of the material (`MARA-PRODH`), shown with its management name. Sales view selection also has **Invoice no.**; the SKU table has **Product** and **Sales org** columns, and a click on a SKU line (or the **Invoices** button, which needs a material, sales organisation or invoice number) lists the invoices behind it: invoice, date, sales org, channel, material, quantity, GSV, NSV, COGM, GM %. SAP: `DashSalesSet` grains `P` (product) and `I` (invoice, filter `Grain eq 'I'`, at most 20,000 lines), `DashMisSet` / `DashMarginSet` field `Prodha` (transport `EDSK9B0EP0`).

## 3. Cost breakup
**Question:** of the cost per piece, how much is RM, PM, perfume and conversion?
- **Inputs:** production plants and period. Source: SAP actual cost per piece of the period, by group, for FGs produced in those plants.
- Brand rows are quantity-weighted (total group cost / total quantity). Share % = group / total COGM per piece.
- No budget split and no scheme dimension (not built).

## 4. Margin (invoice-condition margin analysis)
**Question:** what is the margin on invoiced sales, what drives it, and what if prices, promos or costs change?
- **Selection:** materials (type, or pick Brand, Product, SKU, Material like BOM costing, up to 50), sales organisation, channel, CRSSKU, invoice number (any combination; at least one of materials, sales org, CRSSKU or invoice) and the dates. The dates always apply. The plant box is gone.
- **Per invoice item the SAP class reads these conditions:** MRP `ZMRP` (or `ZNMR`); selling price `ZP12`; GST `JOIG`+`JOCG`+`JOSG`; channel margins retailer `ZREM`+`ZTDP`, distributor `ZDIM`+`ZTDM`, super stockist `ZSSM`+`ZTSM`; cost `ZRMP` (RM), `ZPMP` (PM), `ZPFP` (perfume), `ZOHP` (overhead); consumer scheme `ZRSP`/`ZPSP`/`ZFCP`/`ZOSP`; trade scheme `ZRTS`/`ZPTP`/`ZFTS`/`ZOTP`. Cost conditions are taken as positive amounts.
- **Formulas (yours):** Gross sales = selling price + GST. COGS = RM + PM + perfume + overhead + scheme costs. **Gross margin = revenue - COGS; GM % = gross margin / revenue x 100.** Revenue = gross sales by default (switch to selling price).
- **Budget match:** `ZMM_FBUDCOST_SUM`, financial year of the "to" date, status A, highest version, on the table key: **WERKS = valuation type of the invoiced batch (`VBRP-BWTAR`, blank is a valid value)** + CRSSKU (`MARA-ZSKUGRCODECRS`) + business vertical (`MARA-ZBUSINESS`) + scheme (`MARA-ZSCHEME`) + material type (`MARA-MTART`). A SKU row is therefore one per material **and valuation type**. Budget overhead = MACHINE + LABOUR + POWER + STEAM + LABOUR3P. No match = **NBC**.
- **Groups:** brand, product category (material group), **material** (code, quantity, selling price, gross sales, revenue, COGS, margin), customer.
- **What if:** sliders for selling price, promo discount, volume, RM, PM, perfume, overhead, scheme cost. Costs and revenue are recomputed for every line, then added up. Also shown: which driver moves margin most (+5 %), and the extra volume a promo needs to break even.
- **As per current COGM:** upload a CSV (Matnr + Cogm per piece, or Matnr + Rm, Pm, Pf, Oh per piece). It replaces the invoice base cost of those SKUs, and a table shows the cost-driver difference (invoice vs current).
- **Cost breakup (drill-down):** in the Material group, press **Breakup**. SAP takes the batches sold for that material, finds their process orders (`ZMB31_POUTILITY`, post type 01), runs `ZCL_AUFM_UTILITY3` and returns the components. WIP cost is ignored and its own components are kept. Components are grouped into raw material (ROH), packing (VERP/PKGN) and perfume (ROH, material group 106), averaged per piece weighted by sold quantity, and compared with the invoice cost conditions. Batches without a process order show "NBC / Trading goods". At most 150 process orders per request. Below the actual components the drawer shows the **budget items**: for every valuation type of the sold items the matched `ZMM_FBUDCOST_SUM` row (same key as above) and its `ZMM_FBUDCOST_DET` rows (component, quantity, budget cost per piece); NBC when there is no approved budget.
- **Component comparison (in the Breakup drawer):** side by side per component, per piece: actual (process-order consumption), approved budget (`ZMM_FBUDCOST_DET` of the chosen valuation type) and the cost at a **rate type** (BOM quantity per piece x the rate of that type: Selected (SAP), Consumption, C-MAP, Budget landed ...). The rate cost needs live BOM costing of the finished good in a production plant, so press **Cost at rate type** (the plant defaults to the valuation type when it looks like a plant). Variance = figure - budget, red when it costs more, green when less (within 0.5 % not coloured); components missing on one side are flagged "not in budget" / "not consumed"; totals per category and overall.
- **SAP:** `DashMarginSet` (`ZCL_MM_DASH_MARGIN`, structure `ZDASH_S_MARGIN`), `DashCdrillSet` (`ZCL_MM_DASH_CDRILL`).

## 5. Budget & rates
Links to the existing screens: Budget cost of finished goods, Component rates, Raw material budget rates, Packing budget rate. It also shows which budget version the MIS tab used.

## 6. AI insights
Rule-based notes made from the MIS result (no language model): overall variance, brands above the amber or red threshold, and FGs without a budget. Run MIS first.

## SAP objects and transports
- Packing: `EDSK9B0EL5`. Dashboard sets: `EDSK9B0EM6` (released), margin: `EDSK9B0EMZ` (released), selection filters and cost-sign fix: `EDSK9B0EN5`, margin cost drill-down: `EDSK9B0EN7` (released), budget match by valuation type and budget items: `EDSK9B0ENN` (released), material / sales org / channel filters on Margin and Sales view and the MIS budget from `ZMM_FBUDCOST_SUM`: `EDSK9B0ENZ`, no 150-order limit on the Breakup drill-down: `EDSK9B0EOQ`.
- Tables: `ZMIS_ALERT_THR` (alert bands), `ZSALES_BUD_TGT` (sales budget, empty).
- After an import: clear the gateway caches (`/IWFND/CACHE_CLEANUP`, `/IWBEP/CACHE_CLEANUP`).

## Cost breakup: activity price period
Machine, Labour, Power and Steam are SAP routing activities priced with the activity prices of one fiscal period. The default is **automatic**: the app sends `Poper = 999` and `ZCL_MM_BOM_COST_ACT` prices each material in the period of its latest cost estimate (`KEKO`, version 01), so the value ties to CK13N. A material without an estimate uses the current period. The selector can force a fixed period. A system without the class change returns no priced rows for `999`; the app then falls back to the current period. Transport `EDSK9B0ENZ` (class `ZCL_MM_BOM_COST_ACT`).

## Known gaps
1. (Closed) MIS and Margin both read `ZMM_FBUDCOST_SUM`.
2. Sales view and MIS use "actual cost of the period" (SAP WAC); the Margin tab uses the invoice cost conditions or your current-COGM file.
3. Sales budget (`ZSALES_BUD_TGT`) is empty, so the price-volume-mix bridge shows nothing.
4. Five-way variance bridge, projection and scheme breakup are not built.
