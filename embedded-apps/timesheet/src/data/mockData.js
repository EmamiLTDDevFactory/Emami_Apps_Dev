import { addMonths, hoursBetween, isWorkingDay, monthDays, startOfMonth, toISODate } from '../utils/date.js'
import { STATUS } from '../utils/timesheet.js'

// ---- Users -----------------------------------------------------------
export const seedUsers = [
  { id: 'u1', name: 'Indranil Banerjee', email: 'indranil.banerjee@example.com', role: 'manager', managerId: null },
  { id: 'u2', name: 'Abinash Sahoo', email: 'abinash.sahoo@example.com', role: 'employee', managerId: 'u1' },
  { id: 'u3', name: 'Jivan Thapa', email: 'jivan.thapa@example.com', role: 'employee', managerId: 'u1' },
  { id: 'u4', name: 'Rupam Roy', email: 'rupam.roy@example.com', role: 'employee', managerId: 'u1' },
  { id: 'u5', name: 'Priyanka Kothari', email: 'priyanka.kothari@example.com', role: 'employee', managerId: 'u1' },
  { id: 'u6', name: 'MD Sahin', email: 'md.sahin@example.com', role: 'employee', managerId: 'u1' },
]

// ---- Projects & SAP Modules ---------------------------------------------
export const seedProjects = [
  { id: 'p1', name: 'S/4HANA Implementation' },
  { id: 'p2', name: 'Support & Maintenance' },
  { id: 'p3', name: 'Rollout Project' },
]

export const seedTasks = [
  { id: 't1', projectId: 'p1', name: 'FICO' },
  { id: 't2', projectId: 'p1', name: 'MM' },
  { id: 't3', projectId: 'p1', name: 'SD' },
  { id: 't4', projectId: 'p2', name: 'ABAP' },
  { id: 't5', projectId: 'p2', name: 'BASIS' },
  { id: 't6', projectId: 'p3', name: 'HCM' },
  { id: 't7', projectId: 'p3', name: 'QM' },
]

// which SAP modules are selectable in each person's entry grid
export const seedAssignments = {
  u1: ['t2', 't6'],
  u2: ['t1', 't2', 't3'],
  u3: ['t4', 't5'],
  u4: ['t6', 't7'],
  u5: ['t1', 't3'],
  u6: ['t5', 't7'],
}

export const seedTeamSettings = {
  deadlineDaysAfterMonthEnd: 2, // monthly timesheets due within 2 days of month end
}

// ---- Timesheets / entries ------------------------------------------------
// "today" for the demo dataset. The rest of the app uses the real current
// date, but months below are laid out relative to this anchor.
const TODAY = new Date(2026, 8, 3) // 2026-09-03

const MONTH_0 = toISODate(startOfMonth(TODAY)) // September 2026 - in progress
const MONTH_1 = toISODate(addMonths(startOfMonth(TODAY), -1)) // August 2026 - just completed, under review
const MONTH_2 = toISODate(addMonths(startOfMonth(TODAY), -2)) // July 2026 - older, locked

let entryCounter = 1
function nextEntryId() {
  return `e${entryCounter++}`
}

const taskById = Object.fromEntries(seedTasks.map((t) => [t.id, t]))

function entry(userId, taskId, date, inTime, outTime, description = '') {
  return {
    id: nextEntryId(),
    userId,
    projectId: taskById[taskId].projectId,
    taskId,
    date: toISODate(date),
    inTime,
    outTime,
    hours: hoursBetween(inTime, outTime),
    note: description,
  }
}

// One row per working day in the month (skips Sundays and non-working
// Saturdays automatically), optionally skipping specific day-of-month numbers.
function workingDayEntries(userId, taskId, monthStartIso, { inTime = '09:00', outTime = '17:00', skipDayNums = [], descriptionByDayNum = {}, description = 'Regular work' } = {}) {
  return monthDays(monthStartIso)
    .filter((d) => isWorkingDay(d) && !skipDayNums.includes(d.getDate()))
    .map((d) => entry(userId, taskId, d, inTime, outTime, descriptionByDayNum[d.getDate()] || description))
}

let timesheetCounter = 1
function nextTimesheetId() {
  return `ts${timesheetCounter++}`
}

function makeTimesheet({ userId, monthStartDate, status, entries, managerComment = null, history }) {
  return { id: nextTimesheetId(), userId, monthStartDate, status, entries, managerComment, history }
}

export const seedTimesheets = [
  // --- Abinash: September (in progress) Draft, only the first couple of days logged ---
  makeTimesheet({
    userId: 'u2',
    monthStartDate: MONTH_0,
    status: STATUS.DRAFT,
    entries: [
      entry('u2', 't1', new Date(2026, 8, 1), '09:00', '17:00', 'GL account configuration'),
      entry('u2', 't2', new Date(2026, 8, 2), '09:00', '16:00', 'Vendor master data cleanup'),
    ],
    history: [{ status: STATUS.DRAFT, date: `${MONTH_0}T09:00:00`, comment: null }],
  }),
  // Abinash: August - Submitted, full month (ready for manager review)
  makeTimesheet({
    userId: 'u2',
    monthStartDate: MONTH_1,
    status: STATUS.SUBMITTED,
    entries: workingDayEntries('u2', 't1', MONTH_1, { description: 'Month-end closing support' }),
    history: [{ status: STATUS.SUBMITTED, date: `${MONTH_1}T17:00:00`, comment: null }],
  }),
  // Abinash: July - Approved, full month, past payroll cutoff -> renders Locked
  makeTimesheet({
    userId: 'u2',
    monthStartDate: MONTH_2,
    status: STATUS.APPROVED,
    entries: workingDayEntries('u2', 't2', MONTH_2, { description: 'Inventory management configuration' }),
    managerComment: 'Approved.',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_2}T16:45:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_2}T08:15:00`, comment: 'Approved.' },
    ],
  }),

  // --- Jivan: September not started yet (in progress, no rush) ---
  // Jivan: August - Submitted, full month, with one long day (demo: >12h flag)
  makeTimesheet({
    userId: 'u3',
    monthStartDate: MONTH_1,
    status: STATUS.SUBMITTED,
    entries: workingDayEntries('u3', 't4', MONTH_1, {
      description: 'Custom report development',
      skipDayNums: [3],
    }).concat([entry('u3', 't4', new Date(2026, 7, 3), '08:00', '21:00', 'Go-live support - critical fixes')]),
    history: [{ status: STATUS.SUBMITTED, date: `${MONTH_1}T17:10:00`, comment: null }],
  }),
  // Jivan: July - full Rejected -> Resubmitted -> Approved cycle (locked now)
  makeTimesheet({
    userId: 'u3',
    monthStartDate: MONTH_2,
    status: STATUS.APPROVED,
    entries: workingDayEntries('u3', 't4', MONTH_2, { description: 'Custom report development' }),
    managerComment: 'Thanks for the update - approved.',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_2}T16:00:00`, comment: null },
      { status: STATUS.REJECTED, date: `${MONTH_2}T09:00:00`, comment: 'A few days are missing module descriptions - please add context and resubmit.' },
      { status: STATUS.RESUBMITTED, date: `${MONTH_2}T14:00:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_2}T09:00:00`, comment: 'Thanks for the update - approved.' },
    ],
  }),

  // --- Rupam: no August timesheet at all (demo: overdue) ---
  // Rupam: July - Approved, full month (alternating modules) -> locked
  makeTimesheet({
    userId: 'u4',
    monthStartDate: MONTH_2,
    status: STATUS.APPROVED,
    entries: monthDays(MONTH_2)
      .filter((d) => isWorkingDay(d))
      .map((d, i) => entry('u4', i % 2 === 0 ? 't6' : 't7', d, '09:00', '17:00', i % 2 === 0 ? 'Payroll configuration' : 'Quality inspection setup')),
    managerComment: 'Approved.',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_2}T18:00:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_2}T09:00:00`, comment: 'Approved.' },
    ],
  }),

  // --- Priyanka: August - Submitted, full month (ready for manager review) ---
  makeTimesheet({
    userId: 'u5',
    monthStartDate: MONTH_1,
    status: STATUS.SUBMITTED,
    entries: workingDayEntries('u5', 't3', MONTH_1, { description: 'Sales order configuration' }),
    history: [{ status: STATUS.SUBMITTED, date: `${MONTH_1}T16:30:00`, comment: null }],
  }),
  // Priyanka: July - Approved, full month -> locked
  makeTimesheet({
    userId: 'u5',
    monthStartDate: MONTH_2,
    status: STATUS.APPROVED,
    entries: workingDayEntries('u5', 't1', MONTH_2, { description: 'Financial closing activities' }),
    managerComment: 'Approved.',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_2}T17:15:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_2}T09:30:00`, comment: 'Approved.' },
    ],
  }),

  // --- MD Sahin: August - Submitted, full month (ready for manager review) ---
  makeTimesheet({
    userId: 'u6',
    monthStartDate: MONTH_1,
    status: STATUS.SUBMITTED,
    entries: workingDayEntries('u6', 't7', MONTH_1, { description: 'Quality inspection setup' }),
    history: [{ status: STATUS.SUBMITTED, date: `${MONTH_1}T18:00:00`, comment: null }],
  }),
  // MD Sahin: July - Approved, full month -> locked
  makeTimesheet({
    userId: 'u6',
    monthStartDate: MONTH_2,
    status: STATUS.APPROVED,
    entries: workingDayEntries('u6', 't5', MONTH_2, { description: 'System performance tuning' }),
    managerComment: 'Approved.',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_2}T16:00:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_2}T08:45:00`, comment: 'Approved.' },
    ],
  }),

  // --- Indranil (manager): logs his own hours too ---
  makeTimesheet({
    userId: 'u1',
    monthStartDate: MONTH_0,
    status: STATUS.DRAFT,
    entries: [
      entry('u1', 't2', new Date(2026, 8, 1), '09:00', '17:00', 'Team roadmap planning'),
      entry('u1', 't6', new Date(2026, 8, 2), '09:00', '13:00', 'HR process review'),
    ],
    history: [{ status: STATUS.DRAFT, date: `${MONTH_0}T09:00:00`, comment: null }],
  }),
  // Indranil: August - Approved (self-approved, not yet locked - within payroll cutoff)
  makeTimesheet({
    userId: 'u1',
    monthStartDate: MONTH_1,
    status: STATUS.APPROVED,
    entries: workingDayEntries('u1', 't2', MONTH_1, { description: 'Module governance & configuration review' }),
    managerComment: 'Self-approved (top of reporting chain).',
    history: [
      { status: STATUS.SUBMITTED, date: `${MONTH_1}T17:00:00`, comment: null },
      { status: STATUS.APPROVED, date: `${MONTH_1}T17:05:00`, comment: 'Self-approved (top of reporting chain).' },
    ],
  }),
]

export function seedState() {
  return {
    users: seedUsers,
    projects: seedProjects,
    tasks: seedTasks,
    assignments: seedAssignments,
    teamSettings: seedTeamSettings,
    timesheets: seedTimesheets,
    currentUserId: 'u2',
    isLoggedIn: false,
  }
}
