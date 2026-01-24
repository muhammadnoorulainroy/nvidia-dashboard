"""
Sentry error tracking integration for Nvidia Dashboard.

Provides:
- Automatic error capture and reporting
- Performance monitoring
- Request context tracking
- Custom error fingerprinting
"""
import logging
from typing import Optional
from functools import wraps

logger = logging.getLogger(__name__)

# Sentry SDK is optional - gracefully handle if not installed
_sentry_initialized = False

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False
    logger.info("Sentry SDK not installed - error tracking disabled")


def init_sentry(
    dsn: Optional[str] = None,
    environment: str = "development",
    release: Optional[str] = None,
    sample_rate: float = 1.0,
    traces_sample_rate: float = 0.1,
    debug: bool = False
) -> bool:
    """
    Initialize Sentry error tracking.
    
    Args:
        dsn: Sentry DSN (Data Source Name). If None, Sentry is disabled.
        environment: Environment name (development, staging, production)
        release: Application release/version string
        sample_rate: Error sampling rate (0.0 to 1.0)
        traces_sample_rate: Performance tracing sample rate (0.0 to 1.0)
        debug: Enable Sentry debug mode
    
    Returns:
        True if Sentry was initialized, False otherwise
    """
    global _sentry_initialized
    
    if not SENTRY_AVAILABLE:
        logger.warning("Sentry SDK not available - install with: pip install sentry-sdk[fastapi]")
        return False
    
    if not dsn:
        logger.info("Sentry DSN not configured - error tracking disabled")
        return False
    
    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            sample_rate=sample_rate,
            traces_sample_rate=traces_sample_rate,
            debug=debug,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                LoggingIntegration(
                    level=logging.INFO,
                    event_level=logging.ERROR
                ),
            ],
            # Filter sensitive data
            before_send=_before_send,
            # Don't send PII
            send_default_pii=False,
        )
        
        _sentry_initialized = True
        logger.info(f"Sentry initialized for environment: {environment}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")
        return False


def _before_send(event, hint):
    """
    Process event before sending to Sentry.
    
    Used to:
    - Filter out sensitive data
    - Add custom context
    - Skip certain errors
    """
    # Filter out validation errors (these are expected)
    if "exc_info" in hint:
        exc_type, exc_value, exc_tb = hint["exc_info"]
        
        # Skip validation errors
        if exc_type.__name__ in ["ValidationError", "RequestValidationError"]:
            return None
        
        # Skip rate limit errors
        if exc_type.__name__ == "RateLimitExceeded":
            return None
    
    # Remove any passwords or tokens from the event
    if "request" in event and "data" in event["request"]:
        data = event["request"]["data"]
        if isinstance(data, dict):
            for key in ["password", "token", "api_key", "secret"]:
                if key in data:
                    data[key] = "[FILTERED]"
    
    return event


def capture_exception(exception: Exception, **context) -> Optional[str]:
    """
    Capture an exception and send to Sentry.
    
    Args:
        exception: The exception to capture
        **context: Additional context to attach
    
    Returns:
        Sentry event ID if captured, None otherwise
    """
    if not _sentry_initialized or not SENTRY_AVAILABLE:
        return None
    
    try:
        with sentry_sdk.push_scope() as scope:
            for key, value in context.items():
                scope.set_extra(key, value)
            return sentry_sdk.capture_exception(exception)
    except Exception as e:
        logger.error(f"Failed to capture exception to Sentry: {e}")
        return None


def capture_message(message: str, level: str = "info", **context) -> Optional[str]:
    """
    Capture a message and send to Sentry.
    
    Args:
        message: The message to capture
        level: Log level (debug, info, warning, error, fatal)
        **context: Additional context to attach
    
    Returns:
        Sentry event ID if captured, None otherwise
    """
    if not _sentry_initialized or not SENTRY_AVAILABLE:
        return None
    
    try:
        with sentry_sdk.push_scope() as scope:
            for key, value in context.items():
                scope.set_extra(key, value)
            return sentry_sdk.capture_message(message, level=level)
    except Exception as e:
        logger.error(f"Failed to capture message to Sentry: {e}")
        return None


def set_user(user_id: str, email: Optional[str] = None, **extra) -> None:
    """
    Set user context for Sentry events.
    
    Args:
        user_id: User identifier
        email: User email (optional)
        **extra: Additional user data
    """
    if not _sentry_initialized or not SENTRY_AVAILABLE:
        return
    
    try:
        sentry_sdk.set_user({
            "id": user_id,
            "email": email,
            **extra
        })
    except Exception as e:
        logger.error(f"Failed to set Sentry user: {e}")


def set_tag(key: str, value: str) -> None:
    """Set a tag on the current Sentry scope."""
    if not _sentry_initialized or not SENTRY_AVAILABLE:
        return
    
    try:
        sentry_sdk.set_tag(key, value)
    except Exception as e:
        logger.error(f"Failed to set Sentry tag: {e}")


def add_breadcrumb(message: str, category: str = "default", level: str = "info", **data) -> None:
    """Add a breadcrumb for debugging."""
    if not _sentry_initialized or not SENTRY_AVAILABLE:
        return
    
    try:
        sentry_sdk.add_breadcrumb(
            message=message,
            category=category,
            level=level,
            data=data
        )
    except Exception as e:
        logger.error(f"Failed to add Sentry breadcrumb: {e}")


def sentry_span(operation: str, description: Optional[str] = None):
    """
    Decorator to create a Sentry span for performance monitoring.
    
    Usage:
        @sentry_span("db.query", "Fetch user data")
        def get_user(user_id):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not _sentry_initialized or not SENTRY_AVAILABLE:
                return func(*args, **kwargs)
            
            with sentry_sdk.start_span(op=operation, description=description or func.__name__):
                return func(*args, **kwargs)
        return wrapper
    return decorator


def is_sentry_enabled() -> bool:
    """Check if Sentry is enabled and initialized."""
    return _sentry_initialized and SENTRY_AVAILABLE
