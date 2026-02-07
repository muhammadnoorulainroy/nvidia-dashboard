# API Analysis Report

**Generated:** 2026-02-05  
**Scope:** Backend API routers and schemas

---

## Table of Contents
1. [API Endpoints Summary](#api-endpoints-summary)
2. [Request Schemas](#request-schemas)
3. [Response Schemas](#response-schemas)
4. [Validation Rules](#validation-rules)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Security Analysis](#security-analysis)
7. [Edge Cases & Potential Issues](#edge-cases--potential-issues)

---

## API Endpoints Summary

### Stats Router (`/stats`)

#### GET Endpoints

| Endpoint | Method | Response Model | Description |
|----------|--------|----------------|-------------|
| `/by-domain` | GET | `List[DomainAggregation]` | Get statistics aggregated by domain |
| `/by-reviewer` | GET | `List[ReviewerAggregation]` | Get statistics aggregated by reviewer |
| `/reviewers-with-trainers` | GET | `List[ReviewerWithTrainers]` | Get reviewers with nested trainers |
| `/by-trainer-level` | GET | `List[TrainerLevelAggregation]` | Get statistics aggregated by trainer level |
| `/by-trainer-daily` | GET | `Dict[str, Any]` | Get trainer statistics at date level |
| `/by-trainer-overall` | GET | `Dict[str, Any]` | Get overall trainer statistics |
| `/by-reviewer-daily` | GET | `Dict[str, Any]` | Get reviewer statistics at date level |
| `/trainers-by-reviewer-date` | GET | `Dict[str, Any]` | Get trainers reviewed by each reviewer per date |
| `/by-pod-lead` | GET | `List[PodLeadAggregation]` | Get statistics aggregated by POD Lead |
| `/overall` | GET | `OverallAggregation` | Get overall aggregated statistics |
| `/task-level` | GET | `List[TaskLevelInfo]` | Get task-level information |
| `/health` | GET | `Dict[str, Any]` | Check database health |
| `/sync-info` | GET | `Dict[str, Any]` | Get data sync information |
| `/rating-trends` | GET | `Dict[str, Any]` | Get rating trends over time |
| `/rating-comparison` | GET | `Dict[str, Any]` | Compare ratings between two time periods |
| `/pod-lead-stats` | GET | `List[Dict[str, Any]]` | Get POD Lead stats with trainers |
| `/project-stats` | GET | `List[Dict[str, Any]]` | Get Project stats with POD Leads |
| `/target-comparison/trainers/{project_id}` | GET | `Dict[str, Any]` | Get target vs actual comparison for trainers |
| `/target-comparison/summary/{project_id}` | GET | `Dict[str, Any]` | Get project-level target vs actual summary |

#### POST Endpoints

| Endpoint | Method | Request Body | Response Model | Description |
|----------|--------|--------------|----------------|-------------|
| `/sync` | POST | None | `Dict[str, Any]` | Trigger data synchronization |

---

### Config Router (`/config`)

#### GET Endpoints

| Endpoint | Method | Response Model | Description |
|----------|--------|----------------|-------------|
| `/aht` | GET | `List[AHTConfigResponse]` | Get all AHT configurations |
| `/aht/{project_id}` | GET | `AHTConfigResponse` | Get AHT configuration for a project |
| `/targets/{project_id}` | GET | `Dict[str, Any]` | Get all throughput targets for a project |
| `/targets/{project_id}/default` | GET | `Dict[str, Any]` | Get default throughput target |
| `/weights/{project_id}` | GET | `PerformanceWeightsResponse` | Get performance scoring weights |
| `/thresholds/{project_id}` | GET | `ClassificationThresholdsResponse` | Get A/B/C classification thresholds |
| `/effort-thresholds/{project_id}` | GET | `EffortThresholdsResponse` | Get effort variance thresholds |
| `/generic/{project_id}/{config_type}` | GET | `Dict[str, Any]` | Get generic configuration |

#### POST Endpoints

| Endpoint | Method | Request Body | Response Model | Description |
|----------|--------|--------------|----------------|-------------|
| `/aht` | POST | `AHTConfigCreate` | `AHTConfigResponse` | Create AHT configuration |
| `/targets/{project_id}/bulk` | POST | `List[Dict[str, Any]]` | `Dict[str, Any]` | Bulk set throughput targets |

#### PUT Endpoints

| Endpoint | Method | Request Body | Response Model | Description |
|----------|--------|--------------|----------------|-------------|
| `/aht/{project_id}` | PUT | `AHTConfigUpdate` | `AHTConfigResponse` | Update AHT configuration |
| `/targets/{project_id}` | PUT | `ThroughputTargetRequest` | `Dict[str, Any]` | Set throughput target |
| `/weights/{project_id}` | PUT | `PerformanceWeightsRequest` | `PerformanceWeightsResponse` | Set performance weights |
| `/thresholds/{project_id}` | PUT | `ClassificationThresholdsRequest` | `ClassificationThresholdsResponse` | Set classification thresholds |
| `/effort-thresholds/{project_id}` | PUT | `EffortThresholdsRequest` | `EffortThresholdsResponse` | Set effort thresholds |
| `/generic/{project_id}/{config_type}` | PUT | `ConfigValueModel` | `Dict[str, Any]` | Set generic configuration |

---

### Jibble Router (`/jibble`)

#### GET Endpoints

| Endpoint | Method | Response Model | Description |
|----------|--------|----------------|-------------|
| `/test` | GET | `JibbleTestResponse` | Test Jibble API connection |
| `/trainer-hours` | GET | `List[TrainerHoursEntry]` | Get daily hours for all trainers |
| `/trainer-hours-summary` | GET | `List[TrainerHoursSummary]` | Get aggregated hours per trainer |

#### POST Endpoints

| Endpoint | Method | Request Body | Response Model | Description |
|----------|--------|--------------|----------------|-------------|
| `/sync` | POST | None | `JibbleSyncResponse` | Sync all Jibble data |

---

## Request Schemas

### Common Query Parameters

#### `StatsFilterParams`
- **domain**: `Optional[str]` (max_length=255)
- **reviewer**: `Optional[int]` (gt=0) - Validated as positive integer
- **trainer**: `Optional[int]` (gt=0) - Validated as positive integer
- **start_date**: `Optional[str]` (YYYY-MM-DD format)
- **end_date**: `Optional[str]` (YYYY-MM-DD format)
- **Validation**: Date range validation (start_date <= end_date)

#### `PaginationParams`
- **page**: `int` (ge=1, le=10000, default=1)
- **page_size**: `int` (ge=1, le=500, default=50)
- **Properties**: `offset`, `limit` (calculated)

#### `TimeframeParams`
- **timeframe**: `Literal["daily", "weekly", "monthly", "overall"]` (default="overall")

### Specific Request Schemas

#### `AHTConfigUpdate`
- **new_task_aht**: `float` (ge=0.1, le=100)
- **rework_aht**: `float` (ge=0.1, le=100)
- **updated_by**: `Optional[str]`

#### `AHTConfigCreate`
- **project_id**: `int`
- **project_name**: `str`
- **new_task_aht**: `float` (ge=0.1, le=100, default=10.0)
- **rework_aht**: `float` (ge=0.1, le=100, default=4.0)

#### `ThroughputTargetRequest`
- **target**: `float` (ge=0.1, le=100)
- **entity_type**: `str` (default="trainer")
- **entity_id**: `Optional[int]`
- **entity_email**: `Optional[str]`
- **updated_by**: `Optional[str]`
- **config_key**: `Optional[str]`

#### `PerformanceWeightsRequest`
- **throughput**: `float` (ge=0, le=100)
- **avg_rating**: `float` (ge=0, le=100)
- **rating_change**: `float` (ge=0, le=100)
- **rework_rate**: `float` (ge=0, le=100)
- **delivered**: `float` (ge=0, le=100)
- **Validation**: Must sum to 100 (±0.01 tolerance)

#### `ClassificationThresholdsRequest`
- **a_min_score**: `float` (ge=0, le=100)
- **b_min_score**: `float` (ge=0, le=100)
- **updated_by**: `Optional[str]`
- **Validation**: A threshold must be > B threshold

#### `EffortThresholdsRequest`
- **over_threshold**: `float` (ge=0, le=100)
- **under_threshold**: `float` (ge=-100, le=0)
- **updated_by**: `Optional[str]`

#### `SyncRequest`
- **sync_type**: `Literal["full", "incremental"]` (default="incremental")
- **tables**: `Optional[List[str]]`
- **Validation**: Tables must be from valid list

---

## Response Schemas

### Aggregation Schemas

#### `DomainAggregation`
- domain, task_count, average_task_score, total_rework_count, average_rework_count, quality_dimensions

#### `ReviewerAggregation`
- reviewer_id, reviewer_name, reviewer_email, task_count, average_task_score, total_rework_count, average_rework_count, quality_dimensions

#### `TrainerLevelAggregation`
- trainer_id, trainer_name, trainer_email, task_count, average_task_score, total_rework_count, average_rework_count, average_completion_time_hours, avg_aht_minutes, total_aht_minutes, aht_task_count, new_tasks_submitted, rework_submitted, total_unique_tasks, first_submission_date, last_submission_date, quality_dimensions

#### `PodLeadAggregation`
- pod_lead_id, pod_lead_name, pod_lead_email, task_count, reviewer_count, average_task_score, total_rework_count, average_rework_count, quality_dimensions, reviewers (nested)

#### `OverallAggregation`
- task_count, reviewer_count, trainer_count, domain_count, average_task_score, total_rework_count, average_rework_count, average_completion_time_hours, quality_dimensions

#### `TaskLevelInfo`
- task_id, task_score, annotator_id, annotator_name, annotator_email, reviewer_id, reviewer_name, reviewer_email, colab_link, updated_at, week_number, rework_count, duration_minutes, quality_dimensions

### Configuration Response Schemas

#### `AHTConfigResponse`
- id, project_id, project_name, new_task_aht, rework_aht, created_at, updated_at, updated_by

#### `PerformanceWeightsResponse`
- project_id, throughput, avg_rating, rating_change, rework_rate, delivered, updated_at, updated_by

#### `ClassificationThresholdsResponse`
- project_id, A (dict), B (dict), C (dict), updated_at, updated_by

#### `EffortThresholdsResponse`
- project_id, over_threshold, under_threshold, updated_at, updated_by

### Jibble Response Schemas

#### `JibbleTestResponse`
- success, message, has_token, sample_people

#### `JibbleSyncResponse`
- success, people_synced, time_entries_synced, month_synced, error

#### `TrainerHoursEntry`
- trainer_email, trainer_name, date, hours, pod_lead, status

#### `TrainerHoursSummary`
- trainer_email, trainer_name, total_hours, pod_lead, status, daily_hours

---

## Validation Rules

### Date Validation
- **Format**: YYYY-MM-DD (regex: `^\d{4}-\d{2}-\d{2}$`)
- **Range**: start_date must be <= end_date
- **Implementation**: `validate_date_format()` helper function
- **Edge Cases**: Handles None, datetime objects, and string dates

### Integer Parameter Validation
- **Positive integers only**: gt=0 constraint
- **String conversion**: Accepts string integers and converts to int
- **Validation**: `validate_integer_param()` helper function
- **Error**: Raises ValidationError if invalid

### Project ID Validation
- **Valid IDs**: [36, 37, 38, 39]
- **Implementation**: `validate_project_id()` helper function
- **Used in**: PodLeadStatsQuery, target-comparison endpoints

### Timeframe Validation
- **Valid values**: ["daily", "weekly", "monthly", "overall"]
- **Implementation**: `validate_timeframe()` helper function

### Domain Validation
- **Max length**: 255 characters
- **Min length**: 1 character (when provided)

### Email Validation
- **Max length**: 255 characters
- **Note**: No explicit email format validation in schemas

### AHT Validation
- **Range**: 0.1 to 100 hours
- **Type**: float

### Performance Weights Validation
- **Range**: 0 to 100 per weight
- **Sum constraint**: Must sum to 100 (±0.01 tolerance)
- **Validation**: Custom validator in endpoint

### Classification Thresholds Validation
- **Range**: 0 to 100
- **Constraint**: A threshold > B threshold
- **Validation**: Custom validator in endpoint

### Sort Field Validation
- **Pattern**: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- **Max length**: 50 characters
- **Prevents**: SQL injection via sort fields

### Table Name Validation (SyncRequest)
- **Valid tables**: ["task", "review_detail", "contributor", "task_reviewed_info", "task_aht", "contributor_task_stats", "contributor_daily_stats", "reviewer_daily_stats", "task_raw", "task_history_raw", "pod_lead_mapping", "jibble_hours"]
- **Validation**: Field validator checks against whitelist

---

## Error Handling Patterns

### Exception Hierarchy

```
AppException (base)
├── DatabaseException
│   ├── DatabaseConnectionException
│   └── DatabaseQueryException
├── ExternalServiceException
│   ├── BigQueryException
│   └── JibbleException
├── SyncException
├── ValidationException (ValidationError)
├── NotFoundException
└── ServiceError
```

### Error Response Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "detail": "Additional details",
  "request_id": "correlation-id",
  "timestamp": "2024-01-22T12:00:00Z",
  "path": "/api/stats"
}
```

### Error Codes

- `INTERNAL_ERROR`: Generic server errors
- `VALIDATION_ERROR`: Input validation failures (400)
- `NOT_FOUND`: Resource not found (404)
- `DATABASE_ERROR`: Database operation failures
- `DATABASE_CONNECTION_ERROR`: Connection issues
- `DATABASE_QUERY_ERROR`: Query execution failures
- `BIGQUERY_ERROR`: BigQuery service errors
- `JIBBLE_ERROR`: Jibble API errors
- `EXTERNAL_SERVICE_ERROR`: Other external service errors
- `RATE_LIMIT_EXCEEDED`: Rate limiting (429)
- `SERVICE_UNAVAILABLE`: Service unavailable (503)
- `CIRCUIT_BREAKER_OPEN`: Circuit breaker active
- `SYNC_ERROR`: Data sync failures
- `SYNC_IN_PROGRESS`: Sync already running

### Error Handling Patterns by Router

#### Stats Router
- **Pattern**: Mixed error handling
  - Some endpoints use `ValidationError` → re-raised
  - Some use `ServiceError` → converted to HTTPException
  - Some use generic `HTTPException(status_code=500)`
- **Inconsistency**: Not all endpoints use custom exceptions consistently

#### Config Router
- **Pattern**: HTTPException for all errors
- **Status codes**: 400 (validation), 500 (server errors)
- **No custom exceptions**: Uses standard FastAPI HTTPException

#### Jibble Router
- **Pattern**: HTTPException(status_code=500) for all errors
- **No validation**: Date parsing errors not caught explicitly

### Exception Handlers

1. **AppException Handler**: Handles custom application exceptions
2. **HTTPException Handler**: Standardizes FastAPI HTTPException responses
3. **CircuitBreakerError Handler**: Handles circuit breaker open state (503)
4. **RateLimitExceeded Handler**: Handles rate limiting (429)
5. **Generic Exception Handler**: Catches all unhandled exceptions (500)

### Logging

- **Validation errors**: Not logged (log_error=False)
- **4xx errors**: Logged as warnings
- **5xx errors**: Logged as errors with exc_info=True
- **Request ID**: Included in all error responses

---

## Security Analysis

### ✅ Security Strengths

1. **Input Validation**: Comprehensive Pydantic schemas with constraints
2. **SQL Injection Prevention**: Parameterized queries via SQLAlchemy
3. **Sort Field Validation**: Regex validation prevents SQL injection via sort fields
4. **Table Name Whitelist**: Sync endpoint validates table names against whitelist
5. **Integer Validation**: Prevents injection via ID parameters
6. **Date Format Validation**: Prevents malformed date inputs

### ⚠️ Security Concerns

#### 1. **No Authentication/Authorization**
- **Issue**: No authentication middleware or dependency injection
- **Impact**: All endpoints are publicly accessible
- **Risk**: HIGH - Unauthorized access to sensitive data
- **Recommendation**: Implement authentication (JWT, OAuth, API keys)

#### 2. **No Rate Limiting on Most Endpoints**
- **Issue**: Rate limiting commented out in stats router
- **Impact**: Vulnerable to DoS attacks
- **Risk**: MEDIUM - Can overwhelm database/external services
- **Recommendation**: Re-enable rate limiting with proper configuration

#### 3. **Error Message Information Disclosure**
- **Issue**: Some endpoints expose internal error details
- **Example**: `raise HTTPException(status_code=500, detail=f"Error: {str(e)}")`
- **Risk**: MEDIUM - May leak sensitive information
- **Recommendation**: Use generic error messages in production

#### 4. **No Input Sanitization for String Fields**
- **Issue**: Domain, email fields accept any string (within length limits)
- **Risk**: LOW-MEDIUM - Potential for XSS if data displayed in frontend
- **Recommendation**: Add input sanitization or rely on frontend escaping

#### 5. **No CSRF Protection**
- **Issue**: No CSRF tokens for state-changing operations
- **Risk**: MEDIUM - If authentication added, CSRF protection needed
- **Recommendation**: Add CSRF protection for POST/PUT/DELETE endpoints

#### 6. **No Request Size Limits**
- **Issue**: No explicit limits on request body size
- **Risk**: LOW - Potential DoS via large payloads
- **Recommendation**: Configure FastAPI max request size

#### 7. **No Audit Logging**
- **Issue**: Configuration changes don't appear to be audited
- **Risk**: MEDIUM - Cannot track who changed what and when
- **Note**: `updated_by` field exists but may not be enforced

#### 8. **Project ID Validation Inconsistency**
- **Issue**: Some endpoints validate project_id, others don't
- **Risk**: LOW-MEDIUM - Invalid project IDs may cause errors
- **Recommendation**: Consistent validation across all endpoints

#### 9. **Date Parsing Vulnerabilities**
- **Issue**: Jibble router uses `strptime` without try-catch
- **Risk**: LOW - Will raise 500 error on invalid dates
- **Recommendation**: Add explicit date validation

#### 10. **No Input Length Limits on Some Fields**
- **Issue**: `updated_by`, `entity_email` have no max length
- **Risk**: LOW - Potential DoS via extremely long strings
- **Recommendation**: Add max_length constraints

---

## Edge Cases & Potential Issues

### 1. **Inconsistent Error Handling**

**Issue**: Stats router has inconsistent error handling patterns:
- `/by-domain`: Uses `ValidationError` and `ServiceError`
- `/by-reviewer`: Uses generic `HTTPException(status_code=500)`
- `/overall`: Uses generic `HTTPException(status_code=500)`

**Impact**: Different error response formats for similar errors

**Recommendation**: Standardize on custom exceptions

### 2. **Missing Response Models**

**Issue**: Several endpoints return `Dict[str, Any]` instead of typed models:
- `/by-trainer-daily`
- `/by-trainer-overall`
- `/by-reviewer-daily`
- `/trainers-by-reviewer-date`
- `/rating-trends`
- `/rating-comparison`
- `/pod-lead-stats`
- `/project-stats`

**Impact**: No API contract/documentation, harder to validate responses

**Recommendation**: Create proper Pydantic response models

### 3. **Date Validation Edge Cases**

**Issue**: Date validation in helpers vs schemas:
- Helper functions validate dates in some endpoints
- Pydantic validators validate dates in schemas
- Jibble router has no date validation

**Impact**: Inconsistent behavior

**Recommendation**: Use Pydantic validators consistently

### 4. **Integer Parameter String Conversion**

**Issue**: Some endpoints accept string integers (e.g., `reviewer: Optional[str]`) and convert them:
- `/by-domain`: Converts string to int
- `/by-reviewer`: Passes string directly to service

**Impact**: Inconsistent behavior, potential type errors

**Recommendation**: Use consistent type hints and validation

### 5. **Project ID Validation**

**Issue**: Project ID validation only in some endpoints:
- `/pod-lead-stats`: Validates project_id
- `/target-comparison/trainers/{project_id}`: No validation
- `/target-comparison/summary/{project_id}`: No validation

**Impact**: Invalid project IDs may cause errors

**Recommendation**: Add validation to all project_id path parameters

### 6. **Performance Weights Sum Validation**

**Issue**: Validation happens in endpoint, not schema:
- Could be bypassed if schema used elsewhere
- Tolerance of ±0.01 may allow invalid sums

**Recommendation**: Move validation to Pydantic model validator

### 7. **AHT Configuration Defaults**

**Issue**: Default AHT configs created on GET request:
- `/aht` endpoint creates defaults if none exist
- Side effect in GET endpoint (not idempotent)

**Impact**: GET request modifies database state

**Recommendation**: Move initialization to startup or separate endpoint

### 8. **Sync Endpoint Rate Limiting**

**Issue**: Rate limiting commented out:
```python
# Rate limiting disabled - SlowAPI has compatibility issues
# from app.core.rate_limiting import limiter, get_sync_rate_limit
```

**Impact**: No protection against sync abuse

**Recommendation**: Fix SlowAPI compatibility or use alternative rate limiting

### 9. **Bulk Operations**

**Issue**: `/targets/{project_id}/bulk` accepts `List[Dict[str, Any]]`:
- No schema validation for individual targets
- No limit on list size

**Impact**: Potential DoS, invalid data accepted

**Recommendation**: Create proper schema and add size limits

### 10. **Generic Config Endpoint**

**Issue**: `/generic/{project_id}/{config_type}` allows arbitrary config types:
- No validation of config_type
- No validation of config_value structure

**Impact**: Potential for invalid configurations

**Recommendation**: Add config_type whitelist or validation

### 11. **Jibble Date Parsing**

**Issue**: No error handling for date parsing:
```python
start_dt = datetime.strptime(start_date, "%Y-%m-%d")
```

**Impact**: 500 error on invalid date format

**Recommendation**: Add try-catch or use Pydantic validation

### 12. **Missing Pagination**

**Issue**: Many list endpoints don't support pagination:
- `/by-domain`, `/by-reviewer`, `/by-trainer-level`, etc.
- Could return very large datasets

**Impact**: Performance issues, memory consumption

**Recommendation**: Add pagination to all list endpoints

### 13. **No Caching**

**Issue**: No caching headers or caching strategy:
- Repeated requests hit database
- No ETag or Last-Modified headers

**Impact**: Unnecessary database load

**Recommendation**: Add caching for read-heavy endpoints

### 14. **Health Check Endpoint**

**Issue**: `/health` endpoint queries database:
- May fail if database is down
- No circuit breaker check

**Impact**: Health check may not accurately reflect service health

**Recommendation**: Add lightweight health check without DB queries

---

## Recommendations Summary

### Critical (Security)
1. **Implement authentication/authorization**
2. **Re-enable rate limiting**
3. **Sanitize error messages in production**

### High Priority (Functionality)
1. **Standardize error handling** across all routers
2. **Create response models** for all endpoints
3. **Add pagination** to list endpoints
4. **Fix date validation** inconsistencies

### Medium Priority (Quality)
1. **Add input validation** for all string fields
2. **Add request size limits**
3. **Implement audit logging** for config changes
4. **Add caching** for read endpoints

### Low Priority (Polish)
1. **Add API versioning**
2. **Improve OpenAPI documentation**
3. **Add request/response examples**
4. **Add integration tests**

---

## Conclusion

The API has a solid foundation with comprehensive Pydantic schemas and good input validation. However, there are critical security gaps (no authentication) and inconsistencies in error handling that should be addressed. The codebase would benefit from standardization of patterns across routers and better error handling consistency.

**Overall Security Rating**: ⚠️ **MEDIUM RISK** (due to lack of authentication)

**Code Quality Rating**: ✅ **GOOD** (with room for improvement in consistency)
