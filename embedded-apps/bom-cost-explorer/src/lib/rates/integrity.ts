/**
 * Rate options integrity: SAP counts the sources it found per line (SrcCount). When fewer option rows come
 * back than it counted (today's $expand bug returns {results: []} for every line), the comparison is
 * incomplete - the screens show one amber banner and still render.
 */
export interface IntegrityLine { SrcCount?: number | null; RateOptions?: unknown[] | null }

export interface RatesIntegrity {
  counted: number; // lines with SrcCount > 0
  affected: number; // of those, lines with fewer option rows than SrcCount
  optionRows: number;
  allEmpty: boolean; // SAP counted sources but returned no option at all
}

export function ratesIntegrity(lines: readonly IntegrityLine[]): RatesIntegrity {
  let counted = 0;
  let affected = 0;
  let optionRows = 0;
  for (const l of lines) {
    const n = l.RateOptions?.length ?? 0;
    optionRows += n;
    const c = Number(l.SrcCount ?? 0);
    if (c > 0) {
      counted++;
      if (n < c) affected++;
    }
  }
  return { counted, affected, optionRows, allEmpty: counted > 0 && optionRows === 0 };
}

export const integrityMessage = (i: RatesIntegrity) =>
  i.affected > 0 ? `SAP returned fewer rate options than it counted (${i.affected.toLocaleString('en-IN')} line${i.affected === 1 ? '' : 's'} affected). The comparison may be incomplete.` : '';
