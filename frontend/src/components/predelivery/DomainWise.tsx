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
import MuiTooltip from '@mui/material/Tooltip'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts'
import { getDomainStats, getClientDeliveryDomainStats } from '../../services/api'
import type { DomainAggregation } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

interface DomainWiseProps {
  isClientDelivery?: boolean
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

export default function DomainWise({ isClientDelivery = false }: DomainWiseProps) {
  const [data, setData] = useState<DomainAggregation[]>([])
  const [filteredData, setFilteredData] = useState<DomainAggregation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [textFilters, setTextFilters] = useState<Record<string, TextFilter>>({})
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(100)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = isClientDelivery 
        ? await getClientDeliveryDomainStats({})
        : await getDomainStats({})
      setData(result)
      setFilteredData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch domain statistics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [isClientDelivery])

  // Initialize numeric filters when data changes
  const initializeNumericFilters = (domains: DomainAggregation[]) => {
    const filters: Record<string, NumericFilter> = {}

    if (domains.length === 0) return filters

    // Initialize filter for task_score
    const taskScores = domains
      .map(d => d.average_task_score)
      .filter(val => val !== null && val !== undefined)
      .filter(val => typeof val === 'number' || (typeof val === 'string' && val !== 'N/A'))
      .map(val => typeof val === 'string' ? parseFloat(val) : val)
      .filter(val => !isNaN(val))
    if (taskScores.length > 0) {
      const minScore = Math.min(...taskScores)
      const maxScore = Math.max(...taskScores)
      filters['task_score'] = { min: minScore, max: maxScore, currentRange: [minScore, maxScore] }
    }

    // Initialize filter for task_count
    const taskCounts = domains.map(d => d.task_count).filter(val => val !== null && val !== undefined)
    if (taskCounts.length > 0) {
      const minTask = Math.min(...taskCounts)
      const maxTask = Math.max(...taskCounts)
      filters['task_count'] = { min: minTask, max: maxTask, currentRange: [minTask, maxTask] }
    }

    // Initialize filter for total_rework_count
    const totalReworkCounts = domains.map(d => d.total_rework_count || 0).filter(val => val !== null && val !== undefined)
    if (totalReworkCounts.length > 0) {
      const minRework = Math.min(...totalReworkCounts)
      const maxRework = Math.max(...totalReworkCounts)
      filters['total_rework_count'] = { min: minRework, max: maxRework, currentRange: [minRework, maxRework] }
    }

    // Initialize filter for average_rework_count
    const avgReworkCounts = domains.map(d => d.average_rework_count || 0).filter(val => val !== null && val !== undefined)
    if (avgReworkCounts.length > 0) {
      const minAvgRework = Math.min(...avgReworkCounts)
      const maxAvgRework = Math.max(...avgReworkCounts)
      filters['average_rework_count'] = { min: minAvgRework, max: maxAvgRework, currentRange: [minAvgRework, maxAvgRework] }
    }

    return filters
  }

  useEffect(() => {
    if (data.length > 0) {
      const initialFilters = initializeNumericFilters(data)
      setNumericFilters(initialFilters)
    }
  }, [data])

  // Apply all filters (search + text + numeric)
  useEffect(() => {
    let filtered = [...data]

    // Apply search filter (from Autocomplete)
    if (selectedDomains.length > 0) {
      filtered = filtered.filter(domain => selectedDomains.includes(domain.domain || ''))
    }

    // Apply text filters
    Object.entries(textFilters).forEach(([key, filter]) => {
      if (filter.value.trim()) {
        filtered = filtered.filter((domain) => {
          let fieldValue: string = ''

          if (key === 'domain') {
            fieldValue = domain.domain || ''
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
        filtered = filtered.filter((domain) => {
          let value: number | null = null

          if (key === 'task_score') {
            // Handle task_score - convert from string if needed
            const taskScore = domain.average_task_score
            if (taskScore !== null && taskScore !== undefined) {
              if (typeof taskScore === 'number') {
                value = taskScore
              } else if (typeof taskScore === 'string' && taskScore !== 'N/A') {
                value = parseFloat(taskScore)
              }
            }
          } else if (key === 'task_count') {
            value = domain.task_count
          }

          if (value === null || value === undefined || isNaN(value)) return false
          return value >= filter.currentRange[0] && value <= filter.currentRange[1]
        })
      }
    })

    setFilteredData(filtered)
    setPage(0)
  }, [selectedDomains, textFilters, numericFilters, data])

  // Get unique domain names for autocomplete
  const domainOptions = Array.from(new Set(data.map(d => d.domain).filter(Boolean))) as string[]

  if (loading) {
    return <LoadingSpinner message="Loading domain statistics..." />
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
    setSortColumn(field)
    setSortDirection(direction)
    setFilterAnchorEl(null)
    setActiveFilterColumn('')
  }

  // Render column header with dropdown and tooltip (matching PodLeadTab style)
  const renderHeaderWithFilter = (label: string, columnKey: string) => (
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
      <MuiTooltip 
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
      </MuiTooltip>
    </Box>
  )

  // Sort the filtered data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    
    let aVal: any
    let bVal: any
    
    if (sortColumn === 'domain') {
      aVal = a.domain || ''
      bVal = b.domain || ''
    } else if (sortColumn === 'task_score') {
      aVal = a.average_task_score ?? -Infinity
      bVal = b.average_task_score ?? -Infinity
    } else if (sortColumn === 'task_count') {
      aVal = a.task_count ?? 0
      bVal = b.task_count ?? 0
    } else if (sortColumn === 'total_rework_count') {
      aVal = a.total_rework_count ?? 0
      bVal = b.total_rework_count ?? 0
    } else if (sortColumn === 'average_rework_count') {
      aVal = a.average_rework_count ?? 0
      bVal = b.average_rework_count ?? 0
    } else {
      return 0
    }
    
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

  // Prepare data for task distribution charts
  const prepareTaskDistributionData = () => {
    if (data.length === 0) return []

    // Sort domains by task count for better visualization
    return [...data]
      .sort((a, b) => b.task_count - a.task_count)
      .map((domain) => ({
        name: domain.domain || 'Unknown',
        taskCount: domain.task_count,
        percentage: 0, // Will calculate after we have all data
      }))
  }

  const taskDistributionData = prepareTaskDistributionData()
  
  // Calculate percentages
  const totalTasks = taskDistributionData.reduce((sum, d) => sum + d.taskCount, 0)
  taskDistributionData.forEach(d => {
    d.percentage = totalTasks > 0 ? (d.taskCount / totalTasks) * 100 : 0
  })

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

  // Color palette for domains
  const domainColors = [
    '#4F7DF3', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#8B5CF6', // Purple
    '#EF4444', // Red
    '#0EA5E9', // Sky
    '#EC4899', // Pink
    '#14B8A6', // Teal
  ]

  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1 }}>
            <Autocomplete
            multiple
            options={domainOptions}
            value={selectedDomains}
            onChange={(_event, newValue) => setSelectedDomains(newValue)}
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
                placeholder="Search and select domains..."
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
              const columnName = key === 'domain' ? 'Domain' : key
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
              if (key === 'task_count') {
                columnName = 'Total Tasks'
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
            
            {/* Clear All Button */}
            {hasActiveFilters() && (
              <Chip
                icon={<FilterListIcon />}
                label="Clear All"
                size="small"
                  onDelete={() => {
                  const resetFilters = initializeNumericFilters(data)
                  setSelectedDomains([])
                  setTextFilters({})
                  setNumericFilters(resetFilters)
                  setSortColumn('')
                  setSortDirection('asc')
                }}
                onClick={() => {
                  const resetFilters = initializeNumericFilters(data)
                  setSelectedDomains([])
                  setTextFilters({})
                  setNumericFilters(resetFilters)
                  setSortColumn('')
                  setSortDirection('asc')
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

        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 800 }}>
            <TableHead>
              <TableRow>
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
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Domain', 'domain')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Task Score', 'task_score')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Total Tasks', 'task_count')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Total Reworks', 'total_rework_count')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Avg Rework', 'average_rework_count')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((domain, idx) => (
                <TableRow key={idx} sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                  <TableCell sx={{ 
                    position: 'sticky', 
                    left: 0, 
                    bgcolor: 'white', 
                    borderRight: '2px solid #E2E8F0',
                    zIndex: 1,
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                      {domain.domain || 'Unknown'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                      {domain.average_task_score !== null && domain.average_task_score !== undefined 
                        ? domain.average_task_score.toFixed(2) 
                        : 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                      {domain.task_count}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                      {domain.total_rework_count || 0}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                      {domain.average_rework_count !== null && domain.average_rework_count !== undefined 
                        ? domain.average_rework_count.toFixed(2) 
                        : '0.00'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
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


      {/* Task Distribution Section */}
      {taskDistributionData.length > 0 && (
        <Paper 
          sx={{ 
            width: '100%', 
            mt: 4, 
            p: 3,
            borderRadius: 3,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: 700,
                color: '#1A1F36',
                mb: 0.5,
              }}
            >
              Task Distribution Across Domains
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#6B7280',
                fontSize: '0.875rem',
              }}
            >
              Visual breakdown of how tasks are distributed among different domains
            </Typography>
          </Box>

          {/* Bar Chart */}
          <ResponsiveContainer width="100%" height={450}>
            <BarChart
              data={taskDistributionData}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ 
                  fill: '#475569', 
                  fontSize: 12,
                  fontWeight: 500,
                }}
              />
              <YAxis
                label={{ 
                  value: 'Number of Tasks', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { 
                    fill: '#475569',
                    fontWeight: 600,
                    fontSize: 13,
                  }
                }}
                tick={{ fill: '#94A3B8', fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <Box sx={{ 
                        backgroundColor: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        padding: '12px',
                      }}>
                        <Typography sx={{ fontWeight: 600, color: '#1A1F36', mb: 1 }}>
                          {data.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.875rem', color: '#475569' }}>
                          Tasks: {data.taskCount}
                        </Typography>
                        <Typography sx={{ fontSize: '0.875rem', color: '#475569' }}>
                          Percentage: {data.percentage.toFixed(1)}%
                        </Typography>
                      </Box>
                    )
                  }
                  return null
                }}
              />
              <Bar dataKey="taskCount" radius={[8, 8, 0, 0]}>
                {taskDistributionData.map((_entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={domainColors[index % domainColors.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

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

            {/* Text Filter - Show for domain column */}
            {activeFilterColumn === 'domain' && (
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
                    step={activeFilterColumn === 'task_count' ? 1 : 0.01}
                    valueLabelFormat={(value) => 
                      activeFilterColumn === 'task_count' ? value.toString() : value.toFixed(2)
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
                      Min: {activeFilterColumn === 'task_count' 
                        ? numericFilters[activeFilterColumn].min 
                        : numericFilters[activeFilterColumn].min.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                      Max: {activeFilterColumn === 'task_count' 
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

