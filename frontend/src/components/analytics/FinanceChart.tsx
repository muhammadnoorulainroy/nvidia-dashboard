import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts'
import { Box, Typography, Alert } from '@mui/material'
import type { AnalyticsDataPoint } from '../../services/api'
import ChartCard from './ChartCard'

interface Props {
  data: AnalyticsDataPoint[]
  revenueAvailable: boolean
  granularity: string
  expanded?: boolean
  onExpand?: () => void
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

// Summary view: aggregated totals for a single period (e.g., one week)
function FinanceSummaryView({ data }: { data: AnalyticsDataPoint[] }) {
  const totals = useMemo(() => {
    const revenue = data.reduce((sum, d) => sum + (d.revenue || 0), 0)
    const workCost = data.reduce((sum, d) => sum + (d.work_cost || 0), 0)
    const nonWorkCost = data.reduce((sum, d) => sum + (d.non_work_cost || 0), 0)
    const totalCost = workCost + nonWorkCost
    const margin = revenue - totalCost
    const marginPct = revenue > 0 ? ((margin / revenue) * 100) : null
    return { revenue, workCost, nonWorkCost, totalCost, margin, marginPct }
  }, [data])

  const barData = [
    { name: 'Revenue', value: totals.revenue, color: '#4CAF50' },
    { name: 'Work Cost', value: totals.workCost, color: '#F44336' },
    { name: 'Non-Work Cost', value: totals.nonWorkCost, color: '#FF8A80' },
    { name: 'Margin', value: totals.margin, color: totals.margin >= 0 ? '#FFC107' : '#D32F2F' },
  ]

  const getMarginColor = (pct: number | null) => {
    if (pct === null) return '#94A3B8'
    if (pct >= 50) return '#4CAF50'
    if (pct >= 25) return '#FFC107'
    if (pct >= 0) return '#FF9800'
    return '#F44336'
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Margin % headline */}
      <Box sx={{ textAlign: 'center', pt: 1, pb: 0.5 }}>
        <Typography
          sx={{
            fontSize: '2rem', fontWeight: 800, lineHeight: 1,
            color: getMarginColor(totals.marginPct),
          }}
        >
          {totals.marginPct !== null ? `${totals.marginPct.toFixed(1)}%` : '-'}
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600 }}>
          MARGIN
        </Typography>
      </Box>

      {/* Bar chart: Revenue vs Work Cost vs Non-Work Cost vs Margin */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }}
              tickFormatter={(v) => formatCurrency(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8, border: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12,
              }}
              formatter={(value: any) => [formatCurrency(Number(value)), '']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
              {barData.map((entry, index) => (
                <Cell key={index} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Bottom row: exact numbers */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-around', pb: 0.5, pt: 0.5,
        borderTop: '1px solid #F1F5F9',
      }}>
        {[
          { label: 'Revenue', value: totals.revenue, color: '#4CAF50' },
          { label: 'Total Cost', value: totals.totalCost, color: '#F44336' },
          { label: 'Margin', value: totals.margin, color: totals.margin >= 0 ? '#FFC107' : '#D32F2F' },
        ].map((item) => (
          <Box key={item.label} sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: item.color }}>
              {formatCurrency(item.value)}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// Time-series view: Revenue/Cost bars + Margin % line across multiple periods
function FinanceTimeSeriesView({ data }: { data: AnalyticsDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="period_label"
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          tickLine={false}
          axisLine={{ stroke: '#E2E8F0' }}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          tickLine={false}
          axisLine={false}
          width={55}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#FFC107' }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8, border: '1px solid #E2E8F0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12,
          }}
          formatter={(value: any, name: string) => {
            if (value === null || value === undefined) return ['-', name]
            const v = Number(value)
            const labels: Record<string, string> = {
              revenue: 'Revenue',
              cost: 'Cost',
              margin_percent: 'Margin %',
            }
            if (name === 'margin_percent') return [`${v.toFixed(1)}%`, labels[name] || name]
            return [formatCurrency(v), labels[name] || name]
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => {
            const labels: Record<string, string> = {
              revenue: 'Revenue',
              cost: 'Cost',
              margin_percent: 'Margin %',
            }
            return labels[value] || value
          }}
        />
        <ReferenceLine yAxisId="right" y={50} stroke="#FFC10730" strokeDasharray="8 4" />
        <Bar
          yAxisId="left"
          dataKey="revenue"
          fill="#4CAF50"
          radius={[3, 3, 0, 0]}
          barSize={24}
          name="revenue"
          fillOpacity={0.85}
        />
        <Bar
          yAxisId="left"
          dataKey="cost"
          fill="#F44336"
          radius={[3, 3, 0, 0]}
          barSize={24}
          name="cost"
          fillOpacity={0.75}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="margin_percent"
          stroke="#FFC107"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#FFC107', stroke: '#FFA000', strokeWidth: 1 }}
          activeDot={{ r: 5 }}
          name="margin_percent"
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default function FinanceChart({
  data,
  revenueAvailable,
  granularity,
  expanded,
  onExpand,
}: Props) {
  // Use summary view when showing daily data within a single week
  // (revenue is weekly, so daily bars are misleading)
  const useSummaryView = granularity === 'daily'

  return (
    <ChartCard
      title="FINANCE"
      subtitle={useSummaryView ? 'Weekly summary: Revenue, Cost breakdown, Margin' : 'Revenue vs Cost (bars) | Margin % (line)'}
      color="#4CAF50"
      expanded={expanded}
      onExpand={onExpand}
    >
      {!revenueAvailable && !useSummaryView && (
        <Alert
          severity="info"
          sx={{
            m: 1, py: 0.25, fontSize: '0.75rem',
            '& .MuiAlert-icon': { fontSize: 16 },
          }}
        >
          Revenue data is only available at weekly/monthly granularity.
          Showing cost data only.
        </Alert>
      )}
      {useSummaryView ? (
        <FinanceSummaryView data={data} />
      ) : (
        <FinanceTimeSeriesView data={data} />
      )}
    </ChartCard>
  )
}
