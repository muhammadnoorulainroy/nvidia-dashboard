"""
PostgreSQL database connection and management service for nvidia

Features:
- Connection pooling
- Retry logic with circuit breaker
- SQL injection prevention
"""
import logging
import re
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import OperationalError, InterfaceError
from contextlib import contextmanager
from typing import Generator, Set, FrozenSet
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app.core.config import get_settings
from app.models.db_models import Base, Task, ReviewDetail, Contributor, DataSyncLog, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerTrainerDailyStats, PodLeadMapping, JibblePerson, JibbleTimeEntry, JibbleEmailMapping
from app.core.resilience import (
    retry_with_backoff,
    get_circuit_breaker,
    CircuitBreakerError,
)
from app.core.metrics import track_db_operation, DB_CONNECTION_POOL_SIZE, DB_CONNECTION_POOL_AVAILABLE

logger = logging.getLogger(__name__)

# Database-related exceptions that should trigger retry
DB_RETRY_EXCEPTIONS = (
    OperationalError,
    InterfaceError,
    psycopg2.OperationalError,
    psycopg2.InterfaceError,
    ConnectionError,
    TimeoutError,
)

# =============================================================================
# SQL INJECTION PREVENTION
# =============================================================================
# Whitelist of valid table names - ONLY these tables can be queried
# This prevents SQL injection by ensuring only known-safe identifiers are used
VALID_TABLE_NAMES: FrozenSet[str] = frozenset({
    'task',
    'review_detail',
    'contributor',
    'data_sync_log',
    'task_reviewed_info',
    'task_aht',
    'contributor_task_stats',
    'contributor_daily_stats',
    'reviewer_daily_stats',
    'reviewer_trainer_daily_stats',
    'task_history_raw',
    'task_raw',
    'pod_lead_mapping',
    'jibble_person',
    'jibble_time_entry',
    'jibble_email_mapping',
})

# Pattern for valid SQL identifiers (alphanumeric and underscores only)
VALID_IDENTIFIER_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def validate_identifier(identifier: str, identifier_type: str = "identifier") -> str:
    """
    Validate and sanitize a SQL identifier (table name, database name, etc.)
    to prevent SQL injection.
    
    Args:
        identifier: The identifier to validate
        identifier_type: Description for error messages (e.g., "table name", "database name")
        
    Returns:
        The validated identifier (lowercase, stripped)
        
    Raises:
        ValueError: If the identifier contains invalid characters
    """
    if not identifier:
        raise ValueError(f"{identifier_type.capitalize()} cannot be empty")
    
    # Normalize
    normalized = identifier.lower().strip()
    
    # Check length (PostgreSQL max identifier length is 63)
    if len(normalized) > 63:
        raise ValueError(
            f"{identifier_type.capitalize()} too long: max 63 characters, got {len(normalized)}"
        )
    
    # Ensure it matches valid identifier pattern
    if not VALID_IDENTIFIER_PATTERN.match(normalized):
        raise ValueError(
            f"{identifier_type.capitalize()} contains invalid characters: '{identifier}'. "
            "Only alphanumeric characters and underscores are allowed, "
            "and it must start with a letter or underscore."
        )
    
    return normalized


def validate_table_name(table_name: str) -> str:
    """
    Validate and sanitize a table name to prevent SQL injection.
    Uses whitelist approach - only known tables are allowed.
    
    Args:
        table_name: The table name to validate
        
    Returns:
        The validated table name (lowercase)
        
    Raises:
        ValueError: If the table name is invalid or not in the whitelist
    """
    # First, validate as a generic identifier
    normalized = validate_identifier(table_name, "table name")
    
    # Then check against whitelist
    if normalized not in VALID_TABLE_NAMES:
        raise ValueError(
            f"Invalid table name: '{table_name}'. "
            f"Table must be one of: {sorted(VALID_TABLE_NAMES)}"
        )
    
    return normalized


def validate_database_name(db_name: str) -> str:
    """
    Validate and sanitize a database name to prevent SQL injection.
    
    Args:
        db_name: The database name to validate
        
    Returns:
        The validated database name (lowercase)
        
    Raises:
        ValueError: If the database name contains invalid characters
    """
    return validate_identifier(db_name, "database name")


class DatabaseService:
    """Service for managing PostgreSQL database connections"""
    
    def __init__(self):
        self.settings = get_settings()
        self.engine = None
        self.SessionLocal = None
        self._initialized = False
    
    def get_connection_url(self, with_db: bool = True) -> str:
        """Generate PostgreSQL connection URL"""
        if with_db:
            return (
                f"postgresql://{self.settings.postgres_user}:"
                f"{self.settings.postgres_password}@"
                f"{self.settings.postgres_host}:"
                f"{self.settings.postgres_port}/"
                f"{self.settings.postgres_db}"
            )
        else:
            return (
                f"postgresql://{self.settings.postgres_user}:"
                f"{self.settings.postgres_password}@"
                f"{self.settings.postgres_host}:"
                f"{self.settings.postgres_port}/"
                "postgres"
            )
    
    def check_database_exists(self) -> bool:
        """Check if the database exists"""
        try:
            conn = psycopg2.connect(
                host=self.settings.postgres_host,
                port=self.settings.postgres_port,
                user=self.settings.postgres_user,
                password=self.settings.postgres_password,
                database='postgres'
            )
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (self.settings.postgres_db,)
            )
            exists = cursor.fetchone() is not None
            
            cursor.close()
            conn.close()
            
            return exists
        except Exception as e:
            logger.error(f"Error checking database existence: {e}")
            return False
    
    def create_database(self) -> bool:
        """Create the database if it doesn't exist"""
        try:
            # SECURITY: Validate database name to prevent SQL injection
            validated_db_name = validate_database_name(self.settings.postgres_db)
            logger.info(f"Creating database: {validated_db_name}")
            
            conn = psycopg2.connect(
                host=self.settings.postgres_host,
                port=self.settings.postgres_port,
                user=self.settings.postgres_user,
                password=self.settings.postgres_password,
                database='postgres'
            )
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()
            
            # Use validated name in query
            cursor.execute(
                f'CREATE DATABASE "{validated_db_name}"'
            )
            
            cursor.close()
            conn.close()
            
            logger.info(f"Database {validated_db_name} created successfully")
            return True
        except Exception as e:
            logger.error(f"Error creating database: {e}")
            return False
    
    def initialize_engine(self) -> bool:
        """Initialize SQLAlchemy engine and session maker"""
        try:
            connection_url = self.get_connection_url(with_db=True)
            self.engine = create_engine(
                connection_url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                echo=False
            )
            self.SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=self.engine
            )
            
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            logger.info("Database engine initialized successfully")
            self._initialized = True
            return True
        except Exception as e:
            logger.error(f"Error initializing database engine: {e}")
            return False
    
    def check_tables_exist(self) -> dict:
        """Check which tables exist in the database"""
        if not self._initialized or not self.engine:
            return {}
        
        try:
            inspector = inspect(self.engine)
            existing_tables = inspector.get_table_names()
            
            required_tables = [
                'task',
                'review_detail',
                'contributor',
                'data_sync_log',
                'task_reviewed_info'
            ]
            
            table_status = {}
            for table in required_tables:
                table_status[table] = table in existing_tables
            
            return table_status
        except Exception as e:
            logger.error(f"Error checking tables: {e}")
            return {}
    
    def create_tables(self) -> bool:
        """Create all tables defined in the models"""
        if not self._initialized or not self.engine:
            logger.error("Database engine not initialized")
            return False
        
        try:
            logger.info("Creating database tables...")
            Base.metadata.create_all(bind=self.engine)
            logger.info("All tables created successfully")
            return True
        except Exception as e:
            logger.error(f"Error creating tables: {e}")
            return False
    
    @contextmanager
    def get_session(self) -> Generator[Session, None, None]:
        """Get a database session with automatic cleanup"""
        if not self._initialized or not self.SessionLocal:
            raise RuntimeError("Database not initialized")
        
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            session.close()
    
    def initialize(self) -> bool:
        """Complete initialization process"""
        try:
            logger.info("Starting database initialization...")
            
            db_exists = self.check_database_exists()
            logger.info(f"Database exists: {db_exists}")
            
            if not db_exists:
                logger.info("Database does not exist, creating...")
                if not self.create_database():
                    logger.error("Failed to create database")
                    return False
            
            if not self.initialize_engine():
                logger.error("Failed to initialize database engine")
                return False
            
            table_status = self.check_tables_exist()
            logger.info(f"Table status: {table_status}")
            
            if not all(table_status.values()):
                logger.info("Some tables are missing, creating...")
                if not self.create_tables():
                    logger.error("Failed to create tables")
                    return False
            
            logger.info("Database initialization completed successfully")
            return True
        except Exception as e:
            logger.error(f"Error during database initialization: {e}")
            return False
    
    def get_table_row_count(self, table_name: str) -> int:
        """
        Get the number of rows in a table.
        
        Args:
            table_name: Name of the table (must be in VALID_TABLE_NAMES whitelist)
            
        Returns:
            Row count, or 0 if table doesn't exist or on error
            
        Raises:
            ValueError: If table_name is not in the whitelist (SQL injection prevention)
        """
        if not self._initialized or not self.engine:
            return 0
        
        # SECURITY: Validate table name against whitelist to prevent SQL injection
        validated_table = validate_table_name(table_name)
        
        # Use circuit breaker for database operations
        cb = get_circuit_breaker("postgresql")
        
        def _execute_count():
            with track_db_operation('count', validated_table):
                with self.engine.connect() as conn:
                    result = conn.execute(
                        text(f'SELECT COUNT(*) FROM "{validated_table}"')
                    )
                    return result.scalar() or 0
        
        try:
            return cb.call(_execute_count)
        except CircuitBreakerError:
            logger.warning(f"Circuit breaker open for PostgreSQL, returning 0 for {validated_table} count")
            return 0
        except Exception as e:
            logger.error(f"Error getting row count for {validated_table}: {e}")
            return 0
    
    def get_pool_status(self) -> dict:
        """Get connection pool status for monitoring."""
        if not self.engine or not self.engine.pool:
            return {"status": "not_initialized"}
        
        pool = self.engine.pool
        
        try:
            status = {
                "pool_size": pool.size(),
                "checked_in": pool.checkedin(),
                "checked_out": pool.checkedout(),
                "overflow": pool.overflow(),
                "invalid": pool.invalidatedcount() if hasattr(pool, 'invalidatedcount') else 0,
            }
            
            # Update Prometheus metrics
            DB_CONNECTION_POOL_SIZE.set(pool.size())
            DB_CONNECTION_POOL_AVAILABLE.set(pool.checkedin())
            
            return status
        except Exception as e:
            logger.warning(f"Could not get pool status: {e}")
            return {"status": "error", "error": str(e)}
    
    def close(self):
        """Close database connections"""
        if self.engine:
            self.engine.dispose()
            logger.info("Database connections closed")


_db_service = None


def get_db_service() -> DatabaseService:
    """Get or create the global database service instance"""
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager to get a database session"""
    db_service = get_db_service()
    if not db_service._initialized:
        db_service.initialize()
    
    session = db_service.SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
