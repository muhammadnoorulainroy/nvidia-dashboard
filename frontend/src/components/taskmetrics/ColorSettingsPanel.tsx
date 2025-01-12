import { useState } from 'react'
import {
  Box,
  Typography,
  Slider,
  IconButton,
  Popover,
  Paper,
  Divider,
  Switch,
  FormControlLabel,
  Tooltip,
  Button,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import PaletteIcon from '@mui/icons-material/Palette'
import RestoreIcon from '@mui/icons-material/Restore'

export interface MetricColorConfig {
  enabled: boolean
  min: number
  max: number
  inverse: boolean // true = higher is worse (red), false = higher is better (green)
  label: string
  unit?: string
  step?: number
}

export interface ColorSettings {
  [key: string]: MetricColorConfig
}

// Apply coloring at which level
export type ColorApplyLevel = 'both' | 'parent' | 'child'

// Default color configurations for each metric - with increased ranges for actual data
export const defaultColorSettings: ColorSettings = {
  tasks_reviewed: {
    enabled: true,
    min: 0,
    max: 200,  // Increased from 50
    inverse: false,
    label: 'Tasks Reviewed',
    step: 10,
  },
  new_tasks_reviewed: {
    enabled: true,
    min: 0,
    max: 100,  // Increased from 30
    inverse: false,
    label: 'New Tasks Reviewed',
    step: 10,
  },
  rework_reviewed: {
    enabled: true,
    min: 0,
    max: 200,  // Increased from 20
    inverse: true,
    label: 'Rework Reviewed',
    step: 10,
  },
  total_reviews: {
    enabled: true,
    min: 0,
    max: 500,  // Increased from 50 to accommodate 150+
    inverse: false,
    label: 'Total Reviews',
    step: 25,
  },
  ready_for_delivery: {
    enabled: true,
    min: 0,
    max: 100,  // Increased from 30
    inverse: false,
    label: 'Ready for Delivery',
    step: 10,
  },
  avg_rework: {
    enabled: true,
    min: -100,  // Can be negative
    max: 200,
    inverse: true,
    label: 'Avg Rework %',
    unit: '%',
    step: 20,
  },
  rework_percent: {
    enabled: true,
    min: 0,
    max: 100,
    inverse: true,
    label: 'Rework %',
    unit: '%',
    step: 10,
  },
  avg_rating: {
    enabled: true,
    min: 1,
    max: 5,
    inverse: false,
    label: 'Avg Rating',
    step: 0.5,
  },
  merged_exp_aht: {
    enabled: true,
    min: 0,
    max: 15,  // Increased from 10
    inverse: false,
    label: 'Merged Exp. AHT',
    step: 1,
  },
}

// Color interpolation function
export function getColorForValue(
  value: number | null | undefined,
  config: MetricColorConfig | undefined
): string {
  if (value === null || value === undefined) {
    return '#6B7280' // Gray for no data
  }
  
  if (!config) {
    console.warn('Color config is undefined for value:', value)
    return '#6B7280'
  }
  
  if (!config.enabled) {
    return '#6B7280'
  }

  const { min, max, inverse } = config
  
  // Normalize value between 0 and 1
  let normalized = (value - min) / (max - min)
  normalized = Math.max(0, Math.min(1, normalized)) // Clamp between 0 and 1
  
  if (inverse) {
    normalized = 1 - normalized
  }

  // Color gradient: Red (0) -> Yellow (0.5) -> Green (1)
  if (normalized <= 0.5) {
    // Red to Yellow
    const r = 239
    const g = Math.round(68 + (normalized * 2) * (179 - 68))
    const b = 68
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Yellow to Green
    const factor = (normalized - 0.5) * 2
    const r = Math.round(234 - factor * (234 - 16))
    const g = Math.round(179 + factor * (185 - 179))
    const b = Math.round(8 + factor * (129 - 8))
    return `rgb(${r}, ${g}, ${b})`
  }
}

// Background color with low opacity
export function getBackgroundColorForValue(
  value: number | null | undefined,
  config: MetricColorConfig | undefined
): string {
  if (value === null || value === undefined || !config || !config.enabled) {
    return 'transparent'
  }

  const { min, max, inverse } = config
  
  let normalized = (value - min) / (max - min)
  normalized = Math.max(0, Math.min(1, normalized))
  
  if (inverse) {
    normalized = 1 - normalized
  }

  // More visible background colors - stronger opacity
  if (normalized <= 0.5) {
    const opacity = 0.2 + normalized * 0.3
    return `rgba(239, 68, 68, ${opacity})`
  } else {
    const opacity = 0.2 + (normalized - 0.5) * 0.3
    return `rgba(16, 185, 129, ${opacity})`
  }
}

interface ColorSettingsPanelProps {
  settings: ColorSettings
  onSettingsChange: (settings: ColorSettings) => void
  metrics?: string[] // Which metrics to show
  applyLevel?: ColorApplyLevel  // 'both' | 'parent' | 'child'
  onApplyLevelChange?: (level: ColorApplyLevel) => void
}

export default function ColorSettingsPanel({
  settings,
  onSettingsChange,
  metrics,
  applyLevel = 'both',
  onApplyLevelChange,
}: ColorSettingsPanelProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleToggle = (metric: string, enabled: boolean) => {
    const newSettings = { ...settings }
    newSettings[metric] = { ...newSettings[metric], enabled }
    onSettingsChange(newSettings)
  }

  const handleInverseToggle = (metric: string, inverse: boolean) => {
    const newSettings = { ...settings }
    newSettings[metric] = { ...newSettings[metric], inverse }
    onSettingsChange(newSettings)
  }

  const handleReset = () => {
    onSettingsChange({ ...defaultColorSettings })
  }

  const open = Boolean(anchorEl)
  const metricsToShow = metrics || Object.keys(settings)

  // Preview gradient bar component
  const GradientPreview = ({ config }: { config: MetricColorConfig }) => (
    <Box
      sx={{
        width: '100%',
        height: 8,
        borderRadius: 4,
        background: config.inverse
          ? 'linear-gradient(to right, #10B981, #EAB308, #EF4444)'
          : 'linear-gradient(to right, #EF4444, #EAB308, #10B981)',
        opacity: config.enabled ? 1 : 0.3,
      }}
    />
  )

  return (
    <>
      <Tooltip title="Color Settings">
        <IconButton
          onClick={handleClick}
          sx={{
            backgroundColor: open ? '#E0E7FF' : 'transparent',
            '&:hover': { backgroundColor: '#E0E7FF' },
          }}
        >
          <PaletteIcon sx={{ color: '#6366F1' }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Paper sx={{ p: 2, minWidth: 400, maxWidth: 500, maxHeight: 600, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SettingsIcon sx={{ color: '#6366F1' }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937' }}>
                Color Intensity Settings
              </Typography>
            </Box>
            <Tooltip title="Reset to defaults">
              <IconButton size="small" onClick={handleReset}>
                <RestoreIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Adjust the min/max thresholds for color intensity. Values at min will be red, values at max will be green (or inverse).
          </Typography>

          {/* Apply Level Selection */}
          {onApplyLevelChange && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: '#F3F4F6', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151', mb: 1 }}>
                Apply Colors To:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant={applyLevel === 'both' ? 'contained' : 'outlined'}
                  onClick={() => onApplyLevelChange('both')}
                  sx={{ 
                    flex: 1, 
                    fontSize: '0.75rem',
                    bgcolor: applyLevel === 'both' ? '#6366F1' : undefined,
                  }}
                >
                  Both
                </Button>
                <Button
                  size="small"
                  variant={applyLevel === 'parent' ? 'contained' : 'outlined'}
                  onClick={() => onApplyLevelChange('parent')}
                  sx={{ 
                    flex: 1, 
                    fontSize: '0.75rem',
                    bgcolor: applyLevel === 'parent' ? '#6366F1' : undefined,
                  }}
                >
                  POD Lead Only
                </Button>
                <Button
                  size="small"
                  variant={applyLevel === 'child' ? 'contained' : 'outlined'}
                  onClick={() => onApplyLevelChange('child')}
                  sx={{ 
                    flex: 1, 
                    fontSize: '0.75rem',
                    bgcolor: applyLevel === 'child' ? '#6366F1' : undefined,
                  }}
                >
                  Trainer Only
                </Button>
              </Box>
            </Box>
          )}

          <Divider sx={{ mb: 2 }} />

          {metricsToShow.map((metric) => {
            const config = settings[metric]
            if (!config) return null

            return (
              <Box key={metric} sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
                    {config.label}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={config.inverse}
                          onChange={(e) => handleInverseToggle(metric, e.target.checked)}
                          sx={{ transform: 'scale(0.8)' }}
                        />
                      }
                      label={<Typography variant="caption">Inverse</Typography>}
                      sx={{ m: 0 }}
                    />
                    <Switch
                      size="small"
                      checked={config.enabled}
                      onChange={(e) => handleToggle(metric, e.target.checked)}
                    />
                  </Box>
                </Box>

                <GradientPreview config={config} />

                <Box sx={{ px: 1, mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Range: {config.min}{config.unit || ''} - {config.max}{config.unit || ''}
                  </Typography>
                  <Slider
                    value={[config.min, config.max]}
                    onChange={(_, value) => {
                      const [newMin, newMax] = value as number[]
                      const newSettings = { ...settings }
                      newSettings[metric] = { ...newSettings[metric], min: newMin, max: newMax }
                      onSettingsChange(newSettings)
                    }}
                    valueLabelDisplay="auto"
                    min={0}
                    max={metric === 'avg_rating' ? 5 : metric === 'merged_exp_aht' ? 15 : metric === 'avg_rework' ? 300 : 100}
                    step={config.step || 1}
                    disabled={!config.enabled}
                    sx={{
                      color: '#6366F1',
                      '& .MuiSlider-thumb': {
                        width: 16,
                        height: 16,
                      },
                    }}
                  />
                </Box>
              </Box>
            )
          })}

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleClose} sx={{ backgroundColor: '#6366F1' }}>
              Apply
            </Button>
          </Box>
        </Paper>
      </Popover>
    </>
  )
}

// Hook to use color settings with local storage
export function useColorSettings(key: string = 'reviewerColorSettings'): [ColorSettings, (settings: ColorSettings) => void] {
  const [settings, setSettings] = useState<ColorSettings>(() => {
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        return { ...defaultColorSettings, ...JSON.parse(saved) }
      } catch {
        return { ...defaultColorSettings }
      }
    }
    return { ...defaultColorSettings }
  })

  const updateSettings = (newSettings: ColorSettings) => {
    setSettings(newSettings)
    localStorage.setItem(key, JSON.stringify(newSettings))
  }

  return [settings, updateSettings]
}
