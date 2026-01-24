"""
Main FastAPI application for Nvidia Dashboard
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.routers import stats, s3_ingestion, jibble
from app.schemas.response_schemas import HealthResponse, ErrorResponse
from app.services.db_service import get_db_service
from app.services.data_sync_service import get_data_sync_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for Nvidia Dashboard - Data synced from BigQuery to PostgreSQL",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Create scheduler for periodic data sync
scheduler = AsyncIOScheduler()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc) if settings.debug else "An unexpected error occurred",
            "timestamp": datetime.utcnow().isoformat()
        }
    )


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


# Health check endpoint
@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check if the API is operational"
)
async def health_check() -> HealthResponse:
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version=settings.app_version
    )


# Include routers
app.include_router(
    stats.router,
    prefix=settings.api_prefix
)

app.include_router(
    s3_ingestion.router,
    prefix=settings.api_prefix
)

app.include_router(
    jibble.router,
    prefix=settings.api_prefix
)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"API documentation available at /docs")
    logger.info(f"BigQuery Project: {settings.gcp_project_id}")
    logger.info(f"BigQuery Dataset: {settings.bigquery_dataset}")
    logger.info(f"Project ID Filter: {settings.project_id_filter}")
    logger.info(f"PostgreSQL Database: {settings.postgres_db}")
    
    # Step 1: Initialize database
    logger.info("=" * 80)
    logger.info("STEP 1: Database Initialization")
    logger.info("=" * 80)
    
    try:
        db_service = get_db_service()
        if db_service.initialize():
            logger.info("✓ Database initialized successfully")
            
            # Log table row counts
            tables = [
                'task',
                'review_detail',
                'contributor',
                'work_item'
            ]
            logger.info("Current table row counts:")
            for table in tables:
                count = db_service.get_table_row_count(table)
                logger.info(f"  - {table}: {count:,} rows")
        else:
            logger.error("✗ Failed to initialize database")
            raise RuntimeError("Database initialization failed")
    except Exception as e:
        logger.error(f"✗ Database initialization error: {e}")
        raise
    
    # Step 2: Initialize data sync service and perform initial sync if needed
    logger.info("=" * 80)
    logger.info("STEP 2: Data Synchronization")
    logger.info("=" * 80)
    
    try:
        data_sync_service = get_data_sync_service()
        data_sync_service.initialize_bigquery_client()
        logger.info("✓ BigQuery client initialized")
        
        # Check if initial sync is needed
        if settings.initial_sync_on_startup:
            task_count = db_service.get_table_row_count('task')
            
            if task_count == 0:
                logger.info("No data found in database. Performing initial data sync...")
                logger.info("Syncing CTE results (task, review_detail) from BigQuery...")
                logger.info("This may take several minutes depending on data volume...")
                
                results = data_sync_service.sync_all_tables(sync_type='initial')
                
                success_count = sum(1 for v in results.values() if v)
                logger.info(f"✓ Initial data sync completed: {success_count}/{len(results)} tables synced")
                
                # Log final row counts
                logger.info("Final table row counts after sync:")
                for table in tables:
                    count = db_service.get_table_row_count(table)
                    logger.info(f"  - {table}: {count:,} rows")
            else:
                logger.info(f"Data already exists in database ({task_count:,} task rows)")
                logger.info("Performing data refresh...")
                
                results = data_sync_service.sync_all_tables(sync_type='scheduled')
                
                success_count = sum(1 for v in results.values() if v)
                logger.info(f"✓ Data refresh completed: {success_count}/{len(results)} tables synced")
        else:
            logger.info("Initial sync on startup is disabled")
    except Exception as e:
        logger.error(f"✗ Data sync error: {e}")
        raise
    
    # Step 2.5: S3 Data Ingestion (Initial if empty)
    logger.info("=" * 80)
    logger.info("STEP 2.5: S3 Work Item Ingestion")
    logger.info("=" * 80)
    
    try:
        from app.services.s3_ingestion_service import get_s3_ingestion_service
        
        s3_service = get_s3_ingestion_service()
        work_item_count = db_service.get_table_row_count('work_item')
        
        if work_item_count == 0:
            logger.info("No work items found. Performing initial S3 ingestion...")
            logger.info("This may take a few minutes depending on S3 data volume...")
            
            try:
                result = s3_service.ingest_from_s3()
                logger.info(f"✓ S3 ingestion completed:")
                logger.info(f"  - Files processed: {result['files_processed']}")
                logger.info(f"  - Work items ingested: {result['work_items_ingested']}")
                logger.info(f"  - Duration: {result['duration_seconds']:.2f}s")
                
                if result.get('errors'):
                    logger.warning(f"  - Errors encountered: {len(result['errors'])}")
            except Exception as e:
                logger.warning(f"S3 ingestion failed (can be retried via /api/sync): {e}")
        else:
            logger.info(f"Work item data already exists ({work_item_count:,} rows)")
            logger.info("Skipping initial S3 ingestion (use /api/sync to update)")
    except Exception as e:
        logger.warning(f"S3 ingestion check failed (non-critical): {e}")
    
    # Step 3: Schedule periodic data sync
    logger.info("=" * 80)
    logger.info("STEP 3: Scheduling Periodic Data Sync")
    logger.info("=" * 80)
    
    try:
        def sync_job():
            """Job function for scheduled data sync (BigQuery only)"""
            logger.info("Running scheduled data sync (BigQuery only)...")
            try:
                # Sync BigQuery data
                data_sync_service = get_data_sync_service()
                results = data_sync_service.sync_all_tables(sync_type='scheduled')
                success_count = sum(1 for v in results.values() if v)
                logger.info(f"✓ BigQuery sync completed: {success_count}/{len(results)} tables synced")
                
                # NOTE: S3 ingestion is NOT included in scheduled sync
                # S3 data is only updated via manual sync button (POST /api/sync)
                
            except Exception as e:
                logger.error(f"✗ Scheduled sync failed: {e}")
        
        # Schedule sync job (BigQuery only)
        scheduler.add_job(
            sync_job,
            trigger=IntervalTrigger(hours=settings.sync_interval_hours),
            id='data_sync_job',
            name='Periodic Data Sync from BigQuery to PostgreSQL',
            replace_existing=True
        )
        scheduler.start()
        logger.info(f"✓ Scheduled BigQuery sync every {settings.sync_interval_hours} hour(s)")
        logger.info("  - BigQuery: task, review_detail, contributor")
        logger.info("  - S3: Manual sync only (POST /api/sync)")
    except Exception as e:
        logger.error(f"✗ Scheduler setup error: {e}")
        raise
    
    logger.info("=" * 80)
    logger.info("Application startup completed successfully!")
    logger.info("=" * 80)


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info(f"Shutting down {settings.app_name}")
    
    # Shutdown scheduler
    if scheduler.running:
        scheduler.shutdown()
        logger.info("✓ Scheduler shut down")
    
    # Close database connections
    try:
        db_service = get_db_service()
        db_service.close()
        logger.info("✓ Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
