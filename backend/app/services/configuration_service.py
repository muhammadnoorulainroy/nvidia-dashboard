"""
Configuration Service

Provides a unified interface for managing all project configurations:
- Throughput targets (trainer/reviewer)
- Performance weights
- Classification thresholds
- AHT settings
- And future configuration types

Features:
- Generic CRUD operations for any config type
- Historical tracking with effective dates
- Entity-level (trainer/reviewer) and project-level configs
- JSON value support for flexible data structures
"""
import json
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union
from enum import Enum

from sqlalchemy import and_, or_, func
from sqlalchemy.orm import Session

from ..models.db_models import ProjectConfiguration, AHTConfiguration
from .db_service import get_db_service

logger = logging.getLogger(__name__)


class ConfigType(str, Enum):
    """Supported configuration types."""
    THROUGHPUT_TARGET = "throughput_target"
    REVIEW_TARGET = "review_target"
    PERFORMANCE_WEIGHTS = "performance_weights"
    CLASSIFICATION_THRESHOLD = "classification_threshold"
    EFFORT_THRESHOLD = "effort_threshold"
    COLOR_CODING = "color_coding"
    GENERAL = "general"


class ConfigurationService:
    """
    Service for managing project configurations.
    
    Provides:
    - Generic configuration CRUD
    - Type-specific helper methods
    - Historical configuration tracking
    - Bulk operations
    """
    
    def __init__(self):
        self.db_service = get_db_service()
    
    # ==================== Generic Configuration Methods ====================
    
    def get_config(
        self,
        project_id: int,
        config_type: str,
        config_key: str = "default",
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        as_of_date: Optional[date] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific configuration.
        
        Args:
            project_id: Project ID
            config_type: Type of configuration
            config_key: Configuration key (default: "default")
            entity_type: Optional entity type for entity-level configs
            entity_id: Optional entity ID for entity-level configs
            as_of_date: Optional date for historical lookups (default: today)
        
        Returns:
            Configuration dict with parsed config_value, or None if not found
        """
        if as_of_date is None:
            as_of_date = date.today()
        
        with self.db_service.get_session() as session:
            query = session.query(ProjectConfiguration).filter(
                ProjectConfiguration.project_id == project_id,
                ProjectConfiguration.config_type == config_type,
                ProjectConfiguration.config_key == config_key,
                ProjectConfiguration.effective_from <= as_of_date,
                or_(
                    ProjectConfiguration.effective_to.is_(None),
                    ProjectConfiguration.effective_to >= as_of_date
                )
            )
            
            if entity_type and entity_id:
                query = query.filter(
                    ProjectConfiguration.entity_type == entity_type,
                    ProjectConfiguration.entity_id == entity_id
                )
            else:
                query = query.filter(
                    ProjectConfiguration.entity_type.is_(None)
                )
            
            config = query.first()
            
            if config:
                return self._config_to_dict(config)
            return None
    
    def get_configs_by_type(
        self,
        project_id: int,
        config_type: str,
        include_entity_level: bool = True,
        as_of_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all configurations of a specific type for a project.
        
        Args:
            project_id: Project ID
            config_type: Type of configuration
            include_entity_level: Whether to include entity-level configs
            as_of_date: Optional date for historical lookups
        
        Returns:
            List of configuration dicts
        """
        if as_of_date is None:
            as_of_date = date.today()
        
        with self.db_service.get_session() as session:
            query = session.query(ProjectConfiguration).filter(
                ProjectConfiguration.project_id == project_id,
                ProjectConfiguration.config_type == config_type,
                ProjectConfiguration.effective_from <= as_of_date,
                or_(
                    ProjectConfiguration.effective_to.is_(None),
                    ProjectConfiguration.effective_to >= as_of_date
                )
            )
            
            if not include_entity_level:
                query = query.filter(ProjectConfiguration.entity_type.is_(None))
            
            configs = query.all()
            return [self._config_to_dict(c) for c in configs]
    
    def set_config(
        self,
        project_id: int,
        config_type: str,
        config_value: Dict[str, Any],
        config_key: str = "default",
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        entity_email: Optional[str] = None,
        description: Optional[str] = None,
        updated_by: Optional[str] = None,
        effective_from: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Set a configuration value. Creates new or updates existing.
        
        For updates, the old config is expired (effective_to set) and
        a new config is created, maintaining history.
        
        Args:
            project_id: Project ID
            config_type: Type of configuration
            config_value: Configuration value (dict)
            config_key: Configuration key (default: "default")
            entity_type: Optional entity type
            entity_id: Optional entity ID
            entity_email: Optional entity email for easier lookups
            description: Optional description
            updated_by: Email of user making the change
            effective_from: When this config takes effect (default: today)
        
        Returns:
            The created/updated configuration dict
        """
        if effective_from is None:
            effective_from = date.today()
        
        with self.db_service.get_session() as session:
            # Find existing active config
            existing = session.query(ProjectConfiguration).filter(
                ProjectConfiguration.project_id == project_id,
                ProjectConfiguration.config_type == config_type,
                ProjectConfiguration.config_key == config_key,
                ProjectConfiguration.effective_to.is_(None)
            )
            
            if entity_type and entity_id:
                existing = existing.filter(
                    ProjectConfiguration.entity_type == entity_type,
                    ProjectConfiguration.entity_id == entity_id
                )
            else:
                existing = existing.filter(
                    ProjectConfiguration.entity_type.is_(None)
                )
            
            existing_config = existing.first()
            
            # Expire existing config if found
            if existing_config:
                existing_config.effective_to = effective_from
                existing_config.updated_at = datetime.utcnow()
                existing_config.updated_by = updated_by
            
            # Create new config
            # For JSONB columns, pass dict directly; for Text columns, json.dumps
            # config_value column is Text, so we always need to JSON serialize
            config_value_to_store = json.dumps(config_value) if isinstance(config_value, dict) else config_value
            
            new_config = ProjectConfiguration(
                project_id=project_id,
                config_type=config_type,
                config_key=config_key,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_email=entity_email,
                config_value=config_value_to_store,
                effective_from=effective_from,
                effective_to=None,
                description=description,
                created_by=updated_by,
                updated_by=updated_by,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            session.add(new_config)
            session.commit()
            session.refresh(new_config)
            
            logger.info(
                f"Set config: project={project_id}, type={config_type}, "
                f"key={config_key}, entity={entity_type}:{entity_id}"
            )
            
            return self._config_to_dict(new_config)
    
    def delete_config(
        self,
        project_id: int,
        config_type: str,
        config_key: str = "default",
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        updated_by: Optional[str] = None
    ) -> bool:
        """
        Delete (expire) a configuration.
        
        Doesn't physically delete - sets effective_to to today.
        
        Returns:
            True if config was found and expired, False otherwise
        """
        with self.db_service.get_session() as session:
            query = session.query(ProjectConfiguration).filter(
                ProjectConfiguration.project_id == project_id,
                ProjectConfiguration.config_type == config_type,
                ProjectConfiguration.config_key == config_key,
                ProjectConfiguration.effective_to.is_(None)
            )
            
            if entity_type and entity_id:
                query = query.filter(
                    ProjectConfiguration.entity_type == entity_type,
                    ProjectConfiguration.entity_id == entity_id
                )
            else:
                query = query.filter(
                    ProjectConfiguration.entity_type.is_(None)
                )
            
            config = query.first()
            
            if config:
                config.effective_to = date.today()
                config.updated_at = datetime.utcnow()
                config.updated_by = updated_by
                session.commit()
                logger.info(f"Deleted config: project={project_id}, type={config_type}, key={config_key}")
                return True
            
            return False
    
    # ==================== Throughput Target Methods ====================
    
    def get_throughput_target(
        self,
        project_id: int,
        entity_type: str = "trainer",
        entity_id: Optional[int] = None,
        entity_email: Optional[str] = None
    ) -> Optional[float]:
        """
        Get task-based throughput target for a trainer/reviewer (tasks per day).
        
        Falls back to project-level default if entity-specific not found.
        """
        # Try entity-specific first
        if entity_id:
            config = self.get_config(
                project_id=project_id,
                config_type=ConfigType.THROUGHPUT_TARGET,
                config_key="daily_tasks",
                entity_type=entity_type,
                entity_id=entity_id
            )
            if config:
                return config.get('config_value', {}).get('target')
        
        # Fall back to project default
        config = self.get_config(
            project_id=project_id,
            config_type=ConfigType.THROUGHPUT_TARGET,
            config_key="daily_tasks_default"
        )
        
        if config:
            return config.get('config_value', {}).get('target')
        
        return None
    
    def set_throughput_target(
        self,
        project_id: int,
        target: float,
        entity_type: str = "trainer",
        entity_id: Optional[int] = None,
        entity_email: Optional[str] = None,
        updated_by: Optional[str] = None,
        config_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Set task-based throughput target for a trainer/reviewer or project default.
        
        Supports separate targets for new tasks and rework:
        - config_key='new_tasks_target': Target for new tasks
        - config_key='rework_target': Target for rework tasks
        
        Achievement is calculated separately for each type.
        """
        # Determine config_key if not provided
        if config_key is None:
            config_key = "daily_tasks" if entity_id else "daily_tasks_default"
        
        # Determine unit based on config_key
        unit = "new_tasks" if config_key == "new_tasks_target" else "rework" if config_key == "rework_target" else "tasks"
        
        return self.set_config(
            project_id=project_id,
            config_type=ConfigType.THROUGHPUT_TARGET,
            config_key=config_key,
            config_value={"target": target, "unit": unit},
            entity_type=entity_type if entity_id else None,
            entity_id=entity_id,
            entity_email=entity_email,
            updated_by=updated_by
        )
    
    def get_all_throughput_targets(
        self,
        project_id: int,
        entity_type: str = "trainer"
    ) -> List[Dict[str, Any]]:
        """Get all throughput targets for a project, including entity-level."""
        return self.get_configs_by_type(
            project_id=project_id,
            config_type=ConfigType.THROUGHPUT_TARGET,
            include_entity_level=True
        )
    
    # ==================== Performance Weights Methods ====================
    
    def get_performance_weights(self, project_id: int) -> Dict[str, float]:
        """
        Get performance scoring weights for a project.
        
        Returns default weights if not configured:
        - throughput: 30%
        - avg_rating: 25%
        - rating_change: 10%
        - rework_rate: 20%
        - delivered: 15%
        """
        config = self.get_config(
            project_id=project_id,
            config_type=ConfigType.PERFORMANCE_WEIGHTS,
            config_key="default"
        )
        
        if config:
            return config.get('config_value', {})
        
        # Return defaults
        return {
            "throughput": 30,
            "avg_rating": 25,
            "rating_change": 10,
            "rework_rate": 20,
            "delivered": 15
        }
    
    def set_performance_weights(
        self,
        project_id: int,
        weights: Dict[str, float],
        updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Set performance scoring weights for a project.
        
        Weights should sum to 100.
        """
        total = sum(weights.values())
        if abs(total - 100) > 0.01:
            raise ValueError(f"Weights must sum to 100, got {total}")
        
        return self.set_config(
            project_id=project_id,
            config_type=ConfigType.PERFORMANCE_WEIGHTS,
            config_key="default",
            config_value=weights,
            description="Performance scoring weights",
            updated_by=updated_by
        )
    
    # ==================== Classification Thresholds Methods ====================
    
    def get_classification_thresholds(self, project_id: int) -> Dict[str, Dict[str, float]]:
        """
        Get A/B/C classification thresholds for a project.
        
        Returns default if not configured:
        - A: score >= 80
        - B: score >= 50
        - C: score < 50
        """
        config = self.get_config(
            project_id=project_id,
            config_type=ConfigType.CLASSIFICATION_THRESHOLD,
            config_key="performer_buckets"
        )
        
        if config:
            return config.get('config_value', {})
        
        # Return defaults
        return {
            "A": {"min_score": 80, "label": "Top Performer"},
            "B": {"min_score": 50, "label": "Average"},
            "C": {"min_score": 0, "label": "Needs Improvement"}
        }
    
    def set_classification_thresholds(
        self,
        project_id: int,
        thresholds: Dict[str, Dict[str, float]],
        updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Set A/B/C classification thresholds for a project."""
        return self.set_config(
            project_id=project_id,
            config_type=ConfigType.CLASSIFICATION_THRESHOLD,
            config_key="performer_buckets",
            config_value=thresholds,
            description="Performer classification thresholds",
            updated_by=updated_by
        )
    
    def classify_performer(self, project_id: int, score: float) -> str:
        """
        Classify a performer based on their score.
        
        Returns: 'A', 'B', or 'C'
        """
        thresholds = self.get_classification_thresholds(project_id)
        
        if score >= thresholds.get('A', {}).get('min_score', 80):
            return 'A'
        elif score >= thresholds.get('B', {}).get('min_score', 50):
            return 'B'
        else:
            return 'C'
    
    # ==================== Effort Thresholds Methods ====================
    
    def get_effort_thresholds(self, project_id: int) -> Dict[str, float]:
        """
        Get effort comparison thresholds (for time theft detection).
        
        Returns thresholds as percentages:
        - over_threshold: Flag if actual > expected by this %
        - under_threshold: Flag if actual < expected by this %
        """
        config = self.get_config(
            project_id=project_id,
            config_type=ConfigType.EFFORT_THRESHOLD,
            config_key="variance"
        )
        
        if config:
            return config.get('config_value', {})
        
        # Return defaults (20% variance threshold)
        return {
            "over_threshold": 20,  # Flag if actual > expected by 20%
            "under_threshold": -20  # Flag if actual < expected by 20%
        }
    
    def set_effort_thresholds(
        self,
        project_id: int,
        over_threshold: float,
        under_threshold: float,
        updated_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Set effort variance thresholds for a project."""
        return self.set_config(
            project_id=project_id,
            config_type=ConfigType.EFFORT_THRESHOLD,
            config_key="variance",
            config_value={
                "over_threshold": over_threshold,
                "under_threshold": under_threshold
            },
            description="Effort variance thresholds for time tracking",
            updated_by=updated_by
        )
    
    # ==================== AHT Configuration Methods ====================
    # (Wrapper around existing AHTConfiguration table for consistency)
    
    def get_aht_config(self, project_id: int) -> Optional[Dict[str, float]]:
        """Get AHT configuration for a project."""
        with self.db_service.get_session() as session:
            config = session.query(AHTConfiguration).filter(
                AHTConfiguration.project_id == project_id
            ).first()
            
            if config:
                return {
                    "new_task_aht": config.new_task_aht,
                    "rework_aht": config.rework_aht
                }
        
        # Return defaults
        return {"new_task_aht": 10.0, "rework_aht": 4.0}
    
    def get_all_aht_configs(self) -> List[Dict[str, Any]]:
        """Get all AHT configurations."""
        with self.db_service.get_session() as session:
            configs = session.query(AHTConfiguration).order_by(
                AHTConfiguration.project_id
            ).all()
            
            return [
                {
                    "id": c.id,
                    "project_id": c.project_id,
                    "project_name": c.project_name,
                    "new_task_aht": c.new_task_aht,
                    "rework_aht": c.rework_aht,
                    "created_at": c.created_at,
                    "updated_at": c.updated_at,
                    "updated_by": c.updated_by
                }
                for c in configs
            ]
    
    # ==================== Bulk Operations ====================
    
    def bulk_set_targets(
        self,
        project_id: int,
        targets: List[Dict[str, Any]],
        entity_type: str = "trainer",
        updated_by: Optional[str] = None
    ) -> int:
        """
        Bulk set throughput targets for multiple entities.
        
        Args:
            project_id: Project ID
            targets: List of dicts with keys: entity_id, entity_email, target
            entity_type: 'trainer' or 'reviewer'
            updated_by: User making the change
        
        Returns:
            Number of targets set
        """
        count = 0
        for t in targets:
            self.set_throughput_target(
                project_id=project_id,
                target=t['target'],
                entity_type=entity_type,
                entity_id=t.get('entity_id'),
                entity_email=t.get('entity_email'),
                updated_by=updated_by
            )
            count += 1
        
        logger.info(f"Bulk set {count} {entity_type} targets for project {project_id}")
        return count
    
    # ==================== Helper Methods ====================
    
    def _config_to_dict(self, config: ProjectConfiguration) -> Dict[str, Any]:
        """Convert a ProjectConfiguration model to a dict."""
        # Handle config_value: may be dict (from JSONB) or string (from Text column)
        config_value = config.config_value
        if config_value is None:
            parsed_value = {}
        elif isinstance(config_value, dict):
            # PostgreSQL JSONB returns dict directly
            parsed_value = config_value
        else:
            # Text column stores JSON string
            parsed_value = json.loads(config_value)
        
        return {
            "id": config.id,
            "project_id": config.project_id,
            "config_type": config.config_type,
            "config_key": config.config_key,
            "entity_type": config.entity_type,
            "entity_id": config.entity_id,
            "entity_email": config.entity_email,
            "config_value": parsed_value,
            "effective_from": config.effective_from,
            "effective_to": config.effective_to,
            "description": config.description,
            "created_at": config.created_at,
            "updated_at": config.updated_at,
            "created_by": config.created_by,
            "updated_by": config.updated_by
        }


# Global instance
_configuration_service: Optional[ConfigurationService] = None


def get_configuration_service() -> ConfigurationService:
    """Get or create the global configuration service instance."""
    global _configuration_service
    if _configuration_service is None:
        _configuration_service = ConfigurationService()
    return _configuration_service
