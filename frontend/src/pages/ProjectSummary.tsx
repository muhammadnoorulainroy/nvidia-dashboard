import { useState, useEffect, useCallback } from 'react'
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
} from '@mui/material'
import { getProjectSummary, getProjectFPY, ProjectSummaryRow } from '../services/api'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { Timeframe, DateRange, getDateRange } from '../utils/dateUtils'

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

export default function ProjectSummary() {
  const [data, setData] = useState<ProjectSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly')
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('weekly'))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getProjectSummary(dateRange.startDate, dateRange.endDate)
      setData(result)

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

  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf)
    setDateRange(getDateRange(tf))
  }

  const handleDateRangeChange = (dr: DateRange) => setDateRange(dr)

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

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E293B', mb: 1 }}>
        Project Summary
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <TimeframeSelector
          timeframe={timeframe}
          dateRange={dateRange}
          onTimeframeChange={handleTimeframeChange}
          onDateRangeChange={handleDateRangeChange}
        />
      </Box>

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, border: '1px solid #E2E8F0' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 180px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              {/* Group header row */}
              <TableRow>
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>SUMMARY</TableCell>
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>PEOPLE</TableCell>
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>HOURS</TableCell>
                <TableCell colSpan={2} align="center" sx={groupHeaderSx}>DELIVERY</TableCell>
                <TableCell colSpan={3} align="center" sx={groupHeaderSx}>QUALITY</TableCell>
                <TableCell colSpan={4} align="center" sx={groupHeaderSx}>FINANCES</TableCell>
              </TableRow>
              {/* Column sub-headers */}
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
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Accounted</TableCell>
                </Tooltip>
                <Tooltip title="Target tasks based on Jibble hours / AHT" arrow>
                  <TableCell align="center" sx={headerSx}>Target</TableCell>
                </Tooltip>
                <Tooltip title="Tasks delivered + in delivery queue" arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Delivered</TableCell>
                </Tooltip>
                <Tooltip title="First Pass Yield: % of tasks accepted on first review without rework" arrow>
                  <TableCell align="center" sx={headerSx}>Reviewer FPY%</TableCell>
                </Tooltip>
                <Tooltip title="First Pass Yield for auditor/calibrator reviews" arrow>
                  <TableCell align="center" sx={headerSx}>Auditor FPY%</TableCell>
                </Tooltip>
                <Tooltip title="Rework rate: (Rework Events / Total Submissions) × 100" arrow>
                  <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Rework Rate</TableCell>
                </Tooltip>
                <Tooltip title="Average rework iterations per task" arrow>
                  <TableCell align="center" sx={headerSx}>Avg Rwk/Task</TableCell>
                </Tooltip>
                <TableCell align="center" sx={headerSx}>Revenue</TableCell>
                <TableCell align="center" sx={headerSx}>Cost</TableCell>
                <TableCell align="center" sx={{ ...headerSx, borderRight: GROUP_BORDER }}>Margin</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} align="center" sx={{ py: 4, color: '#94A3B8' }}>
                    No project data available for the selected time range
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => {
                  const teamSize = row.total_team_size || row.resources_labeling_tool || ((row.trainer_count || 0) + (row.pod_lead_count || 0))
                  const peopleFlagged = teamSize > 0 && teamSize < row.resources_jibble
                  const deliveryFlagged = row.target > 0 && row.delivered < row.target
                  const reworkFlagged = row.rework_rate != null && row.rework_rate > 50
                  const marginFlagged = row.margin_pct != null && row.margin_pct < 10
                  const marginYellow = row.margin_pct != null && row.margin_pct >= 10 && row.margin_pct < 30
                  const red = { color: '#DC2626', fontWeight: 700 }
                  const yellow = { color: '#D97706', fontWeight: 700 }

                  return (
                    <TableRow key={row.project_id} hover sx={{ '&:hover': { bgcolor: '#FAFAFA' } }}>
                      <TableCell sx={{ ...cellSx, fontWeight: 700, position: 'sticky', left: 0, bgcolor: '#fff', zIndex: 1 }}>
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
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER }}>
                        {fmt(row.accounted_hours)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmt(row.target)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER, ...(deliveryFlagged ? red : {}) }}>
                        {row.delivered}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtPct(row.reviewer_fpy_pct)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
                        {fmtPct(row.auditor_fpy_pct)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...cellSx, borderRight: GROUP_BORDER, ...(reworkFlagged ? red : {}) }}>
                        {fmtPct(row.rework_rate)}
                      </TableCell>
                      <TableCell align="center" sx={cellSx}>
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
                        borderRight: GROUP_BORDER,
                        ...(marginFlagged ? red : marginYellow ? yellow : {}),
                      }}>
                        {fmtCurrency(row.margin)}
                        {row.margin_pct != null && (
                          <Typography component="span" sx={{ fontSize: '0.6rem', ml: 0.5, color: 'inherit' }}>
                            ({row.margin_pct}%)
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}
