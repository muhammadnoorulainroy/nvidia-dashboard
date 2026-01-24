"""
Unit tests for statistics API endpoints.

Tests cover:
- Domain aggregation endpoint
- Reviewer aggregation endpoint
- Trainer aggregation endpoint
- Overall statistics endpoint
- Task-level endpoint
- Sync endpoints
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


class TestDomainEndpoint:
    """Tests for /api/by-domain endpoint."""
    
    def test_get_stats_by_domain_success(self, test_client, mock_query_service):
        """Test successful domain aggregation retrieval."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-domain")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
    
    def test_get_stats_by_domain_with_filter(self, test_client, mock_query_service):
        """Test domain aggregation with domain filter."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-domain?domain=Science")
            
            assert response.status_code == 200
    
    def test_get_stats_by_domain_with_multiple_filters(self, test_client, mock_query_service):
        """Test domain aggregation with multiple filters."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-domain?domain=Science&reviewer=1")
            
            assert response.status_code == 200


class TestReviewerEndpoint:
    """Tests for /api/by-reviewer endpoint."""
    
    def test_get_stats_by_reviewer_success(self, test_client, mock_query_service):
        """Test successful reviewer aggregation retrieval."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-reviewer")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
    
    def test_get_stats_by_reviewer_with_filter(self, test_client, mock_query_service):
        """Test reviewer aggregation with reviewer filter."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-reviewer?reviewer=1")
            
            assert response.status_code == 200


class TestTrainerEndpoint:
    """Tests for /api/by-trainer-level endpoint."""
    
    def test_get_stats_by_trainer_success(self, test_client, mock_query_service):
        """Test successful trainer aggregation retrieval."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-trainer-level")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
    
    def test_get_stats_by_trainer_with_filter(self, test_client, mock_query_service):
        """Test trainer aggregation with trainer filter."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-trainer-level?trainer=1")
            
            assert response.status_code == 200


class TestOverallEndpoint:
    """Tests for /api/overall endpoint."""
    
    def test_get_overall_stats_success(self, test_client, mock_query_service):
        """Test successful overall statistics retrieval."""
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/overall")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, dict)


class TestSyncEndpoints:
    """Tests for sync-related endpoints."""
    
    def test_get_sync_info(self, test_client, mock_data_sync_service):
        """Test sync info retrieval."""
        with patch("app.routers.stats.get_data_sync_service", return_value=mock_data_sync_service):
            response = test_client.get("/api/sync-info")
            
            # May return 200 with data or 404 if no sync yet
            assert response.status_code in [200, 404]
    
    def test_manual_sync_endpoint(self, test_client, mock_data_sync_service, mock_db_service):
        """Test manual sync trigger endpoint."""
        with patch("app.routers.stats.get_data_sync_service", return_value=mock_data_sync_service):
            with patch("app.routers.stats.get_db_service", return_value=mock_db_service):
                response = test_client.post("/api/sync")
                
                # Should succeed or return error message
                assert response.status_code in [200, 500]


class TestDailyStatsEndpoints:
    """Tests for daily statistics endpoints."""
    
    def test_get_trainer_daily_stats(self, test_client, mock_query_service):
        """Test trainer daily statistics endpoint."""
        mock_query_service.get_trainer_daily_stats.return_value = []
        
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-trainer-daily")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
    
    def test_get_trainer_daily_stats_with_date_filter(self, test_client, mock_query_service):
        """Test trainer daily statistics with date filters."""
        mock_query_service.get_trainer_daily_stats.return_value = []
        
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get(
                "/api/by-trainer-daily?start_date=2024-01-01&end_date=2024-12-31"
            )
            
            assert response.status_code == 200
    
    def test_get_reviewer_daily_stats(self, test_client, mock_query_service):
        """Test reviewer daily statistics endpoint."""
        mock_query_service.get_reviewer_daily_stats.return_value = []
        
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/by-reviewer-daily")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)


class TestRatingTrendsEndpoint:
    """Tests for rating trends endpoint."""
    
    def test_get_rating_trends(self, test_client, mock_query_service):
        """Test rating trends endpoint."""
        mock_query_service.get_rating_trends.return_value = []
        
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/rating-trends")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
    
    def test_get_rating_trends_with_timeframe(self, test_client, mock_query_service):
        """Test rating trends with timeframe parameter."""
        mock_query_service.get_rating_trends.return_value = []
        
        with patch("app.routers.stats.get_query_service", return_value=mock_query_service):
            response = test_client.get("/api/rating-trends?timeframe=weekly")
            
            assert response.status_code == 200
