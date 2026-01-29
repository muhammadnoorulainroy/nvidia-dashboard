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
    label: 'Avg Rework',
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

// =============================================================================
// BUSINESS COLOR CODING RULES - Configurable Thresholds
// =============================================================================

export const COLOR_THRESHOLDS = {
  // Ratings: > 4.8 Green, 4.0-4.7 Yellow, < 4.0 Red
  rating: {
    green: 4.8,    // >= this is green
    yellow: 4.0,   // >= this is yellow, < green threshold
    // Below yellow threshold is red
  },
  
  // AHT Efficiency: Expected vs Actual
  // < 1.15x Green, 1.15-1.4x Yellow, > 1.4x Red
  ahtEfficiency: {
    greenMultiplier: 1.15,   // < this multiplier is green (90% efficiency)
    yellowMultiplier: 1.4,   // < this multiplier is yellow (70% efficiency)
    // Above yellow multiplier is red
  },
  
  // Review Coverage: unique reviews / unique submissions
  // >= 90% Green, 70-90% Yellow, < 70% Red
  reviewCoverage: {
    green: 90,    // >= this % is green
    yellow: 70,   // >= this % is yellow
    // Below yellow is red
  },
  
  // Rework %: Lower is better
  // <= 30% Green, 30-50% Yellow, > 50% Red
  reworkPercent: {
    green: 30,    // <= this % is green
    yellow: 50,   // <= this % is yellow
    // Above yellow is red
  },
  
  // Avg Rework: Lower is better (values like 0.5, 1.0, 1.5)
  // <= 1 Green, 1-2 Yellow, > 2 Red
  avgReworkPercent: {
    green: 1,     // <= this value is green
    yellow: 2,    // <= this value is yellow
    // Above yellow is red
  },
}

// Professional color palette - subtle backgrounds
const COLORS = {
  green: {
    bg: '#F0FDF4',      // Very light green background
    text: '#166534',    // Dark green text
    border: '#86EFAC',  // Light green border
  },
  yellow: {
    bg: '#FFFBEB',      // Very light amber background
    text: '#92400E',    // Dark amber text
    border: '#FCD34D',  // Amber border
  },
  red: {
    bg: '#FEF2F2',      // Very light red background
    text: '#991B1B',    // Dark red text
    border: '#FECACA',  // Light red border
  },
  neutral: {
    bg: 'transparent',
    text: '#374151',    // Gray text
    border: 'transparent',
  },
}

// =============================================================================
// SPECIFIC METRIC COLOR FUNCTIONS
// =============================================================================

// Rating color: > 4.8 Green, 4.0-4.7 Yellow, < 4.0 Red
export function getRatingColor(value: number | null | undefined): { bg: string; text: string } {
  if (value === null || value === undefined) return COLORS.neutral
  
  if (value >= COLOR_THRESHOLDS.rating.green) {
    return { bg: COLORS.green.bg, text: COLORS.green.text }
  } else if (value >= COLOR_THRESHOLDS.rating.yellow) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  } else {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
}

// Rework % color: <= 30% Green, 30-50% Yellow, > 50% Red
export function getReworkPercentColor(value: number | null | undefined): { bg: string; text: string } {
  if (value === null || value === undefined) return COLORS.neutral
  
  if (value <= COLOR_THRESHOLDS.reworkPercent.green) {
    return { bg: COLORS.green.bg, text: COLORS.green.text }
  } else if (value <= COLOR_THRESHOLDS.reworkPercent.yellow) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  } else {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
}

// Avg Rework color: <= 1 Green, 1-2 Yellow, > 2 Red
export function getAvgReworkPercentColor(value: number | null | undefined): { bg: string; text: string } {
  if (value === null || value === undefined) return COLORS.neutral
  
  if (value <= COLOR_THRESHOLDS.avgReworkPercent.green) {
    return { bg: COLORS.green.bg, text: COLORS.green.text }
  } else if (value <= COLOR_THRESHOLDS.avgReworkPercent.yellow) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  } else {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
}

// AHT Efficiency color based on Expected AHT
// actualAHT < 1.15 * expectedAHT = Green
// actualAHT < 1.4 * expectedAHT = Yellow
// actualAHT >= 1.4 * expectedAHT = Red
export function getAHTEfficiencyColor(
  actualAHT: number | null | undefined, 
  expectedAHT: number | null | undefined
): { bg: string; text: string } {
  if (actualAHT === null || actualAHT === undefined || 
      expectedAHT === null || expectedAHT === undefined || expectedAHT === 0) {
    return COLORS.neutral
  }
  
  const ratio = actualAHT / expectedAHT
  
  if (ratio < COLOR_THRESHOLDS.ahtEfficiency.greenMultiplier) {
    return { bg: COLORS.green.bg, text: COLORS.green.text }
  } else if (ratio < COLOR_THRESHOLDS.ahtEfficiency.yellowMultiplier) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  } else {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
}

// Review Coverage color: >= 90% Green, 70-90% Yellow, < 70% Red
export function getReviewCoverageColor(
  uniqueReviews: number | null | undefined,
  uniqueSubmissions: number | null | undefined
): { bg: string; text: string } {
  if (uniqueReviews === null || uniqueReviews === undefined ||
      uniqueSubmissions === null || uniqueSubmissions === undefined || uniqueSubmissions === 0) {
    return COLORS.neutral
  }
  
  const coverage = (uniqueReviews / uniqueSubmissions) * 100
  
  if (coverage >= COLOR_THRESHOLDS.reviewCoverage.green) {
    return { bg: COLORS.green.bg, text: COLORS.green.text }
  } else if (coverage >= COLOR_THRESHOLDS.reviewCoverage.yellow) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  } else {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
}

// Time Theft color: Hours > 0 but tasks = 0 = Red, Hours > efforts = Yellow
export function getTimeTheftColor(
  hours: number | null | undefined,
  tasks: number | null | undefined,
  expectedEffort?: number | null | undefined
): { bg: string; text: string } {
  if (hours === null || hours === undefined) return COLORS.neutral
  
  // Hours logged but no tasks = Red (potential time theft)
  if (hours > 0 && (tasks === null || tasks === undefined || tasks === 0)) {
    return { bg: COLORS.red.bg, text: COLORS.red.text }
  }
  
  // Hours greater than expected effort = Yellow (needs review)
  if (expectedEffort !== null && expectedEffort !== undefined && hours > expectedEffort) {
    return { bg: COLORS.yellow.bg, text: COLORS.yellow.text }
  }
  
  return COLORS.neutral
}

// =============================================================================
// GENERIC COLOR FUNCTIONS (for backward compatibility)
// =============================================================================

// Generic background color function - uses metric-specific rules based on config
export function getBackgroundColorForValue(
  value: number | null | undefined,
  config: MetricColorConfig | undefined
): string {
  if (value === null || value === undefined || !config || !config.enabled) {
    return 'transparent'
  }

  // Use specific metric rules based on label
  const label = config.label.toLowerCase()
  
  if (label.includes('rating')) {
    return getRatingColor(value).bg
  } else if (label === 'rework %' || label === 'rework_percent') {
    return getReworkPercentColor(value).bg
  } else if (label.includes('avg rework')) {
    return getAvgReworkPercentColor(value).bg
  }
  
  // For other metrics, use the inverse flag to determine direction
  const { min, max, inverse } = config
  let normalized = (value - min) / (max - min)
  normalized = Math.max(0, Math.min(1, normalized))
  
  if (inverse) {
    normalized = 1 - normalized
  }

  // Three-tier system: Red (0-33%), Yellow (33-66%), Green (66-100%)
  if (normalized < 0.33) {
    return COLORS.red.bg
  } else if (normalized < 0.66) {
    return COLORS.yellow.bg
  } else {
    return COLORS.green.bg
  }
}

// Generic text color function
export function getTextColorForValue(
  value: number | null | undefined,
  config: MetricColorConfig | undefined
): string {
  if (value === null || value === undefined || !config || !config.enabled) {
    return '#374151'
  }

  // Use specific metric rules based on label
  const label = config.label.toLowerCase()
  
  if (label.includes('rating')) {
    return getRatingColor(value).text
  } else if (label === 'rework %' || label === 'rework_percent') {
    return getReworkPercentColor(value).text
  } else if (label.includes('avg rework')) {
    return getAvgReworkPercentColor(value).text
  }
  
  // For other metrics, use the inverse flag
  const { min, max, inverse } = config
  let normalized = (value - min) / (max - min)
  normalized = Math.max(0, Math.min(1, normalized))
  
  if (inverse) {
    normalized = 1 - normalized
  }

  if (normalized < 0.33) {
    return COLORS.red.text
  } else if (normalized < 0.66) {
    return COLORS.yellow.text
  } else {
    return COLORS.green.text
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

  const handleSliderChange = (
    metric: string,
    field: 'min' | 'max',
    value: number
  ) => {
    const newSettings = { ...settings }
    newSettings[metric] = { ...newSettings[metric], [field]: value }
    onSettingsChange(newSettings)
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
                    max={metric === 'avg_rating' ? 5 : metric === 'merged_exp_aht' ? 15 : metric === 'avg_rework' ? 3 : 100}
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
