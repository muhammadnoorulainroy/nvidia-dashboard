"""
Configuration management for nvidia dashboard application.

All values are loaded from environment variables or .env file.
See .env.example for required variables.

IMPORTANT: Required fields have no defaults - app will fail to start if not configured.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from functools import lru_cache
from typing import Optional, List
import logging


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Required fields (no defaults) - MUST be set in .env:
    - Database credentials
    - BigQuery settings
    - CORS origins
    
    Optional fields have sensible defaults but can be overridden.
    """
    
    # ==========================================================================
    # Application Settings (with sensible defaults)
    # ==========================================================================
    app_name: str = "Nvidia Dashboard API"
    app_version: str = "1.0.0"
    debug: bool = False  # Default to False for safety
    host: str = "0.0.0.0"
    port: int = 8001
    
    # ==========================================================================
    # PostgreSQL Settings - REQUIRED (no defaults for credentials)
    # ==========================================================================
    postgres_host: str  # Required - no default
    postgres_port: int = 5432  # Standard port, can override
    postgres_user: str  # Required - no default
    postgres_password: str  # Required - no default
    postgres_db: str  # Required - no default
    
    # ==========================================================================
    # BigQuery Settings - REQUIRED
    # ==========================================================================
    gcp_project_id: str  # Required - no default
    bigquery_dataset: str  # Required - no default
    conversation_table: str = "conversation"  # Table name, unlikely to change
    review_table: str = "review"  # Table name, unlikely to change
    project_id_filter: int  # Required - no default (project specific)
    
    # All Nvidia project IDs - can be overridden via env as JSON array
    all_project_ids: str = "36,37,38,39"  # Comma-separated, parsed to list
    
    # Project ID to Name mapping - loaded from env or uses defaults
    # NOTE: Project 37 is Multichallenge, Project 39 is CFBench Multilingual
    project_names_json: str = '{"36":"Nvidia - SysBench","37":"Nvidia - Multichallenge","38":"Nvidia - InverseIFEval","39":"Nvidia - CFBench Multilingual"}'
    
    @property
    def all_project_ids_list(self) -> List[int]:
        """Parse project IDs from comma-separated string"""
        return [int(x.strip()) for x in self.all_project_ids.split(',') if x.strip()]
    
    @property
    def project_names(self) -> dict:
        """Parse project names from JSON string"""
        import json
        try:
            return {int(k): v for k, v in json.loads(self.project_names_json).items()}
        except (json.JSONDecodeError, ValueError):
            return {}
    
    # Google Cloud Credentials - Optional (can use default credentials)
    google_application_credentials: Optional[str] = None
    
    # ==========================================================================
    # API Settings
    # ==========================================================================
    api_prefix: str = "/api"
    
    # CORS Settings (default allows common local development origins)
    cors_origins: str = "http://localhost:3001,http://localhost:8001,http://127.0.0.1:3001,http://127.0.0.1:8001"
    
    # Pagination (sensible defaults)
    default_page_size: int = 100
    max_page_size: int = 1000
    
    # ==========================================================================
    # Data Sync Settings (sensible defaults)
    # ==========================================================================
    sync_interval_hours: int = 1
    initial_sync_on_startup: bool = True
    
    # ==========================================================================
    # Project Settings - REQUIRED
    # ==========================================================================
    project_start_date: str  # Required - no default (project specific)
    
    # ==========================================================================
    # Rate Limiting Settings (sensible defaults)
    # ==========================================================================
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 100
    rate_limit_window: str = "minute"
    rate_limit_sync_requests: int = 5
    rate_limit_sync_window: str = "minute"
    
    # ==========================================================================
    # Jibble Settings - Optional (features disabled if not set)
    # ==========================================================================
    jibble_api_key: Optional[str] = None
    jibble_api_secret: Optional[str] = None
    jibble_api_url: str = "https://workspace.prod.jibble.io/v1"
    jibble_time_tracking_url: str = "https://time-tracking.prod.jibble.io/v1"
    jibble_time_attendance_url: str = "https://time-attendance.prod.jibble.io/v1"
    jibble_project_name: Optional[str] = None
    
    # Nvidia Jibble Project IDs (UUIDs from Jibble API)
    # These are the project IDs for filtering time entries
    jibble_nvidia_project_ids: str = ",".join([
        "a1b6c34e-67cd-4554-8a7b-4cab2d0fa744",  # Nvidia - Multichallenge (Project 37)
        "16e16c63-6deb-4f3c-9d88-46537c006dc9",  # Nvidia - InverseIFEval (Project 38)
        "7c305ca8-9675-4edc-a51c-84ad0beaae78",  # Nvidia - CFBench Multilingual (Project 39)
        "2581d1d5-e729-437f-92aa-2e3d7ceebc4f",  # Nvidia - Multichallenge Advanced (Project 37)
        "1f33fccc-9c95-409a-b17c-541bdd5e446e",  # Nvidia - ICPC (Project 36)
        "e6a4ebc3-5f25-42ce-806e-d23f9026d95b",  # NVIDIA_STEM Math_Eval (Project 36)
    ])
    
    # Jibble project name to dashboard project mapping
    # NOTE: Multichallenge = Project 37, CFBench Multilingual = Project 39
    jibble_project_mapping_json: str = '''{
        "Nvidia - Multichallenge": 37,
        "Nvidia - Multichallenge Advanced": 37,
        "Nvidia - InverseIFEval": 38,
        "Nvidia - CFBench Multilingual": 39,
        "Nvidia - ICPC": 36,
        "NVIDIA_STEM Math_Eval": 36,
        "Nvidia - SysBench": 36
    }'''
    
    # Google Sheet for Jibble email mapping
    jibble_email_mapping_sheet_id: str = "1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8"
    jibble_email_mapping_sheet_gid: str = "1375209319"
    
    # ==========================================================================
    # Financial Data Settings
    # ==========================================================================
    # Google Sheet for revenue data (Projects WoW Revenue tab)
    revenue_sheet_id: str = "1lpY2877xohw8pTLpjZCrt0bbHcX-ogzfBbsOP7DUIHA"
    revenue_sheet_gid: str = "1977702086"  # "Projects WoW Revenue" tab
    
    # BigQuery table for cost data (Jibble logs with Billings)
    cost_bigquery_project: str = "turing-230020"
    cost_bigquery_table: str = "turing-230020.test.Jibblelogs"
    
    # Jibble project names to include in cost queries
    cost_jibble_projects: str = "Nvidia - ICPC,Nvidia - CFBench Multilingual,Nvidia - InverseIFEval,Nvidia - Multichallenge,Nvidia - Multichallenge Advanced,Nvidia - SysBench,NVIDIA_STEM Math_Eval,Nvidia - ScaleRTL,Nvidia - VERILOG,Nvidia - cuBench,Nvidia - CUDA,Nvidia - FACTUALITY (VQA),Nvidia-pilots-and-proposals"
    
    @property
    def cost_jibble_projects_list(self) -> List[str]:
        """Get cost Jibble project names as a list"""
        return [p.strip() for p in self.cost_jibble_projects.split(',') if p.strip()]
    
    @property
    def jibble_nvidia_project_ids_list(self) -> List[str]:
        """Get Nvidia Jibble project IDs as a list"""
        if not self.jibble_nvidia_project_ids:
            return []
        return [pid.strip() for pid in self.jibble_nvidia_project_ids.split(',') if pid.strip()]
    
    @property
    def jibble_project_mapping(self) -> dict:
        """Get Jibble project name to dashboard project ID mapping"""
        import json
        try:
            return json.loads(self.jibble_project_mapping_json)
        except json.JSONDecodeError:
            return {}
    
    # ==========================================================================
    # Sentry Settings - Optional (error tracking disabled if not set)
    # ==========================================================================
    sentry_dsn: Optional[str] = None
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1
    sentry_sample_rate: float = 1.0
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from various formats"""
        import json
        
        if isinstance(v, list):
            return ','.join(v)
        if isinstance(v, str):
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
    def validate_settings(self):
        """Validate settings and warn about weak configurations"""
        logger = logging.getLogger(__name__)
        
        # Check for weak passwords in production
        weak_passwords = {'postgres', 'password', 'admin', '123456', 'root', ''}
        if self.postgres_password and self.postgres_password.lower() in weak_passwords:
            if self.debug:
                logger.warning(
                    f"CONFIG WARNING: POSTGRES_PASSWORD appears weak. "
                    "This is allowed in DEBUG mode but MUST be changed for production."
                )
            else:
                raise ValueError(
                    "POSTGRES_PASSWORD cannot be a common default value in production. "
                    "Please set a secure password in your .env file."
                )
        
        # Warn about CORS wildcards in production
        if not self.debug and '*' in self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS cannot be '*' in production. "
                "Please specify allowed origins explicitly."
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
            f"  Jibble Configured: {bool(self.jibble_api_key and self.jibble_api_secret)}\n"
            f"  Sentry Configured: {bool(self.sentry_dsn)}"
        )


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Will raise ValidationError if required .env variables are missing.
    """
    return Settings()
