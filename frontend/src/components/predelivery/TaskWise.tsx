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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { getTaskLevelInfo } from '../../services/api'
import type { TaskLevelInfo } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

interface SearchOption {
  label: string
  value: string
  type: 'Task ID' | 'Annotator' | 'Reviewer'
}

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

interface TaskWiseProps {
  onSummaryUpdate?: (stats: TabSummaryStats) => void
  onSummaryLoading?: () => void
}

export default function TaskWise({ onSummaryUpdate, onSummaryLoading }: TaskWiseProps) {
  const [data, setData] = useState<TaskLevelInfo[]>([])
  const [filteredData, setFilteredData] = useState<TaskLevelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<SearchOption[]>([])
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
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
    if (data.length > 0 && onSummaryUpdate) {
      const uniqueTrainers = new Set(data.map(t => t.annotator_email).filter(Boolean))
      const uniqueReviewers = new Set(data.map(t => t.reviewer_email).filter(Boolean))
      
      onSummaryUpdate({
        totalTasks: data.length,
        totalTrainers: uniqueTrainers.size,
        totalPodLeads: 0,
        totalProjects: 4,
        totalReviews: uniqueReviewers.size,
        newTasks: data.filter(t => (t.rework_count || 0) === 0).length,
        rework: data.filter(t => (t.rework_count || 0) > 0).length
      })
    }
  }, [data, onSummaryUpdate])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      onSummaryLoading?.()
      
      console.log('TaskWise: fetchData called - loading all data')
      
      // Always fetch ALL data without backend date filters
      // Date filtering will be done on the frontend like other column filters
      const result = await getTaskLevelInfo({})
      console.log('TaskWise: Fetched all data count:', result?.length || 0)
      setData(result)
      
      // Initialize filters based on all data
      const freshFilters = initializeNumericFilters(result)
      console.log('TaskWise: Fresh filters initialized:', Object.keys(freshFilters || {}).length)
      
      setNumericFilters(freshFilters)
      setTextFilters({})
      setSelectedOptions([])
      setSortColumn('')
      setSortDirection('asc')
      
      console.log('TaskWise: Filters initialized')
    } catch (err: any) {
      console.error('TaskWise: Error fetching data:', err)
      setError(err.message || 'Failed to fetch task-level information')
    } finally {
      setLoading(false)
    }
  }

  // Initialize numeric filters based on data
  const initializeNumericFilters = (tasks: TaskLevelInfo[]) => {
    const filters: Record<string, NumericFilter> = {}
    
    // Task Score filter
    const taskScores = tasks
      .map(t => t.task_score)
      .filter((s): s is number => s !== null && s !== undefined && !isNaN(s))
    
    if (taskScores.length > 0) {
      const min = Math.min(...taskScores)
      const max = Math.max(...taskScores)
      filters['task_score'] = { min, max, currentRange: [min, max] }
    }
    
    // Week Number filter
    const weekNumbers = tasks
      .map(t => t.week_number)
      .filter((w): w is number => w !== null && w !== undefined)
    
    if (weekNumbers.length > 0) {
      const min = Math.min(...weekNumbers)
      const max = Math.max(...weekNumbers)
      filters['week_number'] = { min, max, currentRange: [min, max] }
    }
    
    // Rework Count filter
    const reworkCounts = tasks
      .map(t => t.rework_count || 0)
      .filter((r): r is number => r !== null && r !== undefined)
    
    if (reworkCounts.length > 0) {
      const min = Math.min(...reworkCounts)
      const max = Math.max(...reworkCounts)
      filters['rework_count'] = { min, max, currentRange: [min, max] }
    }
    
    // Duration Minutes (AHT) filter
    const durations = tasks
      .map(t => t.duration_minutes)
      .filter((d): d is number => d !== null && d !== undefined && !isNaN(d))
    
    if (durations.length > 0) {
      const min = Math.min(...durations)
      const max = Math.max(...durations)
      filters['duration_minutes'] = { min, max, currentRange: [min, max] }
    }
    
    return filters  // RETURN the filters object
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Apply all filters (search + numeric + text + date)
  useEffect(() => {
    console.log('TaskWise: useEffect running - applying filters')
    console.log('TaskWise: data.length:', data.length)
    console.log('TaskWise: selectedOptions:', selectedOptions)
    console.log('TaskWise: textFilters:', textFilters ? Object.keys(textFilters).length : 0)
    console.log('TaskWise: numericFilters:', numericFilters ? Object.keys(numericFilters).length : 0)
    console.log('TaskWise: dateFrom:', dateFrom, 'dateTo:', dateTo)
    
    let filtered = [...data]
    
    // Apply date range filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter((task) => {
        if (!task.updated_at) return false
        
        const taskDate = new Date(task.updated_at)
        const fromDate = dateFrom ? new Date(dateFrom) : null
        const toDate = dateTo ? new Date(dateTo) : null
        
        if (fromDate && taskDate < fromDate) return false
        if (toDate) {
          // Set to end of day for toDate
          const endOfDay = new Date(toDate)
          endOfDay.setHours(23, 59, 59, 999)
          if (taskDate > endOfDay) return false
        }
        
        return true
      })
      console.log('After date filter:', filtered.length)
    }
    
    // Apply search filters
    if (selectedOptions.length > 0) {
      console.log('Selected options:', selectedOptions)
      
      filtered = filtered.filter((task) => {
        const matches = selectedOptions.some((option) => {
          let isMatch = false
          
          if (option.type === 'Task ID') {
            isMatch = task.task_id?.toString() === option.value
          } else if (option.type === 'Annotator') {
            isMatch = task.annotator_name === option.value
          } else if (option.type === 'Reviewer') {
            isMatch = task.reviewer_name === option.value
          }
          
          console.log(`Checking task ${task.task_id}: ${option.type} = ${option.value}, match = ${isMatch}`)
          return isMatch
        })
        
        return matches
      })
    }
    
    // Apply text filters (with safety check)
    if (textFilters) {
      Object.entries(textFilters).forEach(([key, filter]) => {
        if (filter.value.trim()) {
          filtered = filtered.filter((task) => {
            let fieldValue: string = ''
            
            if (key === 'task_id') {
              fieldValue = task.task_id?.toString() || ''
            } else if (key === 'annotator_name') {
              fieldValue = task.annotator_name || ''
            } else if (key === 'annotator_email') {
              fieldValue = task.annotator_email || ''
            } else if (key === 'reviewer_name') {
              fieldValue = task.reviewer_name || ''
            } else if (key === 'reviewer_email') {
              fieldValue = task.reviewer_email || ''
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
    }
    
    // Apply numeric range filters - only if range has been modified (with safety check)
    if (numericFilters) {
      Object.entries(numericFilters).forEach(([key, filter]) => {
        // Check if the filter has been modified (not at default min/max)
        const isFilterActive = filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
        
        if (isFilterActive) {
          filtered = filtered.filter((task) => {
            let value: number | null | undefined
            
            if (key === 'task_score') {
              value = task.task_score
            } else if (key === 'week_number') {
              value = task.week_number
            } else if (key === 'duration_minutes') {
              value = task.duration_minutes
            } else if (key === 'rework_count') {
              value = task.rework_count
            }
            
            // If value is null/undefined, exclude from filtered results when filter is active
            if (value === null || value === undefined) return false
            return value >= filter.currentRange[0] && value <= filter.currentRange[1]
          })
        }
      })
    }
    
    console.log('Filtered count:', filtered.length)
    setFilteredData(filtered)
    setPage(0)
  }, [selectedOptions, textFilters, numericFilters, dateFrom, dateTo, data])

  // Build search options from data
  const searchOptions: SearchOption[] = []
  
  if (data && Array.isArray(data)) {
    // Debug: Log first task to see data structure
    if (data.length > 0) {
      console.log('TaskWise: First task data:', {
        task_id: data[0].task_id,
        annotator_name: data[0].annotator_name,
        annotator_email: data[0].annotator_email,
        reviewer_name: data[0].reviewer_name,
        reviewer_email: data[0].reviewer_email,
      })
    }
    
    data.forEach((task) => {
      // Add Task ID
      if (task.task_id) {
        searchOptions.push({
          label: `Task ID: ${task.task_id}`,
          value: task.task_id.toString(),
          type: 'Task ID',
        })
      }
      // Add Annotator (with email if available)
      if (task.annotator_name) {
        const existing = searchOptions.find(
          (opt) => opt.type === 'Annotator' && opt.value === task.annotator_name
        )
        if (!existing) {
          const email = task.annotator_email ? ` (${task.annotator_email})` : ''
          const label = `Annotator: ${task.annotator_name}${email}`
          console.log('TaskWise: Adding annotator option:', label)
          searchOptions.push({
            label: label,
            value: task.annotator_name,
            type: 'Annotator',
          })
        }
      }
      // Add Reviewer (with email if available)
      if (task.reviewer_name) {
        const existing = searchOptions.find(
          (opt) => opt.type === 'Reviewer' && opt.value === task.reviewer_name
        )
        if (!existing) {
          const email = task.reviewer_email ? ` (${task.reviewer_email})` : ''
          const label = `Reviewer: ${task.reviewer_name}${email}`
          console.log('TaskWise: Adding reviewer option:', label)
          searchOptions.push({
            label: label,
            value: task.reviewer_name,
            type: 'Reviewer',
          })
        }
      }
    })
  }
  
  console.log(`TaskWise: Total search options: ${searchOptions.length}`)

  if (loading) {
    return <LoadingSpinner message="Loading task details..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchData} />
  }

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
  
  // Handle slider change
  const handleSliderChange = (fieldKey: string, newValue: number | number[]) => {
    const range = newValue as [number, number]
    setNumericFilters(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        currentRange: range
      }
    }))
  }
  
  // Reset numeric filter
  const resetNumericFilter = (fieldKey: string) => {
    setNumericFilters(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        currentRange: [prev[fieldKey].min, prev[fieldKey].max]
      }
    }))
  }


  // Check if any filters are active
  const hasActiveFilters = () => {
    // Check text filters (with safety check)
    const hasTextFilters = textFilters && Object.values(textFilters).some(filter => filter.value.trim() !== '')
    
    // Check numeric filters (with safety check)
    const hasNumericFilters = numericFilters && Object.values(numericFilters).some(filter =>
      filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
    )
    
    // Check date filters
    const hasDateFilters = dateFrom !== '' || dateTo !== ''
    
    return hasTextFilters || hasNumericFilters || hasDateFilters
  }


  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            {/* Search Bar */}
            <Box sx={{ flex: 1 }}>
              <Autocomplete
                key={`autocomplete-${searchOptions.length}`}
                multiple
                options={searchOptions}
                value={selectedOptions}
                onChange={(_event, newValue) => {
                  console.log('Autocomplete onChange:', newValue)
                  setSelectedOptions(newValue)
                }}
                getOptionLabel={(option) => {
                  return option.label
                }}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props
                  return (
                    <li 
                      {...otherProps} 
                      key={key || `${option.type}-${option.value}`}
                      style={{ 
                        padding: 0,
                        display: 'block',
                        width: '100%',
                        overflow: 'visible'
                      }}
                    >
                      <Typography
                        sx={{
                          padding: '8px 12px',
                          whiteSpace: 'normal',
                          wordWrap: 'break-word',
                          overflow: 'visible',
                          textOverflow: 'clip',
                          display: 'block',
                          width: '100%',
                          fontSize: '12px'
                        }}
                      >
                        {option.label}
            </Typography>
                    </li>
                  )
                }}
                isOptionEqualToValue={(option, value) => 
                  option.value === value.value && option.type === value.type
                }
                filterOptions={(options, { inputValue }) => {
                  const searchTerm = inputValue.toLowerCase()
                  const filtered = options.filter(option => 
                    option.label.toLowerCase().includes(searchTerm)
                  )
                  console.log(`TaskWise Search: "${inputValue}" -> ${filtered.length} results`)
                  return filtered
                }}
                sx={{
                  '& .MuiAutocomplete-popper': {
                    width: '600px !important',
                  },
                  '& .MuiAutocomplete-paper': {
                    width: '600px !important',
                  },
                  '& .MuiAutocomplete-listbox': {
                    maxHeight: '400px',
                    '& .MuiAutocomplete-option': {
                      whiteSpace: 'normal !important',
                      wordWrap: 'break-word !important',
                      overflow: 'visible !important',
                      display: 'block !important',
                      textOverflow: 'clip !important',
                      padding: '0 !important',
                      minHeight: '40px',
                    }
                  },
                  '& .MuiAutocomplete-tag': {
                    margin: '2px',
                  },
                }}
                renderInput={(params) => (
          <TextField
                    {...params}
            variant="outlined"
            placeholder="Search by Task ID, Name, or Email..."
            size="small"
            sx={{ backgroundColor: 'white' }}
          />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.label}
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
              />
            </Box>
            
            {/* Individual Filter Chips */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {/* Text Filters */}
              {textFilters && Object.entries(textFilters).map(([key, filter]) => {
                if (!filter.value.trim()) return null
                const columnName = key === 'task_id' ? 'Task ID' : 
                                 key === 'annotator_name' ? 'Annotator' : 
                                 key === 'annotator_email' ? 'Annotator Email' :
                                 key === 'reviewer_name' ? 'Reviewer' :
                                 key === 'reviewer_email' ? 'Reviewer Email' : key
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
                if (key === 'week_number') {
                  columnName = 'Week Number'
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
              
              {/* Date Filter Chip */}
              {(dateFrom || dateTo) && (
                <Chip
                  key="date-filter"
                  label={`Date: ${dateFrom || 'any'} to ${dateTo || 'any'}`}
                  size="small"
                  onDelete={() => {
                    setDateFrom('')
                    setDateTo('')
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
              )}
              
              {/* Clear All Button (only show if any filters active) */}
              {hasActiveFilters() && (
                <Chip
                  icon={<FilterListIcon />}
                  label="Clear All"
                  size="small"
                  onDelete={() => {
                    console.log('TaskWise: Clearing all filters')
                    const resetFilters = initializeNumericFilters(data)
                    setSelectedOptions([])
                    setTextFilters({})
                    setNumericFilters(resetFilters)
                    setSortColumn('')
                    setSortDirection('asc')
                    setDateFrom('')
                    setDateTo('')
                  }}
                  onClick={() => {
                    console.log('TaskWise: Clearing all filters')
                    const resetFilters = initializeNumericFilters(data)
                    setSelectedOptions([])
                    setTextFilters({})
                    setNumericFilters(resetFilters)
                    setSortColumn('')
                    setSortDirection('asc')
                    setDateFrom('')
                    setDateTo('')
                  }}
                  sx={{
                    backgroundColor: '#DC2626',
                    color: 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '& .MuiChip-icon': {
                      color: 'white',
                    },
                    '& .MuiChip-deleteIcon': {
                      color: 'white',
                      '&:hover': {
                        color: '#FEE2E2',
                      },
                    },
                    '&:hover': {
                      backgroundColor: '#B91C1C',
                    },
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>

        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1600 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  fontWeight: 600, 
                  bgcolor: '#F8FAFC', 
                  color: '#334155', 
                  minWidth: 120, 
                  borderBottom: '2px solid #E2E8F0', 
                  fontSize: '0.8125rem', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.025em',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Task ID', 'task_id', false)}
                </TableCell>
                <TableCell sx={{ 
                  fontWeight: 600, 
                  bgcolor: '#F8FAFC', 
                  color: '#334155', 
                  minWidth: 150, 
                  borderBottom: '2px solid #E2E8F0', 
                  fontSize: '0.8125rem', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.025em',
                  position: 'sticky',
                  left: 120,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Annotator', 'annotator_name', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 180, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Annotator Email', 'annotator_email', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 150, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Reviewer', 'reviewer_name', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 180, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Reviewer Email', 'reviewer_email', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Task Score', 'task_score', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Rework Count', 'rework_count', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('AHT (mins)', 'duration_minutes', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Week Number', 'week_number', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 120, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Updated Date', 'updated_at', false)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((task, idx) => {
                const taskId = task.task_id
                const labelingToolUrl = taskId ? `https://labeling-n.turing.com/conversations/${taskId}/view` : null
                
                return (
                  <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                    <TableCell sx={{ 
                      position: 'sticky', 
                      left: 0, 
                      bgcolor: 'white', 
                      borderRight: '2px solid #E2E8F0',
                      zIndex: 1,
                    }}>
                      {labelingToolUrl ? (
                        <a href={labelingToolUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                          <Chip
                            label={taskId}
                            size="small"
                            variant="outlined"
                            clickable
                            sx={{
                              borderColor: '#76B900',
                              color: '#76B900',
                              fontWeight: 600,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: '#76B90010',
                                borderColor: '#5A8F00',
                              },
                            }}
                          />
                        </a>
                      ) : (
                        <Chip label="N/A" size="small" variant="outlined" sx={{ borderColor: '#E5E7EB', color: '#1F2937' }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ 
                      position: 'sticky', 
                      left: 120, 
                      bgcolor: 'white', 
                      borderRight: '2px solid #E2E8F0',
                      zIndex: 1,
                    }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#1F2937' }}>
                          {task.annotator_name || 'Unknown'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          ID: {task.annotator_id || 'N/A'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#1F2937', fontSize: '0.875rem' }}>
                        {task.annotator_email || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#1F2937' }}>
                          {task.reviewer_name || 'N/A'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          ID: {task.reviewer_id || 'N/A'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#1F2937', fontSize: '0.875rem' }}>
                        {task.reviewer_email || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {task.task_score !== null && task.task_score !== undefined ? task.task_score : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {task.rework_count || 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: task.duration_minutes !== null ? '#1F2937' : '#9CA3AF' }}>
                        {task.duration_minutes !== null && task.duration_minutes !== undefined ? `${task.duration_minutes}m` : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                        {task.week_number !== null && task.week_number !== undefined ? task.week_number : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>
                        {task.updated_at ? new Date(task.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                      </Typography>
                    </TableCell>
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

      {/* Filter Popover - Unified for both numeric and non-numeric columns */}
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
      >
        {activeFilterColumn && (
          <Box sx={{ minWidth: 320 }}>
            {/* Sort Options - Show for all columns */}
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: '#1F2937', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SortIcon fontSize="small" />
                Sort
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <MenuItem
                  onClick={() => {
                    setSortColumn(activeFilterColumn)
                    setSortDirection('asc')
                  }}
                  sx={{
                    borderRadius: 1,
                    py: 1,
                    '&:hover': {
                      backgroundColor: '#F9FAFB',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <ArrowUpwardIcon fontSize="small" sx={{ color: '#6B7280' }} />
                  </ListItemIcon>
                  <ListItemText primary="Sort Ascending" primaryTypographyProps={{ fontSize: '0.875rem' }} />
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setSortColumn(activeFilterColumn)
                    setSortDirection('desc')
                  }}
                  sx={{
                    borderRadius: 1,
                    py: 1,
                    '&:hover': {
                      backgroundColor: '#F9FAFB',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <ArrowDownwardIcon fontSize="small" sx={{ color: '#6B7280' }} />
                  </ListItemIcon>
                  <ListItemText primary="Sort Descending" primaryTypographyProps={{ fontSize: '0.875rem' }} />
                </MenuItem>
              </Box>
            </Box>

            {/* Text Filter - Show for text columns (task_id, annotator_name, annotator_email, reviewer_name, reviewer_email) */}
            {(activeFilterColumn === 'task_id' || 
              activeFilterColumn === 'annotator_name' || 
              activeFilterColumn === 'annotator_email' || 
              activeFilterColumn === 'reviewer_name' || 
              activeFilterColumn === 'reviewer_email') && (
              <>
                <Divider />
                <Box sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: '#1F2937', display: 'flex', alignItems: 'center', gap: 0.5 }}>
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

            {/* Date Range Filter - Show for updated_at column */}
            {activeFilterColumn === 'updated_at' && (
              <>
                <Divider />
                <Box sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: '#1F2937', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FilterListIcon fontSize="small" />
                    Date Range
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="From Date"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      InputLabelProps={{
                        shrink: true,
                      }}
                    />
                    
                    <TextField
                      fullWidth
                      size="small"
                      label="To Date"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      InputLabelProps={{
                        shrink: true,
                      }}
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
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#1F2937' }}>
                    Filter Range
                  </Typography>
                  
                  <Box sx={{ px: 1 }}>
                    <Slider
                      value={numericFilters[activeFilterColumn].currentRange}
                      onChange={(_, newValue) => handleSliderChange(activeFilterColumn, newValue)}
                      valueLabelDisplay="on"
                      min={numericFilters[activeFilterColumn].min}
                      max={numericFilters[activeFilterColumn].max}
                      step={activeFilterColumn === 'week_number' ? 1 : 0.01}
                      marks={[
                        { 
                          value: numericFilters[activeFilterColumn].min, 
                          label: activeFilterColumn === 'week_number' 
                            ? numericFilters[activeFilterColumn].min.toString() 
                            : numericFilters[activeFilterColumn].min.toFixed(2) 
                        },
                        { 
                          value: numericFilters[activeFilterColumn].max, 
                          label: activeFilterColumn === 'week_number' 
                            ? numericFilters[activeFilterColumn].max.toString() 
                            : numericFilters[activeFilterColumn].max.toFixed(2) 
                        },
                      ]}
                      valueLabelFormat={(value) => 
                        activeFilterColumn === 'week_number' ? value.toString() : value.toFixed(2)
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
                  </Box>

                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
                    <Typography variant="caption" color="text.secondary">
                      Current Range: {
                        activeFilterColumn === 'week_number' 
                          ? `${numericFilters[activeFilterColumn].currentRange[0]} - ${numericFilters[activeFilterColumn].currentRange[1]}`
                          : `${numericFilters[activeFilterColumn].currentRange[0].toFixed(2)} - ${numericFilters[activeFilterColumn].currentRange[1].toFixed(2)}`
                      }
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
                  borderColor: '#E5E7EB',
                  color: '#374151',
                  fontWeight: 600,
                  textTransform: 'none',
                  flex: 1,
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
                  color: 'white',
                  fontWeight: 600,
                  textTransform: 'none',
                  flex: 1,
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
