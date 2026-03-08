import { Box, Typography } from '@mui/material'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { AnalyticsDataPoint } from '../../services/api'
import ChartCard from './ChartCard'

interface Props {
  data: AnalyticsDataPoint[]
  expanded?: boolean
  onExpand?: () => void
}

const SERIES = [
  { key: 'new_tasks', label: 'New Tasks', color: '#4CAF50', type: 'area' as const },
  { key: 'rework_tasks', label: 'Rework', color: '#FF9800', type: 'area' as const },
  { key: 'delivered', label: 'Delivered', color: '#2196F3', type: 'line' as const },
  { key: 'in_queue', label: 'In Queue', color: '#9C27B0', type: 'dash' as const },
]

/* Reusable SVG legend swatch */
function LegendSwatch({ color, type }: { color: string; type: 'area' | 'line' | 'dash' }) {
  if (type === 'area') {
    return (
      <svg width="20" height="10">
        <rect x="0" y="1" width="20" height="8" rx="2" fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1} />
      </svg>
    )
  }
  return (
    <svg width="20" height="10">
      <line x1="0" y1="5" x2="20" y2="5" stroke={color} strokeWidth={2}
        strokeDasharray={type === 'dash' ? '4 3' : ''} />
      {type === 'line' && <circle cx="10" cy="5" r="2.5" fill={color} />}
    </svg>
  )
}

export default function TasksChart({ data, expanded, onExpand }: Props) {
  return (
    <ChartCard title="TASKS" subtitle="New + Rework stacked, Delivered overlay" color="#4CAF50" expanded={expanded} onExpand={onExpand}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Custom legend */}
        <Box sx={{ display: 'flex', gap: 2, px: 1, pt: 0.5, pb: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {SERIES.map((s) => (
            <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LegendSwatch color={s.color} type={s.type} />
              <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{s.label}</Typography>
            </Box>
          ))}
        </Box>

        {/* Chart */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="gradRework" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF9800" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#FF9800" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={{ stroke: '#CBD5E1' }}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10, border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                }}
                formatter={(value: any, name: string) => {
                  const info = SERIES.find((s) => s.key === name)
                  return [Number(value).toLocaleString(), info?.label || name]
                }}
              />
              <Area type="monotone" dataKey="new_tasks" stackId="tasks" stroke="#4CAF50" fill="url(#gradNew)" strokeWidth={2} name="new_tasks" />
              <Area type="monotone" dataKey="rework_tasks" stackId="tasks" stroke="#FF9800" fill="url(#gradRework)" strokeWidth={2} name="rework_tasks" />
              <Line type="monotone" dataKey="delivered" stroke="#2196F3" strokeWidth={2.5}
                dot={{ r: 3, fill: '#2196F3', strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} name="delivered" />
              <Line type="monotone" dataKey="in_queue" stroke="#9C27B0" strokeWidth={1.5}
                strokeDasharray="5 4" dot={false} name="in_queue" />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </ChartCard>
  )
}
