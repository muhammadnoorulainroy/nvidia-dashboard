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
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
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
)
from app.core.async_utils import run_in_thread, shutdown_thread_pool, setup_signal_handlers

# Configure structured logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get settings - validates configuration
try:
    settings = get_settings()
    setup_logging(debug=settings.debug, log_level="DEBUG" if settings.debug else "INFO")
    logger = logging.getLogger(__name__)
    logger.info("Configuration loaded successfully")
    logger.info(settings.log_config_summary())
except Exception as e:
    logger.critical(f"Failed to load configuration: {e}")
    raise SystemExit(1)

# =============================================================================
# Sentry Initialization (Error Tracking)
# =============================================================================
from app.core.sentry import init_sentry, capture_exception

if settings.sentry_dsn:
    sentry_initialized = init_sentry(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        release=f"{settings.app_name}@{settings.app_version}",
        sample_rate=settings.sentry_sample_rate,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        debug=settings.debug
    )
    if sentry_initialized:
        logger.info("Sentry error tracking enabled")
    else:
        logger.warning("Sentry initialization failed - error tracking disabled")
else:
    logger.info("Sentry DSN not configured - error tracking disabled")

# =============================================================================
# Rate Limiting Setup (shared limiter from core module)
# =============================================================================
from app.core.rate_limiting import limiter, initialize_rate_limits

# Initialize rate limits with actual configuration values now that settings are validated
initialize_rate_limits()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for Nvidia Dashboard - Data synced from BigQuery to PostgreSQL",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None
)

# Create scheduler for periodic data sync
scheduler = AsyncIOScheduler()

# Setup signal handlers for graceful Ctrl+C handling
setup_signal_handlers()

# =============================================================================
# Middleware Configuration
# =============================================================================

# Add Prometheus metrics middleware
app.add_middleware(PrometheusMiddleware)

# Add rate limiting middleware

# Custom rate limit exceeded handler that's more robust than slowapi's default
def custom_rate_limit_handler(request: Request, exc: Exception) -> JSONResponse | None:
    """
    Custom rate limit exception handler.
    
    Handles both RateLimitExceeded and other unexpected exceptions during rate limiting.
    This prevents crashes when the rate limiter encounters errors during limit checks.
    
    Note: This must be a sync function for slowapi's internal use.
    """
    if isinstance(exc, RateLimitExceeded):
        detail = getattr(exc, 'detail', str(exc))
        return JSONResponse(
            status_code=429,
            content={"error": f"Rate limit exceeded: {detail}"},
            headers={"Retry-After": "60"}
        )
    else:
        # Handle unexpected exceptions during rate limiting gracefully
        logger.warning(f"Unexpected error in rate limiter: {type(exc).__name__}: {exc}")
        # Return None to let the request proceed without rate limiting
        # rather than returning an error response
        return None

# Set the exception handler on the limiter instance itself
# This is what SlowAPIMiddleware uses internally
limiter._exception_handler = custom_rate_limit_handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Add logging middleware
app.add_middleware(LoggingMiddleware)

# =============================================================================
# Exception Handlers
# =============================================================================
from app.core.exceptions import register_exception_handlers
register_exception_handlers(app)

# =============================================================================
# Monitoring Endpoints
# =============================================================================

@app.get("/metrics", include_in_schema=False)
async def get_metrics(request: Request):
    """Prometheus metrics endpoint."""
    return await metrics_endpoint(request)


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

@app.get("/", response_model=HealthResponse, summary="Root endpoint")
async def root() -> HealthResponse:
    """Root endpoint returning API info"""
    return HealthResponse(status="operational", version=settings.app_version)


@app.get("/health", summary="Simple health check (liveness)")
async def health_liveness():
    """Liveness probe endpoint."""
    checker = get_health_checker()
    return await checker.liveness_check()


@app.get("/health/ready", summary="Readiness check")
async def health_readiness():
    """Readiness probe endpoint."""
    checker = get_health_checker()
    result = await checker.readiness_check()
    if result["status"] != "ready":
        return JSONResponse(status_code=503, content=result)
    return result


@app.get("/health/full", response_model=HealthCheckResponse, summary="Comprehensive health check")
async def health_full() -> HealthCheckResponse:
    """Comprehensive health check endpoint."""
    checker = get_health_checker()
    return await checker.check_all()


# =============================================================================
# Include Routers
# =============================================================================
app.include_router(stats.router, prefix=settings.api_prefix)
app.include_router(jibble.router, prefix=settings.api_prefix)


# =============================================================================
# Application Startup (Resilient)
# =============================================================================
_startup_time = None


@app.on_event("startup")
async def startup_event():
    """Run on application startup with resilient pattern."""
    global _startup_time
    _startup_time = datetime.utcnow()
    
    # Check if running in test mode - skip heavy initialization
    import os
    if os.environ.get("TESTING", "").lower() == "true":
        logger.info("=" * 80)
        logger.info("TESTING MODE: Skipping database and BigQuery initialization")
        logger.info("=" * 80)
        return
    
    logger.info("=" * 80)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 80)
    logger.info(f"BigQuery Project: {settings.gcp_project_id}")
    logger.info(f"BigQuery Dataset: {settings.bigquery_dataset}")
    logger.info(f"Project ID Filter: {settings.project_id_filter}")
    logger.info(f"PostgreSQL Database: {settings.postgres_db}")
    
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
        
        tables = ['task', 'review_detail', 'contributor']
        logger.info("Current table row counts:")
        for table in tables:
            count = db_service.get_table_row_count(table)
            logger.info(f"  - {table}: {count:,} rows")
        update_table_metrics(db_service)
    
    def run_db_init():
        return resilient_startup(
            name="PostgreSQL",
            func=init_database,
            critical=True,
            max_attempts=5,
            wait_seconds=3,
        )
    
    # Run in thread pool to allow Ctrl+C
    db_result = await run_in_thread(run_db_init)
    startup_results.append(db_result)
    
    if not db_result.success:
        logger.critical("CRITICAL: Database initialization failed.")
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
    
    def run_bq_init():
        return resilient_startup(
            name="BigQuery",
            func=init_bigquery,
            critical=False,
            max_attempts=3,
            wait_seconds=5,
        )
    
    # Run in thread pool to allow Ctrl+C
    bq_result = await run_in_thread(run_bq_init)
    startup_results.append(bq_result)
    
    if not bq_result.success:
        logger.warning("BigQuery initialization failed. App will continue in degraded mode.")
    
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
            
            sync_type = 'initial' if task_count == 0 else 'scheduled'
            logger.info(f"Performing {sync_type} sync...")
            
            results = data_sync_service.sync_all_tables(sync_type=sync_type)
            success_count = sum(1 for v in results.values() if v)
            logger.info(f"Sync completed: {success_count}/{len(results)} tables")
            update_table_metrics(db_service)
        
        def run_resilient_sync():
            return resilient_startup(
                name="Initial Data Sync",
                func=perform_initial_sync,
                critical=False,
                max_attempts=2,
                wait_seconds=10,
            )
        
        # Run sync in thread pool (allows Ctrl+C)
        sync_result = await run_in_thread(run_resilient_sync)
        startup_results.append(sync_result)
    else:
        logger.info("Skipping initial sync")
    
    # =========================================================================
    # Step 4: Start Scheduler (NON-CRITICAL)
    # NOTE: Scheduler must run in main thread with event loop, not in thread pool
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STEP 4: Starting Scheduler (Non-Critical)")
    logger.info("=" * 80)
    
    try:
        async def sync_job():
            """Async job for scheduled sync (runs blocking ops in thread pool)."""
            logger.info("Running scheduled data sync...")
            try:
                def _run_sync():
                    data_sync_service = get_data_sync_service()
                    if data_sync_service.bq_client is None:
                        data_sync_service.initialize_bigquery_client()
                    return data_sync_service.sync_all_tables(sync_type='scheduled')
                
                results = await run_in_thread(_run_sync)
                success_count = sum(1 for v in results.values() if v)
                logger.info(f"Sync completed: {success_count}/{len(results)} tables")
                
                def _update_metrics():
                    db_service = get_db_service()
                    update_table_metrics(db_service)
                
                await run_in_thread(_update_metrics)
            except Exception as e:
                logger.error(f"Scheduled sync failed: {e}")
        
        scheduler.add_job(
            sync_job,
            trigger=IntervalTrigger(hours=settings.sync_interval_hours),
            id='data_sync_job',
            name='Periodic Data Sync',
            replace_existing=True
        )
        scheduler.start()
        logger.info(f"Scheduled sync every {settings.sync_interval_hours} hour(s)")
        
        from app.core.resilience import StartupResult
        scheduler_result = StartupResult(name="Scheduler", success=True, critical=False)
    except Exception as e:
        logger.warning(f"Scheduler startup failed: {e}")
        from app.core.resilience import StartupResult
        scheduler_result = StartupResult(name="Scheduler", success=False, error=str(e), critical=False)
    
    startup_results.append(scheduler_result)
    
    # =========================================================================
    # Startup Summary
    # =========================================================================
    logger.info("=" * 80)
    logger.info("STARTUP SUMMARY")
    logger.info("=" * 80)
    
    for result in startup_results:
        if result.success:
            logger.info(f"  [OK] {result.name}")
        elif result.critical:
            logger.error(f"  [FAILED] {result.name}: {result.error}")
        else:
            logger.warning(f"  [DEGRADED] {result.name}: {result.error}")
    
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
    """Graceful shutdown - fast exit, don't wait for long-running tasks."""
    logger.info("=" * 80)
    logger.info(f"Shutting down {settings.app_name}")
    logger.info("=" * 80)
    
    try:
        if scheduler.running:
            # Don't wait for running jobs
            scheduler.shutdown(wait=False)
            logger.info("[OK] Scheduler shut down")
    except Exception as e:
        logger.error(f"[WARN] Scheduler shutdown error: {e}")
    
    try:
        # Don't wait for thread pool - tasks will be cancelled
        shutdown_thread_pool(wait=False)
        logger.info("[OK] Thread pool shut down")
    except Exception as e:
        logger.error(f"[WARN] Thread pool shutdown error: {e}")
    
    try:
        db_service = get_db_service()
        db_service.close()
        logger.info("[OK] Database connections closed")
    except Exception as e:
        logger.error(f"[WARN] Database close error: {e}")
    
    logger.info("Shutdown complete")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
