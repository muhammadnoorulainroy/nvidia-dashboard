"""
Request validation schemas for nvidia dashboard API.

These schemas validate query parameters and request bodies to ensure:
- Type safety
- Value constraints
- Business rule compliance
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Literal
from datetime import date, datetime
import re

from app.constants import get_constants


# =============================================================================
# Date Validation Mixin
# =============================================================================

class DateRangeMixin(BaseModel):
    """Mixin for date range validation."""
    
    start_date: Optional[str] = Field(
        None,
        description="Start date in YYYY-MM-DD format",
        examples=["2024-01-01"]
    )
    end_date: Optional[str] = Field(
        None,
        description="End date in YYYY-MM-DD format",
        examples=["2024-12-31"]
    )
    
    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def validate_date_format(cls, v):
        if v is None:
            return v
        if isinstance(v, (date, datetime)):
            return v.strftime("%Y-%m-%d")
        # Validate date format
        date_pattern = r"^\d{4}-\d{2}-\d{2}$"
        if not re.match(date_pattern, str(v)):
            raise ValueError(f"Date must be in YYYY-MM-DD format, got: {v}")
        # Validate it's a real date
        try:
            datetime.strptime(str(v), "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"Invalid date: {v}")
        return str(v)
    
    @model_validator(mode="after")
    def validate_date_range(self):
        if self.start_date and self.end_date:
            start = datetime.strptime(self.start_date, "%Y-%m-%d")
            end = datetime.strptime(self.end_date, "%Y-%m-%d")
            if start > end:
                raise ValueError("start_date must be before or equal to end_date")
        return self


# =============================================================================
# Filter Query Parameters
# =============================================================================

class StatsFilterParams(DateRangeMixin):
    """Common filter parameters for statistics endpoints."""
    
    domain: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Filter by domain name"
    )
    reviewer: Optional[int] = Field(
        None,
        gt=0,
        description="Filter by reviewer ID (must be positive integer)"
    )
    trainer: Optional[int] = Field(
        None,
        gt=0,
        description="Filter by trainer ID (must be positive integer)"
    )
    
    @field_validator("reviewer", "trainer", mode="before")
    @classmethod
    def validate_id_parameter(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            if not v.isdigit():
                raise ValueError("ID must be a positive integer")
            return int(v)
        return v


class TimeframeParams(BaseModel):
    """Parameters for timeframe-based queries."""
    
    timeframe: Literal["daily", "weekly", "monthly", "overall"] = Field(
        "overall",
        description="Aggregation timeframe"
    )


class PaginationParams(BaseModel):
    """Pagination parameters for list endpoints."""
    
    page: int = Field(
        1,
        ge=1,
        le=10000,
        description="Page number (1-indexed)"
    )
    page_size: int = Field(
        50,
        ge=1,
        le=500,
        description="Number of items per page (max 500)"
    )
    
    @property
    def offset(self) -> int:
        """Calculate offset for database query."""
        return (self.page - 1) * self.page_size
    
    @property
    def limit(self) -> int:
        """Get limit for database query."""
        return self.page_size


class SortParams(BaseModel):
    """Sorting parameters for list endpoints."""
    
    sort_by: Optional[str] = Field(
        None,
        max_length=50,
        description="Field to sort by"
    )
    sort_order: Literal["asc", "desc"] = Field(
        "desc",
        description="Sort order"
    )
    
    @field_validator("sort_by")
    @classmethod
    def validate_sort_field(cls, v):
        if v is None:
            return v
        # Only allow alphanumeric and underscore
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", v):
            raise ValueError("Invalid sort field name")
        return v


# =============================================================================
# Specific Endpoint Query Parameters
# =============================================================================

class DomainStatsQuery(StatsFilterParams):
    """Query parameters for domain statistics endpoint."""
    pass


class ReviewerStatsQuery(StatsFilterParams):
    """Query parameters for reviewer statistics endpoint."""
    pass


class TrainerStatsQuery(StatsFilterParams):
    """Query parameters for trainer statistics endpoint."""
    pass


class DailyStatsQuery(DateRangeMixin, PaginationParams):
    """Query parameters for daily statistics endpoints."""
    
    contributor_id: Optional[int] = Field(
        None,
        gt=0,
        description="Filter by contributor ID"
    )
    
    @field_validator("contributor_id", mode="before")
    @classmethod
    def validate_contributor_id(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            if not v.isdigit():
                raise ValueError("contributor_id must be a positive integer")
            return int(v)
        return v


class RatingTrendsQuery(DateRangeMixin, TimeframeParams):
    """Query parameters for rating trends endpoint."""
    
    domain: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Filter by domain"
    )


class TaskLevelQuery(DateRangeMixin, PaginationParams):
    """Query parameters for task-level endpoint."""
    
    domain: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Filter by domain"
    )
    status: Optional[str] = Field(
        None,
        max_length=50,
        description="Filter by task status"
    )
    trainer_id: Optional[int] = Field(
        None,
        gt=0,
        description="Filter by trainer ID"
    )
    reviewer_id: Optional[int] = Field(
        None,
        gt=0,
        description="Filter by reviewer ID"
    )


class PodLeadStatsQuery(DateRangeMixin, TimeframeParams):
    """Query parameters for POD lead statistics endpoint."""
    
    project_id: Optional[int] = Field(
        None,
        description="Filter by project ID. None = all projects"
    )
    
    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, v):
        if v is None:
            return v
        valid_ids = get_constants().projects.PRIMARY_PROJECT_IDS
        if v not in valid_ids:
            raise ValueError(f"project_id must be one of {valid_ids}")
        return v


class ProjectStatsQuery(DateRangeMixin):
    """Query parameters for project statistics endpoint."""
    pass


# =============================================================================
# Request Bodies
# =============================================================================

class SyncRequest(BaseModel):
    """Request body for manual sync trigger."""
    
    sync_type: Literal["full", "incremental"] = Field(
        "incremental",
        description="Type of sync to perform"
    )
    tables: Optional[List[str]] = Field(
        None,
        description="Specific tables to sync (None = all tables)"
    )
    
    @field_validator("tables")
    @classmethod
    def validate_tables(cls, v):
        if v is None:
            return v
        valid_tables = [
            "task", "review_detail", "contributor", "task_reviewed_info",
            "task_aht", "contributor_task_stats", "contributor_daily_stats",
            "reviewer_daily_stats", "task_raw", "task_history_raw",
            "pod_lead_mapping", "jibble_hours"
        ]
        for table in v:
            if table not in valid_tables:
                raise ValueError(f"Invalid table: {table}. Valid tables: {valid_tables}")
        return v
