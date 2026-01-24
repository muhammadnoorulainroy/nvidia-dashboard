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
} from '@mui/icons-material'
import { getProjectStats, ProjectStats, PodLeadUnderProject } from '../../services/api'
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
    return getBackgroundColorForValue(value, config.min, config.max, config.colorScale)
  }

  return (
    <TableRow sx={{ bgcolor: '#F3F4F6' }}>
      <TableCell sx={{ pl: 6 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, color: '#4B5563' }}>
          ↳ {podLead.pod_lead_name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {podLead.pod_lead_email}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Chip 
          label={`${podLead.trainer_count} trainers`}
          size="small"
          sx={{ bgcolor: '#E5E7EB', fontSize: '0.7rem' }}
        />
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('tasks_reviewed', podLead.unique_tasks) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.unique_tasks}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('new_tasks_reviewed', podLead.new_tasks) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.new_tasks}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('rework_reviewed', podLead.rework) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.rework}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('total_reviews', podLead.total_reviews) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.total_reviews}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('avg_rework', podLead.avg_rework) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.avg_rework !== null ? `${podLead.avg_rework}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('rework_percent', podLead.rework_percent) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.rework_percent !== null ? `${podLead.rework_percent}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ bgcolor: getColor('merged_exp_aht', podLead.merged_exp_aht) }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {podLead.merged_exp_aht !== null ? podLead.merged_exp_aht.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
          {(podLead.trainer_jibble_hours + podLead.pod_jibble_hours).toFixed(1)}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
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
    return getBackgroundColorForValue(value, config.min, config.max, config.colorScale)
  }

  return (
    <>
      <TableRow 
        sx={{ 
          '&:hover': { bgcolor: '#F0FDF4' },
          bgcolor: open ? '#ECFDF5' : 'inherit',
          cursor: hasPodLeads ? 'pointer' : 'default'
        }}
        onClick={() => hasPodLeads && setOpen(!open)}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasPodLeads && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
                {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
              </IconButton>
            )}
            <FolderIcon sx={{ color: '#10B981', mr: 1 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
                {project.project_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {project.project_id}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center">
          <Box>
            <Chip 
              label={`${project.pod_lead_count} POD Leads`}
              size="small"
              color="primary"
              sx={{ fontSize: '0.7rem', mb: 0.5 }}
            />
            <Typography variant="caption" display="block" color="text.secondary">
              {project.trainer_count} trainers
            </Typography>
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('tasks_reviewed', project.unique_tasks) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.unique_tasks}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('new_tasks_reviewed', project.new_tasks) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.new_tasks}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('rework_reviewed', project.rework) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.rework}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('total_reviews', project.total_reviews) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.total_reviews}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('avg_rework', project.avg_rework) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.avg_rework !== null ? `${project.avg_rework}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('rework_percent', project.rework_percent) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.rework_percent !== null ? `${project.rework_percent}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ bgcolor: getColor('merged_exp_aht', project.merged_exp_aht) }}>
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.merged_exp_aht !== null ? project.merged_exp_aht.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
            {project.logged_hours !== null && project.logged_hours !== undefined ? project.logged_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1F2937' }}>
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
    projects: filteredData.length,
    podLeads: filteredData.reduce((sum, p) => sum + p.pod_lead_count, 0),
    trainers: filteredData.reduce((sum, p) => sum + p.trainer_count, 0),
    uniqueTasks: filteredData.reduce((sum, p) => sum + p.unique_tasks, 0),
    newTasks: filteredData.reduce((sum, p) => sum + p.new_tasks, 0),
    rework: filteredData.reduce((sum, p) => sum + p.rework, 0),
    totalReviews: filteredData.reduce((sum, p) => sum + p.total_reviews, 0),
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
            placeholder="Search Project or POD Lead..."
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
              'avg_rework',
              'rework_percent',
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
          <Chip label={`${totals.projects} Projects`} color="success" />
          <Chip label={`${totals.podLeads} POD Leads`} color="primary" />
          <Chip label={`${totals.trainers} Trainers`} color="secondary" />
          <Chip label={`${totals.uniqueTasks} Unique Tasks`} variant="outlined" />
          <Chip label={`${totals.newTasks} New Tasks`} variant="outlined" />
          <Chip label={`${totals.rework} Rework`} variant="outlined" />
          <Chip label={`${totals.totalReviews} Total Reviews`} variant="outlined" />
        </Box>
      </Paper>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 250 }}>
                  Project / POD Lead
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 120 }}>
                  Count
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 100 }}>
                  Unique Tasks
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 90 }}>
                  New Tasks
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 80 }}>
                  Rework
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 100 }}>
                  Total Reviews
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 110 }}>
                  Avg Rework %
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 90 }}>
                  Rework %
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 120 }}>
                  Merged Exp. AHT
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 110 }}>
                  Logged Hours
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#10B981', color: 'white', minWidth: 110 }}>
                  Total POD Hrs
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.map((project, idx) => (
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
    </Box>
  )
}

export default ProjectsTab
