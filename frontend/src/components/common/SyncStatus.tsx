/**
 * Sync Status Component
 * Shows last sync time, relative time, and next sync info in a tooltip
 * Times are displayed in the user's local timezone in 12-hour format
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Tooltip,
  CircularProgress,
} from '@mui/material'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { getSyncInfo, SyncInfo } from '../../services/api'

// Parse UTC timestamp and convert to user's local timezone
const parseUtcTimestamp = (isoString: string | null): Date | null => {
  if (!isoString) return null
  
  // If the string doesn't have timezone info, treat it as UTC
  // Backend stores times in UTC, so we need to ensure proper conversion
  let dateStr = isoString
  if (!isoString.includes('+') && !isoString.includes('Z') && !isoString.includes('-', 10)) {
    // No timezone info - append 'Z' to indicate UTC
    dateStr = isoString + 'Z'
  }
  
  return new Date(dateStr)
}

// Format time in 12-hour format with user's timezone
const formatTime12Hour = (isoString: string | null): string => {
  const date = parseUtcTimestamp(isoString)
  if (!date) return '--:--:--'
  
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

// Calculate relative time string (e.g., "5 minutes ago")
const getRelativeTime = (isoString: string | null): string => {
  const syncTime = parseUtcTimestamp(isoString)
  if (!syncTime) return 'Never synced'
  
  const now = new Date()
  const diffMs = now.getTime() - syncTime.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  
  if (diffSeconds < 60) {
    return 'Just now'
  } else if (diffMinutes === 1) {
    return '1 minute ago'
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`
  } else if (diffHours === 1) {
    return '1 hour ago'
  } else {
    return `${diffHours} hours ago`
  }
}

// Format seconds until next sync
const formatSecondsUntilSync = (seconds: number | null): string => {
  if (seconds === null || seconds <= 0) return 'Soon'
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes === 0) {
    return `${remainingSeconds}s`
  } else if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  } else {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
}

// Format interval in human-readable form
const formatInterval = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  } else {
    const hours = minutes / 60
    return `${hours} hour${hours !== 1 ? 's' : ''}`
  }
}

export default function SyncStatus() {
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secondsUntilSync, setSecondsUntilSync] = useState<number | null>(null)
  
  const fetchSyncInfo = useCallback(async () => {
    try {
      const info = await getSyncInfo()
      setSyncInfo(info)
      setSecondsUntilSync(info.seconds_until_next_sync)
      setError(null)
    } catch (err) {
      console.error('Error fetching sync info:', err)
      setError('Unable to fetch sync status')
    } finally {
      setLoading(false)
    }
  }, [])
  
  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchSyncInfo()
    
    // Refresh sync info every 60 seconds
    const refreshInterval = setInterval(fetchSyncInfo, 60000)
    
    return () => clearInterval(refreshInterval)
  }, [fetchSyncInfo])
  
  // Countdown timer for next sync
  useEffect(() => {
    if (secondsUntilSync === null || secondsUntilSync <= 0) return
    
    const countdownInterval = setInterval(() => {
      setSecondsUntilSync(prev => {
        if (prev === null || prev <= 1) {
          // Refresh sync info when countdown reaches 0
          fetchSyncInfo()
          return null
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(countdownInterval)
  }, [secondsUntilSync, fetchSyncInfo])
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading sync status...
        </Typography>
      </Box>
    )
  }
  
  if (error || !syncInfo) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccessTimeIcon sx={{ fontSize: 16, color: 'warning.main' }} />
        <Typography variant="caption" color="text.secondary">
          {error || 'Sync status unavailable'}
        </Typography>
      </Box>
    )
  }
  
  const lastSyncTime = formatTime12Hour(syncInfo.last_sync_time)
  const relativeTime = getRelativeTime(syncInfo.last_sync_time)
  const nextSyncIn = formatSecondsUntilSync(secondsUntilSync)
  const intervalText = formatInterval(syncInfo.sync_interval_minutes)
  
  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        Next auto-sync in {nextSyncIn}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Auto-sync runs every {intervalText}
      </Typography>
    </Box>
  )
  
  return (
    <Tooltip title={tooltipContent} arrow placement="bottom-start">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
      >
        <AccessTimeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              fontSize: '0.8125rem',
              color: 'text.primary',
            }}
          >
            {lastSyncTime}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6875rem',
              color: 'text.secondary',
            }}
          >
            Synced {relativeTime}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  )
}
