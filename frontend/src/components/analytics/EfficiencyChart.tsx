import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { AnalyticsDataPoint } from '../../services/api'
import ChartCard from './ChartCard'

interface Props {
  data: AnalyticsDataPoint[]
  expanded?: boolean
  onExpand?: () => void
}

export default function EfficiencyChart({ data, expanded, onExpand }: Props) {
  return (
    <ChartCard
      title="TIME & EFFICIENCY"
      subtitle="Jibble vs Accounted Hours (bars) | AHT trend (line)"
      color="#009688"
      expanded={expanded}
      onExpand={onExpand}
    >
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
            width={50}
            label={{
              value: 'Hours',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10, fill: '#94A3B8' },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#009688' }}
            tickLine={false}
            axisLine={false}
            width={40}
            label={{
              value: 'AHT (hrs)',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: 10, fill: '#009688' },
            }}
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
                jibble_hours: 'Jibble Hours',
                accounted_hours: 'Accounted Hours',
                aht_avg: 'AHT (hrs/task)',
                efficiency_percent: 'Efficiency %',
              }
              if (name === 'aht_avg') return [v.toFixed(1), labels[name] || name]
              if (name === 'efficiency_percent') return [`${v.toFixed(1)}%`, labels[name] || name]
              return [v.toLocaleString(undefined, { maximumFractionDigits: 1 }), labels[name] || name]
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => {
              const labels: Record<string, string> = {
                jibble_hours: 'Jibble Hours',
                accounted_hours: 'Accounted Hours',
                aht_avg: 'AHT (hrs/task)',
              }
              return labels[value] || value
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="jibble_hours"
            fill="#3F51B5"
            radius={[3, 3, 0, 0]}
            barSize={20}
            name="jibble_hours"
            fillOpacity={0.85}
          />
          <Bar
            yAxisId="left"
            dataKey="accounted_hours"
            fill="#00BCD4"
            radius={[3, 3, 0, 0]}
            barSize={20}
            name="accounted_hours"
            fillOpacity={0.85}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="aht_avg"
            stroke="#009688"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#009688' }}
            activeDot={{ r: 5 }}
            name="aht_avg"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
