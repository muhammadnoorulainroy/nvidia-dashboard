"""
Unit tests for DatabaseService.

Tests cover:
- Database connection and initialization
- Session management
- Pool status monitoring
- Table operations
"""
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.services.db_service import DatabaseService, get_db_service


class TestDatabaseService:
    """Tests for DatabaseService class."""
    
    def test_get_connection_url_with_db(self):
        """Test connection URL generation with database."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            url = service.get_connection_url(with_db=True)
            
            assert "postgresql://" in url
            assert "testuser" in url
            assert "testpass" in url
            assert "localhost" in url
            assert "5432" in url
            assert "testdb" in url
    
    def test_get_connection_url_without_db(self):
        """Test connection URL generation without database (for admin operations)."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            url = service.get_connection_url(with_db=False)
            
            assert "postgresql://" in url
            assert "postgres" in url  # Default database
            assert "testdb" not in url
    
    def test_get_pool_status_not_initialized(self):
        """Test pool status when database is not initialized."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            status = service.get_pool_status()
            
            assert status["status"] == "not_initialized"
            assert status["pool_size"] == 0
    
    def test_get_pool_status_healthy(self):
        """Test pool status when database is healthy."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            service._initialized = True
            
            # Create a mock engine with pool
            mock_pool = MagicMock()
            mock_pool.size.return_value = 10
            mock_pool.checkedin.return_value = 8
            mock_pool.checkedout.return_value = 2
            mock_pool.overflow.return_value = 0
            
            mock_engine = MagicMock()
            mock_engine.pool = mock_pool
            service.engine = mock_engine
            
            status = service.get_pool_status()
            
            assert status["status"] == "healthy"
            assert status["pool_size"] == 10
            assert status["checked_in"] == 8
            assert status["checked_out"] == 2
    
    def test_get_table_row_count_not_initialized(self):
        """Test row count when database is not initialized."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            count = service.get_table_row_count("task")
            
            assert count == 0
    
    def test_check_tables_exist_not_initialized(self):
        """Test table check when database is not initialized."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            service = DatabaseService()
            result = service.check_tables_exist()
            
            assert result == {}


class TestGetDbService:
    """Tests for get_db_service singleton."""
    
    def test_get_db_service_returns_singleton(self):
        """Test that get_db_service returns the same instance."""
        with patch("app.services.db_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                postgres_host="localhost",
                postgres_port=5432,
                postgres_user="testuser",
                postgres_password="testpass",
                postgres_db="testdb"
            )
            
            # Reset singleton
            import app.services.db_service as db_module
            db_module._db_service = None
            
            service1 = get_db_service()
            service2 = get_db_service()
            
            assert service1 is service2
