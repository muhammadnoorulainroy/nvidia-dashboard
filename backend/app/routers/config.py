"""
Configuration API endpoints.

Provides unified API for all project configurations:
- AHT (Average Handling Time) settings
- Throughput targets (trainer/reviewer)
- Performance weights
- Classification thresholds
- Effort thresholds

All configurations support:
- Per-project settings
- Entity-level overrides (trainer/reviewer specific)
- Historical tracking with effective dates
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date

from ..services.db_service import get_db_service
from ..services.configuration_service import get_configuration_service, ConfigType
from ..models.db_models import AHTConfiguration
from sqlalchemy import text

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["Configuration"])


# ==================== Pydantic Models ====================

class AHTConfigResponse(BaseModel):
    """Response model for AHT configuration."""
    id: int
    project_id: int
    project_name: str
    new_task_aht: float
    rework_aht: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class AHTConfigUpdate(BaseModel):
    """Request model for updating AHT configuration."""
    new_task_aht: float = Field(..., ge=0.1, le=100, description="Expected hours for new tasks (0.1-100)")
    rework_aht: float = Field(..., ge=0.1, le=100, description="Expected hours for rework tasks (0.1-100)")
    updated_by: Optional[str] = Field(None, description="Email of user making the update")


class AHTConfigCreate(BaseModel):
    """Request model for creating AHT configuration."""
    project_id: int
    project_name: str
    new_task_aht: float = Field(10.0, ge=0.1, le=100, description="Expected hours for new tasks")
    rework_aht: float = Field(4.0, ge=0.1, le=100, description="Expected hours for rework tasks")


# ==================== Helper Functions ====================

def initialize_default_configs(session):
    """Initialize default AHT configurations for all projects if they don't exist."""
    # Default projects
    default_projects = [
        {"project_id": 36, "project_name": "Nvidia - SysBench"},
        {"project_id": 37, "project_name": "Nvidia - CFBench Multilingual"},
        {"project_id": 38, "project_name": "Nvidia - InverseIFEval"},
        {"project_id": 39, "project_name": "Nvidia - Multichallenge"},
    ]
    
    for proj in default_projects:
        existing = session.query(AHTConfiguration).filter(
            AHTConfiguration.project_id == proj["project_id"]
        ).first()
        
        if not existing:
            config = AHTConfiguration(
                project_id=proj["project_id"],
                project_name=proj["project_name"],
                new_task_aht=10.0,
                rework_aht=4.0
            )
            session.add(config)
    
    session.commit()


# ==================== API Endpoints ====================

@router.get(
    "/aht",
    response_model=List[AHTConfigResponse],
    summary="Get all AHT configurations"
)
async def get_all_aht_configs():
    """
    Get AHT configurations for all projects.
    
    Returns a list of all project AHT configurations with their current values.
    If no configurations exist, default values are created for known projects.
    """
    try:
        db_service = get_db_service()
        with db_service.get_session() as session:
            # Initialize defaults if needed
            initialize_default_configs(session)
            
            # Get all configurations
            configs = session.query(AHTConfiguration).order_by(AHTConfiguration.project_id).all()
            
            return [
                AHTConfigResponse(
                    id=c.id,
                    project_id=c.project_id,
                    project_name=c.project_name,
                    new_task_aht=c.new_task_aht,
                    rework_aht=c.rework_aht,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                    updated_by=c.updated_by
                )
                for c in configs
            ]
    except Exception as e:
        logger.error(f"Error getting AHT configurations: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/aht/{project_id}",
    response_model=AHTConfigResponse,
    summary="Get AHT configuration for a specific project"
)
async def get_aht_config(project_id: int):
    """
    Get AHT configuration for a specific project.
    
    If the project doesn't have a configuration, returns default values.
    """
    try:
        db_service = get_db_service()
        with db_service.get_session() as session:
            config = session.query(AHTConfiguration).filter(
                AHTConfiguration.project_id == project_id
            ).first()
            
            if not config:
                # Return default values
                return AHTConfigResponse(
                    id=0,
                    project_id=project_id,
                    project_name=f"Project {project_id}",
                    new_task_aht=10.0,
                    rework_aht=4.0,
                    created_at=None,
                    updated_at=None,
                    updated_by=None
                )
            
            return AHTConfigResponse(
                id=config.id,
                project_id=config.project_id,
                project_name=config.project_name,
                new_task_aht=config.new_task_aht,
                rework_aht=config.rework_aht,
                created_at=config.created_at,
                updated_at=config.updated_at,
                updated_by=config.updated_by
            )
    except Exception as e:
        logger.error(f"Error getting AHT configuration for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/aht/{project_id}",
    response_model=AHTConfigResponse,
    summary="Update AHT configuration for a project"
)
async def update_aht_config(project_id: int, update: AHTConfigUpdate):
    """
    Update AHT configuration for a specific project.
    
    Creates the configuration if it doesn't exist.
    """
    try:
        db_service = get_db_service()
        with db_service.get_session() as session:
            config = session.query(AHTConfiguration).filter(
                AHTConfiguration.project_id == project_id
            ).first()
            
            if config:
                # Update existing
                config.new_task_aht = update.new_task_aht
                config.rework_aht = update.rework_aht
                config.updated_by = update.updated_by
                config.updated_at = datetime.utcnow()
            else:
                # Create new
                config = AHTConfiguration(
                    project_id=project_id,
                    project_name=f"Project {project_id}",
                    new_task_aht=update.new_task_aht,
                    rework_aht=update.rework_aht,
                    updated_by=update.updated_by
                )
                session.add(config)
            
            session.commit()
            session.refresh(config)
            
            logger.info(f"Updated AHT configuration for project {project_id}: new_task={update.new_task_aht}h, rework={update.rework_aht}h")
            
            return AHTConfigResponse(
                id=config.id,
                project_id=config.project_id,
                project_name=config.project_name,
                new_task_aht=config.new_task_aht,
                rework_aht=config.rework_aht,
                created_at=config.created_at,
                updated_at=config.updated_at,
                updated_by=config.updated_by
            )
    except Exception as e:
        logger.error(f"Error updating AHT configuration for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post(
    "/aht",
    response_model=AHTConfigResponse,
    summary="Create AHT configuration for a new project"
)
async def create_aht_config(config_data: AHTConfigCreate):
    """
    Create AHT configuration for a new project.
    """
    try:
        db_service = get_db_service()
        with db_service.get_session() as session:
            # Check if already exists
            existing = session.query(AHTConfiguration).filter(
                AHTConfiguration.project_id == config_data.project_id
            ).first()
            
            if existing:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Configuration for project {config_data.project_id} already exists"
                )
            
            config = AHTConfiguration(
                project_id=config_data.project_id,
                project_name=config_data.project_name,
                new_task_aht=config_data.new_task_aht,
                rework_aht=config_data.rework_aht
            )
            session.add(config)
            session.commit()
            session.refresh(config)
            
            logger.info(f"Created AHT configuration for project {config_data.project_id}")
            
            return AHTConfigResponse(
                id=config.id,
                project_id=config.project_id,
                project_name=config.project_name,
                new_task_aht=config.new_task_aht,
                rework_aht=config.rework_aht,
                created_at=config.created_at,
                updated_at=config.updated_at,
                updated_by=config.updated_by
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating AHT configuration: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== Generic Configuration Pydantic Models ====================

class ConfigValueModel(BaseModel):
    """Generic configuration value model."""
    config_value: Dict[str, Any] = Field(..., description="Configuration value as JSON object")


class ThroughputTargetRequest(BaseModel):
    """Request model for setting throughput target."""
    target: float = Field(..., ge=0.1, le=100, description="Daily target (0.1-100 tasks)")
    entity_type: str = Field("trainer", description="Entity type: 'trainer' or 'reviewer'")
    entity_id: Optional[int] = Field(None, description="Entity ID (null for project default)")
    entity_email: Optional[str] = Field(None, description="Entity email for easier lookups")
    updated_by: Optional[str] = Field(None, description="Email of user making the change")
    config_key: Optional[str] = Field(None, description="Config key: 'new_tasks_target' or 'rework_target'")


class ThroughputTargetResponse(BaseModel):
    """Response model for throughput target."""
    id: int
    project_id: int
    config_type: str
    config_key: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    entity_email: Optional[str]
    target: int
    effective_from: date
    effective_to: Optional[date]
    updated_at: Optional[datetime]
    updated_by: Optional[str]


class PerformanceWeightsRequest(BaseModel):
    """Request model for performance weights."""
    throughput: float = Field(..., ge=0, le=100, description="Throughput weight (0-100)")
    avg_rating: float = Field(..., ge=0, le=100, description="Average rating weight (0-100)")
    rating_change: float = Field(..., ge=0, le=100, description="Rating change weight (0-100)")
    rework_rate: float = Field(..., ge=0, le=100, description="Rework rate weight (0-100)")
    delivered: float = Field(..., ge=0, le=100, description="Delivered weight (0-100)")
    updated_by: Optional[str] = Field(None, description="Email of user making the change")


class PerformanceWeightsResponse(BaseModel):
    """Response model for performance weights."""
    project_id: int
    throughput: float
    avg_rating: float
    rating_change: float
    rework_rate: float
    delivered: float
    updated_at: Optional[datetime]
    updated_by: Optional[str]


class ClassificationThresholdsRequest(BaseModel):
    """Request model for A/B/C classification thresholds."""
    a_min_score: float = Field(..., ge=0, le=100, description="Minimum score for A classification")
    b_min_score: float = Field(..., ge=0, le=100, description="Minimum score for B classification")
    updated_by: Optional[str] = Field(None, description="Email of user making the change")


class ClassificationThresholdsResponse(BaseModel):
    """Response model for classification thresholds."""
    project_id: int
    A: Dict[str, Any]
    B: Dict[str, Any]
    C: Dict[str, Any]
    updated_at: Optional[datetime]
    updated_by: Optional[str]


class EffortThresholdsRequest(BaseModel):
    """Request model for effort variance thresholds (time theft detection)."""
    over_threshold: float = Field(..., ge=0, le=100, description="Flag if actual > expected by this % (e.g., 20)")
    under_threshold: float = Field(..., ge=-100, le=0, description="Flag if actual < expected by this % (e.g., -20)")
    updated_by: Optional[str] = Field(None, description="Email of user making the change")


class EffortThresholdsResponse(BaseModel):
    """Response model for effort thresholds."""
    project_id: int
    over_threshold: float
    under_threshold: float
    updated_at: Optional[datetime]
    updated_by: Optional[str]


# ==================== Throughput Targets Endpoints ====================

@router.get(
    "/targets/{project_id}",
    summary="Get all throughput targets for a project"
)
async def get_throughput_targets(project_id: int):
    """
    Get all throughput targets for a project.
    
    Returns both project-level defaults and entity-specific targets.
    """
    try:
        config_service = get_configuration_service()
        targets = config_service.get_all_throughput_targets(project_id)
        
        return {
            "project_id": project_id,
            "targets": [
                {
                    "id": t["id"],
                    "config_key": t["config_key"],
                    "entity_type": t["entity_type"],
                    "entity_id": t["entity_id"],
                    "entity_email": t["entity_email"],
                    "target": t["config_value"].get("target"),
                    "unit": t["config_value"].get("unit", "tasks"),
                    "effective_from": t["effective_from"],
                    "effective_to": t["effective_to"],
                    "updated_at": t["updated_at"],
                    "updated_by": t["updated_by"]
                }
                for t in targets
            ]
        }
    except Exception as e:
        logger.error(f"Error getting throughput targets: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/targets/{project_id}/default",
    summary="Get default throughput target for a project"
)
async def get_default_throughput_target(
    project_id: int,
    entity_type: str = Query("trainer", description="Entity type: 'trainer' or 'reviewer'")
):
    """Get the default throughput target for a project."""
    try:
        config_service = get_configuration_service()
        target = config_service.get_throughput_target(project_id, entity_type=entity_type)
        
        return {
            "project_id": project_id,
            "entity_type": entity_type,
            "target": target,
            "unit": "tasks"
        }
    except Exception as e:
        logger.error(f"Error getting default throughput target: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/targets/{project_id}",
    summary="Set throughput target"
)
async def set_throughput_target(project_id: int, request: ThroughputTargetRequest):
    """
    Set throughput target for a project or specific entity.
    
    If entity_id is provided, sets an entity-specific target.
    Otherwise, sets the project default target.
    
    config_key can be:
    - 'new_tasks_target': Target for new tasks
    - 'rework_target': Target for rework tasks
    - None: Uses default key based on entity_id
    """
    try:
        config_service = get_configuration_service()
        result = config_service.set_throughput_target(
            project_id=project_id,
            target=request.target,
            entity_type=request.entity_type,
            entity_id=request.entity_id,
            entity_email=request.entity_email,
            updated_by=request.updated_by,
            config_key=request.config_key
        )
        
        target_type = "new tasks" if request.config_key == "new_tasks_target" else "rework" if request.config_key == "rework_target" else "tasks"
        return {
            "success": True,
            "message": f"Target set to {request.target} {target_type}/day",
            "config": result
        }
    except Exception as e:
        logger.error(f"Error setting throughput target: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.post(
    "/targets/{project_id}/bulk",
    summary="Bulk set throughput targets"
)
async def bulk_set_throughput_targets(
    project_id: int,
    targets: List[Dict[str, Any]],
    entity_type: str = Query("trainer", description="Entity type"),
    updated_by: Optional[str] = Query(None, description="User making the change")
):
    """
    Bulk set throughput targets for multiple entities.
    
    Expected format for each target:
    {
        "entity_id": 123,
        "entity_email": "trainer@turing.com",
        "target": 5
    }
    """
    try:
        config_service = get_configuration_service()
        count = config_service.bulk_set_targets(
            project_id=project_id,
            targets=targets,
            entity_type=entity_type,
            updated_by=updated_by
        )
        
        return {
            "success": True,
            "message": f"Set {count} targets successfully",
            "count": count
        }
    except Exception as e:
        logger.error(f"Error bulk setting targets: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== Performance Weights Endpoints ====================

@router.get(
    "/weights/{project_id}",
    response_model=PerformanceWeightsResponse,
    summary="Get performance scoring weights"
)
async def get_performance_weights(project_id: int):
    """
    Get performance scoring weights for a project.
    
    Weights determine how the overall performance score is calculated.
    """
    try:
        config_service = get_configuration_service()
        weights = config_service.get_performance_weights(project_id)
        
        # Get metadata
        config = config_service.get_config(
            project_id=project_id,
            config_type=ConfigType.PERFORMANCE_WEIGHTS,
            config_key="default"
        )
        
        return PerformanceWeightsResponse(
            project_id=project_id,
            throughput=weights.get("throughput", 30),
            avg_rating=weights.get("avg_rating", 25),
            rating_change=weights.get("rating_change", 10),
            rework_rate=weights.get("rework_rate", 20),
            delivered=weights.get("delivered", 15),
            updated_at=config.get("updated_at") if config else None,
            updated_by=config.get("updated_by") if config else None
        )
    except Exception as e:
        logger.error(f"Error getting performance weights: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/weights/{project_id}",
    response_model=PerformanceWeightsResponse,
    summary="Set performance scoring weights"
)
async def set_performance_weights(project_id: int, request: PerformanceWeightsRequest):
    """
    Set performance scoring weights for a project.
    
    Weights must sum to 100.
    """
    try:
        total = request.throughput + request.avg_rating + request.rating_change + request.rework_rate + request.delivered
        if abs(total - 100) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Weights must sum to 100, got {total}"
            )
        
        config_service = get_configuration_service()
        result = config_service.set_performance_weights(
            project_id=project_id,
            weights={
                "throughput": request.throughput,
                "avg_rating": request.avg_rating,
                "rating_change": request.rating_change,
                "rework_rate": request.rework_rate,
                "delivered": request.delivered
            },
            updated_by=request.updated_by
        )
        
        return PerformanceWeightsResponse(
            project_id=project_id,
            throughput=request.throughput,
            avg_rating=request.avg_rating,
            rating_change=request.rating_change,
            rework_rate=request.rework_rate,
            delivered=request.delivered,
            updated_at=result.get("updated_at"),
            updated_by=result.get("updated_by")
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error setting performance weights: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== Classification Thresholds Endpoints ====================

@router.get(
    "/thresholds/{project_id}",
    response_model=ClassificationThresholdsResponse,
    summary="Get A/B/C classification thresholds"
)
async def get_classification_thresholds(project_id: int):
    """
    Get performer classification thresholds for a project.
    
    Defines score ranges for A/B/C performer buckets.
    """
    try:
        config_service = get_configuration_service()
        thresholds = config_service.get_classification_thresholds(project_id)
        
        config = config_service.get_config(
            project_id=project_id,
            config_type=ConfigType.CLASSIFICATION_THRESHOLD,
            config_key="performer_buckets"
        )
        
        return ClassificationThresholdsResponse(
            project_id=project_id,
            A=thresholds.get("A", {"min_score": 80, "label": "Top Performer"}),
            B=thresholds.get("B", {"min_score": 50, "label": "Average"}),
            C=thresholds.get("C", {"min_score": 0, "label": "Needs Improvement"}),
            updated_at=config.get("updated_at") if config else None,
            updated_by=config.get("updated_by") if config else None
        )
    except Exception as e:
        logger.error(f"Error getting classification thresholds: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/thresholds/{project_id}",
    response_model=ClassificationThresholdsResponse,
    summary="Set A/B/C classification thresholds"
)
async def set_classification_thresholds(project_id: int, request: ClassificationThresholdsRequest):
    """
    Set performer classification thresholds for a project.
    
    A threshold must be > B threshold.
    """
    try:
        if request.a_min_score <= request.b_min_score:
            raise HTTPException(
                status_code=400,
                detail="A threshold must be greater than B threshold"
            )
        
        config_service = get_configuration_service()
        result = config_service.set_classification_thresholds(
            project_id=project_id,
            thresholds={
                "A": {"min_score": request.a_min_score, "label": "Top Performer"},
                "B": {"min_score": request.b_min_score, "label": "Average"},
                "C": {"min_score": 0, "label": "Needs Improvement"}
            },
            updated_by=request.updated_by
        )
        
        return ClassificationThresholdsResponse(
            project_id=project_id,
            A={"min_score": request.a_min_score, "label": "Top Performer"},
            B={"min_score": request.b_min_score, "label": "Average"},
            C={"min_score": 0, "label": "Needs Improvement"},
            updated_at=result.get("updated_at"),
            updated_by=result.get("updated_by")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting classification thresholds: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== Effort Thresholds Endpoints ====================

@router.get(
    "/effort-thresholds/{project_id}",
    response_model=EffortThresholdsResponse,
    summary="Get effort variance thresholds"
)
async def get_effort_thresholds(project_id: int):
    """
    Get effort variance thresholds for time theft detection.
    
    Defines acceptable variance between actual hours and expected effort.
    """
    try:
        config_service = get_configuration_service()
        thresholds = config_service.get_effort_thresholds(project_id)
        
        config = config_service.get_config(
            project_id=project_id,
            config_type=ConfigType.EFFORT_THRESHOLD,
            config_key="variance"
        )
        
        return EffortThresholdsResponse(
            project_id=project_id,
            over_threshold=thresholds.get("over_threshold", 20),
            under_threshold=thresholds.get("under_threshold", -20),
            updated_at=config.get("updated_at") if config else None,
            updated_by=config.get("updated_by") if config else None
        )
    except Exception as e:
        logger.error(f"Error getting effort thresholds: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/effort-thresholds/{project_id}",
    response_model=EffortThresholdsResponse,
    summary="Set effort variance thresholds"
)
async def set_effort_thresholds(project_id: int, request: EffortThresholdsRequest):
    """
    Set effort variance thresholds for a project.
    
    Used for detecting time theft (hours submitted vs expected effort).
    """
    try:
        config_service = get_configuration_service()
        result = config_service.set_effort_thresholds(
            project_id=project_id,
            over_threshold=request.over_threshold,
            under_threshold=request.under_threshold,
            updated_by=request.updated_by
        )
        
        return EffortThresholdsResponse(
            project_id=project_id,
            over_threshold=request.over_threshold,
            under_threshold=request.under_threshold,
            updated_at=result.get("updated_at"),
            updated_by=result.get("updated_by")
        )
    except Exception as e:
        logger.error(f"Error setting effort thresholds: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== Generic Configuration Endpoints ====================

@router.get(
    "/generic/{project_id}/{config_type}",
    summary="Get generic configuration"
)
async def get_generic_config(
    project_id: int,
    config_type: str,
    config_key: str = Query("default", description="Configuration key")
):
    """
    Get a generic configuration value.
    
    Useful for custom configurations not covered by specific endpoints.
    """
    try:
        config_service = get_configuration_service()
        config = config_service.get_config(
            project_id=project_id,
            config_type=config_type,
            config_key=config_key
        )
        
        if not config:
            return {"project_id": project_id, "config_type": config_type, "config_key": config_key, "config_value": None}
        
        return config
    except Exception as e:
        logger.error(f"Error getting generic config: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.put(
    "/generic/{project_id}/{config_type}",
    summary="Set generic configuration"
)
async def set_generic_config(
    project_id: int,
    config_type: str,
    request: ConfigValueModel,
    config_key: str = Query("default", description="Configuration key"),
    updated_by: Optional[str] = Query(None, description="User making the change")
):
    """
    Set a generic configuration value.
    
    Useful for custom configurations not covered by specific endpoints.
    """
    try:
        config_service = get_configuration_service()
        result = config_service.set_config(
            project_id=project_id,
            config_type=config_type,
            config_key=config_key,
            config_value=request.config_value,
            updated_by=updated_by
        )
        
        return {
            "success": True,
            "config": result
        }
    except Exception as e:
        logger.error(f"Error setting generic config: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
