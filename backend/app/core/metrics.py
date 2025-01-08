"""
Metrics and tracing for the Nvidia Dashboard.

Provides Prometheus metrics for:
- HTTP request metrics (count, latency, errors)
- Database operation metrics
- BigQuery sync metrics
- Circuit breaker state
- Application health

Exposes metrics at /metrics endpoint for Prometheus scraping.
"""
import time
import logging
import re
from functools import wraps
from typing import Callable, Optional
from contextlib import contextmanager

from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    Info,
    generate_latest,
    CONTENT_TYPE_LATEST,
    REGISTRY,
)
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# =============================================================================
# Application Info
# =============================================================================

APP_INFO = Info('nvidia_dashboard', 'Application information')


def set_app_info(version: str, environment: str = "production"):
    """Set application information metrics."""
    APP_INFO.info({
        'version': version,
        'environment': environment,
    })


# =============================================================================
# HTTP Request Metrics
# =============================================================================

HTTP_REQUESTS_TOTAL = Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'endpoint', 'status_code']
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
)

HTTP_REQUESTS_IN_PROGRESS = Gauge(
    'http_requests_in_progress',
    'Number of HTTP requests currently in progress',
    ['method', 'endpoint']
)

HTTP_REQUEST_SIZE_BYTES = Histogram(
    'http_request_size_bytes',
    'HTTP request size in bytes',
    ['method', 'endpoint'],
    buckets=(100, 1000, 10000, 100000, 1000000)
)

HTTP_RESPONSE_SIZE_BYTES = Histogram(
    'http_response_size_bytes',
    'HTTP response size in bytes',
    ['method', 'endpoint'],
    buckets=(100, 1000, 10000, 100000, 1000000)
)


# =============================================================================
# Database Metrics
# =============================================================================

DB_OPERATIONS_TOTAL = Counter(
    'db_operations_total',
    'Total database operations',
    ['operation', 'table', 'status']
)

DB_OPERATION_DURATION_SECONDS = Histogram(
    'db_operation_duration_seconds',
    'Database operation duration in seconds',
    ['operation', 'table'],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 5.0)
)

DB_CONNECTION_POOL_SIZE = Gauge(
    'db_connection_pool_size',
    'Database connection pool size'
)

DB_CONNECTION_POOL_AVAILABLE = Gauge(
    'db_connection_pool_available',
    'Available database connections in pool'
)


# =============================================================================
# Data Sync Metrics
# =============================================================================

SYNC_OPERATIONS_TOTAL = Counter(
    'sync_operations_total',
    'Total data sync operations',
    ['sync_type', 'table', 'status']
)

SYNC_DURATION_SECONDS = Histogram(
    'sync_duration_seconds',
    'Data sync duration in seconds',
    ['sync_type', 'table'],
    buckets=(1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0)
)

SYNC_RECORDS_PROCESSED = Counter(
    'sync_records_processed_total',
    'Total records processed during sync',
    ['sync_type', 'table']
)

LAST_SYNC_TIMESTAMP = Gauge(
    'last_sync_timestamp_seconds',
    'Timestamp of last successful sync',
    ['sync_type', 'table']
)


# =============================================================================
# Circuit Breaker Metrics
# =============================================================================

CIRCUIT_BREAKER_STATE = Gauge(
    'circuit_breaker_state',
    'Circuit breaker state (0=closed, 1=half_open, 2=open)',
    ['name']
)

CIRCUIT_BREAKER_FAILURES = Counter(
    'circuit_breaker_failures_total',
    'Total circuit breaker failures',
    ['name']
)

CIRCUIT_BREAKER_CALLS_BLOCKED = Counter(
    'circuit_breaker_calls_blocked_total',
    'Total calls blocked by circuit breaker',
    ['name']
)


# =============================================================================
# Application Health Metrics
# =============================================================================

APP_UPTIME_SECONDS = Gauge(
    'app_uptime_seconds',
    'Application uptime in seconds'
)

TABLE_ROW_COUNT = Gauge(
    'table_row_count',
    'Number of rows in database tables',
    ['table']
)


# =============================================================================
# Helper Functions
# =============================================================================

def normalize_endpoint(path: str) -> str:
    """Normalize endpoint path for metrics labels (replace IDs with placeholders)."""
    # Replace numeric IDs with {id}
    path = re.sub(r'/\d+', '/{id}', path)
    # Replace UUIDs with {uuid}
    path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{uuid}', path)
    return path


@contextmanager
def track_db_operation(operation: str, table: str):
    """
    Context manager to track database operation metrics.
    
    Usage:
        with track_db_operation('select', 'task'):
            result = session.query(Task).all()
    """
    start_time = time.time()
    try:
        yield
        DB_OPERATIONS_TOTAL.labels(operation=operation, table=table, status='success').inc()
    except Exception:
        DB_OPERATIONS_TOTAL.labels(operation=operation, table=table, status='error').inc()
        raise
    finally:
        duration = time.time() - start_time
        DB_OPERATION_DURATION_SECONDS.labels(operation=operation, table=table).observe(duration)


@contextmanager
def track_sync_operation(sync_type: str, table: str):
    """
    Context manager to track sync operation metrics.
    
    Usage:
        with track_sync_operation('scheduled', 'task') as tracker:
            sync_data()
            tracker.record_count(1000)
    """
    class SyncTracker:
        def __init__(self):
            self.record_count = 0
        
        def add_records(self, count: int):
            self.record_count += count
    
    tracker = SyncTracker()
    start_time = time.time()
    
    try:
        yield tracker
        SYNC_OPERATIONS_TOTAL.labels(sync_type=sync_type, table=table, status='success').inc()
        SYNC_RECORDS_PROCESSED.labels(sync_type=sync_type, table=table).inc(tracker.record_count)
        LAST_SYNC_TIMESTAMP.labels(sync_type=sync_type, table=table).set(time.time())
    except Exception:
        SYNC_OPERATIONS_TOTAL.labels(sync_type=sync_type, table=table, status='error').inc()
        raise
    finally:
        duration = time.time() - start_time
        SYNC_DURATION_SECONDS.labels(sync_type=sync_type, table=table).observe(duration)


def track_function(name: Optional[str] = None, track_args: bool = False):
    """
    Decorator to track function execution metrics.
    
    Args:
        name: Custom name for the metric (defaults to function name)
        track_args: Whether to include args in the metric labels
    """
    import asyncio
    
    def decorator(func: Callable) -> Callable:
        metric_name = name or func.__name__
        
        counter = Counter(
            f'function_{metric_name}_total',
            f'Total calls to {metric_name}',
            ['status']
        )
        histogram = Histogram(
            f'function_{metric_name}_duration_seconds',
            f'Duration of {metric_name} in seconds',
            buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0)
        )
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                counter.labels(status='success').inc()
                return result
            except Exception:
                counter.labels(status='error').inc()
                raise
            finally:
                histogram.observe(time.time() - start_time)
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                counter.labels(status='success').inc()
                return result
            except Exception:
                counter.labels(status='error').inc()
                raise
            finally:
                histogram.observe(time.time() - start_time)
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper
    
    return decorator


def update_circuit_breaker_metrics():
    """Update circuit breaker metrics from current state."""
    from app.core.resilience import circuit_breakers, CircuitState
    
    state_map = {
        CircuitState.CLOSED: 0,
        CircuitState.HALF_OPEN: 1,
        CircuitState.OPEN: 2,
    }
    
    for name, cb in circuit_breakers.items():
        CIRCUIT_BREAKER_STATE.labels(name=name).set(state_map.get(cb.state, 0))


def update_table_metrics(db_service):
    """Update table row count metrics."""
    tables = ['task', 'review_detail', 'contributor', 'task_reviewed_info']
    for table in tables:
        try:
            count = db_service.get_table_row_count(table)
            TABLE_ROW_COUNT.labels(table=table).set(count)
        except Exception as e:
            logger.warning(f"Failed to get row count for {table}: {e}")


# =============================================================================
# Metrics Middleware
# =============================================================================

class PrometheusMiddleware(BaseHTTPMiddleware):
    """
    Middleware to collect HTTP request metrics.
    """
    
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = normalize_endpoint(request.url.path)
        
        # Skip metrics endpoint itself
        if path == '/metrics':
            return await call_next(request)
        
        # Track request in progress
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=path).inc()
        
        # Track request size
        content_length = request.headers.get('content-length', 0)
        if content_length:
            HTTP_REQUEST_SIZE_BYTES.labels(method=method, endpoint=path).observe(int(content_length))
        
        start_time = time.time()
        status_code = 500
        
        try:
            response = await call_next(request)
            status_code = response.status_code
            
            # Track response size
            response_size = response.headers.get('content-length', 0)
            if response_size:
                HTTP_RESPONSE_SIZE_BYTES.labels(method=method, endpoint=path).observe(int(response_size))
            
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            # Record metrics
            duration = time.time() - start_time
            HTTP_REQUESTS_TOTAL.labels(method=method, endpoint=path, status_code=str(status_code)).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(method=method, endpoint=path).observe(duration)
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=path).dec()


# =============================================================================
# Metrics Endpoint
# =============================================================================

async def metrics_endpoint(request: Request) -> Response:
    """
    Prometheus metrics endpoint.
    
    Returns metrics in Prometheus text format.
    """
    # Update dynamic metrics before returning
    update_circuit_breaker_metrics()
    
    return Response(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST
    )
