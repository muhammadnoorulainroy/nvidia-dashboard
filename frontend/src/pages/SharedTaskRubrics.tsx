import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  FactCheck as FactCheckIcon,
  Refresh as RefreshIcon,
  Lock as LockIcon,
} from '@mui/icons-material'
import { getSharedQualityRubricsData, type QualityRubricsData } from '../services/api'
import { TaskRubricsView } from './QualityRubrics'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { type Timeframe, getDateRange } from '../utils/dateUtils'

export default function SharedTaskRubrics() {
  const { token } = useParams<{ token: string }>()

  const [data, setData] = useState<QualityRubricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timeframe, setTimeframe] = useState<Timeframe>('overall')
  const [weekOffset, setWeekOffset] = useState(0)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const dateRange = useMemo(
    () => getDateRange(timeframe, weekOffset, customStartDate, customEndDate),
    [timeframe, weekOffset, customStartDate, customEndDate],
  )

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const result = await getSharedQualityRubricsData(token, dateRange.startDate, dateRange.endDate)
      setData(result)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 403) {
        setError(err?.response?.data?.detail || 'This share link is invalid or has expired.')
      } else {
        setError('Failed to load data. Please try again later.')
      }
    } finally {
      setLoading(false)
    }
  }, [token, dateRange.startDate, dateRange.endDate])

  useEffect(() => { fetchData() }, [fetchData])

  if (!token) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#F8FAFC' }}>
        <Alert severity="error" sx={{ maxWidth: 400 }}>Invalid share link.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F8FAFC' }}>
      {/* Minimal Header */}
      <Box sx={{
        px: 3, py: 1.5,
        borderBottom: '1px solid #E2E8F0',
        bgcolor: '#FFF',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: 1.5,
          background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
        }}>
          <FactCheckIcon sx={{ color: '#FFF', fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
            Task Rubrics
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LockIcon sx={{ fontSize: 11 }} />
            Shared view — read only
          </Typography>
        </Box>
      </Box>

      {/* Controls + Content */}
      <Box sx={{ px: 3, py: 2, maxWidth: '100%', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, position: 'sticky', left: 0 }}>
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
            <IconButton onClick={fetchData} disabled={loading} size="small"
              sx={{ bgcolor: '#F1F5F9', '&:hover': { bgcolor: '#E2E8F0' } }}>
              <RefreshIcon sx={{ fontSize: 18, color: '#475569' }} />
            </IconButton>
          </Tooltip>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#4F46E5' }} />
            <Typography sx={{ ml: 2, color: '#64748B', fontSize: '0.85rem' }}>Loading task rubrics...</Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Alert severity="error" sx={{ maxWidth: 500 }}>{error}</Alert>
          </Box>
        )}

        {!loading && !error && data && (
          <TaskRubricsView data={data.task_details} categories={data.rubric_categories} />
        )}
      </Box>
    </Box>
  )
}
