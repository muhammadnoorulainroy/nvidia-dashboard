import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Chip,
  Collapse,
  IconButton,
  TextField,
  Button,
  Popover,
  Divider,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Slider,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import DescriptionIcon from '@mui/icons-material/Description'
import AssignmentIcon from '@mui/icons-material/Assignment'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import SortIcon from '@mui/icons-material/Sort'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import FilterListIcon from '@mui/icons-material/FilterList'
import { DataGrid, GridColDef, GridSortModel } from '@mui/x-data-grid'
import { getDeliveryTracker, DeliveryTrackerItem } from '../../services/api'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

interface NumericFilter {
  min: number
  max: number
  currentRange: [number, number]
}

interface DateFilter {
  startDate: string
  endDate: string
}

export default function DeliveryTracker() {
  const [data, setData] = useState<DeliveryTrackerItem[]>([])
  const [filteredData, setFilteredData] = useState<DeliveryTrackerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [dateFilter, setDateFilter] = useState<DateFilter>({ startDate: '', endDate: '' })
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
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
      const result = await getDeliveryTracker()
      setData(result)
      setFilteredData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch delivery tracker')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    
    // Listen for S3 sync events to refresh data
    const handleS3Synced = () => {
      console.log('🔄 S3 synced, refreshing delivery tracker...')
      fetchData()
    }
    
    window.addEventListener('s3Synced', handleS3Synced)
    
    return () => {
      window.removeEventListener('s3Synced', handleS3Synced)
    }
  }, [])

  // Initialize numeric filters when data changes
  const initializeNumericFilters = (deliveries: DeliveryTrackerItem[]) => {
    const filters: Record<string, NumericFilter> = {}

    if (deliveries.length === 0) return filters

    // Initialize filter for total_tasks
    const taskCounts = deliveries.map(d => d.total_tasks).filter(val => val !== null && val !== undefined)
    if (taskCounts.length > 0) {
      const minTask = Math.min(...taskCounts)
      const maxTask = Math.max(...taskCounts)
      filters['total_tasks'] = { min: minTask, max: maxTask, currentRange: [minTask, maxTask] }
    }

    // Initialize filter for file_count
    const fileCounts = deliveries.map(d => d.file_count).filter(val => val !== null && val !== undefined)
    if (fileCounts.length > 0) {
      const minFile = Math.min(...fileCounts)
      const maxFile = Math.max(...fileCounts)
      filters['file_count'] = { min: minFile, max: maxFile, currentRange: [minFile, maxFile] }
    }

    return filters
  }

  useEffect(() => {
    if (data.length > 0) {
      const initialFilters = initializeNumericFilters(data)
      setNumericFilters(initialFilters)
    }
  }, [data])

  // Apply all filters
  useEffect(() => {
    let filtered = [...data]

    // Apply date range filter
    if (dateFilter.startDate || dateFilter.endDate) {
      filtered = filtered.filter(item => {
        const itemDate = item.delivery_date
        if (!itemDate) return false

        if (dateFilter.startDate && itemDate < dateFilter.startDate) return false
        if (dateFilter.endDate && itemDate > dateFilter.endDate) return false
        return true
      })
    }

    // Apply numeric range filters
    Object.entries(numericFilters).forEach(([key, filter]) => {
      const isFilterActive = filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max

      if (isFilterActive) {
        filtered = filtered.filter((item) => {
          let value: number | null = null

          if (key === 'total_tasks') {
            value = item.total_tasks
          } else if (key === 'file_count') {
            value = item.file_count
          }

          if (value === null || value === undefined) return false
          return value >= filter.currentRange[0] && value <= filter.currentRange[1]
        })
      }
    })

    setFilteredData(filtered)
    setPaginationModel({ ...paginationModel, page: 0 })
  }, [dateFilter, numericFilters, data])

  if (loading) {
    return <LoadingSpinner message="Loading delivery tracker..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchData} />
  }

  const toggleRowExpansion = (rowId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowId)) {
        newSet.delete(rowId)
      } else {
        newSet.add(rowId)
      }
      return newSet
    })
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
  const renderHeaderWithDropdown = (headerName: string, _isNumeric: boolean = false, fieldKey: string = '') => () => {
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
  }

  // Check if any filters are active
  const hasActiveFilters = () => {
    const hasDateFilter = dateFilter.startDate !== '' || dateFilter.endDate !== ''
    const hasNumericFilters = numericFilters && Object.values(numericFilters).some(filter =>
      filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
    )
    return hasDateFilter || hasNumericFilters
  }

  const columns: GridColDef[] = [
    {
      field: 'expand',
      headerName: '',
      width: 60,
      align: 'center' as const,
      headerAlign: 'center' as const,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() => toggleRowExpansion(params.row.id)}
          sx={{
            color: '#2E5CFF',
            '&:hover': {
              backgroundColor: '#EEF2FF',
            },
          }}
        >
          {expandedRows.has(params.row.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      ),
    },
    {
      field: 'delivery_date',
      headerName: 'Delivery Date',
      width: 200,
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Delivery Date', false, 'delivery_date'),
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalendarTodayIcon sx={{ fontSize: 18, color: '#2E5CFF' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {params.value}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'total_tasks',
      headerName: 'Total Tasks',
      width: 150,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('Total Tasks', true, 'total_tasks'),
      renderCell: (params) => (
        <Chip
          icon={<AssignmentIcon />}
          label={params.value}
          size="small"
          sx={{
            backgroundColor: '#EEF2FF',
            color: '#2E5CFF',
            fontWeight: 600,
            '& .MuiChip-icon': {
              color: '#2E5CFF',
            },
          }}
        />
      ),
    },
    {
      field: 'file_count',
      headerName: 'File Count',
      width: 150,
      type: 'number',
      align: 'center' as const,
      headerAlign: 'left' as const,
      renderHeader: renderHeaderWithDropdown('File Count', true, 'file_count'),
      renderCell: (params) => (
        <Chip
          icon={<DescriptionIcon />}
          label={params.value}
          size="small"
          sx={{
            backgroundColor: '#F0FDF4',
            color: '#10B981',
            fontWeight: 600,
            '& .MuiChip-icon': {
              color: '#10B981',
            },
          }}
        />
      ),
    },
    {
      field: 'file_names_preview',
      headerName: 'Files',
      flex: 1,
      minWidth: 400,
      align: 'left' as const,
      headerAlign: 'left' as const,
      sortable: false,
      renderCell: (params) => {
        const fileNames = params.row.file_names || []
        const displayCount = 1
        const remaining = fileNames.length - displayCount

        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
            {fileNames.slice(0, displayCount).map((fileName: string, idx: number) => (
              <Typography
                key={idx}
                variant="body2"
                sx={{
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  fontSize: '0.75rem',
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={fileName}
              >
                {fileName}
              </Typography>
            ))}
            {remaining > 0 && (
              <Chip
                label={`+${remaining} more (click to expand)`}
                size="small"
                sx={{
                  backgroundColor: '#EEF2FF',
                  color: '#2E5CFF',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => toggleRowExpansion(params.row.id)}
              />
            )}
          </Box>
        )
      },
    },
  ]

  const rows = filteredData.map((item, index) => ({
    id: index,
    delivery_date: item.delivery_date,
    total_tasks: item.total_tasks,
    file_count: item.file_count,
    file_names: item.file_names,
  }))

  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        {/* Summary Header */}
        <Box sx={{ p: 3, backgroundColor: '#F7F7F7', borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 1 }}>
            Delivery Tracker
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Track all deliveries with date, task count, and file information
          </Typography>
          
          {/* Summary Stats */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <Chip
              label={`Total Deliveries: ${filteredData.length} / ${data.length}`}
              sx={{
                backgroundColor: '#EEF2FF',
                color: '#2E5CFF',
                fontWeight: 600,
              }}
            />
            <Chip
              label={`Total Tasks: ${filteredData.reduce((sum, item) => sum + item.total_tasks, 0)}`}
              sx={{
                backgroundColor: '#F0FDF4',
                color: '#10B981',
                fontWeight: 600,
              }}
            />
            <Chip
              label={`Total Files: ${filteredData.reduce((sum, item) => sum + item.file_count, 0)}`}
              sx={{
                backgroundColor: '#FEF3C7',
                color: '#F59E0B',
                fontWeight: 600,
              }}
            />
          </Box>
        </Box>

        {/* Filter Bar */}
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Date Range Filter */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              type="date"
              label="Date From"
              value={dateFilter.startDate}
              onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ 
                backgroundColor: 'white',
                width: 160,
                '& .MuiInputBase-input': {
                  fontSize: '0.875rem',
                }
              }}
            />
            <TextField
              type="date"
              label="Date To"
              value={dateFilter.endDate}
              onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ 
                backgroundColor: 'white',
                width: 160,
                '& .MuiInputBase-input': {
                  fontSize: '0.875rem',
                }
              }}
            />
          </Box>

          {/* Filter Chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
            {/* Date Filter Chip */}
            {(dateFilter.startDate || dateFilter.endDate) && (
              <Chip
                label={`Date: ${dateFilter.startDate || '...'} to ${dateFilter.endDate || '...'}`}
                size="small"
                onDelete={() => setDateFilter({ startDate: '', endDate: '' })}
                sx={{
                  backgroundColor: '#EEF2FF',
                  color: '#2E5CFF',
                  fontWeight: 600,
                  '& .MuiChip-deleteIcon': {
                    color: '#2E5CFF',
                    '&:hover': {
                      color: '#1E40AF',
                    },
                  },
                }}
              />
            )}

            {/* Numeric Filters */}
            {numericFilters && Object.entries(numericFilters).map(([key, filter]) => {
              const isActive = filter.currentRange[0] !== filter.min || filter.currentRange[1] !== filter.max
              if (!isActive) return null
              
              let columnName = key === 'total_tasks' ? 'Total Tasks' : 'File Count'
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
                onClick={() => {
                  setDateFilter({ startDate: '', endDate: '' })
                  const resetFilters = initializeNumericFilters(data)
                  setNumericFilters(resetFilters)
                  setSortModel([])
                }}
                sx={{
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  fontWeight: 600,
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
                paddingX: 2,
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
                minHeight: '48px !important',
                maxHeight: '48px !important',
              },
              '& .MuiDataGrid-columnHeader': {
                cursor: 'pointer',
                paddingX: 2,
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
        
        {/* Expandable File Details - Shown below the grid */}
        {Array.from(expandedRows).map((rowId) => {
          const row = rows.find(r => r.id === rowId)
          if (!row) return null
          
          return (
            <Collapse key={rowId} in={true} timeout="auto">
              <Box
                sx={{
                  p: 3,
                  backgroundColor: '#F9FAFB',
                  borderTop: '1px solid #E5E7EB',
                  borderRadius: '0 0 8px 8px',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 600, color: '#1F2937' }}
                  >
                    Files for {row.delivery_date} ({row.file_count} files)
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => toggleRowExpansion(row.id)}
                    sx={{
                      color: '#6B7280',
                      '&:hover': {
                        backgroundColor: '#E5E7EB',
                      },
                    }}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {row.file_names.map((fileName: string, idx: number) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        backgroundColor: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: 1,
                        p: 1.5,
                        '&:hover': {
                          backgroundColor: '#F3F4F6',
                        },
                      }}
                    >
                      <DescriptionIcon sx={{ color: '#6B7280', fontSize: '1rem' }} />
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#374151',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          flex: 1,
                        }}
                      >
                        {fileName}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Collapse>
          )
        })}
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
            {/* Sort Options */}
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

            {/* Numeric Filter Range - Only show for numeric columns */}
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
                    step={1}
                    valueLabelFormat={(value) => value.toString()}
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
                      Min: {numericFilters[activeFilterColumn].min}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                      Max: {numericFilters[activeFilterColumn].max}
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
                  if (numericFilters[activeFilterColumn]) {
                    resetNumericFilter(activeFilterColumn)
                  }
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

