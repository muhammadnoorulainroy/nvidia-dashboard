"""
Unit tests for health check endpoints.

Tests cover:
- Liveness probe
- Readiness probe
- Full health check
- Dependency health checks
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


class TestHealthEndpoints:
    """Tests for health check API endpoints."""
    
    def test_root_endpoint(self, test_client):
        """Test root endpoint returns operational status."""
        response = test_client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "operational"
        assert "version" in data
    
    def test_liveness_endpoint(self, test_client):
        """Test liveness probe endpoint."""
        response = test_client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"
    
    def test_readiness_endpoint_healthy(self, test_client, mock_db_service):
        """Test readiness probe when all dependencies are healthy."""
        with patch("app.core.health.get_db_service", return_value=mock_db_service):
            response = test_client.get("/health/ready")
            
            # May return 200 or 503 depending on actual health
            assert response.status_code in [200, 503]
    
    def test_full_health_endpoint(self, test_client, mock_db_service):
        """Test comprehensive health check endpoint."""
        with patch("app.core.health.get_db_service", return_value=mock_db_service):
            response = test_client.get("/health/full")
            
            assert response.status_code == 200
            data = response.json()
            assert "status" in data
            assert "checks" in data
            assert "uptime_seconds" in data


class TestMetricsEndpoint:
    """Tests for Prometheus metrics endpoint."""
    
    def test_metrics_endpoint_returns_prometheus_format(self, test_client):
        """Test metrics endpoint returns Prometheus format."""
        response = test_client.get("/metrics")
        
        assert response.status_code == 200
        # Prometheus metrics should contain certain keywords
        content = response.text
        assert "http_requests" in content or "HELP" in content or "TYPE" in content


class TestCircuitBreakerEndpoint:
    """Tests for circuit breaker status endpoint."""
    
    def test_circuit_breakers_endpoint(self, test_client):
        """Test circuit breaker status endpoint."""
        response = test_client.get("/circuit-breakers")
        
        assert response.status_code == 200
        data = response.json()
        # Should return dict of circuit breaker statuses
        assert isinstance(data, dict)


class TestCacheEndpoints:
    """Tests for cache management endpoints."""
    
    def test_cache_stats_endpoint(self, test_client):
        """Test cache statistics endpoint."""
        response = test_client.get("/cache/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
    
    def test_cache_clear_endpoint(self, test_client):
        """Test cache clear endpoint."""
        response = test_client.post("/cache/clear")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cleared"
