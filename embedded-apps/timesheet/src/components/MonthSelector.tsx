import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, formatMonthLabel, parseISODate, toISODate } from '../utils/date';

export default function MonthSelector({
  monthStartDate,
  onChange,
  maxMonthStartDate,
}: {
  monthStartDate: string;
  onChange: (v: string) => void;
  maxMonthStartDate?: string;
}) {
  const atMax = maxMonthStartDate ? monthStartDate >= maxMonthStartDate : false;

  function shift(n: number) {
    onChange(toISODate(addMonths(parseISODate(monthStartDate), n)));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous month"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-inkSoft hover:bg-appBg focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="min-w-[9rem] select-none text-center text-sm font-medium text-ink">{formatMonthLabel(monthStartDate)}</div>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atMax}
        aria-label="Next month"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-inkSoft hover:bg-appBg disabled:opacity-40 disabled:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <ChevronRight size={16} />
      </button>
      {!atMax && (
        <button
          type="button"
          onClick={() => onChange(maxMonthStartDate!)}
          className="ml-1 text-sm font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline"
        >
          This month
        </button>
      )}
    </div>
  );
}
