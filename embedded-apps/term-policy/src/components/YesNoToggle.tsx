'use client';

export default function YesNoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-white p-1 shadow-card">
      {[
        { label: 'No', v: false },
        { label: 'Yes', v: true },
      ].map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.v)}
          className={`rounded-md px-3 py-1 text-[12px] font-bold transition-colors ${
            value === opt.v ? 'bg-rust text-white' : 'text-inkSoft hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
