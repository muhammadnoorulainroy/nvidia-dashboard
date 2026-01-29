import { useState, useEffect, useCallback } from 'react'
import { getAHTConfigurations, type AHTConfiguration } from '../services/api'

// Default AHT values (fallback if API fails or no config exists)
export const DEFAULT_NEW_TASK_AHT = 10.0
export const DEFAULT_REWORK_AHT = 4.0

interface AHTConfigMap {
  [projectId: number]: {
    newTaskAht: number
    reworkAht: number
  }
}

interface UseAHTConfigurationResult {
  configs: AHTConfiguration[]
  configMap: AHTConfigMap
  loading: boolean
  error: string | null
  getAHTForProject: (projectId: number | undefined) => { newTaskAht: number; reworkAht: number }
  calculateMergedAHT: (newTasks: number, rework: number, projectId?: number) => number | null
  calculateTotalExpectedHours: (newTasks: number, rework: number, projectId?: number) => number | null
  refetch: () => Promise<void>
}

export function useAHTConfiguration(): UseAHTConfigurationResult {
  const [configs, setConfigs] = useState<AHTConfiguration[]>([])
  const [configMap, setConfigMap] = useState<AHTConfigMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAHTConfigurations()
      setConfigs(data)
      
      // Build config map for quick lookup
      const map: AHTConfigMap = {}
      data.forEach(config => {
        map[config.project_id] = {
          newTaskAht: config.new_task_aht,
          reworkAht: config.rework_aht
        }
      })
      setConfigMap(map)
    } catch (err: any) {
      console.error('Failed to fetch AHT configurations:', err)
      setError(err.message || 'Failed to fetch AHT configurations')
      // Use defaults on error
      setConfigMap({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  // Get AHT values for a specific project (or defaults if not found)
  const getAHTForProject = useCallback((projectId: number | undefined): { newTaskAht: number; reworkAht: number } => {
    if (projectId !== undefined && configMap[projectId]) {
      return configMap[projectId]
    }
    
    // If no specific project, return defaults
    return {
      newTaskAht: DEFAULT_NEW_TASK_AHT,
      reworkAht: DEFAULT_REWORK_AHT
    }
  }, [configMap])

  // Calculate Merged Exp. AHT (weighted average AHT per task) using configured values
  const calculateMergedAHT = useCallback((
    newTasks: number, 
    rework: number, 
    projectId?: number
  ): number | null => {
    const total = newTasks + rework
    if (total === 0) return null
    
    const { newTaskAht, reworkAht } = getAHTForProject(projectId)
    return (newTasks * newTaskAht + rework * reworkAht) / total
  }, [getAHTForProject])

  // Calculate Total Expected Hours (total work hours based on AHT)
  // Formula: (newTasks × newTaskAht) + (rework × reworkAht)
  const calculateTotalExpectedHours = useCallback((
    newTasks: number, 
    rework: number, 
    projectId?: number
  ): number | null => {
    if (newTasks === 0 && rework === 0) return null
    
    const { newTaskAht, reworkAht } = getAHTForProject(projectId)
    return (newTasks * newTaskAht) + (rework * reworkAht)
  }, [getAHTForProject])

  return {
    configs,
    configMap,
    loading,
    error,
    getAHTForProject,
    calculateMergedAHT,
    calculateTotalExpectedHours,
    refetch: fetchConfigs
  }
}
