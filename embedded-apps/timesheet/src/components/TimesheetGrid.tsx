'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LogIn, LogOut, MapPin, X, Check, Plus } from 'lucide-react';
import {
  formatDayNum,
  formatDayOrdinal,
  formatWeekday,
  isOffDay,
  isWorkingSaturday,
  hoursBetween,
  monthDays,
  parseISODate,
  toISODate,
} from '../utils/date';
import { ACCRUAL_LEAVE_TYPES, MAX_HOURS_PER_DAY } from '../utils/timesheet';
import { useToast } from '../context/ToastContext';
import { useApp } from '../context/AppContext';

type AnyRecord = Record<string, any>;

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Earned Leave', 'Public Holiday'];
const DEFAULT_IN_TIME = '10:00';
const DEFAULT_OUT_TIME = '18:00';

interface Line {
  taskId: string;
  description: string;
}
interface DayRow {
  inTime: string;
  outTime: string;
  inLocation: string;
  inLocationAt: string;
  outLocation: string;
  outLocationAt: string;
  lines: Line[];
  leaveType: string;
  leaveNote: string;
}
type DayMap = Record<string, DayRow>;

function emptyLine(): Line {
  return { taskId: '', description: '' };
}

function emptyRow(): DayRow {
  return {
    inTime: DEFAULT_IN_TIME,
    outTime: DEFAULT_OUT_TIME,
    inLocation: '',
    inLocationAt: '',
    outLocation: '',
    outLocationAt: '',
    lines: [emptyLine()],
    leaveType: '',
    leaveNote: '',
  };
}

// Pre-fills every working day that has no saved entries yet with the default in/out time, so a
// fresh month starts at the standard 10-18 shift instead of a blank grid. Today is left blank
// instead - it's clocked in/out live (see `punch` below), so it should start showing the "Clock
// In" button, not a pre-filled shift nobody actually walked in for.
function withDefaultTimes(map: DayMap, days: string[], todayIso: string, workingDayOverrides?: Set<string>): DayMap {
  const next = { ...map };
  days.forEach((dateIso) => {
    if (next[dateIso]) return;
    if (isOffDay(parseISODate(dateIso), workingDayOverrides)) return;
    next[dateIso] = dateIso === todayIso ? { ...emptyRow(), inTime: '', outTime: '' } : emptyRow();
  });
  return next;
}

// Groups flat entries (possibly several per date) back into one row per date, each carrying a
// line per task worked that day (or a leaveType if the whole day was taken as leave / a public
// holiday).
function entriesToDayMap(entries: AnyRecord[]): DayMap {
  const map: DayMap = {};
  entries.forEach((e) => {
    if (!map[e.date]) {
      map[e.date] = {
        inTime: e.inTime || '',
        outTime: e.outTime || '',
        inLocation: e.inLocation || '',
        inLocationAt: e.inLocationAt || '',
        outLocation: e.outLocation || '',
        outLocationAt: e.outLocationAt || '',
        lines: [],
        leaveType: '',
        leaveNote: '',
      };
    }
    if (e.leaveType) {
      map[e.date].leaveType = e.leaveType;
      map[e.date].leaveNote = e.note || '';
    } else {
      map[e.date].lines.push({ taskId: e.taskId || '', description: e.note || '' });
    }
  });
  Object.values(map).forEach((row) => {
    if (row.lines.length === 0 && !row.leaveType) row.lines.push(emptyLine());
  });
  return map;
}

function isLineEmpty(line: Line) {
  return !line.taskId && !line.description;
}

// Row background + accent styling for the day-type of a given date.
function dayRowTone(date: Date, workingDayOverrides?: Set<string>) {
  if (isWorkingSaturday(date, workingDayOverrides)) {
    return { row: 'bg-blueBg/60', dayText: 'text-blue', badge: { label: 'Working Sat', cls: 'bg-blueBg text-blue' } };
  }
  if (isOffDay(date, workingDayOverrides)) {
    return { row: 'bg-appBg', dayText: 'text-inkSoft font-semibold', badge: { label: 'Off', cls: 'bg-border text-inkSoft' } };
  }
  return { row: '', dayText: 'text-inkSoft', badge: null as { label: string; cls: string } | null };
}

function LeaveSelect({
  dateIso,
  value,
  onChange,
  disabled,
  className = 'mt-1 py-1 text-[11px]',
}: {
  dateIso: string;
  value: string;
  onChange: (dateIso: string, value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={`Leave status on ${formatDayNum(parseISODate(dateIso))}`}
      value={value}
      onChange={(e) => onChange(dateIso, e.target.value)}
      disabled={disabled}
      className={`w-full rounded-md border border-border bg-white px-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60 ${className}`}
    >
      <option value="">Present</option>
      {LEAVE_TYPES.map((lt) => (
        <option key={lt} value={lt}>
          {lt}
        </option>
      ))}
    </select>
  );
}

// One-tap "Clock In" / "Clock Out" action - stamps the current time immediately and geotags it
// in the background (see `punch` below). Green for in, red for out, matching the tone most
// attendance apps use for start/stop.
function PunchButton({
  label,
  tone,
  locating,
  disabled,
  disabledTitle,
  onClick,
  compact,
}: {
  label: string;
  tone: 'in' | 'out';
  locating?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const toneCls = tone === 'in' ? 'border-green/30 bg-greenBg text-green hover:bg-green/15 focus-visible:ring-green' : 'border-red/30 bg-redBg text-red hover:bg-red/15 focus-visible:ring-red';
  const Icon = tone === 'in' ? LogIn : LogOut;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || locating}
      title={disabled ? disabledTitle : undefined}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-40 disabled:cursor-not-allowed ${toneCls} ${
        compact ? 'w-full justify-center px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-[11px]'
      }`}
    >
      {locating ? 'Locating…' : (
        <>
          <Icon size={12} />
          {label}
        </>
      )}
    </button>
  );
}

// Displays a captured punch (time + geotagged place). `onReset` (today only, still editable)
// clears it so a mis-tap can be redone; without it (read-only, or a past day) it's plain display.
// The desktop table shows a box the same height as the time inputs on other rows - the time, a
// location pin (green if captured, grey if not) and a small reset icon - with the place name as
// small text underneath (truncated, full name on hover). Mobile cards use the compact layout.
function PunchResult({
  time,
  location,
  onReset,
  compact,
}: {
  time: string;
  location?: string;
  onReset?: () => void;
  compact?: boolean;
}) {
  const resetButton = onReset && (
    <button
      type="button"
      onClick={onReset}
      title="Reset"
      aria-label={`Reset ${time}`}
      className="shrink-0 text-inkSoft hover:text-red focus:outline-none focus-visible:text-red"
    >
      <X size={13} />
    </button>
  );

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {time}
          {resetButton}
        </span>
        {location ? (
          <span className="flex max-w-full items-center gap-0.5 truncate text-[10px] text-green">
            <MapPin size={9} className="shrink-0" />
            <span className="truncate">{location}</span>
          </span>
        ) : (
          <span className="text-[10px] italic text-inkSoft">No location captured</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-0.5">
      <div className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-md border border-border bg-white px-1.5 text-xs">
        <span className="font-semibold text-ink">{time}</span>
        <span title={location || 'No location captured'} aria-label={location || 'No location captured'} className={`shrink-0 ${location ? 'text-green' : 'text-inkSoft/50'}`}>
          <MapPin size={13} />
        </span>
        {resetButton}
      </div>
      {location ? (
        <span title={location} className="truncate text-[10px] leading-tight text-green">
          {location}
        </span>
      ) : (
        <span className="text-[10px] italic leading-tight text-inkSoft">No location captured</span>
      )}
    </div>
  );
}

interface TimesheetGridProps {
  userId: string;
  tasks: AnyRecord[];
  monthStartDate: string;
  initialEntries: AnyRecord[];
  readOnly?: boolean;
  workingDayOverrides?: Set<string>;
  onEntriesChange?: (entries: AnyRecord[], totals: AnyRecord) => void;
  onAutosave?: (entries: AnyRecord[]) => void;
  autosaveDelay?: number;
}

const TimesheetGrid = forwardRef<{ loadEntries: (entries: AnyRecord[]) => void }, TimesheetGridProps>(function TimesheetGrid(
  { userId, tasks, monthStartDate, initialEntries, readOnly, workingDayOverrides, onEntriesChange, onAutosave, autosaveDelay = 700 },
  ref
) {
  const days = useMemo(() => monthDays(monthStartDate).map((d) => toISODate(d)), [monthStartDate]);
  const todayIso = toISODate(new Date());
  const initDayMap = (entries: AnyRecord[]) => {
    const map = entriesToDayMap(entries);
    return readOnly ? map : withDefaultTimes(map, days, todayIso, workingDayOverrides);
  };
  const [dayMap, setDayMap] = useState<DayMap>(() => initDayMap(initialEntries));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  // `${date}_in` or `${date}_out` while that punch's geolocation lookup is in flight.
  const [locatingKey, setLocatingKey] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const savedAtTimer = useRef<ReturnType<typeof setTimeout>>();
  // Whichever of these is actually visible at the current breakpoint (the other stays unmounted-
  // looking via CSS only, so scrollIntoView on it is a harmless no-op) - used to jump straight to
  // today's row/card on open instead of leaving a daily user to scroll and find it themselves.
  const todayRowRef = useRef<HTMLTableRowElement>(null);
  const todayCardRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { getLeaveBalance } = useApp();
  // The yearly leave pool a manager has set for this person. `serverBalance` only moves once
  // the server has recomputed it (a network round-trip after autosave), so we track an
  // optimistic `balanceAdjustment` that moves the instant a day is marked/unmarked as leave -
  // same tick as "Total leave this month" below, which is purely local state. The adjustment
  // resets to 0 whenever serverBalance itself changes (the round-trip caught up and now agrees
  // with what was already shown) or the viewed month/user changes.
  const serverBalance = getLeaveBalance(userId).balance;
  const [balanceAdjustment, setBalanceAdjustment] = useState(0);
  const leaveBalance = serverBalance + balanceAdjustment;

  useEffect(() => {
    setBalanceAdjustment(0);
  }, [serverBalance]);

  // reset local edit state when the viewed month/timesheet changes
  useEffect(() => {
    setDayMap(initDayMap(initialEntries));
    setSaveState('idle');
    setBalanceAdjustment(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartDate, userId]);

  // Jump straight to today's row/card once, whenever a month that actually contains today is
  // opened - self-limiting for a past/future month (todayIso just isn't in `days`, so this is a
  // no-op) rather than needing its own separate "is this the current month" check. Deliberately
  // scoped to the same deps as the reset effect above, not every dayMap edit, so typing into a
  // description field doesn't yank the scroll position back to today mid-edit.
  useEffect(() => {
    if (!days.includes(todayIso)) return;
    todayRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    todayCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartDate, userId]);

  // Each meaningful task line for a day shares that day's in/out time and splits the day's total
  // hours evenly between the lines actually used. A day marked as leave (including "Public
  // Holiday") produces a single entry instead, crediting a full day's expected hours on working
  // days.
  function buildEntries(map: DayMap) {
    const entries: AnyRecord[] = [];
    for (const date of days) {
      const row = map[date];
      if (!row) continue;
      if (row.leaveType) {
        // Leave days contribute 0h to worked-hours totals - they're tracked separately as "Total
        // leave", not folded into hours worked.
        entries.push({
          id: `${userId}_${date}_leave`,
          userId,
          projectId: null,
          taskId: null,
          date,
          inTime: '',
          outTime: '',
          inLocation: '',
          inLocationAt: '',
          outLocation: '',
          outLocationAt: '',
          hours: 0,
          note: row.leaveNote || '',
          leaveType: row.leaveType,
        });
        continue;
      }
      const totalHours = hoursBetween(row.inTime, row.outTime);
      const lines = row.lines.length ? row.lines : [emptyLine()];
      // Hours count from In/Out time alone - a task isn't required. A day with no time set at
      // all (both blank) still contributes nothing; days the user didn't work should be marked
      // Leave to exclude them.
      const meaningfulLines = lines.filter((l, i) => !isLineEmpty(l) || (i === 0 && (row.inTime || row.outTime)));
      if (meaningfulLines.length === 0) continue;
      const perLineHours = Math.round((totalHours / meaningfulLines.length) * 100) / 100;
      meaningfulLines.forEach((line, idx) => {
        const task = tasks.find((t) => t.id === line.taskId);
        entries.push({
          id: `${userId}_${date}_${idx}`,
          userId,
          projectId: task?.projectId || null,
          taskId: line.taskId || null,
          date,
          inTime: row.inTime,
          outTime: row.outTime,
          inLocation: row.inLocation || '',
          inLocationAt: row.inLocationAt || '',
          outLocation: row.outLocation || '',
          outLocationAt: row.outLocationAt || '',
          hours: perLineHours,
          note: line.description || '',
        });
      });
    }
    return entries;
  }

  // Derived straight from buildEntries so the displayed totals can never drift from what
  // actually gets saved (a day with no logged task/description contributes 0h here, matching
  // what autosave persists).
  const totals = useMemo(() => {
    const perDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const perTask: Record<string, number> = Object.fromEntries(tasks.map((t) => [t.id, 0]));
    let month = 0;
    let leaveDays = 0;
    buildEntries(dayMap).forEach((e) => {
      perDay[e.date] = (perDay[e.date] || 0) + e.hours;
      month += e.hours;
      if (e.taskId) perTask[e.taskId] = (perTask[e.taskId] || 0) + e.hours;
      if (e.leaveType) leaveDays += 1;
    });
    return { perDay, perTask, month, leaveDays };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMap, tasks, days]);

  useEffect(() => {
    onEntriesChange?.(buildEntries(dayMap), totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMap, totals]);

  useImperativeHandle(ref, () => ({
    // `entries` must already carry dates within the currently displayed month.
    loadEntries(entries: AnyRecord[]) {
      const mapped = entriesToDayMap(entries);
      setDayMap(mapped);
      scheduleAutosave(mapped);
    },
  }));

  // Refreshing/closing the tab inside the autosave debounce window used to drop that last change
  // (e.g. a punch's location landing right before a reload) - flush it on the way out instead.
  const pendingAutosave = useRef<DayMap | null>(null);
  useEffect(() => {
    function flush() {
      if (!pendingAutosave.current || !onAutosave) return;
      clearTimeout(saveTimer.current);
      onAutosave(buildEntries(pendingAutosave.current));
      pendingAutosave.current = null;
    }
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });

  function scheduleAutosave(nextMap: DayMap) {
    if (readOnly || !onAutosave) return;
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    pendingAutosave.current = nextMap;
    saveTimer.current = setTimeout(() => {
      pendingAutosave.current = null;
      onAutosave(buildEntries(nextMap));
      setSaveState('saved');
      clearTimeout(savedAtTimer.current);
      savedAtTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    }, autosaveDelay);
  }

  function updateDayField(date: string, patch: Partial<DayRow>) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow();
      const nextRow = { ...current, ...patch };
      const nextMap = { ...prev, [date]: nextRow };
      scheduleAutosave(nextMap);
      return nextMap;
    });
  }

  // Resolves coordinates to a human-readable place name (e.g. "Emami Tower") via OpenStreetMap's
  // free reverse-geocoding lookup, falling back to raw coordinates if the lookup fails or times
  // out.
  async function resolvePlaceName(latitude: number, longitude: number) {
    const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
      if (!res.ok) return coords;
      const data = await res.json();
      const addr = data.address || {};
      const name = data.name || addr.amenity || addr.building || addr.office || addr.shop || addr.road;
      if (name) return name;
      return data.display_name ? data.display_name.split(',').slice(0, 2).join(',').trim() : coords;
    } catch {
      return coords;
    }
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // One-tap Clock In / Clock Out: stamps the time immediately (that's the part that must never
  // fail or wait on a GPS fix), then geotags it in the background. A denied/unsupported/timed-out
  // location never blocks the punch itself - it just leaves that punch's location blank.
  function punch(date: string, which: 'in' | 'out') {
    const timeField = which === 'in' ? 'inTime' : 'outTime';
    const locationField = which === 'in' ? 'inLocation' : 'outLocation';
    const locationAtField = which === 'in' ? 'inLocationAt' : 'outLocationAt';
    const time = nowHHMM();
    updateDayField(date, { [timeField]: time } as Partial<DayRow>);

    if (!navigator.geolocation) {
      showToast(`Clocked ${which} at ${time}. Location isn't supported on this device/browser.`, 'info');
      return;
    }
    const key = `${date}_${which}`;
    setLocatingKey(key);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const place = await resolvePlaceName(latitude, longitude);
        updateDayField(date, { [locationField]: place, [locationAtField]: new Date().toISOString() } as Partial<DayRow>);
        setLocatingKey((k) => (k === key ? null : k));
        showToast(`Clocked ${which} at ${time} · ${place}`, 'success');
      },
      (error) => {
        setLocatingKey((k) => (k === key ? null : k));
        showToast(`Clocked ${which} at ${time}. ${error.message || 'Could not capture location.'}`, 'info');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Clears a mis-tapped punch (time + its location) so it can be redone - today only, before the
  // day is locked in by submission. Resetting the clock-in also clears the clock-out: otherwise
  // re-clocking in after already clocking out leaves an out time earlier than the new in time
  // (0h for the day).
  function resetPunch(date: string, which: 'in' | 'out') {
    const clearOut = { outTime: '', outLocation: '', outLocationAt: '' };
    updateDayField(date, (which === 'in' ? { inTime: '', inLocation: '', inLocationAt: '', ...clearOut } : clearOut) as Partial<DayRow>);
  }

  // Setting a leave type clears any time/task entries for that day (leave and working hours are
  // mutually exclusive); clearing it (back to "Present") restores the default in/out time for
  // re-entry - except for today, which is clocked in/out live and so goes back to blank (showing
  // the "Clock In" button) instead of a pre-filled shift.
  function setLeaveType(date: string, value: string) {
    // Only Sick/Casual/Earned draw from the yearly pool - adjust the optimistic balance display
    // the instant one of those is picked or cleared, same tick as the day's own "Present"/leave-
    // type badge, well before autosave round-trips to confirm it.
    const wasAccrual = ACCRUAL_LEAVE_TYPES.includes(dayMap[date]?.leaveType);
    const willBeAccrual = ACCRUAL_LEAVE_TYPES.includes(value);
    if (wasAccrual !== willBeAccrual) {
      setBalanceAdjustment((adj) => adj + (willBeAccrual ? -1 : 1));
    }
    setDayMap((prev) => {
      const current = prev[date] || emptyRow();
      const clearedTimes = date === todayIso ? { inTime: '', outTime: '' } : { inTime: DEFAULT_IN_TIME, outTime: DEFAULT_OUT_TIME };
      const nextRow: DayRow = value
        ? { ...current, leaveType: value, inTime: '', outTime: '', inLocation: '', inLocationAt: '', outLocation: '', outLocationAt: '', lines: [emptyLine()] }
        : { ...current, leaveType: '', leaveNote: '', ...clearedTimes };
      const nextMap = { ...prev, [date]: nextRow };
      scheduleAutosave(nextMap);
      return nextMap;
    });
  }

  function updateLine(date: string, lineIndex: number, patch: Partial<Line>) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow();
      const lines = current.lines.length ? [...current.lines] : [emptyLine()];
      lines[lineIndex] = { ...lines[lineIndex], ...patch };
      const nextMap = { ...prev, [date]: { ...current, lines } };
      scheduleAutosave(nextMap);
      return nextMap;
    });
  }

  function addLine(date: string) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow();
      const lines = [...(current.lines.length ? current.lines : [emptyLine()]), emptyLine()];
      const nextMap = { ...prev, [date]: { ...current, lines } };
      scheduleAutosave(nextMap);
      return nextMap;
    });
  }

  function removeLine(date: string, lineIndex: number) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow();
      if (current.lines.length <= 1) return prev;
      const lines = current.lines.filter((_, i) => i !== lineIndex);
      const nextMap = { ...prev, [date]: { ...current, lines } };
      scheduleAutosave(nextMap);
      return nextMap;
    });
  }

  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      clearTimeout(savedAtTimer.current);
    },
    []
  );

  if (tasks.length === 0) {
    return (
      <div className="glass-card border-dashed p-8 text-center text-sm text-inkSoft">
        No tasks are assigned to you yet. Ask your manager to assign some in Manage Team.
      </div>
    );
  }

  function taskLabel(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    return task ? `${task.projectName} · ${task.name}` : '-';
  }

  // Tasks already picked by this day's other lines are hidden from a line's dropdown so the
  // same module can't be logged twice in one day.
  function availableTasks(lines: Line[], lineIndex: number) {
    const usedElsewhere = new Set(
      lines
        .filter((_, i) => i !== lineIndex)
        .map((l) => l.taskId)
        .filter(Boolean)
    );
    return tasks.filter((t) => !usedElsewhere.has(t.id));
  }

  return (
    <div>
      {!readOnly && (
        <div className="mb-2 flex justify-end">
          <SaveIndicator state={saveState} />
        </div>
      )}

      {/* Desktop / tablet: one row per day (multiple lines if 2+ tasks that day). Boxed with its
          own scrollbar (fixed height, overflow-auto) instead of growing the whole page - the
          header row's sticky top-0 below sticks relative to THIS scrolling box once it has
          overflow set on it, so it's a spreadsheet-style frozen header over scrolling data,
          not the page-level sticky this had before. */}
      <div className="glass-card hidden md:block md:max-h-[65vh] md:overflow-auto">
        {/* table-fixed + percentage widths on the header row, instead of the old min-w/auto-layout
            combo - on a full-width page (see Shell.tsx) that let the browser redistribute leftover
            space unevenly between columns, leaving odd gaps and a wrapping "Hours of Work" header.
            Percentages give Task/Task Description (free-text entry, the widest actual content) most
            of the room, while the narrow fixed-value columns stay a predictable, non-wrapping size. */}
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-glassRust bg-white">
              <th scope="col" className="sticky left-0 top-0 z-30 w-[8%] whitespace-nowrap bg-white px-3 py-3 text-left font-semibold text-inkSoft">
                Date
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[9%] bg-white px-3 py-3 text-left font-semibold text-inkSoft">
                Day
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[10%] whitespace-nowrap bg-white px-2 py-3 text-left font-semibold text-inkSoft">
                Attendance
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[9%] whitespace-nowrap bg-white px-2 py-3 text-center font-semibold text-inkSoft">
                In Time
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[9%] whitespace-nowrap bg-white px-2 py-3 text-center font-semibold text-inkSoft">
                Out Time
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[9%] whitespace-nowrap bg-white px-2 py-3 text-center font-semibold text-inkSoft">
                Hours of Work
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[17%] bg-white px-2 py-3 text-center font-semibold text-inkSoft">
                Task
              </th>
              <th scope="col" className="sticky top-0 z-20 w-[29%] bg-white px-2 py-3 text-left font-semibold text-inkSoft">
                Task Description
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((dateIso) => {
              const date = parseISODate(dateIso);
              const tone = dayRowTone(date, workingDayOverrides);
              const row = dayMap[dateIso] || emptyRow();
              const onLeave = !!row.leaveType;
              const hours = totals.perDay[dateIso];
              const working = !isOffDay(date, workingDayOverrides);
              const zero = !onLeave && working && hours === 0;
              const over = hours > MAX_HOURS_PER_DAY;
              const rowTint = onLeave ? 'bg-tealBg/60' : tone.row;
              // The one row a daily user actually comes here for - a left accent bar makes it
              // findable at a glance instead of blending into the rest of the month.
              const isToday = dateIso === todayIso;
              // Only today's row can be filled in - every other date is shown but disabled.
              const locked = !readOnly && !isToday;
              const todayRowCls = isToday ? 'border-l-4 border-l-rust' : '';
              const todayBadge = isToday && (
                <span className="inline-block rounded-full bg-rust px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Today</span>
              );

              if (onLeave) {
                return (
                  <tr key={dateIso} ref={isToday ? todayRowRef : undefined} className={`border-b border-border last:border-0 ${rowTint} ${todayRowCls}`}>
                    <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left align-middle font-semibold text-ink ${rowTint || 'bg-white'}`}>
                      <div className="flex flex-col items-start gap-0.5">
                        <span>{formatDayOrdinal(date)}</span>
                        {todayBadge}
                      </div>
                    </th>
                    <td className="px-3 py-2 align-middle">
                      <span className={`whitespace-nowrap font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {!readOnly && !isOffDay(date, workingDayOverrides) ? (
                        <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} disabled={locked} className="py-1.5 text-xs" />
                      ) : (
                        <span className="inline-block whitespace-nowrap rounded-full bg-tealBg px-2 py-0.5 text-[10px] font-medium text-teal">{row.leaveType}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center align-middle text-inkSoft">-</td>
                    <td className="px-2 py-2 text-center align-middle text-inkSoft">-</td>
                    <td className="px-2 py-2 text-center align-middle">
                      <span className="inline-block rounded-md bg-tealBg px-2 py-1 text-xs font-semibold text-teal">0h</span>
                    </td>
                    <td colSpan={2} className="px-2 py-2 align-middle">
                      {readOnly ? (
                        <span className={row.leaveNote ? 'text-ink' : 'italic text-inkSoft'}>{row.leaveNote || 'No reason given'}</span>
                      ) : (
                        <input
                          type="text"
                          aria-label={`Leave reason on ${formatDayNum(date)}`}
                          value={row.leaveNote}
                          disabled={locked}
                          onChange={(e) => updateDayField(dateIso, { leaveNote: e.target.value })}
                          placeholder="Reason for leave (optional)"
                          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                        />
                      )}
                    </td>
                  </tr>
                );
              }

              if (!working) {
                return (
                  <tr key={dateIso} ref={isToday ? todayRowRef : undefined} className={`border-b border-border last:border-0 ${rowTint} ${todayRowCls}`}>
                    <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left align-middle font-semibold text-ink ${rowTint || 'bg-white'}`}>
                      <div className="flex flex-col items-start gap-0.5">
                        <span>{formatDayOrdinal(date)}</span>
                        {todayBadge}
                      </div>
                    </th>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className={`font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                        {tone.badge && <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>{tone.badge.label}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle text-inkSoft">-</td>
                    <td className="px-2 py-2 text-center align-middle text-inkSoft">-</td>
                    <td className="px-2 py-2 text-center align-middle text-inkSoft">-</td>
                    <td className="px-2 py-2 text-center align-middle text-inkSoft">-</td>
                    <td colSpan={2} className="px-2 py-2 text-center align-middle italic text-inkSoft">
                      Non-working day
                    </td>
                  </tr>
                );
              }

              const lines = row.lines.length ? row.lines : [emptyLine()];
              const rowSpan = lines.length;
              return lines.map((line, lineIndex) => (
                <tr
                  key={`${dateIso}_${lineIndex}`}
                  ref={isToday && lineIndex === 0 ? todayRowRef : undefined}
                  className={`border-b border-border last:border-0 ${rowTint} ${todayRowCls}`}
                >
                  {lineIndex === 0 && (
                    <>
                      <th scope="row" rowSpan={rowSpan} className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 text-left align-top font-semibold text-ink ${rowTint || 'bg-white'}`}>
                        <div className="flex min-h-[30px] flex-col items-start justify-center gap-0.5">
                          <span>{formatDayOrdinal(date)}</span>
                          {todayBadge}
                        </div>
                      </th>
                      <td rowSpan={rowSpan} className="px-3 py-2 align-top">
                        <div className="flex h-[30px] items-center gap-1.5 whitespace-nowrap">
                          <span className={`font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                          {tone.badge && <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>{tone.badge.label}</span>}
                        </div>
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 align-top">
                        {readOnly ? (
                          <div className="flex h-[30px] items-center text-inkSoft">{row.inTime ? 'Present' : '-'}</div>
                        ) : (
                          <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} disabled={locked} className="py-1.5 text-xs" />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 text-center align-top">
                        {readOnly ? (
                          row.inTime ? (
                            <PunchResult time={row.inTime} location={row.inLocation} />
                          ) : (
                            <span className="text-ink">-</span>
                          )
                        ) : dateIso === todayIso ? (
                          row.inTime ? (
                            <PunchResult time={row.inTime} location={row.inLocation} onReset={() => resetPunch(dateIso, 'in')} />
                          ) : (
                            <PunchButton label="Clock In" tone="in" locating={locatingKey === `${dateIso}_in`} onClick={() => punch(dateIso, 'in')} />
                          )
                        ) : (
                          <input
                            type="time"
                            aria-label={`In time on ${formatDayNum(date)}`}
                            value={row.inTime}
                            disabled={locked}
                            onChange={(e) => updateDayField(dateIso, { inTime: e.target.value })}
                            className="w-full rounded-md border border-border bg-white px-1.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                          />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 text-center align-top">
                        {readOnly ? (
                          row.outTime ? (
                            <PunchResult time={row.outTime} location={row.outLocation} />
                          ) : (
                            <span className="text-ink">-</span>
                          )
                        ) : dateIso === todayIso ? (
                          row.outTime ? (
                            <PunchResult time={row.outTime} location={row.outLocation} onReset={() => resetPunch(dateIso, 'out')} />
                          ) : (
                            <PunchButton
                              label="Clock Out"
                              tone="out"
                              locating={locatingKey === `${dateIso}_out`}
                              disabled={!row.inTime}
                              disabledTitle="Clock in first"
                              onClick={() => punch(dateIso, 'out')}
                            />
                          )
                        ) : (
                          <input
                            type="time"
                            aria-label={`Out time on ${formatDayNum(date)}`}
                            value={row.outTime}
                            disabled={locked}
                            onChange={(e) => updateDayField(dateIso, { outTime: e.target.value })}
                            className="w-full rounded-md border border-border bg-white px-1.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                          />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 text-center align-top">
                        <div className="flex min-h-[30px] items-center justify-center gap-1.5 whitespace-nowrap">
                          <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${over ? 'bg-redBg text-red' : 'bg-glassRust text-rust'}`}>
                            {hours ? hours.toFixed(2).replace(/\.00$/, '') : '0'}h
                          </span>
                          {!readOnly && zero && <span className="text-[10px] font-medium text-amber">No hours</span>}
                          {over && <span title={`Exceeds ${MAX_HOURS_PER_DAY}h`} className="text-[10px] font-medium text-red">&gt;{MAX_HOURS_PER_DAY}h</span>}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-center align-top">
                    {readOnly ? (
                      <span className={line.taskId ? 'font-medium text-rust' : 'text-inkSoft'}>{taskLabel(line.taskId)}</span>
                    ) : (
                      <select
                        aria-label={`Task ${lineIndex + 1} on ${formatDayNum(date)}`}
                        value={line.taskId}
                        disabled={locked}
                        onChange={(e) => updateLine(dateIso, lineIndex, { taskId: e.target.value })}
                        className={`w-full rounded-md border px-1.5 py-1.5 text-center text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60 ${
                          line.taskId ? 'border-rustLight/40 bg-glassRust text-rustDeep' : 'border-border bg-white font-normal text-inkSoft'
                        }`}
                      >
                        <option value="">Select task</option>
                        {availableTasks(lines, lineIndex).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.projectName} · {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {readOnly ? (
                      <span className="text-inkSoft">{line.description || '-'}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          aria-label={`Task description ${lineIndex + 1} on ${formatDayNum(date)}`}
                          value={line.description}
                          disabled={locked}
                          onChange={(e) => updateLine(dateIso, lineIndex, { description: e.target.value })}
                          placeholder="What did you work on?"
                          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                        />
                        {!locked && lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(dateIso, lineIndex)}
                            aria-label={`Remove task ${lineIndex + 1} on ${formatDayNum(date)}`}
                            className="shrink-0 text-inkSoft hover:text-red focus:outline-none focus-visible:text-red"
                          >
                            <X size={13} />
                          </button>
                        )}
                        {!locked && lineIndex === lines.length - 1 && (
                          <button
                            type="button"
                            onClick={() => addLine(dateIso)}
                            className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline"
                          >
                            <Plus size={12} /> Add task
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-glassRust bg-glassRust">
              <th scope="row" colSpan={5} className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-semibold text-ink">
                Total hours this month
              </th>
              <td className="px-2 py-3 text-center font-bold text-rust">{totals.month.toFixed(2).replace(/\.00$/, '')}h</td>
              <td colSpan={2}></td>
            </tr>
            <tr className="border-t border-glassRust bg-glassRust">
              <th scope="row" colSpan={5} className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left font-semibold text-ink">
                Total leave this month
              </th>
              <td className="px-2 py-2.5 text-center font-bold text-rust">
                {totals.leaveDays} {totals.leaveDays === 1 ? 'day' : 'days'}
              </td>
              <td colSpan={2} className="whitespace-nowrap px-3 py-2.5 text-right">
                <span className="font-semibold text-ink">Leave balance:</span>{' '}
                <span className={`font-bold ${leaveBalance < 0 ? 'text-red' : 'text-rust'}`}>
                  {leaveBalance} {Math.abs(leaveBalance) === 1 ? 'day' : 'days'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Desktop: same always-visible totals mobile's card list already has below - the table
          above is now its own boxed/scrolling area (not the whole page), so this sits right
          under it without needing to be sticky itself; it's already always in view. */}
      <div className="glass-card mt-4 hidden divide-x divide-glassRust overflow-hidden md:flex md:items-stretch">
        <div className="flex flex-1 items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold text-rustDeep">Month Total</span>
          <span className="text-lg font-bold text-rustDeep">{totals.month.toFixed(2).replace(/\.00$/, '')}h</span>
        </div>
        <div className="flex flex-1 items-center justify-between px-6 py-3">
          <span className="text-sm font-medium text-rustDeep">Total Leave</span>
          <span className="font-bold text-rustDeep">
            {totals.leaveDays} {totals.leaveDays === 1 ? 'day' : 'days'}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-between px-6 py-3">
          <span className="text-sm font-medium text-rustDeep">Leave Balance</span>
          <span className={`font-bold ${leaveBalance < 0 ? 'text-red' : 'text-rustDeep'}`}>
            {leaveBalance} {Math.abs(leaveBalance) === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>

      {/* Mobile: stacked card-per-day layout */}
      <div className="space-y-4 md:hidden">
        {days.map((dateIso) => {
          const date = parseISODate(dateIso);
          const tone = dayRowTone(date, workingDayOverrides);
          const row = dayMap[dateIso] || emptyRow();
          const onLeave = !!row.leaveType;
          const lines = row.lines.length ? row.lines : [emptyLine()];
          const hours = totals.perDay[dateIso];
          const working = !isOffDay(date, workingDayOverrides);
          const zero = !onLeave && working && hours === 0;
          const over = hours > MAX_HOURS_PER_DAY;
          const cardTint = onLeave ? 'bg-tealBg' : tone.row || 'bg-white';
          const isToday = dateIso === todayIso;
          const locked = !readOnly && !isToday;
          return (
            <div key={dateIso} ref={isToday ? todayCardRef : undefined} className={`card p-4 ${cardTint} ${isToday ? 'border-l-4 border-l-rust' : ''}`}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className={`font-semibold ${tone.dayText || 'text-ink'}`}>
                      {formatWeekday(date)} {formatDayNum(date)}
                    </div>
                    {isToday && (
                      <span className="inline-block rounded-full bg-rust px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Today</span>
                    )}
                  </div>
                  {onLeave ? (
                    <span className="mt-1 inline-block rounded-full bg-tealBg px-2 py-0.5 text-[10px] font-medium text-teal">{row.leaveType}</span>
                  ) : (
                    tone.badge && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>{tone.badge.label}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${onLeave ? 'bg-tealBg text-teal' : over ? 'bg-redBg text-red' : 'bg-glassRust text-rust'}`}>
                    {onLeave ? '0' : hours ? hours.toFixed(2).replace(/\.00$/, '') : '0'}h
                  </span>
                  {!readOnly && working && zero && <div className="mt-1 text-[11px] font-medium text-amber">No hours logged</div>}
                  {over && <div className="mt-1 text-[11px] font-medium text-red">Exceeds {MAX_HOURS_PER_DAY}h</div>}
                </div>
              </div>

              {!readOnly && working && (
                <label className="mb-3 block">
                  <span className="mb-1 block text-[11px] font-medium text-inkSoft">Leave</span>
                  <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} disabled={locked} />
                </label>
              )}

              {onLeave ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-inkSoft">Reason</span>
                  {readOnly ? (
                    <p className={row.leaveNote ? 'text-sm text-ink' : 'text-sm italic text-inkSoft'}>{row.leaveNote || 'No reason given'}</p>
                  ) : (
                    <input
                      type="text"
                      aria-label={`Leave reason on ${formatDayNum(date)}`}
                      value={row.leaveNote}
                      disabled={locked}
                      onChange={(e) => updateDayField(dateIso, { leaveNote: e.target.value })}
                      placeholder="Reason for leave (optional)"
                      className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                    />
                  )}
                </label>
              ) : !working ? (
                <p className="text-sm italic text-inkSoft">Non-working day</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-inkSoft">In Time</span>
                      {readOnly ? (
                        row.inTime ? (
                          <PunchResult time={row.inTime} location={row.inLocation} compact />
                        ) : (
                          <span className="block text-sm text-ink">-</span>
                        )
                      ) : dateIso === todayIso ? (
                        row.inTime ? (
                          <PunchResult time={row.inTime} location={row.inLocation} onReset={() => resetPunch(dateIso, 'in')} compact />
                        ) : (
                          <PunchButton label="Clock In" tone="in" compact locating={locatingKey === `${dateIso}_in`} onClick={() => punch(dateIso, 'in')} />
                        )
                      ) : (
                        <input
                          type="time"
                          value={row.inTime}
                          disabled={locked}
                          onChange={(e) => updateDayField(dateIso, { inTime: e.target.value })}
                          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                        />
                      )}
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-inkSoft">Out Time</span>
                      {readOnly ? (
                        row.outTime ? (
                          <PunchResult time={row.outTime} location={row.outLocation} compact />
                        ) : (
                          <span className="block text-sm text-ink">-</span>
                        )
                      ) : dateIso === todayIso ? (
                        row.outTime ? (
                          <PunchResult time={row.outTime} location={row.outLocation} onReset={() => resetPunch(dateIso, 'out')} compact />
                        ) : (
                          <PunchButton
                            label="Clock Out"
                            tone="out"
                            compact
                            locating={locatingKey === `${dateIso}_out`}
                            disabled={!row.inTime}
                            disabledTitle="Clock in first"
                            onClick={() => punch(dateIso, 'out')}
                          />
                        )
                      ) : (
                        <input
                          type="time"
                          value={row.outTime}
                          disabled={locked}
                          onChange={(e) => updateDayField(dateIso, { outTime: e.target.value })}
                          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                        />
                      )}
                    </label>
                  </div>

                  <div className="mt-3 space-y-3">
                    {lines.map((line, lineIndex) => (
                      <div key={lineIndex} className="space-y-2 rounded-lg border border-border bg-appBg/60 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-inkSoft">Task {lineIndex + 1}</span>
                          {!readOnly && !locked && lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(dateIso, lineIndex)}
                              aria-label={`Remove task ${lineIndex + 1}`}
                              className="flex items-center gap-0.5 text-xs text-inkSoft hover:text-red focus:outline-none focus-visible:text-red"
                            >
                              <X size={11} /> Remove
                            </button>
                          )}
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-inkSoft">Task</span>
                          {readOnly ? (
                            <span className={`block text-sm ${line.taskId ? 'font-medium text-rust' : 'text-inkSoft'}`}>{taskLabel(line.taskId)}</span>
                          ) : (
                            <select
                              value={line.taskId}
                              disabled={locked}
                              onChange={(e) => updateLine(dateIso, lineIndex, { taskId: e.target.value })}
                              className={`w-full rounded-md border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60 ${
                                line.taskId ? 'border-rustLight/40 bg-glassRust text-rustDeep' : 'border-border bg-white font-normal text-inkSoft'
                              }`}
                            >
                              <option value="">Select task</option>
                              {availableTasks(lines, lineIndex).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.projectName} · {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-inkSoft">Task Description</span>
                          {readOnly ? (
                            <span className="block text-sm text-inkSoft">{line.description || '-'}</span>
                          ) : (
                            <input
                              type="text"
                              value={line.description}
                              disabled={locked}
                              onChange={(e) => updateLine(dateIso, lineIndex, { description: e.target.value })}
                              placeholder="What did you work on?"
                              className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:cursor-not-allowed disabled:bg-appBg disabled:opacity-60"
                            />
                          )}
                        </label>
                      </div>
                    ))}
                    {!readOnly && !locked && (
                      <button type="button" onClick={() => addLine(dateIso)} className="inline-flex items-center gap-0.5 text-sm font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline">
                        <Plus size={13} /> Add task
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="glass-card sticky bottom-0 divide-y divide-glassRust overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <span className="font-semibold text-rustDeep">Month Total</span>
            <span className="text-lg font-bold text-rustDeep">{totals.month.toFixed(2).replace(/\.00$/, '')}h</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium text-rustDeep">Total Leave</span>
            <span className="font-bold text-rustDeep">
              {totals.leaveDays} {totals.leaveDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium text-rustDeep">Leave Balance</span>
            <span className={`font-bold ${leaveBalance < 0 ? 'text-red' : 'text-rustDeep'}`}>
              {leaveBalance} {Math.abs(leaveBalance) === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  if (state === 'saving') {
    return <span className="flex items-center gap-1 text-xs text-inkSoft">Saving…</span>;
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green">
        <Check size={12} /> Saved
      </span>
    );
  }
  return <span className="select-none text-xs text-transparent">.</span>;
}

export default TimesheetGrid;
