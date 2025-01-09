"""
Custom exceptions and error handling utilities for the Nvidia Dashboard.

Provides:
- Custom exception classes with error codes
- Error response models
- Exception handlers with correlation IDs
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.logging import get_request_id

logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    """Standard error codes for API responses."""
    # General errors
    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    
    # Database errors
    DATABASE_ERROR = "DATABASE_ERROR"
    DATABASE_CONNECTION_ERROR = "DATABASE_CONNECTION_ERROR"
    DATABASE_QUERY_ERROR = "DATABASE_QUERY_ERROR"
    
    # External service errors
    BIGQUERY_ERROR = "BIGQUERY_ERROR"
    JIBBLE_ERROR = "JIBBLE_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    
    # Rate limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    
    # Circuit breaker
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN"
    
    # Sync errors
    SYNC_ERROR = "SYNC_ERROR"
    SYNC_IN_PROGRESS = "SYNC_IN_PROGRESS"


class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str
    code: str
    detail: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: str
    path: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "Database connection failed",
                "code": "DATABASE_CONNECTION_ERROR",
                "detail": "Could not connect to PostgreSQL",
                "request_id": "abc123",
                "timestamp": "2024-01-22T12:00:00Z",
                "path": "/api/stats"
            }
        }


class AppException(Exception):
    """
    Base exception for application errors.
    
    Includes error code, status code, and supports logging context.
    """
    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        status_code: int = 500,
        detail: Optional[str] = None,
        log_error: bool = True,
        context: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.detail = detail
        self.context = context or {}
        
        if log_error:
            log_context = {
                "error_code": code.value,
                "status_code": status_code,
                **self.context
            }
            if status_code >= 500:
                logger.error(f"{message}", extra=log_context, exc_info=True)
            else:
                logger.warning(f"{message}", extra=log_context)
        
        super().__init__(message)


class DatabaseException(AppException):
    """Database-related errors."""
    def __init__(
        self,
        message: str = "Database error occurred",
        detail: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(
            message=message,
            code=ErrorCode.DATABASE_ERROR,
            status_code=500,
            detail=detail,
            context=context,
        )


class DatabaseConnectionException(DatabaseException):
    """Database connection errors."""
    def __init__(self, detail: Optional[str] = None):
        super().__init__(
            message="Database connection failed",
            detail=detail,
            context={"error_type": "connection"},
        )
        self.code = ErrorCode.DATABASE_CONNECTION_ERROR


class DatabaseQueryException(DatabaseException):
    """Database query errors."""
    def __init__(self, detail: Optional[str] = None, query_context: Optional[str] = None):
        super().__init__(
            message="Database query failed",
            detail=detail,
            context={"error_type": "query", "query_context": query_context},
        )
        self.code = ErrorCode.DATABASE_QUERY_ERROR


class ExternalServiceException(AppException):
    """External service errors (BigQuery, Jibble, etc.)."""
    def __init__(
        self,
        service_name: str,
        message: Optional[str] = None,
        detail: Optional[str] = None,
        code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_ERROR,
    ):
        super().__init__(
            message=message or f"{service_name} service error",
            code=code,
            status_code=502,
            detail=detail,
            context={"service": service_name},
        )


class BigQueryException(ExternalServiceException):
    """BigQuery-specific errors."""
    def __init__(self, detail: Optional[str] = None):
        super().__init__(
            service_name="BigQuery",
            detail=detail,
            code=ErrorCode.BIGQUERY_ERROR,
        )


class JibbleException(ExternalServiceException):
    """Jibble API-specific errors."""
    def __init__(self, detail: Optional[str] = None):
        super().__init__(
            service_name="Jibble",
            detail=detail,
            code=ErrorCode.JIBBLE_ERROR,
        )


class SyncException(AppException):
    """Data synchronization errors."""
    def __init__(
        self,
        message: str = "Data synchronization failed",
        detail: Optional[str] = None,
        table: Optional[str] = None,
    ):
        super().__init__(
            message=message,
            code=ErrorCode.SYNC_ERROR,
            status_code=500,
            detail=detail,
            context={"table": table} if table else {},
        )


class ValidationException(AppException):
    """Input validation errors."""
    def __init__(
        self,
        message: str = "Validation error",
        detail: Optional[str] = None,
        field: Optional[str] = None,
    ):
        super().__init__(
            message=message,
            code=ErrorCode.VALIDATION_ERROR,
            status_code=400,
            detail=detail,
            log_error=False,  # Don't log validation errors
            context={"field": field} if field else {},
        )


class NotFoundException(AppException):
    """Resource not found errors."""
    def __init__(
        self,
        resource: str,
        identifier: Optional[str] = None,
    ):
        detail = f"{resource} not found"
        if identifier:
            detail += f": {identifier}"
        
        super().__init__(
            message=detail,
            code=ErrorCode.NOT_FOUND,
            status_code=404,
            log_error=False,
        )


# =============================================================================
# Exception Handlers
# =============================================================================

def create_error_response(
    request: Request,
    status_code: int,
    error: str,
    code: ErrorCode,
    detail: Optional[str] = None,
) -> JSONResponse:
    """Create a standardized error response."""
    request_id = get_request_id()
    
    response_body = ErrorResponse(
        error=error,
        code=code.value,
        detail=detail,
        request_id=request_id,
        timestamp=datetime.utcnow().isoformat() + "Z",
        path=str(request.url.path),
    )
    
    return JSONResponse(
        status_code=status_code,
        content=response_body.model_dump(),
        headers={"X-Request-ID": request_id} if request_id else {},
    )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle AppException and its subclasses."""
    return create_error_response(
        request=request,
        status_code=exc.status_code,
        error=exc.message,
        code=exc.code,
        detail=exc.detail,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTPException with standardized format."""
    # Map common status codes to error codes
    code_map = {
        400: ErrorCode.VALIDATION_ERROR,
        404: ErrorCode.NOT_FOUND,
        429: ErrorCode.RATE_LIMIT_EXCEEDED,
        503: ErrorCode.SERVICE_UNAVAILABLE,
    }
    
    error_code = code_map.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
    
    return create_error_response(
        request=request,
        status_code=exc.status_code,
        error=str(exc.detail) if exc.detail else "An error occurred",
        code=error_code,
        detail=None,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    request_id = get_request_id()
    
    # Log the full exception
    logger.error(
        f"Unhandled exception: {exc}",
        extra={
            "request_id": request_id,
            "path": str(request.url.path),
            "method": request.method,
        },
        exc_info=True,
    )
    
    # Don't expose internal details in production
    from app.core.config import get_settings
    settings = get_settings()
    
    detail = str(exc) if settings.debug else None
    
    return create_error_response(
        request=request,
        status_code=500,
        error="An unexpected error occurred",
        code=ErrorCode.INTERNAL_ERROR,
        detail=detail,
    )


def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app."""
    from app.core.resilience import CircuitBreakerError
    from slowapi.errors import RateLimitExceeded
    
    # Custom app exceptions
    app.add_exception_handler(AppException, app_exception_handler)
    
    # HTTP exceptions
    app.add_exception_handler(HTTPException, http_exception_handler)
    
    # Circuit breaker
    async def circuit_breaker_handler(request: Request, exc: CircuitBreakerError):
        return create_error_response(
            request=request,
            status_code=503,
            error="Service temporarily unavailable",
            code=ErrorCode.CIRCUIT_BREAKER_OPEN,
            detail=f"Circuit breaker [{exc.name}] is open. Retry after 30 seconds.",
        )
    app.add_exception_handler(CircuitBreakerError, circuit_breaker_handler)
    
    # Rate limiting
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return create_error_response(
            request=request,
            status_code=429,
            error="Rate limit exceeded",
            code=ErrorCode.RATE_LIMIT_EXCEEDED,
            detail="Too many requests. Please try again later.",
        )
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    
    # Generic fallback
    app.add_exception_handler(Exception, generic_exception_handler)
