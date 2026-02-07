# FastAPI Application Analysis

## Overview
This document provides a comprehensive analysis of the FastAPI application setup, including application lifecycle, middleware, schedulers, database initialization, error handling, health checks, caching, resilience patterns, and configuration management.

---

## 1. Application Lifecycle

### 1.1 Startup Sequence (`@app.on_event("startup")`)

The application follows a **resilient startup pattern** with graceful degradation for non-critical components:

#### **Step 1: Configuration Loading** (CRITICAL)
- Loads settings from environment variables via `get_settings()`
- Validates required fields (database credentials, BigQuery settings)
- Sets up structured logging (JSON for production, human-readable for debug)
- **Failure**: Application exits with `SystemExit(1)` if configuration fails

#### **Step 2: Sentry Initialization** (NON-CRITICAL)
- Initializes Sentry error tracking if `SENTRY_DSN` is configured
- Configures integrations: FastAPI, SQLAlchemy, Logging
- **Failure**: Logs warning, continues without error tracking

#### **Step 3: Database Initialization** (CRITICAL)
- Initializes PostgreSQL connection via `get_db_service().initialize()`
- Uses resilient startup pattern: **5 attempts** with **3-second wait** between retries
- Logs table row counts for: `task`, `review_detail`, `contributor`
- Updates Prometheus table metrics
- **Failure**: Application raises `RuntimeError` and exits

#### **Step 4: BigQuery Client Initialization** (NON-CRITICAL)
- Initializes BigQuery client via `get_data_sync_service().initialize_bigquery_client()`
- Uses resilient startup: **3 attempts** with **5-second wait**
- **Failure**: Logs warning, app continues in degraded mode

#### **Step 5: Initial Data Sync** (NON-CRITICAL, conditional)
- Only runs if `INITIAL_SYNC_ON_STARTUP=True` (default: True)
- Performs sync of all BigQuery tables
- Determines sync type: `'initial'` if task table is empty, `'scheduled'` otherwise
- Uses resilient startup: **2 attempts** with **10-second wait**
- Updates table metrics after sync
- **Failure**: Logs warning, app continues

#### **Step 6: Scheduler Startup** (NON-CRITICAL)
- Creates `AsyncIOScheduler` instance
- Registers scheduled jobs (see Scheduler Jobs section)
- Starts scheduler (must run in main event loop)
- **Failure**: Logs warning, app continues without scheduled syncs

### 1.2 Shutdown Sequence (`@app.on_event("shutdown")`)

**Graceful shutdown** - fast exit, doesn't wait for long-running tasks:

1. **Scheduler Shutdown**
   - Calls `scheduler.shutdown(wait=False)` - doesn't wait for running jobs
   - Logs completion status

2. **Thread Pool Shutdown**
   - Calls `shutdown_thread_pool(wait=False)` - cancels pending tasks
   - Logs completion status

3. **Database Connection Closure**
   - Closes all database connections via `db_service.close()`
   - Logs completion status

### 1.3 Test Mode
- If `TESTING=true` environment variable is set, skips all heavy initialization
- Allows fast startup for testing scenarios

---

## 2. Middleware Configuration

Middleware is added in the following order (execution order is reverse):

### 2.1 PrometheusMiddleware
- **Purpose**: Collects HTTP request metrics
- **Metrics Collected**:
  - Request count by method, endpoint, status code
  - Request duration (histogram)
  - Request/response size (bytes)
  - Requests in progress (gauge)
- **Implementation**: `app.core.metrics.PrometheusMiddleware`
- **Skips**: `/metrics` endpoint itself

### 2.2 CORSMiddleware
- **Purpose**: Handles Cross-Origin Resource Sharing
- **Configuration**:
  - **Allowed Origins**: From `CORS_ORIGINS` env var (comma-separated)
  - **Default**: `http://localhost:3001,http://localhost:8001,http://127.0.0.1:3001,http://127.0.0.1:8001`
  - **Credentials**: Enabled (`allow_credentials=True`)
  - **Methods**: `GET, POST, PUT, DELETE, OPTIONS`
  - **Headers**: `Content-Type, Authorization, X-Requested-With, X-Request-ID`
  - **Exposed Headers**: `X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset`
- **Validation**: Rejects `*` wildcard in production mode

### 2.3 LoggingMiddleware
- **Purpose**: Request correlation IDs and request logging
- **Features**:
  - Generates or extracts `X-Request-ID` header
  - Logs request start/complete with timing
  - Adds request ID to response headers
  - Structured logging with method, path, status code, duration, client IP
- **Implementation**: `app.core.logging.LoggingMiddleware`

### 2.4 Rate Limiting Middleware (DISABLED)
- **Status**: Currently disabled due to SlowAPI compatibility issues
- **Note**: Can be re-enabled once library is fixed or replaced

---

## 3. Scheduler Setup

### 3.1 Scheduler Type
- **Library**: APScheduler (`AsyncIOScheduler`)
- **Type**: AsyncIO scheduler for async job execution

### 3.2 Scheduled Jobs

#### **Job 1: Periodic Data Sync**
- **ID**: `data_sync_job`
- **Name**: `Periodic Data Sync`
- **Trigger**: `IntervalTrigger(hours=settings.sync_interval_hours)`
- **Default Interval**: 1 hour (configurable via `SYNC_INTERVAL_HOURS`)
- **Function**: `sync_job()`
- **Operations**:
  1. Syncs all BigQuery tables via `sync_all_tables(sync_type='scheduled')`
  2. Re-initializes BigQuery client if needed
  3. Updates Prometheus table metrics
  4. Logs success/failure counts
- **Error Handling**: Catches exceptions, logs errors, continues running

#### **Job 2: Jibble API Sync** (DISABLED)
- **Status**: Disabled - using BigQuery for Jibble data instead
- **Previous Configuration**:
  - Ran hourly
  - Synced email mapping from Google Sheet
  - Synced hours from Jibble API

#### **Job 3: Jibble Project Sync** (DISABLED)
- **Status**: Disabled - using BigQuery for Jibble data instead
- **Previous Configuration**:
  - Ran every 4 hours
  - Used TimeEntries API for project-specific hours

### 3.3 Scheduler Lifecycle
- **Start**: Started during application startup (Step 6)
- **Stop**: Shut down gracefully during shutdown (doesn't wait for running jobs)
- **Monitoring**: Health check endpoint reports scheduler status and job details

---

## 4. Database Initialization

### 4.1 Database Service
- **Service**: `app.services.db_service.get_db_service()`
- **Database**: PostgreSQL
- **Connection**: Managed via SQLAlchemy connection pool

### 4.2 Initialization Process
1. **Connection**: Establishes connection to PostgreSQL
2. **Validation**: Verifies database is accessible
3. **Table Verification**: Checks existence of core tables
4. **Metrics**: Logs row counts for:
   - `task` table
   - `review_detail` table
   - `contributor` table
5. **Prometheus Metrics**: Updates table metrics for monitoring

### 4.3 Resilience
- **Retry Logic**: 5 attempts with 3-second wait between retries
- **Critical**: Failure prevents application startup
- **Error Handling**: Uses `resilient_startup()` wrapper

### 4.4 Connection Pool
- **Monitoring**: Health check endpoint reports pool status
- **Metrics**: Tracks checked-out connections, pool size, utilization
- **Health**: Degraded status if utilization > 90%

---

## 5. Error Handling

### 5.1 Exception Handlers (Registered via `register_exception_handlers()`)

#### **5.1.1 AppException Handler**
- **Exception Type**: `AppException` and subclasses
- **Response**: Standardized error response with status code, error message, error code, detail
- **Status Code**: From exception's `status_code` attribute

#### **5.1.2 HTTPException Handler**
- **Exception Type**: FastAPI `HTTPException`
- **Error Code Mapping**:
  - `400` → `VALIDATION_ERROR`
  - `404` → `NOT_FOUND`
  - `429` → `RATE_LIMIT_EXCEEDED`
  - `503` → `SERVICE_UNAVAILABLE`
  - Default → `INTERNAL_ERROR`
- **Response**: Standardized error response

#### **5.1.3 CircuitBreakerError Handler**
- **Exception Type**: `CircuitBreakerError`
- **Status Code**: `503 Service Unavailable`
- **Error Code**: `CIRCUIT_BREAKER_OPEN`
- **Message**: "Service temporarily unavailable"
- **Detail**: Includes circuit breaker name and retry after time

#### **5.1.4 RateLimitExceeded Handler**
- **Exception Type**: `RateLimitExceeded` (SlowAPI)
- **Status Code**: `429 Too Many Requests`
- **Error Code**: `RATE_LIMIT_EXCEEDED`
- **Message**: "Rate limit exceeded"
- **Note**: Currently disabled (rate limiting middleware disabled)

#### **5.1.5 Generic Exception Handler**
- **Exception Type**: `Exception` (catch-all)
- **Status Code**: `500 Internal Server Error`
- **Error Code**: `INTERNAL_ERROR`
- **Message**: "An unexpected error occurred"
- **Detail**: Only includes exception details in debug mode (production hides details)
- **Logging**: Logs full exception with request context

### 5.2 Error Response Format
All errors follow standardized format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "detail": "Additional details (optional)",
  "request_id": "correlation-id"
}
```

### 5.3 Sentry Integration
- **Error Tracking**: Captures exceptions automatically (if configured)
- **Filtering**: Skips validation errors, rate limit errors
- **Privacy**: Filters sensitive data (passwords, tokens, API keys)
- **Context**: Adds request context, user context, breadcrumbs

---

## 6. Health Checks Implementation

### 6.1 Health Check Endpoints

#### **6.1.1 Root Endpoint (`/`)**
- **Type**: Simple health response
- **Response Model**: `HealthResponse`
- **Returns**: `{"status": "operational", "version": "<app_version>"}`

#### **6.1.2 Liveness Check (`/health`)**
- **Purpose**: Kubernetes liveness probe
- **Response**: `{"status": "alive", "timestamp": "<ISO8601>"}`
- **Always Returns**: 200 OK (application is running)

#### **6.1.3 Readiness Check (`/health/ready`)**
- **Purpose**: Kubernetes readiness probe
- **Checks**: PostgreSQL connectivity (critical dependency)
- **Response**:
  - `200 OK` if ready: `{"status": "ready", "timestamp": "...", "checks": {...}}`
  - `503 Service Unavailable` if not ready: Same format with `"status": "not_ready"`

#### **6.1.4 Full Health Check (`/health/full`)**
- **Purpose**: Comprehensive health check
- **Response Model**: `HealthCheckResponse`
- **Checks All Components**:
  1. **PostgreSQL**: Connectivity, latency, table counts
  2. **BigQuery**: Client initialization status
  3. **Scheduler**: Running status, job details
  4. **Cache**: Hit rate, statistics
  5. **Connection Pool**: Utilization, pool status

### 6.2 Health Status Values
- **HEALTHY**: Component is functioning normally
- **DEGRADED**: Component has issues but is partially functional
- **UNHEALTHY**: Component is not functioning

### 6.3 Overall Status Logic
- **UNHEALTHY**: If any critical component (PostgreSQL) is unhealthy
- **DEGRADED**: If any non-critical component is unhealthy or degraded
- **HEALTHY**: All components are healthy

### 6.4 Component Health Details

#### **PostgreSQL Health**
- **Checks**: Database connectivity via `SELECT 1` query
- **Metrics**: Latency (ms), table row counts
- **Details**: Host, database name, task count

#### **BigQuery Health**
- **Checks**: Client initialization status
- **Details**: Project ID, dataset name
- **Note**: Lightweight check (doesn't execute queries)

#### **Scheduler Health**
- **Checks**: Scheduler running status
- **Details**: Job count, job IDs, names, next run times

#### **Cache Health**
- **Checks**: Cache statistics
- **Details**: Size, hit rate, evictions, invalidations, last invalidation time

#### **Connection Pool Health**
- **Checks**: Pool utilization
- **Details**: Pool size, checked-out connections, utilization percentage
- **Degraded**: If utilization > 90%

---

## 7. Cache Implementation

### 7.1 Cache Type
- **Implementation**: In-memory thread-safe cache (`QueryCache`)
- **Strategy**: **Event-driven** (not time-driven)
- **Invalidation**: Cache is invalidated ONLY when data sync completes
- **Safety TTL**: 24 hours (fallback if sync fails repeatedly)

### 7.2 Cache Features

#### **7.2.1 Cache Entry**
- **Properties**:
  - `value`: Cached value
  - `created_at`: Timestamp of creation
  - `ttl_seconds`: Time-to-live (default: 24 hours)
  - `hits`: Number of times accessed
- **Expiration**: Checks against safety TTL

#### **7.2.2 Cache Operations**
- **Get**: Returns cached value if exists and not expired
- **Set**: Stores value with optional TTL
- **Delete**: Removes specific key
- **Clear**: Removes all entries (called after sync)
- **Clear Prefix**: Removes entries matching prefix

#### **7.2.3 Eviction Policy**
- **Type**: LRU (Least Recently Used)
- **Trigger**: When cache reaches `max_size` (default: 1000 entries)
- **Method**: Evicts oldest entry by `created_at` timestamp

### 7.3 Cache Decorator (`@cached`)
- **Usage**: Decorator for function result caching
- **Key Generation**: From function name and arguments
- **Key Hashing**: MD5 hash for keys > 200 characters
- **Prefix**: Uses function name or custom prefix
- **Custom Key Builder**: Optional custom function for key generation

### 7.4 Cache Statistics
- **Size**: Current number of entries
- **Max Size**: Maximum capacity
- **Hits**: Number of cache hits
- **Misses**: Number of cache misses
- **Hit Rate**: Percentage of hits vs total requests
- **Evictions**: Number of entries evicted
- **Invalidations**: Number of times cache was cleared
- **Last Invalidation**: Time since last invalidation
- **Strategy**: "event-driven (invalidated on sync)"

### 7.5 Cache Invalidation
- **Manual**: Via `/cache/clear` endpoint
- **Automatic**: After data sync completes
- **Prefix-based**: Can invalidate specific prefixes (e.g., "domain", "reviewer", "trainer")

### 7.6 Cache Endpoints
- **GET `/cache/stats`**: Returns cache statistics
- **POST `/cache/clear`**: Clears all cache entries

---

## 8. Resilience Patterns

### 8.1 Circuit Breaker Pattern

#### **8.1.1 Circuit Breaker States**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service is failing, requests are blocked (fail fast)
- **HALF_OPEN**: Testing if service has recovered

#### **8.1.2 State Transitions**
- **CLOSED → OPEN**: When `failure_threshold` consecutive failures occur
- **OPEN → HALF_OPEN**: After `recovery_timeout` seconds
- **HALF_OPEN → CLOSED**: If `half_open_max_calls` test requests succeed
- **HALF_OPEN → OPEN**: If test request fails

#### **8.1.3 Global Circuit Breakers**
Three circuit breakers are pre-configured:

1. **PostgreSQL Circuit Breaker**
   - **Name**: `postgresql`
   - **Failure Threshold**: 3 failures
   - **Recovery Timeout**: 30 seconds
   - **Half-Open Max Calls**: 3

2. **BigQuery Circuit Breaker**
   - **Name**: `bigquery`
   - **Failure Threshold**: 3 failures
   - **Recovery Timeout**: 60 seconds
   - **Half-Open Max Calls**: 3

3. **Jibble Circuit Breaker**
   - **Name**: `jibble`
   - **Failure Threshold**: 5 failures
   - **Recovery Timeout**: 120 seconds
   - **Half-Open Max Calls**: 3

#### **8.1.4 Circuit Breaker Metrics**
Each circuit breaker tracks:
- **State**: Current state (closed/open/half_open)
- **Failure Count**: Consecutive failures
- **Success Count**: Consecutive successes
- **Total Calls**: Total number of calls
- **Total Failures**: Total failures (all time)
- **Total Blocked**: Requests blocked when circuit was open
- **Last Failure**: Timestamp of last failure

#### **8.1.5 Circuit Breaker Endpoint**
- **GET `/circuit-breakers`**: Returns stats for all circuit breakers

### 8.2 Retry Logic

#### **8.2.1 Retry Decorator (`@retry_with_backoff`)**
- **Library**: Tenacity
- **Strategy**: Exponential backoff
- **Parameters**:
  - `max_attempts`: Maximum retry attempts (default: 3)
  - `min_wait`: Minimum wait time (default: 1 second)
  - `max_wait`: Maximum wait time (default: 10 seconds)
  - `exceptions`: Exception types to retry on
  - `circuit_breaker_name`: Optional circuit breaker integration
- **Backoff**: Exponential with multiplier 1, capped at max_wait

#### **8.2.2 Async Retry Decorator (`@async_retry_with_backoff`)**
- **Version**: Async version of retry decorator
- **Behavior**: Same as sync version but for async functions
- **Circuit Breaker**: Doesn't retry if circuit breaker is open

### 8.3 Graceful Degradation

#### **8.3.1 Fallback Decorator (`@with_fallback`)**
- **Purpose**: Returns fallback value if function fails
- **Parameters**:
  - `fallback_value`: Value to return on failure
  - `log_error`: Whether to log errors (default: True)
- **Usage**: Prevents cascading failures by returning safe defaults

#### **8.3.2 Async Fallback Decorator (`@async_with_fallback`)**
- **Version**: Async version of fallback decorator

### 8.4 Startup Resilience (`resilient_startup()`)
- **Purpose**: Execute startup operations with retries
- **Parameters**:
  - `name`: Operation name
  - `func`: Function to execute
  - `critical`: If True, failure prevents app startup
  - `max_attempts`: Retry attempts (default: 3)
  - `wait_seconds`: Wait between attempts (default: 5)
- **Returns**: `StartupResult` with success status and error message
- **Usage**: Used for database initialization, BigQuery initialization, initial sync

---

## 9. Configuration Management

### 9.1 Configuration Source
- **Library**: Pydantic Settings (`BaseSettings`)
- **Source**: Environment variables or `.env` file
- **Validation**: Pydantic validators
- **Caching**: LRU cache for settings instance

### 9.2 Required Environment Variables (No Defaults)

#### **PostgreSQL Settings**
- `POSTGRES_HOST`: Database hostname (required)
- `POSTGRES_PORT`: Database port (default: 5432)
- `POSTGRES_USER`: Database username (required)
- `POSTGRES_PASSWORD`: Database password (required)
- `POSTGRES_DB`: Database name (required)

#### **BigQuery Settings**
- `GCP_PROJECT_ID`: Google Cloud Project ID (required)
- `BIGQUERY_DATASET`: BigQuery dataset name (required)
- `PROJECT_ID_FILTER`: Project ID filter (required, project-specific)

#### **Project Settings**
- `PROJECT_START_DATE`: Project start date (required, project-specific)

### 9.3 Optional Environment Variables (With Defaults)

#### **Application Settings**
- `APP_NAME`: Application name (default: "Nvidia Dashboard API")
- `APP_VERSION`: Application version (default: "1.0.0")
- `DEBUG`: Debug mode (default: False)
- `HOST`: Server host (default: "0.0.0.0")
- `PORT`: Server port (default: 8001)

#### **API Settings**
- `API_PREFIX`: API route prefix (default: "/api")
- `CORS_ORIGINS`: Comma-separated allowed origins (default: localhost origins)
- `DEFAULT_PAGE_SIZE`: Default pagination size (default: 100)
- `MAX_PAGE_SIZE`: Maximum pagination size (default: 1000)

#### **Data Sync Settings**
- `SYNC_INTERVAL_HOURS`: Sync interval in hours (default: 1)
- `INITIAL_SYNC_ON_STARTUP`: Perform initial sync (default: True)

#### **BigQuery Table Names**
- `CONVERSATION_TABLE`: Conversation table name (default: "conversation")
- `REVIEW_TABLE`: Review table name (default: "review")

#### **Project Configuration**
- `ALL_PROJECT_IDS`: Comma-separated project IDs (default: "36,37,38,39")
- `PROJECT_NAMES_JSON`: JSON mapping of project IDs to names (default: provided mapping)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to GCP credentials file (optional)

#### **Jibble Settings** (Optional - features disabled if not set)
- `JIBBLE_API_KEY`: Jibble API key (optional)
- `JIBBLE_API_SECRET`: Jibble API secret (optional)
- `JIBBLE_API_URL`: Jibble API URL (default: "https://workspace.prod.jibble.io/v1")
- `JIBBLE_TIME_TRACKING_URL`: Time tracking URL (default: "https://time-tracking.prod.jibble.io/v1")
- `JIBBLE_TIME_ATTENDANCE_URL`: Time attendance URL (default: "https://time-attendance.prod.jibble.io/v1")
- `JIBBLE_PROJECT_NAME`: Jibble project name (optional)
- `JIBBLE_NVIDIA_PROJECT_IDS`: Comma-separated Jibble project UUIDs (default: provided UUIDs)
- `JIBBLE_PROJECT_MAPPING_JSON`: JSON mapping of Jibble project names to dashboard project IDs (default: provided mapping)
- `JIBBLE_EMAIL_MAPPING_SHEET_ID`: Google Sheet ID for email mapping (default: provided ID)
- `JIBBLE_EMAIL_MAPPING_SHEET_GID`: Google Sheet GID (default: provided GID)

#### **Rate Limiting Settings**
- `RATE_LIMIT_ENABLED`: Enable rate limiting (default: True, but middleware disabled)
- `RATE_LIMIT_REQUESTS`: Requests per window (default: 100)
- `RATE_LIMIT_WINDOW`: Time window (default: "minute")
- `RATE_LIMIT_SYNC_REQUESTS`: Sync endpoint requests per window (default: 5)
- `RATE_LIMIT_SYNC_WINDOW`: Sync endpoint time window (default: "minute")

#### **Sentry Settings** (Optional - error tracking disabled if not set)
- `SENTRY_DSN`: Sentry DSN (optional)
- `SENTRY_ENVIRONMENT`: Environment name (default: "development")
- `SENTRY_SAMPLE_RATE`: Error sampling rate (default: 1.0)
- `SENTRY_TRACES_SAMPLE_RATE`: Performance tracing sample rate (default: 0.1)

### 9.4 Configuration Validation

#### **Password Validation**
- **Weak Passwords**: Rejects common defaults (`postgres`, `password`, `admin`, `123456`, `root`, empty)
- **Production**: Raises `ValueError` if weak password detected
- **Debug Mode**: Logs warning but allows weak passwords

#### **CORS Validation**
- **Wildcard Rejection**: Rejects `*` wildcard in production mode
- **Production**: Raises `ValueError` if wildcard detected
- **Debug Mode**: Allows wildcard (with warning)

### 9.5 Configuration Properties

#### **Parsed Properties**
- `cors_origins_list`: List of CORS origins (parsed from comma-separated string)
- `all_project_ids_list`: List of project IDs (parsed from comma-separated string)
- `project_names`: Dictionary mapping project IDs to names (parsed from JSON)
- `jibble_nvidia_project_ids_list`: List of Jibble project UUIDs (parsed from comma-separated string)
- `jibble_project_mapping`: Dictionary mapping Jibble project names to dashboard project IDs (parsed from JSON)

### 9.6 Configuration Summary
- **Method**: `settings.log_config_summary()` returns safe summary (no secrets)
- **Includes**: App name, version, debug mode, host, port, database, BigQuery, CORS, Jibble status, Sentry status

---

## 10. Monitoring Endpoints

### 10.1 Metrics Endpoint
- **Path**: `/metrics`
- **Method**: GET
- **Purpose**: Prometheus metrics scraping
- **Response**: Prometheus text format
- **Schema**: Excluded from OpenAPI schema (`include_in_schema=False`)

### 10.2 Circuit Breakers Endpoint
- **Path**: `/circuit-breakers`
- **Method**: GET
- **Tags**: ["Monitoring"]
- **Purpose**: Get status of all circuit breakers
- **Response**: Dictionary of circuit breaker stats

### 10.3 Cache Endpoints
- **GET `/cache/stats`**: Cache statistics
- **POST `/cache/clear`**: Clear all cache entries
- **Tags**: ["Monitoring"]

---

## 11. Additional Features

### 11.1 Signal Handlers
- **Purpose**: Graceful Ctrl+C handling
- **Implementation**: `setup_signal_handlers()` from `app.core.async_utils`
- **Behavior**: Allows graceful shutdown on SIGINT/SIGTERM

### 11.2 Thread Pool
- **Purpose**: Run blocking operations in thread pool
- **Usage**: Database initialization, BigQuery initialization, sync operations
- **Shutdown**: Gracefully shut down during application shutdown

### 11.3 OpenAPI Documentation
- **Enabled**: Only in debug mode
- **Endpoints**:
  - `/docs`: Swagger UI
  - `/redoc`: ReDoc
  - `/openapi.json`: OpenAPI schema

---

## 12. Summary

### 12.1 Application Lifecycle
- **Startup**: Resilient startup with graceful degradation for non-critical components
- **Shutdown**: Fast graceful shutdown without waiting for long-running tasks
- **Test Mode**: Skips heavy initialization when `TESTING=true`

### 12.2 Middleware Stack
1. PrometheusMiddleware (metrics collection)
2. CORSMiddleware (CORS handling)
3. LoggingMiddleware (request logging and correlation IDs)

### 12.3 Scheduler Jobs
- **Active**: Periodic data sync (configurable interval, default: 1 hour)
- **Disabled**: Jibble API sync jobs (using BigQuery instead)

### 12.4 Health Checks
- **Liveness**: Simple alive check
- **Readiness**: PostgreSQL connectivity check
- **Full**: Comprehensive check of all components

### 12.5 Cache Strategy
- **Type**: Event-driven (invalidated on sync)
- **Safety**: 24-hour TTL fallback
- **Eviction**: LRU when max size reached

### 12.6 Resilience Patterns
- **Circuit Breakers**: PostgreSQL, BigQuery, Jibble
- **Retry Logic**: Exponential backoff with tenacity
- **Graceful Degradation**: Fallback decorators for safe defaults

### 12.7 Configuration
- **Source**: Environment variables / `.env` file
- **Validation**: Pydantic validators with security checks
- **Required**: Database, BigQuery, project settings
- **Optional**: Jibble, Sentry, rate limiting (with defaults)

---

## Appendix: Environment Variables Reference

### Required Variables
```
POSTGRES_HOST=<database_host>
POSTGRES_USER=<database_user>
POSTGRES_PASSWORD=<database_password>
POSTGRES_DB=<database_name>
GCP_PROJECT_ID=<gcp_project_id>
BIGQUERY_DATASET=<bigquery_dataset>
PROJECT_ID_FILTER=<project_id>
PROJECT_START_DATE=<start_date>
```

### Optional Variables (with defaults)
```
APP_NAME=Nvidia Dashboard API
APP_VERSION=1.0.0
DEBUG=False
HOST=0.0.0.0
PORT=8001
API_PREFIX=/api
CORS_ORIGINS=http://localhost:3001,http://localhost:8001,...
SYNC_INTERVAL_HOURS=1
INITIAL_SYNC_ON_STARTUP=True
SENTRY_DSN=<optional>
SENTRY_ENVIRONMENT=development
JIBBLE_API_KEY=<optional>
JIBBLE_API_SECRET=<optional>
```

---

*Document generated: 2026-02-05*
*Application Version: 1.0.0*
