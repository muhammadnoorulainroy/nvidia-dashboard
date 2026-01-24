import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Popover,
  Button,
  Slider,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TableContainer,
} from '@mui/material'
import { DataGrid, GridColDef, GridSortModel, GridRowsProp } from '@mui/x-data-grid'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import RefreshIcon from '@mui/icons-material/Refresh'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import axios from 'axios'

// Grouped task interface
interface GroupedTask {
  task_id: string
  task_score: number | null
  rework_count: number
  work_item_count: number
  delivery_date: string
  turing_status: string
  client_status: string
  work_items: WorkItem[]
}

// Individual work item interface
interface WorkItem {
  work_item_id: string
  task_id: string  // Original task_id from work_item table
  delivery_date: string
  json_filename: string
  turing_status: string
  client_status: string
  task_level_feedback: string | null
  error_categories: string | null
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

export default function TaskWise() {
  const [data, setData] = useState<GroupedTask[]>([])
  const [filteredData, setFilteredData] = useState<GroupedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<string[]>([])
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [textFilters, setTextFilters] = useState<Record<string, TextFilter>>({})
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' })
  const [clientStatusFilter, setClientStatusFilter] = useState<string>('all')
  const [turingStatusFilter, setTuringStatusFilter] = useState<string>('all')
  const [filenameFilter, setFilenameFilter] = useState<string>('')
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [sortModel, setSortModel] = useState<GridSortModel>([])
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [paginationModel, setPaginationModel] = useState({
    pageSize: 20,
    page: 0,
  })

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery/task-wise`)
      
      // Convert task_id to string for DataGrid compatibility
      const processedData = response.data.map((task: any) => ({
        ...task,
        task_id: String(task.task_id)
      }))
      
      setData(processedData)
      setFilteredData(processedData)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch task data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    
    // Listen for feedback upload events to refresh data
    const handleFeedbackUploaded = () => {
      console.log('📤 Feedback uploaded, refreshing data...')
      fetchData()
    }
    
    // Listen for S3 sync events to refresh data
    const handleS3Synced = () => {
      console.log('🔄 S3 synced, refreshing data...')
      fetchData()
    }
    
    window.addEventListener('feedbackUploaded', handleFeedbackUploaded)
    window.addEventListener('s3Synced', handleS3Synced)
    
    return () => {
      window.removeEventListener('feedbackUploaded', handleFeedbackUploaded)
      window.removeEventListener('s3Synced', handleS3Synced)
    }
  }, [])

  useEffect(() => {
    console.log('⭐ expandedRows state changed to:', expandedRows)
  }, [expandedRows])

  // Initialize numeric filters
  const initializeNumericFilters = (tasks: GroupedTask[]) => {
    const filters: Record<string, NumericFilter> = {}
    if (tasks.length === 0) return filters

    const taskScores = tasks
      .map(t => t.task_score)
      .filter(val => val !== null && val !== undefined) as number[]
    
    if (taskScores.length > 0) {
      const minScore = Math.min(...taskScores)
      const maxScore = Math.max(...taskScores)
      filters['task_score'] = { min: minScore, max: maxScore, currentRange: [minScore, maxScore] }
    }

    const reworkCounts = tasks.map(t => t.rework_count || 0)
    if (reworkCounts.length > 0) {
      const minRework = Math.min(...reworkCounts)
      const maxRework = Math.max(...reworkCounts)
      filters['rework_count'] = { min: minRework, max: maxRework, currentRange: [minRework, maxRework] }
    }

    const workItemCounts = tasks.map(t => t.work_item_count)
    if (workItemCounts.length > 0) {
      const minCount = Math.min(...workItemCounts)
      const maxCount = Math.max(...workItemCounts)
      filters['work_item_count'] = { min: minCount, max: maxCount, currentRange: [minCount, maxCount] }
    }

    return filters
  }

  useEffect(() => {
    if (data.length > 0) {
      const initialFilters = initializeNumericFilters(data)
      setNumericFilters(initialFilters)
    }
  }, [data])

  // Apply filters
  useEffect(() => {
    let filtered = [...data]

    // Date filter
    // Apply date filter
    if (dateFilter.startDate || dateFilter.endDate) {
      filtered = filtered.filter(task => {
        if (!task.delivery_date) return false
        const taskDate = new Date(task.delivery_date)
        if (dateFilter.startDate && taskDate < new Date(dateFilter.startDate)) return false
        if (dateFilter.endDate && taskDate > new Date(dateFilter.endDate)) return false
        return true
      })
    }

    // Apply Client Status filter
    if (clientStatusFilter !== 'all') {
      filtered = filtered.filter(task => {
        const status = task.client_status?.toUpperCase() || 'PENDING'
        return status === clientStatusFilter.toUpperCase()
      })
    }

    // Apply Turing Status filter
    if (turingStatusFilter !== 'all') {
      filtered = filtered.filter(task => {
        const status = task.turing_status?.toUpperCase() || 'DELIVERED'
        return status === turingStatusFilter.toUpperCase()
      })
    }

    // Apply filename filter
    if (filenameFilter) {
      filtered = filtered.filter(task => {
        return task.work_items?.some(wi => 
          wi.json_filename?.toLowerCase().includes(filenameFilter.toLowerCase())
        )
      })
    }

    // Numeric filters
    Object.entries(numericFilters).forEach(([field, filter]) => {
      filtered = filtered.filter(task => {
        const value = task[field as keyof GroupedTask]
        if (value === null || value === undefined) return false
        const numValue = typeof value === 'number' ? value : parseFloat(value as string)
        return numValue >= filter.currentRange[0] && numValue <= filter.currentRange[1]
      })
    })

    // Text filters
    Object.entries(textFilters).forEach(([field, filter]) => {
      filtered = filtered.filter(task => {
        const value = String(task[field as keyof GroupedTask] || '').toLowerCase()
        const filterValue = filter.value.toLowerCase()
        
        switch (filter.operator) {
          case 'contains': return value.includes(filterValue)
          case 'equals': return value === filterValue
          case 'startsWith': return value.startsWith(filterValue)
          case 'endsWith': return value.endsWith(filterValue)
          default: return true
        }
      })
    })

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aVal: any = a[sortField as keyof GroupedTask]
        let bVal: any = b[sortField as keyof GroupedTask]

        // Handle null/undefined values
        if (aVal === null || aVal === undefined) return sortDirection === 'asc' ? 1 : -1
        if (bVal === null || bVal === undefined) return sortDirection === 'asc' ? -1 : 1

        // Convert to appropriate type for comparison
        if (sortField === 'task_id') {
          aVal = String(aVal)
          bVal = String(bVal)
        }

        if (typeof aVal === 'string') {
          const comparison = aVal.localeCompare(bVal)
          return sortDirection === 'asc' ? comparison : -comparison
        } else {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
      })
    }

    setFilteredData(filtered)
  }, [data, numericFilters, textFilters, dateFilter, clientStatusFilter, turingStatusFilter, filenameFilter, sortField, sortDirection])

  const toggleRowExpansion = (taskId: string) => {
    console.log('🔵 Toggling task:', taskId)
    console.log('🔵 Current expandedRows:', expandedRows)
    if (expandedRows.includes(taskId)) {
      console.log('🔴 Collapsing')
      setExpandedRows(expandedRows.filter(id => id !== taskId))
    } else {
      console.log('🟢 Expanding')
      setExpandedRows([...expandedRows, taskId])
    }
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, default to ascending
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleFilterClick = (event: React.MouseEvent<HTMLElement>, column: string) => {
    event.stopPropagation()
    setActiveFilterColumn(column)
    setFilterAnchorEl(event.currentTarget)
  }

  const handleFilterClose = () => {
    setFilterAnchorEl(null)
    setActiveFilterColumn('')
  }

  const getStatusColor = (status: string, type: 'turing' | 'client') => {
    if (type === 'turing') {
      if (status === 'Delivered') return '#10B981'
      if (status === 'Rework') return '#F59E0B'
      return '#6B7280'
    } else {
      if (status === 'REJECTED') return '#EF4444'
      if (status === 'ACCEPTED' || status === 'Accepted') return '#10B981'
      if (status === 'Pending') return '#F59E0B'
      if (status === 'Mixed') return '#8B5CF6'
      return '#6B7280'
    }
  }

  const calculateColumnWidth = (headerText: string, data: any[], field: string) => {
    const headerWidth = headerText.length * 10 + 80
    const maxContentWidth = data.reduce((max, row) => {
      const value = String(row[field] || '')
      return Math.max(max, value.length * 8 + 40)
    }, 0)
    return Math.max(headerWidth, maxContentWidth, 120)
  }

  const renderHeaderWithDropdown = (label: string, isNumeric: boolean, field: string) => {
    const hasFilter = (isNumeric && numericFilters[field]) || (!isNumeric && textFilters[field])
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
        <IconButton
          size="small"
          onClick={(e) => handleFilterClick(e, field)}
          sx={{ 
            padding: '2px',
            color: hasFilter ? '#2E5CFF' : '#6B7280',
            '&:hover': { backgroundColor: '#F3F4F6' }
          }}
        >
          <ArrowDropDownIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937', fontSize: '0.875rem' }}>
          {label}
        </Typography>
      </Box>
    )
  }

  const columns: GridColDef[] = [
    {
      field: 'expand',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation()
            toggleRowExpansion(params.row.task_id)
          }}
          sx={{
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            }
          }}
        >
          {expandedRows.includes(params.row.task_id) ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </IconButton>
      ),
    },
    {
      field: 'task_id',
      headerName: 'Labelling Task ID',
      width: calculateColumnWidth('Labelling Task ID', filteredData, 'task_id'),
      renderHeader: () => renderHeaderWithDropdown('Labelling Task ID', false, 'task_id'),
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 600, 
            color: '#2E5CFF', 
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' }
          }}
          onClick={() => {
            if (params.value) {
              window.open(`https://labeling-z.turing.com/conversations/${params.value}/view`, '_blank')
            }
          }}
        >
          {params.value || 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'task_score',
      headerName: 'Task Score',
      width: calculateColumnWidth('Task Score', filteredData, 'task_score'),
      type: 'number',
      renderHeader: () => renderHeaderWithDropdown('Task Score', true, 'task_score'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {params.value !== null && params.value !== undefined ? Number(params.value).toFixed(2) : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'rework_count',
      headerName: 'Rework Count',
      width: calculateColumnWidth('Rework Count', filteredData, 'rework_count'),
      type: 'number',
      renderHeader: () => renderHeaderWithDropdown('Rework Count', true, 'rework_count'),
      renderCell: (params) => (
        <Chip
          label={params.value || 0}
          size="small"
          sx={{
            backgroundColor: params.value > 0 ? '#FEF3C7' : '#E5E7EB',
            color: params.value > 0 ? '#92400E' : '#6B7280',
            fontWeight: 600,
          }}
        />
      ),
    },
    {
      field: 'work_item_count',
      headerName: 'Work Items',
      width: calculateColumnWidth('Work Items', filteredData, 'work_item_count'),
      type: 'number',
      renderHeader: () => renderHeaderWithDropdown('Work Items', true, 'work_item_count'),
      renderCell: (params) => (
        <Chip
          label={`${params.value} items`}
          size="small"
          sx={{
            backgroundColor: '#EEF2FF',
            color: '#4F46E5',
            fontWeight: 600,
          }}
        />
      ),
    },
    {
      field: 'delivery_date',
      headerName: 'Delivery Date',
      width: calculateColumnWidth('Delivery Date', filteredData, 'delivery_date'),
      renderHeader: () => renderHeaderWithDropdown('Delivery Date', false, 'delivery_date'),
      renderCell: (params) => (
        <Typography variant="body2" sx={{ color: '#1F2937' }}>
          {params.value ? new Date(params.value).toLocaleDateString() : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'turing_status',
      headerName: 'Turing Status',
      width: calculateColumnWidth('Turing Status', filteredData, 'turing_status'),
      renderHeader: () => renderHeaderWithDropdown('Turing Status', false, 'turing_status'),
      renderCell: (params) => (
        <Chip
          label={params.value || 'N/A'}
          size="small"
          sx={{
            backgroundColor: getStatusColor(params.value, 'turing'),
            color: 'white',
            fontWeight: 600,
          }}
        />
      ),
    },
    {
      field: 'client_status',
      headerName: 'Client Status',
      width: calculateColumnWidth('Client Status', filteredData, 'client_status'),
      renderHeader: () => renderHeaderWithDropdown('Client Status', false, 'client_status'),
      renderCell: (params) => (
        <Chip
          label={params.value || 'Pending'}
          size="small"
          sx={{
            backgroundColor: getStatusColor(params.value, 'client'),
            color: 'white',
            fontWeight: 600,
          }}
        />
      ),
    },
  ]

  const clearAllFilters = () => {
    setNumericFilters(initializeNumericFilters(data))
    setTextFilters({})
    setDateFilter({ startDate: '', endDate: '' })
    setClientStatusFilter('all')
    setTuringStatusFilter('all')
    setFilenameFilter('')
  }

  const hasActiveFilters = () => {
    const hasNumeric = Object.values(numericFilters).some(f => 
      f.currentRange[0] !== f.min || f.currentRange[1] !== f.max
    )
    const hasText = Object.keys(textFilters).length > 0
    const hasDate = dateFilter.startDate !== '' || dateFilter.endDate !== ''
    const hasClientStatus = clientStatusFilter !== 'all'
    const hasTuringStatus = turingStatusFilter !== 'all'
    const hasFilename = filenameFilter !== ''
    return hasNumeric || hasText || hasDate || hasClientStatus || hasTuringStatus || hasFilename
  }

  // Memoize getDetailPanelHeight to force re-render when expandedRows changes
  const getDetailPanelHeightMemo = useMemo(() => {
    return ({ row }: { row: GroupedTask }) => {
      const isExpanded = expandedRows.includes(row.task_id)
      console.log(`🟣 getDetailPanelHeight for ${row.task_id}: expandedRows=`, expandedRows, 'isExpanded=', isExpanded)
      return isExpanded ? 'auto' : 0
    }
  }, [expandedRows])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Filter Bar */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => fetchData()}
          disabled={loading}
          sx={{
            backgroundColor: '#2E5CFF',
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: '#2347D5',
            },
          }}
        >
          Refresh
        </Button>
        <TextField
          label="Date From"
          type="date"
          value={dateFilter.startDate}
          onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ minWidth: 150 }}
        />
        <TextField
          label="Date To"
          type="date"
          value={dateFilter.endDate}
          onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ minWidth: 150 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Client Status</InputLabel>
          <Select
            value={clientStatusFilter}
            label="Client Status"
            onChange={(e) => setClientStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Turing Status</InputLabel>
          <Select
            value={turingStatusFilter}
            label="Turing Status"
            onChange={(e) => setTuringStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="delivered">Delivered</MenuItem>
            <MenuItem value="rework">Rework</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="JSON Filename"
          value={filenameFilter}
          onChange={(e) => setFilenameFilter(e.target.value)}
          placeholder="Search filename..."
          size="small"
          sx={{ minWidth: 200 }}
        />
        {hasActiveFilters() && (
          <Button
            variant="outlined"
            size="small"
            onClick={clearAllFilters}
            sx={{ textTransform: 'none' }}
          >
            Clear All Filters
          </Button>
        )}
      </Box>

      {/* Main DataGrid */}
      <Box sx={{ width: '100%' }}>
        {/* Column Headers */}
        <Paper sx={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)', mb: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              p: 2,
              backgroundColor: '#F9FAFB',
              borderBottom: '2px solid #E5E7EB',
            }}
          >
            <Box sx={{ width: 40, mr: 2 }}></Box>
            <Box 
              sx={{ minWidth: 120, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('task_id')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Labelling Task ID
              </Typography>
              {sortField === 'task_id' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 80, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('task_score')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Task Score
              </Typography>
              {sortField === 'task_score' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 100, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('rework_count')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Rework Count
              </Typography>
              {sortField === 'rework_count' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 100, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('work_item_count')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Work Items
              </Typography>
              {sortField === 'work_item_count' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 120, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('delivery_date')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Delivery Date
              </Typography>
              {sortField === 'delivery_date' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 120, mr: 2, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('turing_status')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Turing Status
              </Typography>
              {sortField === 'turing_status' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
            <Box 
              sx={{ minWidth: 120, display: 'flex', alignItems: 'center', cursor: 'pointer', '&:hover': { color: '#2E5CFF' } }}
              onClick={() => handleSort('client_status')}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                Client Status
              </Typography>
              {sortField === 'client_status' && (
                sortDirection === 'asc' ? <ArrowUpwardIcon sx={{ ml: 0.5, fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ ml: 0.5, fontSize: 16 }} />
              )}
            </Box>
          </Box>
        </Paper>

        {filteredData.map((task, index) => (
          <Box key={task.task_id} sx={{ mb: 0 }}>
            {/* Main Row */}
            <Paper sx={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)', mb: expandedRows.includes(task.task_id) ? 0 : 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 2,
                  backgroundColor: '#FFFFFF',
                  borderBottom: expandedRows.includes(task.task_id) ? '1px solid #E5E7EB' : 'none',
                  '&:hover': {
                    backgroundColor: '#F3F4F6',
                  },
                }}
              >
                <Box sx={{ width: 40, mr: 2 }}>
                  <IconButton
                    size="small"
                    onClick={() => toggleRowExpansion(task.task_id)}
                  >
                    {expandedRows.includes(task.task_id) ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                  </IconButton>
                </Box>
                
                <Box sx={{ minWidth: 120, mr: 2 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: '#2E5CFF',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => window.open(`https://labeling-z.turing.com/conversations/${task.task_id}/view`, '_blank')}
                  >
                    {task.task_id}
                  </Typography>
                </Box>
                
                <Box sx={{ minWidth: 80, mr: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                    {task.task_score !== null ? Number(task.task_score).toFixed(2) : 'N/A'}
                  </Typography>
                </Box>
                
                <Box sx={{ minWidth: 100, mr: 2 }}>
                  <Chip
                    label={task.rework_count || 0}
                    size="small"
                    sx={{
                      backgroundColor: task.rework_count > 0 ? '#FEF3C7' : '#E5E7EB',
                      color: task.rework_count > 0 ? '#92400E' : '#6B7280',
                      fontWeight: 600,
                    }}
                  />
                </Box>
                
                <Box sx={{ minWidth: 100, mr: 2 }}>
                  <Chip
                    label={`${task.work_item_count} items`}
                    size="small"
                    sx={{
                      backgroundColor: '#EEF2FF',
                      color: '#4F46E5',
                      fontWeight: 600,
                    }}
                  />
                </Box>
                
                <Box sx={{ minWidth: 120, mr: 2 }}>
                  <Typography variant="body2" sx={{ color: '#1F2937' }}>
                    {task.delivery_date ? new Date(task.delivery_date).toLocaleDateString() : 'N/A'}
                  </Typography>
                </Box>
                
                <Box sx={{ minWidth: 120, mr: 2 }}>
                  <Chip
                    label={task.turing_status}
                    size="small"
                    sx={{
                      backgroundColor: getStatusColor(task.turing_status, 'turing'),
                      color: 'white',
                      fontWeight: 600,
                    }}
                  />
                </Box>
                
                <Box sx={{ minWidth: 120 }}>
                  <Chip
                    label={task.client_status}
                    size="small"
                    sx={{
                      backgroundColor: getStatusColor(task.client_status, 'client'),
                      color: 'white',
                      fontWeight: 600,
                    }}
                  />
                </Box>
              </Box>
              
              {/* Expanded Detail */}
              <Collapse in={expandedRows.includes(task.task_id)} timeout="auto" unmountOnExit>
                <Box sx={{ p: 3, backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, color: '#1F2937' }}>
                    Work Items ({task.work_items?.length || 0})
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Work Item ID</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Task ID</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>JSON File</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Delivery Date</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Turing Status</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Client Status</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Task Level Feedback</TableCell>
                          <TableCell sx={{ fontWeight: 700, backgroundColor: '#FFFFFF', verticalAlign: 'top' }}>Error Categories</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.work_items?.map((item: WorkItem) => (
                          <TableRow key={item.work_item_id} sx={{ '&:hover': { backgroundColor: '#FFFFFF' } }}>
                            <TableCell sx={{ fontSize: '0.875rem', verticalAlign: 'top' }}>{item.work_item_id}</TableCell>
                            <TableCell sx={{ fontSize: '0.875rem', verticalAlign: 'top' }}>{item.task_id || 'N/A'}</TableCell>
                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.875rem', verticalAlign: 'top' }}>
                              {item.json_filename || 'N/A'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.875rem', verticalAlign: 'top' }}>
                              {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString() : 'N/A'}
                            </TableCell>
                            <TableCell sx={{ verticalAlign: 'top' }}>
                              <Chip
                                label={item.turing_status}
                                size="small"
                                sx={{
                                  backgroundColor: getStatusColor(item.turing_status, 'turing'),
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ verticalAlign: 'top' }}>
                              <Chip
                                label={item.client_status}
                                size="small"
                                sx={{
                                  backgroundColor: getStatusColor(item.client_status, 'client'),
                                  color: 'white',
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 250, fontSize: '0.875rem', verticalAlign: 'top' }}>
                              {item.task_level_feedback || '-'}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 200, fontSize: '0.875rem', verticalAlign: 'top' }}>
                              {item.error_categories || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Collapse>
            </Paper>
          </Box>
        ))}
      </Box>

      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={handleFilterClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, minWidth: 250 }}>
          {activeFilterColumn && numericFilters[activeFilterColumn] && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Range Filter
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
                min={numericFilters[activeFilterColumn].min}
                max={numericFilters[activeFilterColumn].max}
                step={0.01}
                valueLabelDisplay="auto"
                sx={{ mt: 2 }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="caption">
                  {numericFilters[activeFilterColumn].currentRange[0].toFixed(2)}
                </Typography>
                <Typography variant="caption">
                  {numericFilters[activeFilterColumn].currentRange[1].toFixed(2)}
                </Typography>
              </Box>
            </>
          )}
          
          {activeFilterColumn && !numericFilters[activeFilterColumn] && (
            <>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Operator</InputLabel>
                <Select
                  value={textFilters[activeFilterColumn]?.operator || 'contains'}
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
              />
            </>
          )}
        </Box>
      </Popover>
    </Box>
  )
}
