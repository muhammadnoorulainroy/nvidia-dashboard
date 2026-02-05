import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  Snackbar,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  Skeleton,
  InputAdornment,
} from '@mui/material'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SaveIcon from '@mui/icons-material/Save'
import RestoreIcon from '@mui/icons-material/Restore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { getAHTConfigurations, updateAHTConfiguration, type AHTConfiguration } from '../../services/api'
import { DEFAULT_NEW_TASK_AHT, DEFAULT_REWORK_AHT } from '../../constants'

interface ProjectAHTState {
  newTaskAht: string
  reworkAht: string
  isDirty: boolean
  isValid: boolean
  errors: {
    newTaskAht?: string
    reworkAht?: string
  }
}

export default function AHTConfigTab() {
  const [configs, setConfigs] = useState<AHTConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectStates, setProjectStates] = useState<Record<number, ProjectAHTState>>({})
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    projectId: number | null
    projectName: string
    newTaskAht: number
    reworkAht: number
  }>({ open: false, projectId: null, projectName: '', newTaskAht: 0, reworkAht: 0 })
  
  // Success notification
  const [successSnackbar, setSuccessSnackbar] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: '' })
  
  // Saving state
  const [savingProject, setSavingProject] = useState<number | null>(null)

  useEffect(() => {
    fetchConfigurations()
  }, [])

  const fetchConfigurations = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAHTConfigurations()
      setConfigs(data)
      
      // Initialize project states
      const states: Record<number, ProjectAHTState> = {}
      data.forEach(config => {
        states[config.project_id] = {
          newTaskAht: config.new_task_aht.toString(),
          reworkAht: config.rework_aht.toString(),
          isDirty: false,
          isValid: true,
          errors: {}
        }
      })
      setProjectStates(states)
    } catch (err: any) {
      setError(err.message || 'Failed to load AHT configurations')
    } finally {
      setLoading(false)
    }
  }

  const validateValue = (value: string): { valid: boolean; error?: string } => {
    if (!value || value.trim() === '') {
      return { valid: false, error: 'Value is required' }
    }
    const num = parseFloat(value)
    if (isNaN(num)) {
      return { valid: false, error: 'Must be a valid number' }
    }
    if (num < 0.1) {
      return { valid: false, error: 'Minimum value is 0.1 hours' }
    }
    if (num > 100) {
      return { valid: false, error: 'Maximum value is 100 hours' }
    }
    return { valid: true }
  }

  const handleValueChange = (projectId: number, field: 'newTaskAht' | 'reworkAht', value: string) => {
    const config = configs.find(c => c.project_id === projectId)
    if (!config) return
    
    const currentState = projectStates[projectId] || {
      newTaskAht: config.new_task_aht.toString(),
      reworkAht: config.rework_aht.toString(),
      isDirty: false,
      isValid: true,
      errors: {}
    }
    
    const newState = { ...currentState, [field]: value }
    
    // Validate both fields
    const newTaskValidation = validateValue(newState.newTaskAht)
    const reworkValidation = validateValue(newState.reworkAht)
    
    newState.errors = {
      newTaskAht: newTaskValidation.error,
      reworkAht: reworkValidation.error
    }
    newState.isValid = newTaskValidation.valid && reworkValidation.valid
    
    // Check if dirty
    const originalNewTask = config.new_task_aht.toString()
    const originalRework = config.rework_aht.toString()
    newState.isDirty = newState.newTaskAht !== originalNewTask || newState.reworkAht !== originalRework
    
    setProjectStates(prev => ({ ...prev, [projectId]: newState }))
  }

  const handleReset = (projectId: number) => {
    const config = configs.find(c => c.project_id === projectId)
    if (!config) return
    
    setProjectStates(prev => ({
      ...prev,
      [projectId]: {
        newTaskAht: config.new_task_aht.toString(),
        reworkAht: config.rework_aht.toString(),
        isDirty: false,
        isValid: true,
        errors: {}
      }
    }))
  }

  const handleResetToDefault = (projectId: number) => {
    const config = configs.find(c => c.project_id === projectId)
    if (!config) return
    
    setProjectStates(prev => ({
      ...prev,
      [projectId]: {
        newTaskAht: DEFAULT_NEW_TASK_AHT.toString(),
        reworkAht: DEFAULT_REWORK_AHT.toString(),
        isDirty: config.new_task_aht !== DEFAULT_NEW_TASK_AHT || config.rework_aht !== DEFAULT_REWORK_AHT,
        isValid: true,
        errors: {}
      }
    }))
  }

  const handleSaveClick = (projectId: number) => {
    const config = configs.find(c => c.project_id === projectId)
    const state = projectStates[projectId]
    if (!config || !state || !state.isValid) return
    
    setConfirmDialog({
      open: true,
      projectId,
      projectName: config.project_name,
      newTaskAht: parseFloat(state.newTaskAht),
      reworkAht: parseFloat(state.reworkAht)
    })
  }

  const handleConfirmSave = async () => {
    if (!confirmDialog.projectId) return
    
    setSavingProject(confirmDialog.projectId)
    setConfirmDialog({ ...confirmDialog, open: false })
    
    try {
      const updated = await updateAHTConfiguration(confirmDialog.projectId, {
        new_task_aht: confirmDialog.newTaskAht,
        rework_aht: confirmDialog.reworkAht
      })
      
      // Update local state
      setConfigs(prev => prev.map(c => 
        c.project_id === confirmDialog.projectId ? updated : c
      ))
      
      setProjectStates(prev => ({
        ...prev,
        [confirmDialog.projectId!]: {
          newTaskAht: updated.new_task_aht.toString(),
          reworkAht: updated.rework_aht.toString(),
          isDirty: false,
          isValid: true,
          errors: {}
        }
      }))
      
      setSuccessSnackbar({
        open: true,
        message: `AHT configuration for ${confirmDialog.projectName} updated successfully!`
      })
    } catch (err: any) {
      setError(err.message || 'Failed to update AHT configuration')
    } finally {
      setSavingProject(null)
    }
  }

  const calculateMergedAHT = (newTasks: number, rework: number, newTaskAht: number, reworkAht: number): number | null => {
    const total = newTasks + rework
    if (total === 0) return null
    return (newTasks * newTaskAht + rework * reworkAht) / total
  }

  if (loading) {
    return (
      <Box>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
        ))}
      </Box>
    )
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Info Box */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <AccessTimeIcon sx={{ color: '#2E5CFF' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
            About Expected AHT
          </Typography>
          <Tooltip 
            title="AHT (Average Handling Time) values are used to calculate the expected time for task completion. These values are used in the Merged Exp. AHT formula."
            arrow
            placement="right"
          >
            <HelpOutlineIcon sx={{ fontSize: 18, color: '#94A3B8', cursor: 'help' }} />
          </Tooltip>
        </Box>

        <Alert severity="info" sx={{ bgcolor: '#EEF6FF', border: '1px solid #BFDBFE' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Formula: <code style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: 4 }}>
              Merged Exp. AHT = (New Tasks x New Task AHT + Rework x Rework AHT) / Total Submissions
            </code>
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: '#475569' }}>
            Adjust the AHT values below to reflect your project's expected time requirements. 
            Changes will affect all dashboard calculations immediately.
          </Typography>
        </Alert>
      </Paper>

      {/* Project Cards */}
      <Box sx={{ display: 'grid', gap: 3 }}>
        {configs.map(config => {
          const state = projectStates[config.project_id] || {
            newTaskAht: config.new_task_aht.toString(),
            reworkAht: config.rework_aht.toString(),
            isDirty: false,
            isValid: true,
            errors: {}
          }
          const isSaving = savingProject === config.project_id
          
          return (
            <Card 
              key={config.project_id}
              sx={{ 
                border: state.isDirty ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                borderRadius: 2,
                boxShadow: state.isDirty ? '0 0 0 3px rgba(245, 158, 11, 0.1)' : 'none',
                transition: 'all 0.2s ease',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              <CardContent sx={{ p: 3 }}>
                {/* Project Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
                        {config.project_name}
                      </Typography>
                      <Chip 
                        label={`ID: ${config.project_id}`} 
                        size="small"
                        sx={{ bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 500 }}
                      />
                      {state.isDirty && (
                        <Chip 
                          label="Unsaved Changes" 
                          size="small"
                          icon={<WarningIcon sx={{ fontSize: 14 }} />}
                          sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 500 }}
                        />
                      )}
                    </Box>
                    {config.updated_at && (
                      <Typography variant="caption" sx={{ color: '#94A3B8', mt: 0.5, display: 'block' }}>
                        Last updated: {new Date(config.updated_at).toLocaleString()}
                        {config.updated_by && ` by ${config.updated_by}`}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* AHT Input Fields */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr auto' }, gap: 3, alignItems: 'flex-start' }}>
                  {/* New Task AHT */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ color: '#475569', mb: 1, fontWeight: 600 }}>
                      New Task AHT
                      <Tooltip title="Expected hours to complete a fresh, new task" arrow>
                        <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#94A3B8', verticalAlign: 'text-top' }} />
                      </Tooltip>
                    </Typography>
                    <TextField
                      type="number"
                      value={state.newTaskAht}
                      onChange={(e) => handleValueChange(config.project_id, 'newTaskAht', e.target.value)}
                      error={!!state.errors.newTaskAht}
                      helperText={state.errors.newTaskAht || 'Hours for new tasks'}
                      size="small"
                      fullWidth
                      disabled={isSaving}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">hours</InputAdornment>,
                        inputProps: { min: 0.1, max: 100, step: 0.1 }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'white',
                        }
                      }}
                    />
                    <Typography variant="caption" sx={{ color: '#94A3B8', mt: 0.5, display: 'block' }}>
                      Default: {DEFAULT_NEW_TASK_AHT} hours
                    </Typography>
                  </Box>

                  {/* Rework AHT */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ color: '#475569', mb: 1, fontWeight: 600 }}>
                      Rework AHT
                      <Tooltip title="Expected hours to fix/revise an existing task" arrow>
                        <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#94A3B8', verticalAlign: 'text-top' }} />
                      </Tooltip>
                    </Typography>
                    <TextField
                      type="number"
                      value={state.reworkAht}
                      onChange={(e) => handleValueChange(config.project_id, 'reworkAht', e.target.value)}
                      error={!!state.errors.reworkAht}
                      helperText={state.errors.reworkAht || 'Hours for rework tasks'}
                      size="small"
                      fullWidth
                      disabled={isSaving}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">hours</InputAdornment>,
                        inputProps: { min: 0.1, max: 100, step: 0.1 }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'white',
                        }
                      }}
                    />
                    <Typography variant="caption" sx={{ color: '#94A3B8', mt: 0.5, display: 'block' }}>
                      Default: {DEFAULT_REWORK_AHT} hours
                    </Typography>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: { xs: 0, md: 3 } }}>
                    <Button
                      variant="contained"
                      startIcon={isSaving ? null : <SaveIcon />}
                      onClick={() => handleSaveClick(config.project_id)}
                      disabled={!state.isDirty || !state.isValid || isSaving}
                      sx={{
                        bgcolor: '#2E5CFF',
                        '&:hover': { bgcolor: '#1E40AF' },
                        '&:disabled': { bgcolor: '#CBD5E1' },
                        minWidth: 120,
                      }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title="Undo changes">
                        <span>
                          <IconButton 
                            size="small" 
                            onClick={() => handleReset(config.project_id)}
                            disabled={!state.isDirty || isSaving}
                            sx={{ border: '1px solid #E2E8F0' }}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Reset to default values (10h / 4h)">
                        <span>
                          <IconButton 
                            size="small" 
                            onClick={() => handleResetToDefault(config.project_id)}
                            disabled={isSaving}
                            sx={{ border: '1px solid #E2E8F0' }}
                          >
                            <SettingsBackupRestoreIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>

                {/* Example Calculation */}
                <Box sx={{ mt: 3, p: 2, bgcolor: '#F8FAFC', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
                  <Typography variant="subtitle2" sx={{ color: '#475569', mb: 1 }}>
                    Example Calculation
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', fontFamily: 'monospace' }}>
                    If trainer has 10 new tasks + 90 rework tasks = 100 total submissions:
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#1E293B', fontFamily: 'monospace', mt: 0.5, fontWeight: 600 }}>
                    Merged Exp. AHT = (10 x {state.newTaskAht || 0} + 90 x {state.reworkAht || 0}) / 100 
                    = {calculateMergedAHT(10, 90, parseFloat(state.newTaskAht) || 0, parseFloat(state.reworkAht) || 0)?.toFixed(2) || 'N/A'} hours
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )
        })}
      </Box>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckCircleIcon sx={{ color: '#2E5CFF' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Confirm AHT Update
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#475569' }}>
            You are about to update the AHT configuration for <strong>{confirmDialog.projectName}</strong>.
          </DialogContentText>
          
          <Box sx={{ mt: 3, p: 2, bgcolor: '#F8FAFC', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  New Task AHT
                </Typography>
                <Typography variant="h6" sx={{ color: '#1E293B', fontWeight: 600 }}>
                  {confirmDialog.newTaskAht} hours
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Rework AHT
                </Typography>
                <Typography variant="h6" sx={{ color: '#1E293B', fontWeight: 600 }}>
                  {confirmDialog.reworkAht} hours
                </Typography>
              </Box>
            </Box>
          </Box>

          <Alert severity="warning" sx={{ mt: 2, bgcolor: '#FFFBEB', border: '1px solid #FEF3C7' }}>
            <Typography variant="body2">
              This change will affect all Merged Exp. AHT calculations across the dashboard immediately.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
            sx={{ color: '#64748B' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmSave}
            variant="contained"
            startIcon={<SaveIcon />}
            sx={{ bgcolor: '#2E5CFF', '&:hover': { bgcolor: '#1E40AF' } }}
          >
            Confirm & Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={successSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setSuccessSnackbar({ ...successSnackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSuccessSnackbar({ ...successSnackbar, open: false })} 
          severity="success"
          sx={{ width: '100%', boxShadow: 3 }}
          icon={<CheckCircleIcon />}
        >
          {successSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
