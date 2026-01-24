"""
Unit tests for application configuration.

Tests cover:
- Settings validation
- Environment variable loading
- Default values
- Configuration parsing
"""
import os
import pytest
from unittest.mock import patch


class TestSettings:
    """Tests for Settings configuration class."""
    
    def test_settings_loads_from_env(self):
        """Test that settings loads from environment variables."""
        env_vars = {
            "DEBUG": "true",
            "POSTGRES_HOST": "testhost",
            "POSTGRES_PORT": "5433",
            "POSTGRES_USER": "testuser",
            "POSTGRES_PASSWORD": "secure_password_123",
            "POSTGRES_DB": "testdb",
            "GCP_PROJECT_ID": "test-project",
            "BIGQUERY_DATASET": "test_dataset",
            "PROJECT_ID_FILTER": "36",
            "CORS_ORIGINS": "http://localhost:3001",
            "PROJECT_START_DATE": "2024-01-01"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            # Force reload of settings
            from app.config import Settings
            settings = Settings()
            
            assert settings.debug == True
            assert settings.postgres_host == "testhost"
            assert settings.postgres_port == 5433
            assert settings.postgres_user == "testuser"
    
    def test_cors_origins_list_parsing(self):
        """Test CORS origins list parsing."""
        env_vars = {
            "DEBUG": "true",
            "POSTGRES_HOST": "localhost",
            "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "testuser",
            "POSTGRES_PASSWORD": "secure_password_123",
            "POSTGRES_DB": "testdb",
            "GCP_PROJECT_ID": "test-project",
            "BIGQUERY_DATASET": "test_dataset",
            "PROJECT_ID_FILTER": "36",
            "CORS_ORIGINS": "http://localhost:3001,http://localhost:8001",
            "PROJECT_START_DATE": "2024-01-01"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            from app.config import Settings
            settings = Settings()
            
            origins = settings.cors_origins_list
            assert isinstance(origins, list)
            assert "http://localhost:3001" in origins
            assert "http://localhost:8001" in origins
    
    def test_all_project_ids_list_parsing(self):
        """Test project IDs list parsing."""
        env_vars = {
            "DEBUG": "true",
            "POSTGRES_HOST": "localhost",
            "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "testuser",
            "POSTGRES_PASSWORD": "secure_password_123",
            "POSTGRES_DB": "testdb",
            "GCP_PROJECT_ID": "test-project",
            "BIGQUERY_DATASET": "test_dataset",
            "PROJECT_ID_FILTER": "36",
            "CORS_ORIGINS": "http://localhost:3001",
            "PROJECT_START_DATE": "2024-01-01",
            "ALL_PROJECT_IDS": "36,37,38,39"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            from app.config import Settings
            settings = Settings()
            
            project_ids = settings.all_project_ids_list
            assert isinstance(project_ids, list)
            assert 36 in project_ids
            assert 39 in project_ids
    
    def test_project_names_json_parsing(self):
        """Test project names JSON parsing."""
        env_vars = {
            "DEBUG": "true",
            "POSTGRES_HOST": "localhost",
            "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "testuser",
            "POSTGRES_PASSWORD": "secure_password_123",
            "POSTGRES_DB": "testdb",
            "GCP_PROJECT_ID": "test-project",
            "BIGQUERY_DATASET": "test_dataset",
            "PROJECT_ID_FILTER": "36",
            "CORS_ORIGINS": "http://localhost:3001",
            "PROJECT_START_DATE": "2024-01-01"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            from app.config import Settings
            settings = Settings()
            
            project_names = settings.project_names
            assert isinstance(project_names, dict)
    
    def test_log_config_summary_no_secrets(self):
        """Test that log config summary does not expose secrets."""
        env_vars = {
            "DEBUG": "true",
            "POSTGRES_HOST": "localhost",
            "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "testuser",
            "POSTGRES_PASSWORD": "super_secret_password_123",
            "POSTGRES_DB": "testdb",
            "GCP_PROJECT_ID": "test-project",
            "BIGQUERY_DATASET": "test_dataset",
            "PROJECT_ID_FILTER": "36",
            "CORS_ORIGINS": "http://localhost:3001",
            "PROJECT_START_DATE": "2024-01-01"
        }
        
        with patch.dict(os.environ, env_vars, clear=False):
            from app.config import Settings
            settings = Settings()
            
            summary = settings.log_config_summary()
            
            # Password should not appear in summary
            assert "super_secret_password_123" not in summary
