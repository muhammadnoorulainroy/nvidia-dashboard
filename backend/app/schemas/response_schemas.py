"""
Response schemas for nvidia dashboard API
"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class QualityDimensionStats(BaseModel):
    """Statistics for a single quality dimension"""
    name: str
    average_score: Optional[float] = None
    task_count: int = 0


class DomainAggregation(BaseModel):
    """Domain-level aggregation response"""
    domain: Optional[str] = "Unknown"
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []


class ReviewerAggregation(BaseModel):
    """Reviewer-level aggregation response"""
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []


class TrainerUnderReviewer(BaseModel):
    """Trainer stats under a reviewer"""
    trainer_id: Optional[int] = None
    trainer_name: Optional[str] = None
    trainer_email: Optional[str] = None
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []


class ReviewerWithTrainers(BaseModel):
    """Reviewer with nested trainers"""
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []
    trainers: List[TrainerUnderReviewer] = []


class TrainerLevelAggregation(BaseModel):
    """Trainer-level aggregation response"""
    trainer_id: Optional[int] = None
    trainer_name: Optional[str] = None
    trainer_email: Optional[str] = None
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    average_completion_time_hours: Optional[float] = None
    avg_aht_minutes: Optional[float] = None
    total_aht_minutes: Optional[float] = None
    aht_task_count: Optional[int] = None
    new_tasks_submitted: Optional[int] = None
    rework_submitted: Optional[int] = None
    total_unique_tasks: Optional[int] = None
    first_submission_date: Optional[str] = None
    last_submission_date: Optional[str] = None
    quality_dimensions: List[QualityDimensionStats] = []


class ReviewerUnderPodLead(BaseModel):
    """Reviewer stats under a POD Lead"""
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    task_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []


class PodLeadAggregation(BaseModel):
    """POD Lead aggregation with nested reviewers"""
    pod_lead_id: Optional[int] = None
    pod_lead_name: Optional[str] = None
    pod_lead_email: Optional[str] = None
    task_count: int = 0
    reviewer_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    quality_dimensions: List[QualityDimensionStats] = []
    reviewers: List[ReviewerUnderPodLead] = []


class ReviewerDailyStats(BaseModel):
    """Reviewer daily statistics - reviewer x date level"""
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    review_date: Optional[str] = None
    unique_tasks_reviewed: int = 0
    new_tasks_reviewed: int = 0
    rework_reviewed: int = 0
    total_reviews: int = 0
    tasks_ready_for_delivery: int = 0
    sum_number_of_turns: int = 0
    avg_rework: Optional[float] = None
    rework_percent: Optional[float] = None
    avg_rating: Optional[float] = None


class OverallAggregation(BaseModel):
    """Overall aggregation response"""
    task_count: int = 0
    reviewer_count: int = 0
    trainer_count: int = 0
    domain_count: int = 0
    average_task_score: Optional[float] = None
    total_rework_count: int = 0
    average_rework_count: float = 0.0
    average_completion_time_hours: Optional[float] = None
    quality_dimensions: List[QualityDimensionStats] = []


class TaskLevelInfo(BaseModel):
    """Task-level information response"""
    task_id: int
    task_score: Optional[float] = None
    annotator_id: Optional[int] = None
    annotator_name: Optional[str] = None
    annotator_email: Optional[str] = None
    reviewer_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None
    colab_link: Optional[str] = None
    updated_at: Optional[str] = None
    week_number: Optional[int] = None
    rework_count: Optional[int] = None
    duration_minutes: Optional[float] = None
    quality_dimensions: Dict[str, float] = {}


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str


class ErrorResponse(BaseModel):
    """Error response"""
    detail: str
