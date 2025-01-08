"""
Resilience patterns for the Nvidia Dashboard.

Provides:
- Retry logic with exponential backoff
- Circuit breaker pattern
- Graceful degradation utilities

These patterns ensure the application remains available even when
dependencies (PostgreSQL, BigQuery, Jibble) experience issues.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
from typing import Callable, Optional, Any, Dict, Type, Tuple
from threading import Lock

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Circuit Breaker Implementation
# =============================================================================

class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation, requests pass through
    OPEN = "open"          # Failing, requests are blocked
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open."""
    def __init__(self, name: str, message: str = "Circuit breaker is open"):
        self.name = name
        self.message = f"[{name}] {message}"
        super().__init__(self.message)


class CircuitBreaker:
    """
    Circuit breaker implementation to prevent cascading failures.
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Service is failing, requests are blocked (fail fast)
    - HALF_OPEN: Testing if service has recovered
    
    Transitions:
    - CLOSED -> OPEN: When failure_threshold consecutive failures occur
    - OPEN -> HALF_OPEN: After recovery_timeout seconds
    - HALF_OPEN -> CLOSED: If test request succeeds
    - HALF_OPEN -> OPEN: If test request fails
    """
    
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
        half_open_max_calls: int = 3,
    ):
        """
        Initialize circuit breaker.
        
        Args:
            name: Identifier for this circuit breaker
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before testing recovery
            half_open_max_calls: Max test calls in half-open state
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[datetime] = None
        self._half_open_calls = 0
        self._lock = Lock()
        
        # Metrics
        self._total_calls = 0
        self._total_failures = 0
        self._total_blocked = 0
    
    @property
    def state(self) -> CircuitState:
        """Get current circuit state, checking for timeout transitions."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self._state = CircuitState.HALF_OPEN
                    self._half_open_calls = 0
                    logger.info(f"Circuit breaker [{self.name}] transitioning to HALF_OPEN")
            return self._state
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset."""
        if self._last_failure_time is None:
            return True
        return datetime.utcnow() - self._last_failure_time > timedelta(seconds=self.recovery_timeout)
    
    def _record_success(self):
        """Record a successful call."""
        with self._lock:
            self._success_count += 1
            self._failure_count = 0
            
            if self._state == CircuitState.HALF_OPEN:
                self._half_open_calls += 1
                if self._half_open_calls >= self.half_open_max_calls:
                    self._state = CircuitState.CLOSED
                    logger.info(f"Circuit breaker [{self.name}] CLOSED - service recovered")
    
    def _record_failure(self, exception: Exception):
        """Record a failed call."""
        with self._lock:
            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = datetime.utcnow()
            self._success_count = 0
            
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                logger.warning(f"Circuit breaker [{self.name}] OPEN - recovery failed: {exception}")
            elif self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    f"Circuit breaker [{self.name}] OPEN after {self._failure_count} failures: {exception}"
                )
    
    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function through circuit breaker.
        
        Args:
            func: Function to execute
            *args, **kwargs: Arguments to pass to function
            
        Returns:
            Result of function call
            
        Raises:
            CircuitBreakerError: If circuit is open
            Exception: If function raises and circuit doesn't trip
        """
        self._total_calls += 1
        state = self.state
        
        if state == CircuitState.OPEN:
            self._total_blocked += 1
            raise CircuitBreakerError(
                self.name,
                f"Service unavailable. Retry after {self.recovery_timeout}s"
            )
        
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure(e)
            raise
    
    async def call_async(self, func: Callable, *args, **kwargs) -> Any:
        """Async version of call()."""
        self._total_calls += 1
        state = self.state
        
        if state == CircuitState.OPEN:
            self._total_blocked += 1
            raise CircuitBreakerError(
                self.name,
                f"Service unavailable. Retry after {self.recovery_timeout}s"
            )
        
        try:
            result = await func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure(e)
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get circuit breaker statistics."""
        return {
            "name": self.name,
            "state": self._state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "total_calls": self._total_calls,
            "total_failures": self._total_failures,
            "total_blocked": self._total_blocked,
            "last_failure": self._last_failure_time.isoformat() if self._last_failure_time else None,
        }
    
    def reset(self):
        """Manually reset circuit breaker to closed state."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
            logger.info(f"Circuit breaker [{self.name}] manually reset to CLOSED")


# =============================================================================
# Global Circuit Breakers
# =============================================================================

# Circuit breakers for different services
circuit_breakers: Dict[str, CircuitBreaker] = {
    "postgresql": CircuitBreaker("postgresql", failure_threshold=3, recovery_timeout=30),
    "bigquery": CircuitBreaker("bigquery", failure_threshold=3, recovery_timeout=60),
    "jibble": CircuitBreaker("jibble", failure_threshold=5, recovery_timeout=120),
}


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    if name not in circuit_breakers:
        circuit_breakers[name] = CircuitBreaker(name)
    return circuit_breakers[name]


def get_all_circuit_breaker_stats() -> Dict[str, Dict[str, Any]]:
    """Get stats for all circuit breakers."""
    return {name: cb.get_stats() for name, cb in circuit_breakers.items()}


# =============================================================================
# Retry Decorators
# =============================================================================

def retry_with_backoff(
    max_attempts: int = 3,
    min_wait: float = 1,
    max_wait: float = 10,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    circuit_breaker_name: Optional[str] = None,
):
    """
    Decorator for retry with exponential backoff and optional circuit breaker.
    
    Args:
        max_attempts: Maximum number of retry attempts
        min_wait: Minimum wait time between retries (seconds)
        max_wait: Maximum wait time between retries (seconds)
        exceptions: Tuple of exception types to retry on
        circuit_breaker_name: Name of circuit breaker to use (optional)
    
    Example:
        @retry_with_backoff(max_attempts=3, circuit_breaker_name="postgresql")
        def query_database():
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            cb = get_circuit_breaker(circuit_breaker_name) if circuit_breaker_name else None
            
            @retry(
                stop=stop_after_attempt(max_attempts),
                wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
                retry=retry_if_exception_type(exceptions),
                before_sleep=before_sleep_log(logger, logging.WARNING),
                reraise=True,
            )
            def _inner():
                if cb:
                    return cb.call(func, *args, **kwargs)
                return func(*args, **kwargs)
            
            try:
                return _inner()
            except RetryError as e:
                logger.error(f"All {max_attempts} retry attempts failed for {func.__name__}: {e.last_attempt.exception()}")
                raise e.last_attempt.exception()
        
        return wrapper
    return decorator


def async_retry_with_backoff(
    max_attempts: int = 3,
    min_wait: float = 1,
    max_wait: float = 10,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    circuit_breaker_name: Optional[str] = None,
):
    """
    Async version of retry_with_backoff decorator.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cb = get_circuit_breaker(circuit_breaker_name) if circuit_breaker_name else None
            last_exception = None
            
            for attempt in range(1, max_attempts + 1):
                try:
                    if cb:
                        return await cb.call_async(func, *args, **kwargs)
                    return await func(*args, **kwargs)
                except CircuitBreakerError:
                    raise  # Don't retry if circuit is open
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts:
                        wait_time = min(min_wait * (2 ** (attempt - 1)), max_wait)
                        logger.warning(
                            f"Attempt {attempt}/{max_attempts} failed for {func.__name__}: {e}. "
                            f"Retrying in {wait_time:.1f}s..."
                        )
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"All {max_attempts} attempts failed for {func.__name__}: {e}")
                        raise
            
            if last_exception:
                raise last_exception
        
        return wrapper
    return decorator


# =============================================================================
# Graceful Degradation Utilities
# =============================================================================

def with_fallback(fallback_value: Any = None, log_error: bool = True):
    """
    Decorator that returns a fallback value if the function fails.
    
    Args:
        fallback_value: Value to return on failure
        log_error: Whether to log the error
    
    Example:
        @with_fallback(fallback_value=[])
        def get_items():
            ...  # If this fails, returns []
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if log_error:
                    logger.error(f"Function {func.__name__} failed, returning fallback: {e}")
                return fallback_value
        return wrapper
    return decorator


def async_with_fallback(fallback_value: Any = None, log_error: bool = True):
    """Async version of with_fallback decorator."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                if log_error:
                    logger.error(f"Async function {func.__name__} failed, returning fallback: {e}")
                return fallback_value
        return wrapper
    return decorator


# =============================================================================
# Startup Resilience
# =============================================================================

class StartupResult:
    """Result of a startup operation."""
    def __init__(self, name: str, success: bool, error: Optional[str] = None, critical: bool = True):
        self.name = name
        self.success = success
        self.error = error
        self.critical = critical  # If True, app should not start without this


def resilient_startup(
    name: str,
    func: Callable,
    critical: bool = True,
    max_attempts: int = 3,
    wait_seconds: float = 5,
) -> StartupResult:
    """
    Execute a startup function with retries and graceful handling.
    
    Args:
        name: Name of the startup operation
        func: Function to execute
        critical: If True, failure should prevent app from starting
        max_attempts: Number of retry attempts
        wait_seconds: Wait time between attempts
        
    Returns:
        StartupResult with success status and any error
    """
    last_error = None
    
    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"[{name}] Attempt {attempt}/{max_attempts}...")
            func()
            logger.info(f"[{name}] Success")
            return StartupResult(name, success=True, critical=critical)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"[{name}] Attempt {attempt}/{max_attempts} failed: {e}")
            if attempt < max_attempts:
                logger.info(f"[{name}] Waiting {wait_seconds}s before retry...")
                time.sleep(wait_seconds)
    
    error_msg = f"Failed after {max_attempts} attempts: {last_error}"
    if critical:
        logger.error(f"[{name}] CRITICAL: {error_msg}")
    else:
        logger.warning(f"[{name}] Non-critical failure: {error_msg}")
    
    return StartupResult(name, success=False, error=error_msg, critical=critical)
