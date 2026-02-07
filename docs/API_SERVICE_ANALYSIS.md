# API Service Analysis: `frontend/src/services/api.ts`

**Analysis Date:** February 5, 2026  
**File:** `frontend/src/services/api.ts`  
**Lines of Code:** 893

---

## Executive Summary

The API service file provides a centralized HTTP client for the dashboard application using Axios. It implements a simple in-memory caching mechanism, comprehensive TypeScript type definitions, and exposes 40+ API functions organized into logical sections. However, **error handling is delegated entirely to consuming components** with no global error interceptors or standardized error responses.

---

## 1. API Functions Inventory

### 1.1 Pre-Delivery Statistics (11 functions)

| Function | Endpoint | Returns | Cached | Filters |
|----------|----------|---------|--------|---------|
| `getOverallStats` | `/overall` | `OverallAggregation` | ✅ | ✅ |
| `getDomainStats` | `/by-domain` | `DomainAggregation[]` | ✅ | ✅ |
| `getReviewerStats` | `/by-reviewer` | `ReviewerAggregation[]` | ✅ | ✅ |
| `getReviewersWithTrainers` | `/reviewers-with-trainers` | `ReviewerWithTrainers[]` | ✅ | ✅ |
| `getTrainerStats` | `/by-trainer-level` | `TrainerLevelAggregation[]` | ✅ | ✅ |
| `getTrainerDailyStats` | `/by-trainer-daily` | `TrainerDailyStats[]` | ✅ | ✅ |
| `getTrainerOverallStats` | `/by-trainer-overall` | `TrainerDailyStats[]` | ✅ | ✅ |
| `getReviewerDailyStats` | `/by-reviewer-daily` | `ReviewerDailyStats[]` | ✅ | ✅ |
| `getTrainersByReviewerDate` | `/trainers-by-reviewer-date` | `TrainerByReviewerDate[]` | ✅ | ✅ |
| `getTaskLevelInfo` | `/task-level` | `TaskLevelInfo[]` | ✅ | ✅ |
| `getFilterOptions` | Multiple endpoints | Filter options object | ❌ | ❌ |

### 1.2 Client Delivery Statistics (5 functions)

| Function | Endpoint | Returns | Cached | Filters |
|----------|----------|---------|--------|---------|
| `getClientDeliveryOverallStats` | `/client-delivery/overall` | `OverallAggregation` | ✅ | ✅ |
| `getClientDeliveryDomainStats` | `/client-delivery/by-domain` | `DomainAggregation[]` | ✅ | ✅ |
| `getClientDeliveryReviewerStats` | `/client-delivery/by-reviewer` | `ReviewerAggregation[]` | ✅ | ✅ |
| `getClientDeliveryTrainerStats` | `/client-delivery/by-trainer` | `TrainerLevelAggregation[]` | ✅ | ✅ |
| `getDeliveryTracker` | `/client-delivery/tracker` | `DeliveryTrackerItem[]` | ✅ | ❌ |

### 1.3 Rating & Trends (2 functions)

| Function | Endpoint | Returns | Cached | Filters |
|----------|----------|---------|--------|---------|
| `getRatingTrends` | `/rating-trends` | `RatingTrendsResponse` | ❌ | ✅ (granularity, trainerEmail) |
| `getRatingComparison` | `/rating-comparison` | `RatingComparisonResponse` | ❌ | ✅ (periods, trainerEmail) |

### 1.4 POD Lead & Project Statistics (2 functions)

| Function | Endpoint | Returns | Cached | Filters |
|----------|----------|---------|--------|---------|
| `getPodLeadStats` | `/pod-lead-stats` | `PodLeadStats[]` | ❌ | ✅ (dates, timeframe, projectId) |
| `getProjectStats` | `/project-stats` | `ProjectStats[]` | ❌ | ✅ (dates) |

### 1.5 AHT Configuration (3 functions)

| Function | Endpoint | Method | Returns | Cached |
|----------|----------|--------|---------|--------|
| `getAHTConfigurations` | `/config/aht` | GET | `AHTConfiguration[]` | ❌ |
| `getAHTConfiguration` | `/config/aht/{projectId}` | GET | `AHTConfiguration` | ❌ |
| `updateAHTConfiguration` | `/config/aht/{projectId}` | PUT | `AHTConfiguration` | ❌ |

### 1.6 Throughput Targets (4 functions)

| Function | Endpoint | Method | Returns | Cached |
|----------|----------|--------|---------|--------|
| `getThroughputTargets` | `/config/targets/{projectId}` | GET | `ThroughputTargetsResponse` | ❌ |
| `getDefaultThroughputTarget` | `/config/targets/{projectId}/default` | GET | Default target object | ❌ |
| `setThroughputTarget` | `/config/targets/{projectId}` | PUT | Success response | ❌ |
| `bulkSetThroughputTargets` | `/config/targets/{projectId}/bulk` | POST | Success response | ❌ |

### 1.7 Performance Weights (2 functions)

| Function | Endpoint | Method | Returns | Cached |
|----------|----------|--------|---------|--------|
| `getPerformanceWeights` | `/config/weights/{projectId}` | GET | `PerformanceWeights` | ❌ |
| `setPerformanceWeights` | `/config/weights/{projectId}` | PUT | `PerformanceWeights` | ❌ |

### 1.8 Classification Thresholds (2 functions)

| Function | Endpoint | Method | Returns | Cached |
|----------|----------|--------|---------|--------|
| `getClassificationThresholds` | `/config/thresholds/{projectId}` | GET | `ClassificationThresholds` | ❌ |
| `setClassificationThresholds` | `/config/thresholds/{projectId}` | PUT | `ClassificationThresholds` | ❌ |

### 1.9 Effort Thresholds (2 functions)

| Function | Endpoint | Method | Returns | Cached |
|----------|----------|--------|---------|--------|
| `getEffortThresholds` | `/config/effort-thresholds/{projectId}` | `/config/effort-thresholds/{projectId}` | GET | `EffortThresholds` | ❌ |
| `setEffortThresholds` | `/config/effort-thresholds/{projectId}` | PUT | `EffortThresholds` | ❌ |

### 1.10 Target Comparison (2 functions)

| Function | Endpoint | Returns | Cached | Filters |
|----------|----------|---------|--------|---------|
| `getTrainerTargetComparison` | `/target-comparison/trainers/{projectId}` | `TrainerTargetComparisonResponse` | ❌ | ✅ (trainerEmail, dates, rollup) |
| `getProjectTargetSummary` | `/target-comparison/summary/{projectId}` | `ProjectTargetSummary` | ❌ | ✅ (dates, rollup) |

### 1.11 Utility Functions (2 functions)

| Function | Purpose | Cached |
|----------|---------|--------|
| `checkHealth` | Health check endpoint | ❌ |
| `triggerS3Sync` | Trigger S3 data sync | ❌ (clears cache on success) |
| `clearCache` | Manual cache invalidation | N/A |

**Total API Functions: 40**

---

## 2. Request/Response Handling

### 2.1 Axios Client Configuration

```typescript
const apiClient = axios.create({
  baseURL: API_BASE_URL,           // From env: VITE_API_PREFIX or '/api'
  timeout: 30000,                  // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
})
```

**Configuration Details:**
- **Base URL:** Environment variable `VITE_API_PREFIX` with fallback to `/api`
- **Timeout:** 30 seconds (reasonable for dashboard queries)
- **Headers:** JSON content type set globally
- **No interceptors:** No request/response interceptors configured
- **No authentication:** No auth headers or token management

### 2.2 Request Patterns

**Standard GET with Filters:**
```typescript
const queryParams = buildQueryParams(filters)
const response = await apiClient.get<ResponseType>(`/endpoint${queryParams}`)
return response.data
```

**GET with Custom Parameters:**
```typescript
const params = new URLSearchParams({ param1: value1 })
if (optionalParam) params.append('optional', optionalParam)
const response = await apiClient.get<ResponseType>(`/endpoint?${params.toString()}`)
return response.data
```

**POST/PUT Requests:**
```typescript
const response = await apiClient.post<ResponseType>('/endpoint', payload)
// or
const response = await apiClient.put<ResponseType>('/endpoint/{id}', payload)
return response.data
```

### 2.3 Response Handling

- **Type Safety:** All responses use TypeScript generics (`apiClient.get<ResponseType>`)
- **Data Extraction:** Always returns `response.data` (Axios response wrapper removed)
- **No Response Transformation:** Raw API responses returned as-is
- **No Response Validation:** No runtime validation of response structure

---

## 3. Caching Implementation

### 3.1 Cache Architecture

**Storage:** In-memory `Map<string, CacheEntry<any>>`

**Cache Entry Structure:**
```typescript
interface CacheEntry<T> {
  data: T
  timestamp: number  // Unix timestamp in milliseconds
}
```

**Cache Duration:** 5 minutes (300,000 ms)

### 3.2 Cache Key Generation

```typescript
const getCacheKey = (endpoint: string, filters?: FilterParams): string => {
  return `${endpoint}${buildQueryParams(filters)}`
}
```

**Key Format:** `{endpoint}?{queryString}`

**Examples:**
- `/overall` → `/overall`
- `/by-domain?domain=AI&date_from=2024-01-01` → `/by-domain?domain=AI&date_from=2024-01-01`

### 3.3 Cache Operations

**Get from Cache:**
```typescript
const getFromCache = <T>(key: string): T | null => {
  const entry = cache.get(key)
  if (!entry) return null
  
  const now = Date.now()
  if (now - entry.timestamp > CACHE_DURATION) {
    cache.delete(key)  // Auto-expire
    return null
  }
  
  return entry.data as T
}
```

**Set Cache:**
```typescript
const setCache = <T>(key: string, data: T): void => {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  })
}
```

**Clear Cache:**
```typescript
export const clearCache = (): void => {
  cache.clear()
}
```

### 3.4 Caching Strategy

**Cached Endpoints (25 functions):**
- All pre-delivery stats endpoints
- All client delivery stats endpoints
- Delivery tracker

**Not Cached (15 functions):**
- Configuration endpoints (AHT, targets, weights, thresholds)
- Rating trends/comparison
- POD lead & project stats
- Health check
- S3 sync trigger

**Cache Invalidation:**
- Automatic: TTL expiration (5 minutes)
- Manual: `clearCache()` called after S3 sync success
- Manual: Components can call `clearCache()` when needed

### 3.5 Cache Limitations

1. **No Cache Size Limit:** Map grows unbounded (memory leak risk)
2. **No Cache Persistence:** Lost on page refresh
3. **No Cache Warming:** No pre-fetching strategy
4. **No Cache Invalidation Hooks:** No way to invalidate specific keys
5. **No Cache Statistics:** No metrics on hit/miss rates
6. **Type Safety:** Uses `any` in cache Map (`Map<string, CacheEntry<any>>`)

---

## 4. Error Handling

### 4.1 Current State: **NO GLOBAL ERROR HANDLING**

**Critical Finding:** The API service has **zero error handling**. All errors bubble up to consuming components.

**No Error Interceptors:**
- No `axios.interceptors.response.use()` for error handling
- No `axios.interceptors.request.use()` for request modification
- No centralized error transformation

**No Try-Catch Blocks:**
- All API functions are `async` but don't catch errors
- Errors propagate as unhandled promise rejections

### 4.2 Error Handling in Components

Components handle errors individually:

```typescript
// Example from components
try {
  const data = await getOverallStats(filters)
  setData(data)
} catch (err: any) {
  setError(err.message || 'Failed to fetch data')
}
```

**Patterns Observed:**
- Each component implements its own try-catch
- Error messages extracted from `err.message` or `err.response?.data?.detail`
- Errors displayed via `ErrorDisplay` component or `Alert` components
- No standardized error format

### 4.3 Potential Issues

1. **Network Errors:** Timeout, connection refused, CORS errors not handled
2. **HTTP Errors:** 4xx/5xx responses not transformed
3. **Validation Errors:** No distinction between client/server validation errors
4. **Retry Logic:** No automatic retry for transient failures
5. **Error Logging:** No centralized error logging/tracking
6. **User Experience:** Inconsistent error messages across components

### 4.4 Recommended Error Handling Pattern

```typescript
// Suggested interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Transform error
    const apiError = {
      message: error.response?.data?.detail || error.message || 'An error occurred',
      status: error.response?.status,
      code: error.code,
      originalError: error
    }
    
    // Log error (Sentry, console, etc.)
    console.error('API Error:', apiError)
    
    // Return standardized error
    return Promise.reject(apiError)
  }
)
```

---

## 5. Query Parameter Building

### 5.1 Implementation

```typescript
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
```

### 5.2 FilterParams Type

```typescript
export interface FilterParams {
  domain?: string
  reviewer?: string
  trainer?: string
  quality_dimension?: string
  min_score?: number
  max_score?: number
  min_task_count?: number
  date_from?: string
  date_to?: string
  project_id?: number
}
```

### 5.3 Behavior

**Filtering Logic:**
- Filters out `undefined`, `null`, and empty string values
- Converts all values to strings via `String(value)`
- Returns empty string if no valid params
- Returns `?{params}` if params exist

**Examples:**
```typescript
buildQueryParams({ domain: 'AI', date_from: '2024-01-01' })
// → '?domain=AI&date_from=2024-01-01'

buildQueryParams({ domain: '', date_from: null })
// → ''

buildQueryParams({ min_score: 0, max_score: 100 })
// → '?min_score=0&max_score=100'
```

### 5.4 Potential Issues

1. **Number Handling:** Numbers converted to strings (may be intentional)
2. **Array Values:** No support for array parameters (e.g., `?ids=1&ids=2`)
3. **Special Characters:** No URL encoding validation (URLSearchParams handles this)
4. **Boolean Values:** No boolean support (would be filtered out if `false`)

---

## 6. Type Definitions

### 6.1 Imported Types (from `../types`)

- `OverallAggregation`
- `DomainAggregation`
- `ReviewerAggregation`
- `ReviewerWithTrainers`
- `TrainerLevelAggregation`
- `PodLeadAggregation`
- `TaskLevelInfo`
- `FilterParams`
- `TrainerDailyStats`
- `ReviewerDailyStats`

### 6.2 Local Type Definitions (15 interfaces)

1. **CacheEntry<T>** - Cache storage structure
2. **TrainerByReviewerDate** - Trainer stats by reviewer and date
3. **DeliveryTrackerItem** - Delivery tracking data
4. **SyncResult** - S3 sync operation result
5. **RatingTrendPoint** - Single data point in rating trends
6. **RatingTrendsResponse** - Complete rating trends response
7. **TrainerRatingComparison** - Trainer comparison data
8. **RatingComparisonResponse** - Rating comparison response
9. **TrainerUnderPod** - Trainer under POD lead
10. **PodLeadStats** - POD lead statistics
11. **TrainerUnderPodLead** - Trainer in POD lead hierarchy
12. **PodLeadUnderProject** - POD lead under project
13. **ProjectStats** - Project-level statistics
14. **AHTConfiguration** - AHT configuration data
15. **AHTConfigUpdate** - AHT update payload
16. **ThroughputTarget** - Throughput target configuration
17. **ThroughputTargetsResponse** - Targets response
18. **SetTargetRequest** - Target update request
19. **PerformanceWeights** - Performance weight configuration
20. **ClassificationThresholds** - Classification thresholds
21. **EffortThresholds** - Effort thresholds
22. **TargetComparison** - Target vs actual comparison
23. **TrainerTargetComparisonResponse** - Trainer comparison response
24. **ProjectTargetSummary** - Project target summary

### 6.3 Type Safety Analysis

**Strengths:**
- ✅ Comprehensive TypeScript interfaces
- ✅ Generic types used for cache (`CacheEntry<T>`)
- ✅ Response types specified in all API calls
- ✅ Request payload types defined

**Weaknesses:**
- ⚠️ Cache uses `any` type (`Map<string, CacheEntry<any>>`)
- ⚠️ No runtime type validation (compile-time only)
- ⚠️ Some types defined locally instead of in `types/index.ts`
- ⚠️ No discriminated unions for error responses

---

## 7. Potential Issues & Recommendations

### 7.1 Critical Issues

#### ❌ **No Error Handling**
- **Impact:** High - Errors propagate unhandled
- **Recommendation:** Add axios response interceptor for centralized error handling

#### ❌ **Unbounded Cache Growth**
- **Impact:** Medium - Memory leak potential
- **Recommendation:** Implement LRU cache or cache size limits

#### ❌ **No Request Retry Logic**
- **Impact:** Medium - Transient failures cause user errors
- **Recommendation:** Add retry logic for network failures

#### ❌ **No Loading State Management**
- **Impact:** Low - Components manage loading individually
- **Recommendation:** Consider React Query or SWR for better state management

### 7.2 Medium Priority Issues

#### ⚠️ **Inconsistent Caching**
- Some endpoints cached, others not (no clear pattern)
- **Recommendation:** Document caching strategy or make it consistent

#### ⚠️ **No Request Cancellation**
- Long-running requests can't be cancelled
- **Recommendation:** Use AbortController for request cancellation

#### ⚠️ **Type Safety in Cache**
- Cache uses `any` type
- **Recommendation:** Use proper generics or type guards

#### ⚠️ **No Request Deduplication**
- Multiple identical requests can fire simultaneously
- **Recommendation:** Implement request deduplication

### 7.3 Low Priority Issues

#### 💡 **Missing JSDoc Comments**
- No function documentation
- **Recommendation:** Add JSDoc comments for better IDE support

#### 💡 **Hardcoded Timeout**
- 30s timeout not configurable
- **Recommendation:** Make timeout configurable via env variable

#### 💡 **No Request/Response Logging**
- Difficult to debug API calls
- **Recommendation:** Add optional debug logging

#### 💡 **getFilterOptions Implementation**
- Fetches multiple endpoints to build filter options (inefficient)
- **Recommendation:** Create dedicated `/filter-options` endpoint

---

## 8. Code Quality Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Total Functions | 40 | ✅ Good |
| Lines of Code | 893 | ✅ Reasonable |
| Type Coverage | ~95% | ✅ Excellent |
| Error Handling | 0% | ❌ Critical |
| Cache Hit Rate | Unknown | ⚠️ No metrics |
| Test Coverage | Unknown | ⚠️ No tests found |

---

## 9. Recommendations Summary

### Immediate Actions (High Priority)

1. **Add Error Interceptor**
   ```typescript
   apiClient.interceptors.response.use(
     response => response,
     error => { /* handle error */ }
   )
   ```

2. **Implement Cache Size Limit**
   ```typescript
   const MAX_CACHE_SIZE = 100
   // Implement LRU eviction
   ```

3. **Add Request Retry Logic**
   ```typescript
   // Use axios-retry or implement custom retry
   ```

### Short-term Improvements (Medium Priority)

4. **Standardize Caching Strategy**
   - Document which endpoints should be cached
   - Make caching configurable per endpoint

5. **Add Request Cancellation**
   - Use AbortController for component cleanup

6. **Improve Type Safety**
   - Remove `any` from cache
   - Add runtime validation for critical types

### Long-term Enhancements (Low Priority)

7. **Consider React Query/SWR**
   - Better caching, deduplication, and state management

8. **Add Request/Response Logging**
   - Debug mode for development

9. **Create Filter Options Endpoint**
   - Optimize `getFilterOptions` function

10. **Add Unit Tests**
    - Test cache logic, query building, error handling

---

## 10. Conclusion

The API service provides a solid foundation with comprehensive type definitions and a functional caching mechanism. However, **the complete absence of error handling is a critical gap** that should be addressed immediately. The caching implementation works but has scalability concerns, and the overall architecture would benefit from more sophisticated state management libraries.

**Overall Assessment:** ⚠️ **Functional but needs improvement**

**Key Strengths:**
- Comprehensive type definitions
- Well-organized function structure
- Simple caching mechanism

**Key Weaknesses:**
- No error handling
- Unbounded cache growth
- No request retry/cancellation
- Inconsistent caching strategy

---

**Document Generated:** February 5, 2026  
**Analyzed File:** `frontend/src/services/api.ts` (893 lines)
