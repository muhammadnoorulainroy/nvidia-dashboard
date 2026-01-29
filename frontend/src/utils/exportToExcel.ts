import XLSX from 'xlsx-js-style'
import { saveAs } from 'file-saver'

interface ExportColumn {
  key: string
  header: string
  width?: number
  format?: (value: any) => string | number
}

// Color configuration for metrics
interface ColorConfig {
  min: number
  max: number
  inverse?: boolean // true = higher is worse (red), false = higher is better (green)
}

// Get color based on value and config
function getColorForValue(value: number | null | undefined, config: ColorConfig): string {
  if (value === null || value === undefined) return 'FFFFFF'
  
  const { min, max, inverse } = config
  let normalized = (value - min) / (max - min)
  normalized = Math.max(0, Math.min(1, normalized))
  
  if (inverse) {
    normalized = 1 - normalized
  }
  
  // Red (bad) -> Yellow -> Green (good)
  if (normalized <= 0.5) {
    // Red to Yellow
    const r = 255
    const g = Math.round(68 + (normalized * 2) * (180 - 68))
    const b = 68
    return rgbToHex(r, g, b)
  } else {
    // Yellow to Green
    const factor = (normalized - 0.5) * 2
    const r = Math.round(234 - factor * (234 - 34))
    const g = Math.round(180 + factor * (197 - 180))
    const b = Math.round(68 - factor * (68 - 94))
    return rgbToHex(r, g, b)
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()
}

// Color configs for each metric
const colorConfigs: Record<string, ColorConfig> = {
  unique_tasks: { min: 0, max: 50, inverse: false },
  new_tasks: { min: 0, max: 30, inverse: false },
  rework: { min: 0, max: 30, inverse: true },
  total_reviews: { min: 0, max: 50, inverse: false },
  ready_for_delivery: { min: 0, max: 30, inverse: false },
  avg_rework: { min: 0, max: 2, inverse: true },
  rework_percent: { min: 0, max: 100, inverse: true },
  avg_rating: { min: 1, max: 5, inverse: false },
  merged_exp_aht: { min: 4, max: 10, inverse: false },
}

export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn[],
  filename: string,
  sheetName: string = 'Data'
): void {
  const headers = columns.map(col => col.header)
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col.key]
      if (col.format) return col.format(value)
      if (value === null || value === undefined) return ''
      return value
    })
  )
  
  const worksheetData = [headers, ...rows]
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
  worksheet['!cols'] = columns.map(col => ({ wch: col.width || 15 }))
  
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${filename}.xlsx`)
}

// Export with hierarchical data (reviewers/pod leads with trainers) WITH COLOR FORMATTING
export function exportReviewerWithTrainersToExcel(
  reviewers: any[],
  showDate: boolean,
  filename: string,
  parentLabel: string = 'Reviewer'  // Can be 'Reviewer' or 'POD Lead'
): void {
  // Define columns - use parentLabel for the Type column header
  const columns = [
    { key: 'type', header: parentLabel === 'POD Lead' ? 'POD Lead / Trainer' : 'Type', width: 18 },
    { key: 'name', header: 'Name', width: 25 },
    { key: 'email', header: 'Email', width: 30 },
    ...(showDate ? [{ key: 'date', header: 'Date', width: 12 }] : []),
    { key: 'unique_tasks', header: 'Unique Tasks', width: 14 },
    { key: 'new_tasks', header: 'New Tasks', width: 12 },
    { key: 'rework', header: 'Rework', width: 10 },
    { key: 'total_reviews', header: 'Total Reviews', width: 14 },
    { key: 'ready_for_delivery', header: 'Ready for Delivery', width: 18 },
    { key: 'avg_rework', header: 'Avg Rework', width: 12 },
    { key: 'rework_percent', header: 'Rework %', width: 12 },
    { key: 'avg_rating', header: 'Avg Rating', width: 12 },
    { key: 'merged_exp_aht', header: 'Merged Exp. AHT', width: 16 },
  ]
  
  // Build flat data with hierarchy indicator
  const rows: any[] = []
  
  reviewers.forEach(reviewer => {
    const newTasks = reviewer.new_tasks_reviewed || 0
    const rework = reviewer.rework_reviewed || 0
    const total = newTasks + rework
    const mergedAht = total > 0 ? (newTasks * 10 + rework * 4) / total : null
    
    rows.push({
      type: parentLabel,
      name: reviewer.reviewer_name || 'Unknown',
      email: reviewer.reviewer_email || '',
      date: showDate && reviewer.review_date ? new Date(reviewer.review_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      unique_tasks: reviewer.unique_tasks_reviewed || 0,
      new_tasks: reviewer.new_tasks_reviewed || 0,
      rework: reviewer.rework_reviewed || 0,
      total_reviews: reviewer.total_reviews || 0,
      ready_for_delivery: reviewer.tasks_ready_for_delivery || 0,
      avg_rework: reviewer.avg_rework,
      rework_percent: reviewer.rework_percent,
      avg_rating: reviewer.avg_rating,
      merged_exp_aht: mergedAht,
      _isReviewer: true,
    })
    
    if (reviewer.trainers && reviewer.trainers.length > 0) {
      reviewer.trainers.forEach((trainer: any) => {
        const tNewTasks = trainer.new_tasks_reviewed || 0
        const tRework = trainer.rework_reviewed || 0
        const tTotal = tNewTasks + tRework
        const tMergedAht = tTotal > 0 ? (tNewTasks * 10 + tRework * 4) / tTotal : null
        
        rows.push({
          type: '  → Trainer',
          name: trainer.trainer_name || 'Unknown',
          email: trainer.trainer_email || '',
          date: '',
          unique_tasks: trainer.tasks_reviewed || 0,
          new_tasks: trainer.new_tasks_reviewed || 0,
          rework: trainer.rework_reviewed || 0,
          total_reviews: trainer.total_reviews || 0,
          ready_for_delivery: trainer.ready_for_delivery || 0,
          avg_rework: trainer.avg_rework,
          rework_percent: trainer.rework_percent,
          avg_rating: trainer.avg_rating,
          merged_exp_aht: tMergedAht,
          _isReviewer: false,
        })
      })
    }
  })
  
  // Create worksheet with styled cells
  const ws: XLSX.WorkSheet = {}
  
  // Add headers with styling
  const headers = columns.map(col => col.header)
  headers.forEach((header, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx })
    ws[cellRef] = {
      v: header,
      t: 's',
      s: {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4F46E5' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } },
        }
      }
    }
  })
  
  // Add data rows with conditional formatting
  rows.forEach((row, rowIdx) => {
    const excelRowIdx = rowIdx + 1 // +1 for header
    
    columns.forEach((col, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: excelRowIdx, c: colIdx })
      let value = row[col.key]
      let displayValue = value
      let cellType: 's' | 'n' = 's'
      
      // Format specific columns
      if (col.key === 'avg_rework' || col.key === 'rework_percent') {
        displayValue = value !== null && value !== undefined ? `${Math.round(value)}%` : '-'
      } else if (col.key === 'avg_rating' || col.key === 'merged_exp_aht') {
        if (value !== null && value !== undefined) {
          displayValue = Number(value.toFixed(2))
          cellType = 'n'
        } else {
          displayValue = '-'
        }
      } else if (typeof value === 'number') {
        cellType = 'n'
      }
      
      // Get background color for numeric metric columns
      let bgColor = row._isReviewer ? 'F3F4F6' : 'FFFFFF' // Light gray for reviewers
      const colorableKeys = ['unique_tasks', 'new_tasks', 'rework', 'total_reviews', 'ready_for_delivery', 'avg_rework', 'rework_percent', 'avg_rating', 'merged_exp_aht']
      
      if (colorableKeys.includes(col.key) && value !== null && value !== undefined && typeof value === 'number') {
        const config = colorConfigs[col.key]
        if (config) {
          bgColor = getColorForValue(value, config)
        }
      }
      
      // Type column styling
      if (col.key === 'type') {
        bgColor = row._isReviewer ? '4F46E5' : 'E0E7FF'
      }
      
      ws[cellRef] = {
        v: displayValue === null || displayValue === undefined ? '' : displayValue,
        t: cellType,
        s: {
          font: { 
            bold: col.key === 'type' || col.key === 'name',
            color: { rgb: col.key === 'type' && row._isReviewer ? 'FFFFFF' : '1F2937' }
          },
          fill: { fgColor: { rgb: bgColor } },
          alignment: { 
            horizontal: typeof displayValue === 'number' ? 'center' : 'left',
            vertical: 'center'
          },
          border: {
            top: { style: 'thin', color: { rgb: 'E5E7EB' } },
            bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
            left: { style: 'thin', color: { rgb: 'E5E7EB' } },
            right: { style: 'thin', color: { rgb: 'E5E7EB' } },
          }
        }
      }
    })
  })
  
  // Set worksheet range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: columns.length - 1 }
  })
  
  // Set column widths
  ws['!cols'] = columns.map(col => ({ wch: col.width || 15 }))
  
  // Set row heights
  const rowHeights: XLSX.RowInfo[] = []
  for (let i = 0; i <= rows.length; i++) {
    rowHeights.push({ hpt: 22 })
  }
  ws['!rows'] = rowHeights
  
  // Create workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, ws, 'Reviewers & Trainers')
  
  // Add legend sheet
  const legendWs: XLSX.WorkSheet = {}
  const legendData = [
    ['Color Coding Legend'],
    [''],
    ['Metrics with Color Grading:'],
    [''],
    ['🟢 GREEN = Good Performance'],
    ['🟡 YELLOW = Average Performance'],
    ['🔴 RED = Needs Attention'],
    [''],
    ['Positive Metrics (higher is better):'],
    ['• Unique Tasks: 0-50 range'],
    ['• New Tasks: 0-30 range'],
    ['• Total Reviews: 0-50 range'],
    ['• Ready for Delivery: 0-30 range'],
    ['• Avg Rating: 1-5 range'],
    ['• Merged Exp. AHT: 4-10 range'],
    [''],
    ['Negative Metrics (lower is better):'],
    ['• Rework: 0-30 range (more rework = red)'],
    ['• Avg Rework: 0-2 range (higher = red, e.g., 1.5 means 1.5 extra submissions per task)'],
    ['• Rework %: 0-100% range (higher = red)'],
    [''],
    ['Row Colors:'],
    ['• Purple header = Reviewer row'],
    ['• Light blue = Trainer row (under reviewer)'],
  ]
  
  legendData.forEach((row, rowIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 0 })
    const isHeader = rowIdx === 0
    legendWs[cellRef] = {
      v: row[0] || '',
      t: 's',
      s: {
        font: { 
          bold: isHeader || row[0]?.includes('Metrics') || row[0]?.includes('GREEN') || row[0]?.includes('YELLOW') || row[0]?.includes('RED'),
          sz: isHeader ? 14 : 11,
          color: { rgb: isHeader ? '4F46E5' : '374151' }
        },
        alignment: { horizontal: 'left', vertical: 'center' }
      }
    }
  })
  
  legendWs['!ref'] = `A1:A${legendData.length}`
  legendWs['!cols'] = [{ wch: 60 }]
  XLSX.utils.book_append_sheet(workbook, legendWs, 'Legend')
  
  // Generate and download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${filename}.xlsx`)
}

// Helper to format percentage values
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `${Math.round(value)}%`
}

// Helper to format decimal values
export function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  return value.toFixed(decimals)
}

// Helper to format date values
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  })
}
