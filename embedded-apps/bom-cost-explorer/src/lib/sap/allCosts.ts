/**
 * "All costs" on the BOM costing screen: the cost figures CostLineSet carries that the screens did not read before (actual rate,
 * BOM source). Behind NEXT_PUBLIC_ALL_COSTS_ENABLED (default false; next.config.mjs sets it for deployed builds). Off = the costing
 * call sends exactly the $select it always did and the Excel has exactly its old columns.
 */
export const ALL_COSTS_ENABLED = String(process.env.NEXT_PUBLIC_ALL_COSTS_ENABLED ?? 'false').toLowerCase() === 'true';
/** CostLine properties that are only read (and only selected) with the flag on. */
export const ALL_COSTS_PROPS: ReadonlySet<string> = new Set(['ActRatePc', 'ActRatePcInr', 'BomSrc', 'BomPlant', 'BomSrcDate']);
export const costPropVisible = (name: string, on: boolean = ALL_COSTS_ENABLED): boolean => on || !ALL_COSTS_PROPS.has(name);
