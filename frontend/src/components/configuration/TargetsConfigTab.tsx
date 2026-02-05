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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
} from '@mui/material'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SaveIcon from '@mui/icons-material/Save'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import PersonIcon from '@mui/icons-material/Person'
import GroupsIcon from '@mui/icons-material/Groups'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import {
  getThroughputTargets,
  setThroughputTarget,
  type ThroughputTarget,
  type ThroughputTargetsResponse
} from '../../services/api'

// Project options - imported from centralized constants
import { PROJECT_OPTIONS } from '../../constants'
const projectOptions = PROJECT_OPTIONS

interface ProjectTargetState {
  // Trainer targets
  trainerNewTaskTarget: string    // New tasks per day
  trainerReworkTarget: string     // Rework tasks per day
  // Reviewer targets  
  reviewerNewTaskTarget: string   // New reviews per day
  reviewerReworkTarget: string    // Rework reviews per day
  isDirty: boolean
  isValid: boolean
  errors: {
    trainerNewTaskTarget?: string
    trainerReworkTarget?: string
    reviewerNewTaskTarget?: string
    reviewerReworkTarget?: string
  }
}

interface OriginalValues {
  trainerNewTask: number | null
  trainerRework: number | null
  reviewerNewTask: number | null
  reviewerRework: number | null
}

export default function TargetsConfigTab() {
  const [selectedProject, setSelectedProject] = useState<number>(36)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targets, setTargets] = useState<ThroughputTarget[]>([])
  const [projectState, setProjectState] = useState<ProjectTargetState>({
    trainerNewTaskTarget: '3',    // 3 new tasks/day default
    trainerReworkTarget: '5',     // 5 rework tasks/day default
    reviewerNewTaskTarget: '10',  // 10 new reviews/day default
    reviewerReworkTarget: '15',   // 15 rework reviews/day default
    isDirty: false,
    isValid: true,
    errors: {}
  })
  const [originalValues, setOriginalValues] = useState<OriginalValues>({
    trainerNewTask: null,
    trainerRework: null,
    reviewerNewTask: null,
    reviewerRework: null
  })
  
  // Saving state
  const [saving, setSaving] = useState(false)
  
  // Success notification
  const [successSnackbar, setSuccessSnackbar] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: '' })

  // Sub-tab for trainer vs reviewer targets
  const [entityTab, setEntityTab] = useState(0)

  useEffect(() => {
    fetchTargets()
  }, [selectedProject])

  const fetchTargets = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await getThroughputTargets(selectedProject)
      setTargets(data.targets)
      
      // Find separate targets for new tasks and rework
      const trainerNewTask = data.targets.find(
        t => t.config_key === 'new_tasks_target' && (t.entity_type === 'trainer' || t.entity_type === null)
      )
      const trainerRework = data.targets.find(
        t => t.config_key === 'rework_target' && (t.entity_type === 'trainer' || t.entity_type === null)
      )
      const reviewerNewTask = data.targets.find(
        t => t.config_key === 'new_tasks_target' && t.entity_type === 'reviewer'
      )
      const reviewerRework = data.targets.find(
        t => t.config_key === 'rework_target' && t.entity_type === 'reviewer'
      )
      
      // Fall back to legacy single target if exists
      const legacyTrainer = data.targets.find(
        t => t.config_key === 'daily_tasks_default' && (t.entity_type === 'trainer' || t.entity_type === null)
      )
      const legacyReviewer = data.targets.find(
        t => t.config_key === 'daily_tasks_default' && t.entity_type === 'reviewer'
      )
      
      const trainerNewTaskValue = trainerNewTask?.target?.toString() || '3'
      const trainerReworkValue = trainerRework?.target?.toString() || '5'
      const reviewerNewTaskValue = reviewerNewTask?.target?.toString() || '10'
      const reviewerReworkValue = reviewerRework?.target?.toString() || '15'
      
      setProjectState({
        trainerNewTaskTarget: trainerNewTaskValue,
        trainerReworkTarget: trainerReworkValue,
        reviewerNewTaskTarget: reviewerNewTaskValue,
        reviewerReworkTarget: reviewerReworkValue,
        isDirty: false,
        isValid: true,
        errors: {}
      })
      
      setOriginalValues({
        trainerNewTask: trainerNewTask?.target || null,
        trainerRework: trainerRework?.target || null,
        reviewerNewTask: reviewerNewTask?.target || null,
        reviewerRework: reviewerRework?.target || null
      })
      
    } catch (err: any) {
      setError(err.message || 'Failed to load targets')
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
      return { valid: false, error: 'Minimum value is 0.1' }
    }
    if (num > 100) {
      return { valid: false, error: 'Maximum value is 100' }
    }
    return { valid: true }
  }

  const handleValueChange = (
    field: 'trainerNewTaskTarget' | 'trainerReworkTarget' | 'reviewerNewTaskTarget' | 'reviewerReworkTarget', 
    value: string
  ) => {
    const newState = { ...projectState, [field]: value }
    
    // Validate all fields
    const trainerNewValidation = validateValue(newState.trainerNewTaskTarget)
    const trainerReworkValidation = validateValue(newState.trainerReworkTarget)
    const reviewerNewValidation = validateValue(newState.reviewerNewTaskTarget)
    const reviewerReworkValidation = validateValue(newState.reviewerReworkTarget)
    
    newState.errors = {
      trainerNewTaskTarget: trainerNewValidation.error,
      trainerReworkTarget: trainerReworkValidation.error,
      reviewerNewTaskTarget: reviewerNewValidation.error,
      reviewerReworkTarget: reviewerReworkValidation.error
    }
    newState.isValid = trainerNewValidation.valid && trainerReworkValidation.valid && 
                       reviewerNewValidation.valid && reviewerReworkValidation.valid
    
    // Check if dirty - compare with original values
    const origTrainerNew = originalValues.trainerNewTask?.toString() || '3'
    const origTrainerRework = originalValues.trainerRework?.toString() || '5'
    const origReviewerNew = originalValues.reviewerNewTask?.toString() || '10'
    const origReviewerRework = originalValues.reviewerRework?.toString() || '15'
    newState.isDirty = 
      newState.trainerNewTaskTarget !== origTrainerNew || 
      newState.trainerReworkTarget !== origTrainerRework ||
      newState.reviewerNewTaskTarget !== origReviewerNew ||
      newState.reviewerReworkTarget !== origReviewerRework
    
    setProjectState(newState)
  }

  const handleSave = async () => {
    if (!projectState.isValid || !projectState.isDirty) return
    
    setSaving(true)
    try {
      const origTrainerNew = originalValues.trainerNewTask?.toString() || '3'
      const origTrainerRework = originalValues.trainerRework?.toString() || '5'
      const origReviewerNew = originalValues.reviewerNewTask?.toString() || '10'
      const origReviewerRework = originalValues.reviewerRework?.toString() || '15'
      
      // Save trainer new task target
      if (projectState.trainerNewTaskTarget !== origTrainerNew) {
        await setThroughputTarget(selectedProject, {
          target: parseFloat(projectState.trainerNewTaskTarget),
          entity_type: 'trainer',
          config_key: 'new_tasks_target'
        })
      }
      
      // Save trainer rework target
      if (projectState.trainerReworkTarget !== origTrainerRework) {
        await setThroughputTarget(selectedProject, {
          target: parseFloat(projectState.trainerReworkTarget),
          entity_type: 'trainer',
          config_key: 'rework_target'
        })
      }
      
      // Save reviewer new task target
      if (projectState.reviewerNewTaskTarget !== origReviewerNew) {
        await setThroughputTarget(selectedProject, {
          target: parseFloat(projectState.reviewerNewTaskTarget),
          entity_type: 'reviewer',
          config_key: 'new_tasks_target'
        })
      }
      
      // Save reviewer rework target
      if (projectState.reviewerReworkTarget !== origReviewerRework) {
        await setThroughputTarget(selectedProject, {
          target: parseFloat(projectState.reviewerReworkTarget),
          entity_type: 'reviewer',
          config_key: 'rework_target'
        })
      }
      
      setSuccessSnackbar({
        open: true,
        message: 'Task targets saved successfully!'
      })
      
      // Refresh data
      await fetchTargets()
      
    } catch (err: any) {
      setError(err.message || 'Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  const getProjectName = (projectId: number) => {
    return projectOptions.find(p => p.id === projectId)?.name || `Project ${projectId}`
  }

  // Filter targets by entity type
  const trainerTargets = targets.filter(t => t.entity_type === 'trainer' && t.entity_id)
  const reviewerTargets = targets.filter(t => t.entity_type === 'reviewer' && t.entity_id)

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
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
          <TrackChangesIcon sx={{ color: '#10B981' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
            Task-Based Throughput Targets
          </Typography>
          <Tooltip 
            title="Set daily task targets for trainers and reviewers. Achievement and Efficiency are calculated using Jibble hours and AHT."
            arrow
            placement="right"
          >
            <HelpOutlineIcon sx={{ fontSize: 18, color: '#94A3B8', cursor: 'help' }} />
          </Tooltip>
        </Box>

        <Alert severity="info" sx={{ bgcolor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            Separate targets for New Tasks and Rework (different effort levels):
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            <strong>New Task Achievement</strong> = (Actual New Tasks / New Task Target) × 100
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
            <strong>Rework Achievement</strong> = (Actual Rework / Rework Target) × 100
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
            <strong>Overall Achievement</strong> = Combined average
          </Typography>
          <Typography variant="body2" sx={{ mt: 1.5, color: '#64748B', fontSize: '0.8rem' }}>
            • New tasks typically take longer (AHT ~10 hrs) → lower target
            <br />• Rework tasks are faster (AHT ~4 hrs) → higher target
          </Typography>
        </Alert>
      </Paper>

      {/* Project Selector */}
      <Box sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 250 }}>
          <InputLabel>Select Project</InputLabel>
          <Select
            value={selectedProject}
            label="Select Project"
            onChange={(e) => setSelectedProject(Number(e.target.value))}
            sx={{ backgroundColor: 'white' }}
          >
            {projectOptions.map((proj) => (
              <MenuItem key={proj.id} value={proj.id}>
                {proj.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Default Targets Card */}
      <Card sx={{ 
        border: projectState.isDirty ? '2px solid #10B981' : '1px solid #E2E8F0',
        borderRadius: 2,
        boxShadow: projectState.isDirty ? '0 0 0 3px rgba(16, 185, 129, 0.1)' : 'none',
        mb: 3
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B' }}>
                  {getProjectName(selectedProject)}
                </Typography>
                <Chip 
                  label={`ID: ${selectedProject}`} 
                  size="small"
                  sx={{ bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 500 }}
                />
                {projectState.isDirty && (
                  <Chip 
                    label="Unsaved Changes" 
                    size="small"
                    icon={<WarningIcon sx={{ fontSize: 14 }} />}
                    sx={{ bgcolor: '#D1FAE5', color: '#065F46', fontWeight: 500 }}
                  />
                )}
              </Box>
              <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                Project-level default targets (can be overridden per individual)
              </Typography>
            </Box>
          </Box>

          {/* Trainer Targets Section */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" sx={{ color: '#1E293B', mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon sx={{ color: '#10B981' }} />
              Trainer Daily Targets
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              {/* New Task Target */}
              <Box sx={{ p: 2, bgcolor: '#F0FDF4', borderRadius: 2, border: '1px solid #BBF7D0' }}>
                <Typography variant="subtitle2" sx={{ color: '#166534', mb: 1, fontWeight: 600 }}>
                  New Tasks Target
                  <Tooltip title="Target for new task completions per day (AHT ~10 hrs)" arrow>
                    <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#22C55E', verticalAlign: 'text-top' }} />
                  </Tooltip>
                </Typography>
                <TextField
                  type="number"
                  value={projectState.trainerNewTaskTarget}
                  onChange={(e) => handleValueChange('trainerNewTaskTarget', e.target.value)}
                  error={!!projectState.errors.trainerNewTaskTarget}
                  helperText={projectState.errors.trainerNewTaskTarget || 'New tasks per day'}
                  size="small"
                  fullWidth
                  disabled={saving}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">new/day</InputAdornment>,
                    inputProps: { min: 0.1, max: 100, step: 0.5 }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white' } }}
                />
              </Box>

              {/* Rework Target */}
              <Box sx={{ p: 2, bgcolor: '#FEF3C7', borderRadius: 2, border: '1px solid #FDE68A' }}>
                <Typography variant="subtitle2" sx={{ color: '#92400E', mb: 1, fontWeight: 600 }}>
                  Rework Target
                  <Tooltip title="Target for rework task completions per day (AHT ~4 hrs)" arrow>
                    <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#F59E0B', verticalAlign: 'text-top' }} />
                  </Tooltip>
                </Typography>
                <TextField
                  type="number"
                  value={projectState.trainerReworkTarget}
                  onChange={(e) => handleValueChange('trainerReworkTarget', e.target.value)}
                  error={!!projectState.errors.trainerReworkTarget}
                  helperText={projectState.errors.trainerReworkTarget || 'Rework tasks per day'}
                  size="small"
                  fullWidth
                  disabled={saving}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">rework/day</InputAdornment>,
                    inputProps: { min: 0.1, max: 100, step: 0.5 }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white' } }}
                />
              </Box>
            </Box>
          </Box>

          {/* Reviewer Targets Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ color: '#1E293B', mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <GroupsIcon sx={{ color: '#3B82F6' }} />
              Reviewer Daily Targets
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
              {/* New Reviews Target */}
              <Box sx={{ p: 2, bgcolor: '#EFF6FF', borderRadius: 2, border: '1px solid #BFDBFE' }}>
                <Typography variant="subtitle2" sx={{ color: '#1E40AF', mb: 1, fontWeight: 600 }}>
                  New Reviews Target
                  <Tooltip title="Target for new task reviews per day" arrow>
                    <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#3B82F6', verticalAlign: 'text-top' }} />
                  </Tooltip>
                </Typography>
                <TextField
                  type="number"
                  value={projectState.reviewerNewTaskTarget}
                  onChange={(e) => handleValueChange('reviewerNewTaskTarget', e.target.value)}
                  error={!!projectState.errors.reviewerNewTaskTarget}
                  helperText={projectState.errors.reviewerNewTaskTarget || 'New reviews per day'}
                  size="small"
                  fullWidth
                  disabled={saving}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">reviews/day</InputAdornment>,
                    inputProps: { min: 0.1, max: 100, step: 0.5 }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white' } }}
                />
              </Box>

              {/* Rework Reviews Target */}
              <Box sx={{ p: 2, bgcolor: '#FDF4FF', borderRadius: 2, border: '1px solid #F5D0FE' }}>
                <Typography variant="subtitle2" sx={{ color: '#86198F', mb: 1, fontWeight: 600 }}>
                  Rework Reviews Target
                  <Tooltip title="Target for rework task reviews per day" arrow>
                    <InfoOutlinedIcon sx={{ fontSize: 14, ml: 0.5, color: '#A855F7', verticalAlign: 'text-top' }} />
                  </Tooltip>
                </Typography>
                <TextField
                  type="number"
                  value={projectState.reviewerReworkTarget}
                  onChange={(e) => handleValueChange('reviewerReworkTarget', e.target.value)}
                  error={!!projectState.errors.reviewerReworkTarget}
                  helperText={projectState.errors.reviewerReworkTarget || 'Rework reviews per day'}
                  size="small"
                  fullWidth
                  disabled={saving}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">reviews/day</InputAdornment>,
                    inputProps: { min: 0.1, max: 100, step: 0.5 }
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white' } }}
                />
              </Box>
            </Box>
          </Box>

          {/* Save Button */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={saving ? null : <SaveIcon />}
              onClick={handleSave}
              disabled={!projectState.isDirty || !projectState.isValid || saving}
              sx={{
                bgcolor: '#10B981',
                '&:hover': { bgcolor: '#059669' },
                '&:disabled': { bgcolor: '#CBD5E1' },
                minWidth: 120,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Box>

          {/* Example Calculation */}
          <Box sx={{ mt: 3, p: 2, bgcolor: '#F8FAFC', borderRadius: 1.5, border: '1px solid #E2E8F0' }}>
            <Typography variant="subtitle2" sx={{ color: '#475569', mb: 1 }}>
              Example: Trainer Achievement Calculation
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 600 }}>NEW TASK ACHIEVEMENT</Typography>
                <Typography variant="body2" sx={{ color: '#64748B', fontFamily: 'monospace', mt: 0.5 }}>
                  Actual: 2 new tasks, Target: {projectState.trainerNewTaskTarget}
                </Typography>
                <Typography variant="body2" sx={{ color: '#1E293B', fontFamily: 'monospace', fontWeight: 600 }}>
                  = 2 / {projectState.trainerNewTaskTarget} = {((2 / parseFloat(projectState.trainerNewTaskTarget || '3')) * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 600 }}>REWORK ACHIEVEMENT</Typography>
                <Typography variant="body2" sx={{ color: '#64748B', fontFamily: 'monospace', mt: 0.5 }}>
                  Actual: 4 rework, Target: {projectState.trainerReworkTarget}
                </Typography>
                <Typography variant="body2" sx={{ color: '#1E293B', fontFamily: 'monospace', fontWeight: 600 }}>
                  = 4 / {projectState.trainerReworkTarget} = {((4 / parseFloat(projectState.trainerReworkTarget || '5')) * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#3B82F6', fontWeight: 600 }}>OVERALL ACHIEVEMENT</Typography>
                <Typography variant="body2" sx={{ color: '#64748B', fontFamily: 'monospace', mt: 0.5 }}>
                  (2+4) / ({projectState.trainerNewTaskTarget}+{projectState.trainerReworkTarget})
                </Typography>
                <Typography variant="body2" sx={{ color: '#1E293B', fontFamily: 'monospace', fontWeight: 600 }}>
                  = 6 / {parseFloat(projectState.trainerNewTaskTarget || '3') + parseFloat(projectState.trainerReworkTarget || '5')} = {((6 / (parseFloat(projectState.trainerNewTaskTarget || '3') + parseFloat(projectState.trainerReworkTarget || '5'))) * 100).toFixed(0)}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Individual Overrides Section */}
      <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1E293B', mb: 2 }}>
          Individual Target Overrides
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
          Override default targets for specific trainers or reviewers. These take precedence over project defaults.
        </Typography>

        <Tabs
          value={entityTab}
          onChange={(e, v) => setEntityTab(v)}
          sx={{ mb: 2, borderBottom: '1px solid #E2E8F0' }}
        >
          <Tab 
            icon={<PersonIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label={`Trainers (${trainerTargets.length})`}
            sx={{ textTransform: 'none' }}
          />
          <Tab 
            icon={<GroupsIcon sx={{ fontSize: 18 }} />} 
            iconPosition="start" 
            label={`Reviewers (${reviewerTargets.length})`}
            sx={{ textTransform: 'none' }}
          />
        </Tabs>

        {entityTab === 0 && (
          <Box>
            {trainerTargets.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: '#94A3B8' }}>
                <PersonIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography variant="body2">
                  No individual trainer overrides set.
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  All trainers use the project default targets: {projectState.trainerNewTaskTarget} new tasks/day, {projectState.trainerReworkTarget} rework/day.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Trainer</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Daily Target</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Weekly Target</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Effective From</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trainerTargets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell>{target.entity_email || `ID: ${target.entity_id}`}</TableCell>
                        <TableCell align="center">
                          <Chip label={`${target.target} tasks`} size="small" color="primary" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">{(target.target * 5).toFixed(1)} tasks</TableCell>
                        <TableCell>{new Date(target.effective_from).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {entityTab === 1 && (
          <Box>
            {reviewerTargets.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: '#94A3B8' }}>
                <GroupsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography variant="body2">
                  No individual reviewer overrides set.
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  All reviewers use the project default targets: {projectState.reviewerNewTaskTarget} new reviews/day, {projectState.reviewerReworkTarget} rework/day.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Reviewer</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Daily Target</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Weekly Target</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Effective From</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reviewerTargets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell>{target.entity_email || `ID: ${target.entity_id}`}</TableCell>
                        <TableCell align="center">
                          <Chip label={`${target.target} reviews`} size="small" color="secondary" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">{(target.target * 5).toFixed(1)} reviews</TableCell>
                        <TableCell>{new Date(target.effective_from).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        <Box sx={{ mt: 3, p: 2, bgcolor: '#FFFBEB', borderRadius: 1.5, border: '1px solid #FEF3C7' }}>
          <Typography variant="body2" sx={{ color: '#92400E' }}>
            <strong>Coming Soon:</strong> Bulk import targets from Excel and set individual targets directly from this page.
          </Typography>
        </Box>
      </Paper>

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
