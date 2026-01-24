"""
Rate limiting configuration for the Nvidia Dashboard API.

This module provides a shared limiter instance that can be used across
routers and is registered with the FastAPI app in main.py.

IMPORTANT: This module uses lazy initialization to avoid calling get_settings()
at import time. This ensures configuration validation errors are caught by
the main.py startup error handler instead of raising as ImportErrors.

Usage in routers:
    from app.core.rate_limiting import limiter, get_sync_rate_limit
    
    @router.get("/endpoint")
    @limiter.limit("10/minute")
    async def my_endpoint(request: Request):
        ...
    
    # For sync endpoint, use callable to get configured rate limit at runtime:
    @router.post("/sync")
    @limiter.limit(get_sync_rate_limit)  # Callable, not variable!
    async def sync_endpoint(request: Request):
        ...
"""
from functools import lru_cache
from slowapi import Limiter
from slowapi.util import get_remote_address


# Default rate limit values (used if settings not yet available)
_DEFAULT_RATE_LIMIT = "100/minute"
_DEFAULT_SYNC_RATE_LIMIT = "5/minute"


@lru_cache()
def _get_rate_limit_settings():
    """Lazily get rate limit settings from configuration."""
    from app.config import get_settings
    settings = get_settings()
    return {
        "default_limit": f"{settings.rate_limit_requests}/{settings.rate_limit_window}",
        "sync_limit": f"{settings.rate_limit_sync_requests}/{settings.rate_limit_sync_window}",
        "enabled": settings.rate_limit_enabled,
    }


def _get_default_limits():
    """Get default limits, falling back to defaults if settings unavailable."""
    try:
        return [_get_rate_limit_settings()["default_limit"]]
    except Exception:
        return [_DEFAULT_RATE_LIMIT]


def _is_enabled():
    """Check if rate limiting is enabled."""
    try:
        return _get_rate_limit_settings()["enabled"]
    except Exception:
        return True


# Create the shared limiter instance
# This MUST be the same instance registered with app.state.limiter in main.py
# Uses lazy evaluation for settings to avoid import-time configuration errors
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=_get_default_limits(),
    enabled=_is_enabled(),
    headers_enabled=True,
)


def get_sync_rate_limit() -> str:
    """Get the sync-specific rate limit string."""
    try:
        return _get_rate_limit_settings()["sync_limit"]
    except Exception:
        return _DEFAULT_SYNC_RATE_LIMIT


# DEPRECATED: Do not use SYNC_RATE_LIMIT in decorators!
# Python's `from X import Y` captures values at import time, so changes
# made by initialize_rate_limits() won't affect already-imported bindings.
# Use get_sync_rate_limit() function instead (slowapi accepts callables).
SYNC_RATE_LIMIT = _DEFAULT_SYNC_RATE_LIMIT


def initialize_rate_limits():
    """
    Initialize rate limits from settings.
    
    Call this after configuration is validated to update the limiter
    and SYNC_RATE_LIMIT with actual configured values.
    """
    global SYNC_RATE_LIMIT
    try:
        settings_dict = _get_rate_limit_settings()
        SYNC_RATE_LIMIT = settings_dict["sync_limit"]
        # Update limiter's default limits if different
        limiter._default_limits = [settings_dict["default_limit"]]
        limiter._enabled = settings_dict["enabled"]
    except Exception:
        pass  # Keep defaults if settings unavailable
