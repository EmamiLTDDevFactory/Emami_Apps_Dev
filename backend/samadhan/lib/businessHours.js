'use strict';
const { pool } = require('../db/pool');
const { MIN } = require('../constants');

// ---------- Business hours ----------

function offsetMinutes(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / MIN);
}

function localInfo(date, tz) {
    const off = offsetMinutes(date, tz);
    const shifted = new Date(date.getTime() + off * MIN);
    return {
        ymd: shifted.toISOString().slice(0, 10),
        weekday: shifted.getUTCDay(),
        minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        dayStartUtc: Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - off * MIN,
    };
}

const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

function windowFor(cal, weekday, ymd) {
    if (cal.holidays.includes(ymd)) return null;
    const w = cal.days.find((d) => d.day === weekday);
    return w ? { start: toMinutes(w.start), end: toMinutes(w.end) } : null;
}

function addBusinessMinutes(from, minutes, cal) {
    let cursor = from.getTime();
    let remaining = minutes;
    for (let guard = 0; guard < 400; guard++) {
        const l = localInfo(new Date(cursor), cal.timezone);
        const w = windowFor(cal, l.weekday, l.ymd);
        if (w && l.minuteOfDay < w.end) {
            const startMin = Math.max(l.minuteOfDay, w.start);
            const available = w.end - startMin;
            const startTs = l.dayStartUtc + startMin * MIN;
            if (remaining <= available) return new Date(startTs + remaining * MIN);
            remaining -= available;
        }
        cursor = localInfo(new Date(l.dayStartUtc + 26 * 60 * MIN), cal.timezone).dayStartUtc;
    }
    throw new Error('Business calendar has no working hours');
}

function businessMinutesBetween(from, to, cal) {
    if (to <= from) return 0;
    let total = 0;
    let cursor = from.getTime();
    const end = to.getTime();
    for (let guard = 0; guard < 4000 && cursor < end; guard++) {
        const l = localInfo(new Date(cursor), cal.timezone);
        const w = windowFor(cal, l.weekday, l.ymd);
        const nextDay = localInfo(new Date(l.dayStartUtc + 26 * 60 * MIN), cal.timezone).dayStartUtc;
        if (w) {
            const a = Math.max(cursor, l.dayStartUtc + w.start * MIN);
            const b = Math.min(end, l.dayStartUtc + w.end * MIN);
            if (b > a) total += (b - a) / MIN;
        }
        cursor = nextDay;
    }
    return Math.round(total);
}

const addMinutes = (from, minutes, businessHours, cal) =>
    businessHours ? addBusinessMinutes(from, minutes, cal) : new Date(from.getTime() + minutes * MIN);
const minutesBetween = (from, to, businessHours, cal) =>
    businessHours ? businessMinutesBetween(from, to, cal) : Math.max(0, Math.round((to.getTime() - from.getTime()) / MIN));

const FALLBACK_CALENDAR = { timezone: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '20:00' })), holidays: [] };

// The calendar is read for every due-date calculation; keep it for a minute (Admin edits clear it at once).
let calendarCache = { at: 0, value: null };
const clearCalendarCache = () => { calendarCache = { at: 0, value: null }; };

async function loadCalendar() {
    if (calendarCache.value && Date.now() - calendarCache.at < MIN) return calendarCache.value;
    calendarCache = { at: Date.now(), value: await readCalendar() };
    return calendarCache.value;
}

async function readCalendar() {
    const { rows } = await pool.query('SELECT id, timezone, days FROM samadhan.business_hours ORDER BY id LIMIT 1');
    if (!rows.length) return FALLBACK_CALENDAR;
    const hol = await pool.query(`SELECT to_char(date, 'YYYY-MM-DD') AS d FROM samadhan.holidays WHERE "businessHoursId" = $1`, [rows[0].id]);
    return { timezone: rows[0].timezone, days: rows[0].days, holidays: hol.rows.map((h) => h.d) };
}

module.exports = { addMinutes, businessMinutesBetween, clearCalendarCache, loadCalendar, minutesBetween };
