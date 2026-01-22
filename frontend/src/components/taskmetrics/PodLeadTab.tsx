import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Popover,
  Slider,
  Divider,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Download as DownloadIcon,
  Groups as GroupsIcon,
  ArrowDropDown as ArrowDropDownIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material'
import { getPodLeadStats, PodLeadStats, TrainerUnderPod } from '../../services/api'
import { exportReviewerWithTrainersToExcel } from '../../utils/exportToExcel'
import ColorSettingsPanel, { 
  ColorSettings, 
  defaultColorSettings, 
  getBackgroundColorForValue,
  useColorSettings,
  ColorApplyLevel
} from './ColorSettingsPanel'

type Timeframe = 'daily' | 'd-1' | 'd-2' | 'd-3' | 'weekly' | 'overall' | 'custom'

// Get date range based on timeframe
function getDateRange(timeframe: Timeframe, customStart?: string, customEnd?: string) {
  const today = new Date()
  let startDate: string | undefined
  let endDate: string | undefined

  switch (timeframe) {
    case 'daily':
      startDate = today.toISOString().split('T')[0]
      endDate = startDate
      break
    case 'd-1':
      const d1 = new Date(today)
      d1.setDate(today.getDate() - 1)
      startDate = d1.toISOString().split('T')[0]
      endDate = startDate
      break
    case 'd-2':
      const d2 = new Date(today)
      d2.setDate(today.getDate() - 2)
      startDate = d2.toISOString().split('T')[0]
      endDate = startDate
      break
    case 'd-3':
      const d3 = new Date(today)
      d3.setDate(today.getDate() - 3)
      startDate = d3.toISOString().split('T')[0]
      endDate = startDate
      break
    case 'weekly':
      const weekAgo = new Date(today)
      weekAgo.setDate(today.getDate() - 7)
      startDate = weekAgo.toISOString().split('T')[0]
      endDate = today.toISOString().split('T')[0]
      break
    case 'custom':
      startDate = customStart
      endDate = customEnd
      break
    case 'overall':
    default:
      startDate = undefined
      endDate = undefined
  }

  return { startDate, endDate }
}

// Trainer Row Component - matches ReviewerWise trainer row style
function TrainerRow({ 
  trainer, 
  colorSettings,
  applyColors = true
}: { 
  trainer: TrainerUnderPod
  colorSettings: ColorSettings
  applyColors?: boolean
}) {
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'success'
      case 'inactive': return 'default'
      default: return 'default'
    }
  }

  // Map POD data fields to color settings keys
  const tasksReviewed = trainer.unique_tasks || 0
  const newTasksReviewed = trainer.new_tasks || 0
  const reworkReviewed = trainer.rework || 0
  const totalReviews = trainer.total_reviews || 0
  const readyForDelivery = trainer.ready_for_delivery || 0
  const avgRework = trainer.avg_rework
  const reworkPercent = trainer.rework_percent
  const avgRating = trainer.avg_rating
  const mergedExpAht = trainer.merged_exp_aht

  // Helper to conditionally apply color - dark text for readability
  const getBgColor = (value: any, config: any) => applyColors ? getBackgroundColorForValue(value, config) : undefined

  return (
    <TableRow sx={{ backgroundColor: '#F0F4FF', '&:hover': { backgroundColor: '#E8EEFF' } }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 4 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
            ↳ {trainer.trainer_name || 'Unknown'}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ pl: 4 }}>
          {trainer.trainer_email}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Chip size="small" label={trainer.status || 'Unknown'} color={getStatusColor(trainer.status)} />
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(tasksReviewed, colorSettings.tasks_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {tasksReviewed}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(newTasksReviewed, colorSettings.new_tasks_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {newTasksReviewed}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(reworkReviewed, colorSettings.rework_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {reworkReviewed}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(totalReviews, colorSettings.total_reviews) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {totalReviews}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(readyForDelivery, colorSettings.ready_for_delivery) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {readyForDelivery}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(avgRework, colorSettings.avg_rework) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {avgRework !== null && avgRework !== undefined ? `${Math.round(avgRework)}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(reworkPercent, colorSettings.rework_percent) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {reworkPercent !== null && reworkPercent !== undefined ? `${Math.round(reworkPercent)}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(avgRating, colorSettings.avg_rating) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {avgRating !== null && avgRating !== undefined ? avgRating.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="center"
        sx={{ backgroundColor: getBgColor(mergedExpAht, colorSettings.merged_exp_aht) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {mergedExpAht !== null && mergedExpAht !== undefined ? mergedExpAht.toFixed(2) : '-'}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

// POD Lead Row Component - matches ReviewerWise reviewer row style
function PodLeadRow({ 
  podLead,
  colorSettings,
  applyColors = true,
  applyColorsToChildren = true
}: { 
  podLead: PodLeadStats
  colorSettings: ColorSettings
  applyColors?: boolean
  applyColorsToChildren?: boolean
}) {
  const [open, setOpen] = useState(false)
  const hasTrainers = podLead.trainers && podLead.trainers.length > 0

  // Map POD data fields to color settings keys
  const tasksReviewed = podLead.unique_tasks || 0
  const newTasksReviewed = podLead.new_tasks || 0
  const reworkReviewed = podLead.rework || 0
  const totalReviews = podLead.total_reviews || 0
  const readyForDelivery = podLead.ready_for_delivery || 0
  const avgRework = podLead.avg_rework
  const reworkPercent = podLead.rework_percent
  const avgRating = podLead.avg_rating
  const mergedExpAht = podLead.merged_exp_aht

  // Helper to conditionally apply color - dark text for readability
  const getBgColor = (value: any, config: any) => applyColors ? getBackgroundColorForValue(value, config) : undefined

  return (
    <>
      <TableRow 
        sx={{ 
          backgroundColor: '#EEF2FF',
          cursor: hasTrainers ? 'pointer' : 'default',
          '&:hover': { backgroundColor: hasTrainers ? '#E0E7FF' : '#EEF2FF' },
        }}
        onClick={() => hasTrainers && setOpen(!open)}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasTrainers && (
              <IconButton size="small">
                {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
              </IconButton>
            )}
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600, color: '#1F2937' }}>
                {podLead.pod_lead_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {podLead.pod_lead_email}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center">
          <Chip 
            size="small" 
            icon={<GroupsIcon />}
            label={`${podLead.trainer_count} trainers`}
            color="primary"
            variant="outlined"
          />
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(tasksReviewed, colorSettings.tasks_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {tasksReviewed}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(newTasksReviewed, colorSettings.new_tasks_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {newTasksReviewed}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(reworkReviewed, colorSettings.rework_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {reworkReviewed}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(totalReviews, colorSettings.total_reviews) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {totalReviews}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(readyForDelivery, colorSettings.ready_for_delivery) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {readyForDelivery}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(avgRework, colorSettings.avg_rework) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {avgRework !== null && avgRework !== undefined ? `${Math.round(avgRework)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(reworkPercent, colorSettings.rework_percent) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {reworkPercent !== null && reworkPercent !== undefined ? `${Math.round(reworkPercent)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(avgRating, colorSettings.avg_rating) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {avgRating !== null && avgRating !== undefined ? avgRating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="center"
          sx={{ backgroundColor: getBgColor(mergedExpAht, colorSettings.merged_exp_aht) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {mergedExpAht !== null && mergedExpAht !== undefined ? mergedExpAht.toFixed(2) : '-'}
          </Typography>
        </TableCell>
      </TableRow>
      
      {/* Trainers under this POD Lead */}
      {hasTrainers && open && podLead.trainers.map((trainer, idx) => (
        <TrainerRow key={idx} trainer={trainer} colorSettings={colorSettings} applyColors={applyColorsToChildren} />
      ))}
    </>
  )
}

// Numeric filter interface
interface NumericFilter {
  min: number
  max: number
  currentRange: [number, number]
}

// Sort direction type
type SortDirection = 'asc' | 'desc' | null

export function PodLeadTab() {
  const [data, setData] = useState<PodLeadStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  
  const [colorSettings, setColorSettings] = useColorSettings('podLeadColorSettings')
  const [colorApplyLevel, setColorApplyLevel] = useState<ColorApplyLevel>('both')
  
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [numericFilters, setNumericFilters] = useState<Record<string, NumericFilter>>({})
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  
  // Use defaultColorSettings as fallback if colorSettings is empty
  const effectiveColorSettings: ColorSettings = colorSettings && Object.keys(colorSettings).length > 0 
    ? colorSettings 
    : defaultColorSettings
  
  // Determine whether to apply colors based on apply level
  const applyColorsToPod = colorApplyLevel === 'both' || colorApplyLevel === 'parent'
  const applyColorsToTrainer = colorApplyLevel === 'both' || colorApplyLevel === 'child'

  useEffect(() => {
    fetchData()
  }, [timeframe, customStartDate, customEndDate])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getDateRange(timeframe, customStartDate, customEndDate)
      const result = await getPodLeadStats(startDate, endDate, timeframe)
      setData(result)
    } catch (err) {
      setError('Failed to fetch POD Lead stats')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Initialize numeric filters when data loads
  useEffect(() => {
    if (data.length > 0) {
      const newFilters: Record<string, NumericFilter> = {}
      const numericColumns = ['unique_tasks', 'new_tasks', 'rework', 'total_reviews', 'ready_for_delivery', 'avg_rework', 'rework_percent', 'avg_rating', 'merged_exp_aht']
      
      numericColumns.forEach(col => {
        const values = data.map(d => {
          const val = d[col as keyof PodLeadStats]
          return typeof val === 'number' ? val : 0
        }).filter(v => v !== null && v !== undefined)
        
        if (values.length > 0) {
          const min = Math.min(...values)
          const max = Math.max(...values)
          newFilters[col] = { min, max, currentRange: [min, max] }
        }
      })
      setNumericFilters(newFilters)
    }
  }, [data])

  // Handle sort
  const handleSort = (column: string, direction: SortDirection) => {
    setSortColumn(column)
    setSortDirection(direction)
    setFilterAnchorEl(null)
    setActiveFilterColumn('')
  }

  // Reset filter for a column
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

  // Apply search filter
  let filteredData = data.filter(pod =>
    pod.pod_lead_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pod.pod_lead_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pod.trainers.some(t => 
      t.trainer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.trainer_email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  // Apply numeric filters
  Object.entries(numericFilters).forEach(([col, filter]) => {
    filteredData = filteredData.filter(pod => {
      const val = pod[col as keyof PodLeadStats]
      if (typeof val !== 'number') return true
      return val >= filter.currentRange[0] && val <= filter.currentRange[1]
    })
  })

  // Apply sorting
  if (sortColumn && sortDirection) {
    filteredData = [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn as keyof PodLeadStats]
      const bVal = b[sortColumn as keyof PodLeadStats]
      
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    })
  }

  // Render column header with dropdown
  const renderHeaderWithFilter = (label: string, columnKey: string, _isNumeric: boolean = false) => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: 'pointer',
        '&:hover': { opacity: 0.8 }
      }}
      onClick={(e) => {
        setFilterAnchorEl(e.currentTarget as HTMLElement)
        setActiveFilterColumn(columnKey)
      }}
    >
      <ArrowDropDownIcon sx={{ fontSize: 18, color: 'white' }} />
      <span>{label}</span>
      {sortColumn === columnKey && (
        sortDirection === 'asc' ? 
          <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : 
          <ArrowDownwardIcon sx={{ fontSize: 14 }} />
      )}
    </Box>
  )

  const handleExport = () => {
    const exportData = filteredData.map(pod => ({
      reviewer_name: pod.pod_lead_name,
      reviewer_email: pod.pod_lead_email,
      unique_tasks_reviewed: pod.unique_tasks,
      new_tasks_reviewed: pod.new_tasks,
      rework_reviewed: pod.rework,
      total_reviews: pod.total_reviews,
      tasks_ready_for_delivery: pod.ready_for_delivery,
      avg_rework: pod.avg_rework,
      rework_percent: pod.rework_percent,
      avg_rating: pod.avg_rating,
      trainers: pod.trainers.map(t => ({
        trainer_name: t.trainer_name,
        trainer_email: t.trainer_email,
        tasks_reviewed: t.unique_tasks,
        new_tasks_reviewed: t.new_tasks,
        rework_reviewed: t.rework,
        total_reviews: t.total_reviews,
        ready_for_delivery: t.ready_for_delivery,
        avg_rework: t.avg_rework,
        rework_percent: t.rework_percent,
        avg_rating: t.avg_rating,
      }))
    }))
    
    const timestamp = new Date().toISOString().split('T')[0]
    exportReviewerWithTrainersToExcel(exportData, false, `POD_Lead_Stats_${timeframe}_${timestamp}`, 'POD Lead')
  }

  // Calculate totals
  const totals = {
    podLeads: filteredData.length,
    trainers: filteredData.reduce((sum, pod) => sum + pod.trainer_count, 0),
    uniqueTasks: filteredData.reduce((sum, pod) => sum + pod.unique_tasks, 0),
    newTasks: filteredData.reduce((sum, pod) => sum + pod.new_tasks, 0),
    rework: filteredData.reduce((sum, pod) => sum + pod.rework, 0),
    totalReviews: filteredData.reduce((sum, pod) => sum + pod.total_reviews, 0),
    readyForDelivery: filteredData.reduce((sum, pod) => sum + pod.ready_for_delivery, 0),
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select
              value={timeframe}
              label="Timeframe"
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            >
              <MenuItem value="daily">Today</MenuItem>
              <MenuItem value="d-1">D-1</MenuItem>
              <MenuItem value="d-2">D-2</MenuItem>
              <MenuItem value="d-3">D-3</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="overall">Overall</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
            </Select>
          </FormControl>

          {timeframe === 'custom' && (
            <>
              <TextField
                size="small"
                type="date"
                label="Start Date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <TextField
                size="small"
                type="date"
                label="End Date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
            </>
          )}

          <TextField
            size="small"
            placeholder="Search POD Lead or Trainer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: 250 }}
          />

          {/* Color Settings */}
          <ColorSettingsPanel 
            settings={colorSettings}
            onSettingsChange={setColorSettings}
            metrics={[
              'tasks_reviewed',
              'new_tasks_reviewed',
              'rework_reviewed',
              'total_reviews',
              'ready_for_delivery',
              'avg_rework',
              'rework_percent',
              'avg_rating',
              'merged_exp_aht'
            ]}
            applyLevel={colorApplyLevel}
            onApplyLevelChange={setColorApplyLevel}
          />

          <Button
            variant="contained"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
        </Box>

        {/* Summary */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Chip label={`${totals.podLeads} POD Leads`} color="primary" />
          <Chip label={`${totals.trainers} Trainers`} color="secondary" />
          <Chip label={`${totals.uniqueTasks} Unique Tasks`} variant="outlined" />
          <Chip label={`${totals.newTasks} New Tasks`} variant="outlined" />
          <Chip label={`${totals.rework} Rework`} variant="outlined" />
          <Chip label={`${totals.readyForDelivery} Ready for Delivery`} variant="outlined" />
        </Box>
      </Paper>

      {/* Filter Popover */}
      <Popover
        open={Boolean(filterAnchorEl)}
        anchorEl={filterAnchorEl}
        onClose={() => {
          setFilterAnchorEl(null)
          setActiveFilterColumn('')
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            {activeFilterColumn.replace(/_/g, ' ').toUpperCase()}
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          
          {/* Sort Options */}
          <MenuItem onClick={() => handleSort(activeFilterColumn, 'asc')} sx={{ py: 0.5 }}>
            <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sort Ascending</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleSort(activeFilterColumn, 'desc')} sx={{ py: 0.5 }}>
            <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sort Descending</ListItemText>
          </MenuItem>
          
          {/* Numeric Filter - only show for numeric columns */}
          {numericFilters[activeFilterColumn] && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                <FilterListIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                Filter Range
              </Typography>
              <Box sx={{ px: 1 }}>
                <Slider
                  value={numericFilters[activeFilterColumn].currentRange}
                  min={numericFilters[activeFilterColumn].min}
                  max={numericFilters[activeFilterColumn].max}
                  onChange={(_, newValue) => {
                    setNumericFilters(prev => ({
                      ...prev,
                      [activeFilterColumn]: {
                        ...prev[activeFilterColumn],
                        currentRange: newValue as [number, number]
                      }
                    }))
                  }}
                  valueLabelDisplay="auto"
                  size="small"
                  step={activeFilterColumn.includes('percent') || activeFilterColumn.includes('rating') ? 0.1 : 1}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'text.secondary' }}>
                  <span>{numericFilters[activeFilterColumn].currentRange[0].toFixed(1)}</span>
                  <span>{numericFilters[activeFilterColumn].currentRange[1].toFixed(1)}</span>
                </Box>
              </Box>
              <Button
                size="small"
                onClick={() => resetNumericFilter(activeFilterColumn)}
                sx={{ mt: 1 }}
                fullWidth
              >
                Reset Filter
              </Button>
            </>
          )}
        </Box>
      </Popover>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 200 }}>
                  {renderHeaderWithFilter('POD Lead / Trainer', 'pod_lead_name', false)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 100 }}>
                  {renderHeaderWithFilter('Status / Count', 'trainer_count', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 100 }}>
                  {renderHeaderWithFilter('Unique Tasks', 'unique_tasks', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 90 }}>
                  {renderHeaderWithFilter('New Tasks', 'new_tasks', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 80 }}>
                  {renderHeaderWithFilter('Rework', 'rework', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 100 }}>
                  {renderHeaderWithFilter('Total Reviews', 'total_reviews', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 130 }}>
                  {renderHeaderWithFilter('Ready for Delivery', 'ready_for_delivery', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 110 }}>
                  {renderHeaderWithFilter('Avg Rework %', 'avg_rework', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 90 }}>
                  {renderHeaderWithFilter('Rework %', 'rework_percent', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 90 }}>
                  {renderHeaderWithFilter('Avg Rating', 'avg_rating', true)}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#4f46e5', color: 'white', minWidth: 120 }}>
                  {renderHeaderWithFilter('Merged Exp. AHT', 'merged_exp_aht', true)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.map((podLead, idx) => (
                <PodLeadRow 
                  key={idx} 
                  podLead={podLead} 
                  colorSettings={effectiveColorSettings} 
                  applyColors={applyColorsToPod}
                  applyColorsToChildren={applyColorsToTrainer}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

export default PodLeadTab
