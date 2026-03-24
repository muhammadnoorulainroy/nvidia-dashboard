import { useState, useEffect, useMemo, useCallback } from 'react'
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
  Tabs,
  Tab,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  CircularProgress,
  Alert,
  IconButton,
  Link,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  Snackbar,
} from '@mui/material'
import {
  CheckCircleOutline as PassIcon,
  HighlightOff as FailIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  LocalShipping as ShipIcon,
  FactCheck as FactCheckIcon,
  Assessment as AssessmentIcon,
  Grading as GradingIcon,
  ArrowForward as ArrowIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  OpenInNew as OpenInNewIcon,
  Refresh as RefreshIcon,
  Share as ShareIcon,
  ContentCopy as CopyIcon,
  LinkOff as RevokeIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import {
  getQualityRubricsData,
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type QualityRubricsData,
  type ShareLink as ShareLinkType,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { type Timeframe, getDateRange } from '../utils/dateUtils'

// ============================================================================
// CONSTANTS
// ============================================================================

const HEADER_BORDER = '1px solid #CBD5E1'
const CAT_BORDER = '2px solid #94A3B8'

// Sticky header row heights (px) for proper stacking on scroll
const CONTROLS_BAR_H = 48
const ROW1_H = 28
const ROW2_H = 24

// ============================================================================
// STYLE HELPERS
// ============================================================================

const getFPYStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v >= 80) return { color: '#334155', bgcolor: 'transparent' }
  return { color: '#DC2626', bgcolor: 'transparent' }
}

const getReworkStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v <= 20) return { color: '#334155', bgcolor: 'transparent' }
  return { color: '#DC2626', bgcolor: 'transparent' }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Green': return { main: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' }
    case 'Yellow': return { main: '#92400E', bg: '#FEF3C7', border: '#FCD34D' }
    case 'Red': return { main: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' }
    default: return { main: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
  }
}

// ============================================================================
// DAILY ROLLUP TAB
// ============================================================================

function StatCard({ label, value, color, bg, border, icon, subtitle, width }: {
  label: string; value: string | number; color: string; bg: string; border: string;
  icon?: React.ReactNode; subtitle?: string; width?: string | number
}) {
  return (
    <Paper sx={{
      p: 2, borderRadius: 2, border: `1px solid ${border}`, bgcolor: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
      minWidth: width || 130, flex: 1,
      transition: 'transform 0.15s, box-shadow 0.15s',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 4px 12px ${border}40` },
    }}>
      {icon && <Box sx={{ color, opacity: 0.8, mb: 0.5 }}>{icon}</Box>}
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color, opacity: 0.75, textAlign: 'center' }}>
        {label}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: '0.6rem', color: '#64748B', textAlign: 'center', mt: 0.25 }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  )
}

function FPYGauge({ label, value, target, action }: { label: string; value: number; target: number; action?: string }) {
  const met = value >= target
  const color = met ? '#065F46' : '#991B1B'
  const trackBg = met ? '#BBF7D0' : '#FECACA'
  const bg = met ? '#D1FAE5' : '#FEE2E2'
  return (
    <Box sx={{ flex: 1, minWidth: 180 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color }}>{value}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(value, 100)}
        sx={{
          height: 10, borderRadius: 5, bgcolor: trackBg,
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 5 },
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography sx={{ fontSize: '0.6rem', color: '#94A3B8' }}>0%</Typography>
        <Chip
          label={met ? 'Target Met' : `Target: ≥${target}%`}
          size="small"
          sx={{ height: 16, fontSize: '0.55rem', fontWeight: 600, bgcolor: bg, color, border: 'none' }}
        />
        <Typography sx={{ fontSize: '0.6rem', color: '#94A3B8' }}>100%</Typography>
      </Box>
      {action && (
        <Typography sx={{ fontSize: '0.6rem', color: '#64748B', mt: 0.25, fontStyle: 'italic' }}>
          {action}
        </Typography>
      )}
    </Box>
  )
}

function FPYOverallStatusBar({ data }: { data: QualityRubricsData['daily_rollup'] }) {
  const sc = getStatusColor(data.overall_status)
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', position: 'sticky', left: 0 }}>
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #E2E8F0', flex: 2, minWidth: 300 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E293B', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          First Pass Yield
        </Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <FPYGauge label="Reviewer FPY" value={data.reviewer_fpy} target={95} action={data.reviewer_fpy_action} />
          <FPYGauge label="Auditor FPY" value={data.auditor_fpy} target={95} action={data.auditor_fpy_action} />
        </Box>
      </Paper>

      <Paper sx={{
        p: 2, borderRadius: 2, border: `2px solid ${sc.border}`, bgcolor: sc.bg,
        flex: 0, minWidth: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75,
      }}>
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: sc.main, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Overall Status
        </Typography>
        <Tooltip arrow title={
          <Box sx={{ fontSize: '0.7rem', lineHeight: 1.6 }}>
            <b>Based on Reviewer FPY:</b><br />
            Good: FPY &ge; 95%<br />
            OK: FPY &ge; 80%<br />
            Risk: FPY &lt; 80%<br />
            N/A: No reviews yet
          </Box>
        }>
          <Box sx={{
            width: 50, height: 50, borderRadius: '50%', bgcolor: sc.main,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 16px ${sc.main}40`, cursor: 'help',
          }}>
            <Typography sx={{ color: '#FFF', fontWeight: 800, fontSize: '0.85rem' }}>
              {data.overall_status.toUpperCase()}
            </Typography>
          </Box>
        </Tooltip>
        <Typography sx={{ fontSize: '0.55rem', color: '#64748B' }}>
          Updated: {data.updated_date || '--'}
        </Typography>
      </Paper>
    </Box>
  )
}

function DailyRollupView({ data }: { data: QualityRubricsData['daily_rollup'] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <FPYOverallStatusBar data={data} />

      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E2E8F0' }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Review Pipeline
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatCard label="L1 Annotations" value={data.total_annotations_l1} color="#1E40AF" bg="#EFF6FF" border="#93C5FD" icon={<GradingIcon sx={{ fontSize: 20 }} />} />
          <ArrowIcon sx={{ color: '#CBD5E1', fontSize: 20, flexShrink: 0 }} />
          <StatCard label="L2 Reviewed" value={data.total_reviewed_l2} color="#6D28D9" bg="#F5F3FF" border="#C4B5FD" icon={<AssessmentIcon sx={{ fontSize: 20 }} />} subtitle={data.total_reviewed_l2_action || undefined} />
          <ArrowIcon sx={{ color: '#CBD5E1', fontSize: 20, flexShrink: 0 }} />
          <StatCard label="L2 Passed" value={data.total_passed_l2} color="#065F46" bg="#ECFDF5" border="#6EE7B7" icon={<PassIcon sx={{ fontSize: 20 }} />} />
          <StatCard label="Flagged for Rework" value={data.total_flagged_rework} color="#92400E" bg="#FFFBEB" border="#FCD34D" icon={<WarningIcon sx={{ fontSize: 20 }} />} subtitle={data.total_flagged_rework_action || undefined} />
        </Box>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E2E8F0' }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Calibration
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatCard label="Total Calibrated" value={data.total_calibrated} color="#1E40AF" bg="#EFF6FF" border="#93C5FD" icon={<FactCheckIcon sx={{ fontSize: 20 }} />} />
          <ArrowIcon sx={{ color: '#CBD5E1', fontSize: 20, flexShrink: 0 }} />
          <StatCard label="Passed Calibration" value={data.passed_calibrator} color="#065F46" bg="#ECFDF5" border="#6EE7B7" icon={<PassIcon sx={{ fontSize: 20 }} />} />
          <StatCard label="Failed Calibration" value={data.failed_calibration} color="#991B1B" bg="#FEF2F2" border="#FCA5A5" icon={<ErrorIcon sx={{ fontSize: 20 }} />} subtitle={data.failed_calibration_action || undefined} />
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E2E8F0', flex: 1, minWidth: 300 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Defects
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <StatCard label="Total Defects" value={data.total_defects} color="#991B1B" bg="#FEF2F2" border="#FCA5A5" icon={<ErrorIcon sx={{ fontSize: 20 }} />} />
            <StatCard label="High Severity" value={data.high_severity} color="#991B1B" bg="#FEF2F2" border="#FCA5A5" />
            <StatCard label="Medium Severity" value={data.medium_severity} color="#B45309" bg="#FEF3C7" border="#FCD34D" />
            <StatCard label="Ready to Ship" value={data.total_ready_to_ship} color="#065F46" bg="#ECFDF5" border="#6EE7B7" icon={<ShipIcon sx={{ fontSize: 20 }} />} />
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

// ============================================================================
// BATCH QUALITY TAB
// ============================================================================

function FPYCell({ value }: { value: number | null }) {
  if (value === null) return (
    <TableCell align="center" sx={{ fontSize: '0.7rem', color: '#CBD5E1' }}>--</TableCell>
  )
  const s = getFPYStyle(value)
  return (
    <TableCell align="center" sx={{ ...s, fontWeight: 700, fontSize: '0.75rem' }}>
      {value}%
    </TableCell>
  )
}

function ReworkCell({ value }: { value: number | null }) {
  if (value === null) return (
    <TableCell align="center" sx={{ fontSize: '0.7rem', color: '#CBD5E1' }}>--</TableCell>
  )
  const s = getReworkStyle(value)
  return (
    <TableCell align="center" sx={{ ...s, fontWeight: 700, fontSize: '0.75rem' }}>
      {value}%
    </TableCell>
  )
}

function BatchQualityView({ batchData, rubricFpy }: {
  batchData: QualityRubricsData['batch_quality']
  rubricFpy: QualityRubricsData['rubric_fpy']
  categories: QualityRubricsData['rubric_categories']
}) {
  const batchesWithData = batchData.filter((b) => b.source !== 'pending')
  const avgFPY = batchesWithData.length > 0
    ? batchesWithData.reduce((s, b) => s + (b.reviewer_to_trainer_fpy ?? 0), 0) / batchesWithData.length
    : null
  const avgAuditorFPY = batchesWithData.length > 0
    ? batchesWithData.reduce((s, b) => s + (b.auditor_to_reviewer_fpy ?? 0), 0) / batchesWithData.length
    : null

  return (
    <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', xl: 'row' }, alignItems: 'flex-start' }}>
      {/* Per-Rubric Pass Rates — LEFT / TOP */}
      <Paper sx={{ flex: 1, borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden', minWidth: 0 }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
            Per-Rubric Pass Rates
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: '#64748B', mt: 0.25 }}>
            First Pass Yield and Rework % for each rubric category and item
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: '#F1F5F9', color: '#475569', borderBottom: '2px solid #CBD5E1' }}>
                  Rubric Item
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#EFF6FF', color: '#1E40AF', borderBottom: '2px solid #93C5FD', width: 75 }}>
                  Reviewer<br />FPY%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#EFF6FF', color: '#1E40AF', borderBottom: '2px solid #93C5FD', width: 75 }}>
                  Reviewer<br />Rework%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#F0FDF4', color: '#166534', borderBottom: '2px solid #86EFAC', width: 75 }}>
                  Auditor<br />FPY%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#F0FDF4', color: '#166534', borderBottom: '2px solid #86EFAC', width: 75 }}>
                  Auditor<br />Rework%
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rubricFpy.map((item) => {
                const isCatSummary = item.is_category_summary

                if (isCatSummary) {
                  return (
                    <TableRow key={`cat-${item.category}`} sx={{ bgcolor: '#F8FAFC' }}>
                      <TableCell sx={{
                        fontWeight: 800, fontSize: '0.75rem', color: '#1E293B',
                        borderTop: '2px solid #E2E8F0', py: 0.5,
                      }}>
                        {item.category}
                      </TableCell>
                      <FPYCell value={item.reviewer_fpy} />
                      <ReworkCell value={item.reviewer_rework} />
                      <FPYCell value={item.auditor_fpy} />
                      <ReworkCell value={item.auditor_rework} />
                    </TableRow>
                  )
                }

                return (
                  <TableRow key={item.rubric_item} sx={{ '&:hover': { bgcolor: '#F8FAFC' } }}>
                    <TableCell sx={{ fontSize: '0.7rem', color: '#334155', pl: 2.5, py: 0.4 }}>
                      {item.rubric_item}
                    </TableCell>
                    <FPYCell value={item.reviewer_fpy} />
                    <ReworkCell value={item.reviewer_rework} />
                    <FPYCell value={item.auditor_fpy} />
                    <ReworkCell value={item.auditor_rework} />
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Batch Quality Summary — RIGHT / BOTTOM */}
      <Paper sx={{ flex: 1, borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden', minWidth: 0 }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
            Batch Quality Summary
          </Typography>
          {avgFPY !== null && (
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              <Chip label={`Avg Reviewer FPY: ${avgFPY.toFixed(1)}%`} size="small" sx={{ ...getFPYStyle(avgFPY), fontWeight: 600, fontSize: '0.6rem', height: 20, border: '1px solid #E2E8F0' }} />
              <Chip label={`Avg Auditor FPY: ${(avgAuditorFPY ?? 0).toFixed(1)}%`} size="small" sx={{ ...getFPYStyle(avgAuditorFPY), fontWeight: 600, fontSize: '0.6rem', height: 20, border: '1px solid #E2E8F0' }} />
            </Box>
          )}
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: '#F1F5F9', color: '#475569', borderBottom: '2px solid #CBD5E1', width: 100 }}>
                  Batch
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#EFF6FF', color: '#1E40AF', borderBottom: '2px solid #93C5FD' }}>
                  Reviewer → Trainer<br />FPY%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#EFF6FF', color: '#1E40AF', borderBottom: '2px solid #93C5FD' }}>
                  Reviewer → Trainer<br />Rework%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#F0FDF4', color: '#166534', borderBottom: '2px solid #86EFAC' }}>
                  Auditor → Reviewer<br />FPY%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#F0FDF4', color: '#166534', borderBottom: '2px solid #86EFAC' }}>
                  Auditor → Trainer<br />Rework%
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.6rem', bgcolor: '#F1F5F9', color: '#475569', borderBottom: '2px solid #CBD5E1', width: 50 }}>
                  Tasks
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batchData.map((row) => (
                <TableRow key={row.batch} sx={{
                  '&:hover': { bgcolor: '#F8FAFC' },
                  opacity: row.source === 'pending' ? 0.45 : 1,
                }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.7rem', color: '#334155', py: 0.5 }}>
                    {row.batch}
                  </TableCell>
                  <FPYCell value={row.reviewer_to_trainer_fpy} />
                  <ReworkCell value={row.reviewer_to_trainer_rework} />
                  <FPYCell value={row.auditor_to_reviewer_fpy} />
                  <ReworkCell value={row.auditor_to_trainer_rework} />
                  <TableCell align="center" sx={{ fontSize: '0.65rem', color: '#64748B', py: 0.5 }}>
                    {row.task_count || '--'}
                  </TableCell>
                </TableRow>
              ))}
              {batchData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#94A3B8' }}>
                    No batch data available
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

// ============================================================================
// TASK RUBRICS TAB
// ============================================================================

function TaskDetailRow({ task, allRubricItems, categories, reviewView }: {
  task: QualityRubricsData['task_details'][0]
  allRubricItems: string[]
  categories: QualityRubricsData['rubric_categories']
  reviewView: 'latest' | 'first' | 'second' | 'third'
}) {
  const [expanded, setExpanded] = useState(false)

  const resolveRole = (role: 'reviewer' | 'auditor') => {
    const keyMap: Record<string, string> = {
      first: `first_${role}`,
      second: `second_${role}`,
      third: `third_${role}`,
      latest: role,
    }
    const key = keyMap[reviewView] as keyof typeof task
    const obj = task[key] as { scores: Record<string, string>; reasons: Record<string, unknown[]> } | undefined
    return obj || task[role]
  }
  const activeReviewer = resolveRole('reviewer')
  const activeAuditor = resolveRole('auditor')

  const hasReasons = useMemo(() => {
    for (const rubric of allRubricItems) {
      const rr = activeReviewer.reasons[rubric]
      if (rr && rr.length > 0) return true
      const ar = activeAuditor.reasons[rubric]
      if (ar && ar.length > 0) return true
    }
    return false
  }, [activeReviewer, activeAuditor, allRubricItems])

  const hasAnyScore = useMemo(() => {
    for (const rubric of allRubricItems) {
      if (activeReviewer.scores[rubric]?.trim()) return true
      if (activeAuditor.scores[rubric]?.trim()) return true
    }
    return false
  }, [activeReviewer, activeAuditor, allRubricItems])

  const isExpandable = hasReasons || hasAnyScore

  const totalReworks = (task.reviewer_rework_count || 0) + (task.auditor_rework_count || 0)

  const labelingToolUrl = `https://labeling-n.turing.com/conversations/${task.task}/view`

  const taskLabel = (
    <Link
      href={labelingToolUrl}
      target="_blank"
      rel="noopener"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#2563EB', display: 'flex', alignItems: 'center', gap: 0.25 }}
    >
      {task.task}
      <OpenInNewIcon sx={{ fontSize: 11 }} />
    </Link>
  )

  return (
    <>
      <TableRow sx={{
        bgcolor: '#FFF', '&:hover': { bgcolor: '#FAFAFA' },
        cursor: isExpandable ? 'pointer' : 'default',
      }}
        onClick={isExpandable ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell sx={{ py: 0.25, px: 0.75, fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', borderBottom: '1px solid #E8ECF0', borderRight: HEADER_BORDER }}>
          {task.batch}
        </TableCell>
        <TableCell sx={{ py: 0.25, px: 0.75, borderBottom: '1px solid #E8ECF0', borderRight: HEADER_BORDER }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            {isExpandable && (
              <IconButton size="small" sx={{ p: 0, width: 16, height: 16 }}>
                {expanded ? <CollapseIcon sx={{ fontSize: 14, color: '#64748B' }} /> : <ExpandIcon sx={{ fontSize: 14, color: '#64748B' }} />}
              </IconButton>
            )}
            {taskLabel}
          </Box>
        </TableCell>
        <TableCell align="center" sx={{
          py: 0.25, px: 0.5,
          borderBottom: '1px solid #E8ECF0', borderRight: CAT_BORDER,
          fontSize: '0.75rem', fontWeight: 600,
          color: totalReworks > 0 ? '#DC2626' : '#94A3B8',
        }}>
          {totalReworks > 0 ? totalReworks : '-'}
        </TableCell>

        {categories.map((cat, ci) => {
          const isLastCat = ci === categories.length - 1
          return cat.items.map((item, ii) => {
            const val = activeReviewer.scores[item] || ''
            const isPass = val.toUpperCase() === 'PASS'
            const isEmpty = !val
            const isLastInCat = ii === cat.items.length - 1
            return (
              <TableCell key={`r-${ci}-${ii}`} align="center" sx={{
                py: 0.15, px: 0.15,
                borderBottom: '1px solid #E8ECF0',
                borderRight: (isLastInCat && isLastCat) ? CAT_BORDER
                  : isLastInCat ? HEADER_BORDER : undefined,
              }}>
                {!isEmpty && (isPass
                  ? <PassIcon sx={{ fontSize: 18, color: '#16A34A' }} />
                  : <FailIcon sx={{ fontSize: 18, color: '#DC2626' }} />
                )}
              </TableCell>
            )
          })
        })}

        {categories.map((cat, ci) => {
          const isLastCat = ci === categories.length - 1
          return cat.items.map((item, ii) => {
            const val = activeAuditor.scores[item] || ''
            const isPass = val.toUpperCase() === 'PASS'
            const isEmpty = !val
            const isLastInCat = ii === cat.items.length - 1
            return (
              <TableCell key={`a-${ci}-${ii}`} align="center" sx={{
                py: 0.15, px: 0.15,
                borderBottom: '1px solid #E8ECF0',
                borderRight: (isLastInCat && !isLastCat) ? HEADER_BORDER : undefined,
              }}>
                {!isEmpty && (isPass
                  ? <PassIcon sx={{ fontSize: 18, color: '#16A34A' }} />
                  : <FailIcon sx={{ fontSize: 18, color: '#DC2626' }} />
                )}
              </TableCell>
            )
          })
        })}
      </TableRow>

      {/* Expandable details — each rubric item gets its own row for perfect side-by-side alignment */}
      {expanded && isExpandable && (
        <>
          {/* Title row */}
          <TableRow>
            <TableCell colSpan={3 + allRubricItems.length * 2} sx={{ bgcolor: '#FAFAFA', py: 0.75, px: 1.5, borderBottom: 'none' }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B' }}>
                Task {task.task} — Details
              </Typography>
            </TableCell>
          </TableRow>
          {/* Column headers: Reviewer | Auditor */}
          <TableRow>
            <TableCell colSpan={3} sx={{ bgcolor: '#F1F5F9', p: 0, borderBottom: '1px solid #CBD5E1' }} />
            <TableCell colSpan={allRubricItems.length} sx={{ bgcolor: '#F1F5F9', borderRight: CAT_BORDER, borderBottom: '1px solid #CBD5E1', px: 1.5, py: 0.5 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Reviewer</Typography>
            </TableCell>
            <TableCell colSpan={allRubricItems.length} sx={{ bgcolor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', px: 1.5, py: 0.5 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Auditor</Typography>
            </TableCell>
          </TableRow>
          {/* One row per category header + one row per rubric item */}
          {categories.map((cat, catIdx) => {
            const allItems = cat.items.filter((item) => {
              const rs = activeReviewer.scores[item]
              const rr = activeReviewer.reasons[item]
              const as_ = activeAuditor.scores[item]
              const ar = activeAuditor.reasons[item]
              return !!rs || (rr && rr.length > 0) || !!as_ || (ar && ar.length > 0)
            })
            if (allItems.length === 0) return null
            return [
              categories.length > 1 && (
                <TableRow key={`cat-hdr-${cat.name}`}>
                  <TableCell colSpan={3} sx={{ bgcolor: '#F8FAFC', p: 0, borderBottom: '1px solid #E8ECF0' }} />
                  <TableCell colSpan={allRubricItems.length} sx={{ bgcolor: '#F8FAFC', borderRight: CAT_BORDER, borderBottom: '1px solid #E8ECF0', px: 1.5, py: 0.4 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{cat.name}</Typography>
                  </TableCell>
                  <TableCell colSpan={allRubricItems.length} sx={{ bgcolor: '#F8FAFC', borderBottom: '1px solid #E8ECF0', px: 1.5, py: 0.4 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{cat.name}</Typography>
                  </TableCell>
                </TableRow>
              ),
              ...allItems.map((item, ii) => {
                const rScore = activeReviewer.scores[item] || ''
                const rReasons = activeReviewer.reasons[item] || []
                const rFail = rScore.toUpperCase() === 'FAIL'
                const rHas = !!rScore || rReasons.length > 0

                const aScore = activeAuditor.scores[item] || ''
                const aReasons = activeAuditor.reasons[item] || []
                const aFail = aScore.toUpperCase() === 'FAIL'
                const aHas = !!aScore || aReasons.length > 0

                const isLastItem = catIdx === categories.length - 1 && ii === allItems.length - 1
                const bottomBorder = isLastItem ? '2px solid #CBD5E1' : '1px solid #E8ECF0'

                return (
                  <TableRow key={`detail-${cat.name}-${item}`}>
                    <TableCell colSpan={3} sx={{ bgcolor: '#FAFAFA', p: 0, borderBottom: bottomBorder }} />
                    <TableCell colSpan={allRubricItems.length} sx={{
                      bgcolor: '#FAFAFA', verticalAlign: 'top', borderRight: CAT_BORDER,
                      borderBottom: bottomBorder, px: 1.5, py: 0.5,
                      overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      {rHas ? (
                        <Box sx={{ pl: 1, borderLeft: `2px solid ${rFail ? '#FCA5A5' : '#E2E8F0'}` }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                            {rFail
                              ? <FailIcon sx={{ fontSize: 13, color: '#DC2626' }} />
                              : <PassIcon sx={{ fontSize: 13, color: '#16A34A' }} />}
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>{item}</Typography>
                          </Box>
                          {(rReasons as { label: string; text: string }[]).map((reason, ri) => (
                            <Box key={ri} sx={{ pl: 2, mt: 0.15 }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#94A3B8' }}>{reason.label}</Typography>
                              <Typography sx={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{reason.text}</Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontStyle: 'italic', pl: 1 }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell colSpan={allRubricItems.length} sx={{
                      bgcolor: '#FAFAFA', verticalAlign: 'top',
                      borderBottom: bottomBorder, px: 1.5, py: 0.5,
                      overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      {aHas ? (
                        <Box sx={{ pl: 1, borderLeft: `2px solid ${aFail ? '#FCA5A5' : '#E2E8F0'}` }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                            {aFail
                              ? <FailIcon sx={{ fontSize: 13, color: '#DC2626' }} />
                              : <PassIcon sx={{ fontSize: 13, color: '#16A34A' }} />}
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>{item}</Typography>
                          </Box>
                          {(aReasons as { label: string; text: string }[]).map((reason, ri) => (
                            <Box key={ri} sx={{ pl: 2, mt: 0.15 }}>
                              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#94A3B8' }}>{reason.label}</Typography>
                              <Typography sx={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>{reason.text}</Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontStyle: 'italic', pl: 1 }}>—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )
              }),
            ]
          })}
        </>
      )}
    </>
  )
}

export function TaskRubricsView({ data, categories, batchYieldStats: serverYieldStats }: {
  data: QualityRubricsData['task_details']
  categories: QualityRubricsData['rubric_categories']
  batchYieldStats?: QualityRubricsData['batch_yield_stats']
}) {
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [reviewView, setReviewView] = useState<'latest' | 'first' | 'second' | 'third'>('latest')

  const allRubricItems = useMemo(() => categories.flatMap((c) => c.items), [categories])
  const batches = useMemo(() => Array.from(new Set(data.map((d) => d.batch))), [data])
  const filtered = useMemo(
    () => (batchFilter === 'all' ? data : data.filter((d) => d.batch === batchFilter)),
    [data, batchFilter],
  )
  const tasksWithData = useMemo(() => filtered.filter((t) => t.has_data), [filtered])

  type YieldRow = {
    batch: string
    role: 'Reviewer' | 'Auditor'
    reworkTotal: number
    fpy: number | null
    fpyRework: number | null
    spy: number | null
    spyRework: number | null
    tpy: number | null
    tpyRework: number | null
    lpy: number | null
  }

  const batchYieldStats = useMemo<YieldRow[]>(() => {
    if (serverYieldStats && serverYieldStats.length > 0) {
      const mapped = serverYieldStats.map((s) => ({
        batch: s.batch,
        role: s.role,
        reworkTotal: s.rework_total,
        fpy: s.fpy,
        fpyRework: s.fpy_rework ?? null,
        spy: s.spy,
        spyRework: s.spy_rework ?? null,
        tpy: s.tpy,
        tpyRework: s.tpy_rework ?? null,
        lpy: s.lpy,
      }))
      if (batchFilter === 'all') return mapped
      return mapped.filter((r) => r.batch === batchFilter)
    }

    // Fallback: cumulative yield from rework counts when backend stats unavailable.
    // All stages use the same denominator (all tasks for that batch+role).
    // LPY cannot be determined without review_action data; left as null.
    type Task = QualityRubricsData['task_details'][0]

    const batchGroups = new Map<string, Task[]>()
    for (const t of tasksWithData) {
      const arr = batchGroups.get(t.batch)
      if (arr) arr.push(t); else batchGroups.set(t.batch, [t])
    }

    const computeYield = (tasks: Task[], roleKey: 'reviewer' | 'auditor', stage: 'first' | 'second' | 'third' | 'latest') => {
      const reworkKey = `${roleKey}_rework_count` as keyof Task
      if (stage === 'latest') return null
      if (tasks.length === 0) return null
      const maxK = { first: 1, second: 2, third: 3 }[stage]!
      const passed = tasks.filter((t) => ((t[reworkKey] as number) || 0) + 1 <= maxK).length
      return (passed / tasks.length) * 100
    }

    const rows: YieldRow[] = []
    for (const [batch, tasks] of batchGroups) {
      for (const roleKey of ['reviewer', 'auditor'] as const) {
        const rwkKey = `${roleKey}_rework_count` as keyof Task
        const reworkTotal = tasks.reduce((s, t) => s + ((t[rwkKey] as number) || 0), 0)
        rows.push({
          batch,
          role: roleKey === 'reviewer' ? 'Reviewer' : 'Auditor',
          reworkTotal,
          fpy: computeYield(tasks, roleKey, 'first'),
          fpyRework: null,
          spy: computeYield(tasks, roleKey, 'second'),
          spyRework: null,
          tpy: computeYield(tasks, roleKey, 'third'),
          tpyRework: null,
          lpy: computeYield(tasks, roleKey, 'latest'),
        })
      }
    }
    return rows
  }, [serverYieldStats, batchFilter, tasksWithData])

  return (
    <Box>
      {/* Batch Pass Yield Summary */}
      {batchYieldStats.length > 0 && (
      <Box sx={{ mx: 1.5, mb: 1, borderRadius: 1, border: '1px solid #E2E8F0', position: 'sticky', left: 0, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              {['Batch', 'Role', 'Rwk Total', 'FPY', 'Rwk Cnt', 'Rework %', 'SPY', 'Rwk Cnt', 'Rework %', 'TPY', 'Rwk Cnt', 'Rework %', 'LPY', 'Rework %'].map((h, i) => {
                const borderRightIndices = [2, 5, 8, 11, 13]
                return (
                <TableCell key={i} align={i >= 2 ? 'center' : 'left'} sx={{
                  fontWeight: 700, fontSize: '0.72rem', color: '#475569', py: 0.5, px: 1,
                  borderBottom: '2px solid #CBD5E1', whiteSpace: 'nowrap',
                  ...(borderRightIndices.includes(i) ? { borderRight: '1px solid #E2E8F0' } : {}),
                }}>
                  {h}
                </TableCell>
              )})}
            </TableRow>
          </TableHead>
          <TableBody>
            {batchYieldStats.map((row, idx) => {
              const isFirstOfBatch = idx === 0 || batchYieldStats[idx - 1].batch !== row.batch
              const batchRowCount = batchYieldStats.filter((r) => r.batch === row.batch).length
              const fmt = (v: number | null) => v !== null ? `${v.toFixed(2)}%` : '—'
              const rwk = (v: number | null) => v !== null ? `${(100 - v).toFixed(2)}%` : '—'
              const cnt = (v: number | null) => v !== null ? v : '—'
              return (
                <TableRow key={idx} sx={{ '&:last-child td': { borderBottom: 0 }, bgcolor: idx % 4 < 2 ? '#FFF' : '#FAFBFC' }}>
                  {isFirstOfBatch && (
                    <TableCell rowSpan={batchRowCount} sx={{
                      fontWeight: 600, fontSize: '0.78rem', color: '#1E293B', py: 0.4, px: 1,
                      borderBottom: '1px solid #E2E8F0', verticalAlign: 'top',
                    }}>
                      {row.batch}
                    </TableCell>
                  )}
                  <TableCell sx={{ fontSize: '0.75rem', color: '#334155', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>
                    {row.role}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>
                    {row.reworkTotal}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{fmt(row.fpy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{cnt(row.fpyRework)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', color: row.fpy !== null && row.fpy < 100 ? '#DC2626' : '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>{rwk(row.fpy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{fmt(row.spy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{cnt(row.spyRework)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', color: row.spy !== null && row.spy < 100 ? '#DC2626' : '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>{rwk(row.spy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{fmt(row.tpy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{cnt(row.tpyRework)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', color: row.tpy !== null && row.tpy < 100 ? '#DC2626' : '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>{rwk(row.tpy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1E293B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{fmt(row.lpy)}</TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.75rem', color: row.lpy !== null && row.lpy < 100 ? '#DC2626' : '#64748B', py: 0.4, px: 1, borderBottom: '1px solid #E2E8F0' }}>{rwk(row.lpy)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
      )}

      {/* Filter & review toggle bar — sticky above task metrics */}
      <Box sx={{
        display: 'flex', gap: 1.5, alignItems: 'center', p: 1, px: 1.5, flexWrap: 'wrap',
        position: 'sticky', top: 0, left: 0, zIndex: 10,
        bgcolor: '#FFF', borderBottom: '1px solid #E2E8F0',
      }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ fontSize: '0.8rem' }}>Batch</InputLabel>
          <Select value={batchFilter} label="Batch" onChange={(e) => setBatchFilter(e.target.value)} sx={{ fontSize: '0.8rem', height: 32 }}>
            <MenuItem value="all" sx={{ fontSize: '0.8rem' }}>All Batches</MenuItem>
            {batches.map((b) => (
              <MenuItem key={b} value={b} sx={{ fontSize: '0.8rem' }}>{b}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <PassIcon sx={{ fontSize: 16, color: '#16A34A' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>= Pass</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
            <FailIcon sx={{ fontSize: 16, color: '#DC2626' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#334155' }}>= Fail</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>
            <ExpandIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.3 }} />
            = Click row for reasons
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={reviewView}
          onChange={(_, v) => { if (v) setReviewView(v) }}
          sx={{ height: 28, ml: 1 }}
        >
          <ToggleButton value="first" sx={{ fontSize: '0.72rem', px: 1.25, textTransform: 'none', fontWeight: 600 }}>
            1st Review
          </ToggleButton>
          <ToggleButton value="second" sx={{ fontSize: '0.72rem', px: 1.25, textTransform: 'none', fontWeight: 600 }}>
            2nd Review
          </ToggleButton>
          <ToggleButton value="third" sx={{ fontSize: '0.72rem', px: 1.25, textTransform: 'none', fontWeight: 600 }}>
            3rd Review
          </ToggleButton>
          <ToggleButton value="latest" sx={{ fontSize: '0.72rem', px: 1.25, textTransform: 'none', fontWeight: 600 }}>
            Last Review
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography sx={{ fontSize: '0.8rem', color: '#64748B', ml: 'auto' }}>
          {filtered.length} tasks ({tasksWithData.length} with data)
        </Typography>
      </Box>

      {/* Table — header sticks below the filter bar */}
          <Table size="small">
            <TableHead>
              {/* Row 1: Task | Reviewer → Trainer | Auditor → Reviewer / Trainer */}
              <TableRow>
                <TableCell rowSpan={3} sx={{
                  fontWeight: 700, fontSize: '0.8rem', bgcolor: '#FFF', color: '#1E293B',
                  borderBottom: HEADER_BORDER, borderRight: HEADER_BORDER,
                  width: 60, position: 'sticky', top: CONTROLS_BAR_H, zIndex: 5,
                  verticalAlign: 'bottom', py: 0.5, px: 0.75,
                }}>
                  Batch
                </TableCell>
                <TableCell rowSpan={3} sx={{
                  fontWeight: 700, fontSize: '0.8rem', bgcolor: '#FFF', color: '#1E293B',
                  borderBottom: HEADER_BORDER, borderRight: HEADER_BORDER,
                  width: 70, position: 'sticky', top: CONTROLS_BAR_H, zIndex: 5,
                  verticalAlign: 'bottom', py: 0.5, px: 0.75,
                }}>
                  Task
                </TableCell>
                <Tooltip title="Total reworks (Reviewer + Auditor)" arrow>
                  <TableCell rowSpan={3} align="center" sx={{
                    fontWeight: 700, fontSize: '0.75rem', bgcolor: '#FFF', color: '#1E293B',
                    borderBottom: HEADER_BORDER, borderRight: CAT_BORDER,
                    width: 36, position: 'sticky', top: CONTROLS_BAR_H, zIndex: 5,
                    verticalAlign: 'bottom', py: 0.5, px: 0.25,
                  }}>
                    Rwk
                  </TableCell>
                </Tooltip>
                <TableCell colSpan={allRubricItems.length} align="center" sx={{
                  fontWeight: 700, fontSize: '0.85rem', bgcolor: '#FFF', color: '#1E293B',
                  borderBottom: HEADER_BORDER, borderRight: CAT_BORDER,
                  position: 'sticky', top: CONTROLS_BAR_H, zIndex: 4,
                  height: ROW1_H, py: 0.4,
                }}>
                  Reviewer &rarr; Trainer
                </TableCell>
                <TableCell colSpan={allRubricItems.length} align="center" sx={{
                  fontWeight: 700, fontSize: '0.85rem', bgcolor: '#FFF', color: '#1E293B',
                  borderBottom: HEADER_BORDER,
                  position: 'sticky', top: CONTROLS_BAR_H, zIndex: 4,
                  height: ROW1_H, py: 0.4,
                }}>
                  Auditor &rarr; Reviewer / Trainer
                </TableCell>
              </TableRow>

              {/* Row 2: Category group headers */}
              <TableRow>
                {categories.map((cat, ci) => {
                  const isLastCat = ci === categories.length - 1
                  return (
                    <TableCell key={`rc-${cat.name}`} colSpan={cat.items.length} align="center" sx={{
                      fontWeight: 700, fontSize: '0.75rem',
                      bgcolor: '#FFF', color: '#334155',
                      borderBottom: HEADER_BORDER,
                      borderRight: isLastCat ? CAT_BORDER : HEADER_BORDER,
                      position: 'sticky', top: CONTROLS_BAR_H + ROW1_H, zIndex: 3,
                      height: ROW2_H, py: 0.3, whiteSpace: 'nowrap',
                    }}>
                      {cat.name}
                    </TableCell>
                  )
                })}
                {categories.map((cat, ci) => {
                  const isLastCat = ci === categories.length - 1
                  return (
                    <TableCell key={`ac-${cat.name}`} colSpan={cat.items.length} align="center" sx={{
                      fontWeight: 700, fontSize: '0.75rem',
                      bgcolor: '#FFF', color: '#334155',
                      borderBottom: HEADER_BORDER,
                      borderRight: !isLastCat ? HEADER_BORDER : undefined,
                      position: 'sticky', top: CONTROLS_BAR_H + ROW1_H, zIndex: 3,
                      height: ROW2_H, py: 0.3, whiteSpace: 'nowrap',
                    }}>
                      {cat.name}
                    </TableCell>
                  )
                })}
              </TableRow>

              {/* Row 3: Individual rubric item headers */}
              <TableRow>
                {categories.map((cat, ci) => {
                  const isLastCat = ci === categories.length - 1
                  return cat.items.map((item, ii) => {
                    const isLastInCat = ii === cat.items.length - 1
                    return (
                      <Tooltip key={`rh-${item}`} title={item} arrow>
                        <TableCell align="center" sx={{
                          fontWeight: 600, fontSize: '0.65rem',
                          bgcolor: '#FFF', color: '#475569',
                          borderBottom: CAT_BORDER,
                          borderRight: (isLastInCat && isLastCat) ? CAT_BORDER
                            : isLastInCat ? HEADER_BORDER : undefined,
                          position: 'sticky', top: CONTROLS_BAR_H + ROW1_H + ROW2_H, zIndex: 2,
                          lineHeight: 1.15, py: 0.3, px: 0.25,
                          wordBreak: 'break-word', whiteSpace: 'normal',
                          maxWidth: 55, minWidth: 30,
                        }}>
                          {item}
                        </TableCell>
                      </Tooltip>
                    )
                  })
                })}
                {categories.map((cat, ci) => {
                  const isLastCat = ci === categories.length - 1
                  return cat.items.map((item, ii) => {
                    const isLastInCat = ii === cat.items.length - 1
                    return (
                      <Tooltip key={`ah-${item}`} title={item} arrow>
                        <TableCell align="center" sx={{
                          fontWeight: 600, fontSize: '0.65rem',
                          bgcolor: '#FFF', color: '#475569',
                          borderBottom: CAT_BORDER,
                          borderRight: (isLastInCat && !isLastCat) ? HEADER_BORDER : undefined,
                          position: 'sticky', top: CONTROLS_BAR_H + ROW1_H + ROW2_H, zIndex: 2,
                          lineHeight: 1.15, py: 0.3, px: 0.25,
                          wordBreak: 'break-word', whiteSpace: 'normal',
                          maxWidth: 55, minWidth: 30,
                        }}>
                          {item}
                        </TableCell>
                      </Tooltip>
                    )
                  })
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {filtered.map((row) => (
                <TaskDetailRow
                  key={`${row.batch}-${row.task}`}
                  task={row}
                  allRubricItems={allRubricItems}
                  categories={categories}
                  reviewView={reviewView}
                />
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2 + allRubricItems.length * 2} align="center" sx={{ py: 4, color: '#94A3B8', fontSize: '0.85rem' }}>
                    No task data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
    </Box>
  )
}

// ============================================================================
// SHARE LINK DIALOG
// ============================================================================

function ShareLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLinkType[]>([])
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState<string>('')
  const [snackMsg, setSnackMsg] = useState('')

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listShareLinks()
      setLinks(result.filter((l) => l.page === 'quality-rubrics'))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) fetchLinks()
  }, [open, fetchLinks])

  const handleCreate = async () => {
    try {
      const days = expiryDays ? parseInt(expiryDays, 10) : undefined
      await createShareLink({
        page: 'quality-rubrics',
        project_id: 60,
        label: label || undefined,
        expires_in_days: days && days > 0 ? days : undefined,
      })
      setLabel('')
      setExpiryDays('')
      fetchLinks()
      setSnackMsg('Share link created')
    } catch {
      setSnackMsg('Failed to create link')
    }
  }

  const handleRevoke = async (id: number) => {
    try {
      await revokeShareLink(id)
      fetchLinks()
      setSnackMsg('Link revoked')
    } catch {
      setSnackMsg('Failed to revoke link')
    }
  }

  const copyLink = (inputId: string) => {
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (!input) return
    input.select()
    input.setSelectionRange(0, input.value.length)
    try { document.execCommand('copy') } catch { /* user can Ctrl+C */ }
    setSnackMsg('Link selected — press Ctrl+C to copy')
  }

  const activeLinks = links.filter((l) => l.is_active)
  const revokedLinks = links.filter((l) => !l.is_active)

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', pb: 0.5 }}>
          Share Task Rubrics
          <Typography sx={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 400 }}>
            Generate a secret link for external read-only access
          </Typography>
        </DialogTitle>
        <DialogContent>
          {/* Create new link */}
          <Box sx={{ mb: 2.5, p: 1.5, bgcolor: '#F8FAFC', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', mb: 1 }}>New Link</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                sx={{ flex: 1, minWidth: 140, '& .MuiInputBase-root': { fontSize: '0.8rem', height: 34 }, '& .MuiInputLabel-root': { fontSize: '0.8rem' } }}
              />
              <TextField
                size="small"
                label="Expires in (days)"
                type="number"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="Never"
                sx={{ width: 130, '& .MuiInputBase-root': { fontSize: '0.8rem', height: 34 }, '& .MuiInputLabel-root': { fontSize: '0.8rem' } }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={handleCreate}
                sx={{
                  height: 34, fontSize: '0.78rem', fontWeight: 600, textTransform: 'none',
                  bgcolor: '#4F46E5', '&:hover': { bgcolor: '#4338CA' },
                }}
              >
                Generate
              </Button>
            </Box>
          </Box>

          {/* Active links */}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : activeLinks.length === 0 ? (
            <Typography sx={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', py: 2 }}>
              No active share links
            </Typography>
          ) : (
            activeLinks.map((link) => {
              const inputId = `share-url-${link.id}`
              return (
                <Box key={link.id} sx={{ py: 1, px: 1, borderBottom: '1px solid #F1F5F9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                        {link.label || 'Untitled'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        Created {new Date(link.created_at).toLocaleDateString()}
                        {link.expires_at && ` · Expires ${new Date(link.expires_at).toLocaleDateString()}`}
                      </Typography>
                    </Box>
                    <Tooltip title="Revoke link" arrow>
                      <IconButton size="small" onClick={() => handleRevoke(link.id)}
                        sx={{ color: '#DC2626', '&:hover': { bgcolor: '#FEF2F2' } }}>
                        <RevokeIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <input
                      id={inputId}
                      readOnly
                      value={`${window.location.origin}/shared/${link.token}`}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      style={{
                        flex: 1, fontSize: '0.72rem', padding: '5px 8px',
                        border: '1px solid #E2E8F0', borderRadius: 4,
                        background: '#F8FAFC', color: '#334155', outline: 'none',
                        fontFamily: 'monospace',
                      }}
                    />
                    <Tooltip title="Select & copy" arrow>
                      <IconButton size="small" onClick={() => copyLink(inputId)}
                        sx={{ color: '#4F46E5', '&:hover': { bgcolor: '#EEF2FF' } }}>
                        <CopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              )
            })
          )}

          {/* Revoked links */}
          {revokedLinks.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#94A3B8', mb: 0.5 }}>Revoked</Typography>
              {revokedLinks.map((link) => (
                <Box key={link.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1, opacity: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8', textDecoration: 'line-through', flex: 1 }}>
                    {link.label || 'Untitled'} — {new Date(link.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={2500}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function QualityRubrics() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState(2)
  const [data, setData] = useState<QualityRubricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [weekOffset, setWeekOffset] = useState(0)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const dateRange = useMemo(
    () => getDateRange(timeframe, weekOffset, customStartDate, customEndDate),
    [timeframe, weekOffset, customStartDate, customEndDate],
  )

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getQualityRubricsData(refresh, dateRange.startDate, dateRange.endDate)
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load quality rubrics data')
    } finally {
      setLoading(false)
    }
  }, [dateRange.startDate, dateRange.endDate])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <Box sx={{
      height: { xs: 'calc(100vh - 104px)', sm: 'calc(100vh - 48px)' },
      overflow: 'auto',
    }}>
      {/* Page Header — scrolls away, sticks left during horizontal scroll */}
      <Box sx={{ mb: 1, position: 'sticky', left: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 1.5,
            background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
          }}>
            <FactCheckIcon sx={{ color: '#FFF', fontSize: 20 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              Quality Rubrics
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>
              Advanced Math EVAL Quality Report
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
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
          <Tooltip title="Refresh data" arrow>
            <IconButton onClick={() => fetchData(true)} disabled={loading} size="small"
              sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
              <RefreshIcon sx={{ fontSize: 18, color: '#475569' }} />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Share Task Rubrics externally" arrow>
              <IconButton onClick={() => setShareDialogOpen(true)} size="small"
                sx={{ bgcolor: '#EEF2FF', '&:hover': { bgcolor: '#E0E7FF' } }}>
                <ShareIcon sx={{ fontSize: 18, color: '#4F46E5' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {isAdmin && <ShareLinkDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />}

      {/* Tabs — scrolls away, sticks left during horizontal scroll */}
      <Box sx={{ position: 'sticky', left: 0, mb: 1.5 }}>
        <Paper sx={{ borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              bgcolor: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              minHeight: 40,
              '& .MuiTab-root': {
                minHeight: 40, py: 1, fontSize: '0.8rem', fontWeight: 600,
                textTransform: 'none', color: '#64748B',
                '&.Mui-selected': { color: '#4F46E5' },
              },
              '& .MuiTabs-indicator': { bgcolor: '#4F46E5', height: 3 },
            }}
          >
            <Tab icon={<TrendingUpIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Daily Rollup" />
            <Tab icon={<AssessmentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Batch Quality" />
            <Tab icon={<GradingIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Task Rubrics" />
          </Tabs>
        </Paper>
      </Box>

      {/* Loading / Error / Content */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} sx={{ color: '#4F46E5' }} />
          <Typography sx={{ ml: 2, color: '#64748B', fontSize: '0.85rem' }}>Loading quality rubrics data...</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {!loading && data && (
        <>
          {activeTab === 0 && <DailyRollupView data={data.daily_rollup} />}
          {activeTab === 1 && <BatchQualityView batchData={data.batch_quality} rubricFpy={data.rubric_fpy} categories={data.rubric_categories} />}
          {activeTab === 2 && <TaskRubricsView data={data.task_details} categories={data.rubric_categories} batchYieldStats={data.batch_yield_stats} />}
        </>
      )}
    </Box>
  )
}
