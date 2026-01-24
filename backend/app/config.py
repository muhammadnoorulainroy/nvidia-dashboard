"""
Configuration management for nvidia dashboard application
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application Settings
    app_name: str = "Nvidia Dashboard API"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8001  # Different port from main dashboard
    
    # BigQuery Settings - Nvidia specific
    gcp_project_id: str = "turing-gpt"
    bigquery_dataset: str = "prod_labeling_tool_n"  # Nvidia dataset
    conversation_table: str = "conversation"
    review_table: str = "review"
    project_id_filter: int = 36  # Default Nvidia project ID (SysBench)
    
    # All Nvidia project IDs
    all_project_ids: list = [36, 37, 38, 39]
    
    # Project ID to Name mapping
    @property
    def project_names(self) -> dict:
        return {
            36: "Nvidia - SysBench",
            37: "Nvidia - CFBench Multilingual",
            38: "Nvidia - InverseIFEval",
            39: "Nvidia - Multichallenge",
        }
    
    # Google Cloud Credentials
    google_application_credentials: Optional[str] = None
    
    # API Settings
    api_prefix: str = "/api"
    
    # CORS Settings
    cors_origins: list = ["*"]
    
    # Pagination
    default_page_size: int = 100
    max_page_size: int = 1000
    
    # PostgreSQL Settings (nvidia)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "nvidia"
    
    # Data Sync Settings
    sync_interval_hours: int = 1
    initial_sync_on_startup: bool = True
    
    # S3 Settings (nvidia-specific if needed)
    s3_bucket: str = "agi-ds-turing"
    s3_prefix: str = "Nova Deep Research - Turing Scale-Up/outputData/"
    s3_aws_profile: str = "amazon"  # AWS CLI profile name
    
    # AWS Credentials
    aws_region: Optional[str] = None
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_role_arn: Optional[str] = None
    aws_s3_bucket_name: Optional[str] = None
    
    # Project Settings
    project_start_date: str = "2025-09-26"  # Format: YYYY-MM-DD
    
    # Jibble Settings
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


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
