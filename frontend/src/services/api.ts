import axios from 'axios'
import type {
  OverallAggregation,
  DomainAggregation,
  ReviewerAggregation,
  ReviewerWithTrainers,
  TrainerLevelAggregation,
  PodLeadAggregation,
  TaskLevelInfo,
  FilterParams,
} from '../types'

// Use environment variable for API base URL with fallback to '/api'
const API_BASE_URL = import.meta.env.VITE_API_PREFIX || '/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Simple in-memory cache
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<any>>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Helper function to build query params
const buildQueryParams = (filters?: FilterParams): string => {
  if (!filters) return ''
  
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value))
    }
  })
  
  return params.toString() ? `?${params.toString()}` : ''
}

// Helper function to generate cache key
const getCacheKey = (endpoint: string, filters?: FilterParams): string => {
  return `${endpoint}${buildQueryParams(filters)}`
}

// Helper function to get from cache
const getFromCache = <T>(key: string): T | null => {
  const entry = cache.get(key)
  if (!entry) return null
  
  const now = Date.now()
  if (now - entry.timestamp > CACHE_DURATION) {
    cache.delete(key)
    return null
  }
  
  return entry.data as T
}

// Helper function to set cache
const setCache = <T>(key: string, data: T): void => {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  })
}

// Function to clear cache (can be called manually)
export const clearCache = (): void => {
  cache.clear()
}

export const getOverallStats = async (filters?: FilterParams): Promise<OverallAggregation> => {
  const cacheKey = getCacheKey('/overall', filters)
  const cached = getFromCache<OverallAggregation>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<OverallAggregation>(`/overall${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getDomainStats = async (filters?: FilterParams): Promise<DomainAggregation[]> => {
  const cacheKey = getCacheKey('/by-domain', filters)
  const cached = getFromCache<DomainAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<DomainAggregation[]>(`/by-domain${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getReviewerStats = async (filters?: FilterParams): Promise<ReviewerAggregation[]> => {
  const cacheKey = getCacheKey('/by-reviewer', filters)
  const cached = getFromCache<ReviewerAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<ReviewerAggregation[]>(`/by-reviewer${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getReviewersWithTrainers = async (filters?: FilterParams): Promise<ReviewerWithTrainers[]> => {
  const cacheKey = getCacheKey('/reviewers-with-trainers', filters)
  const cached = getFromCache<ReviewerWithTrainers[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<ReviewerWithTrainers[]>(`/reviewers-with-trainers${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getTrainerStats = async (filters?: FilterParams): Promise<TrainerLevelAggregation[]> => {
  const cacheKey = getCacheKey('/by-trainer-level', filters)
  const cached = getFromCache<TrainerLevelAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TrainerLevelAggregation[]>(`/by-trainer-level${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

import type { TrainerDailyStats, ReviewerDailyStats } from '../types'

export const getTrainerDailyStats = async (filters?: FilterParams): Promise<TrainerDailyStats[]> => {
  const cacheKey = getCacheKey('/by-trainer-daily', filters)
  const cached = getFromCache<TrainerDailyStats[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TrainerDailyStats[]>(`/by-trainer-daily${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getTrainerOverallStats = async (filters?: FilterParams): Promise<TrainerDailyStats[]> => {
  const cacheKey = getCacheKey('/by-trainer-overall', filters)
  const cached = getFromCache<TrainerDailyStats[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TrainerDailyStats[]>(`/by-trainer-overall${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getReviewerDailyStats = async (filters?: FilterParams): Promise<ReviewerDailyStats[]> => {
  const cacheKey = getCacheKey('/by-reviewer-daily', filters)
  const cached = getFromCache<ReviewerDailyStats[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<ReviewerDailyStats[]>(`/by-reviewer-daily${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export interface TrainerByReviewerDate {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  review_date: string | null
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  tasks_reviewed: number
  avg_score: number | null
  total_reviews: number
  new_tasks_reviewed: number
  rework_reviewed: number
  ready_for_delivery: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
}

export const getTrainersByReviewerDate = async (filters?: FilterParams): Promise<TrainerByReviewerDate[]> => {
  const cacheKey = getCacheKey('/trainers-by-reviewer-date', filters)
  const cached = getFromCache<TrainerByReviewerDate[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TrainerByReviewerDate[]>(`/trainers-by-reviewer-date${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

// Old getPodLeadStats removed - using new POD Lead Stats API below

export const getTaskLevelInfo = async (filters?: FilterParams): Promise<TaskLevelInfo[]> => {
  const cacheKey = getCacheKey('/task-level', filters)
  const cached = getFromCache<TaskLevelInfo[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TaskLevelInfo[]>(`/task-level${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const checkHealth = async (): Promise<{ status: string; version: string }> => {
  const response = await apiClient.get('/health')
  return response.data
}

// Get unique filter options
export const getFilterOptions = async (): Promise<{
  domains: string[]
  quality_dimensions: string[]
  reviewers: Array<{ id: string; name: string }>
  trainers: Array<{ id: string; name: string }>
}> => {
  // Fetch data from different endpoints to build filter options
  const [domainData, overallData, reviewerData, trainerData] = await Promise.all([
    getDomainStats(),
    getOverallStats(),
    getReviewerStats(),
    getTrainerStats(),
  ])

  // Extract unique domains
  const domains = [...new Set(domainData.map(d => d.domain).filter(Boolean))] as string[]

  // Extract unique quality dimensions
  const qualityDimensions = [
    ...new Set(
      overallData.quality_dimensions.map(qd => qd.name)
    )
  ]

  // Extract reviewers
  const reviewers = reviewerData
    .filter(r => r.reviewer_id)
    .map(r => ({
      id: String(r.reviewer_id),
      name: r.reviewer_name || `Reviewer ${r.reviewer_id}`
    }))

  // Extract trainers
  const trainers = trainerData
    .filter(t => t.trainer_id)
    .map(t => ({
      id: String(t.trainer_id),
      name: t.trainer_name || `Trainer ${t.trainer_id}`
    }))

  return {
    domains,
    quality_dimensions: qualityDimensions,
    reviewers,
    trainers,
  }
}

// ============================================================================
// CLIENT DELIVERY API FUNCTIONS (Delivered Tasks Only)
// ============================================================================

export const getClientDeliveryOverallStats = async (filters?: FilterParams): Promise<OverallAggregation> => {
  const cacheKey = getCacheKey('/client-delivery/overall', filters)
  const cached = getFromCache<OverallAggregation>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<OverallAggregation>(`/client-delivery/overall${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getClientDeliveryDomainStats = async (filters?: FilterParams): Promise<DomainAggregation[]> => {
  const cacheKey = getCacheKey('/client-delivery/by-domain', filters)
  const cached = getFromCache<DomainAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<DomainAggregation[]>(`/client-delivery/by-domain${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getClientDeliveryReviewerStats = async (filters?: FilterParams): Promise<ReviewerAggregation[]> => {
  const cacheKey = getCacheKey('/client-delivery/by-reviewer', filters)
  const cached = getFromCache<ReviewerAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<ReviewerAggregation[]>(`/client-delivery/by-reviewer${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export const getClientDeliveryTrainerStats = async (filters?: FilterParams): Promise<TrainerLevelAggregation[]> => {
  const cacheKey = getCacheKey('/client-delivery/by-trainer', filters)
  const cached = getFromCache<TrainerLevelAggregation[]>(cacheKey)
  if (cached) return cached
  
  const queryParams = buildQueryParams(filters)
  const response = await apiClient.get<TrainerLevelAggregation[]>(`/client-delivery/by-trainer${queryParams}`)
  setCache(cacheKey, response.data)
  return response.data
}

export interface DeliveryTrackerItem {
  delivery_date: string
  total_tasks: number
  file_names: string[]
  file_count: number
}

export const getDeliveryTracker = async (): Promise<DeliveryTrackerItem[]> => {
  const cacheKey = '/client-delivery/tracker'
  const cached = getFromCache<DeliveryTrackerItem[]>(cacheKey)
  if (cached) return cached
  
  const response = await apiClient.get<DeliveryTrackerItem[]>('/client-delivery/tracker')
  setCache(cacheKey, response.data)
  return response.data
}

// Sync data from S3
export interface SyncResult {
  bigquery_sync: {
    status: string
    tables_synced?: Record<string, boolean>
    error?: string
  } | null
  s3_ingestion: {
    status: string
    files_processed?: number
    work_items_ingested?: number
    duration_seconds?: number
    errors?: string[]
    error?: string
  } | null
  overall_status: string
}

export const triggerS3Sync = async (): Promise<SyncResult> => {
  const response = await apiClient.post<SyncResult>('/sync?sync_bigquery=false&sync_s3=true')
  // Clear cache after successful sync
  if (response.data.overall_status === 'completed') {
    clearCache()
  }
  return response.data
}

// Rating Trends API
export interface RatingTrendPoint {
  period: string
  avg_rating: number | null
  total_reviews: number
  tasks_count: number
}

export interface RatingTrendsResponse {
  granularity: string
  overall_trends: RatingTrendPoint[]
  by_trainer: Record<string, RatingTrendPoint[]>
  improvement_stats: {
    first_period: string
    last_period: string
    first_rating: number
    last_rating: number
    rating_change: number
    improvement_percent: number
    trend: 'improving' | 'declining' | 'stable'
  } | Record<string, never>
  trainer_count: number
  period_count: number
}

export const getRatingTrends = async (
  granularity: 'daily' | 'weekly' | 'monthly' = 'weekly',
  trainerEmail?: string
): Promise<RatingTrendsResponse> => {
  const params = new URLSearchParams({ granularity })
  if (trainerEmail) params.append('trainer_email', trainerEmail)
  
  const response = await apiClient.get<RatingTrendsResponse>(`/rating-trends?${params.toString()}`)
  return response.data
}

export interface TrainerRatingComparison {
  trainer: string
  period1_rating: number | null
  period1_reviews: number
  period2_rating: number | null
  period2_reviews: number
  rating_change: number | null
  change_percent: number | null
  trend: 'improving' | 'declining' | 'stable' | 'no_data'
}

export interface RatingComparisonResponse {
  period1: {
    start: string
    end: string
    stats: {
      avg_rating: number | null
      total_reviews: number
      tasks_count: number
      trainer_count: number
    }
  }
  period2: {
    start: string
    end: string
    stats: {
      avg_rating: number | null
      total_reviews: number
      tasks_count: number
      trainer_count: number
    }
  }
  overall_comparison: {
    rating_change: number | null
    change_percent: number | null
    trend: 'improving' | 'declining' | 'stable' | 'no_data'
  }
  by_trainer: TrainerRatingComparison[]
  summary: {
    trainers_improved: number
    trainers_declined: number
    trainers_stable: number
    trainers_no_data: number
  }
}

export const getRatingComparison = async (
  period1Start: string,
  period1End: string,
  period2Start: string,
  period2End: string,
  trainerEmail?: string
): Promise<RatingComparisonResponse> => {
  const params = new URLSearchParams({
    period1_start: period1Start,
    period1_end: period1End,
    period2_start: period2Start,
    period2_end: period2End
  })
  if (trainerEmail) params.append('trainer_email', trainerEmail)
  
  const response = await apiClient.get<RatingComparisonResponse>(`/rating-comparison?${params.toString()}`)
  return response.data
}

// POD Lead Stats API
export interface TrainerUnderPod {
  trainer_name: string
  trainer_email: string
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  ready_for_delivery?: number  // Deprecated
  approved_tasks: number       // New tasks that got approved (first completion approved)
  approved_rework: number      // Rework tasks that got approved (fixed someone else's rejected task)
  delivered_tasks: number      // Tasks in delivered batches
  in_delivery_queue: number    // Tasks in ongoing delivery batches
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  jibble_hours: number
  aht_submission: number | null
  status: string
}

export interface PodLeadStats {
  pod_lead_name: string
  pod_lead_email: string
  trainer_count: number
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  ready_for_delivery?: number  // Deprecated
  approved_tasks: number       // New tasks that got approved
  approved_rework: number      // Rework tasks that got approved
  delivered_tasks: number      // Tasks in delivered batches
  in_delivery_queue: number    // Tasks in ongoing delivery batches
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  jibble_hours: number
  total_trainer_hours: number
  aht_submission: number | null
  trainers: TrainerUnderPod[]
}

export const getPodLeadStats = async (
  startDate?: string,
  endDate?: string,
  timeframe: string = 'overall',
  projectId?: number
): Promise<PodLeadStats[]> => {
  const params = new URLSearchParams({ timeframe })
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (projectId) params.append('project_id', projectId.toString())
  
  const response = await apiClient.get<PodLeadStats[]>(`/pod-lead-stats?${params.toString()}`)
  return response.data
}

// Trainer under POD Lead (for 3-level hierarchy)
export interface TrainerUnderPodLead {
  trainer_name: string
  trainer_email: string
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  delivered: number
  in_queue: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  jibble_hours: number
  accounted_hours: number
  efficiency: number | null
  status: string
}

// POD Lead under Project (with trainers for 3-level hierarchy)
export interface PodLeadUnderProject {
  pod_lead_name: string
  pod_lead_email: string
  trainer_count: number
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  delivered: number
  in_queue: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  pod_jibble_hours: number
  trainer_jibble_hours: number
  accounted_hours: number
  efficiency: number | null
  trainers: TrainerUnderPodLead[]
}

// Project Stats with POD Leads
export interface ProjectStats {
  project_id: number
  project_name: string
  pod_lead_count: number
  trainer_count: number
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  delivered: number
  in_queue: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  logged_hours: number
  total_pod_hours: number
  accounted_hours: number
  efficiency: number | null
  pod_leads: PodLeadUnderProject[]
}

export const getProjectStats = async (
  startDate?: string,
  endDate?: string
): Promise<ProjectStats[]> => {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  
  const queryString = params.toString()
  const url = queryString ? `/project-stats?${queryString}` : '/project-stats'
  const response = await apiClient.get<ProjectStats[]>(url)
  return response.data
}


// ============================================================================
// AHT CONFIGURATION API FUNCTIONS
// ============================================================================

export interface AHTConfiguration {
  id: number
  project_id: number
  project_name: string
  new_task_aht: number
  rework_aht: number
  created_at: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface AHTConfigUpdate {
  new_task_aht: number
  rework_aht: number
  updated_by?: string
}

export const getAHTConfigurations = async (): Promise<AHTConfiguration[]> => {
  const response = await apiClient.get<AHTConfiguration[]>('/config/aht')
  return response.data
}

export const getAHTConfiguration = async (projectId: number): Promise<AHTConfiguration> => {
  const response = await apiClient.get<AHTConfiguration>(`/config/aht/${projectId}`)
  return response.data
}

export const updateAHTConfiguration = async (
  projectId: number, 
  update: AHTConfigUpdate
): Promise<AHTConfiguration> => {
  const response = await apiClient.put<AHTConfiguration>(`/config/aht/${projectId}`, update)
  return response.data
}


// ============================================================================
// THROUGHPUT TARGETS API FUNCTIONS
// ============================================================================

export interface ThroughputTarget {
  id: number
  config_key: string
  entity_type: string | null
  entity_id: number | null
  entity_email: string | null
  target: number
  unit: string
  effective_from: string
  effective_to: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface ThroughputTargetsResponse {
  project_id: number
  targets: ThroughputTarget[]
}

export interface SetTargetRequest {
  target: number
  entity_type?: string
  entity_id?: number
  entity_email?: string
  updated_by?: string
  config_key?: string  // 'new_tasks_target' or 'rework_target'
}

export const getThroughputTargets = async (projectId: number): Promise<ThroughputTargetsResponse> => {
  const response = await apiClient.get<ThroughputTargetsResponse>(`/config/targets/${projectId}`)
  return response.data
}

export const getDefaultThroughputTarget = async (
  projectId: number, 
  entityType: string = 'trainer'
): Promise<{ project_id: number; entity_type: string; target: number | null; unit: string }> => {
  const response = await apiClient.get(`/config/targets/${projectId}/default`, {
    params: { entity_type: entityType }
  })
  return response.data
}

export const setThroughputTarget = async (
  projectId: number,
  request: SetTargetRequest
): Promise<{ success: boolean; message: string; config: any }> => {
  const response = await apiClient.put(`/config/targets/${projectId}`, request)
  return response.data
}

export const bulkSetThroughputTargets = async (
  projectId: number,
  targets: Array<{ entity_id?: number; entity_email?: string; target: number }>,
  entityType: string = 'trainer',
  updatedBy?: string
): Promise<{ success: boolean; message: string; count: number }> => {
  const response = await apiClient.post(
    `/config/targets/${projectId}/bulk`,
    targets,
    { params: { entity_type: entityType, updated_by: updatedBy } }
  )
  return response.data
}


// ============================================================================
// PERFORMANCE WEIGHTS API FUNCTIONS
// ============================================================================

export interface PerformanceWeights {
  project_id: number
  throughput: number
  avg_rating: number
  rating_change: number
  rework_rate: number
  delivered: number
  updated_at: string | null
  updated_by: string | null
}

export const getPerformanceWeights = async (projectId: number): Promise<PerformanceWeights> => {
  const response = await apiClient.get<PerformanceWeights>(`/config/weights/${projectId}`)
  return response.data
}

export const setPerformanceWeights = async (
  projectId: number,
  weights: {
    throughput: number
    avg_rating: number
    rating_change: number
    rework_rate: number
    delivered: number
    updated_by?: string
  }
): Promise<PerformanceWeights> => {
  const response = await apiClient.put<PerformanceWeights>(`/config/weights/${projectId}`, weights)
  return response.data
}


// ============================================================================
// CLASSIFICATION THRESHOLDS API FUNCTIONS
// ============================================================================

export interface ClassificationThresholds {
  project_id: number
  A: { min_score: number; label: string }
  B: { min_score: number; label: string }
  C: { min_score: number; label: string }
  updated_at: string | null
  updated_by: string | null
}

export const getClassificationThresholds = async (projectId: number): Promise<ClassificationThresholds> => {
  const response = await apiClient.get<ClassificationThresholds>(`/config/thresholds/${projectId}`)
  return response.data
}

export const setClassificationThresholds = async (
  projectId: number,
  thresholds: {
    a_min_score: number
    b_min_score: number
    updated_by?: string
  }
): Promise<ClassificationThresholds> => {
  const response = await apiClient.put<ClassificationThresholds>(`/config/thresholds/${projectId}`, thresholds)
  return response.data
}


// ============================================================================
// EFFORT THRESHOLDS API FUNCTIONS  
// ============================================================================

export interface EffortThresholds {
  project_id: number
  over_threshold: number
  under_threshold: number
  updated_at: string | null
  updated_by: string | null
}

export const getEffortThresholds = async (projectId: number): Promise<EffortThresholds> => {
  const response = await apiClient.get<EffortThresholds>(`/config/effort-thresholds/${projectId}`)
  return response.data
}

export const setEffortThresholds = async (
  projectId: number,
  thresholds: {
    over_threshold: number
    under_threshold: number
    updated_by?: string
  }
): Promise<EffortThresholds> => {
  const response = await apiClient.put<EffortThresholds>(`/config/effort-thresholds/${projectId}`, thresholds)
  return response.data
}


// ============================================================================
// TARGET VS ACTUAL COMPARISON API FUNCTIONS
// ============================================================================

export interface TargetComparison {
  entity_type: string
  entity_id: number | null
  entity_email: string | null
  entity_name: string | null
  target_daily: number
  target_period: number
  target_source: string
  actual: number
  gap: number
  achievement_percent: number
}

export interface TrainerTargetComparisonResponse {
  project_id: number
  rollup: string
  period_start: string | null
  period_end: string | null
  working_days: number
  comparisons: TargetComparison[]
}

export interface ProjectTargetSummary {
  project_id: number
  period_start: string | null
  period_end: string | null
  rollup: string
  trainers: {
    count: number
    total_target: number
    total_actual: number
    overall_achievement: number
    meeting_target: number
    below_target: number
    top_performers: Array<{ email: string; name: string | null; achievement: number }>
    needs_attention: Array<{ email: string; name: string | null; achievement: number }>
  }
}

export const getTrainerTargetComparison = async (
  projectId: number,
  options?: {
    trainerEmail?: string
    startDate?: string
    endDate?: string
    rollup?: 'daily' | 'weekly' | 'monthly'
  }
): Promise<TrainerTargetComparisonResponse> => {
  const params = new URLSearchParams()
  if (options?.trainerEmail) params.append('trainer_email', options.trainerEmail)
  if (options?.startDate) params.append('start_date', options.startDate)
  if (options?.endDate) params.append('end_date', options.endDate)
  if (options?.rollup) params.append('rollup', options.rollup)
  
  const queryString = params.toString()
  const url = queryString 
    ? `/target-comparison/trainers/${projectId}?${queryString}` 
    : `/target-comparison/trainers/${projectId}`
  
  const response = await apiClient.get<TrainerTargetComparisonResponse>(url)
  return response.data
}

export const getProjectTargetSummary = async (
  projectId: number,
  options?: {
    startDate?: string
    endDate?: string
    rollup?: 'daily' | 'weekly' | 'monthly'
  }
): Promise<ProjectTargetSummary> => {
  const params = new URLSearchParams()
  if (options?.startDate) params.append('start_date', options.startDate)
  if (options?.endDate) params.append('end_date', options.endDate)
  if (options?.rollup) params.append('rollup', options.rollup)
  
  const queryString = params.toString()
  const url = queryString 
    ? `/target-comparison/summary/${projectId}?${queryString}` 
    : `/target-comparison/summary/${projectId}`
  
  const response = await apiClient.get<ProjectTargetSummary>(url)
  return response.data
}
