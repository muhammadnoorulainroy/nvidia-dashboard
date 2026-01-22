import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
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
import Tooltip from '@mui/material/Tooltip'
import { exportToExcel, formatPercent, formatDecimal, formatDate } from '../../utils/exportToExcel'
import { DataGrid, GridColDef, GridRowsProp, GridSortModel } from '@mui/x-data-grid'
import { getTrainerDailyStats, getTrainerOverallStats } from '../../services/api'
import type { TrainerDailyStats } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

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
}

export default function TrainerWise({ isClientDelivery = false }: TrainerWiseProps) {
  const [data, setData] = useState<TrainerDailyStats[]>([])
  const [overallData, setOverallData] = useState<TrainerDailyStats[]>([])
  const [filteredData, setFilteredData] = useState<AggregatedTrainerStats[]>([])
  // Note: taskLevelData removed as detail panel feature requires DataGrid Pro
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<TimeframeOption>('overall')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [textFilters, setTextFilters] = useState<Record<string, TextFilter>>({})
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [sortModel, setSortModel] = useState<GridSortModel>([])
  const [paginationModel, setPaginationModel] = useState({
    pageSize: 20,
    page: 0,
  })

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const filters: any = {}      
      const [dailyResult, overallResult] = await Promise.all([
        getTrainerDailyStats(filters),
        getTrainerOverallStats(filters),
      ])
      setData(dailyResult)
      setOverallData(overallResult)
      setFilteredData(dailyResult)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch trainer statistics')
    } finally{
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [isClientDelivery])

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
    setPaginationModel({ ...paginationModel, page: 0 })
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

  const handleSort = (field: string, direction: 'asc' | 'desc') => {
    setSortModel([{ field, sort: direction }])
    setFilterAnchorEl(null)
    setActiveFilterColumn('')
  }

  // Custom header renderer with dropdown arrow
  const renderHeaderWithDropdown = (headerName: string, _isNumeric: boolean = false, fieldKey: string = '') => (_params: any) => {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          gap: 0.5,
          py: 1,
        }}
      >
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            if (fieldKey) {
              setFilterAnchorEl(e.currentTarget)
              setActiveFilterColumn(fieldKey)
            } else {
              const button = e.currentTarget.closest('.MuiDataGrid-columnHeader')?.querySelector('.MuiDataGrid-menuIcon button') as HTMLButtonElement
              if (button) button.click()
            }
          }}
          sx={{
            padding: 0,
            minWidth: 'auto',
            color: '#6B7280',
            '&:hover': {
              color: '#374151',
              backgroundColor: 'transparent',
            },
          }}
        >
          <ArrowDropDownIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            overflow: 'visible',
          }}
        >
          {headerName}
        </Typography>
      </Box>
    )
  };

  // Calculate column width based on content - exact fit
  const calculateColumnWidth = (headerName: string, data: any[], fieldName: string) => {
    // Calculate header width (including dropdown arrow icon)
    const headerWidth = headerName.length * 9 + 50
    
    // Calculate max content width
    let maxContentWidth = headerWidth
    if (data.length > 0) {
      const contentLengths = data.map(row => {
        const value = row[fieldName]
        return String(value || '').length * 8.5 + 16
      })
      maxContentWidth = Math.max(headerWidth, ...contentLengths)
    }
    
    // Return exact width needed (no artificial max cap)
    return Math.max(maxContentWidth, 100)
  }

  // Build columns
  const columns: GridColDef[] = [
    {
      field: 'trainer_name',
      headerName: 'Trainer',
      width: calculateColumnWidth('Trainer', filteredData, 'trainer_name'),
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Trainer', false, 'trainer_name'),
      renderCell: (params) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {params.value || 'Unknown'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            ID: {params.row.trainer_id || 'N/A'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'trainer_email',
      headerName: 'Trainer Email',
      width: Math.max(calculateColumnWidth('Trainer Email', filteredData, 'trainer_email'), 200),
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Trainer Email', false, 'trainer_email'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ color: '#1F2937', textAlign: 'center', width: '100%', fontSize: '0.875rem' }}>
          {params.value || 'N/A'}
        </Typography>
      ),
    },
    // Only show Date column when not in Overall view
    ...(timeframe !== 'overall' ? [{
      field: 'submission_date',
      headerName: 'Date',
      width: 120,
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Date', false, 'submission_date'),
      renderCell: (params: any) => {
        if (!params.value) return <Typography variant="body2" sx={{ color: '#9CA3AF' }}>N/A</Typography>
        try {
          const date = new Date(params.value)
          return (
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#6366F1', textAlign: 'center', width: '100%' }}>
              {date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </Typography>
          )
        } catch {
          return <Typography variant="body2" sx={{ color: '#9CA3AF' }}>Invalid</Typography>
        }
      },
    }] : []),
    {
      field: 'unique_tasks',
      headerName: 'Unique Tasks',
      width: 110,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Unique Tasks', true, 'unique_tasks'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937', textAlign: 'center', width: '100%' }}>
          {params.value ?? 0}
        </Typography>
      ),
    },
    {
      field: 'new_tasks_submitted',
      headerName: 'New Tasks',
      width: calculateColumnWidth('New Tasks', filteredData, 'new_tasks_submitted'),
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('New Tasks', true, 'new_tasks_submitted'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: params.value ? '#10B981' : '#9CA3AF', textAlign: 'center', width: '100%' }}>
          {params.value !== null && params.value !== undefined ? params.value : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'rework_submitted',
      headerName: 'Rework Submitted',
      width: calculateColumnWidth('Rework Submitted', filteredData, 'rework_submitted'),
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Rework Submitted', true, 'rework_submitted'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: params.value ? '#F59E0B' : '#9CA3AF', textAlign: 'center', width: '100%' }}>
          {params.value !== null && params.value !== undefined ? params.value : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'tasks_ready_for_delivery',
      headerName: 'Ready for Delivery',
      width: 140,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Ready for Delivery', true, 'tasks_ready_for_delivery'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#059669', textAlign: 'center', width: '100%' }}>
          {params.value ?? 0}
        </Typography>
      ),
    },
    {
      field: 'avg_rework',
      headerName: 'Avg Rework',
      width: 110,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Avg Rework', true, 'avg_rework'),
      renderCell: (params) => {
        const value = params.value
        let color = '#9CA3AF'
        if (value !== null) {
          if (value >= 200) color = '#EF4444'  // Red for very high
          else if (value >= 100) color = '#F59E0B'  // Orange for high
          else color = '#10B981'  // Green for low
        }
        return (
          <Typography variant="body2" sx={{ fontWeight: 600, color, textAlign: 'center', width: '100%' }}>
            {value !== null ? `${Math.round(value)}%` : '-'}
        </Typography>
        )
      },
    },
    {
      field: 'rework_percent',
      headerName: 'Rework %',
      width: 100,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Rework %', true, 'rework_percent'),
      renderCell: (params) => {
        const value = params.value
        let color = '#9CA3AF'
        if (value !== null) {
          if (value >= 70) color = '#EF4444'  // Red for high rework
          else if (value >= 50) color = '#F59E0B'  // Orange for medium
          else color = '#10B981'  // Green for low
        }
        return (
          <Typography variant="body2" sx={{ fontWeight: 600, color, textAlign: 'center', width: '100%' }}>
            {value !== null ? `${Math.round(value)}%` : '-'}
          </Typography>
        )
      },
    },
    {
      field: 'avg_rating',
      headerName: 'Avg Rating',
      width: 100,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Avg Rating', true, 'avg_rating'),
      renderCell: (params) => {
        const value = params.value
        let color = '#9CA3AF'
        if (value !== null) {
          if (value >= 4.5) color = '#10B981'  // Green for high rating
          else if (value >= 3.5) color = '#F59E0B'  // Orange for medium
          else color = '#EF4444'  // Red for low
        }
        return (
          <Typography variant="body2" sx={{ fontWeight: 600, color, textAlign: 'center', width: '100%' }}>
            {value !== null ? value.toFixed(2) : '-'}
          </Typography>
        )
      },
    },
    {
      field: 'merged_exp_aht',
      headerName: 'Merged Exp. AHT',
      width: 130,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Merged Exp. AHT', true, 'merged_exp_aht'),
      renderCell: (params) => {
        const value = params.value
        return (
          <Typography variant="body2" sx={{ fontWeight: 600, color: value !== null ? '#1F2937' : '#9CA3AF', textAlign: 'center', width: '100%' }}>
            {value !== null ? value.toFixed(2) : '-'}
          </Typography>
        )
      },
    },
  ]

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
    const columns = [
      { key: 'trainer_name', header: 'Trainer Name', width: 25 },
      { key: 'trainer_email', header: 'Email', width: 30 },
      ...(showDate ? [{ key: 'submission_date', header: 'Date', width: 15, format: formatDate }] : []),
      { key: 'unique_tasks', header: 'Unique Tasks', width: 15 },
      { key: 'new_tasks_submitted', header: 'New Tasks Submitted', width: 20 },
      { key: 'rework_submitted', header: 'Rework Submitted', width: 18 },
      { key: 'tasks_ready_for_delivery', header: 'Ready for Delivery', width: 18 },
      { key: 'avg_rework', header: 'Avg Rework %', width: 15, format: formatPercent },
      { key: 'rework_percent', header: 'Rework %', width: 12, format: formatPercent },
      { key: 'avg_rating', header: 'Avg Rating', width: 12, format: (v: any) => formatDecimal(v, 2) },
      { key: 'merged_exp_aht', header: 'Merged Exp. AHT', width: 18, format: (v: any) => formatDecimal(v, 2) },
    ]
    
    // Add merged_exp_aht to the data
    const exportData = filteredData.map(t => ({
      ...t,
      merged_exp_aht: (() => {
        const newTasks = t.new_tasks_submitted || 0
        const rework = t.rework_submitted || 0
        const total = newTasks + rework
        return total > 0 ? (newTasks * 10 + rework * 4) / total : null
      })()
    }))
    
    const timestamp = new Date().toISOString().split('T')[0]
    exportToExcel(exportData, columns, `Trainer_Stats_${timeframe}_${timestamp}`, 'Trainers')
  }

  // Build rows - trainer x date level
  const rows: GridRowsProp = filteredData.map((trainer, index) => {
    const row: any = {
      id: index,
      trainer_name: trainer.trainer_name,
      trainer_id: trainer.trainer_id,
      trainer_email: trainer.trainer_email,
      submission_date: trainer.submission_date,
      unique_tasks: trainer.unique_tasks,
      new_tasks_submitted: trainer.new_tasks_submitted,
      rework_submitted: trainer.rework_submitted,
      total_submissions: trainer.total_submissions,
      tasks_ready_for_delivery: trainer.tasks_ready_for_delivery,
      avg_rework: trainer.avg_rework,
      rework_percent: trainer.rework_percent,
      avg_rating: trainer.avg_rating,
      merged_exp_aht: (() => {
        const newTasks = trainer.new_tasks_submitted || 0
        const rework = trainer.rework_submitted || 0
        const total = newTasks + rework
        return total > 0 ? (newTasks * 10 + rework * 4) / total : null
      })(),
    }
    
    return row
  })

  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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
            onChange={(_event, newValue) => setSelectedTrainers(newValue)}
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
                  setSortModel([])                }}
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

        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[10, 20, 50, 100]}
            disableRowSelectionOnClick
            disableColumnMenu={true}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            sx={{
              border: 'none',
              backgroundColor: 'white',
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid #E5E7EB',
                color: '#111827',
                fontSize: '0.875rem',
                paddingX: 1.5,
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
                minHeight: '48px !important',
                maxHeight: '48px !important',
              },
              '& .MuiDataGrid-columnHeader': {
                cursor: 'pointer',
                paddingX: 1.5,
                '&:hover': {
                  backgroundColor: '#F3F4F6',
                },
                '&:focus': {
                  outline: 'none',
                },
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 600,
                fontSize: '0.75rem',
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              },
              '& .MuiDataGrid-columnSeparator': {
                display: 'none',
              },
              '& .MuiDataGrid-menuIcon': {
                visibility: 'hidden',
                width: 0,
                opacity: 0,
              },
              '& .MuiDataGrid-iconButtonContainer': {
                visibility: 'hidden',
                width: 0,
              },
              '& .MuiDataGrid-row': {
                '&:hover': {
                  backgroundColor: '#F9FAFB',
                },
                '&:last-child .MuiDataGrid-cell': {
                  borderBottom: 'none',
                },
              },
              '& .MuiDataGrid-footerContainer': {
                borderTop: '1px solid #E5E7EB',
                backgroundColor: '#F9FAFB',
              },
              '& .MuiDataGrid-sortIcon': {
                display: 'none',
              },
            }}
          />
        </Box>
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
                  setSortModel([])
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
