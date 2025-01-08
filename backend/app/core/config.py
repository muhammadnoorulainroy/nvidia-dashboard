"""
Configuration management for nvidia dashboard application.

All sensitive credentials MUST be provided via environment variables or .env file.
See .env.example for required variables.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from functools import lru_cache
from typing import Optional, List
import os


class Settings(BaseSettings):
    """
    Application settings with environment variable support.
    
    SECURITY: No default values for sensitive credentials.
    All secrets must be explicitly set via environment variables or .env file.
    """
    
    # ==========================================================================
    # Application Settings (safe defaults)
    # ==========================================================================
    app_name: str = "Nvidia Dashboard API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8001
    
    # ==========================================================================
    # PostgreSQL Settings - REQUIRED (no defaults for credentials)
    # ==========================================================================
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str  # REQUIRED - no default
    postgres_password: str  # REQUIRED - no default  
    postgres_db: str  # REQUIRED - no default
    
    # ==========================================================================
    # BigQuery Settings
    # ==========================================================================
    gcp_project_id: str  # REQUIRED - no default
    bigquery_dataset: str  # REQUIRED - no default
    conversation_table: str = "conversation"
    review_table: str = "review"
    project_id_filter: int  # REQUIRED - no default
    
    # Google Cloud Credentials (path to service account JSON)
    google_application_credentials: Optional[str] = None
    
    # ==========================================================================
    # API Settings
    # ==========================================================================
    api_prefix: str = "/api"
    
    # CORS Settings - MUST be explicitly configured for production
    # Default to restrictive; override in .env for specific origins
    cors_origins: str = "http://localhost:3001"  # Comma-separated list
    
    # Pagination
    default_page_size: int = 100
    max_page_size: int = 1000
    
    # ==========================================================================
    # Data Sync Settings
    # ==========================================================================
    sync_interval_hours: int = 1
    initial_sync_on_startup: bool = True
    
    # ==========================================================================
    # Project Settings
    # ==========================================================================
    project_start_date: str = "2025-09-26"  # Format: YYYY-MM-DD
    
    # ==========================================================================
    # Rate Limiting Settings
    # ==========================================================================
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 100  # Requests per window
    rate_limit_window: str = "minute"  # Window: second, minute, hour, day
    rate_limit_sync_requests: int = 5  # Stricter limit for sync endpoint
    rate_limit_sync_window: str = "minute"
    
    # ==========================================================================
    # Jibble Settings (Optional - for time tracking integration)
    # ==========================================================================
    jibble_api_key: Optional[str] = None
    jibble_api_secret: Optional[str] = None
    jibble_api_url: str = "https://workspace.prod.jibble.io/v1"
    jibble_time_tracking_url: str = "https://time-tracking.prod.jibble.io/v1"
    jibble_time_attendance_url: str = "https://time-attendance.prod.jibble.io/v1"
    jibble_project_name: str = "Nvidia - SysBench"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # Note: Password validation is done in model_validator to access debug flag
    
    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from various formats (JSON array or comma-separated)"""
        import json
        
        if isinstance(v, list):
            return ','.join(v)
        if isinstance(v, str):
            # Check if it's a JSON array string like '["http://...", "http://..."]'
            v = v.strip()
            if v.startswith('[') and v.endswith(']'):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return ','.join(str(item) for item in parsed)
                except json.JSONDecodeError:
                    pass
            return v
        return str(v) if v else ""
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Get CORS origins as a list"""
        if not self.cors_origins:
            return []
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]
    
    @model_validator(mode='after')
    def validate_required_settings(self):
        """Validate that all required settings are properly configured"""
        import logging
        logger = logging.getLogger(__name__)
        
        errors = []
        warnings = []
        
        # Check PostgreSQL settings
        if not self.postgres_user:
            errors.append("POSTGRES_USER is required")
        if not self.postgres_password:
            errors.append("POSTGRES_PASSWORD is required")
        if not self.postgres_db:
            errors.append("POSTGRES_DB is required")
            
        # Check for weak passwords
        weak_passwords = {'postgres', 'password', 'admin', '123456', 'root', ''}
        if self.postgres_password and self.postgres_password.lower() in weak_passwords:
            if self.debug:
                # Allow in debug mode but warn
                warnings.append(
                    f"POSTGRES_PASSWORD is set to a weak default '{self.postgres_password}'. "
                    "This is allowed in DEBUG mode but MUST be changed for production."
                )
            else:
                errors.append(
                    "POSTGRES_PASSWORD cannot be a common default value in production. "
                    "Please set a secure password in your .env file."
                )
            
        # Check BigQuery settings
        if not self.gcp_project_id:
            errors.append("GCP_PROJECT_ID is required")
        if not self.bigquery_dataset:
            errors.append("BIGQUERY_DATASET is required")
        if self.project_id_filter is None:
            errors.append("PROJECT_ID_FILTER is required")
        
        # Warn about CORS in production
        if not self.debug and '*' in self.cors_origins:
            errors.append(
                "CORS_ORIGINS cannot be '*' in production (debug=False). "
                "Please specify allowed origins explicitly."
            )
        
        # Log warnings
        for warning in warnings:
            logger.warning(f"CONFIG WARNING: {warning}")
        
        if errors:
            raise ValueError(
                "Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors) +
                "\n\nPlease check your .env file. See .env.example for required variables."
            )
        
        return self
    
    def log_config_summary(self) -> str:
        """Return a safe summary of configuration (no secrets)"""
        return (
            f"Configuration Summary:\n"
            f"  App: {self.app_name} v{self.app_version}\n"
            f"  Debug: {self.debug}\n"
            f"  Host: {self.host}:{self.port}\n"
            f"  PostgreSQL: {self.postgres_host}:{self.postgres_port}/{self.postgres_db}\n"
            f"  BigQuery: {self.gcp_project_id}.{self.bigquery_dataset}\n"
            f"  Project ID Filter: {self.project_id_filter}\n"
            f"  CORS Origins: {self.cors_origins_list}\n"
            f"  Jibble Configured: {bool(self.jibble_api_key and self.jibble_api_secret)}"
        )


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Raises ValidationError if required environment variables are not set.
    """
    return Settings()
