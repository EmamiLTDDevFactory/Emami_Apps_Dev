'use client';

// The date/time text every MIS screen's title bar shows (onInit + handleTimeEvent in the source
// controllers, which re-set a toLocaleTimeString() on a zero-delay timer).
import { useEffect, useState } from 'react';

export default function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <span className="hidden text-[12px] font-semibold text-inkSoft sm:inline">
      {now.toLocaleTimeString()} · {now.toDateString()}
    </span>
  );
}
