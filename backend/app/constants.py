"""
Centralized constants and business logic configuration for the Nvidia Dashboard.

This file contains all hardcoded values that were previously scattered across the codebase.
These can be overridden via environment variables when needed.

Categories:
1. Project Configuration - Project IDs and names
2. Batch Exclusions - Batches to exclude from metrics
3. AHT Configuration - Average Handling Time multipliers
4. Task Status Values - Valid status values for filtering
5. Jibble Configuration - Jibble API project mappings
6. BigQuery Configuration - Dataset and table names
7. Metric Calculation Constants - Formulas and thresholds
"""

import os
import json
from typing import Dict, List, Set
from dataclasses import dataclass, field
from functools import lru_cache


# =============================================================================
# 1. PROJECT CONFIGURATION
# =============================================================================

@dataclass
class ProjectConfig:
    """Configuration for Nvidia projects in the labeling tool."""
    
    # Project ID to Name mapping
    # NOTE: Project 37 is "Multichallenge" (SFT-Multichallenge in BigQuery)
    # NOTE: Project 39 is "CFBench Multilingual" (SFT-CFBench in BigQuery)
    PROJECT_ID_TO_NAME: Dict[int, str] = field(default_factory=lambda: {
        36: "Nvidia - SysBench",
        37: "Nvidia - Multichallenge",
        38: "Nvidia - InverseIFEval",
        39: "Nvidia - CFBench Multilingual",
        40: "Nvidia - Multichallenge Advanced",
        41: "Nvidia - ICPC",
        42: "NVIDIA_STEM Math_Eval",
    })
    
    # All valid Nvidia project IDs
    ALL_PROJECT_IDS: List[int] = field(default_factory=lambda: [36, 37, 38, 39, 40, 41, 42])
    
    # Primary project IDs used in most queries (excludes Advanced variants)
    PRIMARY_PROJECT_IDS: List[int] = field(default_factory=lambda: [36, 37, 38, 39])
    
    # Project ID for Multichallenge (includes both regular and Advanced)
    MULTICHALLENGE_PROJECT_ID: int = 39
    MULTICHALLENGE_ADVANCED_PROJECT_ID: int = 40
    
    # Project name to ID mapping (reverse lookup)
    @property
    def PROJECT_NAME_TO_ID(self) -> Dict[str, int]:
        return {v: k for k, v in self.PROJECT_ID_TO_NAME.items()}
    
    def get_project_name(self, project_id: int) -> str:
        """Get project name by ID, returns 'Unknown' if not found."""
        return self.PROJECT_ID_TO_NAME.get(project_id, "Unknown")
    
    def get_project_id(self, project_name: str) -> int:
        """Get project ID by name, returns -1 if not found."""
        return self.PROJECT_NAME_TO_ID.get(project_name, -1)


# =============================================================================
# 2. BATCH EXCLUSIONS
# =============================================================================

@dataclass
class BatchExclusions:
    """Batches to exclude from metrics calculations."""
    
    # Batch names to exclude from all calculations
    EXCLUDED_BATCH_NAMES: List[str] = field(default_factory=lambda: [
        'sft-mcb-vanilla-batch-1',
        'sft-mcb-advance-batch-1',
    ])
    
    # SQL fragment for exclusion in queries
    @property
    def SQL_EXCLUSION_CLAUSE(self) -> str:
        """Generate SQL clause for batch exclusion."""
        names = ", ".join(f"'{name}'" for name in self.EXCLUDED_BATCH_NAMES)
        return f"b.name NOT IN ({names})"
    
    # Batch statuses to exclude
    EXCLUDED_BATCH_STATUSES: List[str] = field(default_factory=lambda: ['draft'])


# =============================================================================
# 3. AHT (AVERAGE HANDLING TIME) CONFIGURATION
# =============================================================================

@dataclass  
class AHTConfig:
    """
    Average Handling Time configuration for metrics calculations.
    
    NEW LOGIC (as of Feb 2026):
    - For new tasks: Credit DEFAULT_NEW_TASK_AHT hours (e.g., 10 hours)
    - For rework: Credit DEFAULT_REWORK_AHT hours ONCE per task, regardless of how many
      rework submissions the same trainer makes on that task
    - MAX_REWORKS_TO_REWARD controls how many rework submissions to credit per task
      (default 1 = only first rework credited, subsequent reworks by same trainer = 0 hours)
    
    This prevents rewarding trainers for repeatedly failing to deliver quality work.
    
    Formula for task-level:
    task_accounted = (NEW_TASK_AHT if is_new else 0) + (REWORK_AHT * min(rework_count, MAX_REWORKS_TO_REWARD))
    
    Formula for trainer-level:
    trainer_accounted = SUM(task_accounted for all tasks)
                      = tasks_with_new * NEW_TASK_AHT + tasks_with_rework * REWORK_AHT
    
    Where:
    - tasks_with_new = count of unique tasks where trainer did the first completion
    - tasks_with_rework = count of unique tasks where trainer did at least 1 rework
    """
    
    # Default AHT values in hours
    DEFAULT_NEW_TASK_AHT: float = 10.0  # Hours expected for new tasks (fresh research)
    DEFAULT_REWORK_AHT: float = 4.0     # Hours expected for rework tasks (revisions)
    
    # Maximum number of reworks to credit per task per trainer
    # Setting to 1 means: only the first rework is credited, subsequent reworks = 0 hours
    # This prevents gaming the system by doing multiple low-quality reworks
    MAX_REWORKS_TO_REWARD: int = 1
    
    # AHT range limits for validation
    MIN_AHT_VALUE: float = 0.1
    MAX_AHT_VALUE: float = 100.0
    
    def calculate_task_accounted_hours(self, is_new: bool, rework_count: int,
                                        new_task_aht: float = None, 
                                        rework_aht: float = None) -> float:
        """
        Calculate accounted hours for a SINGLE TASK for a specific trainer.
        
        Args:
            is_new: True if this trainer did the first completion of the task
            rework_count: Number of rework submissions by this trainer on this task
            new_task_aht: Override for new task AHT (defaults to DEFAULT_NEW_TASK_AHT)
            rework_aht: Override for rework AHT (defaults to DEFAULT_REWORK_AHT)
        
        Returns:
            Accounted hours for this task:
            - 10 hours if new task
            - + 4 hours if has any rework (capped by MAX_REWORKS_TO_REWARD)
        
        Example:
            - New task with 0 rework: 10 hours
            - New task with 1 rework: 14 hours  
            - New task with 5 reworks: 14 hours (only first rework credited)
            - Rework only with 1 submission: 4 hours
            - Rework only with 3 submissions: 4 hours (only first credited)
        """
        new_task_aht = new_task_aht or self.DEFAULT_NEW_TASK_AHT
        rework_aht = rework_aht or self.DEFAULT_REWORK_AHT
        
        new_hours = new_task_aht if is_new else 0
        # Credit rework only up to MAX_REWORKS_TO_REWARD
        reworks_to_credit = min(rework_count, self.MAX_REWORKS_TO_REWARD)
        rework_hours = rework_aht * reworks_to_credit
        
        return new_hours + rework_hours
    
    def calculate_trainer_accounted_hours(self, tasks_with_new: int, tasks_with_rework: int,
                                           new_task_aht: float = None, 
                                           rework_aht: float = None) -> float:
        """
        Calculate accounted hours for a TRAINER (aggregated from tasks).
        
        Args:
            tasks_with_new: Count of unique tasks where trainer did first completion
            tasks_with_rework: Count of unique tasks where trainer did at least 1 rework
            new_task_aht: Override for new task AHT (defaults to DEFAULT_NEW_TASK_AHT)
            rework_aht: Override for rework AHT (defaults to DEFAULT_REWORK_AHT)
        
        Returns:
            Total accounted hours = tasks_with_new * 10 + tasks_with_rework * 4
        
        Note: A task can be both "new" AND have rework if the trainer:
        1. Did the first completion (new) and
        2. Later did rework on the same task
        In this case, that task contributes 14 hours total.
        """
        new_task_aht = new_task_aht or self.DEFAULT_NEW_TASK_AHT
        rework_aht = rework_aht or self.DEFAULT_REWORK_AHT
        
        return (tasks_with_new * new_task_aht) + (tasks_with_rework * rework_aht)
    
    def calculate_merged_aht(self, tasks_with_new: int, tasks_with_rework: int,
                              unique_tasks: int,
                              new_task_aht: float = None, rework_aht: float = None) -> float:
        """
        Calculate merged expected AHT (weighted average AHT across all tasks).
        
        NEW Formula: accounted_hours / unique_tasks
        
        This gives the average accounted hours per unique task, which is a
        meaningful measure of expected time per task worked on.
        
        Args:
            tasks_with_new: Count of unique tasks with first completion by trainer
            tasks_with_rework: Count of unique tasks with rework by trainer  
            unique_tasks: Total unique tasks worked on by trainer
            new_task_aht: Override for new task AHT
            rework_aht: Override for rework AHT
        
        Returns:
            Merged AHT = accounted_hours / unique_tasks
        """
        if unique_tasks == 0:
            return 0.0
        
        accounted = self.calculate_trainer_accounted_hours(
            tasks_with_new, tasks_with_rework, new_task_aht, rework_aht
        )
        
        return round(accounted / unique_tasks, 2)
    
    # DEPRECATED: Keeping for backward compatibility but should migrate to new methods
    def calculate_accounted_hours(self, new_tasks: int, rework: int,
                                   new_task_aht: float = None, rework_aht: float = None) -> float:
        """
        DEPRECATED: Use calculate_trainer_accounted_hours instead.
        
        This method used event counts (new_tasks, rework events) which overcounted
        when a trainer did multiple reworks on the same task.
        
        Keeping for backward compatibility during migration.
        """
        new_task_aht = new_task_aht or self.DEFAULT_NEW_TASK_AHT
        rework_aht = rework_aht or self.DEFAULT_REWORK_AHT
        
        return (new_tasks * new_task_aht) + (rework * rework_aht)


# =============================================================================
# 4. TASK STATUS VALUES
# =============================================================================

@dataclass
class TaskStatusConfig:
    """Valid task status values used in filtering and calculations."""
    
    # Valid derived status values for pre-delivery metrics
    VALID_DERIVED_STATUSES: List[str] = field(default_factory=lambda: [
        'Completed',
        'Reviewed', 
        'Rework',
        'Validated',
    ])
    
    # Task status for completion tracking
    COMPLETION_STATUS: str = 'completed'
    
    # Review types
    REVIEW_TYPE_MANUAL: str = 'manual'
    REVIEW_TYPE_AUTO: str = 'auto'
    
    # Review status for published reviews
    REVIEW_STATUS_PUBLISHED: str = 'published'
    
    # Status transitions to exclude from counts
    EXCLUDED_OLD_STATUS: str = 'completed-approval'
    
    # New status for completion events
    NEW_STATUS_COMPLETED: str = 'completed'


# =============================================================================
# 5. JIBBLE CONFIGURATION
# =============================================================================

@dataclass
class JibbleConfig:
    """
    Jibble API configuration and project mappings.
    
    Note: There's a known data quality issue where CFBench and Multichallenge
    trainer data is swapped. This is handled with explicit project swapping.
    """
    
    # Jibble UUID to Project Name mapping
    # NOTE: Jibble UUIDs map to dashboard display names (corrected)
    JIBBLE_UUID_TO_NAME: Dict[str, str] = field(default_factory=lambda: {
        "a7b4596c-b632-49ce-bada-33df4491edd2": "Nvidia - SysBench",
        "a1b6c34e-67cd-4554-8a7b-4cab2d0fa744": "Nvidia - Multichallenge",
        "16e16c63-6deb-4f3c-9d88-46537c006dc9": "Nvidia - InverseIFEval",
        "7c305ca8-9675-4edc-a51c-84ad0beaae78": "Nvidia - CFBench Multilingual",
        "2581d1d5-e729-437f-92aa-2e3d7ceebc4f": "Nvidia - Multichallenge Advanced",
        "1f33fccc-9c95-409a-b17c-541bdd5e446e": "Nvidia - ICPC",
        "e6a4ebc3-5f25-42ce-806e-d23f9026d95b": "NVIDIA_STEM Math_Eval",
    })
    
    # Jibble project name to Dashboard project ID mapping
    JIBBLE_NAME_TO_PROJECT_ID: Dict[str, int] = field(default_factory=lambda: {
        "Nvidia - SysBench": 36,
        "Nvidia - Multichallenge": 37,
        "Nvidia - InverseIFEval": 38,
        "Nvidia - CFBench Multilingual": 39,
        "Nvidia - Multichallenge Advanced": 37,  # Maps to same as Multichallenge (37)
        "Nvidia - ICPC": 36,  # Maps to SysBench
        "NVIDIA_STEM Math_Eval": 36,  # Maps to SysBench
    })
    
    # Dashboard project ID to Jibble project names mapping
    # Used for fetching Jibble hours for a dashboard project
    PROJECT_ID_TO_JIBBLE_NAMES: Dict[int, List[str]] = field(default_factory=lambda: {
        36: ["Nvidia - SysBench", "Nvidia - ICPC", "NVIDIA_STEM Math_Eval"],
        37: ["Nvidia - Multichallenge", "Nvidia - Multichallenge Advanced"],
        38: ["Nvidia - InverseIFEval"],
        39: ["Nvidia - CFBench Multilingual"],
    })
    
    # Multichallenge/CFBench Jibble swap mapping (data quality workaround)
    # Project 37 (Multichallenge) tasks use Project 39 (CFBench) Jibble hours and vice versa
    # This handles the Jibble data alignment issue where hours were logged under swapped projects
    JIBBLE_PROJECT_SWAP: Dict[int, int] = field(default_factory=lambda: {
        37: 39,  # Multichallenge tasks -> use CFBench Jibble hours
        39: 37,  # CFBench tasks -> use Multichallenge Jibble hours
    })
    
    def get_jibble_project_id(self, dashboard_project_id: int) -> int:
        """
        Get the Jibble project ID to use for a dashboard project.
        Handles the CFBench/Multichallenge swap.
        """
        return self.JIBBLE_PROJECT_SWAP.get(dashboard_project_id, dashboard_project_id)
    
    def should_swap_jibble_hours(self, project_id: int) -> bool:
        """Check if Jibble hours should be swapped for this project."""
        return project_id in self.JIBBLE_PROJECT_SWAP
    
    # Jibble API URLs (defaults, can be overridden via env)
    DEFAULT_JIBBLE_API_URL: str = "https://workspace.prod.jibble.io/v1"
    DEFAULT_JIBBLE_TIME_TRACKING_URL: str = "https://time-tracking.prod.jibble.io/v1"
    DEFAULT_JIBBLE_TIME_ATTENDANCE_URL: str = "https://time-attendance.prod.jibble.io/v1"
    
    # Google Sheet for email mapping
    DEFAULT_EMAIL_MAPPING_SHEET_ID: str = "1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8"
    DEFAULT_EMAIL_MAPPING_SHEET_GID: str = "1375209319"


# =============================================================================
# 6. BIGQUERY CONFIGURATION
# =============================================================================

@dataclass
class BigQueryConfig:
    """BigQuery dataset and table configuration."""
    
    # Default dataset (can be overridden via env)
    DEFAULT_DATASET: str = "prod_labeling_tool_n"
    
    # Alternative datasets
    ALTERNATIVE_DATASETS: List[str] = field(default_factory=lambda: [
        "prod_labeling_tool_n",  # Primary
        "prod_labeling_tool_z",  # Alternative
    ])
    
    # GCP Project IDs
    PRIMARY_GCP_PROJECT: str = "turing-gpt"
    JIBBLE_GCP_PROJECT: str = "turing-230020"  # For Jibble logs
    
    # Table names
    TABLES: Dict[str, str] = field(default_factory=lambda: {
        "conversation": "conversation",
        "review": "review",
        "batch": "batch",
        "contributor": "contributor",
        "conversation_status_history": "conversation_status_history",
        "delivery_batch": "delivery_batch",
        "delivery_batch_task": "delivery_batch_task",
        "project_quality_dimension": "project_quality_dimension",
        "review_quality_dimension_value": "review_quality_dimension_value",
    })
    
    # Jibble logs table
    JIBBLE_LOGS_TABLE: str = "test.Jibblelogs"
    
    def get_table_ref(self, table_name: str, dataset: str = None, project: str = None) -> str:
        """Get fully qualified table reference."""
        project = project or self.PRIMARY_GCP_PROJECT
        dataset = dataset or self.DEFAULT_DATASET
        table = self.TABLES.get(table_name, table_name)
        return f"`{project}.{dataset}.{table}`"


# =============================================================================
# 7. METRIC CALCULATION CONSTANTS
# =============================================================================

@dataclass
class MetricConfig:
    """Constants used in metric calculations."""
    
    # Rounding precision
    DEFAULT_DECIMAL_PLACES: int = 2
    PERCENTAGE_DECIMAL_PLACES: int = 1
    
    # Threshold for considering efficiency warnings
    EFFICIENCY_LOW_THRESHOLD: float = 80.0
    EFFICIENCY_HIGH_THRESHOLD: float = 120.0
    
    # Default values for missing data
    DEFAULT_UNKNOWN_NAME: str = "Unknown"
    DEFAULT_UNKNOWN_EMAIL: str = "unknown@example.com"
    
    @staticmethod
    def calculate_avg_rework(unique_tasks: int, new_tasks: int, rework: int) -> float:
        """
        Calculate average rework metric.
        
        Formula: (total_completions / unique_tasks) - 1
        Where total_completions = new_tasks + rework
        """
        if unique_tasks == 0:
            return None
        total_completions = new_tasks + rework
        return round((total_completions / unique_tasks) - 1, 2)
    
    @staticmethod
    def calculate_rework_percent(new_tasks: int, rework: int) -> float:
        """
        Calculate rework percentage.
        
        Formula: rework / (new_tasks + rework) * 100
        """
        total = new_tasks + rework
        if total == 0:
            return None
        return round((rework / total) * 100, 1)
    
    @staticmethod
    def calculate_efficiency(accounted_hours: float, jibble_hours: float) -> float:
        """
        Calculate efficiency percentage.
        
        Formula: (accounted_hours / jibble_hours) * 100
        """
        if jibble_hours == 0:
            return None
        return round((accounted_hours / jibble_hours) * 100, 1)


# =============================================================================
# 8. CONFIGURATION FACTORY
# =============================================================================

@dataclass
class AppConstants:
    """
    Main configuration container for all application constants.
    
    Usage:
        from app.constants import get_constants
        constants = get_constants()
        
        # Access project config
        project_name = constants.projects.get_project_name(36)
        
        # Check batch exclusions
        exclusion_sql = constants.batches.SQL_EXCLUSION_CLAUSE
        
        # Calculate metrics
        merged_aht = constants.aht.calculate_merged_aht(new_tasks=10, rework=5)
    """
    
    projects: ProjectConfig = field(default_factory=ProjectConfig)
    batches: BatchExclusions = field(default_factory=BatchExclusions)
    aht: AHTConfig = field(default_factory=AHTConfig)
    statuses: TaskStatusConfig = field(default_factory=TaskStatusConfig)
    jibble: JibbleConfig = field(default_factory=JibbleConfig)
    bigquery: BigQueryConfig = field(default_factory=BigQueryConfig)
    metrics: MetricConfig = field(default_factory=MetricConfig)


@lru_cache()
def get_constants() -> AppConstants:
    """
    Get cached constants instance.
    
    Returns the same instance throughout the application lifecycle.
    """
    return AppConstants()


# =============================================================================
# CONVENIENCE EXPORTS
# =============================================================================

# Direct access to commonly used constants
def get_project_ids() -> List[int]:
    """Get all primary project IDs."""
    return get_constants().projects.PRIMARY_PROJECT_IDS

def get_excluded_batches() -> List[str]:
    """Get list of excluded batch names."""
    return get_constants().batches.EXCLUDED_BATCH_NAMES

def get_batch_exclusion_sql() -> str:
    """Get SQL clause for batch exclusion."""
    return get_constants().batches.SQL_EXCLUSION_CLAUSE

def get_valid_statuses() -> List[str]:
    """Get valid derived status values."""
    return get_constants().statuses.VALID_DERIVED_STATUSES

def get_jibble_swap_project(project_id: int) -> int:
    """Get the Jibble project ID to use (handles swap)."""
    return get_constants().jibble.get_jibble_project_id(project_id)


# =============================================================================
# ENVIRONMENT VARIABLE OVERRIDES
# =============================================================================

def load_from_env():
    """
    Load configuration overrides from environment variables.
    
    Supported env vars:
    - NVIDIA_PROJECT_IDS: Comma-separated list of project IDs
    - EXCLUDED_BATCH_NAMES: Comma-separated list of batch names to exclude
    - DEFAULT_NEW_TASK_AHT: Default AHT for new tasks
    - DEFAULT_REWORK_AHT: Default AHT for rework tasks
    """
    constants = get_constants()
    
    # Override project IDs
    if project_ids_env := os.environ.get("NVIDIA_PROJECT_IDS"):
        try:
            constants.projects.PRIMARY_PROJECT_IDS = [
                int(x.strip()) for x in project_ids_env.split(",") if x.strip()
            ]
        except ValueError:
            pass
    
    # Override excluded batches
    if excluded_batches_env := os.environ.get("EXCLUDED_BATCH_NAMES"):
        constants.batches.EXCLUDED_BATCH_NAMES = [
            x.strip() for x in excluded_batches_env.split(",") if x.strip()
        ]
    
    # Override AHT defaults
    if new_task_aht_env := os.environ.get("DEFAULT_NEW_TASK_AHT"):
        try:
            constants.aht.DEFAULT_NEW_TASK_AHT = float(new_task_aht_env)
        except ValueError:
            pass
    
    if rework_aht_env := os.environ.get("DEFAULT_REWORK_AHT"):
        try:
            constants.aht.DEFAULT_REWORK_AHT = float(rework_aht_env)
        except ValueError:
            pass


# Load env overrides on module import
load_from_env()
