import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
  FormControl,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tabs,
  Tab,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  AreaChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { getProjectSummary, getProjectFPY, getAnalyticsTimeSeries, getDailyByProject, ProjectSummaryRow, AnalyticsDataPoint } from '../services/api'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { Timeframe, getDateRange } from '../utils/dateUtils'

const BORDER = '1px solid #E2E8F0'
const GROUP_BORDER = '2px solid #CBD5E1'

const headerSx = {
  fontWeight: 700,
  fontSize: '0.7rem',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap' as const,
  py: 0.75,
  px: 1,
  color: '#334155',
  bgcolor: '#F8FAFC',
  borderBottom: BORDER,
}

const cellSx = {
  fontSize: '0.78rem',
  fontWeight: 500,
  py: 0.75,
  px: 1,
  whiteSpace: 'nowrap' as const,
  borderBottom: BORDER,
}

function StatusChip({ status, reasons }: { status: string; reasons: string[] }) {
  const color = status === 'Red' ? '#DC2626' : status === 'Yellow' ? '#D97706' : '#059669'
  return (
    <Tooltip title={reasons.length > 0 ? reasons.join(' | ') : 'All metrics healthy'} arrow>
      <Chip
        label={status}
        size="small"
        variant="outlined"
        sx={{
          color,
          borderColor: color,
          fontWeight: 700,
          fontSize: '0.68rem',
          height: 22,
        }}
      />
    </Tooltip>
  )
}

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '-'
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return '-'
  return `${val.toFixed(1)}%`
}

function fmtCurrency(val: number | null | undefined): string {
  if (val == null || val === 0) return '-'
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const CHART_COLORS = {
  target: '#6366F1',
  delivered: '#10B981',
  reviewerFpy: '#2563EB',
  auditorFpy: '#0D9488',
  reworkRate: '#E11D48',
  avgRework: '#D97706',
  submitted: '#6366F1',
  accounted: '#10B981',
  efficiency: '#F59E0B',
  revenue: '#10B981',
  cost: '#EF4444',
  margin: '#F59E0B',
}

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  fontSize: 12,
  padding: '8px 12px',
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

/* ── KPI Card ── */
function KPICard({ label, value, sub, color, alert }: {
  label: string
  value: string
  sub?: string
  color?: string
  alert?: boolean
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 140,
        px: 2,
        py: 1.5,
        borderRadius: 2.5,
        border: alert ? '1.5px solid #FCA5A5' : '1px solid #E2E8F0',
        bgcolor: alert ? '#FEF2F2' : '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      }}
    >
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: color || '#1E293B', lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>
          {sub}
        </Typography>
      )}
    </Paper>
  )
}

/* ── Account Summary Table ── */
function AccountSummaryTable({ data }: { data: ProjectSummaryRow[] }) {
  const rows = useMemo(() =>
    data.map((r) => {
      const labeling = r.total_team_size || r.resources_labeling_tool || ((r.trainer_count || 0) + (r.pod_lead_count || 0))
      const jibble = r.resources_jibble || 0
      const activeMembers = Math.max(labeling, jibble)
      const revenue = r.revenue || 0
      const cost = r.cost || 0
      const margin = revenue - cost
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : (cost > 0 ? -100 : 0)
      const rag: 'Red' | 'Green' | 'Yellow' = marginPct < 0 ? 'Red' : marginPct < 10 ? 'Yellow' : 'Green'
      return {
        projectId: r.project_id,
        name: r.project_name,
        activeMembers,
        labeling,
        jibble,
        revenue,
        cost,
        margin,
        marginPct,
        rag,
      }
    }),
    [data],
  )

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => ({
        activeMembers: acc.activeMembers + r.activeMembers,
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.cost,
        margin: acc.margin + r.margin,
      }),
      { activeMembers: 0, revenue: 0, cost: 0, margin: 0 },
    )
    const marginPct = t.revenue > 0 ? (t.margin / t.revenue) * 100 : (t.cost > 0 ? -100 : 0)
    return { ...t, marginPct }
  }, [rows])

  const hdr = {
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    color: '#475569',
    bgcolor: '#F1F5F9',
    py: 1,
    px: 2,
    whiteSpace: 'nowrap' as const,
    borderBottom: '2px solid #CBD5E1',
  }
  const cell = {
    fontSize: '0.82rem',
    fontWeight: 500,
    py: 1,
    px: 2,
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #F1F5F9',
    color: '#334155',
  }

  const fmtMargin = (val: number) => {
    if (val === 0) return '$0'
    const abs = Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 })
    return val < 0 ? `-$${abs}` : `$${abs}`
  }

  return (
    <Paper sx={{ overflow: 'hidden', borderRadius: 2, border: '1px solid #E2E8F0' }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...hdr, minWidth: 200, pl: 2.5 }}>PROJECT</TableCell>
              <TableCell align="center" sx={hdr}>TEAM</TableCell>
              <TableCell align="right" sx={hdr}>REVENUE</TableCell>
              <TableCell align="right" sx={hdr}>COST</TableCell>
              <TableCell align="right" sx={hdr}>MARGIN</TableCell>
              <TableCell align="right" sx={hdr}>MARGIN %</TableCell>
              <TableCell align="center" sx={hdr}>STATUS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, idx) => {
              const isNeg = r.margin < 0
              const noData = r.revenue === 0 && r.cost === 0
              return (
                <TableRow
                  key={r.projectId}
                  sx={{
                    bgcolor: idx % 2 === 0 ? '#fff' : '#FAFBFC',
                    '&:hover': { bgcolor: '#F8FAFC' },
                    transition: 'background-color 0.15s',
                  }}
                >
                  <TableCell sx={{ ...cell, pl: 2.5 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.35 }}>
                      {r.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: '#94A3B8', lineHeight: 1.2 }}>
                      ID: {r.projectId}
                    </Typography>
                  </TableCell>
                  <Tooltip title={`Labeling: ${r.labeling} | Jibble: ${r.jibble}`} arrow>
                    <TableCell align="center" sx={{ ...cell, fontWeight: 700, fontSize: '0.88rem' }}>
                      {r.activeMembers}
                    </TableCell>
                  </Tooltip>
                  <TableCell align="right" sx={cell}>
                    {r.revenue > 0 ? fmtCurrency(r.revenue) : <Typography component="span" sx={{ color: '#CBD5E1' }}>-</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={cell}>
                    {r.cost > 0 ? fmtCurrency(r.cost) : <Typography component="span" sx={{ color: '#CBD5E1' }}>-</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{
                    ...cell,
                    fontWeight: 600,
                    color: noData ? '#CBD5E1' : isNeg ? '#DC2626' : '#059669',
                  }}>
                    {noData ? '-' : fmtMargin(r.margin)}
                  </TableCell>
                  <TableCell align="right" sx={{
                    ...cell,
                    fontWeight: 700,
                    color: noData ? '#CBD5E1' : isNeg ? '#DC2626' : '#059669',
                  }}>
                    {noData ? '-' : `${r.marginPct.toFixed(1)}%`}
                  </TableCell>
                  <TableCell align="center" sx={cell}>
                    <Chip
                      label={r.rag}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        height: 22,
                        minWidth: 54,
                        borderColor: r.rag === 'Red' ? '#FCA5A5' : r.rag === 'Yellow' ? '#FCD34D' : '#86EFAC',
                        color: r.rag === 'Red' ? '#DC2626' : r.rag === 'Yellow' ? '#B45309' : '#059669',
                        bgcolor: r.rag === 'Red' ? '#FEF2F2' : r.rag === 'Yellow' ? '#FFFBEB' : '#F0FDF4',
                      }}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
            {/* Totals row */}
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ ...cell, fontWeight: 700, fontSize: '0.82rem', color: '#1E293B', borderTop: '2px solid #CBD5E1', borderBottom: 'none', pl: 2.5 }}>
                Total
              </TableCell>
              <TableCell align="center" sx={{ ...cell, fontWeight: 700, fontSize: '0.88rem', color: '#1E293B', borderTop: '2px solid #CBD5E1', borderBottom: 'none' }}>
                {totals.activeMembers}
              </TableCell>
              <TableCell align="right" sx={{ ...cell, fontWeight: 700, color: '#1E293B', borderTop: '2px solid #CBD5E1', borderBottom: 'none' }}>
                {totals.revenue > 0 ? fmtCurrency(totals.revenue) : '-'}
              </TableCell>
              <TableCell align="right" sx={{ ...cell, fontWeight: 700, color: '#1E293B', borderTop: '2px solid #CBD5E1', borderBottom: 'none' }}>
                {totals.cost > 0 ? fmtCurrency(totals.cost) : '-'}
              </TableCell>
              <TableCell align="right" sx={{
                ...cell,
                fontWeight: 700,
                color: totals.margin < 0 ? '#DC2626' : totals.margin > 0 ? '#059669' : '#1E293B',
                borderTop: '2px solid #CBD5E1', borderBottom: 'none',
              }}>
                {fmtMargin(totals.margin)}
              </TableCell>
              <TableCell align="right" sx={{
                ...cell,
                fontWeight: 700,
                color: totals.marginPct < 0 ? '#DC2626' : totals.marginPct > 0 ? '#059669' : '#1E293B',
                borderTop: '2px solid #CBD5E1', borderBottom: 'none',
              }}>
                {totals.marginPct.toFixed(1)}%
              </TableCell>
              <TableCell align="center" sx={{ ...cell, borderTop: '2px solid #CBD5E1', borderBottom: 'none' }} />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default function ProjectSummary() {
  const [data, setData] = useState<ProjectSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly')
  const [weekOffset, setWeekOffset] = useState(0)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [chartProjectId, setChartProjectId] = useState<number | ''>('')
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [tsData, setTsData] = useState<AnalyticsDataPoint[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [dailyDataMap, setDailyDataMap] = useState<Record<string, AnalyticsDataPoint[]>>({})
  const [dailyLoading, setDailyLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  const dateRange = useMemo(
    () => getDateRange(timeframe, weekOffset, customStartDate, customEndDate),
    [timeframe, weekOffset, customStartDate, customEndDate],
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sd = dateRange.startDate || ''
      const ed = dateRange.endDate || ''
      const [result, dailyMap] = await Promise.all([
        getProjectSummary(sd, ed),
        getDailyByProject(sd, ed),
      ])
      setData(result)
      setDailyDataMap(dailyMap)

      getProjectFPY(dateRange.startDate, dateRange.endDate)
        .then((fpyMap) => {
          setData((prev) =>
            prev.map((row) => {
              const fpy = fpyMap[String(row.project_id)]
              if (!fpy) return row
              return {
                ...row,
                reviewer_fpy_pct: fpy.reviewer_fpy ?? row.reviewer_fpy_pct,
                auditor_fpy_pct: fpy.auditor_fpy ?? row.auditor_fpy_pct,
              }
            })
          )
        })
        .catch(() => {})
    } catch (e: any) {
      setError(e.message || 'Failed to load project summary')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    let cancelled = false
    setTsLoading(true)
    getAnalyticsTimeSeries({
      granularity,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      projectId: chartProjectId || undefined,
    })
      .then((res) => { if (!cancelled) setTsData(res.data) })
      .catch(() => { if (!cancelled) setTsData([]) })
      .finally(() => { if (!cancelled) setTsLoading(false) })
    return () => { cancelled = true }
  }, [granularity, dateRange, chartProjectId])

  const filteredData = useMemo(
    () => chartProjectId ? data.filter((r) => r.project_id === chartProjectId) : data,
    [data, chartProjectId],
  )

  const projectOptions = useMemo(
    () => data.map((r) => ({ id: r.project_id, name: r.project_name })),
    [data],
  )

  // ── Aggregate KPIs across visible projects ──
  const kpis = useMemo(() => {
    if (filteredData.length === 0) return null
    const totalRevenue = filteredData.reduce((s, r) => s + (r.revenue || 0), 0)
    const totalCost = filteredData.reduce((s, r) => s + (r.cost || 0), 0)
    const totalMargin = totalRevenue - totalCost
    const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null
    const totalSubmitted = filteredData.reduce((s, r) => s + (r.hours_submitted || 0), 0)
    const totalAccounted = filteredData.reduce((s, r) => s + (r.accounted_hours || 0), 0)
    const efficiencyPct = totalSubmitted > 0 ? (totalAccounted / totalSubmitted) * 100 : null
    const totalTarget = filteredData.reduce((s, r) => s + (r.target || 0), 0)
    const totalDelivered = filteredData.reduce((s, r) => s + (r.delivered || 0), 0)
    const deliveryPct = totalTarget > 0 ? (totalDelivered / totalTarget) * 100 : null
    const totalTeam = filteredData.reduce((s, r) => s + (r.total_team_size || r.resources_labeling_tool || ((r.trainer_count || 0) + (r.pod_lead_count || 0))), 0)
    const totalJibble = filteredData.reduce((s, r) => s + (r.resources_jibble || 0), 0)
    const redCount = filteredData.filter((r) => r.project_status === 'Red').length
    const yellowCount = filteredData.filter((r) => r.project_status === 'Yellow').length

    // Weighted avg FPY (by delivered count)
    let fpyNum = 0, fpyDen = 0
    filteredData.forEach((r) => {
      if (r.reviewer_fpy_pct != null && r.delivered > 0) {
        fpyNum += r.reviewer_fpy_pct * r.delivered
        fpyDen += r.delivered
      }
    })
    const avgFpy = fpyDen > 0 ? fpyNum / fpyDen : null

    return {
      totalRevenue, totalCost, totalMargin, marginPct,
      totalSubmitted, totalAccounted, efficiencyPct,
      totalTarget, totalDelivered, deliveryPct,
      totalTeam, totalJibble, redCount, yellowCount, avgFpy,
    }
  }, [filteredData])

  useEffect(() => {
    setExpandedProjects(new Set())
  }, [dateRange])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
  }

  const groupHeaderSx = {
    fontWeight: 700,
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    color: '#475569',
    bgcolor: '#F1F5F9',
    py: 0.5,
    px: 1,
    borderBottom: BORDER,
    borderRight: GROUP_BORDER,
  }

  const toggleExpand = (projectId: number) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', mb: 1 }}>
        Project Summary
      </Typography>

      {/* ── Controls row ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        <TimeframeSelector
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          customStartDate={customStartDate}
          onCustomStartDateChange={setCustomStartDate}
          customEndDate={customEndDate}
          onCustomEndDateChange={setCustomEndDate}
          compact
        />

        {activeTab === 1 && (
          <>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                displayEmpty
                value={chartProjectId}
                onChange={(e) => setChartProjectId(e.target.value as number | '')}
                sx={{ fontSize: '0.8rem', height: 36, bgcolor: '#fff' }}
              >
                <MenuItem value="">All Projects</MenuItem>
                {projectOptions.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <ToggleButtonGroup
              size="small"
              exclusive
              value={granularity}
              onChange={(_, v) => { if (v) setGranularity(v) }}
              sx={{ height: 36 }}
            >
              <ToggleButton value="daily" sx={{ fontSize: '0.7rem', px: 1.5, textTransform: 'none' }}>Daily</ToggleButton>
              <ToggleButton value="weekly" sx={{ fontSize: '0.7rem', px: 1.5, textTransform: 'none' }}>Weekly</ToggleButton>
              <ToggleButton value="monthly" sx={{ fontSize: '0.7rem', px: 1.5, textTransform: 'none' }}>Monthly</ToggleButton>
            </ToggleButtonGroup>
          </>
        )}
      </Box>

      {/* ── Tab bar ── */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem' },
          '& .MuiTabs-indicator': { height: 2.5, borderRadius: 2 },
        }}
      >
        <Tab label="Account Summary" />
        <Tab label="Detailed View" />
      </Tabs>

      {/* ───────── TAB 0: Account Summary ───────── */}
      {activeTab === 0 && (
        <AccountSummaryTable data={data} />
      )}

      {/* ───────── TAB 1: Detailed View ───────── */}
      {activeTab === 1 && <>

      {/* ── Executive KPI Strip ── */}
      {kpis && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <KPICard
            label="Revenue"
            value={formatCurrency(kpis.totalRevenue)}
            sub={kpis.marginPct != null ? `Margin ${kpis.marginPct.toFixed(1)}%` : undefined}
            color={kpis.marginPct != null && kpis.marginPct < 10 ? '#DC2626' : '#059669'}
          />
          <KPICard
            label="Delivery"
            value={`${kpis.totalDelivered} / ${fmt(kpis.totalTarget, 0)}`}
            sub={kpis.deliveryPct != null ? `${kpis.deliveryPct.toFixed(0)}% of target` : undefined}
            color={kpis.deliveryPct != null && kpis.deliveryPct < 80 ? '#DC2626' : '#1E293B'}
          />
          <KPICard
            label="Efficiency"
            value={kpis.efficiencyPct != null ? `${kpis.efficiencyPct.toFixed(0)}%` : '-'}
            sub={`${fmt(kpis.totalAccounted, 0)}h accounted / ${fmt(kpis.totalSubmitted, 0)}h submitted`}
            color={kpis.efficiencyPct != null && kpis.efficiencyPct < 50 ? '#DC2626' : '#1E293B'}
          />
          <KPICard
            label="Avg FPY"
            value={kpis.avgFpy != null ? `${kpis.avgFpy.toFixed(1)}%` : '-'}
            sub="Weighted by delivery volume"
            color={kpis.avgFpy != null && kpis.avgFpy < 80 ? '#DC2626' : kpis.avgFpy != null && kpis.avgFpy >= 95 ? '#059669' : '#1E293B'}
          />
          <KPICard
            label="Team"
            value={`${kpis.totalTeam}`}
            sub={`${kpis.totalJibble} on Jibble`}
          />
          <KPICard
            label="At Risk"
            value={`${kpis.redCount}`}
            sub={kpis.yellowCount > 0 ? `${kpis.yellowCount} warning` : 'projects'}
            color={kpis.redCount > 0 ? '#DC2626' : '#059669'}
            alert={kpis.redCount > 0}
          />
        </Box>
      )}

      {/* ── Summary Table (primary view) ── */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, border: '1px solid #E2E8F0', mb: 3 }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 360px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ ...groupHeaderSx, width: 36, p: 0 }} />
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>SUMMARY</TableCell>
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>PEOPLE</TableCell>
                <TableCell colSpan={3} align="center" sx={groupHeaderSx}>HOURS</TableCell>
                <TableCell colSpan={5} align="center" sx={groupHeaderSx}>DELIVERY</TableCell>
                <TableCell colSpan={4} align="center" sx={groupHeaderSx}>QUALITY</TableCell>
                <TableCell colSpan={4} align="center" sx={groupHeaderSx}>FINANCES</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ ...headerSx, minWidth: 160, position: 'sticky', left: 0, zIndex: 3 }}>
                  Project
                </TableCell>
                <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>
                  Status
                </TableCell>
                <Tooltip title="Total team size (Trainers + POD Leads) in the labeling tool" arrow>
                  <TableCell align="center" sx={headerSx}>Labeling Tool</TableCell>
                </Tooltip>
                <Tooltip title="Number of people who logged Jibble hours" arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Jibble</TableCell>
                </Tooltip>
                <Tooltip title="Jibble hours logged in the selected time range" arrow>
                  <TableCell align="center" sx={headerSx}>Submitted</TableCell>
                </Tooltip>
                <Tooltip title="Accounted hours based on task output and AHT" arrow>
                  <TableCell align="center" sx={headerSx}>Accounted</TableCell>
                </Tooltip>
                <Tooltip title="Efficiency: Accounted Hours / Submitted Hours. Above 100% means team is over-delivering vs hours logged." arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Efficiency%</TableCell>
                </Tooltip>
                <Tooltip title="Target tasks based on Jibble hours / AHT" arrow>
                  <TableCell align="center" sx={headerSx}>Target</TableCell>
                </Tooltip>
                <Tooltip title="Tasks delivered + in delivery queue" arrow>
                  <TableCell align="center" sx={headerSx}>Delivered</TableCell>
                </Tooltip>
                <Tooltip title="Tasks currently in Completed status" arrow>
                  <TableCell align="center" sx={headerSx}>Completed</TableCell>
                </Tooltip>
                <Tooltip title="Tasks that have been reviewed" arrow>
                  <TableCell align="center" sx={headerSx}>Reviewed</TableCell>
                </Tooltip>
                <Tooltip title="Delivery%: Delivered / Target. Shows how close the project is to meeting its output goal." arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Delivery%</TableCell>
                </Tooltip>
                <Tooltip title="First Pass Yield: % of tasks accepted on first review without rework" arrow>
                  <TableCell align="center" sx={headerSx}>Reviewer FPY%</TableCell>
                </Tooltip>
                <Tooltip title="First Pass Yield for auditor/calibrator reviews" arrow>
                  <TableCell align="center" sx={headerSx}>Auditor FPY%</TableCell>
                </Tooltip>
                <Tooltip title="Rework rate: (Rework Events / Total Submissions) x 100" arrow>
                  <TableCell align="center" sx={headerSx}>Rework Rate</TableCell>
                </Tooltip>
                <Tooltip title="Average rework iterations per task" arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Avg Rwk/Task</TableCell>
                </Tooltip>
                <TableCell align="center" sx={headerSx}>Revenue</TableCell>
                <TableCell align="center" sx={headerSx}>Cost</TableCell>
                <TableCell align="center" sx={headerSx}>Margin</TableCell>
                <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Margin%</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={21} align="center" sx={{ py: 4, color: '#94A3B8' }}>
                    No project data available for the selected time range
                  </TableCell>
                </TableRow>
              ) : (
                <>
                {filteredData.map((row) => {
                  const teamSize = row.total_team_size || row.resources_labeling_tool || ((row.trainer_count || 0) + (row.pod_lead_count || 0))
                  const peopleFlagged = teamSize > 0 && teamSize < row.resources_jibble
                  const deliveryFlagged = row.target > 0 && row.delivered < row.target
                  const reworkFlagged = row.rework_rate != null && row.rework_rate > 50
                  const marginFlagged = row.margin_pct != null && row.margin_pct < 10
                  const marginYellow = row.margin_pct != null && row.margin_pct >= 10 && row.margin_pct < 30
                  const effPct = row.hours_submitted > 0 ? (row.accounted_hours / row.hours_submitted) * 100 : null
                  const effFlagged = effPct != null && effPct < 50
                  const delPct = row.target > 0 ? (row.delivered / row.target) * 100 : null
                  const delPctFlagged = delPct != null && delPct < 80
                  const isExpanded = expandedProjects.has(row.project_id)
                  const dailyRows = dailyDataMap[String(row.project_id)] || []
                  const red = { color: '#DC2626', fontWeight: 700 }
                  const yellow = { color: '#D97706', fontWeight: 700 }
                  const green = { color: '#059669', fontWeight: 700 }

                  return (
                    <React.Fragment key={row.project_id}>
                    <TableRow
                      hover
                      onClick={() => toggleExpand(row.project_id)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#F0FDF4' },
                        bgcolor: isExpanded ? '#F0FDF4' : 'inherit',
                        borderLeft: isExpanded ? '3px solid #76B900' : '3px solid transparent',
                      }}
                    >
                      <TableCell sx={{ ...cellSx, p: 0, width: 36, textAlign: 'center' }}>
                        <IconButton size="small" sx={{ p: 0.25 }}>
                          {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 700, position: 'sticky', left: 0, bgcolor: isExpanded ? '#F0FDF4' : '#fff', zIndex: 1 }}>
                        {row.project_name}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER }}>
                        <StatusChip status={row.project_status} reasons={row.status_reasons} />
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, ...(peopleFlagged ? red : {}) }}>
                        {teamSize}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER, ...(peopleFlagged ? red : {}) }}>
                        {row.resources_jibble}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmt(row.hours_submitted)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmt(row.accounted_hours)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER, ...(effFlagged ? red : effPct != null && effPct >= 90 ? green : {}) }}>
                        {effPct != null ? `${effPct.toFixed(0)}%` : '-'}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmt(row.target)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, ...(deliveryFlagged ? red : {}) }}>
                        {row.delivered}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {row.completed}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {row.reviewed}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER, ...(delPctFlagged ? red : delPct != null && delPct >= 100 ? green : {}) }}>
                        {delPct != null ? `${delPct.toFixed(0)}%` : '-'}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtPct(row.reviewer_fpy_pct)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtPct(row.auditor_fpy_pct)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, ...(reworkFlagged ? red : {}) }}>
                        {fmtPct(row.rework_rate)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER }}>
                        {row.avg_rework_per_task != null ? row.avg_rework_per_task.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtCurrency(row.revenue)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtCurrency(row.cost)}
                      </TableCell>
                      <TableCell align="center" sx={{
                        ...cellSx,
                        ...(marginFlagged ? red : marginYellow ? yellow : {}),
                      }}>
                        {fmtCurrency(row.margin)}
                      </TableCell>
                      <TableCell align="center" sx={{
                        ...cellSx,
                        borderRight: GROUP_BORDER,
                        ...(marginFlagged ? red : marginYellow ? yellow : {}),
                      }}>
                        {fmtPct(row.margin_pct)}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      dailyRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={21} align="center" sx={{ py: 1.5, color: '#94A3B8', fontSize: '0.75rem', bgcolor: '#FAFBFC', borderBottom: BORDER }}>
                            No daily data available
                          </TableCell>
                        </TableRow>
                      ) : (
                        dailyRows.map((day, idx) => {
                          const dayEff = day.jibble_hours > 0 ? (day.accounted_hours / day.jibble_hours) * 100 : null
                          const dayTarget = day.target || 0
                          const dayDelPct = dayTarget > 0 ? (day.delivered / dayTarget) * 100 : null
                          const dayMarginPct = day.revenue > 0 && day.margin != null ? (day.margin / day.revenue) * 100 : null
                          const daySx = {
                            ...cellSx,
                            fontSize: '0.72rem',
                            fontWeight: 400,
                            color: '#475569',
                            bgcolor: idx % 2 === 0 ? '#FAFBFC' : '#F5F7FA',
                            py: 0.5,
                          }
                          return (
                            <TableRow key={day.period}>
                              <TableCell sx={{ ...daySx, p: 0, width: 36 }} />
                              {/* SUMMARY: Date + Status */}
                              <TableCell sx={{ ...daySx, fontWeight: 600, pl: 3, position: 'sticky', left: 0, zIndex: 1 }}>
                                {day.period_label}
                              </TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER }}>-</TableCell>
                              {/* PEOPLE: Labeling Tool + Jibble */}
                              <TableCell align="center" sx={daySx}>{day.labeling_tool_people > 0 ? day.labeling_tool_people : '-'}</TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER }}>{day.jibble_people > 0 ? day.jibble_people : '-'}</TableCell>
                              {/* HOURS: Submitted + Accounted + Efficiency% */}
                              <TableCell align="center" sx={daySx}>{day.jibble_hours > 0 ? day.jibble_hours.toFixed(1) : '-'}</TableCell>
                              <TableCell align="center" sx={daySx}>{day.accounted_hours > 0 ? day.accounted_hours.toFixed(1) : '-'}</TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER, ...(dayEff != null && dayEff < 50 ? red : dayEff != null && dayEff >= 90 ? green : {}) }}>
                                {dayEff != null ? `${dayEff.toFixed(0)}%` : '-'}
                              </TableCell>
                              {/* DELIVERY: Target + Delivered + Completed + Reviewed + Delivery% */}
                              <TableCell align="center" sx={daySx}>{dayTarget > 0 ? fmt(dayTarget) : '-'}</TableCell>
                              <TableCell align="center" sx={daySx}>{day.delivered > 0 ? day.delivered : '-'}</TableCell>
                              <TableCell align="center" sx={daySx}>{day.completed > 0 ? day.completed : '-'}</TableCell>
                              <TableCell align="center" sx={daySx}>{day.reviewed > 0 ? day.reviewed : '-'}</TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER, ...(dayDelPct != null && dayDelPct < 80 ? red : dayDelPct != null && dayDelPct >= 100 ? green : {}) }}>
                                {dayDelPct != null ? `${dayDelPct.toFixed(0)}%` : '-'}
                              </TableCell>
                              {/* QUALITY: Reviewer FPY% + Auditor FPY% + Rework Rate + Avg Rwk/Task */}
                              <TableCell align="center" sx={daySx}>{fmtPct(day.reviewer_fpy_pct)}</TableCell>
                              <TableCell align="center" sx={daySx}>{fmtPct(day.auditor_fpy_pct)}</TableCell>
                              <TableCell align="center" sx={daySx}>{fmtPct(day.rework_percent)}</TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER }}>{day.avg_rework_per_task != null ? day.avg_rework_per_task.toFixed(2) : '-'}</TableCell>
                              {/* FINANCES: Revenue + Cost + Margin + Margin% */}
                              <TableCell align="center" sx={daySx}>{fmtCurrency(day.revenue)}</TableCell>
                              <TableCell align="center" sx={daySx}>{fmtCurrency(day.cost)}</TableCell>
                              <TableCell align="center" sx={{ ...daySx, ...(dayMarginPct != null && dayMarginPct < 10 ? red : dayMarginPct != null && dayMarginPct < 30 ? yellow : {}) }}>
                                {fmtCurrency(day.margin)}
                              </TableCell>
                              <TableCell align="center" sx={{ ...daySx, borderRight: GROUP_BORDER, ...(dayMarginPct != null && dayMarginPct < 10 ? red : dayMarginPct != null && dayMarginPct < 30 ? yellow : {}) }}>
                                {dayMarginPct != null ? `${dayMarginPct.toFixed(1)}%` : '-'}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )
                    )}
                    </React.Fragment>
                  )
                })}
                {/* ── Totals row ── */}
                {(() => {
                  const t = filteredData.reduce((acc, row) => {
                    const teamSize = row.total_team_size || row.resources_labeling_tool || ((row.trainer_count || 0) + (row.pod_lead_count || 0))
                    acc.labeling += teamSize
                    acc.jibble += row.resources_jibble || 0
                    acc.submitted += row.hours_submitted || 0
                    acc.accounted += row.accounted_hours || 0
                    acc.target += row.target || 0
                    acc.delivered += row.delivered || 0
                    acc.completed += row.completed || 0
                    acc.reviewed += row.reviewed || 0
                    acc.revenue += row.revenue || 0
                    acc.cost += row.cost || 0
                    acc.margin += row.margin || 0
                    if (row.reviewer_fpy_pct != null && row.delivered > 0) {
                      acc.rfpyNum += row.reviewer_fpy_pct * row.delivered
                      acc.rfpyDen += row.delivered
                    }
                    if (row.auditor_fpy_pct != null && row.delivered > 0) {
                      acc.afpyNum += row.auditor_fpy_pct * row.delivered
                      acc.afpyDen += row.delivered
                    }
                    if (row.rework_rate != null && row.delivered > 0) {
                      acc.rwkNum += row.rework_rate * row.delivered
                      acc.rwkDen += row.delivered
                    }
                    if (row.avg_rework_per_task != null && row.delivered > 0) {
                      acc.avgRwkNum += row.avg_rework_per_task * row.delivered
                      acc.avgRwkDen += row.delivered
                    }
                    return acc
                  }, {
                    labeling: 0, jibble: 0, submitted: 0, accounted: 0,
                    target: 0, delivered: 0, completed: 0, reviewed: 0,
                    revenue: 0, cost: 0, margin: 0,
                    rfpyNum: 0, rfpyDen: 0, afpyNum: 0, afpyDen: 0,
                    rwkNum: 0, rwkDen: 0, avgRwkNum: 0, avgRwkDen: 0,
                  })
                  const effPct = t.submitted > 0 ? (t.accounted / t.submitted) * 100 : null
                  const delPct = t.target > 0 ? (t.delivered / t.target) * 100 : null
                  const marginPct = t.revenue > 0 ? (t.margin / t.revenue) * 100 : null
                  const reviewerFpy = t.rfpyDen > 0 ? t.rfpyNum / t.rfpyDen : null
                  const auditorFpy = t.afpyDen > 0 ? t.afpyNum / t.afpyDen : null
                  const reworkRate = t.rwkDen > 0 ? t.rwkNum / t.rwkDen : null
                  const avgRwk = t.avgRwkDen > 0 ? t.avgRwkNum / t.avgRwkDen : null
                  const tBold = { ...cellSx, fontWeight: 700, bgcolor: '#F1F5F9', borderTop: '2px solid #CBD5E1' }

                  return (
                    <TableRow>
                      <TableCell sx={tBold} />
                      <TableCell sx={{ ...tBold, position: 'sticky', left: 0, zIndex: 1 }}>Total</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }} />
                      <TableCell align="center" sx={tBold}>{t.labeling}</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }}>{t.jibble}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmt(t.submitted)}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmt(t.accounted)}</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }}>{effPct != null ? `${effPct.toFixed(0)}%` : '-'}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmt(t.target)}</TableCell>
                      <TableCell align="center" sx={tBold}>{t.delivered}</TableCell>
                      <TableCell align="center" sx={tBold}>{t.completed}</TableCell>
                      <TableCell align="center" sx={tBold}>{t.reviewed}</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }}>{delPct != null ? `${delPct.toFixed(0)}%` : '-'}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtPct(reviewerFpy)}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtPct(auditorFpy)}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtPct(reworkRate)}</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }}>{avgRwk != null ? avgRwk.toFixed(2) : '-'}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtCurrency(t.revenue)}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtCurrency(t.cost)}</TableCell>
                      <TableCell align="center" sx={tBold}>{fmtCurrency(t.margin)}</TableCell>
                      <TableCell align="center" sx={{ ...tBold, borderRight: GROUP_BORDER }}>{fmtPct(marginPct)}</TableCell>
                    </TableRow>
                  )
                })()}
                </>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* ── Charts 2x2 grid ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* Delivery + Delivery% Chart */}
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden', bgcolor: '#FAFBFD' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #E2E8F0', background: `linear-gradient(135deg, ${CHART_COLORS.delivered}0A 0%, ${CHART_COLORS.delivered}04 100%)`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_COLORS.delivered, flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Delivery</Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.68rem', ml: 0.5 }}>Tasks produced vs target capacity</Typography>
          </Box>
          <Box sx={{ px: 1, py: 1, height: 280 }}>
            {tsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={28} /></Box>
            ) : tsData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>No data</Typography></Box>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis yAxisId="count" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={45} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 150]} tick={{ fontSize: 11, fill: '#F59E0B' }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="count" dataKey="target" name="Target" fill={CHART_COLORS.target} radius={[4, 4, 0, 0]} barSize={18} fillOpacity={0.8} />
                  <Bar yAxisId="count" dataKey="delivered" name="Delivered" fill={CHART_COLORS.delivered} radius={[4, 4, 0, 0]} barSize={18} fillOpacity={0.8} />
                  <ReferenceLine yAxisId="pct" y={100} stroke="#94A3B8" strokeDasharray="6 4" label={{ value: '100%', fill: '#94A3B8', fontSize: 10, position: 'right' }} />
                  <Line yAxisId="pct" type="monotone" dataKey="efficiency_percent" name="Efficiency%" stroke={CHART_COLORS.efficiency} strokeWidth={2} dot={{ r: 2.5, fill: CHART_COLORS.efficiency, strokeWidth: 0 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>

        {/* Quality Chart */}
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden', bgcolor: '#FAFBFD' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #E2E8F0', background: `linear-gradient(135deg, ${CHART_COLORS.reviewerFpy}0A 0%, ${CHART_COLORS.reviewerFpy}04 100%)`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_COLORS.reviewerFpy, flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Quality</Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.68rem', ml: 0.5 }}>FPY%, Rework Rate & Avg Rework/Task over time</Typography>
          </Box>
          <Box sx={{ px: 1, py: 1, height: 280 }}>
            {tsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={28} /></Box>
            ) : tsData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>No data</Typography></Box>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v}%`} />
                  <YAxis yAxisId="ratio" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 11, fill: CHART_COLORS.avgRework }} tickLine={false} axisLine={false} width={35} />
                  <RTooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => {
                    if (v == null) return ['-']
                    if (name === 'Avg Rwk/Task') return [Number(v).toFixed(2)]
                    return [`${Number(v).toFixed(1)}%`]
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="pct" y={95} stroke="#10B981" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: 'Target 95%', fill: '#10B981', fontSize: 10, position: 'right' }} />
                  <Line yAxisId="pct" type="monotone" dataKey="reviewer_fpy_pct" name="Reviewer FPY%" stroke={CHART_COLORS.reviewerFpy} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.reviewerFpy, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls />
                  <Line yAxisId="pct" type="monotone" dataKey="auditor_fpy_pct" name="Auditor FPY%" stroke={CHART_COLORS.auditorFpy} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.auditorFpy, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls />
                  <Line yAxisId="pct" type="monotone" dataKey="rework_percent" name="Rework Rate%" stroke={CHART_COLORS.reworkRate} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2.5, fill: CHART_COLORS.reworkRate, strokeWidth: 0 }} connectNulls />
                  <Line yAxisId="ratio" type="monotone" dataKey="avg_rework_per_task" name="Avg Rwk/Task" stroke={CHART_COLORS.avgRework} strokeWidth={2} dot={{ r: 2.5, fill: CHART_COLORS.avgRework, strokeWidth: 0 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>

        {/* Hours Utilization Chart */}
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden', bgcolor: '#FAFBFD' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #E2E8F0', background: `linear-gradient(135deg, ${CHART_COLORS.submitted}0A 0%, ${CHART_COLORS.submitted}04 100%)`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_COLORS.submitted, flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Hours Utilization</Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.68rem', ml: 0.5 }}>Gap = hours paid but not accounted for in output</Typography>
          </Box>
          <Box sx={{ px: 1, py: 1, height: 280 }}>
            {tsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={28} /></Box>
            ) : tsData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>No data</Typography></Box>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradSubmitted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.submitted} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.submitted} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradAccounted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.accounted} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.accounted} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis yAxisId="hrs" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={45} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 150]} tick={{ fontSize: 11, fill: '#F59E0B' }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => {
                    if (name === 'Efficiency%') return v != null ? [`${Number(v).toFixed(1)}%`] : ['-']
                    return v != null ? [`${Number(v).toFixed(1)}h`] : ['-']
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="hrs" type="monotone" dataKey="jibble_hours" name="Submitted" stroke={CHART_COLORS.submitted} fill="url(#gradSubmitted)" strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.submitted, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                  <Area yAxisId="hrs" type="monotone" dataKey="accounted_hours" name="Accounted" stroke={CHART_COLORS.accounted} fill="url(#gradAccounted)" strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.accounted, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                  <ReferenceLine yAxisId="pct" y={100} stroke="#94A3B8" strokeDasharray="6 4" label={{ value: '100%', fill: '#94A3B8', fontSize: 10, position: 'right' }} />
                  <Line yAxisId="pct" type="monotone" dataKey="efficiency_percent" name="Efficiency%" stroke={CHART_COLORS.efficiency} strokeWidth={2} dot={{ r: 2.5, fill: CHART_COLORS.efficiency, strokeWidth: 0 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>

        {/* Finance P&L Chart */}
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden', bgcolor: '#FAFBFD' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #E2E8F0', background: `linear-gradient(135deg, ${CHART_COLORS.revenue}0A 0%, ${CHART_COLORS.revenue}04 100%)`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CHART_COLORS.revenue, flexShrink: 0 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B' }}>Finance P&L</Typography>
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.68rem', ml: 0.5 }}>Revenue vs Cost with margin% trend</Typography>
          </Box>
          <Box sx={{ px: 1, py: 1, height: 280 }}>
            {tsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={28} /></Box>
            ) : tsData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>No data</Typography></Box>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis yAxisId="money" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={55} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis yAxisId="pct" orientation="right" domain={[-50, 100]} tick={{ fontSize: 11, fill: '#F59E0B' }} tickLine={false} axisLine={false} width={42} tickFormatter={(v) => `${v}%`} />
                  <RTooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: any, name: string) => {
                      if (name === 'Margin%') return value != null ? [`${Number(value).toFixed(1)}%`] : ['-']
                      return [formatCurrency(Number(value))]
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="pct" y={0} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Break-even', fill: '#EF4444', fontSize: 9, position: 'right' }} />
                  <Bar yAxisId="money" dataKey="revenue" name="Revenue" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} barSize={18} fillOpacity={0.8} />
                  <Bar yAxisId="money" dataKey="cost" name="Cost" fill={CHART_COLORS.cost} radius={[4, 4, 0, 0]} barSize={18} fillOpacity={0.7} />
                  <Line yAxisId="pct" type="monotone" dataKey="margin_percent" name="Margin%" stroke={CHART_COLORS.margin} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.margin, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>
      </Box>

      </>}
    </Box>
  )
}
