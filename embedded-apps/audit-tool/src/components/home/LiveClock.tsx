'use client';

// The time + date text every Fiori screen header shows (handleTimeEvent: toLocaleTimeString,
// refreshed continuously; toDateString for the date).
import { useEffect, useState } from 'react';

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <div className="flex items-center gap-3 text-[12px] font-semibold text-inkSoft">
      <span>{now.toLocaleTimeString()}</span>
      <span>{now.toDateString()}</span>
    </div>
  );
}
