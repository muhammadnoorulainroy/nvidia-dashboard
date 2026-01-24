"""
Unit tests for resilience patterns.

Tests cover:
- Circuit breaker functionality
- Retry logic
- Graceful degradation
- Startup resilience
"""
import pytest
from unittest.mock import MagicMock, patch
import time


class TestCircuitBreaker:
    """Tests for circuit breaker functionality."""
    
    def test_circuit_breaker_initial_state_closed(self):
        """Test circuit breaker starts in closed state."""
        from app.core.resilience import CircuitBreaker, CircuitState
        
        cb = CircuitBreaker(
            name="test",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_calls=1
        )
        
        # state returns CircuitState enum, compare with enum or check value
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == 0
    
    def test_circuit_breaker_opens_after_failures(self):
        """Test circuit breaker opens after reaching failure threshold."""
        from app.core.resilience import CircuitBreaker, CircuitState, CircuitBreakerError
        
        cb = CircuitBreaker(
            name="test",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_calls=1
        )
        
        # Use call() with a failing function to record failures
        def failing_func():
            raise ValueError("Test failure")
        
        for _ in range(3):
            try:
                cb.call(failing_func)
            except ValueError:
                pass  # Expected
        
        assert cb.state == CircuitState.OPEN
    
    def test_circuit_breaker_resets_on_success(self):
        """Test circuit breaker resets failure count on success."""
        from app.core.resilience import CircuitBreaker, CircuitState
        
        cb = CircuitBreaker(
            name="test",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_calls=1
        )
        
        # Record some failures using call()
        def failing_func():
            raise ValueError("Test failure")
        
        def success_func():
            return "success"
        
        # Record 2 failures
        for _ in range(2):
            try:
                cb.call(failing_func)
            except ValueError:
                pass
        
        # Record success
        cb.call(success_func)
        
        assert cb._failure_count == 0
        assert cb.state == CircuitState.CLOSED
    
    def test_circuit_breaker_get_stats(self):
        """Test circuit breaker statistics retrieval."""
        from app.core.resilience import CircuitBreaker
        
        cb = CircuitBreaker(
            name="test",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_calls=1
        )
        
        stats = cb.get_stats()
        
        assert "state" in stats
        assert "failure_count" in stats
        assert "last_failure" in stats  # Key is 'last_failure' not 'last_failure_time'


class TestStartupResult:
    """Tests for StartupResult data class."""
    
    def test_startup_result_success(self):
        """Test successful startup result."""
        from app.core.resilience import StartupResult
        
        result = StartupResult(
            name="TestService",
            success=True,
            critical=True
        )
        
        assert result.name == "TestService"
        assert result.success == True
        assert result.error is None
    
    def test_startup_result_failure(self):
        """Test failed startup result."""
        from app.core.resilience import StartupResult
        
        result = StartupResult(
            name="TestService",
            success=False,
            critical=True,
            error="Connection refused"
        )
        
        assert result.success == False
        assert result.error == "Connection refused"


class TestResilientStartup:
    """Tests for resilient_startup function."""
    
    def test_resilient_startup_success(self):
        """Test resilient startup with successful function."""
        from app.core.resilience import resilient_startup
        
        def successful_func():
            return "success"
        
        result = resilient_startup(
            name="test",
            func=successful_func,
            critical=False,
            max_attempts=3,
            wait_seconds=0.1
        )
        
        assert result.success == True
    
    def test_resilient_startup_retry_then_success(self):
        """Test resilient startup retries and eventually succeeds."""
        from app.core.resilience import resilient_startup
        
        call_count = 0
        
        def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Temporary failure")
            return "success"
        
        result = resilient_startup(
            name="test",
            func=flaky_func,
            critical=False,
            max_attempts=5,
            wait_seconds=0.01
        )
        
        assert result.success == True
        assert call_count == 3
    
    def test_resilient_startup_all_attempts_fail(self):
        """Test resilient startup when all attempts fail."""
        from app.core.resilience import resilient_startup
        
        def always_fails():
            raise Exception("Permanent failure")
        
        result = resilient_startup(
            name="test",
            func=always_fails,
            critical=False,
            max_attempts=3,
            wait_seconds=0.01
        )
        
        assert result.success == False
        assert "Permanent failure" in result.error


class TestGracefulDegradation:
    """Tests for graceful degradation utilities."""
    
    def test_get_all_circuit_breaker_stats(self):
        """Test retrieving all circuit breaker statistics."""
        from app.core.resilience import get_all_circuit_breaker_stats
        
        stats = get_all_circuit_breaker_stats()
        
        assert isinstance(stats, dict)
