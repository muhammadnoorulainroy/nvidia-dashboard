import { useState } from 'react'
import {
  Box,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Description as FileIcon,
} from '@mui/icons-material'
import axios from 'axios'
import { clearCache } from '../../services/api'

interface UploadResult {
  success: boolean
  total_rows?: number
  updated_count?: number
  not_found_count?: number
  error_count?: number
  message: string
  error?: string
}

export default function FeedbackUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  
  // Define all columns used in work_item table
  const expectedColumns = [
    { name: 'Work Item Id', description: 'Unique work item identifier', required: true },
    { name: 'Task Id', description: 'Task identifier', required: true },
    { name: 'Verdict', description: 'Client feedback status (updates client_status)', required: true },
    { name: 'Task Level Feedback', description: 'Task-level feedback text', required: true },
    { name: 'Error Categories', description: 'Error category information', required: true },
  ]

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      const validTypes = ['.csv', '.xlsx', '.xls']
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      
      if (!validTypes.includes(fileExtension)) {
        setUploadResult({
          success: false,
          message: 'Invalid file format. Please upload CSV or Excel file.',
        })
        return
      }
      
      setSelectedFile(file)
      setUploadResult(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || ''}/api/client-delivery/upload-feedback`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      setUploadResult(response.data)
      
      // Clear file selection on success
      if (response.data.success) {
        setSelectedFile(null)
        // Reset file input
        const fileInput = document.getElementById('feedback-file-input') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        
        // Clear API cache and trigger refresh
        clearCache()
        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('feedbackUploaded'))
      }
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: error.response?.data?.detail || error.message || 'Upload failed',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleClearFile = () => {
    setSelectedFile(null)
    setUploadResult(null)
    const fileInput = document.getElementById('feedback-file-input') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  return (
    <Paper
      sx={{
        p: 3,
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: '#1F2937',
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <UploadIcon sx={{ color: '#2E5CFF' }} />
          Upload Client Feedback
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          Upload CSV or Excel file with client feedback to update task status
        </Typography>
      </Box>

      {/* File Selection */}
      <Box sx={{ mb: 3 }}>
        <input
          id="feedback-file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <label htmlFor="feedback-file-input">
          <Button
            variant="outlined"
            component="span"
            startIcon={<FileIcon />}
            disabled={uploading}
            sx={{
              borderColor: '#2E5CFF',
              color: '#2E5CFF',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#2347D5',
                backgroundColor: '#EEF2FF',
              },
            }}
          >
            Select File
          </Button>
        </label>

        {selectedFile && (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              icon={<FileIcon />}
              label={selectedFile.name}
              onDelete={handleClearFile}
              sx={{
                backgroundColor: '#EEF2FF',
                color: '#2E5CFF',
                fontWeight: 600,
                '& .MuiChip-deleteIcon': {
                  color: '#2E5CFF',
                },
              }}
            />
            <Typography variant="caption" sx={{ color: '#6B7280' }}>
              {(selectedFile.size / 1024).toFixed(2)} KB
            </Typography>
          </Box>
        )}
      </Box>

      {/* Upload Button */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
          sx={{
            backgroundColor: '#2E5CFF',
            textTransform: 'none',
            fontWeight: 600,
            px: 3,
            '&:hover': {
              backgroundColor: '#2347D5',
            },
            '&:disabled': {
              backgroundColor: '#D1D5DB',
            },
          }}
        >
          {uploading ? 'Uploading...' : 'Upload Feedback'}
        </Button>
      </Box>

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            sx={{
              backgroundColor: '#E5E7EB',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#2E5CFF',
              },
            }}
          />
          <Typography variant="caption" sx={{ color: '#6B7280', mt: 1, display: 'block' }}>
            Processing file...
          </Typography>
        </Box>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <Alert
          severity={uploadResult.success ? 'success' : 'error'}
          icon={uploadResult.success ? <SuccessIcon /> : <ErrorIcon />}
          sx={{ mb: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {uploadResult.message}
          </Typography>
          {uploadResult.success && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="caption">
                Total Rows: {uploadResult.total_rows}
              </Typography>
              <Typography variant="caption" sx={{ color: '#10B981' }}>
                ✓ Updated: {uploadResult.updated_count}
              </Typography>
              {uploadResult.not_found_count! > 0 && (
                <Typography variant="caption" sx={{ color: '#F59E0B' }}>
                  ⚠ Not Found: {uploadResult.not_found_count}
                </Typography>
              )}
              {uploadResult.error_count! > 0 && (
                <Typography variant="caption" sx={{ color: '#EF4444' }}>
                  ✗ Errors: {uploadResult.error_count}
                </Typography>
              )}
            </Box>
          )}
        </Alert>
      )}

      {/* Column Requirements */}
      <Paper
        sx={{
          p: 2,
          backgroundColor: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1F2937', mb: 1.5 }}>
          Required Columns:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {expectedColumns.map((col, index) => (
            <Box 
              key={index}
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
              }}
            >
              <Typography 
                variant="caption" 
                sx={{ 
                  fontWeight: 600, 
                  color: '#1F2937',
                }}
              >
                {col.name}
                {col.required && (
                  <Chip 
                    label="Required" 
                    size="small" 
                    sx={{ 
                      ml: 1, 
                      height: 16, 
                      fontSize: '0.625rem',
                      backgroundColor: '#FEE2E2',
                      color: '#991B1B',
                    }} 
                  />
                )}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mt: 1.5, fontStyle: 'italic' }}>
          Other columns will be ignored during upload.
        </Typography>
      </Paper>
    </Paper>
  )
}

