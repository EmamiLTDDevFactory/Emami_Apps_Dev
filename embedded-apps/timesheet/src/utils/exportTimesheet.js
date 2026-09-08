import * as XLSX from 'xlsx'
import { formatMonthShort, formatWeekday, isOffDay, monthDays, toISODate } from './date'

// Builds one worksheet row per calendar day of the month, merging same-day
// entries (multiple tasks) into single Task/Description columns so the
// exported sheet mirrors what the grid shows, rather than the flat
// multi-line entry list used for storage.
export function exportTimesheetToExcel({ entries, tasks, monthStartDate, userName }) {
  const byDate = {}
  entries.forEach((e) => {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  })

  const rows = monthDays(monthStartDate).map((date) => {
    const dateIso = toISODate(date)
    const dayEntries = byDate[dateIso] || []
    const leaveEntry = dayEntries.find((e) => e.leaveType)

    if (leaveEntry) {
      return {
        Date: dateIso,
        Day: formatWeekday(date),
        'In Time': '',
        'Out Time': '',
        Location: '',
        'Hours of Work': 0,
        Task: '',
        'Task Description': '',
        Status: leaveEntry.leaveType,
      }
    }

    if (isOffDay(date) || dayEntries.length === 0) {
      return {
        Date: dateIso,
        Day: formatWeekday(date),
        'In Time': '',
        'Out Time': '',
        Location: '',
        'Hours of Work': 0,
        Task: '',
        'Task Description': '',
        Status: isOffDay(date) ? 'Off' : '',
      }
    }

    const taskNames = dayEntries
      .map((e) => {
        const task = tasks.find((t) => t.id === e.taskId)
        return task ? `${task.projectName} - ${task.name}` : null
      })
      .filter(Boolean)
      .join('; ')
    const descriptions = dayEntries.map((e) => e.note).filter(Boolean).join('; ')
    const totalHours = dayEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
    const location = dayEntries.find((e) => e.location)?.location || ''

    return {
      Date: dateIso,
      Day: formatWeekday(date),
      'In Time': dayEntries[0]?.inTime || '',
      'Out Time': dayEntries[0]?.outTime || '',
      Location: location,
      'Hours of Work': totalHours,
      Task: taskNames,
      'Task Description': descriptions,
      Status: 'Present',
    }
  })

  const monthTotal = rows.reduce((sum, r) => sum + r['Hours of Work'], 0)
  rows.push({
    Date: '',
    Day: '',
    'In Time': '',
    'Out Time': '',
    Location: '',
    'Hours of Work': monthTotal,
    Task: '',
    'Task Description': '',
    Status: 'Total hours this month',
  })

  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 9 },
    { wch: 9 },
    { wch: 20 },
    { wch: 14 },
    { wch: 30 },
    { wch: 40 },
    { wch: 16 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Timesheet')

  const monthLabel = formatMonthShort(monthStartDate).replace(' ', '-')
  const safeUserName = (userName || 'timesheet').replace(/[^a-z0-9]+/gi, '-')
  XLSX.writeFile(workbook, `${safeUserName}-timesheet-${monthLabel}.xlsx`)
}
