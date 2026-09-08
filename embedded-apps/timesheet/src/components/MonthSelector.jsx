import { addMonths, formatMonthLabel, parseISODate, toISODate } from '../utils/date'

export default function MonthSelector({ monthStartDate, onChange, maxMonthStartDate }) {
  const atMax = maxMonthStartDate ? monthStartDate >= maxMonthStartDate : false

  function shift(n) {
    onChange(toISODate(addMonths(parseISODate(monthStartDate), n)))
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous month"
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        ‹
      </button>
      <div className="min-w-[9rem] text-center text-sm font-medium text-slate-800 select-none">
        {formatMonthLabel(monthStartDate)}
      </div>
      <button
        type="button"
        onClick={() => shift(1)}
        disabled={atMax}
        aria-label="Next month"
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        ›
      </button>
      {!atMax && (
        <button
          type="button"
          onClick={() => onChange(maxMonthStartDate)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium ml-1 focus:outline-none focus-visible:underline"
        >
          This month
        </button>
      )}
    </div>
  )
}
