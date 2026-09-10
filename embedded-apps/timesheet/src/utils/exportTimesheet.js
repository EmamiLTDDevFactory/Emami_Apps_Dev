import ExcelJS from 'exceljs'
import { formatMonthShort, formatWeekday, isOffDay, monthDays, toISODate } from './date'

const COLUMNS = [
  { header: 'Date', key: 'Date', width: 12 },
  { header: 'Day', key: 'Day', width: 10 },
  { header: 'In Time', key: 'In Time', width: 9 },
  { header: 'Out Time', key: 'Out Time', width: 9 },
  { header: 'Location', key: 'Location', width: 20 },
  { header: 'Hours of Work', key: 'Hours of Work', width: 14 },
  { header: 'Task', key: 'Task', width: 30 },
  { header: 'Task Description', key: 'Task Description', width: 40 },
  { header: 'Status', key: 'Status', width: 16 },
]

const THIN_BORDER = { style: 'thin', color: { argb: 'FF808080' } }
const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER }

// DD-MM-YYYY, distinct from the ISO "YYYY-MM-DD" used everywhere else in this app for
// lookups/storage - this is only how the Date column reads once it hits the exported sheet.
function formatDDMMYYYY(date) {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}-${m}-${y}`
}

// Builds one worksheet row per calendar day of the month, merging same-day
// entries (multiple tasks) into single Task/Description columns so the
// exported sheet mirrors what the grid shows, rather than the flat
// multi-line entry list used for storage.
export async function exportTimesheetToExcel({ entries, tasks, monthStartDate, userName }) {
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
        Date: formatDDMMYYYY(date),
        Day: formatWeekday(date),
        'In Time': '',
        'Out Time': '',
        Location: '',
        'Hours of Work': 0,
        Task: '',
        'Task Description': '',
        Status: leaveEntry.leaveType,
        _bold: true,
      }
    }

    if (isOffDay(date) || dayEntries.length === 0) {
      return {
        Date: formatDDMMYYYY(date),
        Day: formatWeekday(date),
        'In Time': '',
        'Out Time': '',
        Location: '',
        'Hours of Work': 0,
        Task: '',
        'Task Description': '',
        Status: isOffDay(date) ? 'Off' : '',
        _bold: isOffDay(date),
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
      Date: formatDDMMYYYY(date),
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
    Date: 'Total hours this month',
    Day: '',
    'In Time': '',
    'Out Time': '',
    Location: '',
    'Hours of Work': monthTotal,
    Task: '',
    'Task Description': '',
    Status: '',
    _bold: true,
    _isTotal: true,
  })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Timesheet')
  sheet.columns = COLUMNS

  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = CELL_BORDER
  })

  rows.forEach((row) => {
    const sheetRow = sheet.addRow(row)
    sheetRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = CELL_BORDER
      // Saturdays, Sundays, public holidays and every leave type stand out in bold so a
      // manager scanning the exported sheet doesn't have to read the Status column to spot them.
      if (row._bold) cell.font = { bold: true }
    })
    sheetRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' }

    // "Total hours this month" reads under Date through Location, centered the same way every
    // row's Hours of Work is, instead of trailing off in the Status column.
    if (row._isTotal) {
      sheet.mergeCells(sheetRow.number, 1, sheetRow.number, 5)
      sheetRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
    }
  })

  // A plain spacer row after the total - no border/fill, just breathing room at the end of
  // the sheet.
  sheet.addRow({})

  const monthLabel = formatMonthShort(monthStartDate).replace(' ', '-')
  const safeUserName = (userName || 'timesheet').replace(/[^a-z0-9]+/gi, '-')

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeUserName}-timesheet-${monthLabel}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
