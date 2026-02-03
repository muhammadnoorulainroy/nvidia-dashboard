/**
 * Shared date utilities for consistent date handling across all tabs
 */

export type Timeframe = 'daily' | 'd-1' | 'd-2' | 'd-3' | 'weekly' | 'overall' | 'custom'

export interface DateRange {
  startDate: string | undefined
  endDate: string | undefined
  displayLabel: string
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Format date for display (e.g., "Jan 20")
 */
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Format date range for display (e.g., "Jan 20 - Jan 26, 2026")
 */
export function formatDateRangeDisplay(startDate: string | undefined, endDate: string | undefined): string {
  if (!startDate || !endDate) return 'All Time'
  
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  
  return `${startStr} - ${endStr}`
}

/**
 * Get Monday of the week containing the given date
 */
export function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get Sunday of the week containing the given date
 */
export function getSunday(date: Date): Date {
  const monday = getMonday(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday
}

/**
 * Get the current week's date range (Mon-Sun)
 */
export function getCurrentWeekRange(): { start: Date; end: Date } {
  const today = new Date()
  return {
    start: getMonday(today),
    end: getSunday(today)
  }
}

/**
 * Get week range with offset (negative = previous weeks, positive = future weeks)
 * Returns null for future weeks
 */
export function getWeekRangeWithOffset(weekOffset: number): { start: Date; end: Date } | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const currentMonday = getMonday(today)
  const targetMonday = new Date(currentMonday)
  targetMonday.setDate(currentMonday.getDate() + (weekOffset * 7))
  
  const targetSunday = new Date(targetMonday)
  targetSunday.setDate(targetMonday.getDate() + 6)
  
  // Don't allow future weeks (except current week)
  if (targetMonday > today && weekOffset > 0) {
    return null
  }
  
  return {
    start: targetMonday,
    end: targetSunday
  }
}

/**
 * Check if we can navigate to next week (not future)
 */
export function canGoToNextWeek(currentWeekOffset: number): boolean {
  return currentWeekOffset < 0
}

/**
 * Get date range based on timeframe and week offset
 */
export function getDateRange(
  timeframe: Timeframe, 
  weekOffset: number = 0,
  customStart?: string, 
  customEnd?: string
): DateRange {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  let startDate: string | undefined
  let endDate: string | undefined
  let displayLabel: string

  switch (timeframe) {
    case 'daily':
      startDate = formatDate(today)
      endDate = startDate
      displayLabel = `Today (${formatDateDisplay(startDate)})`
      break
      
    case 'd-1': {
      const d1 = new Date(today)
      d1.setDate(today.getDate() - 1)
      startDate = formatDate(d1)
      endDate = startDate
      displayLabel = `Yesterday (${formatDateDisplay(startDate)})`
      break
    }
    
    case 'd-2': {
      const d2 = new Date(today)
      d2.setDate(today.getDate() - 2)
      startDate = formatDate(d2)
      endDate = startDate
      displayLabel = `2 days ago (${formatDateDisplay(startDate)})`
      break
    }
    
    case 'd-3': {
      const d3 = new Date(today)
      d3.setDate(today.getDate() - 3)
      startDate = formatDate(d3)
      endDate = startDate
      displayLabel = `3 days ago (${formatDateDisplay(startDate)})`
      break
    }
    
    case 'weekly': {
      const weekRange = getWeekRangeWithOffset(weekOffset)
      if (weekRange) {
        startDate = formatDate(weekRange.start)
        endDate = formatDate(weekRange.end)
        
        // Adjust end date if it's in the future
        if (weekRange.end > today) {
          endDate = formatDate(today)
        }
        
        const weekLabel = weekOffset === 0 ? 'This Week' : 
                         weekOffset === -1 ? 'Last Week' : 
                         `${Math.abs(weekOffset)} weeks ago`
        displayLabel = `${weekLabel} (${formatDateRangeDisplay(startDate, endDate)})`
      } else {
        startDate = undefined
        endDate = undefined
        displayLabel = 'Invalid week'
      }
      break
    }
    
    case 'custom':
      if (customStart && customEnd) {
        // Validate custom range
        const start = new Date(customStart)
        const end = new Date(customEnd)
        
        if (start <= end) {
          startDate = customStart
          endDate = customEnd
          displayLabel = `Custom (${formatDateRangeDisplay(startDate, endDate)})`
        } else {
          startDate = undefined
          endDate = undefined
          displayLabel = 'Invalid range (start > end)'
        }
      } else {
        startDate = undefined
        endDate = undefined
        displayLabel = 'Select date range'
      }
      break
      
    case 'overall':
    default:
      startDate = undefined
      endDate = undefined
      displayLabel = 'All Time'
  }

  return { startDate, endDate, displayLabel }
}

/**
 * Validate that end date is not before start date
 */
export function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false
  return new Date(startDate) <= new Date(endDate)
}

/**
 * Get max date for date picker (today)
 */
export function getMaxDate(): string {
  return formatDate(new Date())
}
