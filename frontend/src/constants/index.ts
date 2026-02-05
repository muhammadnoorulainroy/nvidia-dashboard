/**
 * Centralized constants for the Nvidia Dashboard frontend.
 * 
 * These values should be kept in sync with the backend constants.
 * In a production environment, these could be loaded from an API endpoint
 * to ensure consistency with backend configuration.
 */

// =============================================================================
// PROJECT CONFIGURATION
// =============================================================================

export interface ProjectOption {
  id: number | undefined
  name: string
}

/**
 * Project ID to Name mapping
 * NOTE: Project 37 is "Multichallenge" (SFT-Multichallenge in BigQuery)
 * NOTE: Project 39 is "CFBench Multilingual" (SFT-CFBench in BigQuery)
 */
export const PROJECT_ID_TO_NAME: Record<number, string> = {
  36: 'Nvidia - SysBench',
  37: 'Nvidia - Multichallenge',
  38: 'Nvidia - InverseIFEval',
  39: 'Nvidia - CFBench Multilingual',
  40: 'Nvidia - Multichallenge Advanced',
  41: 'Nvidia - ICPC',
  42: 'NVIDIA_STEM Math_Eval',
}

/**
 * Primary project IDs used in most UI dropdowns
 */
export const PRIMARY_PROJECT_IDS: number[] = [36, 37, 38, 39]

/**
 * All project IDs including advanced variants
 */
export const ALL_PROJECT_IDS: number[] = [36, 37, 38, 39, 40, 41, 42]

/**
 * Project options for dropdown selectors (with "All Projects" option)
 */
export const PROJECT_OPTIONS_WITH_ALL: ProjectOption[] = [
  { id: undefined, name: 'All Projects' },
  ...PRIMARY_PROJECT_IDS.map(id => ({ id, name: PROJECT_ID_TO_NAME[id] }))
]

/**
 * Project options for dropdown selectors (without "All Projects" option)
 */
export const PROJECT_OPTIONS: ProjectOption[] = PRIMARY_PROJECT_IDS.map(id => ({
  id,
  name: PROJECT_ID_TO_NAME[id]
}))

/**
 * Get project name by ID
 */
export const getProjectName = (projectId: number): string => {
  return PROJECT_ID_TO_NAME[projectId] || 'Unknown Project'
}

/**
 * Check if a project ID is valid
 */
export const isValidProjectId = (projectId: number): boolean => {
  return PRIMARY_PROJECT_IDS.includes(projectId)
}


// =============================================================================
// AHT CONFIGURATION (Default values - actual values come from API)
// =============================================================================

/**
 * Default AHT values (used for display purposes)
 * Actual values are configured via the API
 */
export const DEFAULT_NEW_TASK_AHT = 10.0
export const DEFAULT_REWORK_AHT = 4.0

/**
 * AHT validation limits
 */
export const AHT_MIN_VALUE = 0.1
export const AHT_MAX_VALUE = 100.0


// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

/**
 * Valid derived status values for filtering
 */
export const VALID_DERIVED_STATUSES: string[] = [
  'Completed',
  'Reviewed',
  'Rework',
  'Validated',
]


// =============================================================================
// UI CONFIGURATION
// =============================================================================

/**
 * Cache duration for API responses (in milliseconds)
 */
export const API_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Default pagination settings
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 500


// =============================================================================
// TIMEFRAME OPTIONS
// =============================================================================

export type TimeframeType = 'daily' | 'weekly' | 'monthly' | 'overall'

export const TIMEFRAME_OPTIONS: Array<{ value: TimeframeType; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'overall', label: 'Overall' },
]
