import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material'
import {
  OpenInFull as ExpandIcon,
  CloseFullscreen as CollapseIcon,
} from '@mui/icons-material'

interface Props {
  title: string
  subtitle?: string
  color: string
  children: React.ReactNode
  expanded?: boolean
  onExpand?: () => void
  height?: number
}

export default function ChartCard({
  title,
  subtitle,
  color,
  children,
  expanded,
  onExpand,
  height = 320,
}: Props) {
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
      {/* Header */}
      <Box
        sx={{
          px: 2, py: 1.25,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #E2E8F0',
          background: `linear-gradient(135deg, ${color}0A 0%, ${color}04 100%)`,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontWeight: 700, fontSize: '0.85rem', color: '#1E293B',
              display: 'flex', alignItems: 'center', gap: 0.75,
            }}
          >
            <Box
              sx={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
              }}
            />
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" sx={{ color: '#94A3B8', fontSize: '0.68rem', ml: 2.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {onExpand && (
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <IconButton size="small" onClick={onExpand} sx={{ color: '#94A3B8' }}>
              {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Chart Content */}
      <Box sx={{ px: 1, py: 1, height: expanded ? 500 : height }}>
        {children}
      </Box>
    </Paper>
  )
}
