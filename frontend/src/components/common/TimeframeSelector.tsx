/**
 * Reusable Timeframe Selector Component
 * Provides consistent date filtering across all tabs
 */

import React from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Typography,
  Tooltip,
  Chip,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import { 
  Timeframe, 
  getDateRange, 
  canGoToNextWeek,
  canGoToNextMonth,
  getMaxDate,
  isValidDateRange 
} from '../../utils/dateUtils'

interface TimeframeSelectorProps {
  timeframe: Timeframe
  onTimeframeChange: (timeframe: Timeframe) => void
  weekOffset: number
  onWeekOffsetChange: (offset: number) => void
  customStartDate: string
  onCustomStartDateChange: (date: string) => void
  customEndDate: string
  onCustomEndDateChange: (date: string) => void
  compact?: boolean
}

export default function TimeframeSelector({
  timeframe,
  onTimeframeChange,
  weekOffset,
  onWeekOffsetChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  compact = false,
}: TimeframeSelectorProps) {
  const dateRange = getDateRange(timeframe, weekOffset, customStartDate, customEndDate)

  // Navigation for weekly and monthly
  const hasNavigation = timeframe === 'weekly' || timeframe === 'monthly'
  const canGoNext =
    (timeframe === 'weekly' && canGoToNextWeek(weekOffset)) ||
    (timeframe === 'monthly' && canGoToNextMonth(weekOffset))
  const canGoPrev = hasNavigation // Can always go to previous

  const handlePrev = () => {
    if (hasNavigation) {
      onWeekOffsetChange(weekOffset - 1) // reused for month offset too
    }
  }
  
  const handleNext = () => {
    if (hasNavigation && canGoNext) {
      onWeekOffsetChange(weekOffset + 1)
    }
  }
  
  const handleTimeframeChange = (newTimeframe: Timeframe) => {
    onTimeframeChange(newTimeframe)
    // Reset offset when changing timeframe
    onWeekOffsetChange(0)
  }

  const isCustomRangeValid = timeframe !== 'custom' || isValidDateRange(customStartDate, customEndDate)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      {/* Timeframe Dropdown */}
      <FormControl size="small" sx={{ minWidth: compact ? 100 : 130 }}>
        <InputLabel sx={{ fontSize: '0.8125rem' }}>Timeframe</InputLabel>
        <Select
          value={timeframe}
          label="Timeframe"
          onChange={(e) => handleTimeframeChange(e.target.value as Timeframe)}
          sx={{ fontSize: '0.8125rem' }}
        >
          <MenuItem value="daily">Today</MenuItem>
          <MenuItem value="d-1">Yesterday</MenuItem>
          <MenuItem value="d-2">2 Days Ago</MenuItem>
          <MenuItem value="d-3">3 Days Ago</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
          <MenuItem value="custom">Custom Range</MenuItem>
          <MenuItem value="overall">All Time</MenuItem>
        </Select>
      </FormControl>

      {/* Period Navigation (weekly / monthly) */}
      {hasNavigation && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={timeframe === 'monthly' ? 'Previous Month' : 'Previous Week'}>
            <IconButton 
              size="small" 
              onClick={handlePrev}
              disabled={!canGoPrev}
              sx={{ 
                bgcolor: 'action.hover',
                '&:hover': { bgcolor: 'action.selected' }
              }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={timeframe === 'monthly' ? 'Next Month' : 'Next Week'}>
            <span>
              <IconButton 
                size="small" 
                onClick={handleNext}
                disabled={!canGoNext}
                sx={{ 
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      {/* Custom Date Range Inputs */}
      {timeframe === 'custom' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            type="date"
            label="Start"
            size="small"
            value={customStartDate}
            onChange={(e) => onCustomStartDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: getMaxDate() }}
            error={Boolean(customStartDate && customEndDate && !isCustomRangeValid)}
            sx={{ width: 150, '& input': { fontSize: '0.8125rem' } }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>to</Typography>
          <TextField
            type="date"
            label="End"
            size="small"
            value={customEndDate}
            onChange={(e) => onCustomEndDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ 
              min: customStartDate || undefined,
              max: getMaxDate() 
            }}
            error={Boolean(customStartDate && customEndDate && !isCustomRangeValid)}
            sx={{ width: 150, '& input': { fontSize: '0.8125rem' } }}
          />
        </Box>
      )}

      {/* Date Range Display Chip */}
      <Tooltip title="Current date range being displayed">
        <Chip
          icon={<CalendarTodayIcon sx={{ fontSize: '0.875rem !important' }} />}
          label={dateRange.displayLabel}
          size="small"
          variant="outlined"
          color={isCustomRangeValid ? 'primary' : 'error'}
          sx={{ 
            fontSize: '0.75rem',
            height: 28,
            '& .MuiChip-icon': { ml: 0.5 },
            borderStyle: 'dashed',
            bgcolor: 'background.paper'
          }}
        />
      </Tooltip>
    </Box>
  )
}
