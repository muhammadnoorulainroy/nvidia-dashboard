import { useState, useEffect } from 'react'
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Box,
  Tooltip,
} from '@mui/material'
import {
  Sync as SyncIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import { triggerS3Sync, type SyncResult } from '../../services/api'

export default function S3SyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error' | 'info'>('success')

  const handleSync = async () => {
    if (syncing) return

    setSyncing(true)
    setSnackbarOpen(false)

    try {
      const result: SyncResult = await triggerS3Sync()
      
      if (result.overall_status === 'completed') {
        const filesProcessed = result.s3_ingestion?.files_processed || 0
        const workItemsIngested = result.s3_ingestion?.work_items_ingested || 0
        
        setSnackbarMessage(
          `Sync completed! Processed ${filesProcessed} files, ingested ${workItemsIngested} work items.`
        )
        setSnackbarSeverity('success')
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('s3Synced'))
      } else if (result.overall_status === 'partial_failure') {
        setSnackbarMessage('Sync partially completed with some errors.')
        setSnackbarSeverity('info')
      } else {
        const errorMsg = result.s3_ingestion?.error || 'Sync failed'
        setSnackbarMessage(`Sync failed: ${errorMsg}`)
        setSnackbarSeverity('error')
      }
    } catch (error: any) {
      console.error('Sync error:', error)
      setSnackbarMessage(`Sync error: ${error.response?.data?.detail || error.message}`)
      setSnackbarSeverity('error')
    } finally {
      setSyncing(false)
      setSnackbarOpen(true)
    }
  }

  const getButtonTooltip = () => {
    if (syncing) return 'Syncing...'
    return 'Sync data from S3'
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Tooltip title={getButtonTooltip()} arrow>
        <span>
          <Button
            variant="contained"
            size="small"
            startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={handleSync}
            disabled={syncing}
            sx={{
              backgroundColor: '#10B981',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                backgroundColor: '#059669',
              },
              '&:disabled': {
                backgroundColor: '#D1D5DB',
              },
            }}
          >
            {syncing ? 'Syncing S3...' : 'Sync S3'}
          </Button>
        </span>
      </Tooltip>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          icon={snackbarSeverity === 'success' ? <SuccessIcon /> : <ErrorIcon />}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}

