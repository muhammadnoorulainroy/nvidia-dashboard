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

const FINANCE_SERIES = [
  { key: 'revenue', label: 'Revenue', color: '#4CAF50', type: 'bar' as const },
  { key: 'cost', label: 'Cost', color: '#F44336', type: 'bar' as const },
  { key: 'margin_percent', label: 'Margin %', color: '#FFC107', type: 'line' as const },
]

/* ─── Summary view: horizontal bars for a single period ─── */
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
    if (pct >= 50) return '#10B981'
    if (pct >= 25) return '#F59E0B'
    if (pct >= 0) return '#F97316'
    return '#EF4444'
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Margin % headline */}
      <Box sx={{ textAlign: 'center', pt: 1, pb: 0.5 }}>
        <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: getMarginColor(totals.marginPct) }}>
          {totals.marginPct !== null ? `${totals.marginPct.toFixed(1)}%` : '-'}
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.08em' }}>
          MARGIN
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, px: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false}
              axisLine={{ stroke: '#E2E8F0' }} tickFormatter={(v) => formatCurrency(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
              tickLine={false} axisLine={false} width={100} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px' }}
              formatter={(value: any) => [formatCurrency(Number(value)), '']}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
              {barData.map((entry, index) => (
                <Cell key={index} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Bottom totals */}
      <Box sx={{ display: 'flex', justifyContent: 'space-around', py: 1, mx: 2, borderTop: '1px solid #E2E8F0' }}>
        {[
          { label: 'Revenue', value: totals.revenue, color: '#4CAF50' },
          { label: 'Total Cost', value: totals.totalCost, color: '#F44336' },
          { label: 'Margin', value: totals.margin, color: totals.margin >= 0 ? '#FFC107' : '#D32F2F' },
        ].map((item) => (
          <Box key={item.label} sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: item.color }}>{formatCurrency(item.value)}</Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/* ─── Time-series view: bars + margin line split ─── */
function FinanceTimeSeriesView({ data }: { data: AnalyticsDataPoint[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Top: Revenue & Cost bars */}
      <Box sx={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#4CAF50' }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#4CAF50', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Revenue & Cost
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto' }}>
            {FINANCE_SERIES.filter((s) => s.type === 'bar').map((s) => (
              <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <svg width="16" height="10"><rect x="2" y="1" width="12" height="8" rx="2" fill={s.color} fillOpacity="0.85" /></svg>
                <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="period_label" tick={false} tickLine={false} axisLine={false} height={4} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px' }}
                formatter={(value: any, name: string) => {
                  const info = FINANCE_SERIES.find((s) => s.key === name)
                  return [formatCurrency(Number(value)), info?.label || name]
                }}
              />
              <Bar dataKey="revenue" fill="#4CAF50" radius={[4, 4, 0, 0]} barSize={22} name="revenue" fillOpacity={0.85} />
              <Bar dataKey="cost" fill="#F44336" radius={[4, 4, 0, 0]} barSize={22} name="cost" fillOpacity={0.75} />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </Box>

      <Box sx={{ borderTop: '1px dashed #E2E8F0', mx: 1 }} />

      {/* Bottom: Margin % line */}
      <Box sx={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#FFC107' }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#FFC107', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Margin %
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
            <svg width="24" height="10">
              <line x1="0" y1="5" x2="24" y2="5" stroke="#FFC107" strokeWidth={2.5} />
              <circle cx="12" cy="5" r="2.5" fill="#FFC107" />
            </svg>
            <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>Margin %</Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="period_label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false}
                axisLine={{ stroke: '#CBD5E1' }} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false}
                width={42} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px' }}
                formatter={(value: any) => {
                  if (value === null || value === undefined) return ['-', 'Margin %']
                  return [`${Number(value).toFixed(1)}%`, 'Margin %']
                }}
              />
              <ReferenceLine y={50} stroke="#FFC10730" strokeDasharray="8 4" />
              <Line type="monotone" dataKey="margin_percent" stroke="#FFC107" strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#FFC107', strokeWidth: 0 }}
                activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }}
                name="margin_percent" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </Box>
  )
}

export default function FinanceChart({ data, revenueAvailable, granularity, expanded, onExpand }: Props) {
  const useSummaryView = granularity === 'daily'

  return (
    <ChartCard
      title="FINANCE"
      subtitle={useSummaryView ? 'Weekly summary: Revenue, Cost breakdown, Margin' : 'Revenue vs Cost | Margin % trend'}
      color="#4CAF50"
      expanded={expanded}
      onExpand={onExpand}
    >
      {!revenueAvailable && !useSummaryView && (
        <Alert severity="info" sx={{ m: 1, py: 0.25, fontSize: '0.75rem', '& .MuiAlert-icon': { fontSize: 16 } }}>
          Revenue data is only available at weekly/monthly granularity. Showing cost data only.
        </Alert>
      )}
      {useSummaryView ? <FinanceSummaryView data={data} /> : <FinanceTimeSeriesView data={data} />}
    </ChartCard>
  )
}
