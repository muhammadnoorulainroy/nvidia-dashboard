import React from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { getTooltipForHeader } from '../../utils/columnTooltips'

interface TableHeaderWithTooltipProps {
  label: string
  tooltipKey?: string  // Optional override for tooltip lookup
  icon?: React.ReactNode  // Optional icon to display before label
  children?: React.ReactNode  // Optional children (like filter dropdowns)
}

/**
 * Table header component with tooltip on hover
 * Displays an info icon that shows the tooltip when hovered
 */
export function TableHeaderWithTooltip({ 
  label, 
  tooltipKey,
  icon,
  children 
}: TableHeaderWithTooltipProps) {
  const tooltip = tooltipKey 
    ? getTooltipForHeader(tooltipKey) || getTooltipForHeader(label)
    : getTooltipForHeader(label)

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 0.5,
      width: '100%',
      overflow: 'visible',
    }}>
      {children}
      {icon}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      {tooltip && (
        <Tooltip 
          title={tooltip}
          arrow
          placement="top"
          enterDelay={200}
          leaveDelay={0}
          slotProps={{
            tooltip: {
              sx: {
                bgcolor: '#1E293B',
                color: '#F8FAFC',
                fontSize: '0.75rem',
                fontWeight: 400,
                maxWidth: 300,
                padding: '8px 12px',
                borderRadius: 1,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 9999,
                '& .MuiTooltip-arrow': {
                  color: '#1E293B',
                },
              },
            },
            popper: {
              sx: {
                zIndex: 9999,
              },
            },
          }}
        >
          <InfoOutlinedIcon 
            sx={{ 
              fontSize: 14, 
              color: '#94A3B8',
              cursor: 'help',
              ml: 0.25,
              flexShrink: 0,
              visibility: 'visible !important',
              opacity: '1 !important',
              '&:hover': {
                color: '#64748B',
              },
            }} 
          />
        </Tooltip>
      )}
    </Box>
  )
}

export default TableHeaderWithTooltip
