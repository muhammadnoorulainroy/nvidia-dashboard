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
  Collapse,
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
  InfoOutlined as InfoOutlinedIcon,
} from '@mui/icons-material'
import Tooltip from '@mui/material/Tooltip'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { getPodLeadStats, PodLeadStats, TrainerUnderPod } from '../../services/api'
import { exportReviewerWithTrainersToExcel } from '../../utils/exportToExcel'
import ColorSettingsPanel, { 
  ColorSettings, 
  defaultColorSettings, 
  getBackgroundColorForValue,
  getTextColorForValue,
  getRatingColor,
  getReworkPercentColor,
  getAvgReworkPercentColor,
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
  const approvedTasks = trainer.approved_tasks || 0
  const approvedRework = trainer.approved_rework || 0
  const deliveredTasks = trainer.delivered_tasks || 0
  const inDeliveryQueue = trainer.in_delivery_queue || 0
  const avgRework = trainer.avg_rework
  const reworkPercent = trainer.rework_percent
  const avgRating = trainer.avg_rating
  const mergedExpAht = trainer.merged_exp_aht

  // Get specific colors based on business rules
  const ratingColor = applyColors ? getRatingColor(avgRating) : { bg: 'transparent', text: '#1E293B' }
  const reworkColor = applyColors ? getReworkPercentColor(reworkPercent) : { bg: 'transparent', text: '#1E293B' }
  const avgReworkColor = applyColors ? getAvgReworkPercentColor(avgRework) : { bg: 'transparent', text: '#1E293B' }

  return (
    <TableRow sx={{ backgroundColor: '#FAFBFC', '&:hover': { backgroundColor: '#F1F5F9' }, borderLeft: '3px solid #E2E8F0' }}>
      <TableCell sx={{ 
        borderBottom: '1px solid #F1F5F9',
        position: 'sticky',
        left: 0,
        zIndex: 1,
        bgcolor: '#FAFBFC',
        borderRight: '2px solid #E2E8F0',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#94A3B8', flexShrink: 0 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#475569', fontSize: '0.8125rem' }}>
              {trainer.trainer_name || 'Unknown'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.7rem' }}>
              {trainer.trainer_email}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Chip size="small" label={trainer.status || 'Unknown'} color={getStatusColor(trainer.status)} sx={{ fontSize: '0.7rem' }} />
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {tasksReviewed}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {newTasksReviewed}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {reworkReviewed}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {totalReviews}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {approvedTasks}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#8B5CF6', fontSize: '0.8125rem' }}>
          {approvedRework}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#10B981', fontSize: '0.8125rem' }}>
          {deliveredTasks}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F59E0B', fontSize: '0.8125rem' }}>
          {inDeliveryQueue}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: avgReworkColor.bg, borderBottom: '1px solid #F1F5F9' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: avgReworkColor.text, fontSize: '0.8125rem' }}>
          {avgRework !== null && avgRework !== undefined ? avgRework.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: reworkColor.bg, borderBottom: '1px solid #F1F5F9' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: reworkColor.text, fontSize: '0.8125rem' }}>
          {reworkPercent !== null && reworkPercent !== undefined ? `${Math.round(reworkPercent)}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: ratingColor.bg, borderBottom: '1px solid #F1F5F9' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: ratingColor.text, fontSize: '0.8125rem' }}>
          {avgRating !== null && avgRating !== undefined ? avgRating.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {mergedExpAht !== null && mergedExpAht !== undefined ? mergedExpAht.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {trainer.jibble_hours !== null && trainer.jibble_hours !== undefined ? trainer.jibble_hours.toFixed(1) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ color: '#94A3B8', fontSize: '0.8125rem' }}>-</Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {trainer.aht_submission !== null && trainer.aht_submission !== undefined ? trainer.aht_submission.toFixed(2) : '-'}
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
  const approvedTasks = podLead.approved_tasks || 0
  const approvedRework = podLead.approved_rework || 0
  const deliveredTasks = podLead.delivered_tasks || 0
  const inDeliveryQueue = podLead.in_delivery_queue || 0
  const avgRework = podLead.avg_rework
  const reworkPercent = podLead.rework_percent
  const avgRating = podLead.avg_rating
  const mergedExpAht = podLead.merged_exp_aht

  // Get specific color based on metric type with business rules
  const getMetricColor = (metric: string, value: any) => {
    if (!applyColors) return { bg: 'transparent', text: '#1E293B' }
    
    switch (metric) {
      case 'rating':
        return getRatingColor(value)
      case 'rework_percent':
        return getReworkPercentColor(value)
      case 'avg_rework':
        return getAvgReworkPercentColor(value)
      default:
        return { bg: 'transparent', text: '#1E293B' }
    }
  }

  const ratingColor = getMetricColor('rating', avgRating)
  const reworkColor = getMetricColor('rework_percent', reworkPercent)
  const avgReworkColor = getMetricColor('avg_rework', avgRework)

  return (
    <>
      <TableRow 
        sx={{ 
          backgroundColor: '#FFFFFF',
          cursor: hasTrainers ? 'pointer' : 'default',
          '&:hover': { backgroundColor: '#F8FAFC' },
          borderLeft: open ? '3px solid #3B82F6' : '3px solid transparent',
          transition: 'all 0.15s ease',
        }}
        onClick={() => hasTrainers && setOpen(!open)}
      >
        <TableCell sx={{ 
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          left: 0,
          zIndex: 1,
          bgcolor: '#FFFFFF',
          borderRight: '2px solid #E2E8F0',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasTrainers && (
              <IconButton size="small" sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
                {open ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}
              </IconButton>
            )}
            {!hasTrainers && <Box sx={{ width: 32 }} />}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
                {podLead.pod_lead_name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.7rem' }}>
                {podLead.pod_lead_email}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0', minWidth: 100 }}>
          <Typography variant="caption" sx={{ 
            bgcolor: '#EEF2FF', 
            color: '#4F46E5',
            px: 1.5, 
            py: 0.25, 
            borderRadius: 1,
            fontWeight: 600,
            fontSize: '0.7rem',
            whiteSpace: 'nowrap',
            display: 'inline-block',
          }}>
            {podLead.trainer_count} trainers
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {tasksReviewed}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {newTasksReviewed}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {reworkReviewed}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {totalReviews}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {approvedTasks}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#8B5CF6', fontSize: '0.875rem' }}>
            {approvedRework}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#10B981', fontSize: '0.875rem' }}>
            {deliveredTasks}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#F59E0B', fontSize: '0.875rem' }}>
            {inDeliveryQueue}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: avgReworkColor.bg, borderBottom: '1px solid #E2E8F0' }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: avgReworkColor.text, fontSize: '0.875rem' }}>
            {avgRework !== null && avgRework !== undefined ? avgRework.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: reworkColor.bg, borderBottom: '1px solid #E2E8F0' }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: reworkColor.text, fontSize: '0.875rem' }}>
            {reworkPercent !== null && reworkPercent !== undefined ? `${Math.round(reworkPercent)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: ratingColor.bg, borderBottom: '1px solid #E2E8F0' }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: ratingColor.text, fontSize: '0.875rem' }}>
            {avgRating !== null && avgRating !== undefined ? avgRating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {mergedExpAht !== null && mergedExpAht !== undefined ? mergedExpAht.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {podLead.jibble_hours !== null && podLead.jibble_hours !== undefined ? podLead.jibble_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {podLead.total_trainer_hours !== null && podLead.total_trainer_hours !== undefined ? podLead.total_trainer_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
            {podLead.aht_submission !== null && podLead.aht_submission !== undefined ? podLead.aht_submission.toFixed(2) : '-'}
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

// Project options for dropdown
const projectOptions = [
  { id: undefined, name: 'All Projects' },
  { id: 36, name: 'Nvidia - SysBench' },
  { id: 37, name: 'Nvidia - CFBench Multilingual' },
  { id: 38, name: 'Nvidia - InverseIFEval' },
  { id: 39, name: 'Nvidia - Multichallenge' },
]

export function PodLeadTab() {
  const [data, setData] = useState<PodLeadStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  
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
  }, [timeframe, customStartDate, customEndDate, selectedProject])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getDateRange(timeframe, customStartDate, customEndDate)
      const result = await getPodLeadStats(startDate, endDate, timeframe, selectedProject)
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
      const numericColumns = ['unique_tasks', 'new_tasks', 'rework', 'total_reviews', 'approved_tasks', 'approved_rework', 'delivered_tasks', 'in_delivery_queue', 'avg_rework', 'rework_percent', 'avg_rating', 'merged_exp_aht']
      
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

  // Render column header with dropdown and tooltip
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
            visibility: 'visible !important',
            opacity: '1 !important',
            '&:hover': { color: '#64748B' } 
          }} 
          onClick={(e) => e.stopPropagation()}
        />
      </Tooltip>
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
      approved_tasks: pod.approved_tasks,
      approved_rework: pod.approved_rework,
      delivered_tasks: pod.delivered_tasks,
      in_delivery_queue: pod.in_delivery_queue,
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
        approved_tasks: t.approved_tasks,
        approved_rework: t.approved_rework,
        delivered_tasks: t.delivered_tasks,
        in_delivery_queue: t.in_delivery_queue,
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
    approvedTasks: filteredData.reduce((sum, pod) => sum + (pod.approved_tasks || 0), 0),
    approvedRework: filteredData.reduce((sum, pod) => sum + (pod.approved_rework || 0), 0),
    deliveredTasks: filteredData.reduce((sum, pod) => sum + (pod.delivered_tasks || 0), 0),
    inDeliveryQueue: filteredData.reduce((sum, pod) => sum + (pod.in_delivery_queue || 0), 0),
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
      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 2.5 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Project</InputLabel>
            <Select
              value={selectedProject ?? ''}
              label="Project"
              onChange={(e) => setSelectedProject(e.target.value === '' ? undefined : Number(e.target.value))}
            >
              {projectOptions.map((proj) => (
                <MenuItem key={proj.id ?? 'all'} value={proj.id ?? ''}>
                  {proj.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
          <Chip label={`${totals.approvedTasks} Approved`} variant="outlined" />
          <Chip label={`${totals.approvedRework} Appr. Rework`} variant="outlined" sx={{ bgcolor: '#EDE9FE', color: '#6D28D9' }} />
          <Chip label={`${totals.deliveredTasks} Delivered`} variant="outlined" sx={{ bgcolor: '#D1FAE5', color: '#065F46' }} />
          <Chip label={`${totals.inDeliveryQueue} In Queue`} variant="outlined" sx={{ bgcolor: '#FEF3C7', color: '#92400E' }} />
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

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1800 }}>
            <TableHead>
              <TableRow>
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
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('POD Lead / Trainer', 'pod_lead_name', false)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', whiteSpace: 'nowrap' }}>
                  {renderHeaderWithFilter('Count', 'trainer_count', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Unique Tasks', 'unique_tasks', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('New Tasks', 'new_tasks', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Rework', 'rework', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Total Reviews', 'total_reviews', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Approved', 'approved_tasks', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 95, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Appr. Rework', 'approved_rework', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Delivered', 'delivered_tasks', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('In Queue', 'in_delivery_queue', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Avg Rework', 'avg_rework', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Rework %', 'rework_percent', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Avg Rating', 'avg_rating', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 120, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Merged Exp. AHT', 'merged_exp_aht', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('POD Lead Hrs', 'jibble_hours', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Total Trainer Hrs', 'total_trainer_hours', true)}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('AHT/Submission', 'aht_submission', true)}
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
