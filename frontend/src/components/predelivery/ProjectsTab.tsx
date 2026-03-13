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
  Button,
  Menu,
  Divider,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  TableSortLabel,
} from '@mui/material'
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Download as DownloadIcon,
  ArrowDropDown as ArrowDropDownIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Folder as FolderIcon,
  Sort as SortIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { getProjectStats, getJibbleProjectHours, JibbleUserHours, ProjectStats, PodLeadUnderProject, TrainerUnderPodLead, TaskUnderTrainer } from '../../services/api'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { FormControl, InputLabel, Select, SelectChangeEvent } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AssignmentIcon from '@mui/icons-material/Assignment'
import { Timeframe, getDateRange as getDateRangeUtil } from '../../utils/dateUtils'
import TimeframeSelector from '../common/TimeframeSelector'
import ColorSettingsPanel, { 
  ColorSettings, 
  defaultColorSettings, 
  useColorSettings,
  ColorApplyLevel
} from './ColorSettingsPanel'

// Column group definitions with professional colors
const COLUMN_GROUPS = {
  overview: { 
    label: 'Overview', 
    bgHeader: '#F1F5F9', 
    bgSubHeader: '#F8FAFC',
    borderColor: '#CBD5E1',
    textColor: '#475569'
  },
  tasks: { 
    label: 'Tasks', 
    bgHeader: '#EFF6FF', 
    bgSubHeader: '#F0F9FF',
    borderColor: '#93C5FD',
    textColor: '#1E40AF'
  },
  quality: { 
    label: 'Quality', 
    bgHeader: '#F0FDF4', 
    bgSubHeader: '#F0FDF4',
    borderColor: '#86EFAC',
    textColor: '#166534'
  },
  time: { 
    label: 'Time & Efficiency', 
    bgHeader: '#FFFBEB', 
    bgSubHeader: '#FFFBEB',
    borderColor: '#FCD34D',
    textColor: '#92400E'
  },
  finance: {
    label: 'Finance',
    bgHeader: '#FDF2F8',
    bgSubHeader: '#FDF4FF',
    borderColor: '#F0ABFC',
    textColor: '#86198F'
  },
}

// Responsive common cell styles - compact for all screens
const cellStyle = {
  py: { xs: 0.2, sm: 0.3, md: 0.35 },
  px: { xs: 0.3, sm: 0.5, md: 0.6 },
  fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap' as const,
}

const headerCellStyle = {
  py: { xs: 0.25, sm: 0.35, md: 0.4 },
  px: { xs: 0.25, sm: 0.35, md: 0.4 },
  fontWeight: 600,
  fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.58rem' },
  textTransform: 'uppercase' as const,
  letterSpacing: '0.01em',
  lineHeight: 1.1,
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap' as const,
}

function getDateRange(timeframe: Timeframe, weekOffset: number, customStart?: string, customEnd?: string) {
  const { startDate, endDate } = getDateRangeUtil(timeframe, weekOffset, customStart, customEnd)
  return { startDate, endDate }
}

// ============================================================================
// COLOR CODING BASED ON PMO REQUIREMENTS
// These metrics should be color-coded:
// 1. Efficiency (EFF%): >=90% Green, 70-90% Yellow, <70% Red
// 2. Ratings (RATE): >4.8 Green, 4-4.8 Yellow, <4 Red  
// 3. Rework % (R%): <=10% Green, 10-30% Yellow, >30% Red (LOWER IS BETTER)
// 4. Avg Rework (AVGR): <1 Green, 1-2.5 Yellow, >2.5 Red (LOWER IS BETTER)
// ============================================================================

// Color coding: only highlight red for bad performance, leave good/neutral as default
const noStyle = { color: undefined, bgcolor: 'transparent' }
const redStyle = { color: '#991B1B', bgcolor: '#FEE2E2' }

// Ratings: <4 is red
const getRatingStyle = (rating: number | null) => {
  if (rating === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (rating < 4) return redStyle
  return noStyle
}

// Efficiency: <70% is red
const getEfficiencyStyle = (eff: number | null) => {
  if (eff === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (eff < 70) return redStyle
  return noStyle
}

// Rework%: >30% is red (lower is better)
const getReworkPercentStyle = (rPct: number | null) => {
  if (rPct === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (rPct > 30) return redStyle
  return noStyle
}

// Average Rework: >2.5 is red (lower is better)
const getAvgReworkStyle = (avgR: number | null) => {
  if (avgR === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (avgR > 2.5) return redStyle
  return noStyle
}

// Margin%: negative is red
const getMarginStyle = (marginPct: number | null) => {
  if (marginPct === null || marginPct === undefined) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (marginPct < 0) return redStyle
  return noStyle
}

// Format currency with $ and commas, e.g. $15,622
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value === 0) return '-'
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ---------------------------------------------------------------------------
// Cascading sort helpers – reuse the top-level sortColumn/sortDirection at
// every hierarchy level (Project → POD Lead → Trainer).
// ---------------------------------------------------------------------------
type HierarchyLevel = 'project' | 'podLead' | 'trainer'

function getSortValue(item: any, sortColumn: string, level: HierarchyLevel): any {
  switch (sortColumn) {
    case 'project_name':
      if (level === 'podLead') return item.pod_lead_name ?? ''
      if (level === 'trainer') return item.trainer_name ?? ''
      return item.project_name ?? ''
    case 'size':
      if (level === 'podLead') return item.trainer_count ?? 0
      if (level === 'trainer') return 0
      return (item.trainer_count ?? 0) + (item.pod_lead_count ?? 0)
    case 'logged_hours':
      if (level === 'podLead') return (item.trainer_jibble_hours ?? 0) + (item.pod_jibble_hours ?? 0)
      if (level === 'trainer') return item.jibble_hours ?? 0
      return item.logged_hours ?? 0
    case 'total_pod_hours':
      if (level === 'podLead') return item.pod_jibble_hours ?? 0
      if (level === 'trainer') return 0
      return item.total_pod_hours ?? 0
    default: {
      const val = (item as any)[sortColumn]
      return val ?? (typeof val === 'string' ? '' : -Infinity)
    }
  }
}

function sortChildren<T>(items: T[], sortColumn: string, sortDirection: 'asc' | 'desc', level: HierarchyLevel): T[] {
  if (!sortColumn || !items || items.length === 0) return items
  return [...items].sort((a, b) => {
    const aVal = getSortValue(a, sortColumn, level)
    const bVal = getSortValue(b, sortColumn, level)
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })
}

// Responsive font sizes for data cells
const dataFontSize = { xs: '0.55rem', sm: '0.6rem', md: '0.65rem' }

// Task Row Component - displays individual task metrics under a trainer
function TaskRow({ task }: { task: TaskUnderTrainer }) {
  // Build the labeling tool URL - format: https://labeling-n.turing.com/conversations/{task_id}/view
  const labelingToolUrl = `https://labeling-n.turing.com/conversations/${task.task_id}/view`
  
  return (
    <TableRow sx={{ 
      bgcolor: '#F8FAFC',
      '&:hover': { bgcolor: '#EFF6FF' },
      borderLeft: '2px solid #E0E7FF',
    }}>
      {/* Overview Group - Task ID with link */}
      <TableCell sx={{ 
        ...cellStyle,
        pl: { xs: 4, sm: 5, md: 6 },
        position: 'sticky',
        left: 0,
        bgcolor: '#F8FAFC',
        zIndex: 1,
        borderRight: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
        maxWidth: { xs: 120, sm: 160, md: 180 },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
          <AssignmentIcon sx={{ fontSize: { xs: 8, md: 9 }, color: '#94A3B8', flexShrink: 0 }} />
          <Tooltip title="Open in Labeling Tool" arrow placement="right">
            <Box 
              component="a" 
              href={labelingToolUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.2,
                color: '#3B82F6',
                textDecoration: 'none',
                '&:hover': { textDecoration: 'underline', color: '#2563EB' },
                minWidth: 0,
                flex: 1,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.task_id}
              </Typography>
              <OpenInNewIcon sx={{ fontSize: { xs: 6, md: 7 }, opacity: 0.7 }} />
            </Box>
          </Tooltip>
        </Box>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8', borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}` }}>-</TableCell>

      {/* Tasks Group */}
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: '#94A3B8' }}>1</Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.is_new ? '#059669' : '#94A3B8' }}>
          {task.is_new ? '1' : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.rework_count > 0 ? '#DC2626' : '#94A3B8' }}>
          {task.rework_count > 0 ? task.rework_count : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.is_calibrated ? '#7C3AED' : '#94A3B8' }}>
          {task.is_calibrated ? '1' : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.calibration_passed ? '#059669' : '#94A3B8' }}>
          {task.calibration_passed ? '1' : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.task_status?.toLowerCase() === 'rework' ? '#DC2626' : '#94A3B8' }}>
          {task.task_status?.toLowerCase() === 'rework' ? 'Yes' : 'No'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.is_delivered ? '#059669' : '#94A3B8' }}>
          {task.is_delivered ? '1' : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.is_in_queue ? '#D97706' : '#94A3B8' }}>
          {task.is_in_queue ? '1' : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.tasks.borderColor}` }}>
        <Typography sx={{ fontSize: dataFontSize, color: '#94A3B8' }}>-</Typography>
      </TableCell>

      {/* Quality Group */}
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.reviews > 0 ? '#475569' : '#94A3B8' }}>
          {task.reviews > 0 ? task.reviews : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(task.avg_rating) }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500 }}>
          {task.avg_rating !== null ? task.avg_rating.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.agentic_reviews > 0 ? '#7C3AED' : '#94A3B8' }}>
          {task.agentic_reviews > 0 ? task.agentic_reviews : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(task.agentic_rating) }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500 }}>
          {task.agentic_rating !== null ? task.agentic_rating.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.quality.borderColor}`, ...getReworkPercentStyle(task.rework_percent) }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500 }}>
          {task.rework_percent !== undefined ? `${task.rework_percent}%` : '-'}
        </Typography>
      </TableCell>

      {/* Time & Efficiency Group */}
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: task.aht_mins ? '#475569' : '#94A3B8' }}>
          {task.aht_mins != null ? task.aht_mins.toFixed(1) : '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, color: '#94A3B8' }}>-</Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: '#64748B' }}>
          {task.accounted_hours?.toFixed(2) || '-'}
        </Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, color: '#94A3B8' }}>-</Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle }}>
        <Typography sx={{ fontSize: dataFontSize, color: '#94A3B8' }}>-</Typography>
      </TableCell>
      <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.time.borderColor}` }}>
        <Typography sx={{ fontSize: dataFontSize, color: '#94A3B8' }}>-</Typography>
      </TableCell>

      {/* Finance Group - N/A at task level */}
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
    </TableRow>
  )
}

// Responsive font sizes for trainer data
const trainerFontSize = { xs: '0.58rem', sm: '0.63rem', md: '0.68rem' }

// Trainer Row Component (Expandable - shows tasks underneath)
// COLOR CODING: Only RATE, R%, and EFF% should be color-coded per PMO requirements
function TrainerRow({ 
  trainer, 
  colorSettings,
  applyColors = true
}: { 
  trainer: TrainerUnderPodLead
  colorSettings: ColorSettings
  applyColors?: boolean
}) {
  const [open, setOpen] = useState(false)
  const hasTasks = trainer.tasks && trainer.tasks.length > 0
  
  return (
    <>
      <TableRow 
        sx={{ 
          bgcolor: trainer.below_target ? '#FEF2F2' : open ? '#F1F5F9' : '#FAFBFC',
          '&:hover': { bgcolor: trainer.below_target ? '#FEE2E2' : '#F1F5F9' },
          cursor: hasTasks ? 'pointer' : 'default',
          borderLeft: trainer.below_target ? '2px solid #EF4444' : open ? '2px solid #6366F1' : '2px solid transparent',
        }}
        onClick={() => hasTasks && setOpen(!open)}
      >
        {/* Overview Group */}
        <TableCell sx={{ 
          ...cellStyle,
          pl: hasTasks ? { xs: 3, sm: 4, md: 5 } : { xs: 3.5, sm: 4.5, md: 5.5 },
          position: 'sticky',
          left: 0,
          bgcolor: trainer.below_target ? '#FEF2F2' : open ? '#F1F5F9' : '#FAFBFC',
          zIndex: 1,
          borderRight: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
          maxWidth: { xs: 120, sm: 160, md: 180 },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            {hasTasks ? (
              <IconButton size="small" sx={{ p: 0.1, minWidth: { xs: 10, md: 12 } }} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
                {open ? <KeyboardArrowUp sx={{ fontSize: { xs: 8, md: 10 } }} /> : <KeyboardArrowDown sx={{ fontSize: { xs: 8, md: 10 } }} />}
              </IconButton>
            ) : <Box sx={{ width: { xs: 10, md: 12 } }} />}
            {trainer.below_target ? (
              <Tooltip title={`Below target: ${trainer.tasks_per_8hrs?.toFixed(1) ?? '0'}/${trainer.daily_target} ${trainer.role && ['POD Lead', 'Calibrator', 'Team Lead'].includes(trainer.role) ? 'reviews' : 'tasks'} per 8hrs`} arrow>
                <WarningIcon sx={{ fontSize: 10, color: '#EF4444', flexShrink: 0 }} />
              </Tooltip>
            ) : (
              <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: '#CBD5E1', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: { xs: '0.55rem', sm: '0.58rem', md: '0.62rem' }, color: trainer.below_target ? '#DC2626' : '#64748B', fontWeight: 500, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trainer.trainer_name}
              </Typography>
              <Typography sx={{ fontSize: { xs: '0.45rem', sm: '0.47rem', md: '0.5rem' }, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trainer.trainer_email}
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}` }}>
          {hasTasks ? (
            <Typography sx={{ fontSize: dataFontSize, fontWeight: 500, color: '#6366F1' }}>{trainer.tasks?.length}</Typography>
          ) : (
            <Typography sx={{ color: '#94A3B8' }}>-</Typography>
          )}
        </TableCell>

        {/* Tasks Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{trainer.target || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.unique_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.new_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.claimed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.in_progress || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.completed_current || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.reviewed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.calibrated || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.calibration_passed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{trainer.in_rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{trainer.delivered ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{trainer.in_queue ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.tasks.borderColor}`, ...getAvgReworkStyle(trainer.avg_rework) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {trainer.avg_rework !== null ? trainer.avg_rework.toFixed(2) : '-'}
          </Typography>
        </TableCell>

        {/* Quality Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>
            {trainer.total_reviews}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(trainer.avg_rating) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {trainer.avg_rating !== null ? trainer.avg_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#7C3AED' }}>
            {trainer.agentic_reviews ?? 0}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(trainer.agentic_rating) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {trainer.agentic_rating !== null ? trainer.agentic_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.quality.borderColor}`, ...getReworkPercentStyle(trainer.rework_percent) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {trainer.rework_percent !== null ? `${trainer.rework_percent}%` : '-'}
          </Typography>
        </TableCell>

        {/* Time & Efficiency Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>
            {trainer.merged_exp_aht !== null ? trainer.merged_exp_aht.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>
            {trainer.jibble_hours > 0 ? trainer.jibble_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>
            {trainer.accounted_hours > 0 ? trainer.accounted_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getEfficiencyStyle(trainer.efficiency) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 700 }}>
            {trainer.efficiency !== null ? `${trainer.efficiency.toFixed(0)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.time.borderColor}`, color: '#94A3B8' }}>-</TableCell>

        {/* Finance Group - Revenue at trainer level */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: trainer.revenue > 0 ? '#059669' : '#94A3B8' }}>
            {trainer.revenue > 0 ? formatCurrency(trainer.revenue) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      </TableRow>
      
      {/* Render Task Rows when expanded */}
      {hasTasks && open && trainer.tasks?.map((task) => (
        <TaskRow key={task.task_id} task={task} />
      ))}
    </>
  )
}

// POD Lead Row Component
// COLOR CODING: Only RATE, R%, and EFF% should be color-coded per PMO requirements
function PodLeadRow({ 
  podLead, 
  colorSettings,
  applyColors = true,
  applyColorsToTrainers = true,
  sortColumn = '',
  sortDirection = 'asc' as const,
}: { 
  podLead: PodLeadUnderProject
  colorSettings: ColorSettings
  applyColors?: boolean
  applyColorsToTrainers?: boolean
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const [open, setOpen] = useState(false)
  const hasTrainers = podLead.trainers && podLead.trainers.length > 0
  const sortedTrainers = sortChildren(podLead.trainers ?? [], sortColumn, sortDirection, 'trainer')

  return (
    <>
      <TableRow 
        sx={{ 
          bgcolor: open ? '#F1F5F9' : '#F8FAFC',
          '&:hover': { bgcolor: '#F1F5F9' },
          cursor: hasTrainers ? 'pointer' : 'default',
        }}
        onClick={() => hasTrainers && setOpen(!open)}
      >
        {/* Overview Group */}
        <TableCell sx={{ 
          ...cellStyle,
          pl: { xs: 2, sm: 3, md: 3.5 },
          position: 'sticky',
          left: 0,
          bgcolor: open ? '#F1F5F9' : '#F8FAFC',
          zIndex: 1,
          borderRight: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
          maxWidth: { xs: 120, sm: 160, md: 180 },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            {hasTrainers ? (
              <IconButton size="small" sx={{ p: 0.1, minWidth: { xs: 12, md: 14 } }} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
                {open ? <KeyboardArrowUp sx={{ fontSize: { xs: 9, md: 11 } }} /> : <KeyboardArrowDown sx={{ fontSize: { xs: 9, md: 11 } }} />}
              </IconButton>
            ) : <Box sx={{ width: { xs: 12, md: 14 } }} />}
            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: podLead.pod_lead_email === 'no_pod_lead' ? '#F59E0B' : '#8B5CF6', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <Typography sx={{ fontSize: { xs: '0.58rem', sm: '0.62rem', md: '0.66rem' }, color: podLead.pod_lead_email === 'no_pod_lead' ? '#B45309' : '#475569', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {podLead.pod_lead_name}
                </Typography>
                {podLead.pod_lead_email === 'no_pod_lead' && (
                  <Tooltip 
                    title="These trainers are not mapped to any POD Lead in the mapping sheet. Please assign them a POD Lead to organize them under the correct team."
                    arrow
                    placement="right"
                  >
                    <InfoIcon sx={{ fontSize: { xs: 9, md: 10 }, color: '#F59E0B', cursor: 'help' }} />
                  </Tooltip>
                )}
              </Box>
              {podLead.pod_lead_email !== 'no_pod_lead' && (
                <Typography sx={{ fontSize: { xs: '0.45rem', sm: '0.48rem', md: '0.52rem' }, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {podLead.pod_lead_email}
                </Typography>
              )}
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}` }}>
          <Typography sx={{ fontSize: dataFontSize, fontWeight: 600, color: '#64748B' }}>{podLead.trainer_count}</Typography>
        </TableCell>

        {/* Tasks Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{podLead.target || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.unique_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.new_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.claimed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.in_progress || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.completed_current || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.reviewed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.calibrated || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.calibration_passed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>{podLead.in_rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{podLead.delivered ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>{podLead.in_queue ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.tasks.borderColor}`, ...getAvgReworkStyle(podLead.avg_rework) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {podLead.avg_rework !== null ? podLead.avg_rework.toFixed(2) : '-'}
          </Typography>
        </TableCell>

        {/* Quality Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>
            {podLead.total_reviews}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(podLead.avg_rating) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {podLead.avg_rating !== null ? podLead.avg_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#7C3AED' }}>
            {podLead.agentic_reviews ?? 0}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(podLead.agentic_rating) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {podLead.agentic_rating !== null ? podLead.agentic_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.quality.borderColor}`, ...getReworkPercentStyle(podLead.rework_percent) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600 }}>
            {podLead.rework_percent !== null ? `${podLead.rework_percent}%` : '-'}
          </Typography>
        </TableCell>

        {/* Time & Efficiency Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>
            {podLead.merged_exp_aht !== null ? podLead.merged_exp_aht.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>
            {(podLead.trainer_jibble_hours + podLead.pod_jibble_hours).toFixed(1)}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#64748B' }}>
            {podLead.accounted_hours > 0 ? podLead.accounted_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getEfficiencyStyle(podLead.efficiency) }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 700 }}>
            {podLead.efficiency !== null ? `${podLead.efficiency.toFixed(0)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#0369A1' }}>
            {podLead.active_jibble_people > 0 ? podLead.active_jibble_people : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.time.borderColor}` }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: '#475569' }}>
            {podLead.pod_jibble_hours?.toFixed(1) ?? '-'}
          </Typography>
        </TableCell>

        {/* Finance Group - Revenue at POD lead level (sum of trainer revenues) */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: trainerFontSize, fontWeight: 600, color: podLead.revenue > 0 ? '#059669' : '#94A3B8' }}>
            {podLead.revenue > 0 ? formatCurrency(podLead.revenue) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
        <TableCell align="center" sx={{ ...cellStyle, color: '#94A3B8' }}>-</TableCell>
      </TableRow>
      
      {hasTrainers && open && sortedTrainers.map((trainer, idx) => (
        <TrainerRow key={idx} trainer={trainer} colorSettings={colorSettings} applyColors={applyColorsToTrainers} />
      ))}
    </>
  )
}

// Project Row Component
// COLOR CODING: Only RATE, R%, and EFF% should be color-coded per PMO requirements
function ProjectRow({ 
  project, 
  colorSettings, 
  applyColors = true,
  applyColorsToPodLeads = true,
  applyColorsToTrainers = true,
  sortColumn = '',
  sortDirection = 'asc' as const,
}: { 
  project: ProjectStats
  colorSettings: ColorSettings
  applyColors?: boolean
  applyColorsToPodLeads?: boolean
  applyColorsToTrainers?: boolean
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
}) {
  const [open, setOpen] = useState(false)
  const hasPodLeads = project.pod_leads && project.pod_leads.length > 0
  const sortedPodLeads = sortChildren(project.pod_leads ?? [], sortColumn, sortDirection, 'podLead')

  // Responsive font sizes for project level
  const projectFontSize = { xs: '0.62rem', sm: '0.68rem', md: '0.75rem' }
  
  return (
    <>
      <TableRow 
        sx={{ 
          '&:hover': { bgcolor: '#F8FAFC' },
          bgcolor: open ? '#F1F5F9' : '#FFFFFF',
          cursor: hasPodLeads ? 'pointer' : 'default',
          borderLeft: open ? '3px solid #3B82F6' : '3px solid transparent',
        }}
        onClick={() => hasPodLeads && setOpen(!open)}
      >
        {/* Overview Group */}
        <TableCell sx={{ 
          ...cellStyle,
          position: 'sticky',
          left: 0,
          bgcolor: open ? '#F1F5F9' : '#FFFFFF',
          zIndex: 1,
          borderRight: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
          maxWidth: { xs: 130, sm: 160, md: 180 },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            {hasPodLeads ? (
              <IconButton size="small" sx={{ p: 0.1, minWidth: { xs: 14, md: 16 } }} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
                {open ? <KeyboardArrowUp sx={{ fontSize: { xs: 10, md: 12 } }} /> : <KeyboardArrowDown sx={{ fontSize: { xs: 10, md: 12 } }} />}
              </IconButton>
            ) : <Box sx={{ width: { xs: 14, md: 16 } }} />}
            <Box sx={{ 
              width: { xs: 16, md: 18 }, height: { xs: 16, md: 18 }, borderRadius: 0.5, flexShrink: 0,
              bgcolor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FolderIcon sx={{ color: '#10B981', fontSize: { xs: 10, md: 12 } }} />
            </Box>
            <Tooltip title={project.project_name} arrow placement="right">
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: { xs: '0.62rem', sm: '0.68rem', md: '0.72rem' }, fontWeight: 700, color: '#1E293B', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {project.project_name}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.45rem', sm: '0.48rem', md: '0.52rem' }, color: '#94A3B8' }}>
                  ID: {project.project_id}
                </Typography>
              </Box>
            </Tooltip>
          </Box>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}` }}>
          <Typography sx={{ fontSize: { xs: '0.58rem', sm: '0.65rem', md: '0.7rem' }, fontWeight: 700, color: '#4F46E5' }}>{project.trainer_count + project.pod_lead_count}</Typography>
          <Typography sx={{ fontSize: { xs: '0.42rem', sm: '0.45rem', md: '0.48rem' }, color: '#64748B' }}>{project.trainer_count}T, {project.pod_lead_count}P</Typography>
        </TableCell>

        {/* Tasks Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#64748B' }}>{project.target || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.unique_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.new_tasks}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.claimed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.in_progress || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.completed_current || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.reviewed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.calibrated || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.calibration_passed || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>{project.in_rework || '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#64748B' }}>{project.delivered ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#64748B' }}>{project.in_queue ?? '-'}</Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.tasks.borderColor}`, ...getAvgReworkStyle(project.avg_rework) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.avg_rework !== null ? project.avg_rework.toFixed(2) : '-'}
          </Typography>
        </TableCell>

        {/* Quality Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>
            {project.total_reviews}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(project.avg_rating) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.avg_rating !== null ? project.avg_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#7C3AED' }}>
            {project.agentic_reviews ?? 0}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getRatingStyle(project.agentic_rating) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.agentic_rating !== null ? project.agentic_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.quality.borderColor}`, ...getReworkPercentStyle(project.rework_percent) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.rework_percent !== null ? `${project.rework_percent}%` : '-'}
          </Typography>
        </TableCell>

        {/* Time & Efficiency Group */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>
            {project.merged_exp_aht !== null ? project.merged_exp_aht.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        {/* JIB - NO COLOR CODING (not in PMO requirements) */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#64748B' }}>
            {project.logged_hours?.toFixed(1) ?? '-'}
          </Typography>
        </TableCell>
        {/* ACCT - NO COLOR CODING (not in PMO requirements) */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#64748B' }}>
            {project.accounted_hours > 0 ? project.accounted_hours.toFixed(1) : '-'}
          </Typography>
        </TableCell>
        {/* EFF% - COLOR CODED: >=90% Green, 70-90% Yellow, <70% Red */}
        <TableCell align="center" sx={{ ...cellStyle, ...getEfficiencyStyle(project.efficiency) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.efficiency !== null ? `${project.efficiency.toFixed(0)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#0369A1' }}>
            {project.active_jibble_people > 0 ? project.active_jibble_people : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, borderRight: `1px solid ${COLUMN_GROUPS.time.borderColor}` }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#1E293B' }}>
            {project.total_pod_hours?.toFixed(1) ?? '-'}
          </Typography>
        </TableCell>

        {/* Finance Group - PROJECT LEVEL ONLY */}
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#059669' }}>
            {formatCurrency(project.revenue)}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: '#DC2626' }}>
            {formatCurrency(project.cost)}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700, color: project.margin >= 0 ? '#059669' : '#DC2626' }}>
            {project.margin !== 0 ? formatCurrency(project.margin) : '-'}
          </Typography>
        </TableCell>
        <TableCell align="center" sx={{ ...cellStyle, ...getMarginStyle(project.margin_percent) }}>
          <Typography sx={{ fontSize: projectFontSize, fontWeight: 700 }}>
            {project.margin_percent !== null && project.margin_percent !== undefined ? `${project.margin_percent.toFixed(1)}%` : '-'}
          </Typography>
        </TableCell>
      </TableRow>
      
      {hasPodLeads && open && sortedPodLeads.map((podLead, idx) => (
        <PodLeadRow 
          key={idx} 
          podLead={podLead} 
          colorSettings={colorSettings} 
          applyColors={applyColorsToPodLeads}
          applyColorsToTrainers={applyColorsToTrainers}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />
      ))}
    </>
  )
}

// Import TabSummaryStats type from PreDelivery
import type { TabSummaryStats } from '../../pages/PreDelivery'
import CloseIcon from '@mui/icons-material/Close'

// ============================================================================
// Flagged Dialog Component (replaces Below Target Alert)
// ============================================================================

interface FlaggedPerson {
  trainer_name: string
  trainer_email: string
  role: string
  project_name: string
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  jibble_hours: number
  tasks_per_8hrs: number
  daily_target: number
  pod_lead_name: string
}

type FlaggedSortKey = 'trainer_name' | 'role' | 'project_name' | 'pod_lead_name' | 'new_tasks' | 'rework' | 'total_reviews' | 'jibble_hours' | 'tasks_per_8hrs' | 'shortfall'

const FLAGGED_PROJECT_IDS = [60]

function collectFlagged(projects: ProjectStats[]): FlaggedPerson[] {
  const flagged: FlaggedPerson[] = []
  for (const project of projects) {
    if (!FLAGGED_PROJECT_IDS.includes(project.project_id)) continue
    for (const pod of project.pod_leads) {
      for (const t of pod.trainers || []) {
        if (t.below_target && t.tasks_per_8hrs != null && t.daily_target != null) {
          flagged.push({
            trainer_name: t.trainer_name,
            trainer_email: t.trainer_email,
            role: t.role || 'Trainer',
            project_name: project.project_name,
            unique_tasks: t.unique_tasks,
            new_tasks: t.new_tasks,
            rework: t.rework,
            total_reviews: t.total_reviews,
            jibble_hours: t.jibble_hours,
            tasks_per_8hrs: t.tasks_per_8hrs,
            daily_target: t.daily_target,
            pod_lead_name: pod.pod_lead_name,
          })
        }
      }
    }
  }
  return flagged
}

function FlaggedDialog({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: ProjectStats[] }) {
  const [sortKey, setSortKey] = useState<FlaggedSortKey>('shortfall')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const flagged = collectFlagged(projects)

  const handleSort = (key: FlaggedSortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'trainer_name' || key === 'role' || key === 'project_name' || key === 'pod_lead_name' ? 'asc' : 'desc')
    }
  }

  const sorted = [...flagged].sort((a, b) => {
    let aVal: any, bVal: any
    if (sortKey === 'shortfall') {
      aVal = a.daily_target - a.tasks_per_8hrs
      bVal = b.daily_target - b.tasks_per_8hrs
    } else {
      aVal = a[sortKey]
      bVal = b[sortKey]
    }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  const columns: { key: FlaggedSortKey; label: string; align: 'left' | 'center'; tooltip: string }[] = [
    { key: 'trainer_name', label: 'Name', align: 'left', tooltip: 'Team member name and email' },
    { key: 'role', label: 'Role', align: 'left', tooltip: 'Assigned role (Trainer, POD Lead, Calibrator, etc.)' },
    { key: 'project_name', label: 'Project', align: 'left', tooltip: 'Dashboard project the member is working on' },
    { key: 'pod_lead_name', label: 'Pod Lead', align: 'left', tooltip: 'Assigned POD Lead / reporting manager' },
    { key: 'new_tasks', label: 'New Tasks', align: 'center', tooltip: 'Number of new task completions' },
    { key: 'rework', label: 'Rework', align: 'center', tooltip: 'Number of rework submissions' },
    { key: 'total_reviews', label: 'Reviews', align: 'center', tooltip: 'Total reviews completed (for reviewer roles)' },
    { key: 'jibble_hours', label: 'Jibble Hrs', align: 'center', tooltip: 'Total hours logged in Jibble for the selected period' },
    { key: 'tasks_per_8hrs', label: 'Output/day', align: 'center', tooltip: 'Actual daily output rate: tasks or reviews per 8 Jibble hours vs the expected daily target' },
    { key: 'shortfall', label: 'Shortfall', align: 'center', tooltip: 'Tasks or reviews per day below target (daily target minus actual output rate)' },
  ]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 2, maxHeight: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, px: 2.5, bgcolor: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
        <WarningIcon sx={{ fontSize: 22, color: '#DC2626' }} />
        <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: '#991B1B', flex: 1 }}>
          Flagged — Below Target
        </Typography>
        <Chip
          label={`${flagged.length} total`}
          size="small"
          sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}
        />
        <IconButton size="small" onClick={onClose} sx={{ ml: 0.5 }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {flagged.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>No flagged members at this time.</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: '72vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {columns.map(col => (
                    <TableCell
                      key={col.key}
                      align={col.align}
                      sx={{ bgcolor: '#FEF2F2', py: 1, borderBottom: '2px solid #FECACA', whiteSpace: 'nowrap' }}
                    >
                      <Tooltip title={col.tooltip} arrow placement="top">
                        <TableSortLabel
                          active={sortKey === col.key}
                          direction={sortKey === col.key ? sortDir : 'asc'}
                          onClick={() => handleSort(col.key)}
                          sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B', '&.Mui-active': { color: '#991B1B' }, '& .MuiTableSortLabel-icon': { color: '#991B1B !important' } }}
                        >
                          {col.label}
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((p, idx) => {
                  const isReviewRole = ['POD Lead', 'Calibrator', 'Team Lead'].includes(p.role)
                  const gap = p.daily_target - p.tasks_per_8hrs
                  return (
                    <TableRow key={`${p.trainer_email}-${idx}`} sx={{ '&:hover': { bgcolor: '#FEF2F2' } }}>
                      <TableCell sx={{ py: 1 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B', lineHeight: 1.3 }}>{p.trainer_name}</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: '#94A3B8' }}>{p.trainer_email}</Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#64748B', py: 1 }}>{p.role}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#64748B', py: 1 }}>{p.project_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#64748B', py: 1 }}>{p.pod_lead_name}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', py: 1 }}>{p.new_tasks}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', py: 1 }}>{p.rework}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', py: 1 }}>{p.total_reviews}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', py: 1 }}>{p.jibble_hours.toFixed(1)}</TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626' }}>{p.tasks_per_8hrs.toFixed(1)}</Typography>
                        <Typography component="span" sx={{ fontSize: '0.72rem', color: '#94A3B8' }}> / {p.daily_target}</Typography>
                        <Typography component="span" sx={{ fontSize: '0.62rem', color: '#94A3B8', ml: 0.3 }}>{isReviewRole ? 'rev' : 'tasks'}</Typography>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1, bgcolor: '#FEF2F2', borderRadius: 0.5 }}>
                        <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626' }}>-{gap.toFixed(1)}</Typography>
                        <Typography component="span" sx={{ fontSize: '0.62rem', color: '#94A3B8', ml: 0.3 }}>{isReviewRole ? 'rev' : 'tasks'}</Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Jibble Hours Dialog Component
// ============================================================================

type JibbleSortKey = 'full_name' | 'turing_email' | 'total_hours' | 'project'

const PROJECT_OPTIONS_JIBBLE: { id: number | undefined; label: string }[] = [
  { id: undefined, label: 'All Projects' },
  { id: 36, label: 'Nvidia - SysBench' },
  { id: 37, label: 'Nvidia - Multichallenge' },
  { id: 38, label: 'Nvidia - InverseIFEval' },
  { id: 39, label: 'Nvidia - CFBench Multilingual' },
  { id: 59, label: 'Nvidia - Math Proof Eval - Test' },
  { id: 60, label: 'Nvidia - Math Proof Evals' },
]

function JibbleHoursDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<JibbleUserHours[]>([])
  const [loading, setLoading] = useState(false)
  const [projectFilter, setProjectFilter] = useState<number | undefined>(undefined)
  const [jibbleTimeframe, setJibbleTimeframe] = useState<Timeframe>('overall')
  const [jibbleWeekOffset, setJibbleWeekOffset] = useState(0)
  const [jibbleCustomStart, setJibbleCustomStart] = useState('')
  const [jibbleCustomEnd, setJibbleCustomEnd] = useState('')
  const [sortKey, setSortKey] = useState<JibbleSortKey>('total_hours')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  const fetchJibble = async () => {
    setLoading(true)
    try {
      const { startDate, endDate } = getDateRange(jibbleTimeframe, jibbleWeekOffset, jibbleCustomStart, jibbleCustomEnd)
      const data = await getJibbleProjectHours(projectFilter, startDate, endDate)
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) fetchJibble()
  }, [open, projectFilter, jibbleTimeframe, jibbleWeekOffset, jibbleCustomStart, jibbleCustomEnd])

  const handleSort = (key: JibbleSortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'total_hours' ? 'desc' : 'asc')
    }
  }

  const filtered = rows.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (r.full_name?.toLowerCase().includes(s)) ||
           (r.turing_email?.toLowerCase().includes(s)) ||
           (r.jibble_email?.toLowerCase().includes(s))
  })

  const sorted = [...filtered].sort((a, b) => {
    let aVal: any, bVal: any
    switch (sortKey) {
      case 'full_name': aVal = a.full_name || ''; bVal = b.full_name || ''; break
      case 'turing_email': aVal = a.turing_email || ''; bVal = b.turing_email || ''; break
      case 'total_hours': aVal = a.total_hours; bVal = b.total_hours; break
      case 'project': aVal = a.project || ''; bVal = b.project || ''; break
      default: return 0
    }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  const totalHours = filtered.reduce((s, r) => s + r.total_hours, 0)

  const columns: { key: JibbleSortKey; label: string; align: 'left' | 'center'; tooltip: string }[] = [
    { key: 'full_name', label: 'Name', align: 'left', tooltip: 'Full name from Jibble' },
    { key: 'turing_email', label: 'Turing Email', align: 'left', tooltip: 'Mapped Turing email (may be empty if not mapped)' },
    { key: 'project', label: 'Jibble Project', align: 'left', tooltip: 'Jibble project the hours were logged under' },
    { key: 'total_hours', label: 'Hours', align: 'center', tooltip: 'Total hours logged in the selected time range' },
  ]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 2, maxHeight: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, px: 2.5, bgcolor: '#EFF6FF', borderBottom: '1px solid #BFDBFE' }}>
        <AccessTimeIcon sx={{ fontSize: 22, color: '#2563EB' }} />
        <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E40AF', flex: 1 }}>
          Jibble Hours
        </Typography>
        <Chip
          label={`${filtered.length} people · ${totalHours.toFixed(1)} hrs`}
          size="small"
          sx={{ height: 24, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' }}
        />
        <IconButton size="small" onClick={onClose} sx={{ ml: 0.5 }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', px: 2, py: 1.5, borderBottom: '1px solid #E2E8F0', bgcolor: '#F8FAFC' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel sx={{ fontSize: '0.75rem' }}>Project</InputLabel>
            <Select
              native
              value={projectFilter !== undefined ? String(projectFilter) : ''}
              label="Project"
              onChange={(e: SelectChangeEvent) => setProjectFilter(e.target.value ? Number(e.target.value) : undefined)}
              sx={{ fontSize: '0.75rem', height: 32 }}
            >
              {PROJECT_OPTIONS_JIBBLE.map(opt => (
                <option key={opt.label} value={opt.id ?? ''}>{opt.label}</option>
              ))}
            </Select>
          </FormControl>
          <TimeframeSelector
            timeframe={jibbleTimeframe} onTimeframeChange={setJibbleTimeframe}
            weekOffset={jibbleWeekOffset} onWeekOffsetChange={setJibbleWeekOffset}
            customStartDate={jibbleCustomStart} onCustomStartDateChange={setJibbleCustomStart}
            customEndDate={jibbleCustomEnd} onCustomEndDateChange={setJibbleCustomEnd}
          />
          <TextField
            size="small" placeholder="Search name or email..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 32 } }}
          />
        </Box>

        {loading ? (
          <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={28} /></Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>No Jibble hours found for this selection.</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: '68vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#EFF6FF', py: 1, borderBottom: '2px solid #BFDBFE', width: 40 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF' }}>#</Typography>
                  </TableCell>
                  {columns.map(col => (
                    <TableCell key={col.key} align={col.align} sx={{ bgcolor: '#EFF6FF', py: 1, borderBottom: '2px solid #BFDBFE', whiteSpace: 'nowrap' }}>
                      <Tooltip title={col.tooltip} arrow placement="top">
                        <TableSortLabel
                          active={sortKey === col.key}
                          direction={sortKey === col.key ? sortDir : 'asc'}
                          onClick={() => handleSort(col.key)}
                          sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF', '&.Mui-active': { color: '#1E40AF' }, '& .MuiTableSortLabel-icon': { color: '#1E40AF !important' } }}
                        >
                          {col.label}
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((r, idx) => (
                  <TableRow key={`${r.member_code}-${r.project}-${idx}`} sx={{ '&:hover': { bgcolor: '#EFF6FF' } }}>
                    <TableCell sx={{ fontSize: '0.78rem', color: '#94A3B8', py: 0.85 }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 0.85 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B', lineHeight: 1.3 }}>{r.full_name || '-'}</Typography>
                      {r.jibble_email && r.jibble_email !== r.turing_email && (
                        <Typography sx={{ fontSize: '0.68rem', color: '#94A3B8' }}>{r.jibble_email}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: r.turing_email ? '#475569' : '#DC2626', py: 0.85, fontWeight: r.turing_email ? 400 : 600 }}>
                      {r.turing_email || 'Not mapped'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: '#64748B', py: 0.85 }}>{r.project}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E40AF', py: 0.85 }}>{r.total_hours.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  )
}


interface ProjectsTabProps {
  onSummaryUpdate?: (stats: TabSummaryStats) => void
  onSummaryLoading?: () => void
}

export function ProjectsTab({ onSummaryUpdate, onSummaryLoading }: ProjectsTabProps) {
  const [data, setData] = useState<ProjectStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [weekOffset, setWeekOffset] = useState<number>(0)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string>('')
  const [flaggedOpen, setFlaggedOpen] = useState(false)
  const [jibbleOpen, setJibbleOpen] = useState(false)
  
  const [colorSettings, setColorSettings] = useColorSettings('projectsColorSettings')
  const [colorApplyLevel, setColorApplyLevel] = useState<ColorApplyLevel>('both')
  
  const effectiveColorSettings: ColorSettings = colorSettings && Object.keys(colorSettings).length > 0 
    ? colorSettings : defaultColorSettings
  
  const applyColorsToProject = colorApplyLevel === 'both' || colorApplyLevel === 'parent'
  const applyColorsToPodLeads = colorApplyLevel === 'both' || colorApplyLevel === 'child'

  useEffect(() => { fetchData() }, [timeframe, weekOffset, customStartDate, customEndDate])

  // Report summary stats to parent when data or filter changes
  useEffect(() => {
    if (data.length > 0 && onSummaryUpdate) {
      const source = selectedProjectId !== '' ? data.filter(p => p.project_id === selectedProjectId) : data
      const totalTasks = source.reduce((sum, p) => sum + (p.unique_tasks || 0), 0)
      const totalTrainers = source.reduce((sum, p) => sum + p.pod_leads.reduce((s, pl) => s + (pl.trainers?.length || 0), 0), 0)
      const totalPodLeads = source.reduce((sum, p) => sum + (p.pod_leads?.length || 0), 0)
      const totalProjects = source.length
      const totalReviews = source.reduce((sum, p) => sum + (p.total_reviews || 0), 0)
      const newTasks = source.reduce((sum, p) => sum + (p.new_tasks || 0), 0)
      const rework = source.reduce((sum, p) => sum + (p.rework || 0), 0)
      
      onSummaryUpdate({
        totalTasks,
        totalTrainers,
        totalPodLeads,
        totalProjects,
        totalReviews,
        newTasks,
        rework
      })
    }
  }, [data, selectedProjectId, onSummaryUpdate])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    onSummaryLoading?.()
    try {
      const { startDate, endDate } = getDateRange(timeframe, weekOffset, customStartDate, customEndDate)
      // Include tasks for 4-level hierarchy (Project -> POD Lead -> Trainer -> Tasks)
      const result = await getProjectStats(startDate, endDate, true)
      setData(result)
    } catch (err) {
      setError('Failed to fetch Project stats')
    } finally {
      setLoading(false)
    }
  }

  const filteredData = data.filter(project => {
    if (selectedProjectId !== '' && project.project_id !== selectedProjectId) return false
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return project.project_name.toLowerCase().includes(s) ||
      project.pod_leads.some(pl =>
        pl.pod_lead_name.toLowerCase().includes(s) ||
        pl.pod_lead_email.toLowerCase().includes(s)
      )
  })

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortColumn) return 0
    let aVal: any, bVal: any
    switch (sortColumn) {
      // Overview
      case 'project_name': aVal = a.project_name || ''; bVal = b.project_name || ''; break
      case 'size': aVal = (a.trainer_count ?? 0) + (a.pod_lead_count ?? 0); bVal = (b.trainer_count ?? 0) + (b.pod_lead_count ?? 0); break
      // Tasks
      case 'unique_tasks': aVal = a.unique_tasks ?? 0; bVal = b.unique_tasks ?? 0; break
      case 'new_tasks': aVal = a.new_tasks ?? 0; bVal = b.new_tasks ?? 0; break
      case 'rework': aVal = a.rework ?? 0; bVal = b.rework ?? 0; break
      case 'delivered': aVal = a.delivered ?? 0; bVal = b.delivered ?? 0; break
      case 'in_queue': aVal = a.in_queue ?? 0; bVal = b.in_queue ?? 0; break
      // Quality
      case 'total_reviews': aVal = a.total_reviews ?? 0; bVal = b.total_reviews ?? 0; break
      case 'avg_rating': aVal = a.avg_rating ?? -Infinity; bVal = b.avg_rating ?? -Infinity; break
      case 'agentic_reviews': aVal = a.agentic_reviews ?? 0; bVal = b.agentic_reviews ?? 0; break
      case 'agentic_rating': aVal = a.agentic_rating ?? -Infinity; bVal = b.agentic_rating ?? -Infinity; break
      case 'avg_rework': aVal = a.avg_rework ?? -Infinity; bVal = b.avg_rework ?? -Infinity; break
      case 'rework_percent': aVal = a.rework_percent ?? -Infinity; bVal = b.rework_percent ?? -Infinity; break
      // Time & Efficiency
      case 'merged_exp_aht': aVal = a.merged_exp_aht ?? 0; bVal = b.merged_exp_aht ?? 0; break
      case 'logged_hours': aVal = a.logged_hours ?? 0; bVal = b.logged_hours ?? 0; break
      case 'accounted_hours': aVal = a.accounted_hours ?? 0; bVal = b.accounted_hours ?? 0; break
      case 'efficiency': aVal = a.efficiency ?? -Infinity; bVal = b.efficiency ?? -Infinity; break
      case 'active_jibble_people': aVal = a.active_jibble_people ?? 0; bVal = b.active_jibble_people ?? 0; break
      case 'total_pod_hours': aVal = a.total_pod_hours ?? 0; bVal = b.total_pod_hours ?? 0; break
      // Finance
      case 'revenue': aVal = a.revenue ?? 0; bVal = b.revenue ?? 0; break
      case 'cost': aVal = a.cost ?? 0; bVal = b.cost ?? 0; break
      case 'margin': aVal = a.margin ?? 0; bVal = b.margin ?? 0; break
      case 'margin_percent': aVal = a.margin_percent ?? -Infinity; bVal = b.margin_percent ?? -Infinity; break
      default: return 0
    }
    if (typeof aVal === 'string') return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
  })

  // Sub-header cell renderer with tooltip - Responsive
  const SubHeader = ({ label, columnKey, group, tooltipKey, isLastInGroup = false, customColor }: { 
    label: string; 
    columnKey: string; 
    group: keyof typeof COLUMN_GROUPS; 
    tooltipKey?: string;
    isLastInGroup?: boolean;
    customColor?: string;
  }) => {
    const tooltipText = getTooltipForHeader(tooltipKey || label)
    
    return (
      <Tooltip title={tooltipText} arrow placement="top">
        <TableCell 
          align="center"
          sx={{ 
            ...headerCellStyle,
            bgcolor: COLUMN_GROUPS[group].bgSubHeader,
            color: customColor || COLUMN_GROUPS[group].textColor,
            borderBottom: `2px solid ${COLUMN_GROUPS[group].borderColor}`,
            borderRight: isLastInGroup ? `2px solid ${COLUMN_GROUPS[group].borderColor}` : undefined,
            cursor: 'pointer',
            width: { xs: 32, sm: 38, md: 44 },
            minWidth: { xs: 28, sm: 34, md: 40 },
            '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
          }}
          onClick={(e) => { 
            e.stopPropagation()
            setMenuPosition({ top: e.clientY, left: e.clientX })
            setActiveFilterColumn(columnKey) 
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.15 }}>
            <ArrowDropDownIcon sx={{ fontSize: { xs: 8, md: 9 }, opacity: 0.5 }} />
            <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.52rem', md: '0.55rem' }, fontWeight: 600 }}>{label}</Typography>
            {sortColumn === columnKey && (sortDirection === 'asc' ? 
              <ArrowUpwardIcon sx={{ fontSize: { xs: 6, md: 7 } }} /> : <ArrowDownwardIcon sx={{ fontSize: { xs: 6, md: 7 } }} />)}
          </Box>
        </TableCell>
      </Tooltip>
    )
  }

  const totals = {
    projects: sortedData.length,
    podLeads: sortedData.reduce((sum, p) => sum + p.pod_lead_count, 0),
    trainers: sortedData.reduce((sum, p) => sum + p.trainer_count, 0),
    uniqueTasks: sortedData.reduce((sum, p) => sum + p.unique_tasks, 0),
    newTasks: sortedData.reduce((sum, p) => sum + p.new_tasks, 0),
    rework: sortedData.reduce((sum, p) => sum + p.rework, 0),
    totalReviews: sortedData.reduce((sum, p) => sum + p.total_reviews, 0),
  }

  const handleExport = () => {
    const exportData: any[] = []
    filteredData.forEach(project => {
      exportData.push({ 
        level: 'Project', project: project.project_name, 
        unique_tasks: project.unique_tasks, new_tasks: project.new_tasks, rework: project.rework, 
        total_reviews: project.total_reviews, rework_percent: project.rework_percent, logged_hours: project.logged_hours,
        revenue: project.revenue || 0, cost: project.cost || 0, 
        margin: project.margin || 0, margin_percent: project.margin_percent,
      })
      project.pod_leads.forEach(pl => {
        exportData.push({ level: 'POD Lead', project: project.project_name, pod_lead: pl.pod_lead_name, email: pl.pod_lead_email, unique_tasks: pl.unique_tasks, new_tasks: pl.new_tasks, rework: pl.rework, total_reviews: pl.total_reviews, rework_percent: pl.rework_percent })
        pl.trainers?.forEach(t => {
          exportData.push({ level: 'Trainer', project: project.project_name, pod_lead: pl.pod_lead_name, trainer: t.trainer_name, email: t.trainer_email, unique_tasks: t.unique_tasks, new_tasks: t.new_tasks, rework: t.rework, total_reviews: t.total_reviews, jibble_hours: t.jibble_hours, efficiency: t.efficiency })
        })
      })
    })
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Projects')
      XLSX.writeFile(wb, `Project_Stats_${new Date().toISOString().split('T')[0]}.xlsx`)
    })
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
  if (error) return <Alert severity="error">{error}</Alert>

  return (
    <Box>
      {/* Filters & Summary - Compact responsive */}
      <Paper sx={{ p: { xs: 0.75, sm: 1, md: 1.25 }, mb: { xs: 0.75, sm: 1 }, borderRadius: 1, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 }, alignItems: 'center', flexWrap: 'wrap', mb: { xs: 0.5, sm: 0.75 } }}>
          <TimeframeSelector
            timeframe={timeframe} onTimeframeChange={setTimeframe}
            weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset}
            customStartDate={customStartDate} onCustomStartDateChange={setCustomStartDate}
            customEndDate={customEndDate} onCustomEndDateChange={setCustomEndDate}
          />
          <FormControl size="small" sx={{ minWidth: { xs: 100, sm: 140, md: 160 } }}>
            <Select
              displayEmpty
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value as number | '')}
              sx={{ fontSize: { xs: '0.65rem', sm: '0.7rem' }, height: { xs: 26, sm: 28, md: 30 } }}
            >
              <MenuItem value="" sx={{ fontSize: '0.75rem' }}>All Projects</MenuItem>
              {data.map(p => (
                <MenuItem key={p.project_id} value={p.project_id} sx={{ fontSize: '0.75rem' }}>
                  {p.project_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ 
              minWidth: { xs: 100, sm: 140, md: 160 }, 
              '& .MuiOutlinedInput-root': { fontSize: { xs: '0.65rem', sm: '0.7rem' }, height: { xs: 26, sm: 28, md: 30 } } 
            }}
          />
          <ColorSettingsPanel 
            settings={colorSettings} onSettingsChange={setColorSettings}
            metrics={['tasks_reviewed', 'new_tasks_reviewed', 'rework_reviewed', 'total_reviews', 'avg_rework', 'rework_percent', 'merged_exp_aht']}
            applyLevel={colorApplyLevel} onApplyLevelChange={setColorApplyLevel}
          />
          {(() => {
            const flaggedCount = collectFlagged(sortedData).length
            return flaggedCount > 0 ? (
              <Button
                variant="contained"
                startIcon={<WarningIcon sx={{ fontSize: { xs: 12, md: 14 } }} />}
                onClick={() => setFlaggedOpen(true)}
                sx={{
                  bgcolor: '#DC2626',
                  fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
                  textTransform: 'none',
                  px: { xs: 1, sm: 1.5 },
                  py: 0.3,
                  minHeight: { xs: 24, sm: 26, md: 28 },
                  '&:hover': { bgcolor: '#B91C1C' },
                }}
              >
                {flaggedCount} Flagged
              </Button>
            ) : null
          })()}
          <Button
            variant="contained"
            startIcon={<AccessTimeIcon sx={{ fontSize: { xs: 12, md: 14 } }} />}
            onClick={() => setJibbleOpen(true)}
            sx={{
              bgcolor: '#2563EB',
              fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' },
              textTransform: 'none',
              px: { xs: 1, sm: 1.5 },
              py: 0.3,
              minHeight: { xs: 24, sm: 26, md: 28 },
              '&:hover': { bgcolor: '#1D4ED8' },
            }}
          >
            Jibble Hours
          </Button>
          <Button variant="contained" startIcon={<DownloadIcon sx={{ fontSize: { xs: 12, md: 14 } }} />} onClick={handleExport}
            sx={{ 
              bgcolor: '#10B981', 
              fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' }, 
              textTransform: 'none', 
              px: { xs: 1, sm: 1.5 }, 
              py: 0.3, 
              minHeight: { xs: 24, sm: 26, md: 28 }, 
              '&:hover': { bgcolor: '#059669' } 
            }}>
            Export
          </Button>
        </Box>
        {/* Summary chips - compact */}
        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 0.75 }, flexWrap: 'wrap' }}>
          {[
            { label: 'Projects', value: totals.projects, bg: '#F0FDF4', border: '#D1FAE5', color: '#065F46' },
            { label: 'POD Leads', value: totals.podLeads, bg: '#EEF2FF', border: '#C7D2FE', color: '#3730A3' },
            { label: 'Trainers', value: totals.trainers, bg: '#FDF4FF', border: '#F5D0FE', color: '#86198F' },
            { label: 'Tasks', value: totals.uniqueTasks.toLocaleString(), bg: '#F8FAFC', border: '#E2E8F0', color: '#334155' },
            { label: 'New', value: totals.newTasks.toLocaleString(), bg: '#F8FAFC', border: '#E2E8F0', color: '#334155' },
            { label: 'Rework', value: totals.rework.toLocaleString(), bg: '#FEF2F2', border: '#FECACA', color: '#991B1B' },
            { label: 'Reviews', value: totals.totalReviews.toLocaleString(), bg: '#F8FAFC', border: '#E2E8F0', color: '#334155' },
          ].map(item => (
            <Box key={item.label} sx={{ 
              px: { xs: 0.75, sm: 1, md: 1.25 }, 
              py: { xs: 0.2, sm: 0.3 }, 
              bgcolor: item.bg, 
              borderRadius: 0.75, 
              border: `1px solid ${item.border}`, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 0.3 
            }}>
              <Typography sx={{ fontSize: { xs: '0.6rem', sm: '0.65rem', md: '0.7rem' }, fontWeight: 700, color: item.color }}>{item.value}</Typography>
              <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, color: item.color, opacity: 0.8 }}>{item.label}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <FlaggedDialog open={flaggedOpen} onClose={() => setFlaggedOpen(false)} projects={sortedData} />
      <JibbleHoursDialog open={jibbleOpen} onClose={() => setJibbleOpen(false)} />

      {/* Table - Bigger height, responsive */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 1, border: '1px solid #E2E8F0' }}>
        <TableContainer sx={{ maxHeight: { xs: 'calc(100vh - 200px)', sm: 'calc(100vh - 180px)', md: 'calc(100vh - 160px)' }, minHeight: { xs: 400, sm: 500, md: 600 } }}>
          <Table stickyHeader size="small" sx={{ minWidth: { xs: 900, sm: 1050, md: 1200 } }}>
            <TableHead>
              {/* Group Headers Row - Responsive */}
              <TableRow>
                <TableCell 
                  colSpan={2} 
                  sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.overview.bgHeader, 
                    color: COLUMN_GROUPS.overview.textColor,
                    borderBottom: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                    position: 'sticky', left: 0, zIndex: 4,
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, fontWeight: 700, letterSpacing: '0.02em' }}>OVERVIEW</Typography>
                </TableCell>
                <TableCell 
                  colSpan={14} 
                  align="center"
                  sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.tasks.bgHeader, 
                    color: COLUMN_GROUPS.tasks.textColor,
                    borderBottom: `1px solid ${COLUMN_GROUPS.tasks.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.tasks.borderColor}`,
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, fontWeight: 700, letterSpacing: '0.02em' }}>TASKS</Typography>
                </TableCell>
                <TableCell 
                  colSpan={5} 
                  align="center"
                  sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.quality.bgHeader, 
                    color: COLUMN_GROUPS.quality.textColor,
                    borderBottom: `1px solid ${COLUMN_GROUPS.quality.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.quality.borderColor}`,
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, fontWeight: 700, letterSpacing: '0.02em' }}>QUALITY</Typography>
                </TableCell>
                <TableCell 
                  colSpan={6} 
                  align="center"
                  sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.time.bgHeader, 
                    color: COLUMN_GROUPS.time.textColor,
                    borderBottom: `1px solid ${COLUMN_GROUPS.time.borderColor}`,
                    borderRight: `2px solid ${COLUMN_GROUPS.time.borderColor}`,
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, fontWeight: 700, letterSpacing: '0.02em' }}>TIME & EFF</Typography>
                </TableCell>
                <TableCell 
                  colSpan={4} 
                  align="center"
                  sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.finance.bgHeader, 
                    color: COLUMN_GROUPS.finance.textColor,
                    borderBottom: `1px solid ${COLUMN_GROUPS.finance.borderColor}`,
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.55rem', md: '0.6rem' }, fontWeight: 700, letterSpacing: '0.02em' }}>FINANCE</Typography>
                </TableCell>
              </TableRow>

              {/* Sub-headers Row - Responsive */}
              <TableRow>
                {/* Overview */}
                <Tooltip title="Project name, POD Lead name, or Trainer name" arrow placement="top">
                  <TableCell sx={{ 
                    ...headerCellStyle, 
                    bgcolor: COLUMN_GROUPS.overview.bgSubHeader, 
                    color: COLUMN_GROUPS.overview.textColor,
                    borderBottom: `2px solid ${COLUMN_GROUPS.overview.borderColor}`,
                    position: 'sticky', left: 0, zIndex: 3,
                    width: { xs: 120, sm: 160, md: 180 },
                    minWidth: { xs: 100, sm: 140, md: 160 },
                    borderRight: `1px solid ${COLUMN_GROUPS.overview.borderColor}`,
                  }}>
                    <Typography sx={{ fontSize: { xs: '0.5rem', sm: '0.52rem', md: '0.55rem' }, fontWeight: 600 }}>Name</Typography>
                  </TableCell>
                </Tooltip>
                <SubHeader label="Size" columnKey="size" group="overview" tooltipKey="Size" isLastInGroup />

                {/* Tasks - All sortable */}
                <SubHeader label="Target" columnKey="target" group="tasks" tooltipKey="Target" />
                <SubHeader label="Unique" columnKey="unique_tasks" group="tasks" tooltipKey="Uniq" />
                <SubHeader label="New" columnKey="new_tasks" group="tasks" tooltipKey="New" />
                <SubHeader label="Rework" columnKey="rework" group="tasks" tooltipKey="Rwk" />
                <SubHeader label="Claimed" columnKey="claimed" group="tasks" tooltipKey="Claimed" />
                <SubHeader label="In Prog" columnKey="in_progress" group="tasks" tooltipKey="InProg" />
                <SubHeader label="Completed" columnKey="completed_current" group="tasks" tooltipKey="CompCur" />
                <SubHeader label="Reviewed" columnKey="reviewed" group="tasks" tooltipKey="Revwd" />
                <SubHeader label="Calibrated" columnKey="calibrated" group="tasks" tooltipKey="Calib" />
                <SubHeader label="Cal Passed" columnKey="calibration_passed" group="tasks" tooltipKey="CalPass" />
                <SubHeader label="In Rework" columnKey="in_rework" group="tasks" tooltipKey="InRwk" />
                <SubHeader label="Delivered" columnKey="delivered" group="tasks" tooltipKey="Del" />
                <SubHeader label="Queue" columnKey="in_queue" group="tasks" tooltipKey="Queue" />
                <SubHeader label="Avg Rwk" columnKey="avg_rework" group="tasks" tooltipKey="AvgR" isLastInGroup />

                {/* Quality - All sortable */}
                <SubHeader label="Reviews" columnKey="total_reviews" group="quality" tooltipKey="Rev" />
                <SubHeader label="Rating" columnKey="avg_rating" group="quality" tooltipKey="Rate" />
                <SubHeader label="Agentic" columnKey="agentic_reviews" group="quality" tooltipKey="Agt" customColor="#7C3AED" />
                <SubHeader label="Agt Rate" columnKey="agentic_rating" group="quality" tooltipKey="AgtR" customColor="#7C3AED" />
                <SubHeader label="Rwk %" columnKey="rework_percent" group="quality" tooltipKey="R%" isLastInGroup />

                {/* Time & Efficiency - All sortable */}
                <SubHeader label="AHT" columnKey="merged_exp_aht" group="time" tooltipKey="AHT" />
                <SubHeader label="Jibble Hrs" columnKey="logged_hours" group="time" tooltipKey="Jib" />
                <SubHeader label="Acct Hrs" columnKey="accounted_hours" group="time" tooltipKey="Acct" />
                <SubHeader label="Eff %" columnKey="efficiency" group="time" tooltipKey="Eff%" />
                <SubHeader label="Active" columnKey="active_jibble_people" group="time" tooltipKey="Active" />
                <SubHeader label="POD Hrs" columnKey="total_pod_hours" group="time" tooltipKey="POD" isLastInGroup />

                {/* Finance - Project level only */}
                <SubHeader label="Revenue" columnKey="revenue" group="finance" tooltipKey="Rev$" />
                <SubHeader label="Cost" columnKey="cost" group="finance" tooltipKey="Cost" />
                <SubHeader label="Margin" columnKey="margin" group="finance" tooltipKey="Mrgn" />
                <SubHeader label="Margin %" columnKey="margin_percent" group="finance" tooltipKey="M%" />
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((project, idx) => (
                <ProjectRow 
                  key={idx} project={project} colorSettings={effectiveColorSettings} 
                  applyColors={applyColorsToProject} applyColorsToPodLeads={applyColorsToPodLeads} applyColorsToTrainers={applyColorsToPodLeads}
                  sortColumn={sortColumn} sortDirection={sortDirection}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Sort Menu */}
      <Menu
        open={Boolean(menuPosition)} 
        onClose={() => { setMenuPosition(null); setActiveFilterColumn('') }}
        anchorReference="anchorPosition"
        anchorPosition={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
        slotProps={{
          paper: {
            sx: { minWidth: 180 }
          }
        }}
      >
        <Box sx={{ px: 1.5, py: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
            <SortIcon sx={{ fontSize: 14, mr: 0.5 }} /> Sort
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setSortColumn(activeFilterColumn); setSortDirection('asc'); setMenuPosition(null) }} sx={{ fontSize: '0.75rem', py: 0.75 }}>
          <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ascending</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setSortColumn(activeFilterColumn); setSortDirection('desc'); setMenuPosition(null) }} sx={{ fontSize: '0.75rem', py: 0.75 }}>
          <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Descending</ListItemText>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { setSortColumn(''); setMenuPosition(null) }} sx={{ fontSize: '0.7rem', py: 0.5, color: '#64748B' }}>
          Reset
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default ProjectsTab
