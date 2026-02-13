import {
  ResponsiveContainer,
  ComposedChart,
  Area,
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

export default function TasksChart({ data, expanded, onExpand }: Props) {
  return (
    <ChartCard
      title="TASKS"
      subtitle="New + Rework stacked, Delivered overlay"
      color="#4CAF50"
      expanded={expanded}
      onExpand={onExpand}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradRework" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF9800" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#FF9800" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            tickLine={false}
            axisLine={{ stroke: '#E2E8F0' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            tickLine={false}
            axisLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8, border: '1px solid #E2E8F0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12,
            }}
            formatter={(value: any, name: string) => {
              const labels: Record<string, string> = {
                new_tasks: 'New Tasks',
                rework_tasks: 'Rework',
                delivered: 'Delivered',
                in_queue: 'In Queue',
              }
              return [Number(value).toLocaleString(), labels[name] || name]
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Area
            type="monotone"
            dataKey="new_tasks"
            stackId="tasks"
            stroke="#4CAF50"
            fill="url(#gradNew)"
            strokeWidth={2}
            name="new_tasks"
          />
          <Area
            type="monotone"
            dataKey="rework_tasks"
            stackId="tasks"
            stroke="#FF9800"
            fill="url(#gradRework)"
            strokeWidth={2}
            name="rework_tasks"
          />
          <Line
            type="monotone"
            dataKey="delivered"
            stroke="#2196F3"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#2196F3' }}
            activeDot={{ r: 5 }}
            name="delivered"
          />
          <Line
            type="monotone"
            dataKey="in_queue"
            stroke="#9C27B0"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            name="in_queue"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
