'use client';

import { CalendarClock } from 'lucide-react';
import { fmtDate } from '../lib/format';
import type { MediclaimContext } from '../lib/types';

/** Cut-off notice from ContextSet (WindowOpen = today <= CutOffDate). SAP decides per employee (new-joiner rule, HR bypass) at fetch. */
export default function WindowBanner({ ctx }: { ctx: MediclaimContext }) {
  const date = fmtDate(ctx.CutOffDate);
  if (!date) return null;
  return (
    <div className={`mb-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-semibold ${ctx.WindowOpen ? 'border-blue/30 bg-blueBg text-blue' : 'border-amber/30 bg-amberBg text-amber'}`}>
      <CalendarClock size={15} className="mt-0.5 shrink-0" />
      <span>
        {ctx.WindowOpen
          ? `Mediclaim ${ctx.YearText}: enrolment is open until ${date}.`
          : `Mediclaim ${ctx.YearText}: the cut-off date ${date} has passed. Only new joiners within 30 days of joining (or HR) can still apply.`}
      </span>
    </div>
  );
}
