"""
PostgreSQL database connection and management service for nvidia
"""
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app.config import get_settings
from app.models.db_models import Base, Task, ReviewDetail, Contributor, DataSyncLog, WorkItem, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerTrainerDailyStats, PodLeadMapping, JibblePerson, JibbleTimeEntry, JibbleEmailMapping, JibbleHours

logger = logging.getLogger(__name__)


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
            logger.info(f"Creating database: {self.settings.postgres_db}")
            
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
                f'CREATE DATABASE "{self.settings.postgres_db}"'
            )
            
            cursor.close()
            conn.close()
            
            logger.info(f"Database {self.settings.postgres_db} created successfully")
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
                'work_item',
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
        """Get the number of rows in a table"""
        if not self._initialized or not self.engine:
            return 0
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text(f'SELECT COUNT(*) FROM "{table_name}"')
                )
                count = result.scalar()
                return count or 0
        except Exception as e:
            logger.error(f"Error getting row count for {table_name}: {e}")
            return 0
    
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
