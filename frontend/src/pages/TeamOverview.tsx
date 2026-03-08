import { useState, useEffect, useMemo } from 'react'
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
} from '@mui/material'
import {
  getProjectStats,
  ProjectStats,
  PodLeadUnderProject,
  TrainerUnderPodLead,
} from '../services/api'
import { Timeframe, getDateRange as getDateRangeUtil } from '../utils/dateUtils'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { PROJECT_OPTIONS_WITH_ALL } from '../constants'

// ---------------------------------------------------------------------------
// Color coding helpers (PMO thresholds)
// ---------------------------------------------------------------------------

const getRatingStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v > 4.8) return { color: '#065F46', bgcolor: '#D1FAE5' }
  return { color: '#92400E', bgcolor: '#FEF3C7' }
}

const getEfficiencyStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v >= 90) return { color: '#065F46', bgcolor: '#D1FAE5' }
  if (v >= 70) return { color: '#92400E', bgcolor: '#FEF3C7' }
  return { color: '#991B1B', bgcolor: '#FEE2E2' }
}

const getReworkPercentStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v <= 10) return { color: '#065F46', bgcolor: '#D1FAE5' }
  if (v <= 30) return { color: '#92400E', bgcolor: '#FEF3C7' }
  return { color: '#991B1B', bgcolor: '#FEE2E2' }
}

const getAvgReworkStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v < 1) return { color: '#065F46', bgcolor: '#D1FAE5' }
  if (v <= 2.5) return { color: '#92400E', bgcolor: '#FEF3C7' }
  return { color: '#991B1B', bgcolor: '#FEE2E2' }
}

const formatCurrency = (v: number | null | undefined): string => {
  if (v === null || v === undefined || v === 0) return '-'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ---------------------------------------------------------------------------
// Row types for the flat heatmap table
// ---------------------------------------------------------------------------

interface PodHeaderRow {
  type: 'pod'
  podName: string
  podEmail: string
  trainerCount: number
  unique_tasks: number
  new_tasks: number
  rework: number
  delivered: number
  in_queue: number
  total_reviews: number
  avg_rating: number | null
  agentic_rating: number | null
  avg_rework: number | null
  rework_percent: number | null
  merged_exp_aht: number | null
  jibble_hours: number
  accounted_hours: number
  efficiency: number | null
  revenue: number
  projectName?: string
}

interface TrainerDataRow {
  type: 'trainer'
  trainer: TrainerUnderPodLead
  podEmail: string
  projectName?: string
}

type HeatmapRow = PodHeaderRow | TrainerDataRow

// ---------------------------------------------------------------------------
// Column group definitions
// ---------------------------------------------------------------------------

const GROUPS = {
  identity: { label: 'IDENTITY', bg: '#F1F5F9', border: '#CBD5E1', text: '#475569', cols: 2 },
  tasks: { label: 'TASKS', bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF', cols: 5 },
  quality: { label: 'QUALITY', bg: '#F0FDF4', border: '#86EFAC', text: '#166534', cols: 4 },
  time: { label: 'TIME & EFF', bg: '#FFFBEB', border: '#FCD34D', text: '#92400E', cols: 4 },
  finance: { label: 'FINANCE', bg: '#FDF2F8', border: '#F0ABFC', text: '#86198F', cols: 1 },
} as const

const CELL = {
  py: 0.15,
  px: 0.3,
  fontSize: '0.6rem',
  borderBottom: '1px solid #E2E8F0',
  whiteSpace: 'nowrap' as const,
}

const HEADER = {
  py: 0.2,
  px: 0.25,
  fontWeight: 600,
  fontSize: '0.5rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.01em',
  lineHeight: 1.1,
  whiteSpace: 'nowrap' as const,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TeamOverview() {
  const [data, setData] = useState<ProjectStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly')
  const [weekOffset, setWeekOffset] = useState(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)

  useEffect(() => { fetchData() }, [timeframe, weekOffset, customStart, customEnd])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getDateRangeUtil(timeframe, weekOffset, customStart, customEnd)
      const result = await getProjectStats(startDate, endDate, false)
      setData(result)
    } catch {
      setError('Failed to fetch team data')
    } finally {
      setLoading(false)
    }
  }

  // Flatten project -> pod_leads -> trainers into rows
  const rows: HeatmapRow[] = useMemo(() => {
    const out: HeatmapRow[] = []
    const projects = selectedProject
      ? data.filter(p => p.project_id === selectedProject)
      : data

    for (const proj of projects) {
      for (const pod of proj.pod_leads) {
        out.push({
          type: 'pod',
          podName: pod.pod_lead_name,
          podEmail: pod.pod_lead_email,
          trainerCount: pod.trainer_count,
          unique_tasks: pod.unique_tasks,
          new_tasks: pod.new_tasks,
          rework: pod.rework,
          delivered: pod.delivered,
          in_queue: pod.in_queue,
          total_reviews: pod.total_reviews,
          avg_rating: pod.avg_rating,
          agentic_rating: pod.agentic_rating,
          avg_rework: pod.avg_rework,
          rework_percent: pod.rework_percent,
          merged_exp_aht: pod.merged_exp_aht,
          jibble_hours: pod.trainer_jibble_hours + pod.pod_jibble_hours,
          accounted_hours: pod.accounted_hours,
          efficiency: pod.efficiency,
          revenue: pod.revenue,
          projectName: proj.project_name,
        })

        for (const t of pod.trainers) {
          out.push({ type: 'trainer', trainer: t, podEmail: pod.pod_lead_email, projectName: proj.project_name })
        }
      }
    }
    return out
  }, [data, selectedProject])

  // Filter by search term
  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows
    const q = searchTerm.toLowerCase()
    const matchingPods = new Set<string>()
    const matchingTrainers = new Set<string>()

    for (const row of rows) {
      if (row.type === 'pod') {
        if (row.podName.toLowerCase().includes(q) || row.podEmail.toLowerCase().includes(q) || (row.projectName || '').toLowerCase().includes(q)) {
          matchingPods.add(row.podEmail)
        }
      } else {
        if (row.trainer.trainer_name.toLowerCase().includes(q) || row.trainer.trainer_email.toLowerCase().includes(q)) {
          matchingTrainers.add(row.trainer.trainer_email)
          matchingPods.add(row.podEmail)
        }
      }
    }

    return rows.filter(r =>
      r.type === 'pod' ? matchingPods.has(r.podEmail) : (matchingPods.has(r.podEmail) || matchingTrainers.has(r.trainer.trainer_email))
    )
  }, [rows, searchTerm])

  // Summary stats
  const summary = useMemo(() => {
    const trainers = filteredRows.filter(r => r.type === 'trainer') as TrainerDataRow[]
    const pods = filteredRows.filter(r => r.type === 'pod') as PodHeaderRow[]
    const totalTrainers = trainers.length
    const withRating = trainers.filter(t => t.trainer.avg_rating !== null)
    const avgRating = withRating.length > 0
      ? withRating.reduce((s, t) => s + (t.trainer.avg_rating ?? 0), 0) / withRating.length
      : null
    const withEff = trainers.filter(t => t.trainer.efficiency !== null)
    const avgEff = withEff.length > 0
      ? withEff.reduce((s, t) => s + (t.trainer.efficiency ?? 0), 0) / withEff.length
      : null
    const totalDelivered = trainers.reduce((s, t) => s + (t.trainer.delivered || 0), 0)
    const totalRevenue = trainers.reduce((s, t) => s + (t.trainer.revenue || 0), 0)
    return { totalTrainers, totalPods: pods.length, avgRating, avgEff, totalDelivered, totalRevenue }
  }, [filteredRows])

  // Metric cell renderer
  const M = ({ value, fmt, style, borderRight }: { value: number | null | undefined; fmt?: 'dec1' | 'dec2' | 'pct' | 'pct1' | 'cur' | 'int'; style?: ReturnType<typeof getRatingStyle>; borderRight?: string }) => {
    const s = style ?? { color: '#334155', bgcolor: 'transparent' }
    let display = '-'
    if (value !== null && value !== undefined) {
      switch (fmt) {
        case 'dec1': display = value.toFixed(1); break
        case 'dec2': display = value.toFixed(2); break
        case 'pct': display = `${value.toFixed(0)}%`; break
        case 'pct1': display = `${value.toFixed(1)}%`; break
        case 'cur': display = formatCurrency(value); break
        default: display = String(value)
      }
    }
    return (
      <TableCell align="center" sx={{ ...CELL, ...s, ...(borderRight ? { borderRight } : {}), overflow: 'hidden' }}>
        <Typography noWrap sx={{ fontSize: '0.55rem', fontWeight: 600, lineHeight: 1 }}>{display}</Typography>
      </TableCell>
    )
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>

  return (
    <Box>
      {/* Filters */}
      <Paper sx={{ p: 1.25, mb: 1, borderRadius: 1, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.75 }}>
          <TimeframeSelector
            timeframe={timeframe} onTimeframeChange={setTimeframe}
            weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset}
            customStartDate={customStart} onCustomStartDateChange={setCustomStart}
            customEndDate={customEnd} onCustomEndDateChange={setCustomEnd}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ fontSize: '0.65rem' }}>Project</InputLabel>
            <Select
              value={selectedProject ?? ''}
              label="Project"
              onChange={(e) => setSelectedProject(e.target.value === '' ? undefined : Number(e.target.value))}
              sx={{ fontSize: '0.65rem', height: 28 }}
            >
              {PROJECT_OPTIONS_WITH_ALL.map(o => (
                <MenuItem key={o.id ?? 'all'} value={o.id ?? ''} sx={{ fontSize: '0.7rem' }}>{o.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small" placeholder="Search trainer or POD..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: 140, '& .MuiOutlinedInput-root': { fontSize: '0.65rem', height: 28 } }}
          />
        </Box>

        {/* Summary bar */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {[
            { label: 'PODs', value: summary.totalPods, bg: '#EEF2FF', border: '#C7D2FE', color: '#3730A3' },
            { label: 'Trainers', value: summary.totalTrainers, bg: '#FDF4FF', border: '#F5D0FE', color: '#86198F' },
            { label: 'Delivered', value: summary.totalDelivered.toLocaleString(), bg: '#F0FDF4', border: '#BBF7D0', color: '#065F46' },
            { label: 'Avg Rating', value: summary.avgRating !== null ? summary.avgRating.toFixed(2) : '-', bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
            { label: 'Avg Eff%', value: summary.avgEff !== null ? `${summary.avgEff.toFixed(0)}%` : '-', bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
            { label: 'Revenue', value: formatCurrency(summary.totalRevenue), bg: '#FDF2F8', border: '#FBCFE8', color: '#86198F' },
          ].map(c => (
            <Box key={c.label} sx={{ px: 0.75, py: 0.15, bgcolor: c.bg, borderRadius: 0.5, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: c.color }}>{c.value}</Typography>
              <Typography sx={{ fontSize: '0.5rem', color: c.color, opacity: 0.8 }}>{c.label}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Heatmap Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 1, border: '1px solid #E2E8F0' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 180px)', minHeight: 400 }}>
          <Table stickyHeader size="small" sx={{ minWidth: 850, tableLayout: 'fixed' }}>
            <TableHead>
              {/* Group header row */}
              <TableRow>
                <TableCell colSpan={GROUPS.identity.cols} sx={{ ...HEADER, bgcolor: GROUPS.identity.bg, color: GROUPS.identity.text, borderBottom: `1px solid ${GROUPS.identity.border}`, borderRight: `2px solid ${GROUPS.identity.border}`, position: 'sticky', left: 0, zIndex: 4 }}>
                  {GROUPS.identity.label}
                </TableCell>
                {(['tasks', 'quality', 'time', 'finance'] as const).map(g => (
                  <TableCell key={g} colSpan={GROUPS[g].cols} align="center" sx={{ ...HEADER, bgcolor: GROUPS[g].bg, color: GROUPS[g].text, borderBottom: `1px solid ${GROUPS[g].border}`, borderRight: `2px solid ${GROUPS[g].border}` }}>
                    {GROUPS[g].label}
                  </TableCell>
                ))}
              </TableRow>

              {/* Sub-header row */}
              <TableRow>
                {/* Identity */}
                <TableCell sx={{ ...HEADER, bgcolor: '#F8FAFC', position: 'sticky', left: 0, zIndex: 3, borderBottom: `2px solid ${GROUPS.identity.border}`, width: 110 }}>
                  Name
                </TableCell>
                <TableCell align="center" sx={{ ...HEADER, bgcolor: '#F8FAFC', borderBottom: `2px solid ${GROUPS.identity.border}`, borderRight: `2px solid ${GROUPS.identity.border}`, width: 60 }}>
                  Project
                </TableCell>

                {/* Tasks */}
                {['Unique', 'New', 'Rework', 'Delivered', 'Queue'].map((h, i) => (
                  <Tooltip key={h} title={{ Unique: 'Unique Tasks', New: 'New Tasks', Rework: 'Rework Tasks', Delivered: 'Delivered Tasks', Queue: 'In Delivery Queue' }[h] || h} arrow>
                    <TableCell align="center" sx={{ ...HEADER, bgcolor: GROUPS.tasks.bg, color: GROUPS.tasks.text, borderBottom: `2px solid ${GROUPS.tasks.border}`, borderRight: i === 4 ? `2px solid ${GROUPS.tasks.border}` : undefined, width: 42 }}>
                      {h}
                    </TableCell>
                  </Tooltip>
                ))}

                {/* Quality */}
                {['Rating', 'Agentic', 'Avg Rework', 'Rework %'].map((h, i) => (
                  <Tooltip key={h} title={{ Rating: 'Avg Human Rating', Agentic: 'Avg Agentic Rating', 'Avg Rework': 'Avg Rework (completions/unique - 1)', 'Rework %': 'Rework Percentage' }[h] || h} arrow>
                    <TableCell align="center" sx={{ ...HEADER, bgcolor: GROUPS.quality.bg, color: GROUPS.quality.text, borderBottom: `2px solid ${GROUPS.quality.border}`, borderRight: i === 3 ? `2px solid ${GROUPS.quality.border}` : undefined, width: 46 }}>
                      {h}
                    </TableCell>
                  </Tooltip>
                ))}

                {/* Time & Efficiency */}
                {['AHT', 'Jibble Hrs', 'Acct Hrs', 'Efficiency'].map((h, i) => (
                  <Tooltip key={h} title={{ AHT: 'Average Handling Time', 'Jibble Hrs': 'Jibble Tracked Hours', 'Acct Hrs': 'Accounted Hours (AHT x Unique Tasks)', Efficiency: 'Efficiency % (Accounted / Jibble)' }[h] || h} arrow>
                    <TableCell align="center" sx={{ ...HEADER, bgcolor: GROUPS.time.bg, color: GROUPS.time.text, borderBottom: `2px solid ${GROUPS.time.border}`, borderRight: i === 3 ? `2px solid ${GROUPS.time.border}` : undefined, width: 46 }}>
                      {h}
                    </TableCell>
                  </Tooltip>
                ))}

                {/* Finance */}
                <Tooltip title="Trainer Revenue (delivered x bill rate)" arrow>
                  <TableCell align="center" sx={{ ...HEADER, bgcolor: GROUPS.finance.bg, color: GROUPS.finance.text, borderBottom: `2px solid ${GROUPS.finance.border}`, width: 50 }}>
                    Revenue
                  </TableCell>
                </Tooltip>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredRows.map((row, idx) => {
                if (row.type === 'pod') {
                  return <PodRow key={`pod-${idx}`} row={row} M={M} />
                }
                return <TrainerRow key={`t-${idx}`} row={row} M={M} />
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={16} align="center" sx={{ py: 4, color: '#94A3B8' }}>
                    No data found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// POD Lead header row
// ---------------------------------------------------------------------------

function PodRow({ row, M }: { row: PodHeaderRow; M: React.ComponentType<any> }) {
  const isNoPod = row.podEmail === 'no_pod_lead'
  return (
    <TableRow sx={{ bgcolor: '#EEF2FF', '&:hover': { bgcolor: '#E0E7FF' } }}>
      {/* Name */}
      <TableCell sx={{ ...CELL, position: 'sticky', left: 0, zIndex: 1, bgcolor: '#EEF2FF', borderRight: `1px solid ${GROUPS.identity.border}`, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, overflow: 'hidden' }}>
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: isNoPod ? '#F59E0B' : '#6366F1', flexShrink: 0 }} />
          <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.58rem', fontWeight: 700, color: isNoPod ? '#B45309' : '#312E81', lineHeight: 1.1 }}>
              {row.podName}
            </Typography>
            <Typography noWrap sx={{ fontSize: '0.42rem', color: '#94A3B8', lineHeight: 1 }}>
              {row.trainerCount} trainers
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="center" sx={{ ...CELL, bgcolor: '#EEF2FF', borderRight: `2px solid ${GROUPS.identity.border}`, overflow: 'hidden' }}>
        <Tooltip title={row.projectName || '-'} arrow>
          <Typography noWrap sx={{ fontSize: '0.48rem', color: '#64748B', fontWeight: 600 }}>
            {row.projectName ? row.projectName.replace('Nvidia - ', '') : '-'}
          </Typography>
        </Tooltip>
      </TableCell>

      {/* Tasks */}
      <M value={row.unique_tasks} />
      <M value={row.new_tasks} />
      <M value={row.rework} />
      <M value={row.delivered} />
      <M value={row.in_queue} borderRight={`2px solid ${GROUPS.tasks.border}`} />

      {/* Quality */}
      <M value={row.avg_rating} fmt="dec2" style={getRatingStyle(row.avg_rating)} />
      <M value={row.agentic_rating} fmt="dec2" style={getRatingStyle(row.agentic_rating)} />
      <M value={row.avg_rework} fmt="dec2" style={getAvgReworkStyle(row.avg_rework)} />
      <M value={row.rework_percent} fmt="pct1" style={getReworkPercentStyle(row.rework_percent)} borderRight={`2px solid ${GROUPS.quality.border}`} />

      {/* Time */}
      <M value={row.merged_exp_aht} fmt="dec1" />
      <M value={row.jibble_hours} fmt="dec1" />
      <M value={row.accounted_hours} fmt="dec1" />
      <M value={row.efficiency} fmt="pct" style={getEfficiencyStyle(row.efficiency)} borderRight={`2px solid ${GROUPS.time.border}`} />

      {/* Finance */}
      <M value={row.revenue} fmt="cur" style={row.revenue > 0 ? { color: '#065F46', bgcolor: '#D1FAE5' } : { color: '#94A3B8', bgcolor: 'transparent' }} />
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Trainer data row
// ---------------------------------------------------------------------------

function TrainerRow({ row, M }: { row: TrainerDataRow; M: React.ComponentType<any> }) {
  const t = row.trainer
  return (
    <TableRow sx={{ bgcolor: '#FFFFFF', '&:hover': { bgcolor: '#F8FAFC' } }}>
      {/* Name */}
      <TableCell sx={{ ...CELL, pl: 1, position: 'sticky', left: 0, zIndex: 1, bgcolor: '#FFFFFF', borderRight: `1px solid ${GROUPS.identity.border}`, overflow: 'hidden' }}>
        <Tooltip title={t.trainer_email} arrow placement="right">
          <Typography noWrap sx={{ fontSize: '0.55rem', color: '#475569', fontWeight: 500, lineHeight: 1.1 }}>
            {t.trainer_name}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="center" sx={{ ...CELL, borderRight: `2px solid ${GROUPS.identity.border}`, overflow: 'hidden' }}>
        <Tooltip title={row.projectName || '-'} arrow>
          <Typography noWrap sx={{ fontSize: '0.42rem', color: '#94A3B8' }}>
            {row.projectName ? row.projectName.replace('Nvidia - ', '') : '-'}
          </Typography>
        </Tooltip>
      </TableCell>

      {/* Tasks */}
      <M value={t.unique_tasks} />
      <M value={t.new_tasks} />
      <M value={t.rework} />
      <M value={t.delivered} />
      <M value={t.in_queue} borderRight={`2px solid ${GROUPS.tasks.border}`} />

      {/* Quality */}
      <M value={t.avg_rating} fmt="dec2" style={getRatingStyle(t.avg_rating)} />
      <M value={t.agentic_rating} fmt="dec2" style={getRatingStyle(t.agentic_rating)} />
      <M value={t.avg_rework} fmt="dec2" style={getAvgReworkStyle(t.avg_rework)} />
      <M value={t.rework_percent} fmt="pct1" style={getReworkPercentStyle(t.rework_percent)} borderRight={`2px solid ${GROUPS.quality.border}`} />

      {/* Time */}
      <M value={t.merged_exp_aht} fmt="dec1" />
      <M value={t.jibble_hours > 0 ? t.jibble_hours : null} fmt="dec1" />
      <M value={t.accounted_hours > 0 ? t.accounted_hours : null} fmt="dec1" />
      <M value={t.efficiency} fmt="pct" style={getEfficiencyStyle(t.efficiency)} borderRight={`2px solid ${GROUPS.time.border}`} />

      {/* Finance */}
      <M value={t.revenue > 0 ? t.revenue : null} fmt="cur" style={t.revenue > 0 ? { color: '#065F46', bgcolor: '#D1FAE5' } : { color: '#94A3B8', bgcolor: 'transparent' }} />
    </TableRow>
  )
}
