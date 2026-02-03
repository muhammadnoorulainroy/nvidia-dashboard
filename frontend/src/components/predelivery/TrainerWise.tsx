import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TablePagination,
  Autocomplete,
  TextField,
  Chip,
  IconButton,
  Button,
  Slider,
  Popover,
  Menu,
  Divider,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import SortIcon from '@mui/icons-material/Sort'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import FilterListIcon from '@mui/icons-material/FilterList'
import DownloadIcon from '@mui/icons-material/Download'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'

// Column group definitions with professional colors (matching ProjectsTab)
const COLUMN_GROUPS = {
  overview: { 
    label: 'Overview', 
    bgHeader: '#F1F5F9', 
    bgSubHeader: '#F8FAFC',
    borderColor: '#CBD5E1',
    textColor: '#475569'
  },
  tasks: { 
    label: 'Tasks', 
    bgHeader: '#EFF6FF', 
    bgSubHeader: '#F0F9FF',
    borderColor: '#93C5FD',
    textColor: '#1E40AF'
  },
  quality: { 
    label: 'Quality', 
    bgHeader: '#F0FDF4', 
    bgSubHeader: '#F0FDF4',
    borderColor: '#86EFAC',
    textColor: '#166534'
  },
  efficiency: { 
    label: 'Time & Efficiency', 
    bgHeader: '#FEF3C7', 
    bgSubHeader: '#FFFBEB',
    borderColor: '#FCD34D',
    textColor: '#92400E'
  },
}

// Compact header cell style
const headerCellStyle = {
  fontWeight: 600,
  fontSize: '0.6rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.02em',
  lineHeight: 1.1,
  py: 0.5,
  px: 0.5,
  whiteSpace: 'nowrap' as const,
}

// Compact data cell style
const cellStyle = {
  py: 0.5,
  px: 0.5,
  fontSize: '0.75rem',
  borderBottom: '1px solid #E2E8F0',
}
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { exportToExcel, formatPercent, formatDecimal, formatDate } from '../../utils/exportToExcel'
import { getTrainerStats, getTaskLevelInfo, getClientDeliveryTrainerStats, getTrainerDailyStats, getTrainerOverallStats, getThroughputTargets, clearCache } from '../../services/api'
import type { TrainerLevelAggregation, TaskLevelInfo, TrainerDailyStats } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'
import { useAHTConfiguration } from '../../hooks/useAHTConfiguration'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import { Timeframe, getDateRange } from '../../utils/dateUtils'
import TimeframeSelector from '../common/TimeframeSelector'

interface NumericFilter {
  min: number
  max: number
  currentRange: [number, number]
}

interface TextFilter {
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith'
  value: string
}

// Import TabSummaryStats type from PreDelivery
import type { TabSummaryStats } from '../../pages/PreDelivery'

interface TrainerWiseProps {
  isClientDelivery?: boolean
  onSummaryUpdate?: (stats: TabSummaryStats) => void
  onSummaryLoading?: () => void
}

type TimeframeOption = Timeframe // Alias for backward compatibility

// Project options for dropdown
const projectOptions = [
  { id: undefined, name: 'All Projects' },
  { id: 36, name: 'Nvidia - SysBench' },
  { id: 37, name: 'Nvidia - CFBench Multilingual' },
  { id: 38, name: 'Nvidia - InverseIFEval' },
  { id: 39, name: 'Nvidia - Multichallenge' },
]

// Aggregated trainer data type for Overall view
interface AggregatedTrainerStats {
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  submission_date: string | null  // null for aggregated view
  unique_tasks: number
  new_tasks_submitted: number
  rework_submitted: number
  total_submissions: number
  tasks_ready_for_delivery: number
  sum_number_of_turns: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  total_reviews?: number
  approved?: number
  approved_rework?: number
  delivered?: number
  in_queue?: number
  jibble_hours?: number | null
}

export default function TrainerWise({ isClientDelivery = false, onSummaryUpdate, onSummaryLoading }: TrainerWiseProps) {
  const [data, setData] = useState<TrainerDailyStats[]>([])
  const [overallData, setOverallData] = useState<TrainerDailyStats[]>([])
  const [filteredData, setFilteredData] = useState<AggregatedTrainerStats[]>([])
  const [taskLevelData, setTaskLevelData] = useState<TaskLevelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<TimeframeOption>('overall')
  const [weekOffset, setWeekOffset] = useState<number>(0) // Default to current week (Mon-Sun)
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [textFilters, setTextFilters] = useState<Record<string, TextFilter>>({})
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(100)

  // Report summary stats to parent when data changes
  useEffect(() => {
    if (overallData.length > 0 && onSummaryUpdate) {
      const totalTasks = overallData.reduce((sum, t) => sum + (t.unique_tasks || 0), 0)
      const totalTrainers = overallData.length
      const totalReviews = overallData.reduce((sum, t) => sum + (t.total_reviews || 0), 0)
      const newTasks = overallData.reduce((sum, t) => sum + (t.new_tasks_submitted || 0), 0)
      const rework = overallData.reduce((sum, t) => sum + (t.rework_submitted || 0), 0)
      
      onSummaryUpdate({
        totalTasks,
        totalTrainers,
        totalPodLeads: 0, // Not available in this tab
        totalProjects: selectedProject !== undefined ? 1 : 4, // 4 Nvidia projects
        totalReviews,
        newTasks,
        rework
      })
    }
  }, [overallData, onSummaryUpdate, selectedProject])
  
  // AHT Configuration hook - fetch project-wise AHT values
  const { calculateMergedAHT, calculateTotalExpectedHours, getAHTForProject } = useAHTConfiguration()
  
  // Target configuration state - separate for new tasks and rework
  const [newTaskTarget, setNewTaskTarget] = useState<number>(3) // Default 3 new tasks/day
  const [reworkTarget, setReworkTarget] = useState<number>(5)   // Default 5 rework/day

  // Get date range from shared utility
  const getCurrentDateRange = () => {
    const { startDate, endDate } = getDateRange(timeframe, weekOffset, customStartDate, customEndDate)
    return { start_date: startDate, end_date: endDate }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      onSummaryLoading?.()
      
      const filters: any = {}
      if (selectedProject !== undefined) {
        filters.project_id = selectedProject
      }
      
      // Add date range to filters for Jibble hours filtering
      const dateRange = getCurrentDateRange()
      if (dateRange.start_date) filters.start_date = dateRange.start_date
      if (dateRange.end_date) filters.end_date = dateRange.end_date
      
      const [dailyResult, overallResult, taskResult] = await Promise.all([
        getTrainerDailyStats(filters),
        getTrainerOverallStats(filters),
        getTaskLevelInfo({}),
      ])
      setData(dailyResult)
      setOverallData(overallResult)
      setFilteredData(dailyResult)
      setTaskLevelData(taskResult)
      
      // Fetch separate target configurations if a specific project is selected
      if (selectedProject !== undefined) {
        try {
          const targetsResponse = await getThroughputTargets(selectedProject)
          
          // Find new task target
          const newTaskConfig = targetsResponse.targets.find(
            t => t.config_key === 'new_tasks_target' && (t.entity_type === 'trainer' || t.entity_type === null)
          )
          // Find rework target
          const reworkConfig = targetsResponse.targets.find(
            t => t.config_key === 'rework_target' && (t.entity_type === 'trainer' || t.entity_type === null)
          )
          
          setNewTaskTarget(newTaskConfig?.target || 3)
          setReworkTarget(reworkConfig?.target || 5)
        } catch (targetErr) {
          console.warn('Failed to fetch target config:', targetErr)
          setNewTaskTarget(3) // Default fallback
          setReworkTarget(5)
        }
      } else {
        setNewTaskTarget(3) // Default when all projects
        setReworkTarget(5)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trainer statistics')
    } finally{
      setLoading(false)
    }
  }

  useEffect(() => {
    // Clear cache to ensure fresh data with Jibble hours
    clearCache()
    fetchData()
  }, [isClientDelivery, selectedProject, timeframe, weekOffset, customStartDate, customEndDate])

  // Helper function to aggregate daily data to trainer level
  const aggregateByTrainer = (dailyData: TrainerDailyStats[]): AggregatedTrainerStats[] => {
    const trainerMap = new Map<number, AggregatedTrainerStats>()
    
    dailyData.forEach(d => {
      const trainerId = d.trainer_id
      if (trainerId === null) return
      
      if (!trainerMap.has(trainerId)) {
        trainerMap.set(trainerId, {
          trainer_id: trainerId,
          trainer_name: d.trainer_name,
          trainer_email: d.trainer_email,
          submission_date: null, // null indicates aggregated data
          unique_tasks: 0,
          new_tasks_submitted: 0,
          rework_submitted: 0,
          total_submissions: 0,
          tasks_ready_for_delivery: 0,
          sum_number_of_turns: 0,
          avg_rework: null,
          rework_percent: null,
          avg_rating: null,
        })
      }
      
      const existing = trainerMap.get(trainerId)!
      existing.unique_tasks += d.unique_tasks || 0
      existing.new_tasks_submitted += d.new_tasks_submitted || 0
      existing.rework_submitted += d.rework_submitted || 0
      existing.total_submissions += d.total_submissions || 0
      existing.tasks_ready_for_delivery += d.tasks_ready_for_delivery || 0
      existing.sum_number_of_turns += d.sum_number_of_turns || 0
      
      // Track weighted rating (rating * unique_tasks for this day)
      if (d.avg_rating !== null && d.avg_rating !== undefined && d.unique_tasks > 0) {
        const existingWeight = (existing as any)._rating_weight || 0
        const existingSum = (existing as any)._rating_sum || 0
        ;(existing as any)._rating_weight = existingWeight + d.unique_tasks
        ;(existing as any)._rating_sum = existingSum + (d.avg_rating * d.unique_tasks)
      }
    })
    
    // Calculate avg_rework, rework_percent, and avg_rating after aggregation
    trainerMap.forEach((trainer) => {
      // Avg Rework = ((sum_number_of_turns / new_tasks) - 1) * 100 (as percentage)
      // Using new_tasks as denominator to match spreadsheet
      if (trainer.new_tasks_submitted > 0) {
        trainer.avg_rework = parseFloat(((trainer.sum_number_of_turns / trainer.new_tasks_submitted) - 1).toFixed(2))
      }
      // Rework % = rework / (rework + new_tasks) * 100
      const total = trainer.rework_submitted + trainer.new_tasks_submitted
      if (total > 0) {
        trainer.rework_percent = Math.round((trainer.rework_submitted / total) * 100)
      }
      // Avg Rating = weighted average
      const ratingWeight = (trainer as any)._rating_weight || 0
      const ratingSum = (trainer as any)._rating_sum || 0
      if (ratingWeight > 0) {
        trainer.avg_rating = Math.round((ratingSum / ratingWeight) * 100) / 100
      }
      // Clean up temp fields
      delete (trainer as any)._rating_weight
      delete (trainer as any)._rating_sum
    })
    
    return Array.from(trainerMap.values())
  }

  // Helper function to filter data by timeframe
  const getFilteredByTimeframe = (allData: TrainerDailyStats[], tf: TimeframeOption): AggregatedTrainerStats[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let filteredDaily: TrainerDailyStats[] = []
    
    switch (tf) {
      case 'daily': {
        const todayStr = today.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.submission_date === todayStr)
        return filteredDaily // Return daily data as-is
      }
      case 'd-1': {
        const d1 = new Date(today)
        d1.setDate(d1.getDate() - 1)
        const d1Str = d1.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.submission_date === d1Str)
        return filteredDaily
      }
      case 'd-2': {
        const d2 = new Date(today)
        d2.setDate(d2.getDate() - 2)
        const d2Str = d2.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.submission_date === d2Str)
        return filteredDaily
      }
      case 'd-3': {
        const d3 = new Date(today)
        d3.setDate(d3.getDate() - 3)
        const d3Str = d3.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.submission_date === d3Str)
        return filteredDaily
      }
      case 'weekly': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        filteredDaily = allData.filter(d => {
          if (!d.submission_date) return false
          const submissionDate = new Date(d.submission_date)
          return submissionDate >= weekAgo && submissionDate <= today
        })
        return filteredDaily // Return daily breakdown for weekly
      }
      case 'custom': {
        if (!customStartDate || !customEndDate) return allData
        const start = new Date(customStartDate)
        const end = new Date(customEndDate)
        filteredDaily = allData.filter(d => {
          if (!d.submission_date) return false
          const submissionDate = new Date(d.submission_date)
          return submissionDate >= start && submissionDate <= end
        })
        return filteredDaily // Return daily breakdown for custom range
      }
      case 'overall':
      default:
        // Use pre-computed overall stats from backend for accurate avg_rework
        return overallData.map(d => ({
          trainer_id: d.trainer_id,
          trainer_name: d.trainer_name,
          trainer_email: d.trainer_email,
          submission_date: null,
          unique_tasks: d.unique_tasks || 0,
          new_tasks_submitted: d.new_tasks_submitted || 0,
          rework_submitted: d.rework_submitted || 0,
          total_submissions: d.total_submissions || 0,
          tasks_ready_for_delivery: d.tasks_ready_for_delivery || 0,
          sum_number_of_turns: d.sum_number_of_turns || 0,
          avg_rework: d.avg_rework,
          rework_percent: d.rework_percent,
          avg_rating: d.avg_rating,
          total_reviews: d.total_reviews || 0,
          approved: d.approved || 0,
          approved_rework: d.approved_rework || 0,
          delivered: d.delivered || 0,
          in_queue: d.in_queue || 0,
          jibble_hours: d.jibble_hours,  // Include Jibble hours from backend
        }))
    }
  }

  // Initialize numeric filters when data changes
  const initializeNumericFilters = (trainers: AggregatedTrainerStats[]) => {
    const filters: Record<string, NumericFilter> = {}

    if (trainers.length === 0) return filters

    // Initialize filter for unique_tasks
    const uniqueTasksValues = trainers.map(t => t.unique_tasks || 0)
    if (uniqueTasksValues.length > 0) {
      const min = Math.min(...uniqueTasksValues)
      const max = Math.max(...uniqueTasksValues)
      filters['unique_tasks'] = { min, max, currentRange: [min, max] }
    }

    // Initialize filter for new_tasks_submitted
    const newTasksValues = trainers.map(t => t.new_tasks_submitted || 0)
    if (newTasksValues.length > 0) {
      const min = Math.min(...newTasksValues)
      const max = Math.max(...newTasksValues)
      filters['new_tasks_submitted'] = { min, max, currentRange: [min, max] }
    }

    // Initialize filter for rework_submitted
    const reworkValues = trainers.map(t => t.rework_submitted || 0)
    if (reworkValues.length > 0) {
      const min = Math.min(...reworkValues)
      const max = Math.max(...reworkValues)
      filters['rework_submitted'] = { min, max, currentRange: [min, max] }
    }

    // Initialize filter for total_submissions
    const totalValues = trainers.map(t => t.total_submissions || 0)
    if (totalValues.length > 0) {
      const min = Math.min(...totalValues)
      const max = Math.max(...totalValues)
      filters['total_submissions'] = { min, max, currentRange: [min, max] }
    }

    return filters
  }

  useEffect(() => {
    if (filteredData.length > 0) {
      const initialFilters = initializeNumericFilters(filteredData)
      setNumericFilters(initialFilters)
    }
  }, [filteredData])

  // Apply all filters (search + text + numeric + timeframe)
  useEffect(() => {
    // First apply timeframe filter
    let filtered = getFilteredByTimeframe(data, timeframe)

    // Apply search filter (from Autocomplete)
    if (selectedTrainers.length > 0) {
      filtered = filtered.filter(trainer => {
        const name = trainer.trainer_name || `ID: ${trainer.trainer_id}`
        const email = trainer.trainer_email ? ` (${trainer.trainer_email})` : ''
        const fullOption = `${name}${email}`
        return selectedTrainers.includes(fullOption)
      })
    }

    // Apply text filters
    Object.entries(textFilters).forEach(([key, filter]) => {
      if (filter.value.trim()) {
        filtered = filtered.filter((trainer) => {
          let fieldValue: string = ''

          if (key === 'trainer_name') {
            fieldValue = trainer.trainer_name || `ID: ${trainer.trainer_id}`
          } else if (key === 'trainer_email') {
            fieldValue = trainer.trainer_email || ''
          }

          const searchValue = filter.value.toLowerCase()
          const targetValue = fieldValue.toLowerCase()

          switch (filter.operator) {
            case 'contains':
              return targetValue.includes(searchValue)
            case 'equals':
              return targetValue === searchValue
            case 'startsWith':
              return targetValue.startsWith(searchValue)
            case 'endsWith':
              return targetValue.endsWith(searchValue)
            default:
              return true
          }
        })
      }
    })

    // Apply numeric range filters (only if actively modified)
    Object.entries(numericFilters).forEach(([key, filter]) => {
      const isFilterActive = filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max

      if (isFilterActive) {
        filtered = filtered.filter((trainer) => {
          let value: number | null = null

          if (key === 'unique_tasks') {
            value = trainer.unique_tasks || 0
          } else if (key === 'new_tasks_submitted') {
            value = trainer.new_tasks_submitted || 0
          } else if (key === 'rework_submitted') {
            value = trainer.rework_submitted || 0
          } else if (key === 'total_submissions') {
            value = trainer.total_submissions || 0
          }

          if (value === null || value === undefined || isNaN(value)) return false
          return value >= filter.currentRange[0] && value <= filter.currentRange[1]
        })
      }
    })

    setFilteredData(filtered)
    setPage(0)
  }, [selectedTrainers, textFilters, numericFilters, data, timeframe, weekOffset, customStartDate, customEndDate])

  // Get unique trainer names for autocomplete (since we have multiple rows per trainer)
  const trainerOptions = Array.from(new Set(data.map(t => {
    const name = t.trainer_name || `ID: ${t.trainer_id}`
    const email = t.trainer_email ? ` (${t.trainer_email})` : ''
    return `${name}${email}`
  })))

  if (loading) {
    return <LoadingSpinner message="Loading trainer statistics..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchData} />
  }

  // Helper functions for filters
  const resetNumericFilter = (columnKey: string) => {
    setNumericFilters(prev => {
      if (!prev[columnKey]) return prev
      return {
        ...prev,
        [columnKey]: {
          ...prev[columnKey],
          currentRange: [prev[columnKey].min, prev[columnKey].max]
        }
      }
    })
  }

  const handleSort = (field: string, direction?: 'asc' | 'desc') => {
    if (direction) {
      setSortColumn(field)
      setSortDirection(direction)
    } else {
      // Toggle sort
      if (sortColumn === field) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      } else {
        setSortColumn(field)
        setSortDirection('asc')
      }
    }
    setFilterAnchorEl(null)
    setActiveFilterColumn('')
  }

  // Sort the filtered data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    
    let aVal: any = (a as any)[sortColumn]
    let bVal: any = (b as any)[sortColumn]
    
    // Handle null/undefined
    if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity
    if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity
    
    // String comparison
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }
    
    // Numeric comparison
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
  })

  // Paginate the sorted data
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // Render column header with dropdown and tooltip (matching PodLeadTab style)
  const renderHeaderWithFilter = (label: string, columnKey: string, isNumeric: boolean = false) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: 'pointer',
        overflow: 'visible',
        '&:hover': { opacity: 0.8 }
      }}
      onClick={(e) => {
        setFilterAnchorEl(e.currentTarget as HTMLElement)
        setActiveFilterColumn(columnKey)
      }}
    >
      <ArrowDropDownIcon sx={{ fontSize: 18, color: '#64748B', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      {sortColumn === columnKey && (
        sortDirection === 'asc' ? 
          <ArrowUpwardIcon sx={{ fontSize: 14, flexShrink: 0 }} /> : 
          <ArrowDownwardIcon sx={{ fontSize: 14, flexShrink: 0 }} />
      )}
      <Tooltip 
        title={getTooltipForHeader(label)}
        arrow
        placement="top"
        enterDelay={200}
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: '#1E293B',
              color: '#F8FAFC',
              fontSize: '0.75rem',
              maxWidth: 300,
              p: '8px 12px',
              borderRadius: 1,
              zIndex: 9999,
            },
          },
          popper: {
            sx: {
              zIndex: 9999,
            },
          },
        }}
      >
        <InfoOutlinedIcon 
          sx={{ 
            fontSize: 14, 
            color: '#94A3B8', 
            cursor: 'help', 
            ml: 0.25, 
            flexShrink: 0,
            '&:hover': { color: '#64748B' } 
          }} 
          onClick={(e) => e.stopPropagation()}
        />
      </Tooltip>
    </Box>
  )


  // Check if any filters are active
  const hasActiveFilters = () => {
    // Check text filters (with safety check)
    const hasTextFilters = textFilters && Object.values(textFilters).some(filter => filter.value.trim() !== '')
    
    // Check numeric filters (with safety check)
    const hasNumericFilters = numericFilters && Object.values(numericFilters).some(filter =>
      filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
    )
    
    return hasTextFilters || hasNumericFilters
  }

  // Download function
  const handleDownload = () => {
    const showDate = timeframe !== 'overall'
    const showTargets = selectedProject !== undefined
    
    const columns = [
      { key: 'trainer_name', header: 'Trainer Name', width: 25 },
      { key: 'trainer_email', header: 'Email', width: 30 },
      ...(showDate ? [{ key: 'submission_date', header: 'Date', width: 15, format: formatDate }] : []),
      { key: 'unique_tasks', header: 'Unique Tasks', width: 15 },
      { key: 'new_tasks_submitted', header: 'New Tasks', width: 15 },
      { key: 'rework_submitted', header: 'Rework', width: 12 },
      { key: 'total_reviews', header: 'Total Reviews', width: 15 },
      { key: 'approved', header: 'Approved', width: 12 },
      { key: 'approved_rework', header: 'Appr. Rework', width: 15 },
      { key: 'delivered', header: 'Delivered', width: 12 },
      { key: 'in_queue', header: 'In Queue', width: 12 },
      { key: 'avg_rework', header: 'Avg Rework', width: 12, format: (v: number | null) => v !== null && v !== undefined ? v.toFixed(2) : '-' },
      { key: 'rework_percent', header: 'Rework %', width: 12, format: formatPercent },
      { key: 'avg_rating', header: 'Avg Rating', width: 12, format: (v: any) => formatDecimal(v, 2) },
      { key: 'jibble_hours', header: 'Jibble Hours (Logged)', width: 18, format: (v: any) => v !== null && v !== undefined ? v.toFixed(1) : '-' },
      // Time Theft Detection columns (only when project selected)
      ...(showTargets ? [
        { key: 'accounted_hours', header: 'Accounted Hours', width: 16, format: (v: any) => v !== null && v !== undefined ? v.toFixed(1) : '-' },
        { key: 'unaccounted_hours', header: 'Unaccounted Hours', width: 18, format: (v: any) => v !== null && v !== undefined ? v.toFixed(1) : '-' },
        { key: 'efficiency', header: 'Efficiency %', width: 12, format: (v: any) => v !== null && v !== undefined ? `${v.toFixed(0)}%` : '-' },
        { key: 'time_theft_flag', header: 'Time Theft Flag', width: 15 },
      ] : []),
    ]
    
    // Add time theft detection data to export
    const exportData = filteredData.map(t => {
      const newTasks = t.new_tasks_submitted || 0
      const reworkTasks = t.rework_submitted || 0
      const accountedHrs = calculateTotalExpectedHours(newTasks, reworkTasks, selectedProject)
      const jibbleHrs = (t as any).jibble_hours
      
      const efficiency = (accountedHrs !== null && jibbleHrs && jibbleHrs > 0) ? (accountedHrs / jibbleHrs) * 100 : null
      const unaccountedHrs = (jibbleHrs && accountedHrs !== null) ? Math.max(0, jibbleHrs - accountedHrs) : null
      const isTimeTheft = efficiency !== null && efficiency < 50
      
      return {
        ...t,
        accounted_hours: accountedHrs,
        unaccounted_hours: unaccountedHrs,
        efficiency: efficiency,
        time_theft_flag: isTimeTheft ? 'YES - FLAGGED' : efficiency !== null ? 'No' : '-',
      }
    })
    
    const timestamp = new Date().toISOString().split('T')[0]
    const projectName = selectedProject !== undefined 
      ? projectOptions.find(p => p.id === selectedProject)?.name?.replace(/\s+/g, '_') || 'Unknown' 
      : 'All_Projects'
    exportToExcel(exportData, columns, `Trainer_Stats_${projectName}_${timeframe}_${timestamp}`, 'Trainers')
  }


  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Project Selector */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="project-label">Project</InputLabel>
            <Select
              labelId="project-label"
              value={selectedProject ?? ''}
              label="Project"
              onChange={(e) => setSelectedProject(e.target.value === '' ? undefined : Number(e.target.value))}
              sx={{ backgroundColor: 'white' }}
            >
              {projectOptions.map((proj) => (
                <MenuItem key={proj.id ?? 'all'} value={proj.id ?? ''}>
                  {proj.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Timeframe Selector */}
          <TimeframeSelector
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            customStartDate={customStartDate}
            onCustomStartDateChange={setCustomStartDate}
            customEndDate={customEndDate}
            onCustomEndDateChange={setCustomEndDate}
          />

          <Box sx={{ flex: 1 }}>
            <Autocomplete
            multiple
            options={trainerOptions}
            value={selectedTrainers}
            onChange={(event, newValue) => setSelectedTrainers(newValue)}
            filterOptions={(options, { inputValue }) => {
              // Custom filter to search in entire option string (includes email)
              const searchTerm = inputValue.toLowerCase()
              return options.filter(option => 
                option.toLowerCase().includes(searchTerm)
              )
            }}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props
              return (
                <li 
                  {...otherProps} 
                  key={key || option}
                  style={{ 
                    padding: 0,
                    display: 'block',
                    width: '100%',
                  }}
                >
                  <Typography
                    sx={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'block',
                      width: '100%',
                      whiteSpace: 'normal',
                      wordWrap: 'break-word',
                    }}
                  >
                    {option}
                  </Typography>
                </li>
              )
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                variant="outlined"
                placeholder="Search and select trainers..."
                size="small"
                sx={{ 
                  backgroundColor: 'white',
                  '& .MuiInputBase-input': {
                    fontSize: '12px',
                  }
                }}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option}
                  {...getTagProps({ index })}
                  size="small"
                  sx={{
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    '& .MuiChip-label': {
                      fontSize: '0.75rem',
                      px: 1,
                    },
                    '& .MuiChip-deleteIcon': {
                      color: '#6B7280',
                      fontSize: '0.9rem',
                      '&:hover': {
                        color: '#374151',
                      },
                    },
                  }}
                />
              ))
            }
            sx={{
              '& .MuiAutocomplete-tag': {
                margin: '2px',
              },
              '& .MuiAutocomplete-option': {
                fontSize: '12px',
                padding: '0 !important',
                minHeight: '40px',
              },
            }}
          />
          </Box>
          
          {/* Individual Filter Chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {/* Text Filters */}
            {textFilters && Object.entries(textFilters).map(([key, filter]) => {
              if (!filter.value.trim()) return null
              const columnName = key === 'trainer_name' ? 'Trainer' : 
                               key === 'trainer_email' ? 'Trainer Email' : key
              return (
                <Chip
                  key={`text-${key}`}
                  label={`${columnName}: ${filter.value}`}
                  size="small"
                  onDelete={() => {
                    const newFilters = { ...textFilters }
                    delete newFilters[key]
                    setTextFilters(newFilters)
                  }}
                  sx={{
                    backgroundColor: '#EEF2FF',
                    color: '#2E5CFF',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    '& .MuiChip-deleteIcon': {
                      color: '#2E5CFF',
                      '&:hover': {
                        color: '#1E40AF',
                      },
                    },
                  }}
                />
              )
            })}
            
            {/* Numeric Filters */}
            {numericFilters && Object.entries(numericFilters).map(([key, filter]) => {
              const isActive = filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
              if (!isActive) return null
              
              let columnName = key
              if (key === 'total_unique_tasks') {
                columnName = 'Unique Tasks'
              } else if (key === 'task_score') {
                columnName = 'Task Score'
              }
              
              const displayValue = `${filter.currentRange[0]}-${filter.currentRange[1]}`
              
              return (
                <Chip
                  key={`numeric-${key}`}
                  label={`${columnName}: ${displayValue}`}
                  size="small"
                  onDelete={() => {
                    const newFilters = { ...numericFilters }
                    newFilters[key] = {
                      ...filter,
                      currentRange: [filter.min, filter.max]
                    }
                    setNumericFilters(newFilters)
                  }}
                  sx={{
                    backgroundColor: '#EEF2FF',
                    color: '#2E5CFF',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    '& .MuiChip-deleteIcon': {
                      color: '#2E5CFF',
                      '&:hover': {
                        color: '#1E40AF',
                      },
                    },
                  }}
                />
              )
            })}
            
            {/* Search Selection Chips */}
            {selectedTrainers.length > 0 && selectedTrainers.map((trainer, index) => (
              <Chip
                key={`search-${index}`}
                label={`Selected: ${trainer}`}
                size="small"
                onDelete={() => {
                  setSelectedTrainers(prev => prev.filter((_, i) => i !== index))
                }}
                sx={{
                  backgroundColor: '#F3F4F6',
                  color: '#1F2937',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  '& .MuiChip-deleteIcon': {
                    color: '#6B7280',
                    '&:hover': {
                      color: '#1F2937',
                    },
                  },
                }}
              />
            ))}
            
            {/* Clear All Button */}
            {hasActiveFilters() && (
              <Chip
                icon={<FilterListIcon />}
                label="Clear All"
                size="small"
                onClick={() => {
                  setSelectedTrainers([])
                  setTextFilters({})
                  const resetFilters = initializeNumericFilters(data)
                  setNumericFilters(resetFilters)
                  setSortColumn('')
                  setSortDirection('asc')                }}
                sx={{
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  '& .MuiChip-icon': {
                    color: '#DC2626',
                  },
                  '&:hover': {
                    backgroundColor: '#FECACA',
                  },
                }}
              />
            )}
            
            {/* Download Button */}
            <Tooltip title="Download as Excel">
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                sx={{
                  borderColor: '#10B981',
                  color: '#10B981',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  '&:hover': {
                    borderColor: '#059669',
                    backgroundColor: '#ECFDF5',
                  },
                }}
              >
                Export
              </Button>
            </Tooltip>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1200 }}>
            <TableHead>
              {/* Group Header Row */}
              <TableRow>
                {/* Overview Group */}
                <TableCell 
                  colSpan={2}
                  align="center"
                  sx={{ 
                    ...headerCellStyle,
                    bgcolor: COLUMN_GROUPS.overview.bgHeader,
                    color: COLUMN_GROUPS.overview.textColor,
                    borderBottom: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    position: 'sticky',
                    left: 0,
                    zIndex: 4,
                  }}
                >
                  OVERVIEW
                </TableCell>
                {/* Tasks Group */}
                <TableCell 
                  colSpan={6}
                  align="center"
                  sx={{ 
                    ...headerCellStyle,
                    bgcolor: COLUMN_GROUPS.tasks.bgHeader,
                    color: COLUMN_GROUPS.tasks.textColor,
                    borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.tasks.borderColor}`,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  TASKS
                </TableCell>
                {/* Quality Group */}
                <TableCell 
                  colSpan={4}
                  align="center"
                  sx={{ 
                    ...headerCellStyle,
                    bgcolor: COLUMN_GROUPS.quality.bgHeader,
                    color: COLUMN_GROUPS.quality.textColor,
                    borderBottom: `2px solid ${COLUMN_GROUPS.quality.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.quality.borderColor}`,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  QUALITY
                </TableCell>
                {/* Time & Efficiency Group */}
                <TableCell 
                  colSpan={selectedProject !== undefined ? 4 : 2}
                  align="center"
                  sx={{ 
                    ...headerCellStyle,
                    bgcolor: COLUMN_GROUPS.efficiency.bgHeader,
                    color: COLUMN_GROUPS.efficiency.textColor,
                    borderBottom: `2px solid ${COLUMN_GROUPS.efficiency.borderColor}`,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  TIME & EFFICIENCY
                </TableCell>
              </TableRow>
              {/* Sub-Header Row */}
              <TableRow>
                {/* Overview - Trainer Name */}
                <TableCell sx={{ 
                  ...headerCellStyle,
                  bgcolor: COLUMN_GROUPS.overview.bgSubHeader, 
                  color: COLUMN_GROUPS.overview.textColor, 
                  minWidth: 160, 
                  borderBottom: `2px solid ${COLUMN_GROUPS.overview.borderColor}`, 
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                }}>
                  {renderHeaderWithFilter('Trainer', 'trainer_name', false)}
                </TableCell>
                {/* Overview - Trainer Email */}
                <TableCell sx={{ 
                  ...headerCellStyle,
                  bgcolor: COLUMN_GROUPS.overview.bgSubHeader, 
                  color: COLUMN_GROUPS.overview.textColor, 
                  minWidth: 180, 
                  borderBottom: `2px solid ${COLUMN_GROUPS.overview.borderColor}`, 
                  borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                  position: 'sticky',
                  left: 160,
                  zIndex: 3,
                }}>
                  {renderHeaderWithFilter('Email', 'trainer_email', false)}
                </TableCell>
                {/* Tasks Group Columns */}
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('Uniq', 'unique_tasks', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('New', 'new_tasks_submitted', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('Rwk', 'rework_submitted', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('Appr', 'approved', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('Del', 'delivered', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.tasks.bgSubHeader, color: COLUMN_GROUPS.tasks.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.tasks.borderColor}`, borderRight: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                  {renderHeaderWithFilter('Queue', 'in_queue', true)}
                </TableCell>
                {/* Quality Group Columns */}
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.quality.bgSubHeader, color: COLUMN_GROUPS.quality.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.quality.borderColor}` }}>
                  {renderHeaderWithFilter('Rev', 'total_reviews', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.quality.bgSubHeader, color: COLUMN_GROUPS.quality.textColor, minWidth: 55, borderBottom: `2px solid ${COLUMN_GROUPS.quality.borderColor}` }}>
                  {renderHeaderWithFilter('AvgR', 'avg_rework', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.quality.bgSubHeader, color: COLUMN_GROUPS.quality.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.quality.borderColor}` }}>
                  {renderHeaderWithFilter('R%', 'rework_percent', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.quality.bgSubHeader, color: COLUMN_GROUPS.quality.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.quality.borderColor}`, borderRight: `2px solid ${COLUMN_GROUPS.quality.borderColor}` }}>
                  {renderHeaderWithFilter('Rate', 'avg_rating', true)}
                </TableCell>
                {/* Time & Efficiency Group Columns */}
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.efficiency.bgSubHeader, color: COLUMN_GROUPS.efficiency.textColor, minWidth: 50, borderBottom: `2px solid ${COLUMN_GROUPS.efficiency.borderColor}` }}>
                  {renderHeaderWithFilter('AHT', 'merged_exp_aht', true)}
                </TableCell>
                <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.efficiency.bgSubHeader, color: COLUMN_GROUPS.efficiency.textColor, minWidth: 55, borderBottom: `2px solid ${COLUMN_GROUPS.efficiency.borderColor}`, borderRight: selectedProject === undefined ? 'none' : `2px solid ${COLUMN_GROUPS.efficiency.borderColor}` }}>
                  {renderHeaderWithFilter('Jibble', 'jibble_hours', true)}
                </TableCell>
                {/* Time Theft Detection Columns - Only show when project is selected */}
                {selectedProject !== undefined && (
                  <>
                    <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.efficiency.bgSubHeader, color: COLUMN_GROUPS.efficiency.textColor, minWidth: 55, borderBottom: `2px solid ${COLUMN_GROUPS.efficiency.borderColor}` }}>
                      <Tooltip title="Hours accounted for by actual work = New×AHT + Rework×AHT" arrow placement="top">
                        <span>Acct</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ ...headerCellStyle, bgcolor: COLUMN_GROUPS.efficiency.bgSubHeader, color: COLUMN_GROUPS.efficiency.textColor, minWidth: 55, borderBottom: `2px solid ${COLUMN_GROUPS.efficiency.borderColor}` }}>
                      <Tooltip title="Efficiency = (Accounted Hrs / Jibble Hrs) × 100" arrow placement="top">
                        <span>Eff%</span>
                      </Tooltip>
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((trainer, idx) => {
                const newTasks = trainer.new_tasks_submitted || 0
                const rework = trainer.rework_submitted || 0
                const mergedExpAht = calculateMergedAHT(newTasks, rework, selectedProject)
                
                // Color coding helpers
                const getAvgReworkStyle = (avgR: number | null) => {
                  if (avgR === null) return { color: '#94A3B8', bgcolor: 'transparent' }
                  if (avgR < 1) return { color: '#065F46', bgcolor: '#D1FAE5' }
                  if (avgR <= 2.5) return { color: '#92400E', bgcolor: '#FEF3C7' }
                  return { color: '#991B1B', bgcolor: '#FEE2E2' }
                }
                const getReworkPctStyle = (rPct: number | null) => {
                  if (rPct === null) return { color: '#94A3B8', bgcolor: 'transparent' }
                  if (rPct <= 10) return { color: '#065F46', bgcolor: '#D1FAE5' }
                  if (rPct <= 30) return { color: '#92400E', bgcolor: '#FEF3C7' }
                  return { color: '#991B1B', bgcolor: '#FEE2E2' }
                }
                const getRatingStyle = (rating: number | null) => {
                  if (rating === null) return { color: '#94A3B8', bgcolor: 'transparent' }
                  if (rating > 4.8) return { color: '#065F46', bgcolor: '#D1FAE5' }
                  if (rating >= 4) return { color: '#92400E', bgcolor: '#FEF3C7' }
                  return { color: '#991B1B', bgcolor: '#FEE2E2' }
                }
                
                return (
                  <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                    {/* Overview Group */}
                    <TableCell sx={{ 
                      ...cellStyle,
                      position: 'sticky', 
                      left: 0, 
                      bgcolor: 'white', 
                      zIndex: 1,
                    }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#1E293B' }}>
                          {trainer.trainer_name || 'Unknown'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.55rem', color: '#94A3B8' }}>
                          ID: {trainer.trainer_id || 'N/A'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ 
                      ...cellStyle,
                      position: 'sticky', 
                      left: 160, 
                      bgcolor: 'white', 
                      borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                      zIndex: 1,
                    }}>
                      <Typography sx={{ fontSize: '0.65rem', color: '#64748B' }}>
                        {trainer.trainer_email || 'N/A'}
                      </Typography>
                    </TableCell>
                    {/* Tasks Group */}
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {trainer.unique_tasks ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {newTasks}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {rework}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {trainer.approved ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
                        {trainer.delivered ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle, borderRight: `2px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
                        {trainer.in_queue ?? 0}
                      </Typography>
                    </TableCell>
                    {/* Quality Group */}
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {trainer.total_reviews ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle, ...getAvgReworkStyle(trainer.avg_rework) }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                        {trainer.avg_rework !== null ? trainer.avg_rework.toFixed(2) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle, ...getReworkPctStyle(trainer.rework_percent) }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                        {trainer.rework_percent !== null ? `${Math.round(trainer.rework_percent)}%` : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle, borderRight: `2px solid ${COLUMN_GROUPS.quality.borderColor}`, ...getRatingStyle(trainer.avg_rating) }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                        {trainer.avg_rating !== null ? trainer.avg_rating.toFixed(2) : '-'}
                      </Typography>
                    </TableCell>
                    {/* Time & Efficiency Group */}
                    <TableCell align="center" sx={{ ...cellStyle }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                        {mergedExpAht !== null ? mergedExpAht.toFixed(1) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellStyle, borderRight: selectedProject === undefined ? 'none' : `2px solid ${COLUMN_GROUPS.efficiency.borderColor}` }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#92400E' }}>
                        {trainer.jibble_hours !== null && trainer.jibble_hours !== undefined ? trainer.jibble_hours.toFixed(1) : '-'}
                      </Typography>
                    </TableCell>
                    {/* Time Theft Detection Cells - Only show when project is selected */}
                    {selectedProject !== undefined && (() => {
                      const accountedHrs = calculateTotalExpectedHours(newTasks, rework, selectedProject)
                      const jibbleHrs = trainer.jibble_hours
                      const efficiency = (accountedHrs !== null && jibbleHrs && jibbleHrs > 0) 
                        ? (accountedHrs / jibbleHrs) * 100 
                        : null
                      const getEffStyle = (eff: number | null) => {
                        if (eff === null) return { color: '#94A3B8', bgcolor: 'transparent' }
                        if (eff >= 90) return { color: '#065F46', bgcolor: '#D1FAE5' }
                        if (eff >= 70) return { color: '#92400E', bgcolor: '#FEF3C7' }
                        return { color: '#991B1B', bgcolor: '#FEE2E2' }
                      }
                      
                      return (
                        <>
                          <TableCell align="center" sx={{ ...cellStyle }}>
                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569' }}>
                              {accountedHrs !== null ? accountedHrs.toFixed(1) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ ...cellStyle, ...getEffStyle(efficiency) }}>
                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                              {efficiency !== null ? `${efficiency.toFixed(0)}%` : '-'}
                            </Typography>
                          </TableCell>
                        </>
                      )
                    })()}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={sortedData.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10))
            setPage(0)
          }}
          sx={{ borderTop: '1px solid #E2E8F0' }}
        />
      </Paper>

      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchorEl) && Boolean(activeFilterColumn)}
        anchorEl={filterAnchorEl}
        onClose={() => {
          setFilterAnchorEl(null)
          setActiveFilterColumn('')
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              borderRadius: 2,
            }
          }
        }}
      >
        {activeFilterColumn && (
          <Box sx={{ minWidth: 320 }}>
            {/* Sort Options - Show for all columns */}
            <Box sx={{ p: 2 }}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  fontWeight: 600, 
                  mb: 1.5, 
                  color: '#1F2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <SortIcon fontSize="small" />
                Sort
              </Typography>
              
              <MenuItem
                onClick={() => handleSort(activeFilterColumn, 'asc')}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon>
                  <ArrowUpwardIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort Ascending</ListItemText>
              </MenuItem>
              
              <MenuItem
                onClick={() => handleSort(activeFilterColumn, 'desc')}
                sx={{ borderRadius: 1 }}
              >
                <ListItemIcon>
                  <ArrowDownwardIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort Descending</ListItemText>
              </MenuItem>
            </Box>

            {/* Text Filter - Show for trainer_name and trainer_email columns */}
            {(activeFilterColumn === 'trainer_name' || activeFilterColumn === 'trainer_email') && (
              <>
                <Divider />
                <Box sx={{ p: 2 }}>
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      fontWeight: 600, 
                      mb: 1.5, 
                      color: '#1F2937',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                    Filter
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Operator</InputLabel>
                      <Select
                        value={textFilters[activeFilterColumn]?.operator || 'contains'}
                        label="Operator"
                        onChange={(e) => {
                          setTextFilters(prev => ({
                            ...prev,
                            [activeFilterColumn]: {
                              ...prev[activeFilterColumn],
                              operator: e.target.value as any,
                              value: prev[activeFilterColumn]?.value || ''
                            }
                          }))
                        }}
                      >
                        <MenuItem value="contains">Contains</MenuItem>
                        <MenuItem value="equals">Equals</MenuItem>
                        <MenuItem value="startsWith">Starts With</MenuItem>
                        <MenuItem value="endsWith">Ends With</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      size="small"
                      label="Filter Value"
                      value={textFilters[activeFilterColumn]?.value || ''}
                      onChange={(e) => {
                        setTextFilters(prev => ({
                          ...prev,
                          [activeFilterColumn]: {
                            operator: prev[activeFilterColumn]?.operator || 'contains',
                            value: e.target.value
                          }
                        }))
                      }}
                      placeholder="Enter filter value..."
                    />
                  </Box>
                </Box>
              </>
            )}

            {/* Filter Range - Only show for numeric columns */}
            {numericFilters[activeFilterColumn] && (
              <>
                <Divider />
                <Box sx={{ p: 3 }}>
                  <Typography 
                    variant="subtitle2" 
                    sx={{ 
                      fontWeight: 600, 
                      mb: 2, 
                      color: '#1F2937',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <FilterListIcon fontSize="small" />
                    Filter Range
                  </Typography>
                  
                  <Slider
                    value={numericFilters[activeFilterColumn].currentRange}
                    onChange={(_, newValue) => {
                      setNumericFilters(prev => ({
                        ...prev,
                        [activeFilterColumn]: {
                          ...prev[activeFilterColumn],
                          currentRange: newValue as [number, number]
                        }
                      }))
                    }}
                    valueLabelDisplay="on"
                    min={numericFilters[activeFilterColumn].min}
                    max={numericFilters[activeFilterColumn].max}
                    step={activeFilterColumn === 'total_unique_tasks' ? 1 : 0.01}
                    valueLabelFormat={(value) => 
                      activeFilterColumn === 'total_unique_tasks' ? value.toString() : value.toFixed(2)
                    }
                    sx={{
                      color: '#2E5CFF',
                      '& .MuiSlider-thumb': {
                        backgroundColor: '#2E5CFF',
                      },
                      '& .MuiSlider-track': {
                        backgroundColor: '#2E5CFF',
                      },
                      '& .MuiSlider-rail': {
                        backgroundColor: '#E5E7EB',
                      },
                      '& .MuiSlider-valueLabel': {
                        backgroundColor: '#2E5CFF',
                        borderRadius: 1,
                        padding: '4px 8px',
                      },
                    }}
                  />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                      Min: {activeFilterColumn === 'total_unique_tasks' 
                        ? numericFilters[activeFilterColumn].min 
                        : numericFilters[activeFilterColumn].min.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                      Max: {activeFilterColumn === 'total_unique_tasks' 
                        ? numericFilters[activeFilterColumn].max 
                        : numericFilters[activeFilterColumn].max.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}

            <Divider />

            {/* Action Buttons */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  // Reset numeric filter if exists
                  if (numericFilters[activeFilterColumn]) {
                    resetNumericFilter(activeFilterColumn)
                  }
                  // Reset text filter if exists
                  if (textFilters[activeFilterColumn]) {
                    setTextFilters(prev => {
                      const newFilters = { ...prev }
                      delete newFilters[activeFilterColumn]
                      return newFilters
                    })
                  }
                  // Reset sort
                  setSortColumn('')
                  setSortDirection('asc')
                }}
                sx={{
                  color: '#6B7280',
                  borderColor: '#D1D5DB',
                  '&:hover': {
                    borderColor: '#9CA3AF',
                    backgroundColor: '#F9FAFB',
                  },
                }}
              >
                Reset All
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setFilterAnchorEl(null)
                  setActiveFilterColumn('')
                }}
                sx={{
                  backgroundColor: '#2E5CFF',
                  '&:hover': {
                    backgroundColor: '#2347D5',
                  },
                }}
              >
                Apply
              </Button>
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  )
}
