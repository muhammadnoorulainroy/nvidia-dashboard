import { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Autocomplete,
  TextField,
  Chip,
  Button,
  ButtonGroup,
} from '@mui/material'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { Tune as TuneIcon } from '@mui/icons-material'
import type { AnalyticsDataPoint, AnalyticsKPIDefinition } from '../../services/api'

interface Props {
  data: AnalyticsDataPoint[]
  availableKpis: AnalyticsKPIDefinition[]
  granularity: string
}

/* ─── Preset KPI groups ─── */
const PRESETS: Record<string, string[]> = {
  'Core Tasks': ['unique_tasks', 'new_tasks', 'rework_tasks', 'delivered'],
  Financial: ['revenue', 'cost', 'margin', 'margin_percent'],
  Efficiency: ['aht_avg', 'accounted_hours', 'jibble_hours', 'efficiency_percent'],
  Quality: ['avg_rating', 'rework_percent'],
  People: ['trainers_active', 'team_size'],
}

/* ─── Per-unit rendering config ─── */
const UNIT_CONFIG: Record<
  string,
  {
    label: string
    chartType: 'line' | 'bar' | 'area'
    yFormatter: (v: number) => string
    color: string      // accent for badge / Y-axis
    bgFrom: string     // light gradient start
    bgTo: string       // light gradient end
  }
> = {
  count: {
    label: 'Count',
    chartType: 'line',
    yFormatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v))),
    color: '#6366F1',
    bgFrom: '#EEF2FF',
    bgTo: '#F8FAFC',
  },
  currency: {
    label: 'USD ($)',
    chartType: 'bar',
    yFormatter: (v) => {
      if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
      if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
      return `$${v}`
    },
    color: '#10B981',
    bgFrom: '#ECFDF5',
    bgTo: '#F8FAFC',
  },
  percent: {
    label: 'Percentage (%)',
    chartType: 'line',
    yFormatter: (v) => `${v}%`,
    color: '#F59E0B',
    bgFrom: '#FFFBEB',
    bgTo: '#F8FAFC',
  },
  hours: {
    label: 'Hours',
    chartType: 'bar',
    yFormatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`),
    color: '#3B82F6',
    bgFrom: '#EFF6FF',
    bgTo: '#F8FAFC',
  },
  rating: {
    label: 'Rating (1–5)',
    chartType: 'line',
    yFormatter: (v) => v.toFixed(1),
    color: '#EC4899',
    bgFrom: '#FDF2F8',
    bgTo: '#F8FAFC',
  },
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return '-'
  if (unit === 'currency') {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }
  if (unit === 'percent') return `${value.toFixed(1)}%`
  if (unit === 'rating') return value.toFixed(2)
  if (unit === 'hours') return `${value.toFixed(1)}h`
  return value.toLocaleString()
}

/* ═══════════════════════════════════════════════════════════
   Finance Summary (horizontal bars – used for daily / single-week)
   Handles both dollar KPIs and absorbed percent KPIs (e.g. margin_percent)
   ═══════════════════════════════════════════════════════════ */
const PERCENT_KPI_KEYS = ['margin_percent', 'efficiency_percent', 'rework_percent']

function CurrencySummaryPanel({
  data,
  kpis,
  height,
}: {
  data: AnalyticsDataPoint[]
  kpis: AnalyticsKPIDefinition[]
  height: number
}) {
  /* Split KPIs into dollar-based and percent-based */
  const dollarKpis = kpis.filter((k) => !PERCENT_KPI_KEYS.includes(k.key))
  const percentKpis = kpis.filter((k) => PERCENT_KPI_KEYS.includes(k.key))

  /* Compute totals / averages */
  const dollarTotals = useMemo(() => {
    return dollarKpis.map((kpi) => {
      const total = data.reduce((sum, d) => {
        const val = (d as any)[kpi.key]
        return sum + (typeof val === 'number' ? val : 0)
      }, 0)
      return { key: kpi.key, name: kpi.label, value: Math.round(total * 100) / 100, color: kpi.color }
    })
  }, [data, dollarKpis])

  /* Compute margin from dollar totals so headline & bar always agree */
  const revenue = dollarTotals.find((t) => t.key === 'revenue')?.value || 0
  const cost = dollarTotals.find((t) => t.key === 'cost')?.value || 0
  const hasRevAndCost = dollarKpis.some((k) => k.key === 'revenue') && dollarKpis.some((k) => k.key === 'cost')
  const computedMarginPct = hasRevAndCost && revenue > 0
    ? Math.round(((revenue - cost) / revenue) * 1000) / 10
    : null

  const percentTotals = useMemo(() => {
    return percentKpis.map((kpi) => {
      /* margin_percent → derive from actual dollar totals so it matches the headline */
      if (kpi.key === 'margin_percent' && computedMarginPct !== null) {
        return { key: kpi.key, name: kpi.label, value: computedMarginPct, color: kpi.color }
      }

      /* Other percents: weighted average across days that have data */
      let sum = 0
      let count = 0
      for (const d of data) {
        const val = (d as any)[kpi.key]
        if (typeof val === 'number' && val !== 0) {
          sum += val
          count++
        }
      }
      const avg = count > 0 ? sum / count : 0
      return { key: kpi.key, name: kpi.label, value: Math.round(avg * 10) / 10, color: kpi.color }
    })
  }, [data, percentKpis, computedMarginPct])

  const getMarginColor = (pct: number | null) => {
    if (pct === null) return '#94A3B8'
    if (pct >= 50) return '#10B981'
    if (pct >= 25) return '#F59E0B'
    if (pct >= 0) return '#F97316'
    return '#EF4444'
  }

  const hasDollarBars = dollarTotals.length > 0
  const hasPercentBars = percentTotals.length > 0

  return (
    <Box sx={{ height, display: 'flex', flexDirection: 'column' }}>
      {/* Margin % headline */}
      {computedMarginPct !== null && (
        <Box sx={{ textAlign: 'center', pt: 1 }}>
          <Typography
            sx={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, color: getMarginColor(computedMarginPct) }}
          >
            {computedMarginPct.toFixed(1)}%
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.08em' }}>
            MARGIN
          </Typography>
        </Box>
      )}

      {/* Dollar horizontal bars */}
      {hasDollarBars && (
        <Box sx={{ flex: hasPercentBars ? 3 : 1, minHeight: 0, px: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dollarTotals} layout="vertical" margin={{ top: 8, right: 24, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                tickFormatter={(v) => UNIT_CONFIG.currency.yFormatter(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10, border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                }}
                formatter={(value: any) => [UNIT_CONFIG.currency.yFormatter(Number(value)), '']}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {dollarTotals.map((entry, index) => (
                  <Cell key={index} fill={entry.color} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Percent horizontal bars */}
      {hasPercentBars && (
        <Box sx={{ flex: 1, minHeight: 0, px: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={percentTotals} layout="vertical" margin={{ top: 4, right: 24, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10, border: '1px solid #E2E8F0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, padding: '8px 12px',
                }}
                formatter={(value: any) => [`${Number(value).toFixed(1)}%`, '']}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {percentTotals.map((entry, index) => (
                  <Cell key={index} fill={entry.color} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {/* Bottom exact numbers */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          py: 1,
          mx: 2,
          borderTop: '1px solid #E2E8F0',
          gap: 1,
        }}
      >
        {dollarTotals.map((item) => (
          <Box key={item.key} sx={{ textAlign: 'center', px: 1 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: item.color }}>
              {UNIT_CONFIG.currency.yFormatter(item.value)}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>
              {item.name}
            </Typography>
          </Box>
        ))}
        {percentTotals.map((item) => (
          <Box key={item.key} sx={{ textAlign: 'center', px: 1 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: item.color }}>
              {item.value.toFixed(1)}%
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>
              {item.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   UnitPanel – one chart per unit-type group
   ═══════════════════════════════════════════════════════════ */
function UnitPanel({
  data,
  kpis,
  unitType,
  showXAxis,
  height,
  useSummary,
}: {
  data: AnalyticsDataPoint[]
  kpis: AnalyticsKPIDefinition[]
  unitType: string
  showXAxis: boolean
  height: number
  useSummary?: boolean
}) {
  /* Currency daily → horizontal summary */
  if (unitType === 'currency' && useSummary) {
    return (
      <PanelWrapper unitType={unitType} height={height}>
        <CurrencySummaryPanel data={data} kpis={kpis} height={height - 40} />
      </PanelWrapper>
    )
  }

  const config = UNIT_CONFIG[unitType] || UNIT_CONFIG.count
  const yDomain = unitType === 'rating' ? ([1, 5] as [number, number]) : undefined
  const yDomainPercent = unitType === 'percent' ? ([0, 'auto'] as [number, string]) : undefined

  return (
    <PanelWrapper unitType={unitType} height={height} kpis={kpis}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 20, left: 4, bottom: showXAxis ? 4 : -16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="period_label"
              tick={showXAxis ? { fontSize: 11, fill: '#94A3B8' } : false}
              tickLine={false}
              axisLine={showXAxis ? { stroke: '#CBD5E1' } : false}
              interval="preserveStartEnd"
              height={showXAxis ? 32 : 8}
            />
            <YAxis
              tick={{ fontSize: 11, fill: config.color, fontWeight: 600 }}
              tickLine={false}
              axisLine={false}
              width={58}
              domain={yDomain || yDomainPercent || undefined}
              tickFormatter={(v) => config.yFormatter(v)}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                fontSize: 12,
                padding: '8px 12px',
              }}
              formatter={(value: any, name: string) => {
                const kpi = kpis.find((k) => k.key === name)
                if (!kpi || value === null || value === undefined) return ['-', name]
                return [formatValue(Number(value), kpi.unit), kpi.label]
              }}
            />
            {kpis.map((kpi) => {
              if (config.chartType === 'bar') {
                return (
                  <Bar
                    key={kpi.key}
                    dataKey={kpi.key}
                    fill={kpi.color}
                    radius={[4, 4, 0, 0]}
                    barSize={kpis.length <= 2 ? 24 : 16}
                    name={kpi.key}
                    fillOpacity={0.85}
                  />
                )
              }
              if (config.chartType === 'area' && kpis.length > 1) {
                return (
                  <Area
                    key={kpi.key}
                    type="monotone"
                    dataKey={kpi.key}
                    stroke={kpi.color}
                    fill={kpi.color}
                    fillOpacity={0.12}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: kpi.color, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                    name={kpi.key}
                    connectNulls
                  />
                )
              }
              return (
                <Line
                  key={kpi.key}
                  type="monotone"
                  dataKey={kpi.key}
                  stroke={kpi.color}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: kpi.color, strokeWidth: 0 }}
                  activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }}
                  name={kpi.key}
                  connectNulls
                />
              )
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </PanelWrapper>
  )
}

/* ─── Shared wrapper that gives each panel its header bar + background ─── */
function PanelWrapper({
  unitType,
  height,
  kpis,
  children,
}: {
  unitType: string
  height: number
  kpis?: AnalyticsKPIDefinition[]
  children: React.ReactNode
}) {
  const config = UNIT_CONFIG[unitType] || UNIT_CONFIG.count

  return (
    <Box
      sx={{
        height,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${config.bgFrom} 0%, ${config.bgTo} 100%)`,
        borderRadius: 2,
        border: '1px solid',
        borderColor: `${config.color}18`,
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid',
          borderColor: `${config.color}15`,
          flexWrap: 'wrap',
        }}
      >
        {/* Colored accent bar */}
        <Box sx={{ width: 3, height: 16, borderRadius: 1, backgroundColor: config.color }} />
        <Typography
          sx={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: config.color,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {config.label}
        </Typography>

        {/* Inline mini-legend */}
        {kpis && kpis.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto', flexWrap: 'wrap' }}>
            {kpis.map((kpi) => (
              <Box key={kpi.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: kpi.color,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {kpi.label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Chart content */}
      {children}
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════ */
export default function CustomKPIChart({ data, availableKpis, granularity }: Props) {
  const [selectedKpis, setSelectedKpis] = useState<AnalyticsKPIDefinition[]>([])
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const handlePreset = (presetName: string) => {
    const keys = PRESETS[presetName] || []
    const kpis = availableKpis.filter((k) => keys.includes(k.key))
    setSelectedKpis(kpis)
    setActivePreset(presetName)
  }

  /* Group selected KPIs by unit type.
     Special case: when daily (summary mode), absorb finance-related percent
     KPIs (margin_percent) into the currency group so they render together
     in the horizontal summary instead of a lonely separate panel. */
  const FINANCE_PERCENT_KEYS = ['margin_percent']
  const unitGroups = useMemo(() => {
    const groups: Record<string, AnalyticsKPIDefinition[]> = {}
    const hasCurrency = selectedKpis.some((k) => k.unit === 'currency')
    const absorbFinancePct = granularity === 'daily' && hasCurrency

    for (const kpi of selectedKpis) {
      const effectiveUnit =
        absorbFinancePct && kpi.unit === 'percent' && FINANCE_PERCENT_KEYS.includes(kpi.key)
          ? 'currency'
          : kpi.unit
      if (!groups[effectiveUnit]) groups[effectiveUnit] = []
      groups[effectiveUnit].push(kpi)
    }

    // If percent group ended up empty after absorbing, remove it
    if (groups['percent'] && groups['percent'].length === 0) {
      delete groups['percent']
    }

    return groups
  }, [selectedKpis, granularity])

  const groupEntries = Object.entries(unitGroups)
  const groupCount = groupEntries.length

  /* Dynamic panel heights – generous minimums so charts are readable */
  const panelHeight = useMemo(() => {
    if (groupCount <= 1) return 360
    if (groupCount === 2) return 280
    if (groupCount === 3) return 240
    return 220 // 4+
  }, [groupCount])

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        backgroundColor: '#FAFBFD',
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid #E2E8F0',
          background: 'linear-gradient(135deg, #6366F10A 0%, #6366F104 100%)',
          flexWrap: 'wrap',
        }}
      >
        <TuneIcon sx={{ color: '#6366F1', fontSize: 20 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' }}>
          Custom KPI Chart
        </Typography>
        <Typography variant="caption" sx={{ color: '#94A3B8' }}>
          KPIs auto-grouped by unit type into separate panels
        </Typography>
      </Box>

      {/* ── Controls ── */}
      <Box
        sx={{
          px: 2.5,
          pt: 1.5,
          pb: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'flex-start',
          borderBottom: selectedKpis.length > 0 ? '1px solid #E2E8F0' : 'none',
          background: '#fff',
        }}
      >
        {/* Presets */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: '#64748B', fontWeight: 600, fontSize: '0.7rem', mb: 0.5, display: 'block' }}
          >
            Quick Presets
          </Typography>
          <ButtonGroup size="small" variant="outlined">
            {Object.keys(PRESETS).map((name) => (
              <Button
                key={name}
                onClick={() => handlePreset(name)}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderColor: '#E2E8F0',
                  ...(activePreset === name
                    ? {
                        backgroundColor: '#6366F1',
                        color: 'white',
                        '&:hover': { backgroundColor: '#5558E6' },
                      }
                    : { color: '#64748B', '&:hover': { color: '#6366F1' } }),
                }}
              >
                {name}
              </Button>
            ))}
          </ButtonGroup>
        </Box>

        {/* KPI Multi-select */}
        <Box sx={{ flex: 1, minWidth: 300 }}>
          <Typography
            variant="caption"
            sx={{ color: '#64748B', fontWeight: 600, fontSize: '0.7rem', mb: 0.5, display: 'block' }}
          >
            Select KPIs
          </Typography>
          <Autocomplete
            multiple
            size="small"
            options={availableKpis}
            value={selectedKpis}
            onChange={(_, newValue) => {
              setSelectedKpis(newValue)
              setActivePreset(null)
            }}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.key === value.key}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index })
                return (
                  <Chip
                    key={key}
                    {...tagProps}
                    label={option.label}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      backgroundColor: `${option.color}15`,
                      color: option.color,
                      borderColor: `${option.color}40`,
                      border: '1px solid',
                      '& .MuiChip-deleteIcon': { color: `${option.color}80`, fontSize: 14 },
                    }}
                  />
                )
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={selectedKpis.length === 0 ? 'Choose KPIs to plot...' : ''}
                sx={{
                  '& .MuiInputBase-root': { fontSize: '0.8rem', minHeight: 38, backgroundColor: '#fff' },
                }}
              />
            )}
          />
        </Box>
      </Box>

      {/* ── Chart Panels ── */}
      {selectedKpis.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
          {groupEntries.map(([unitType, kpis], idx) => (
            <UnitPanel
              key={unitType}
              data={data}
              kpis={kpis}
              unitType={unitType}
              showXAxis={idx === groupEntries.length - 1}
              height={panelHeight}
              useSummary={unitType === 'currency' && granularity === 'daily'}
            />
          ))}
        </Box>
      ) : (
        <Box sx={{ py: 8, textAlign: 'center', background: '#fff' }}>
          <Box sx={{ mb: 1.5 }}>
            <TuneIcon sx={{ fontSize: 40, color: '#CBD5E1' }} />
          </Box>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.9rem', fontWeight: 500 }}>
            Select KPIs above or choose a preset to start visualizing
          </Typography>
        </Box>
      )}
    </Paper>
  )
}
