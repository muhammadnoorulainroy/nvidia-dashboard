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
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { exportToExcel, formatPercent, formatDecimal, formatDate } from '../../utils/exportToExcel'
import { getTrainerStats, getTaskLevelInfo, getClientDeliveryTrainerStats, getTrainerDailyStats, getTrainerOverallStats, getThroughputTargets, clearCache } from '../../services/api'
import type { TrainerLevelAggregation, TaskLevelInfo, TrainerDailyStats } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'
import { useAHTConfiguration } from '../../hooks/useAHTConfiguration'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'

interface NumericFilter {
  min: number
  max: number
  currentRange: [number, number]
}

interface TextFilter {
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith'
  value: string
}

interface TrainerWiseProps {
  isClientDelivery?: boolean
}

type TimeframeOption = 'daily' | 'd-1' | 'd-2' | 'd-3' | 'weekly' | 'custom' | 'overall'

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

export default function TrainerWise({ isClientDelivery = false }: TrainerWiseProps) {
  const [data, setData] = useState<TrainerDailyStats[]>([])
  const [overallData, setOverallData] = useState<TrainerDailyStats[]>([])
  const [filteredData, setFilteredData] = useState<AggregatedTrainerStats[]>([])
  const [taskLevelData, setTaskLevelData] = useState<TaskLevelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<TimeframeOption>('overall')
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [textFilters, setTextFilters] = useState<Record<string, TextFilter>>({})
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(100)
  
  // AHT Configuration hook - fetch project-wise AHT values
  const { calculateMergedAHT, calculateTotalExpectedHours, getAHTForProject } = useAHTConfiguration()
  
  // Target configuration state - separate for new tasks and rework
  const [newTaskTarget, setNewTaskTarget] = useState<number>(3) // Default 3 new tasks/day
  const [reworkTarget, setReworkTarget] = useState<number>(5)   // Default 5 rework/day

  // Calculate date range based on timeframe
  const getDateRange = (): { start_date?: string; end_date?: string } => {
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    
    switch (timeframe) {
      case 'daily':
        return { start_date: formatDate(today), end_date: formatDate(today) }
      case 'd-1': {
        const d1 = new Date(today)
        d1.setDate(d1.getDate() - 1)
        return { start_date: formatDate(d1), end_date: formatDate(d1) }
      }
      case 'd-2': {
        const d2 = new Date(today)
        d2.setDate(d2.getDate() - 2)
        return { start_date: formatDate(d2), end_date: formatDate(d2) }
      }
      case 'd-3': {
        const d3 = new Date(today)
        d3.setDate(d3.getDate() - 3)
        return { start_date: formatDate(d3), end_date: formatDate(d3) }
      }
      case 'weekly': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return { start_date: formatDate(weekAgo), end_date: formatDate(today) }
      }
      case 'custom':
        return startDate && endDate ? { start_date: startDate, end_date: endDate } : {}
      case 'overall':
      default:
        return {} // No date filter = all time
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const filters: any = {}
      if (selectedProject !== undefined) {
        filters.project_id = selectedProject
      }
      
      // Add date range to filters for Jibble hours filtering
      const dateRange = getDateRange()
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
  }, [isClientDelivery, selectedProject, timeframe, startDate, endDate])

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
        if (!startDate || !endDate) return allData
        const start = new Date(startDate)
        const end = new Date(endDate)
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
  }, [selectedTrainers, textFilters, numericFilters, data, timeframe, startDate, endDate])

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
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="timeframe-label">Timeframe</InputLabel>
            <Select
              labelId="timeframe-label"
              value={timeframe}
              label="Timeframe"
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
              sx={{ backgroundColor: 'white' }}
            >
              <MenuItem value="daily">Daily (Today)</MenuItem>
              <MenuItem value="d-1">D-1 (Yesterday)</MenuItem>
              <MenuItem value="d-2">D-2</MenuItem>
              <MenuItem value="d-3">D-3</MenuItem>
              <MenuItem value="weekly">Weekly (Last 7 days)</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
              <MenuItem value="overall">Overall (All time)</MenuItem>
            </Select>
          </FormControl>

          {/* Date Range Picker - shown when Custom Range is selected */}
          {timeframe === 'custom' && (
            <>
              <TextField
                type="date"
                size="small"
                label="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160, backgroundColor: 'white' }}
              />
              <TextField
                type="date"
                size="small"
                label="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160, backgroundColor: 'white' }}
              />
            </>
          )}

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
          <Table stickyHeader size="small" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  fontWeight: 600, 
                  bgcolor: '#F8FAFC', 
                  color: '#334155', 
                  minWidth: 180, 
                  borderBottom: '2px solid #E2E8F0', 
                  fontSize: '0.8125rem', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.025em',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Trainer', 'trainer_name', false)}
                </TableCell>
                <TableCell sx={{ 
                  fontWeight: 600, 
                  bgcolor: '#F8FAFC', 
                  color: '#334155', 
                  minWidth: 200, 
                  borderBottom: '2px solid #E2E8F0', 
                  fontSize: '0.8125rem', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.025em',
                  position: 'sticky',
                  left: 180,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Trainer Email', 'trainer_email', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Unique', 'unique_tasks', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('New Tasks', 'new_tasks_submitted', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Rework', 'rework_submitted', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Total Reviews', 'total_reviews', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Approved', 'approved', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Appr. Rework', 'approved_rework', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Delivered', 'delivered', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('In Queue', 'in_queue', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Avg Rework', 'avg_rework', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Rework %', 'rework_percent', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Avg Rating', 'avg_rating', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 120, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Merged Exp. AHT', 'merged_exp_aht', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#FEF3C7', color: '#92400E', minWidth: 100, borderBottom: '2px solid #FCD34D', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Jibble Hrs', 'jibble_hours', true)}
                </TableCell>
                {/* Time Theft Detection Columns - Only show when project is selected */}
                {selectedProject !== undefined && (
                  <>
                    {/* Accounted Hours = Merged Exp. AHT (work they actually did) */}
                    <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F0FDF4', color: '#166534', minWidth: 100, borderBottom: '2px solid #86EFAC', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        Accounted Hrs
                        <Tooltip title="Hours accounted for by actual work = Merged Exp. AHT (New×AHT + Rework×AHT)" arrow placement="top">
                          <InfoOutlinedIcon sx={{ fontSize: 12, color: '#22C55E', cursor: 'help' }} />
                        </Tooltip>
                      </Box>
                    </TableCell>
                    {/* Efficiency - KEY METRIC for time theft */}
                    <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#FEF2F2', color: '#991B1B', minWidth: 100, borderBottom: '2px solid #FCA5A5', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        Efficiency
                        <Tooltip title="Efficiency = (Accounted Hrs / Jibble Hrs) × 100. Below 50% = Time Theft Flag" arrow placement="top">
                          <InfoOutlinedIcon sx={{ fontSize: 12, color: '#DC2626', cursor: 'help' }} />
                        </Tooltip>
                      </Box>
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
                
                return (
                  <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                    <TableCell sx={{ 
                      position: 'sticky', 
                      left: 0, 
                      bgcolor: 'white', 
                      borderRight: '2px solid #E2E8F0',
                      zIndex: 1,
                    }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                          {trainer.trainer_name || 'Unknown'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          ID: {trainer.trainer_id || 'N/A'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ 
                      position: 'sticky', 
                      left: 180, 
                      bgcolor: 'white', 
                      borderRight: '2px solid #E2E8F0',
                      zIndex: 1,
                    }}>
                      <Typography variant="body2" sx={{ color: '#1F2937', fontSize: '0.875rem' }}>
                        {trainer.trainer_email || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {trainer.unique_tasks ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: newTasks ? '#10B981' : '#9CA3AF' }}>
                        {newTasks}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: rework ? '#F59E0B' : '#9CA3AF' }}>
                        {rework}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {trainer.total_reviews ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: trainer.approved ? '#10B981' : '#9CA3AF' }}>
                        {trainer.approved ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: trainer.approved_rework ? '#F59E0B' : '#9CA3AF' }}>
                        {trainer.approved_rework ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: trainer.delivered ? '#10B981' : '#9CA3AF' }}>
                        {trainer.delivered ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: trainer.in_queue ? '#EF4444' : '#9CA3AF' }}>
                        {trainer.in_queue ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ 
                        fontWeight: 600, 
                        color: trainer.avg_rework !== null 
                          ? (trainer.avg_rework >= 3 ? '#EF4444' : trainer.avg_rework >= 2 ? '#F59E0B' : '#10B981')
                          : '#9CA3AF'
                      }}>
                        {trainer.avg_rework !== null ? trainer.avg_rework.toFixed(2) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ 
                        fontWeight: 600, 
                        color: trainer.rework_percent !== null 
                          ? (trainer.rework_percent >= 70 ? '#EF4444' : trainer.rework_percent >= 50 ? '#F59E0B' : '#10B981')
                          : '#9CA3AF'
                      }}>
                        {trainer.rework_percent !== null ? `${Math.round(trainer.rework_percent)}%` : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ 
                        fontWeight: 600, 
                        color: trainer.avg_rating !== null 
                          ? (trainer.avg_rating >= 4.5 ? '#10B981' : trainer.avg_rating >= 3.5 ? '#F59E0B' : '#EF4444')
                          : '#9CA3AF'
                      }}>
                        {trainer.avg_rating !== null ? trainer.avg_rating.toFixed(2) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: mergedExpAht !== null ? '#1F2937' : '#9CA3AF' }}>
                        {mergedExpAht !== null ? mergedExpAht.toFixed(2) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ bgcolor: '#FFFBEB' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: trainer.jibble_hours ? '#92400E' : '#9CA3AF' }}>
                        {trainer.jibble_hours !== null && trainer.jibble_hours !== undefined ? trainer.jibble_hours.toFixed(1) : '-'}
                      </Typography>
                    </TableCell>
                    {/* Time Theft Detection Cells - Only show when project is selected */}
                    {selectedProject !== undefined && (() => {
                      // Accounted Hours = Total Expected Hours based on AHT
                      // Formula: (newTasks × newTaskAht) + (rework × reworkAht)
                      const accountedHrs = calculateTotalExpectedHours(newTasks, rework, selectedProject)
                      const jibbleHrs = trainer.jibble_hours
                      
                      // Efficiency = Accounted Hours / Jibble Hours × 100
                      // Below 50% = Time Theft Flag
                      const efficiency = (accountedHrs !== null && jibbleHrs && jibbleHrs > 0) 
                        ? (accountedHrs / jibbleHrs) * 100 
                        : null
                      
                      // Time theft flag: efficiency < 50%
                      const isTimeTheft = efficiency !== null && efficiency < 50
                      const isWarning = efficiency !== null && efficiency >= 50 && efficiency < 70
                      
                      return (
                        <>
                          {/* Accounted Hours */}
                          <TableCell align="center" sx={{ bgcolor: '#F0FDF4', px: 1 }}>
                            {accountedHrs !== null ? (
                              <Tooltip title={`New: ${newTasks} tasks, Rework: ${rework} tasks`} arrow>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#166534' }}>
                                  {accountedHrs.toFixed(1)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>-</Typography>
                            )}
                          </TableCell>
                          {/* Efficiency - Time Theft Detection */}
                          <TableCell align="center" sx={{ 
                            bgcolor: isTimeTheft ? '#FEE2E2' : isWarning ? '#FEF3C7' : '#F0FDF4', 
                            px: 1 
                          }}>
                            {efficiency !== null ? (
                              <Tooltip 
                                title={
                                  isTimeTheft 
                                    ? `⚠️ TIME THEFT FLAG: Only ${efficiency.toFixed(0)}% of logged time accounted for. Unaccounted: ${(jibbleHrs! - (accountedHrs || 0)).toFixed(1)} hrs`
                                    : `Accounted: ${accountedHrs?.toFixed(1)}hrs / Logged: ${jibbleHrs?.toFixed(1)}hrs`
                                } 
                                arrow
                              >
                                <Chip
                                  label={`${efficiency.toFixed(0)}%`}
                                  size="small"
                                  icon={isTimeTheft ? <span style={{ fontSize: '10px' }}>🚨</span> : undefined}
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    bgcolor: isTimeTheft ? '#DC2626' : isWarning ? '#F59E0B' : efficiency >= 90 ? '#10B981' : '#3B82F6',
                                    color: 'white',
                                    minWidth: 60,
                                    '& .MuiChip-icon': { marginLeft: '4px' }
                                  }}
                                />
                              </Tooltip>
                            ) : (
                              <Tooltip title="Requires Jibble hours data" arrow>
                                <Typography variant="body2" sx={{ color: '#9CA3AF', cursor: 'help', fontSize: '0.75rem' }}>-</Typography>
                              </Tooltip>
                            )}
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
