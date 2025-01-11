import axios from 'axios'
import type {
  OverallAggregation,
  DomainAggregation,
  ReviewerAggregation,
  ReviewerWithTrainers,
  TrainerLevelAggregation,
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

/**
 * Session-based in-memory cache for API responses.
 * 
 * Strategy: Cache is primarily cleared when:
 * 1. User triggers a manual sync (via clearCache)
 * 2. Page is reloaded (session-based)
 * 3. Safety TTL expires (1 hour - matches backend sync interval)
 * 
 * This matches the backend's event-driven cache strategy where
 * data only changes when sync occurs.
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<any>>()

// Safety TTL - matches backend sync interval (1 hour)
// Cache is primarily cleared on sync, this is just a fallback
const CACHE_SAFETY_TTL = 60 * 60 * 1000 // 1 hour

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
  
  // Safety TTL check (data should be refreshed if sync hasn't happened)
  const now = Date.now()
  if (now - entry.timestamp > CACHE_SAFETY_TTL) {
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

/**
 * Clear all cached data.
 * Should be called after triggering a sync to ensure fresh data.
 */
export const clearCache = (): void => {
  cache.clear()
  console.log('[Cache] All entries cleared')
}

/**
 * Get cache statistics for debugging.
 */
export const getCacheStats = (): { size: number; keys: string[] } => {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  }
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
// Rating Trends API
// ============================================================================
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
  ready_for_delivery: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
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
  ready_for_delivery: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  trainers: TrainerUnderPod[]
}

export const getPodLeadStats = async (
  startDate?: string,
  endDate?: string,
  timeframe: string = 'overall'
): Promise<PodLeadStats[]> => {
  const params = new URLSearchParams({ timeframe })
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  
  const response = await apiClient.get<PodLeadStats[]>(`/pod-lead-stats?${params.toString()}`)
  return response.data
}
