'use client';

/** Compact Yes/No pill toggle used across both forms for boolean declarations (pre-existing
 * disease, smoker, critical illness, existing cover) — a smaller footprint than a full radio
 * group with labels on each side. */
export default function YesNoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-white p-0.5 border border-border">
      {[
        { label: 'No', v: false },
        { label: 'Yes', v: true },
      ].map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors ${
            value === opt.v ? 'bg-rust text-white' : 'text-inkSoft hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
