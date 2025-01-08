"""
Core infrastructure modules for Nvidia Dashboard.

This package contains cross-cutting concerns:
- config: Application configuration management
- logging: Structured logging setup
- metrics: Prometheus metrics
- resilience: Circuit breakers and retry logic
- health: Health check functionality
- cache: Query result caching
- async_utils: Async/sync bridge utilities
- exceptions: Custom exception classes
"""
from app.core.config import Settings, get_settings
from app.core.resilience import (
    CircuitBreaker,
    CircuitBreakerError,
    CircuitState,
    retry_with_backoff,
    async_retry_with_backoff,
    with_fallback,
    async_with_fallback,
    resilient_startup,
    get_circuit_breaker,
    get_all_circuit_breaker_stats,
)
from app.core.logging import (
    setup_logging,
    LoggingMiddleware,
    get_request_id,
    set_request_id,
)
from app.core.metrics import (
    PrometheusMiddleware,
    metrics_endpoint,
    track_db_operation,
    track_sync_operation,
    set_app_info,
    update_table_metrics,
)
from app.core.health import (
    HealthChecker,
    HealthCheckResponse,
    get_health_checker,
)
from app.core.cache import (
    QueryCache,
    get_query_cache,
    cached,
    invalidate_stats_cache,
)
from app.core.async_utils import (
    run_in_thread,
    async_wrap,
    shutdown_thread_pool,
)
from app.core.exceptions import (
    AppException,
    DatabaseException,
    DatabaseConnectionException,
    DatabaseQueryException,
    ExternalServiceException,
    BigQueryException,
    JibbleException,
    SyncException,
    ValidationException,
    NotFoundException,
    ErrorCode,
    ErrorResponse,
)

__all__ = [
    # Config
    "Settings",
    "get_settings",
    # Resilience
    "CircuitBreaker",
    "CircuitBreakerError",
    "CircuitState",
    "retry_with_backoff",
    "async_retry_with_backoff",
    "with_fallback",
    "async_with_fallback",
    "resilient_startup",
    "get_circuit_breaker",
    "get_all_circuit_breaker_stats",
    # Logging
    "setup_logging",
    "LoggingMiddleware",
    "get_request_id",
    "set_request_id",
    # Metrics
    "PrometheusMiddleware",
    "metrics_endpoint",
    "track_db_operation",
    "track_sync_operation",
    "set_app_info",
    "update_table_metrics",
    # Health
    "HealthChecker",
    "HealthCheckResponse",
    "get_health_checker",
    # Cache
    "QueryCache",
    "get_query_cache",
    "cached",
    "invalidate_stats_cache",
    # Async Utils
    "run_in_thread",
    "async_wrap",
    "shutdown_thread_pool",
    # Exceptions
    "AppException",
    "DatabaseException",
    "DatabaseConnectionException",
    "DatabaseQueryException",
    "ExternalServiceException",
    "BigQueryException",
    "JibbleException",
    "SyncException",
    "ValidationException",
    "NotFoundException",
    "ErrorCode",
    "ErrorResponse",
]
