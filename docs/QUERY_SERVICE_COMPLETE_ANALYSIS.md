# Query Service Complete Analysis

## Overview
This document provides a comprehensive analysis of `backend/app/services/query_service.py`, documenting all methods, metric calculations, SQL queries, aggregation logic, and attribution rules.

**File Size**: ~3,608 lines  
**Class**: `QueryService`

---

## Table of Contents
1. [All Methods Signatures](#all-methods-signatures)
2. [Core Metric Calculation Methods](#core-metric-calculation-methods)
3. [Attribution Logic](#attribution-logic)
4. [Key Methods Deep Dive](#key-methods-deep-dive)
5. [Edge Cases and Data Handling](#edge-cases-and-data-handling)

---

## All Methods Signatures

### Initialization & Helper Methods

#### `__init__(self)`
- **Purpose**: Initialize QueryService with settings, DB service, and constants
- **Returns**: None
- **Key Attributes**:
  - `self.settings`: Application settings
  - `self.db_service`: Database service instance
  - `self._allowed_quality_dimensions_cache`: Cached quality dimensions set
  - `self._constants`: Constants configuration

#### `_calculate_merged_aht(self, new_tasks: int, rework: int) -> Optional[float]`
- **Purpose**: Calculate merged expected AHT using configurable constants
- **Formula**: `(new_tasks * NEW_TASK_AHT + rework * REWORK_AHT) / total_submissions`
- **Returns**: Rounded float (2 decimals) or None if submissions == 0
- **Edge Cases**: Returns None if `submissions == 0`

#### `_calculate_accounted_hours(self, new_tasks: int, rework: int) -> float`
- **Purpose**: Calculate accounted hours using configurable constants
- **Formula**: `new_tasks * NEW_TASK_AHT + rework * REWORK_AHT`
- **Returns**: Float (hours)
- **Constants Used**: `DEFAULT_NEW_TASK_AHT`, `DEFAULT_REWORK_AHT` from `self._constants.aht`

#### `_get_allowed_quality_dimensions(self, force_refresh: bool = False) -> Set[str]`
- **Purpose**: Fetch allowed quality dimensions from BigQuery
- **Query**: 
  ```sql
  SELECT DISTINCT name 
  FROM `{project_id}.{dataset}.project_quality_dimension` 
  WHERE project_id = {project_id_filter} AND is_enabled = 1
  ```
- **Returns**: Set of dimension names (cached)
- **Edge Cases**: Returns empty set on error

#### `_get_contributor_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose**: Get contributor ID to name, email, status, team_lead_id mapping
- **Query**: 
  ```python
  session.query(
      Contributor.id, 
      Contributor.name, 
      Contributor.turing_email,
      Contributor.status,
      Contributor.team_lead_id
  ).all()
  ```
- **Returns**: Dict mapping contributor_id -> {name, email, status, team_lead_id}
- **Edge Cases**: Returns empty dict on error

#### `_format_name_with_status(self, name: str, status: str) -> str`
- **Purpose**: Format contributor name with status indicator
- **Logic**: 
  - If name is None/empty → "Unknown"
  - If status is None or "active" → return name as-is
  - Otherwise → "{name} ({status.lower()})"

#### `_process_aggregation_results(self, results: List[Any], group_key: Optional[str] = None) -> List[Dict[str, Any]]`
- **Purpose**: Process query results into structured aggregation format
- **Returns**: List of aggregated data dictionaries
- **Handles**: Quality dimensions, conversation IDs, scores, task scores, rework counts

### Aggregation Methods

#### `get_overall_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`
- **Purpose**: Get overall aggregation statistics
- **Query**: 
  ```python
  session.query(ReviewDetail, Task.rework_count).outerjoin(
      Task, ReviewDetail.conversation_id == Task.id
  ).filter(ReviewDetail.is_delivered == 'False')
  ```
- **Filters**: domain, reviewer, trainer
- **Metrics Calculated**:
  - `task_count`: Distinct Task.id where `is_delivered == 'False'`
  - `reviewer_count`: Unique reviewer_ids
  - `trainer_count`: Unique human_role_ids
  - `domain_count`: Unique domains
  - `average_completion_time_hours`: From `_get_average_completion_time()`
  - Quality dimensions with average scores

#### `get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get domain-wise aggregation statistics
- **Query**: Same as `get_overall_aggregation` but grouped by domain
- **Returns**: List of domain aggregations sorted by domain name

#### `get_trainer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get trainer-wise aggregation statistics
- **Query**: Same base query, grouped by `human_role_id`
- **Additional Data Sources**:
  - `_get_trainer_aht_map()`: AHT statistics
  - `_get_contributor_task_stats_map()`: New tasks vs rework stats
  - `_get_completion_times_by_trainer()`: Average completion times
- **Metrics**: Quality dimensions, AHT, new_tasks_submitted, rework_submitted, total_unique_tasks

#### `get_pod_lead_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get POD Lead aggregation with nested reviewers
- **Logic**: Groups by POD Lead → Reviewer → Quality Dimension
- **Attribution**: Uses `trainer_to_pod_lead` mapping from Contributor.team_lead_id
- **Returns**: Nested structure with POD Leads containing reviewers

#### `get_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get reviewer-wise aggregation statistics
- **Query**: Grouped by `reviewer_id`
- **Returns**: List sorted by reviewer name

#### `get_reviewers_with_trainers(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get reviewers with their trainers nested
- **Structure**: Reviewer → Trainer → Quality Dimensions
- **Returns**: Nested structure sorted by reviewer name

### Helper Data Methods

#### `_get_task_aht_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose**: Get task ID to AHT mapping
- **Query**: 
  ```python
  session.query(
      TaskAHT.task_id,
      TaskAHT.duration_seconds,
      TaskAHT.duration_minutes,
      TaskAHT.start_time,
      TaskAHT.end_time
  ).all()
  ```
- **Returns**: Dict mapping task_id -> {duration_seconds, duration_minutes, start_time, end_time}

#### `_get_trainer_aht_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose**: Get trainer ID to average AHT mapping
- **Query**: 
  ```python
  session.query(
      TaskAHT.contributor_id,
      func.sum(TaskAHT.duration_minutes).label('total_minutes'),
      func.count(TaskAHT.task_id).label('task_count')
  ).group_by(TaskAHT.contributor_id)
  ```
- **Returns**: Dict mapping contributor_id -> {total_duration_minutes, aht_task_count, avg_aht_minutes}
- **Formula**: `avg_minutes = total_minutes / task_count`

#### `_get_contributor_task_stats_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose**: Get contributor ID to task stats mapping (new tasks vs rework)
- **Query**: 
  ```python
  session.query(
      ContributorTaskStats.contributor_id,
      ContributorTaskStats.new_tasks_submitted,
      ContributorTaskStats.rework_submitted,
      ContributorTaskStats.total_unique_tasks,
      ContributorTaskStats.first_submission_date,
      ContributorTaskStats.last_submission_date
  ).all()
  ```
- **Returns**: Dict with task statistics per contributor

#### `get_task_level_data(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get task-level data with all quality dimensions and AHT
- **Query**: 
  ```python
  session.query(ReviewDetail, Task.colab_link, Task.week_number, Task.rework_count).outerjoin(
      Task, ReviewDetail.conversation_id == Task.id
  ).filter(ReviewDetail.is_delivered == 'False')
  ```
- **Returns**: List of task dictionaries with quality dimensions, AHT, annotator, reviewer info

---

## Core Metric Calculation Methods

### Daily Stats Methods

#### `get_trainer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get trainer stats at date level (trainer x date granularity)
- **Data Sources**:
  1. **ContributorDailyStats**: Base daily stats
  2. **TaskRaw**: For `sum_number_of_turns` and `unique_tasks_raw`
  3. **TaskRaw**: For `avg_rating` calculation

**Metrics Calculated**:

1. **unique_tasks**: 
   - Primary: `unique_tasks_from_raw` from TaskRaw (if > 0)
   - Fallback: `unique_tasks` from ContributorDailyStats
   - Query: `COUNT(DISTINCT task_id) WHERE derived_status IN ('Completed', 'Reviewed', 'Rework', 'Validated')`

2. **new_tasks_submitted**: From ContributorDailyStats.new_tasks_submitted

3. **rework_submitted**: From ContributorDailyStats.rework_submitted

4. **sum_number_of_turns**: 
   - Query: `SUM(number_of_turns) WHERE derived_status IN ('Completed', 'Reviewed', 'Rework', 'Validated')`
   - Grouped by: `trainer, last_completed_date`

5. **avg_rework**: 
   - Formula: `((total_completions / unique_tasks) - 1)`
   - Where `total_completions = new_tasks + rework`
   - Returns: Decimal (e.g., 4.12 means average 4.12 reworks per task)

6. **rework_percent**: 
   - Formula: `(rework / (rework + new_tasks)) * 100`
   - Returns: Percentage (0-100)

7. **avg_rating**: 
   - Query: `SUM(sum_score) / SUM(count_reviews) WHERE count_reviews > 0`
   - Grouped by: `trainer, last_completed_date`
   - Edge Case: Returns None if no reviews

**Edge Cases**:
- Uses `unique_tasks_from_raw` if available, otherwise falls back to ContributorDailyStats
- Handles None values for dates and ratings
- Filters by project_id if provided

#### `get_reviewer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get reviewer stats at date level (reviewer x date granularity)
- **Data Source**: ReviewerDailyStats
- **Metrics**: Similar to trainer daily stats but for reviewers
- **Rating Query**: Uses `r_submitted_date` instead of `last_completed_date`

#### `get_trainers_by_reviewer_date(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get trainers reviewed by each reviewer on each date
- **Data Source**: ReviewerTrainerDailyStats (synced table)
- **Metrics**: tasks_reviewed, new_tasks_reviewed, rework_reviewed, avg_rework, rework_percent, avg_rating

---

### Overall Stats Methods

#### `get_trainer_overall_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose**: Get overall trainer stats (all-time aggregation)
- **Data Sources**:
  1. **TaskHistoryRaw**: For unique_tasks, new_tasks_submitted, rework_submitted
  2. **TaskRaw**: For sum_number_of_turns
  3. **TaskRaw + TaskHistoryRaw**: For approved, approved_rework, delivered, in_queue
  4. **TrainerReviewStats**: For total_reviews and avg_rating
  5. **JibbleHours**: For logged hours

**Metrics Calculated**:

1. **unique_tasks**: 
   - Query: `COUNT(DISTINCT task_id) WHERE new_status='completed' AND old_status != 'completed-approval' AND author IS NOT NULL`
   - Grouped by: `author` (trainer email)
   - **Attribution**: Uses `TaskHistoryRaw.author` (who actually made the transition)

2. **new_tasks_submitted**: 
   - Query: `SUM(CASE WHEN completed_status_count == 1 THEN 1 ELSE 0 END)`
   - **Attribution**: Uses `TaskHistoryRaw.author`

3. **rework_submitted**: 
   - Query: `SUM(CASE WHEN completed_status_count > 1 THEN 1 ELSE 0 END)`
   - **Attribution**: Uses `TaskHistoryRaw.author`

4. **sum_number_of_turns**: 
   - Query: `SUM(number_of_turns) WHERE derived_status IN ('Completed', 'Reviewed', 'Rework', 'Validated')`
   - Grouped by: `trainer` (email)

5. **avg_rework**: 
   - Formula: `((total_completions / unique_tasks) - 1)`
   - Where `total_completions = new_tasks + rework`

6. **rework_percent**: 
   - Formula: `(rework / (rework + new_tasks)) * 100`

7. **approved**: 
   - **Definition**: Tasks where `task_status='completed'`, `count_reviews > 0`, `review_action_type != 'rework'`
   - **Attribution Logic**:
     - Find FIRST author (who originally completed the task)
     - Find LAST completer (who completed it when it got approved)
     - If FIRST author == LAST completer → Approved (original owner got it approved)
     - If FIRST author != LAST completer → Approved Rework (someone else fixed it)
   - **Query**: 
     ```python
     # Get approved task IDs
     approved_task_ids = session.query(TaskRaw.task_id).filter(
         func.lower(TaskRaw.task_status) == 'completed',
         TaskRaw.count_reviews > 0,
         or_(TaskRaw.review_action_type != 'rework', TaskRaw.review_action_type.is_(None))
     )
     
     # Get completion events
     completion_events = session.query(
         TaskHistoryRaw.task_id,
         TaskHistoryRaw.author,
         TaskHistoryRaw.completed_status_count,
         TaskHistoryRaw.time_stamp
     ).filter(
         TaskHistoryRaw.task_id.in_(approved_task_ids),
         TaskHistoryRaw.new_status == 'completed',
         TaskHistoryRaw.old_status != 'completed-approval',
         TaskHistoryRaw.author.isnot(None)
     )
     ```

8. **approved_rework**: Same as approved but for tasks where first author != last completer

9. **delivered**: 
   - **Definition**: Tasks where `delivery_status = 'delivered'`
   - **Attribution**: Uses LAST completer from TaskHistoryRaw
   - **Query**: 
     ```python
     delivered_task_ids = session.query(TaskRaw.task_id).filter(
         func.lower(TaskRaw.delivery_status) == 'delivered'
     )
     # Then find last completer from TaskHistoryRaw
     ```

10. **in_queue**: 
    - **Definition**: Tasks where `delivery_batch_name IS NOT NULL AND delivery_status != 'delivered'`
    - **Attribution**: Uses LAST completer from TaskHistoryRaw
    - **Note**: No date filter - shows current queue status regardless of timeframe

11. **total_reviews**: 
    - **Source**: TrainerReviewStats
    - **Query**: `COUNT(review_id) WHERE score IS NOT NULL`
    - **Attribution**: Reviews are attributed to the trainer who did the work (not current task owner)
    - **Grouped by**: `trainer_email`

12. **avg_rating**: 
    - **Formula**: `SUM(score) / COUNT(review_id)`
    - **Source**: TrainerReviewStats
    - **Attribution**: Same as total_reviews

13. **jibble_hours**: 
    - **Source**: JibbleHours table (from BigQuery)
    - **Matching**: Uses `pod_lead_mapping` table to map `jibble_name` -> `trainer_email`
    - **Query**: 
      ```python
      session.query(
          JibbleHours.full_name,
          func.sum(JibbleHours.logged_hours).label('total_hours')
      ).group_by(JibbleHours.full_name)
      ```
    - **Filtering**: Filtered by project-specific Jibble project names from constants
    - **Date Filtering**: Optional start_date and end_date filters

**Edge Cases**:
- Handles trainers with no data (skips if all metrics are 0)
- Handles missing Jibble hours (returns None)
- Handles missing ratings (returns None)
- Filters by project_id if provided
- Handles date range filters for Jibble hours

---

## Key Methods Deep Dive

### `get_pod_lead_stats_with_trainers`

**Signature**: 
```python
def get_pod_lead_stats_with_trainers(
    self, 
    start_date: str = None, 
    end_date: str = None, 
    timeframe: str = 'overall', 
    project_id: int = None
) -> List[Dict[str, Any]]
```

**Purpose**: Get POD Lead stats with trainers under each POD Lead. Uses TaskHistoryRaw and TaskRaw directly for consistency.

**Data Flow**:

1. **POD Lead Mapping**:
   - Query: `session.query(PodLeadMapping).all()`
   - Builds: `trainer_to_pod` mapping (trainer_email -> pod_lead_email)
   - Builds: `pod_trainers` mapping (pod_email -> list of trainer_emails)

2. **Task History Stats** (Step 1):
   - Query: 
     ```python
     session.query(
         TaskHistoryRaw.author,
         func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
         func.sum(case((TaskHistoryRaw.completed_status_count == 1, 1), else_=0)).label('new_tasks'),
         func.sum(case((TaskHistoryRaw.completed_status_count > 1, 1), else_=0)).label('rework')
     ).filter(
         TaskHistoryRaw.new_status == 'completed',
         TaskHistoryRaw.old_status != 'completed-approval',
         TaskHistoryRaw.project_id.in_(filter_project_ids),
         TaskHistoryRaw.author.isnot(None)
     ).group_by(TaskHistoryRaw.author)
     ```
   - **Attribution**: Uses `TaskHistoryRaw.author` (who actually made the transition)
   - **Date Filtering**: Applied on `TaskHistoryRaw.date`

3. **Sum Turns** (Step 2):
   - Query: 
     ```python
     session.query(
         TaskRaw.trainer,
         func.sum(TaskRaw.number_of_turns).label('sum_turns')
     ).filter(
         TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated']),
         TaskRaw.last_completed_date.isnot(None),
         TaskRaw.project_id.in_(filter_project_ids)
     ).group_by(TaskRaw.trainer)
     ```
   - Used for: avg_rework calculation

4. **Approved Tasks** (Step 3):
   - **Definition**: `task_status='completed'`, `count_reviews > 0`, `review_action_type != 'rework'`
   - **Attribution Rule**:
     - Find FIRST author (who made the FIRST completion with `completed_status_count = 1`)
     - Find LAST completer (who made the LAST completion when it got approved)
     - If FIRST author == LAST completer → `approved` (original owner got it approved)
     - If FIRST author != LAST completer → `approved_rework` (someone else fixed it)
   - **Query**: 
     ```python
     # Get approved task IDs
     approved_task_ids = session.query(TaskRaw.task_id).filter(...)
     
     # Get completion events
     completion_events = session.query(
         TaskHistoryRaw.task_id,
         TaskHistoryRaw.author,
         TaskHistoryRaw.completed_status_count,
         TaskHistoryRaw.time_stamp
     ).filter(
         TaskHistoryRaw.task_id.in_(approved_task_ids),
         TaskHistoryRaw.new_status == 'completed',
         TaskHistoryRaw.old_status != 'completed-approval',
         TaskHistoryRaw.author.isnot(None)
     )
     ```

5. **Delivery Stats** (Step 3.5):
   - **Delivered**: `delivery_status = 'delivered'`
   - **In Queue**: `delivery_batch_name IS NOT NULL AND delivery_status != 'delivered'`
   - **Attribution**: Uses LAST completer from TaskHistoryRaw
   - **Note**: In Queue has NO date filter (shows current status)

6. **Reviews & Ratings** (Steps 4 & 5):
   - **Manual Reviews**: 
     ```python
     session.query(
         TrainerReviewStats.trainer_email,
         func.count(TrainerReviewStats.review_id).label('total_reviews'),
         func.sum(TrainerReviewStats.score).label('total_score')
     ).filter(
         TrainerReviewStats.project_id.in_(filter_project_ids),
         TrainerReviewStats.score.isnot(None),
         or_(TrainerReviewStats.review_type == 'manual', TrainerReviewStats.review_type.is_(None))
     ).group_by(TrainerReviewStats.trainer_email)
     ```
   - **Agentic Reviews**: Same query but `review_type == 'auto'`
   - **Attribution**: Reviews are attributed to the trainer who did the work (not current task owner)

7. **Jibble Hours** (Step 6):
   - **Source**: JibbleHours table
   - **Matching**: Uses `pod_lead_mapping` to map `jibble_name` -> `trainer_email`
   - **Filtering**: Filtered by project-specific Jibble project names
   - **Date Filtering**: Optional start_date and end_date
   - **Special Handling**: Separates trainer hours from POD lead hours

8. **POD Aggregation** (Step 7):
   - Aggregates trainer stats to POD level
   - Calculates POD-level metrics:
     - `avg_rework`: `(total_completions / unique_tasks) - 1`
     - `rework_percent`: `(rework / total_submissions) * 100`
     - `avg_rating`: Weighted average from trainer ratings
     - `merged_exp_aht`: Uses `_calculate_merged_aht()`
     - `aht_submission`: `total_trainer_hours / (new_tasks + rework)`

9. **Unmapped Trainers** (Step 8):
   - Handles trainers with data but no POD Lead mapping
   - Creates "No Pod Lead" category
   - Includes trainers with delivery data but no task history

**Metrics Returned** (per POD Lead):
- `pod_lead_name`, `pod_lead_email`
- `trainer_count`: Number of trainers with data
- `unique_tasks`, `new_tasks`, `rework`
- `total_reviews`, `agentic_reviews`, `agentic_rating`
- `approved_tasks`, `approved_rework`
- `delivered_tasks`, `in_delivery_queue`
- `avg_rework`, `rework_percent`, `avg_rating`
- `merged_exp_aht`, `jibble_hours`, `total_trainer_hours`, `aht_submission`
- `trainers`: List of trainer details

**Metrics Returned** (per Trainer):
- `trainer_name`, `trainer_email`
- `unique_tasks`, `new_tasks`, `rework`
- `total_reviews`, `agentic_reviews`, `agentic_rating`
- `approved_tasks`, `approved_rework`
- `delivered_tasks`, `in_delivery_queue`
- `avg_rework`, `rework_percent`, `avg_rating`
- `merged_exp_aht`, `jibble_hours`, `aht_submission`
- `status`

**Edge Cases**:
- Skips POD Leads with no trainers having any data
- Includes trainers with delivery data but no task history
- Handles trainers without POD Lead mapping ("No Pod Lead" category)
- Prevents double-counting when POD lead is listed as their own trainer
- Filters by project_id if provided
- Handles date range filters

---

### `get_project_stats_with_pod_leads`

**Signature**: 
```python
def get_project_stats_with_pod_leads(
    self,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    include_tasks: bool = False
) -> List[Dict[str, Any]]
```

**Purpose**: Get statistics aggregated by Project -> POD Lead hierarchy. Each project contains POD Leads with their aggregated metrics.

**Data Flow**:

1. **Project Iteration**: Iterates over all projects from `self.settings.all_project_ids_list`

2. **True Unique Tasks** (Project Level):
   - Query: `COUNT(DISTINCT task_id) WHERE new_status='completed' AND old_status != 'completed-approval'`
   - **Purpose**: Prevents overcounting when tasks are worked on by multiple trainers
   - **Used For**: Project-level `avg_rework` calculation

3. **Task History Stats** (Per Project):
   - Same query as `get_pod_lead_stats_with_trainers` Step 1
   - Grouped by: `author` (trainer email)
   - Filtered by: `project_id`

4. **Task-Level Details** (if `include_tasks=True`):
   - Gets detailed task history with completion info per trainer
   - Tracks: `is_new`, `rework_count`, `total_completions`, `completion_date`
   - Fetches task details from TaskRaw: colab_link, task_status, delivery_status, count_reviews, avg_rating, number_of_turns, etc.
   - Gets agentic review data per task
   - Calculates task-level metrics:
     - `accounted_hours`: `(new_task_mins + rework_mins) / 60`
       - `new_task_mins = 10 if is_new else 0`
       - `rework_mins = 4 * rework_count`
     - `rework_percent`: `(rework_count / total_submissions) * 100`

5. **Reviews & Ratings**:
   - Same as `get_pod_lead_stats_with_trainers` Steps 4 & 5
   - Separates manual and agentic reviews
   - Filtered by project_id

6. **Delivery Stats**:
   - Same as `get_pod_lead_stats_with_trainers` Step 3.5
   - Attribution: Uses LAST completer from TaskHistoryRaw

7. **Jibble Hours**:
   - Similar to `get_pod_lead_stats_with_trainers` Step 6
   - **Special Handling**: Project-specific filtering
   - **Swap Logic**: Some projects (37, 39) have swapped Jibble hours due to data alignment issues
   - Uses `jibble_config.should_swap_jibble_hours(project_id)` to determine swap

8. **POD Aggregation**:
   - Groups trainers by POD Lead (or "No Pod Lead")
   - Aggregates metrics to POD level
   - Calculates POD-level metrics:
     - `avg_rework`, `rework_percent`
     - `avg_rating`: Weighted average
     - `agentic_rating`: From agentic reviews
     - `merged_exp_aht`, `accounted_hours`
     - `efficiency`: `(accounted_hours / total_pod_jibble) * 100`

9. **Project Aggregation**:
   - Aggregates POD metrics to project level
   - Calculates project-level metrics:
     - `avg_rework`: Uses `project_true_unique_tasks` (not summed per-trainer)
     - `avg_rating`: Weighted average
     - `agentic_rating`: From agentic reviews
     - `merged_exp_aht`
     - `efficiency`: `(accounted_hours / logged_hours) * 100`
     - `logged_hours`: `trainer_jibble_hours + pod_jibble_hours`

**Metrics Returned** (per Project):
- `project_id`, `project_name`
- `pod_lead_count`, `trainer_count`
- `unique_tasks`: TRUE unique count (not summed)
- `new_tasks`, `rework`
- `total_reviews`, `agentic_reviews`, `agentic_rating`
- `delivered`, `in_queue`
- `avg_rework`, `rework_percent`, `avg_rating`
- `merged_exp_aht`, `logged_hours`, `total_pod_hours`, `accounted_hours`, `efficiency`
- `pod_leads`: List of POD Lead details

**Metrics Returned** (per POD Lead):
- Same as `get_pod_lead_stats_with_trainers` POD Lead metrics
- Plus: `pod_jibble_hours`, `efficiency`

**Metrics Returned** (per Trainer):
- Same as `get_pod_lead_stats_with_trainers` Trainer metrics
- Plus: `accounted_hours`, `efficiency`
- Plus: `tasks`: List of task details (if `include_tasks=True`)

**Edge Cases**:
- Uses TRUE unique tasks count at project level (prevents overcounting)
- Includes trainers with delivery data but no task history
- Handles unmapped trainers ("No Pod Lead" category)
- Prevents double-counting POD lead hours
- Handles Jibble project swaps for specific projects
- Filters by date range if provided

---

## Attribution Logic

### Core Attribution Rules

#### 1. Task Completion Attribution
- **Source**: `TaskHistoryRaw.author`
- **Rule**: Credit goes to the trainer who actually made the transition (`new_status='completed'`)
- **Why**: Ensures credit goes to the trainer who did the work, even if task was reassigned
- **Used In**: 
  - `unique_tasks`, `new_tasks_submitted`, `rework_submitted`
  - All methods using TaskHistoryRaw

#### 2. Approved Task Attribution
- **Rule**: 
  - Find FIRST author (who made the FIRST completion with `completed_status_count = 1`)
  - Find LAST completer (who made the LAST completion when it got approved)
  - If FIRST author == LAST completer → `approved` (original owner got it approved)
  - If FIRST author != LAST completer → `approved_rework` (someone else fixed it)
- **Examples**:
  - Trainer A completes → approved → A gets "Approved"
  - Trainer A completes → rejected → A reworks → approved → A gets "Approved" (A is first author)
  - Trainer A completes → rejected → B reworks → approved → B gets "Approved Rework" (B is not first author)
- **Used In**: 
  - `get_trainer_overall_stats`
  - `get_pod_lead_stats_with_trainers`
  - `get_project_stats_with_pod_leads`

#### 3. Delivery Attribution
- **Rule**: Uses LAST completer from TaskHistoryRaw
- **Why**: The person who completed the work gets credit for delivery
- **Used In**: 
  - `delivered` tasks
  - `in_queue` tasks
- **Note**: In Queue has NO date filter (shows current status)

#### 4. Review Attribution
- **Source**: `TrainerReviewStats.trainer_email`
- **Rule**: Reviews are attributed to the trainer who did the work (not current task owner)
- **Examples**:
  - Trainer A completes task → rejected (3.3) → reworks → approved (4.8)
    - Trainer A gets 2 reviews: avg = (3.3 + 4.8) / 2 = 4.05
  - Trainer A completes task → rejected (2.3) → Trainer B reworks → approved (5.0)
    - Trainer A gets 1 review: 2.3
    - Trainer B gets 1 review: 5.0
- **Used In**: 
  - `total_reviews`, `avg_rating`
  - All methods using TrainerReviewStats

#### 5. Jibble Hours Attribution
- **Source**: `JibbleHours.full_name` (from BigQuery)
- **Matching**: Uses `pod_lead_mapping` table to map `jibble_name` -> `trainer_email`
- **Fallback**: Tries name-based matching if email doesn't match
- **Filtering**: Filtered by project-specific Jibble project names
- **Used In**: 
  - `jibble_hours` for trainers
  - `pod_jibble_hours` for POD leads
  - `logged_hours` for projects

---

## Edge Cases and Data Handling

### Null Value Handling

1. **None Values**:
   - Ratings: Returns `None` if no reviews
   - AHT: Returns `None` if no submissions
   - Dates: Returns `None` if missing
   - Jibble hours: Returns `None` if not found

2. **Empty Sets/Lists**:
   - Returns empty list `[]` if no data found
   - Returns empty dict `{}` for maps if no data

3. **Zero Division**:
   - All division operations check for zero denominators
   - Returns `None` or `0` as appropriate

### Missing Data Handling

1. **Trainers Without POD Lead**:
   - Creates "No Pod Lead" category
   - Includes trainers with task history but no mapping
   - Includes trainers with delivery data but no task history

2. **Trainers With No Data**:
   - Skipped if all metrics are 0 (unless they have delivery data)
   - Included if they have any non-zero metric

3. **Missing Jibble Hours**:
   - Returns `None` or `0` if not found
   - Tries email matching first, then name matching

4. **Missing Ratings**:
   - Returns `None` if no reviews
   - Handles cases where `count_reviews = 0`

### Date Filtering

1. **Task History**: Filtered by `TaskHistoryRaw.date`
2. **TaskRaw**: Filtered by `TaskRaw.last_completed_date`
3. **Reviews**: Filtered by `TrainerReviewStats.review_date`
4. **Jibble Hours**: Filtered by `JibbleHours.entry_date`
5. **In Queue**: NO date filter (shows current status)

### Project Filtering

1. **Default**: Uses `self.settings.project_id_filter` if not provided
2. **Multiple Projects**: Uses `self.settings.all_project_ids_list` for multi-project queries
3. **Jibble Projects**: Maps project IDs to Jibble project names via constants
4. **Project Swaps**: Some projects (37, 39) have swapped Jibble hours due to data alignment

### Aggregation Levels

1. **Task Level**: Individual task metrics
2. **Trainer Level**: Aggregated per trainer email
3. **POD Lead Level**: Aggregated per POD lead (sum of trainers)
4. **Project Level**: Aggregated per project (sum of POD leads)
5. **Overall Level**: Aggregated across all projects

### Special Calculations

1. **Avg Rework**: `((total_completions / unique_tasks) - 1)`
   - Decimal number (e.g., 4.12 means average 4.12 reworks per task)

2. **Rework Percent**: `(rework / (rework + new_tasks)) * 100`
   - Percentage (0-100)

3. **Merged AHT**: `(new_tasks * NEW_TASK_AHT + rework * REWORK_AHT) / total_submissions`
   - Uses configurable constants

4. **Accounted Hours**: `new_tasks * NEW_TASK_AHT + rework * REWORK_AHT`
   - Uses configurable constants

5. **Efficiency**: `(accounted_hours / logged_hours) * 100`
   - Percentage showing how much of logged time is accounted for

6. **AHT Submission**: `logged_hours / (new_tasks + rework)`
   - Average hours per submission

---

## Summary of Key Metrics

### Task Metrics
- `unique_tasks`: Count of distinct task IDs
- `new_tasks`: Tasks with `completed_status_count == 1`
- `rework`: Tasks with `completed_status_count > 1`
- `total_submissions`: `new_tasks + rework`

### Review Metrics
- `total_reviews`: Count of reviews (from TrainerReviewStats)
- `avg_rating`: Average rating score
- `agentic_reviews`: Count of agentic (auto) reviews
- `agentic_rating`: Average agentic rating

### Delivery Metrics
- `approved`: Tasks approved by original author
- `approved_rework`: Tasks approved by someone else
- `delivered`: Tasks with `delivery_status = 'delivered'`
- `in_queue`: Tasks in delivery queue (current status)

### Efficiency Metrics
- `avg_rework`: Average reworks per task
- `rework_percent`: Percentage of submissions that are rework
- `merged_exp_aht`: Expected AHT based on new/rework mix
- `accounted_hours`: Hours accounted for by task completions
- `jibble_hours`: Hours logged in Jibble
- `efficiency`: Percentage of logged time accounted for
- `aht_submission`: Average hours per submission

### Time Metrics
- `average_completion_time_hours`: Time from creation to annotation
- `sum_number_of_turns`: Total number of turns across tasks
- `task_duration`: AHT in minutes (from TaskRaw)

---

## Constants Used

### AHT Constants
- `DEFAULT_NEW_TASK_AHT`: Default AHT for new tasks (in hours)
- `DEFAULT_REWORK_AHT`: Default AHT for rework (in hours)

### Project Constants
- `PROJECT_ID_TO_NAME`: Mapping of project IDs to names
- `PROJECT_ID_TO_JIBBLE_NAMES`: Mapping of project IDs to Jibble project names
- `JIBBLE_PROJECT_SWAP`: Projects with swapped Jibble hours

---

## Database Tables Used

1. **TaskHistoryRaw**: Task completion history with author attribution
2. **TaskRaw**: Current task state and derived metrics
3. **TrainerReviewStats**: Review statistics attributed to trainers
4. **ContributorDailyStats**: Daily stats per contributor
5. **ReviewerDailyStats**: Daily stats per reviewer
6. **ReviewerTrainerDailyStats**: Daily stats per reviewer-trainer pair
7. **JibbleHours**: Logged hours from BigQuery
8. **PodLeadMapping**: Mapping of trainers to POD leads
9. **Contributor**: Contributor information (name, email, status, team_lead_id)
10. **TaskAHT**: AHT data per task
11. **ContributorTaskStats**: Task statistics per contributor
12. **ReviewDetail**: Review details with quality dimensions
13. **Task**: Task information
14. **TaskReviewedInfo**: Task review information

---

## Notes

1. **Attribution is Critical**: The system uses `TaskHistoryRaw.author` for proper attribution, ensuring credit goes to the trainer who did the work, not the current task owner.

2. **Date Filtering**: Most metrics respect date filters, but "In Queue" shows current status regardless of date range.

3. **Project Filtering**: Jibble hours are filtered by project-specific Jibble project names to avoid cross-project counting.

4. **True Unique Tasks**: Project-level unique tasks uses a true count (not summed per-trainer) to prevent overcounting.

5. **POD Lead Hours**: POD lead hours are tracked separately from trainer hours to prevent double-counting.

6. **Review Attribution**: Reviews are attributed to the trainer who did the work, not the current task owner, ensuring accurate performance metrics.

---

## End of Document
