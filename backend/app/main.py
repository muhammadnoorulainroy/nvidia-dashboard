"""
Main FastAPI application for Nvidia Dashboard

Features:
- Rate limiting
- Structured logging
- Health checks
- Metrics (Prometheus)
- Circuit breakers for resilience
- Graceful startup (doesn't crash on non-critical failures)
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import get_settings
from app.routers import stats, jibble
from app.schemas.response_schemas import HealthResponse, ErrorResponse
from app.services.db_service import get_db_service
from app.services.data_sync_service import get_data_sync_service
from app.core.logging import setup_logging, LoggingMiddleware
from app.core.resilience import (
    CircuitBreakerError,
    resilient_startup,
    get_all_circuit_breaker_stats,
)
from app.core.metrics import (
    PrometheusMiddleware,
    metrics_endpoint,
    set_app_info,
    update_table_metrics,
    APP_UPTIME_SECONDS,
)
from app.core.async_utils import run_in_thread, shutdown_thread_pool

# Configure structured logging (must be done before other imports that use logging)
# Will be reconfigured after settings are loaded
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get settings - this will validate all required environment variables
# and fail fast if configuration is invalid
try:
    settings = get_settings()
    
    # Set up structured logging based on debug mode
    setup_logging(debug=settings.debug, log_level="DEBUG" if settings.debug else "INFO")
    logger = logging.getLogger(__name__)  # Re-get logger after setup
    
    logger.info("Configuration loaded successfully")
    logger.info(settings.log_config_summary())
except Exception as e:
    logger.critical(f"Failed to load configuration: {e}")
    logger.critical("Please check your .env file. See .env.example for required variables.")
    raise SystemExit(1)

# =============================================================================
# Rate Limiting Setup
# =============================================================================
# Create rate limiter with configurable limits
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.rate_limit_requests}/{settings.rate_limit_window}"],
    enabled=settings.rate_limit_enabled,
    headers_enabled=True,  # Add X-RateLimit headers to responses
)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for Nvidia Dashboard - Data synced from BigQuery to PostgreSQL",
    docs_url="/docs" if settings.debug else None,  # Disable docs in production
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None
)

# Create scheduler for periodic data sync
scheduler = AsyncIOScheduler()

# =============================================================================
# Middleware Configuration
# =============================================================================

# Add Prometheus metrics middleware (must be first to capture all requests)
app.add_middleware(PrometheusMiddleware)

# Add rate limiting middleware and state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Configure CORS with explicit origin list (no wildcards in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Add request logging middleware (adds correlation IDs and logs requests)
app.add_middleware(LoggingMiddleware)


# =============================================================================
# Exception Handlers
# =============================================================================
from app.core.exceptions import register_exception_handlers

# Register all exception handlers (circuit breaker, rate limiting, generic)
register_exception_handlers(app)


# =============================================================================
# Metrics Endpoint
# =============================================================================

@app.get("/metrics", include_in_schema=False)
async def get_metrics(request: Request):
    """Prometheus metrics endpoint."""
    return await metrics_endpoint(request)


# =============================================================================
# Circuit Breaker Status Endpoint
# =============================================================================

@app.get("/circuit-breakers", tags=["Monitoring"])
async def get_circuit_breakers():
    """Get status of all circuit breakers."""
    return get_all_circuit_breaker_stats()


# =============================================================================
# Cache Management Endpoints
# =============================================================================
from app.core.cache import get_query_cache, invalidate_stats_cache

@app.get("/cache/stats", tags=["Monitoring"])
async def get_cache_stats():
    """Get cache statistics."""
    cache = get_query_cache()
    return cache.get_stats()


@app.post("/cache/clear", tags=["Monitoring"])
async def clear_cache():
    """Clear all cache entries."""
    invalidate_stats_cache()
    return {"status": "cleared", "message": "Statistics cache invalidated"}


# =============================================================================
# Health Check Endpoints
# =============================================================================
from app.core.health import get_health_checker, HealthCheckResponse

# Root endpoint
@app.get(
    "/",
    response_model=HealthResponse,
    summary="Root endpoint",
    description="Returns basic API information"
)
async def root() -> HealthResponse:
    """Root endpoint returning API info"""
    return HealthResponse(
        status="operational",
        version=settings.app_version
    )


@app.get(
    "/health",
    summary="Simple health check (liveness)",
    description="Simple check if the API is running. Used for liveness probes."
)
async def health_liveness():
    """
    Liveness probe endpoint.
    Returns 200 if the application is running.
    """
    checker = get_health_checker()
    return await checker.liveness_check()


@app.get(
    "/health/ready",
    summary="Readiness check",
    description="Check if the API is ready to serve requests. Used for readiness probes."
)
async def health_readiness():
    """
    Readiness probe endpoint.
    Returns 200 with status=ready if all critical dependencies are available.
    """
    checker = get_health_checker()
    result = await checker.readiness_check()
    
    # Return 503 if not ready
    if result["status"] != "ready":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=result)
    
    return result


@app.get(
    "/health/full",
    response_model=HealthCheckResponse,
    summary="Comprehensive health check",
    description="Detailed health check of all components including PostgreSQL, BigQuery, and scheduler."
)
async def health_full() -> HealthCheckResponse:
    """
    Comprehensive health check endpoint.
    Returns detailed status of all application components.
    """
    checker = get_health_checker()
    return await checker.check_all()


# Include routers
app.include_router(
    stats.router,
    prefix=settings.api_prefix
)

app.include_router(
    jibble.router,
    prefix=settings.api_prefix
)


# =============================================================================
# Application Startup (Resilient)
# =============================================================================

# Track startup time for uptime metrics
_startup_time = None


@app.on_event("startup")
async def startup_event():
    """
    Run on application startup.
    
    Uses resilient startup pattern:
    - Critical failures (database) prevent startup
    - Non-critical failures (BigQuery sync) are logged but don't crash the app
    - App can run in degraded mode and recover when services become available
    """
    global _startup_time
    _startup_time = datetime.utcnow()
    
    logger.info("=" * 80)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 80)
    logger.info(f"BigQuery Project: {settings.gcp_project_id}")
    logger.info(f"BigQuery Dataset: {settings.bigquery_dataset}")
    logger.info(f"Project ID Filter: {settings.project_id_filter}")
    logger.info(f"PostgreSQL Database: {settings.postgres_db}")
    
    # Set application info for metrics
    set_app_info(
        version=settings.app_version,
        environment="development" if settings.debug else "production"
    )
    
    startup_results = []
    
    # =========================================================================
    # Step 1: Initialize Database (CRITICAL)
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STEP 1: Database Initialization (Critical)")
    logger.info("=" * 80)
    
    def init_database():
        db_service = get_db_service()
        if not db_service.initialize():
            raise RuntimeError("Database initialization returned False")
        
        # Log table row counts
        tables = ['task', 'review_detail', 'contributor']
        logger.info("Current table row counts:")
        for table in tables:
            count = db_service.get_table_row_count(table)
            logger.info(f"  - {table}: {count:,} rows")
        
        # Update metrics
        update_table_metrics(db_service)
    
    db_result = resilient_startup(
        name="PostgreSQL",
        func=init_database,
        critical=True,
        max_attempts=5,
        wait_seconds=3,
    )
    startup_results.append(db_result)
    
    if not db_result.success:
        logger.critical("CRITICAL: Database initialization failed. Application cannot start.")
        logger.critical("Please check PostgreSQL connection and try again.")
        raise RuntimeError(f"Database initialization failed: {db_result.error}")
    
    # =========================================================================
    # Step 2: Initialize BigQuery Client (NON-CRITICAL)
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STEP 2: BigQuery Client Initialization (Non-Critical)")
    logger.info("=" * 80)
    
    def init_bigquery():
        data_sync_service = get_data_sync_service()
        data_sync_service.initialize_bigquery_client()
    
    bq_result = resilient_startup(
        name="BigQuery",
        func=init_bigquery,
        critical=False,  # App can start without BigQuery
        max_attempts=3,
        wait_seconds=5,
    )
    startup_results.append(bq_result)
    
    if not bq_result.success:
        logger.warning("BigQuery initialization failed. Data sync will be unavailable until resolved.")
        logger.warning("The application will continue in degraded mode.")
    
    # =========================================================================
    # Step 3: Initial Data Sync (NON-CRITICAL)
    # =========================================================================
    if bq_result.success and settings.initial_sync_on_startup:
        logger.info("=" * 80)
        logger.info("STEP 3: Initial Data Sync (Non-Critical)")
        logger.info("=" * 80)
        
        def perform_initial_sync():
            db_service = get_db_service()
            task_count = db_service.get_table_row_count('task')
            
            data_sync_service = get_data_sync_service()
            
            if task_count == 0:
                logger.info("No data found in database. Performing initial sync...")
                sync_type = 'initial'
            else:
                logger.info(f"Data exists ({task_count:,} tasks). Performing refresh...")
                sync_type = 'scheduled'
            
            results = data_sync_service.sync_all_tables(sync_type=sync_type)
            success_count = sum(1 for v in results.values() if v)
            logger.info(f"Sync completed: {success_count}/{len(results)} tables")
            
            # Update table metrics after sync
            update_table_metrics(db_service)
        
        sync_result = resilient_startup(
            name="Initial Data Sync",
            func=perform_initial_sync,
            critical=False,
            max_attempts=2,
            wait_seconds=10,
        )
        startup_results.append(sync_result)
        
        if not sync_result.success:
            logger.warning("Initial sync failed. Data may be stale. Will retry on scheduled sync.")
    else:
        if not bq_result.success:
            logger.info("Skipping initial sync (BigQuery unavailable)")
        else:
            logger.info("Initial sync on startup is disabled")
    
    # =========================================================================
    # Step 4: Start Scheduler (NON-CRITICAL)
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STEP 4: Starting Scheduler (Non-Critical)")
    logger.info("=" * 80)
    
    def start_scheduler():
        def sync_job():
            """Job function for scheduled data sync with error handling"""
            logger.info("Running scheduled data sync...")
            try:
                data_sync_service = get_data_sync_service()
                
                # Re-initialize BigQuery client if needed
                if data_sync_service.bq_client is None:
                    logger.info("Re-initializing BigQuery client...")
                    data_sync_service.initialize_bigquery_client()
                
                results = data_sync_service.sync_all_tables(sync_type='scheduled')
                success_count = sum(1 for v in results.values() if v)
                logger.info(f"Sync completed: {success_count}/{len(results)} tables synced")
                
                # Update metrics
                db_service = get_db_service()
                update_table_metrics(db_service)
                
            except Exception as e:
                logger.error(f"Scheduled sync failed: {e}")
                # Don't re-raise - let scheduler continue
        
        scheduler.add_job(
            sync_job,
            trigger=IntervalTrigger(hours=settings.sync_interval_hours),
            id='data_sync_job',
            name='Periodic Data Sync from BigQuery to PostgreSQL',
            replace_existing=True
        )
        scheduler.start()
        logger.info(f"Scheduled data sync every {settings.sync_interval_hours} hour(s)")
    
    scheduler_result = resilient_startup(
        name="Scheduler",
        func=start_scheduler,
        critical=False,
        max_attempts=2,
        wait_seconds=2,
    )
    startup_results.append(scheduler_result)
    
    # =========================================================================
    # Startup Summary
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STARTUP SUMMARY")
    logger.info("=" * 80)
    
    critical_failures = [r for r in startup_results if not r.success and r.critical]
    non_critical_failures = [r for r in startup_results if not r.success and not r.critical]
    successes = [r for r in startup_results if r.success]
    
    for result in successes:
        logger.info(f"  [OK] {result.name}")
    
    for result in non_critical_failures:
        logger.warning(f"  [DEGRADED] {result.name}: {result.error}")
    
    for result in critical_failures:
        logger.error(f"  [FAILED] {result.name}: {result.error}")
    
    if non_critical_failures:
        logger.warning(f"Application started in DEGRADED mode ({len(non_critical_failures)} non-critical failures)")
    else:
        logger.info("Application started successfully!")
    
    logger.info("=" * 80)
    logger.info(f"API available at http://{settings.host}:{settings.port}")
    if settings.debug:
        logger.info(f"API documentation at http://{settings.host}:{settings.port}/docs")
    logger.info(f"Metrics at http://{settings.host}:{settings.port}/metrics")
    logger.info("=" * 80)


# =============================================================================
# Application Shutdown (Graceful)
# =============================================================================

@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown - graceful cleanup"""
    logger.info("=" * 80)
    logger.info(f"Shutting down {settings.app_name}")
    logger.info("=" * 80)
    
    # Shutdown scheduler
    try:
        if scheduler.running:
            scheduler.shutdown(wait=True)
            logger.info("[OK] Scheduler shut down")
    except Exception as e:
        logger.error(f"[WARN] Error shutting down scheduler: {e}")
    
    # Shutdown thread pool
    try:
        shutdown_thread_pool()
        logger.info("[OK] Thread pool shut down")
    except Exception as e:
        logger.error(f"[WARN] Error shutting down thread pool: {e}")
    
    # Close database connections
    try:
        db_service = get_db_service()
        db_service.close()
        logger.info("[OK] Database connections closed")
    except Exception as e:
        logger.error(f"[WARN] Error closing database: {e}")
    
    logger.info("Shutdown complete")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
