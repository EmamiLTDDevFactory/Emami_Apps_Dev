/**
 * How rate sources are named on screen. SAP's code MBEW is shown as "C-MAP" (current moving average price) in every
 * heading, badge and label; requests, filters, the priority string and exports of SAP fields keep SAP's code.
 */
export const SOURCE_LABEL: Record<string, string> = { MBEW: 'C-MAP' };
export const sourceLabel = (code: string | null | undefined): string => {
  const c = String(code ?? '').trim();
  return SOURCE_LABEL[c.toUpperCase()] ?? c;
};
