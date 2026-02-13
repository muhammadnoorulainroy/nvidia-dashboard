import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material'
import { getAnalyticsTimeSeries } from '../services/api'
import type { AnalyticsResponse, AnalyticsDataPoint } from '../services/api'
import TimeframeSelector from '../components/common/TimeframeSelector'
import { getDateRange } from '../utils/dateUtils'
import type { Timeframe } from '../utils/dateUtils'
import SummaryCards from '../components/analytics/SummaryCards'
import TasksChart from '../components/analytics/TasksChart'
import QualityChart from '../components/analytics/QualityChart'
import EfficiencyChart from '../components/analytics/EfficiencyChart'
import FinanceChart from '../components/analytics/FinanceChart'
import CustomKPIChart from '../components/analytics/CustomKPIChart'

// Project options for the dropdown
const PROJECT_OPTIONS = [
  { id: 0, name: 'All Projects' },
  { id: 36, name: 'SysBench' },
  { id: 37, name: 'Multichallenge' },
  { id: 38, name: 'InverseIFEval' },
  { id: 39, name: 'CFBench Multilingual' },
]

export default function Analytics() {
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly')
  const [weekOffset, setWeekOffset] = useState(0) // 0 = this week, -1 = last week
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [projectId, setProjectId] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [expandedChart, setExpandedChart] = useState<string | null>(null)

  // Derive date range from TimeframeSelector state
  const dateRange = useMemo(
    () => getDateRange(timeframe, weekOffset, customStartDate, customEndDate),
    [timeframe, weekOffset, customStartDate, customEndDate]
  )

  // Map timeframe to granularity for the API
  const granularity = useMemo(() => {
    if (timeframe === 'weekly') return 'daily' as const    // Daily breakdown within a single week
    if (timeframe === 'monthly') return 'weekly' as const  // Weekly breakdown within a month
    if (timeframe === 'overall') return 'monthly' as const // Monthly aggregation for all-time
    if (timeframe === 'custom') return 'daily' as const
    return 'daily' as const // daily/d-1/d-2/d-3 show single day
  }, [timeframe])

  // Whether revenue data applies (weekly+ granularity)
  const revenueAvailable = timeframe === 'overall' || timeframe === 'weekly' || timeframe === 'monthly'

  const fetchData = useCallback(async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      // "All Time" or invalid range - use wide range
      if (timeframe === 'overall') {
        setLoading(true)
        setError(null)
        try {
          const response = await getAnalyticsTimeSeries({
            granularity: 'monthly',
            projectId: projectId || undefined,
          })
          setData(response)
        } catch (err: any) {
          setError(err?.message || 'Failed to load analytics data')
        } finally {
          setLoading(false)
        }
        return
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await getAnalyticsTimeSeries({
        granularity,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        projectId: projectId || undefined,
      })
      setData(response)
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [granularity, dateRange.startDate, dateRange.endDate, projectId, timeframe])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleExpand = (chartId: string) => {
    setExpandedChart(expandedChart === chartId ? null : chartId)
  }

  const chartData: AnalyticsDataPoint[] = data?.data || []

  return (
    <Box sx={{ pb: 4, pt: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 1.5,
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <TrendingUpIcon sx={{ color: 'white', fontSize: 20 }} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E293B', lineHeight: 1.2 }}>
            Analytics
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            Interactive performance trends and KPI analysis
          </Typography>
        </Box>
      </Box>

      {/* Filters Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2, mb: 2.5, borderRadius: 2,
          border: '1px solid #E2E8F0',
          display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
        }}
      >
        {/* Timeframe Selector (same as Projects tab) */}
        <TimeframeSelector
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          customStartDate={customStartDate}
          onCustomStartDateChange={setCustomStartDate}
          customEndDate={customEndDate}
          onCustomEndDateChange={setCustomEndDate}
        />

        {/* Project Dropdown */}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel sx={{ fontSize: '0.8rem' }}>Project</InputLabel>
          <Select
            value={projectId}
            label="Project"
            onChange={(e) => setProjectId(Number(e.target.value))}
            sx={{ fontSize: '0.8rem', height: 36 }}
          >
            {PROJECT_OPTIONS.map((p) => (
              <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.85rem' }}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {/* Loading / Error states */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={40} sx={{ color: '#6366F1' }} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary KPI Cards */}
          <SummaryCards summary={data.summary} />

          {/* Custom KPI Chart */}
          <CustomKPIChart
            data={chartData}
            availableKpis={data.available_kpis}
            granularity={granularity}
          />

          {/* Charts Grid */}
          {!expandedChart ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2.5,
                mt: 2.5,
              }}
            >
              <TasksChart data={chartData} onExpand={() => handleExpand('tasks')} />
              <QualityChart data={chartData} onExpand={() => handleExpand('quality')} />
              <EfficiencyChart data={chartData} onExpand={() => handleExpand('efficiency')} />
              <FinanceChart
                data={chartData}
                revenueAvailable={revenueAvailable}
                granularity={granularity}
                onExpand={() => handleExpand('finance')}
              />
            </Box>
          ) : (
            <Box sx={{ mt: 2.5 }}>
              {expandedChart === 'tasks' && (
                <TasksChart data={chartData} expanded onExpand={() => handleExpand('tasks')} />
              )}
              {expandedChart === 'quality' && (
                <QualityChart data={chartData} expanded onExpand={() => handleExpand('quality')} />
              )}
              {expandedChart === 'efficiency' && (
                <EfficiencyChart data={chartData} expanded onExpand={() => handleExpand('efficiency')} />
              )}
              {expandedChart === 'finance' && (
                <FinanceChart
                  data={chartData}
                  revenueAvailable={revenueAvailable}
                  granularity={granularity}
                  expanded
                  onExpand={() => handleExpand('finance')}
                />
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
