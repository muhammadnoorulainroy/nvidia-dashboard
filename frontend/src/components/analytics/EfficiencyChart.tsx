import { Box, Typography } from '@mui/material'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
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

const HOURS_SERIES = [
  { key: 'jibble_hours', label: 'Jibble Hours', color: '#3F51B5' },
  { key: 'accounted_hours', label: 'Accounted Hours', color: '#00BCD4' },
]

const AHT_SERIES = { key: 'aht_avg', label: 'AHT (hrs/task)', color: '#009688' }

export default function EfficiencyChart({ data, expanded, onExpand }: Props) {
  return (
    <ChartCard title="TIME & EFFICIENCY" subtitle="Jibble vs Accounted Hours | AHT trend" color="#009688" expanded={expanded} onExpand={onExpand}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

        {/* ── Top: Hours grouped bars ── */}
        <Box sx={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Header + legend */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#3F51B5' }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#3F51B5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Hours
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto' }}>
              {HOURS_SERIES.map((s) => (
                <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <svg width="16" height="10">
                    <rect x="2" y="1" width="12" height="8" rx="2" fill={s.color} fillOpacity="0.85" />
                  </svg>
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
                    const info = HOURS_SERIES.find((s) => s.key === name)
                    return [Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 }), info?.label || name]
                  }}
                />
                <Bar dataKey="jibble_hours" fill="#3F51B5" radius={[4, 4, 0, 0]} barSize={20} name="jibble_hours" fillOpacity={0.85} />
                <Bar dataKey="accounted_hours" fill="#00BCD4" radius={[4, 4, 0, 0]} barSize={20} name="accounted_hours" fillOpacity={0.85} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        {/* Divider */}
        <Box sx={{ borderTop: '1px dashed #E2E8F0', mx: 1 }} />

        {/* ── Bottom: AHT line ── */}
        <Box sx={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Header + legend */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#009688' }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#009688', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AHT
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
              <svg width="24" height="10">
                <line x1="0" y1="5" x2="24" y2="5" stroke={AHT_SERIES.color} strokeWidth={2.5} />
                <circle cx="12" cy="5" r="2.5" fill={AHT_SERIES.color} />
              </svg>
              <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{AHT_SERIES.label}</Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10, border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                  }}
                  formatter={(value: any) => {
                    if (value === null || value === undefined) return ['-', AHT_SERIES.label]
                    return [`${Number(value).toFixed(1)} hrs`, AHT_SERIES.label]
                  }}
                />
                <Line type="monotone" dataKey="aht_avg" stroke="#009688" strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#009688', strokeWidth: 0 }}
                  activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }}
                  name="aht_avg" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </ChartCard>
  )
}
