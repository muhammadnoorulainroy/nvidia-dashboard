import { Box, Typography } from '@mui/material'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import type { AnalyticsDataPoint } from '../../services/api'
import ChartCard from './ChartCard'

interface Props {
  data: AnalyticsDataPoint[]
  expanded?: boolean
  onExpand?: () => void
}

const RATING_LINES = [
  { key: 'avg_rating', label: 'Overall', color: '#1E88E5', strokeWidth: 2.5 },
  { key: 'human_avg_rating', label: 'Human', color: '#2E7D32', strokeWidth: 2, dashArray: '6 3' },
  { key: 'agentic_avg_rating', label: 'Agentic', color: '#E65100', strokeWidth: 2, dashArray: '6 3' },
]

export default function QualityChart({ data, expanded, onExpand }: Props) {
  const hasHuman = data.some((d) => (d as any).human_avg_rating != null)
  const hasAgentic = data.some((d) => (d as any).agentic_avg_rating != null)

  const visibleLines = RATING_LINES.filter((line) => {
    if (line.key === 'human_avg_rating') return hasHuman
    if (line.key === 'agentic_avg_rating') return hasAgentic
    return true
  })

  return (
    <ChartCard
      title="QUALITY"
      subtitle="Ratings & Rework breakdown"
      color="#E91E63"
      expanded={expanded}
      onExpand={onExpand}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
        {/* ── Top: Avg Rating lines ── */}
        <Box sx={{ flex: 3, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Section header with custom legend */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#1E88E5' }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#1E88E5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avg Rating
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto', flexWrap: 'wrap' }}>
              {visibleLines.map((line) => (
                <Box key={line.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {/* SVG line sample matching the actual chart style */}
                  <svg width="24" height="10">
                    <line
                      x1="0" y1="5" x2="24" y2="5"
                      stroke={line.color}
                      strokeWidth={line.strokeWidth}
                      strokeDasharray={line.dashArray || ''}
                    />
                    <circle cx="12" cy="5" r="2.5" fill={line.color} />
                  </svg>
                  <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>
                    {line.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="period_label" tick={false} tickLine={false} axisLine={false} height={4} />
              <YAxis
                domain={[3, 5]}
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8, border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                }}
                formatter={(value: any, name: string) => {
                  if (value === null || value === undefined) return ['-', name]
                  const info = RATING_LINES.find((l) => l.key === name)
                  return [Number(value).toFixed(2), info?.label || name]
                }}
              />
              <ReferenceLine
                y={4.5}
                stroke="#94A3B830"
                strokeDasharray="8 4"
                label={{ value: '4.5', position: 'left', fontSize: 9, fill: '#94A3B8' }}
              />
              {visibleLines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                  strokeDasharray={line.dashArray}
                  dot={{ r: 3, fill: line.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                  name={line.key}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          </Box>
        </Box>

        {/* Divider */}
        <Box sx={{ borderTop: '1px dashed #E2E8F0', mx: 1 }} />

        {/* ── Bottom: Rework % bars ── */}
        <Box sx={{ flex: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 3, height: 14, borderRadius: 1, backgroundColor: '#D32F2F' }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#D32F2F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rework %
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
              <svg width="16" height="10">
                <rect x="2" y="1" width="12" height="8" rx="2" fill="#D32F2F" fillOpacity="0.75" />
              </svg>
              <Typography sx={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>
                Rework %
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 'auto']}
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8, border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                }}
                formatter={(value: any) => {
                  if (value === null || value === undefined) return ['-', 'Rework %']
                  return [`${Number(value).toFixed(1)}%`, 'Rework %']
                }}
              />
              <Bar
                dataKey="rework_percent"
                fill="#D32F2F"
                fillOpacity={0.75}
                radius={[3, 3, 0, 0]}
                barSize={20}
                name="rework_percent"
              />
            </ComposedChart>
          </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </ChartCard>
  )
}
