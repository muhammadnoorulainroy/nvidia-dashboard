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
  ArrowDropDown as ArrowDropDownIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  FilterList as FilterListIcon,
  Folder as FolderIcon,
  InfoOutlined as InfoOutlinedIcon,
  Sort as SortIcon,
} from '@mui/icons-material'
import Tooltip from '@mui/material/Tooltip'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { getProjectStats, ProjectStats, PodLeadUnderProject } from '../../services/api'
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

// POD Lead Row Component
function PodLeadRow({ 
  podLead, 
  colorSettings,
  applyColors = true
}: { 
  podLead: PodLeadUnderProject
  colorSettings: ColorSettings
  applyColors?: boolean
}) {
  const getColor = (metric: string, value: number | null) => {
    if (!applyColors || value === null || value === undefined) return 'transparent'
    const config = colorSettings[metric]
    if (!config) return 'transparent'
    return getBackgroundColorForValue(value, config)
  }

  const getTextColor = (metric: string, value: number | null) => {
    if (!applyColors || value === null || value === undefined) return '#475569'
    const config = colorSettings[metric]
    if (!config) return '#475569'
    return getTextColorForValue(value, config)
  }

  return (
    <TableRow sx={{ 
      bgcolor: '#FAFBFC',
      '&:hover': { bgcolor: '#F1F5F9' },
      borderLeft: '3px solid #E2E8F0',
    }}>
      <TableCell sx={{ 
        pl: 6, 
        borderBottom: '1px solid #F1F5F9',
        position: 'sticky',
        left: 0,
        zIndex: 1,
        bgcolor: '#FAFBFC',
        borderRight: '2px solid #E2E8F0',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ 
            width: 6, 
            height: 6, 
            borderRadius: '50%', 
            bgcolor: '#94A3B8',
            flexShrink: 0,
          }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#475569', fontSize: '0.8125rem' }}>
              {podLead.pod_lead_name}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.7rem' }}>
              {podLead.pod_lead_email}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="caption" sx={{ 
          color: '#64748B', 
          fontSize: '0.75rem',
          fontWeight: 500,
        }}>
          {podLead.trainer_count} trainers
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('tasks_reviewed', podLead.unique_tasks), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('tasks_reviewed', podLead.unique_tasks), fontSize: '0.8125rem' }}>
          {podLead.unique_tasks}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('new_tasks_reviewed', podLead.new_tasks), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('new_tasks_reviewed', podLead.new_tasks), fontSize: '0.8125rem' }}>
          {podLead.new_tasks}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('rework_reviewed', podLead.rework), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('rework_reviewed', podLead.rework), fontSize: '0.8125rem' }}>
          {podLead.rework}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('total_reviews', podLead.total_reviews), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('total_reviews', podLead.total_reviews), fontSize: '0.8125rem' }}>
          {podLead.total_reviews}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('avg_rework', podLead.avg_rework), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('avg_rework', podLead.avg_rework), fontSize: '0.8125rem' }}>
          {podLead.avg_rework !== null ? podLead.avg_rework.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('rework_percent', podLead.rework_percent), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('rework_percent', podLead.rework_percent), fontSize: '0.8125rem' }}>
          {podLead.rework_percent !== null ? `${podLead.rework_percent}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ bgcolor: getColor('merged_exp_aht', podLead.merged_exp_aht), borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: getTextColor('merged_exp_aht', podLead.merged_exp_aht), fontSize: '0.8125rem' }}>
          {podLead.merged_exp_aht !== null ? podLead.merged_exp_aht.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {(podLead.trainer_jibble_hours + podLead.pod_jibble_hours).toFixed(1)}
        </Typography>
      </TableCell>
      <TableCell align="left" sx={{ borderBottom: '1px solid #F1F5F9' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', fontSize: '0.8125rem' }}>
          {podLead.pod_jibble_hours !== null && podLead.pod_jibble_hours !== undefined ? podLead.pod_jibble_hours.toFixed(1) : '-'}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

// Project Row Component
function ProjectRow({ 
  project, 
  colorSettings, 
  applyColors = true,
  applyColorsToPodLeads = true
}: { 
  project: ProjectStats
  colorSettings: ColorSettings
  applyColors?: boolean
  applyColorsToPodLeads?: boolean
}) {
  const [open, setOpen] = useState(false)
  const hasPodLeads = project.pod_leads && project.pod_leads.length > 0

  const getColor = (metric: string, value: number | null) => {
    if (!applyColors || value === null || value === undefined) return 'transparent'
    const config = colorSettings[metric]
    if (!config) return 'transparent'
    return getBackgroundColorForValue(value, config)
  }

  const getTextColor = (metric: string, value: number | null) => {
    if (!applyColors || value === null || value === undefined) return '#1E293B'
    const config = colorSettings[metric]
    if (!config) return '#1E293B'
    return getTextColorForValue(value, config)
  }

  return (
    <>
      <TableRow 
        sx={{ 
          '&:hover': { bgcolor: '#F8FAFC' },
          bgcolor: open ? '#F1F5F9' : '#FFFFFF',
          cursor: hasPodLeads ? 'pointer' : 'default',
          borderLeft: open ? '3px solid #3B82F6' : '3px solid transparent',
          transition: 'all 0.15s ease',
        }}
        onClick={() => hasPodLeads && setOpen(!open)}
      >
        <TableCell sx={{ 
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          left: 0,
          zIndex: 1,
          bgcolor: open ? '#F1F5F9' : '#FFFFFF',
          borderRight: '2px solid #E2E8F0',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasPodLeads && (
              <IconButton 
                size="small" 
                onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
                sx={{ 
                  bgcolor: open ? '#E0E7FF' : '#F1F5F9',
                  width: 28,
                  height: 28,
                  '&:hover': { bgcolor: '#E0E7FF' },
                }}
              >
                {open ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}
              </IconButton>
            )}
            {!hasPodLeads && <Box sx={{ width: 28 }} />}
            <Box sx={{ 
              width: 36, 
              height: 36, 
              borderRadius: 1.5,
              bgcolor: '#F0FDF4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #D1FAE5',
            }}>
              <FolderIcon sx={{ color: '#10B981', fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
                {project.project_name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.7rem' }}>
                ID: {project.project_id}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#4F46E5', fontSize: '0.8125rem' }}>
              {project.pod_lead_count}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.65rem', lineHeight: 1 }}>
              {project.trainer_count} trainers
            </Typography>
          </Box>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('tasks_reviewed', project.unique_tasks), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('tasks_reviewed', project.unique_tasks), fontSize: '0.875rem' }}>
            {project.unique_tasks}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('new_tasks_reviewed', project.new_tasks), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('new_tasks_reviewed', project.new_tasks), fontSize: '0.875rem' }}>
            {project.new_tasks}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('rework_reviewed', project.rework), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('rework_reviewed', project.rework), fontSize: '0.875rem' }}>
            {project.rework}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('total_reviews', project.total_reviews), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('total_reviews', project.total_reviews), fontSize: '0.875rem' }}>
            {project.total_reviews}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('avg_rework', project.avg_rework), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('avg_rework', project.avg_rework), fontSize: '0.875rem' }}>
            {project.avg_rework !== null ? project.avg_rework.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('rework_percent', project.rework_percent), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('rework_percent', project.rework_percent), fontSize: '0.875rem' }}>
            {project.rework_percent !== null ? `${project.rework_percent}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ bgcolor: getColor('merged_exp_aht', project.merged_exp_aht), borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: getTextColor('merged_exp_aht', project.merged_exp_aht), fontSize: '0.875rem' }}>
            {project.merged_exp_aht !== null ? project.merged_exp_aht.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1E293B', fontSize: '0.875rem' }}>
            {project.logged_hours !== null && project.logged_hours !== undefined ? project.logged_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="left" sx={{ borderBottom: '1px solid #E2E8F0' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1E293B', fontSize: '0.875rem' }}>
            {project.total_pod_hours !== null && project.total_pod_hours !== undefined ? project.total_pod_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
      </TableRow>
      
      {/* POD Leads under this Project */}
      {hasPodLeads && open && project.pod_leads.map((podLead, idx) => (
        <PodLeadRow 
          key={idx} 
          podLead={podLead} 
          colorSettings={colorSettings} 
          applyColors={applyColorsToPodLeads} 
        />
      ))}
    </>
  )
}

export function ProjectsTab() {
  const [data, setData] = useState<ProjectStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  
  const [colorSettings, setColorSettings] = useColorSettings('projectsColorSettings')
  const [colorApplyLevel, setColorApplyLevel] = useState<ColorApplyLevel>('both')
  
  const effectiveColorSettings: ColorSettings = colorSettings && Object.keys(colorSettings).length > 0 
    ? colorSettings 
    : defaultColorSettings
  
  const applyColorsToProject = colorApplyLevel === 'both' || colorApplyLevel === 'parent'
  const applyColorsToPodLeads = colorApplyLevel === 'both' || colorApplyLevel === 'child'

  useEffect(() => {
    fetchData()
  }, [timeframe, customStartDate, customEndDate])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getDateRange(timeframe, customStartDate, customEndDate)
      const result = await getProjectStats(startDate, endDate)
      setData(result)
    } catch (err) {
      setError('Failed to fetch Project stats')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredData = data.filter(project =>
    project.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.pod_leads.some(pl => 
      pl.pod_lead_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pl.pod_lead_email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  // Sort the filtered data
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    
    let aVal: any
    let bVal: any
    
    switch (sortColumn) {
      case 'project_name':
        aVal = a.project_name || ''
        bVal = b.project_name || ''
        break
      case 'count':
        aVal = a.pod_lead_count
        bVal = b.pod_lead_count
        break
      case 'unique_tasks':
        aVal = a.unique_tasks ?? 0
        bVal = b.unique_tasks ?? 0
        break
      case 'new_tasks':
        aVal = a.new_tasks ?? 0
        bVal = b.new_tasks ?? 0
        break
      case 'rework':
        aVal = a.rework ?? 0
        bVal = b.rework ?? 0
        break
      case 'total_reviews':
        aVal = a.total_reviews ?? 0
        bVal = b.total_reviews ?? 0
        break
      case 'avg_rework':
        aVal = a.avg_rework ?? -Infinity
        bVal = b.avg_rework ?? -Infinity
        break
      case 'rework_percent':
        aVal = a.rework_percent ?? -Infinity
        bVal = b.rework_percent ?? -Infinity
        break
      case 'merged_exp_aht':
        aVal = a.merged_exp_aht ?? -Infinity
        bVal = b.merged_exp_aht ?? -Infinity
        break
      case 'logged_hours':
        aVal = a.logged_hours ?? 0
        bVal = b.logged_hours ?? 0
        break
      case 'total_pod_hours':
        aVal = a.total_pod_hours ?? 0
        bVal = b.total_pod_hours ?? 0
        break
      default:
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

  // Render column header with dropdown and tooltip
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

  const handleExport = () => {
    // Flatten data for export
    const exportData: any[] = []
    
    filteredData.forEach(project => {
      // Add project row
      exportData.push({
        type: 'Project',
        name: project.project_name,
        unique_tasks: project.unique_tasks,
        new_tasks: project.new_tasks,
        rework: project.rework,
        total_reviews: project.total_reviews,
        avg_rework: project.avg_rework,
        rework_percent: project.rework_percent,
        merged_exp_aht: project.merged_exp_aht,
      })
      
      // Add POD Lead rows
      project.pod_leads.forEach(pl => {
        exportData.push({
          type: 'POD Lead',
          name: pl.pod_lead_name,
          unique_tasks: pl.unique_tasks,
          new_tasks: pl.new_tasks,
          rework: pl.rework,
          total_reviews: pl.total_reviews,
          avg_rework: pl.avg_rework,
          rework_percent: pl.rework_percent,
          merged_exp_aht: pl.merged_exp_aht,
        })
      })
    })
    
    const timestamp = new Date().toISOString().split('T')[0]
    // Simple excel export
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Projects')
      XLSX.writeFile(wb, `Project_Stats_${timeframe}_${timestamp}.xlsx`)
    })
  }

  // Calculate totals
  const totals = {
    projects: sortedData.length,
    podLeads: sortedData.reduce((sum, p) => sum + p.pod_lead_count, 0),
    trainers: sortedData.reduce((sum, p) => sum + p.trainer_count, 0),
    uniqueTasks: sortedData.reduce((sum, p) => sum + p.unique_tasks, 0),
    newTasks: sortedData.reduce((sum, p) => sum + p.new_tasks, 0),
    rework: sortedData.reduce((sum, p) => sum + p.rework, 0),
    totalReviews: sortedData.reduce((sum, p) => sum + p.total_reviews, 0),
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
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>Timeframe</InputLabel>
            <Select
              value={timeframe}
              label="Timeframe"
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              sx={{ 
                fontSize: '0.8125rem',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E8F0' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' },
              }}
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
                sx={{ 
                  width: 150,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E8F0' },
                }}
              />
              <TextField
                size="small"
                type="date"
                label="End Date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ 
                  width: 150,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E8F0' },
                }}
              />
            </>
          )}

          <TextField
            size="small"
            placeholder="Search Project or POD Lead..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ 
              minWidth: 250,
              '& .MuiOutlinedInput-root': {
                fontSize: '0.8125rem',
                '& fieldset': { borderColor: '#E2E8F0' },
                '&:hover fieldset': { borderColor: '#CBD5E1' },
              },
            }}
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
              'avg_rework',
              'rework_percent',
              'merged_exp_aht'
            ]}
            applyLevel={colorApplyLevel}
            onApplyLevelChange={setColorApplyLevel}
          />

          <Button
            variant="contained"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />}
            onClick={handleExport}
            sx={{
              bgcolor: '#10B981',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2.5,
              boxShadow: 'none',
              '&:hover': { 
                bgcolor: '#059669',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              },
            }}
          >
            Export
          </Button>
        </Box>

        {/* Summary */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#F0FDF4', 
            borderRadius: 1.5,
            border: '1px solid #D1FAE5',
          }}>
            <Typography variant="caption" sx={{ color: '#065F46', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.projects}
            </Typography>
            <Typography variant="caption" sx={{ color: '#047857', fontSize: '0.75rem' }}>
              Projects
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#EEF2FF', 
            borderRadius: 1.5,
            border: '1px solid #C7D2FE',
          }}>
            <Typography variant="caption" sx={{ color: '#3730A3', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.podLeads}
            </Typography>
            <Typography variant="caption" sx={{ color: '#4F46E5', fontSize: '0.75rem' }}>
              POD Leads
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#FDF4FF', 
            borderRadius: 1.5,
            border: '1px solid #F5D0FE',
          }}>
            <Typography variant="caption" sx={{ color: '#86198F', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.trainers}
            </Typography>
            <Typography variant="caption" sx={{ color: '#A21CAF', fontSize: '0.75rem' }}>
              Trainers
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#F8FAFC', 
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
          }}>
            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.uniqueTasks.toLocaleString()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
              Unique Tasks
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#F8FAFC', 
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
          }}>
            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.newTasks.toLocaleString()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
              New Tasks
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#F8FAFC', 
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
          }}>
            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.rework.toLocaleString()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
              Rework
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            px: 2, 
            py: 0.75, 
            bgcolor: '#F8FAFC', 
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
          }}>
            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, fontSize: '0.8125rem' }}>
              {totals.totalReviews.toLocaleString()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
              Total Reviews
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1400 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  fontWeight: 600, 
                  bgcolor: '#F8FAFC', 
                  color: '#334155', 
                  minWidth: 250,
                  borderBottom: '2px solid #E2E8F0',
                  fontSize: '0.8125rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.025em',
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  {renderHeaderWithFilter('Project / POD Lead', 'project_name')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('POD Leads', 'count')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Unique Tasks', 'unique_tasks')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('New Tasks', 'new_tasks')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 80, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Rework', 'rework')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Total Reviews', 'total_reviews')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 100, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Avg Rework', 'avg_rework')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 90, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Rework %', 'rework_percent')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 120, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Merged Exp. AHT', 'merged_exp_aht')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Logged Hours', 'logged_hours')}
                </TableCell>
                <TableCell align="left" sx={{ fontWeight: 600, bgcolor: '#F8FAFC', color: '#334155', minWidth: 110, borderBottom: '2px solid #E2E8F0', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  {renderHeaderWithFilter('Total POD Hrs', 'total_pod_hours')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((project, idx) => (
                <ProjectRow 
                  key={idx} 
                  project={project} 
                  colorSettings={effectiveColorSettings} 
                  applyColors={applyColorsToProject}
                  applyColorsToPodLeads={applyColorsToPodLeads}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Sort Popover */}
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
          <Box sx={{ minWidth: 280 }}>
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
                onClick={() => {
                  setSortColumn(activeFilterColumn)
                  setSortDirection('asc')
                  setFilterAnchorEl(null)
                  setActiveFilterColumn('')
                }}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon>
                  <ArrowUpwardIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort Ascending</ListItemText>
              </MenuItem>
              
              <MenuItem
                onClick={() => {
                  setSortColumn(activeFilterColumn)
                  setSortDirection('desc')
                  setFilterAnchorEl(null)
                  setActiveFilterColumn('')
                }}
                sx={{ borderRadius: 1 }}
              >
                <ListItemIcon>
                  <ArrowDownwardIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort Descending</ListItemText>
              </MenuItem>
            </Box>

            <Divider />

            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setSortColumn('')
                  setSortDirection('asc')
                  setFilterAnchorEl(null)
                  setActiveFilterColumn('')
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
                Reset
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
                Close
              </Button>
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  )
}

export default ProjectsTab
