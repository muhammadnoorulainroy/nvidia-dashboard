"""
Pytest configuration and fixtures for Nvidia Dashboard tests.

This module provides:
- Test database setup and teardown
- FastAPI test client
- Mock services for unit testing
- Common test fixtures
"""
import os
import pytest
from typing import Generator
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Set test environment before importing app modules
os.environ["DEBUG"] = "true"
os.environ["TESTING"] = "true"  # Skip heavy initialization in tests
os.environ["POSTGRES_PASSWORD"] = "test_password_123"
os.environ["POSTGRES_DB"] = "nvidia_test"
os.environ["GCP_PROJECT_ID"] = "test-project"
os.environ["BIGQUERY_DATASET"] = "test_dataset"
os.environ["PROJECT_ID_FILTER"] = "36"
os.environ["CORS_ORIGINS"] = "http://localhost:3001"
os.environ["PROJECT_START_DATE"] = "2024-01-01"
os.environ["RATE_LIMIT_ENABLED"] = "false"  # Disable rate limiting in tests

from app.models.db_models import Base
from app.services.db_service import DatabaseService


# =============================================================================
# Database Fixtures
# =============================================================================

@pytest.fixture(scope="function")
def test_engine():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def test_session(test_engine) -> Generator[Session, None, None]:
    """Create a database session for testing."""
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def mock_db_service(test_engine, test_session):
    """Create a mock database service for testing."""
    service = MagicMock(spec=DatabaseService)
    service._initialized = True
    service.engine = test_engine
    service.SessionLocal = lambda: test_session
    
    # Mock context manager for get_session
    class SessionContextManager:
        def __enter__(self):
            return test_session
        def __exit__(self, *args):
            pass
    
    service.get_session.return_value = SessionContextManager()
    service.get_table_row_count.return_value = 100
    service.get_pool_status.return_value = {
        "status": "healthy",
        "pool_size": 10,
        "checked_in": 8,
        "checked_out": 2,
        "overflow": 0
    }
    
    return service


# =============================================================================
# FastAPI Test Client Fixtures
# =============================================================================

@pytest.fixture(scope="function")
def test_client(mock_db_service) -> Generator[TestClient, None, None]:
    """Create a FastAPI test client with mocked dependencies."""
    with patch("app.services.db_service.get_db_service", return_value=mock_db_service):
        with patch("app.services.query_service.get_db_service", return_value=mock_db_service):
            from app.main import app
            with TestClient(app) as client:
                yield client


@pytest.fixture(scope="function")
def test_client_no_mock() -> Generator[TestClient, None, None]:
    """Create a FastAPI test client without mocked dependencies (for integration tests)."""
    from app.main import app
    with TestClient(app) as client:
        yield client


# =============================================================================
# Mock Service Fixtures
# =============================================================================

@pytest.fixture
def mock_query_service():
    """Create a mock query service for testing."""
    service = MagicMock()
    
    # Mock domain aggregation
    service.get_domain_aggregation.return_value = [
        {
            "domain": "Science, Tech, & Environment",
            "task_score": 4.5,
            "total_tasks": 100,
            "total_reworks": 20,
            "avg_rework": 0.2
        },
        {
            "domain": "Business, Finance, Industry",
            "task_score": 4.3,
            "total_tasks": 80,
            "total_reworks": 15,
            "avg_rework": 0.19
        }
    ]
    
    # Mock overall stats
    service.get_overall_aggregation.return_value = {
        "total_tasks": 1000,
        "total_trainers": 50,
        "total_reviewers": 10,
        "total_domains": 12,
        "quality_dimensions": 7,
        "avg_task_score": 4.5,
        "avg_rework": 0.2
    }
    
    # Mock trainer aggregation
    service.get_trainer_aggregation.return_value = [
        {
            "id": 1,
            "name": "Test Trainer",
            "turing_email": "test@turing.com",
            "task_score": 4.5,
            "total_tasks": 50,
            "total_reworks": 10,
            "avg_rework": 0.2
        }
    ]
    
    return service


@pytest.fixture
def mock_data_sync_service():
    """Create a mock data sync service for testing."""
    service = MagicMock()
    service.sync_all_tables.return_value = {
        "task": True,
        "review_detail": True,
        "contributor": True
    }
    service.get_last_sync_info.return_value = {
        "table_name": "task",
        "sync_started_at": "2024-01-01T00:00:00",
        "sync_completed_at": "2024-01-01T00:05:00",
        "records_synced": 1000,
        "sync_status": "success"
    }
    return service


# =============================================================================
# Sample Data Fixtures
# =============================================================================

@pytest.fixture
def sample_task_data():
    """Sample task data for testing."""
    return {
        "id": 1,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00",
        "statement": "Test task statement",
        "status": "completed",
        "project_id": 36,
        "batch_id": 1,
        "current_user_id": 1,
        "domain": "Science, Tech, & Environment",
        "is_delivered": "True",
        "rework_count": 0
    }


@pytest.fixture
def sample_contributor_data():
    """Sample contributor data for testing."""
    return {
        "id": 1,
        "name": "Test Contributor",
        "turing_email": "test@turing.com",
        "type": "trainer",
        "status": "active",
        "team_lead_id": None
    }


@pytest.fixture
def sample_review_detail_data():
    """Sample review detail data for testing."""
    return {
        "id": 1,
        "quality_dimension_id": 1,
        "domain": "Science, Tech, & Environment",
        "human_role_id": 1,
        "review_id": 1,
        "reviewer_id": 1,
        "conversation_id": 1,
        "is_delivered": "True",
        "name": "Test Review",
        "score_text": "Good",
        "score": 4.5,
        "task_score": 4.5
    }


# =============================================================================
# Utility Fixtures
# =============================================================================

@pytest.fixture
def valid_date_range():
    """Valid date range for API queries."""
    return {
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }


@pytest.fixture
def invalid_date_range():
    """Invalid date range for testing validation."""
    return {
        "start_date": "invalid-date",
        "end_date": "also-invalid"
    }
