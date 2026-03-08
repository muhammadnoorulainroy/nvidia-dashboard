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
  Collapse,
  Link,
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
} from '@mui/icons-material'
import { getQualityRubricsData, type QualityRubricsData } from '../services/api'

// ============================================================================
// RUBRIC CATEGORY METADATA (colors / short labels)
// ============================================================================

const CATEGORY_META: Record<string, { short: string; color: string; bg: string; border: string }> = {
  'Labeling Accuracy': { short: 'LA', color: '#3B82F6', bg: '#EFF6FF', border: '#93C5FD' },
  'Step coverage and discipline': { short: 'SCD', color: '#8B5CF6', bg: '#F5F3FF', border: '#C4B5FD' },
  'Failure resolution quality': { short: 'FRQ', color: '#F59E0B', bg: '#FFFBEB', border: '#FCD34D' },
  'Mathematical Correctness of Critique': { short: 'MCC', color: '#10B981', bg: '#ECFDF5', border: '#6EE7B7' },
}

// ============================================================================
// STYLE HELPERS
// ============================================================================

const getFPYStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v >= 95) return { color: '#065F46', bgcolor: '#D1FAE5' }
  if (v >= 80) return { color: '#92400E', bgcolor: '#FEF3C7' }
  return { color: '#991B1B', bgcolor: '#FEE2E2' }
}

const getReworkStyle = (v: number | null) => {
  if (v === null) return { color: '#94A3B8', bgcolor: 'transparent' }
  if (v <= 5) return { color: '#065F46', bgcolor: '#D1FAE5' }
  if (v <= 20) return { color: '#92400E', bgcolor: '#FEF3C7' }
  return { color: '#991B1B', bgcolor: '#FEE2E2' }
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

function DailyRollupView({ data }: { data: QualityRubricsData['daily_rollup'] }) {
  const sc = getStatusColor(data.overall_status)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E2E8F0', flex: 2, minWidth: 350 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            First Pass Yield
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <FPYGauge label="Reviewer FPY" value={data.reviewer_fpy} target={95} action={data.reviewer_fpy_action} />
            <FPYGauge label="Auditor FPY" value={data.auditor_fpy} target={95} action={data.auditor_fpy_action} />
          </Box>
        </Paper>

        <Paper sx={{
          p: 2.5, borderRadius: 2, border: `2px solid ${sc.border}`, bgcolor: sc.bg,
          flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: sc.main, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Overall Status
          </Typography>
          <Box sx={{
            width: 56, height: 56, borderRadius: '50%', bgcolor: sc.main,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 16px ${sc.main}40`,
          }}>
            <Typography sx={{ color: '#FFF', fontWeight: 800, fontSize: '1.1rem' }}>
              {data.overall_status.toUpperCase()}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.6rem', color: '#64748B' }}>
            Updated: {data.updated_date || '--'}
          </Typography>
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
                const meta = CATEGORY_META[item.category]
                const isCatSummary = item.is_category_summary

                if (isCatSummary) {
                  return (
                    <TableRow key={`cat-${item.category}`} sx={{ bgcolor: meta?.bg || '#F8FAFC' }}>
                      <TableCell sx={{
                        fontWeight: 800, fontSize: '0.7rem', color: meta?.color || '#334155',
                        borderTop: '2px solid #E2E8F0', py: 0.75,
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: meta?.color || '#64748B', flexShrink: 0 }} />
                          {item.category}
                        </Box>
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
                    <TableCell sx={{ fontSize: '0.65rem', color: '#334155', pl: 3.5, py: 0.5 }}>
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
              <Chip label={`Avg Reviewer FPY: ${avgFPY.toFixed(1)}%`} size="small" sx={{ ...getFPYStyle(avgFPY), fontWeight: 600, fontSize: '0.6rem', height: 20 }} />
              <Chip label={`Avg Auditor FPY: ${(avgAuditorFPY ?? 0).toFixed(1)}%`} size="small" sx={{ ...getFPYStyle(avgAuditorFPY), fontWeight: 600, fontSize: '0.6rem', height: 20 }} />
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

function TaskDetailRow({ task, allRubricItems, categories }: {
  task: QualityRubricsData['task_details'][0]
  allRubricItems: string[]
  categories: QualityRubricsData['rubric_categories']
}) {
  const [expanded, setExpanded] = useState(false)

  const hasReasons = useMemo(() => {
    for (const rubric of allRubricItems) {
      const rr = task.reviewer.reasons[rubric]
      if (rr && rr.length > 0) return true
      const ar = task.auditor.reasons[rubric]
      if (ar && ar.length > 0) return true
    }
    return false
  }, [task, allRubricItems])

  const taskLabel = task.task_link && task.task_link.startsWith('http')
    ? (
      <Link href={task.task_link} target="_blank" rel="noopener" sx={{ fontSize: '0.65rem', fontWeight: 500, color: '#2563EB', display: 'flex', alignItems: 'center', gap: 0.3 }}>
        {task.task}
        <OpenInNewIcon sx={{ fontSize: 10 }} />
      </Link>
    )
    : <Typography sx={{ fontSize: '0.65rem', fontWeight: 500, color: '#475569' }}>{task.task}</Typography>

  return (
    <>
      <TableRow sx={{
        bgcolor: '#FFF', '&:hover': { bgcolor: '#F8FAFC' },
        cursor: hasReasons ? 'pointer' : 'default',
      }}
        onClick={hasReasons ? () => setExpanded(!expanded) : undefined}
      >
        <TableCell sx={{ py: 0.3, px: 0.5, fontSize: '0.65rem', fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #E2E8F0' }}>
          {task.batch}
        </TableCell>
        <TableCell sx={{ py: 0.3, px: 0.5, borderBottom: '1px solid #E2E8F0', borderRight: '2px solid #CBD5E1' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {hasReasons && (
              <IconButton size="small" sx={{ p: 0, width: 16, height: 16 }}>
                {expanded ? <CollapseIcon sx={{ fontSize: 14 }} /> : <ExpandIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            )}
            {taskLabel}
          </Box>
        </TableCell>

        {allRubricItems.map((item, i) => {
          const val = task.reviewer.scores[item] || ''
          const isPass = val.toUpperCase() === 'PASS'
          const isEmpty = !val
          const isLastOverall = i === allRubricItems.length - 1
          return (
            <TableCell key={`r-${i}`} align="center" sx={{
              py: 0.25, px: 0.2,
              bgcolor: isEmpty ? '#F8FAFC' : isPass ? '#ECFDF5' : '#FEF2F2',
              borderBottom: '1px solid #E2E8F0',
              borderRight: isLastOverall ? '3px solid #1E40AF' : undefined,
            }}>
              {!isEmpty && (isPass
                ? <PassIcon sx={{ fontSize: 13, color: '#059669' }} />
                : <FailIcon sx={{ fontSize: 13, color: '#DC2626' }} />
              )}
            </TableCell>
          )
        })}

        {allRubricItems.map((item, i) => {
          const val = task.auditor.scores[item] || ''
          const isPass = val.toUpperCase() === 'PASS'
          const isEmpty = !val
          return (
            <TableCell key={`a-${i}`} align="center" sx={{
              py: 0.25, px: 0.2,
              bgcolor: isEmpty ? '#F8FAFC' : isPass ? '#ECFDF5' : '#FEF2F2',
              borderBottom: '1px solid #E2E8F0',
            }}>
              {!isEmpty && (isPass
                ? <PassIcon sx={{ fontSize: 13, color: '#059669' }} />
                : <FailIcon sx={{ fontSize: 13, color: '#DC2626' }} />
              )}
            </TableCell>
          )
        })}
      </TableRow>

      {/* Expandable reasons row */}
      <TableRow>
        <TableCell colSpan={2 + allRubricItems.length * 2} sx={{ p: 0, borderBottom: expanded ? '2px solid #CBD5E1' : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ p: 2, bgcolor: '#F8FAFC' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E293B', mb: 1.5 }}>
                Detailed Reasons — {task.task}
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                {/* Reviewer reasons */}
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', mb: 1, pb: 0.5, borderBottom: '2px solid #93C5FD' }}>
                    Reviewer
                  </Typography>
                  {categories.map((cat) => {
                    const meta = CATEGORY_META[cat.name]
                    const itemsWithContent = cat.items.filter((item) => {
                      const reasons = task.reviewer.reasons[item]
                      const score = task.reviewer.scores[item]
                      return (reasons && reasons.length > 0) || !!score
                    })
                    if (itemsWithContent.length === 0) return null
                    return (
                      <Box key={cat.name} sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: meta?.color || '#334155', mb: 0.5 }}>
                          {cat.name}
                        </Typography>
                        {itemsWithContent.map((item) => {
                          const score = task.reviewer.scores[item] || ''
                          const reasons = task.reviewer.reasons[item] || []
                          const isFail = score.toUpperCase() === 'FAIL'
                          return (
                            <Box key={item} sx={{ pl: 1, mb: 0.75, borderLeft: `3px solid ${isFail ? '#FCA5A5' : '#CBD5E1'}` }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                {isFail
                                  ? <FailIcon sx={{ fontSize: 12, color: '#DC2626' }} />
                                  : score ? <PassIcon sx={{ fontSize: 12, color: '#059669' }} /> : null
                                }
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#334155' }}>
                                  {item}
                                </Typography>
                              </Box>
                              {reasons.map((reason, ri) => (
                                <Box key={ri} sx={{ pl: 2.2, mb: 0.3 }}>
                                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: '#94A3B8', mb: 0.1 }}>
                                    {reason.label}
                                  </Typography>
                                  <Typography sx={{ fontSize: '0.6rem', color: '#64748B' }}>
                                    {reason.text}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )
                        })}
                      </Box>
                    )
                  })}
                </Box>

                {/* Auditor reasons */}
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', mb: 1, pb: 0.5, borderBottom: '2px solid #86EFAC' }}>
                    Auditor
                  </Typography>
                  {categories.map((cat) => {
                    const meta = CATEGORY_META[cat.name]
                    const itemsWithContent = cat.items.filter((item) => {
                      const reasons = task.auditor.reasons[item]
                      const score = task.auditor.scores[item]
                      return (reasons && reasons.length > 0) || !!score
                    })
                    if (itemsWithContent.length === 0) return null
                    return (
                      <Box key={cat.name} sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: meta?.color || '#334155', mb: 0.5 }}>
                          {cat.name}
                        </Typography>
                        {itemsWithContent.map((item) => {
                          const score = task.auditor.scores[item] || ''
                          const reasons = task.auditor.reasons[item] || []
                          const isFail = score.toUpperCase() === 'FAIL'
                          return (
                            <Box key={item} sx={{ pl: 1, mb: 0.75, borderLeft: `3px solid ${isFail ? '#FCA5A5' : '#CBD5E1'}` }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                                {isFail
                                  ? <FailIcon sx={{ fontSize: 12, color: '#DC2626' }} />
                                  : score ? <PassIcon sx={{ fontSize: 12, color: '#059669' }} /> : null
                                }
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#334155' }}>
                                  {item}
                                </Typography>
                              </Box>
                              {reasons.map((reason, ri) => (
                                <Box key={ri} sx={{ pl: 2.2, mb: 0.3 }}>
                                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: '#94A3B8', mb: 0.1 }}>
                                    {reason.label}
                                  </Typography>
                                  <Typography sx={{ fontSize: '0.6rem', color: '#64748B' }}>
                                    {reason.text}
                                  </Typography>
                                </Box>
                              ))}
                            </Box>
                          )
                        })}
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

function TaskRubricsView({ data, categories }: {
  data: QualityRubricsData['task_details']
  categories: QualityRubricsData['rubric_categories']
}) {
  const [batchFilter, setBatchFilter] = useState<string>('all')

  const allRubricItems = useMemo(() => categories.flatMap((c) => c.items), [categories])
  const batches = useMemo(() => Array.from(new Set(data.map((d) => d.batch))), [data])
  const filtered = useMemo(
    () => (batchFilter === 'all' ? data : data.filter((d) => d.batch === batchFilter)),
    [data, batchFilter],
  )
  const tasksWithData = useMemo(() => filtered.filter((t) => t.has_data), [filtered])

  const passRates = useMemo(() => {
    const reviewer = allRubricItems.map((item) => {
      const total = tasksWithData.filter((t) => t.reviewer.scores[item]?.trim()).length
      const passed = tasksWithData.filter((t) => t.reviewer.scores[item]?.toUpperCase() === 'PASS').length
      return total > 0 ? (passed / total) * 100 : 0
    })
    const auditor = allRubricItems.map((item) => {
      const total = tasksWithData.filter((t) => t.auditor.scores[item]?.trim()).length
      const passed = tasksWithData.filter((t) => t.auditor.scores[item]?.toUpperCase() === 'PASS').length
      return total > 0 ? (passed / total) * 100 : 0
    })
    return { reviewer, auditor }
  }, [tasksWithData, allRubricItems])

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>Batch</InputLabel>
          <Select value={batchFilter} label="Batch" onChange={(e) => setBatchFilter(e.target.value)} sx={{ fontSize: '0.75rem', height: 32 }}>
            <MenuItem value="all" sx={{ fontSize: '0.75rem' }}>All Batches</MenuItem>
            {batches.map((b) => (
              <MenuItem key={b} value={b} sx={{ fontSize: '0.75rem' }}>{b}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <PassIcon sx={{ fontSize: 14, color: '#059669' }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#334155' }}>= Pass</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <FailIcon sx={{ fontSize: 14, color: '#DC2626' }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#334155' }}>= Fail</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <ExpandIcon sx={{ fontSize: 14, color: '#64748B' }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#334155' }}>= Click row for reasons</Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.7rem', color: '#64748B', ml: 'auto' }}>
          {filtered.length} tasks ({tasksWithData.length} with data)
        </Typography>
      </Box>

      {/* Pass Rate Summary */}
      <Paper sx={{ p: 1.5, mb: 2, borderRadius: 2, border: '1px solid #E2E8F0' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E293B', mb: 1 }}>
          Rubric Pass Rates (Reviewer)
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {allRubricItems.map((item, i) => {
            const rate = passRates.reviewer[i]
            const s = getFPYStyle(rate)
            return (
              <Tooltip key={item} title={`${item}: ${rate.toFixed(0)}%`} arrow>
                <Chip
                  label={`${item}: ${rate.toFixed(0)}%`}
                  size="small"
                  sx={{ fontSize: '0.55rem', fontWeight: 600, bgcolor: s.bgcolor, color: s.color, height: 22 }}
                />
              </Tooltip>
            )
          })}
        </Box>
      </Paper>

      {/* Task-level Rubric Table */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
          <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: 1200 }}>
            <TableHead>
              {/* Top group header */}
              <TableRow>
                <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: '0.65rem', bgcolor: '#F1F5F9', color: '#475569', borderBottom: '1px solid #CBD5E1', borderRight: '2px solid #CBD5E1', width: 150 }}>
                  Task
                </TableCell>
                <TableCell colSpan={allRubricItems.length} align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#EFF6FF', color: '#1E40AF', borderBottom: '1px solid #93C5FD', borderRight: '3px solid #1E40AF' }}>
                  Reviewer → Trainer
                </TableCell>
                <TableCell colSpan={allRubricItems.length} align="center" sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F0FDF4', color: '#166534', borderBottom: '1px solid #86EFAC' }}>
                  Auditor → Reviewer / Trainer
                </TableCell>
              </TableRow>

              {/* Category header row */}
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.55rem', bgcolor: '#F8FAFC', borderBottom: '1px solid #CBD5E1', width: 70, zIndex: 3 }}>Batch</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.55rem', bgcolor: '#F8FAFC', borderBottom: '1px solid #CBD5E1', borderRight: '2px solid #CBD5E1', width: 80, zIndex: 3 }}>Task</TableCell>

                {categories.map((cat, ci) => {
                  const meta = CATEGORY_META[cat.name] || { short: '?', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
                  return (
                    <TableCell key={`r-${cat.name}`} colSpan={cat.items.length} align="center" sx={{
                      fontWeight: 700, fontSize: '0.45rem', bgcolor: meta.bg, color: meta.color,
                      borderBottom: `2px solid ${meta.border}`,
                      borderRight: ci === categories.length - 1 ? '3px solid #1E40AF' : `1px solid ${meta.border}`,
                      letterSpacing: '0.02em', lineHeight: 1.2,
                    }}>
                      {cat.name}
                    </TableCell>
                  )
                })}
                {categories.map((cat, ci) => {
                  const meta = CATEGORY_META[cat.name] || { short: '?', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
                  return (
                    <TableCell key={`a-${cat.name}`} colSpan={cat.items.length} align="center" sx={{
                      fontWeight: 700, fontSize: '0.45rem', bgcolor: meta.bg, color: meta.color,
                      borderBottom: `2px solid ${meta.border}`,
                      borderRight: ci === categories.length - 1 ? undefined : `1px solid ${meta.border}`,
                      letterSpacing: '0.02em', lineHeight: 1.2,
                    }}>
                      {cat.name}
                    </TableCell>
                  )
                })}
              </TableRow>

              {/* Individual rubric item headers */}
              <TableRow>
                <TableCell sx={{ bgcolor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', zIndex: 3 }} />
                <TableCell sx={{ bgcolor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', borderRight: '2px solid #CBD5E1', zIndex: 3 }} />

                {allRubricItems.map((item, idx) => {
                  const catIdx = categories.findIndex((c) => c.items.includes(item))
                  const cat = categories[catIdx]
                  const meta = CATEGORY_META[cat.name] || { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
                  const isLastInCat = cat.items[cat.items.length - 1] === item
                  const isLastOverall = idx === allRubricItems.length - 1
                  return (
                    <Tooltip key={`rh-${item}`} title={item} arrow>
                      <TableCell align="center" sx={{
                        fontWeight: 600, fontSize: '0.38rem', bgcolor: meta.bg, color: meta.color,
                        borderBottom: `2px solid ${meta.border}`,
                        borderRight: isLastOverall ? '3px solid #1E40AF' : isLastInCat ? `1px solid ${meta.border}` : undefined,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 65, lineHeight: 1.15, py: 0.5,
                        wordBreak: 'break-word', whiteSpace: 'normal',
                      }}>
                        {item}
                      </TableCell>
                    </Tooltip>
                  )
                })}
                {allRubricItems.map((item) => {
                  const catIdx = categories.findIndex((c) => c.items.includes(item))
                  const cat = categories[catIdx]
                  const meta = CATEGORY_META[cat.name] || { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' }
                  const isLastInCat = cat.items[cat.items.length - 1] === item
                  return (
                    <Tooltip key={`ah-${item}`} title={item} arrow>
                      <TableCell align="center" sx={{
                        fontWeight: 600, fontSize: '0.38rem', bgcolor: meta.bg, color: meta.color,
                        borderBottom: `2px solid ${meta.border}`,
                        borderRight: isLastInCat ? `1px solid ${meta.border}` : undefined,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 65, lineHeight: 1.15, py: 0.5,
                        wordBreak: 'break-word', whiteSpace: 'normal',
                      }}>
                        {item}
                      </TableCell>
                    </Tooltip>
                  )
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
                />
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2 + allRubricItems.length * 2} align="center" sx={{ py: 4, color: '#94A3B8' }}>
                    No task data available
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
// MAIN PAGE COMPONENT
// ============================================================================

export default function QualityRubrics() {
  const [activeTab, setActiveTab] = useState(0)
  const [data, setData] = useState<QualityRubricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getQualityRubricsData(refresh)
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load quality rubrics data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 2.5 }}>
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
          <Tooltip title="Refresh data from Google Sheet" arrow>
            <IconButton onClick={() => fetchData(true)} disabled={loading} size="small"
              sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
              <RefreshIcon sx={{ fontSize: 18, color: '#475569' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2, border: '1px solid #E2E8F0', mb: 2, overflow: 'hidden' }}>
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
          {activeTab === 2 && <TaskRubricsView data={data.task_details} categories={data.rubric_categories} />}
        </>
      )}
    </Box>
  )
}
