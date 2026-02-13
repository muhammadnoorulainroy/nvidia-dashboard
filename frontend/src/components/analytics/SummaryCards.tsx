import { Box, Paper, Typography } from '@mui/material'
import type { AnalyticsSummaryCard } from '../../services/api'

function formatValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return '-'
  if (unit === 'currency') {
    if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }
  if (unit === 'percent') return `${value.toFixed(1)}%`
  if (unit === 'rating') return value.toFixed(2)
  if (unit === 'hours') return value.toFixed(1)
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString()
}

interface Props {
  summary: AnalyticsSummaryCard[]
}

export default function SummaryCards({ summary }: Props) {
  if (!summary || summary.length === 0) return null

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
          md: `repeat(${Math.min(summary.length, 6)}, 1fr)`,
        },
        gap: 1.5,
        mb: 2.5,
      }}
    >
      {summary.map((card) => (
        <Paper
          key={card.key}
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid #E2E8F0',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0, left: 0, right: 0, height: 3,
              background: card.color,
            },
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: '#64748B', fontWeight: 600, fontSize: '0.7rem',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            {card.label}
          </Typography>
          <Typography
            sx={{
              fontWeight: 800, fontSize: '1.5rem', color: '#1E293B',
              lineHeight: 1.2, mt: 0.5,
            }}
          >
            {formatValue(card.value, card.unit)}
          </Typography>
        </Paper>
      ))}
    </Box>
  )
}
