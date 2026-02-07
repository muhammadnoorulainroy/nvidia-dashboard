# Query Service Analysis Report

**File:** `backend/app/services/query_service.py`  
**Lines:** 3048  
**Date:** February 5, 2026

---

## Table of Contents

1. [Class Overview](#class-overview)
2. [Method Summary](#method-summary)
3. [SQL Query Patterns](#sql-query-patterns)
4. [Data Aggregation Logic](#data-aggregation-logic)
5. [Edge Cases Handled](#edge-cases-handled)
6. [Potential Bugs & Issues](#potential-bugs--issues)
7. [Metrics Calculation Formulas](#metrics-calculation-formulas)
8. [Filtering Mechanisms](#filtering-mechanisms)
9. [Hardcoded Values & Exclusions](#hardcoded-values--exclusions)
10. [Key Business Logic](#key-business-logic)

---

## Class Overview

**Class:** `QueryService`

**Purpose:** Main service class for PostgreSQL query operations for NVIDIA dashboard statistics. Handles complex aggregations, filtering, and metric calculations across multiple database tables.

**Key Dependencies:**
- SQLAlchemy ORM
- Google Cloud BigQuery (for quality dimensions)
- Multiple database models: `ReviewDetail`, `Task`, `TaskRaw`, `TaskHistoryRaw`, `Contributor`, `TaskAHT`, `TrainerReviewStats`, `JibbleHours`, `PodLeadMapping`, etc.

**Caching:**
- `_allowed_quality_dimensions_cache`: Caches enabled quality dimensions from BigQuery

---

## Method Summary

### Initialization & Helper Methods

#### `__init__(self)`
- Initializes settings, DB service, and quality dimensions cache
- No parameters

#### `_get_allowed_quality_dimensions(self, force_refresh: bool = False) -> Set[str]`
- **Purpose:** Fetches enabled quality dimensions from BigQuery
- **Caching:** Uses `_allowed_quality_dimensions_cache` to avoid repeated queries
- **Query:** `SELECT DISTINCT name FROM project_quality_dimension WHERE project_id = {project_id_filter} AND is_enabled = 1`
- **Returns:** Set of quality dimension names
- **Edge Cases:** Returns empty set on error

#### `_get_contributor_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose:** Maps contributor IDs to name, email, status, and team_lead_id
- **Returns:** Dictionary mapping contributor_id -> {name, email, status, team_lead_id}
- **Edge Cases:** Returns empty dict on error

#### `_format_name_with_status(self, name: str, status: str) -> str`
- **Purpose:** Formats contributor name with status indicator
- **Logic:** Returns name as-is if status is None or 'active', otherwise appends "(status)"
- **Edge Cases:** Returns 'Unknown' if name is None/empty

#### `_process_aggregation_results(self, results: List[Any], group_key: Optional[str] = None) -> List[Dict[str, Any]]`
- **Purpose:** Processes query results into structured aggregation format
- **Key Logic:**
  - Groups by `group_key` (domain, reviewer_id, trainer_id, etc.)
  - Filters quality dimensions using `_get_allowed_quality_dimensions()`
  - Calculates averages, task counts, rework counts
  - Handles conversation_id deduplication
- **Returns:** List of aggregated dictionaries with quality dimensions

### Aggregation Methods

#### `get_overall_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]`
- **Purpose:** Get overall aggregation statistics across all data
- **Filters:** domain, reviewer, trainer
- **Key Metrics:**
  - Task count (distinct Task.id where is_delivered='False')
  - Reviewer count, Trainer count, Domain count
  - Average completion time
  - Quality dimensions with average scores
- **SQL Pattern:** `ReviewDetail LEFT JOIN Task` filtered by `is_delivered='False'`
- **Edge Cases:** Returns empty structure with zeros if no data

#### `get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get domain-wise aggregation statistics
- **Grouping:** By `domain` field
- **Returns:** List sorted by domain name
- **SQL Pattern:** Same as overall, but grouped by domain

#### `get_trainer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get trainer-wise aggregation statistics
- **Grouping:** By `human_role_id` (trainer ID)
- **Additional Data:**
  - AHT (Average Handle Time) metrics
  - New tasks vs rework stats from `ContributorTaskStats`
  - Completion times
- **Returns:** List sorted by trainer name

#### `get_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get reviewer-wise aggregation statistics
- **Grouping:** By `reviewer_id`
- **Returns:** List sorted by reviewer name

#### `get_pod_lead_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get POD Lead aggregation with nested reviewers
- **Key Logic:**
  - Maps trainers to POD Leads via `team_lead_id` from Contributor table
  - Aggregates at POD Lead level and Reviewer level
  - Skips trainers without POD Lead assignment
- **Returns:** List sorted by POD Lead name

#### `get_reviewers_with_trainers(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get reviewers with their trainers nested
- **Structure:** Reviewer -> Trainers hierarchy
- **Returns:** List sorted by reviewer name

### Task-Level Methods

#### `get_task_level_data(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get task-level data with all quality dimensions and AHT
- **Key Fields:**
  - Task ID, task score, annotator info, reviewer info
  - Colab link, week number, rework count
  - Duration minutes (AHT)
  - Quality dimensions as dictionary
- **Returns:** List sorted by task_id

### Daily Stats Methods

#### `get_trainer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get trainer stats at date level (trainer x date granularity)
- **Data Sources:**
  - `ContributorDailyStats` for new_tasks, rework, unique_tasks
  - `TaskRaw` for `sum_number_of_turns` (filtered by `derived_status IN ('Completed', 'Reviewed', 'Rework', 'Validated')`)
  - `TaskRaw` for avg_rating (SUM(sum_score) / SUM(count_reviews) where count_reviews > 0)
- **Key Metrics:**
  - `avg_rework = (total_completions / unique_tasks) - 1`
  - `rework_percent = rework / (rework + new_tasks) * 100`
- **Project Filtering:** Uses `project_id` from filters or `settings.project_id_filter`

#### `get_reviewer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get reviewer stats at date level
- **Data Source:** `ReviewerDailyStats` table
- **Rating Calculation:** From `TaskRaw` using `r_submitted_date` (reviewer's submission date)
- **Project Filter:** Hardcoded to `self.settings.project_id_filter` (line 1551)

#### `get_trainers_by_reviewer_date(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get trainers reviewed by each reviewer on each date
- **Data Source:** `ReviewerTrainerDailyStats` table
- **Rating:** Overall avg_rating per trainer (not date-specific)

### Overall Stats Methods

#### `get_trainer_overall_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get overall trainer stats (aggregated across all dates)
- **Data Sources:**
  - `TaskHistoryRaw` for unique_tasks, new_tasks_submitted, rework_submitted
  - `TaskRaw` for sum_number_of_turns
  - `TaskRaw` + `TaskHistoryRaw` for approved, approved_rework, delivered, in_queue
  - `TrainerReviewStats` for total_reviews and avg_rating
  - `JibbleHours` for logged hours
- **Key Attribution Logic:**
  - **Approved Tasks:** First author == Last completer → Approved; First author != Last completer → Approved Rework
  - **Delivery Stats:** Attributed to last completer
- **Project Filtering:** Uses `project_id` from filters or `settings.project_id_filter`
- **Jibble Hours:** Filtered by project-specific Jibble project names, mapped via `pod_lead_mapping`

### Rating & Trend Methods

#### `get_rating_trends(self, trainer_email: str = None, granularity: str = "weekly") -> Dict[str, Any]`
- **Purpose:** Get rating trends over time
- **Granularity:** daily, weekly (default), monthly
- **Data Source:** `TaskRaw` grouped by date period
- **Calculation:** `SUM(sum_score) / SUM(count_reviews)` where count_reviews > 0
- **Returns:** Overall trends, by_trainer trends, improvement stats

#### `get_rating_comparison(self, period1_start: str, period1_end: str, period2_start: str, period2_end: str, trainer_email: str = None) -> Dict[str, Any]`
- **Purpose:** Compare ratings between two time periods
- **Returns:** Period stats, overall comparison, by_trainer improvements

### POD Lead & Project Methods

#### `get_pod_lead_stats_with_trainers(self, start_date: str = None, end_date: str = None, timeframe: str = 'overall', project_id: int = None) -> List[Dict[str, Any]]`
- **Purpose:** Get POD Lead stats with trainers under each POD Lead
- **Project Filtering:** Uses provided `project_id` or `settings.all_project_ids_list`
- **Data Sources:** Same as `get_trainer_overall_stats` but aggregated by POD Lead
- **Key Logic:**
  - Maps trainers to POD Leads via `PodLeadMapping`
  - Aggregates trainer stats to POD level
  - Handles Jibble hours separately for POD Leads vs trainers
  - Prevents double-counting when POD lead is listed as their own trainer
- **Returns:** List sorted by total_reviews descending

#### `get_project_stats_with_pod_leads(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]`
- **Purpose:** Get statistics aggregated by Project -> POD Lead hierarchy
- **Structure:** Project -> POD Leads -> Trainers
- **Data Sources:** Same as POD Lead stats, but iterates over all projects
- **Jibble Project Mapping:** Includes hardcoded swap for CFBench (37) and Multichallenge (39) projects
- **Returns:** List sorted by total_reviews descending

### Helper Methods

#### `_get_average_completion_time(self, session, filters: Optional[Dict[str, Any]] = None) -> Optional[float]`
- **Purpose:** Calculate average task completion time in hours
- **Formula:** `(annotation_date - created_at) / 3600` (in hours)
- **Edge Cases:** Only counts positive durations, returns None if no valid data

#### `_get_completion_times_by_trainer(self, session, filters: Optional[Dict[str, Any]] = None) -> Dict[int, float]`
- **Purpose:** Get average completion time by trainer ID
- **Returns:** Dictionary mapping trainer_id -> average hours

#### `_get_task_aht_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose:** Get task ID to AHT mapping
- **Data Source:** `TaskAHT` table

#### `_get_trainer_aht_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose:** Get trainer ID to average AHT mapping
- **Calculation:** `SUM(duration_minutes) / COUNT(task_id)` per contributor

#### `_get_contributor_task_stats_map(self) -> Dict[int, Dict[str, Any]]`
- **Purpose:** Get contributor ID to task stats mapping
- **Data Source:** `ContributorTaskStats` table
- **Fields:** new_tasks_submitted, rework_submitted, total_unique_tasks, first/last submission dates

---

## SQL Query Patterns

### Common Patterns

1. **Base Filter Pattern:**
   ```python
   query.filter(ReviewDetail.is_delivered == 'False')
   ```
   - Used consistently across all aggregation methods
   - Filters out delivered tasks

2. **Join Pattern:**
   ```python
   session.query(ReviewDetail, Task.rework_count).outerjoin(
       Task, ReviewDetail.conversation_id == Task.id
   )
   ```
   - LEFT OUTER JOIN to include tasks without rework_count

3. **Group By Pattern:**
   ```python
   query.group_by(SomeModel.field).all()
   ```

4. **Aggregation Pattern:**
   ```python
   func.count(func.distinct(SomeModel.id))
   func.sum(SomeModel.field)
   func.avg(SomeModel.field)
   ```

5. **Date Filtering Pattern:**
   ```python
   if start_date:
       query = query.filter(SomeModel.date_field >= start_date)
   if end_date:
       query = query.filter(SomeModel.date_field <= end_date)
   ```

6. **Project Filtering Pattern:**
   ```python
   if filter_project_ids:
       query = query.filter(SomeModel.project_id.in_(filter_project_ids))
   ```

7. **Null Checking Pattern:**
   ```python
   SomeModel.field.isnot(None)
   SomeModel.field.is_(None)
   ```

### Complex Query Patterns

1. **Attribution Logic (Approved Tasks):**
   ```python
   # Get completion events, sort by timestamp
   # First author = first completion
   # Last completer = last completion
   # If first == last → Approved
   # If first != last → Approved Rework
   ```

2. **Delivery Status Logic:**
   ```python
   # Delivered: delivery_status = 'delivered'
   # In Queue: delivery_batch_name IS NOT NULL AND delivery_status != 'delivered'
   ```

3. **Derived Status Filter:**
   ```python
   TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated'])
   ```

4. **Rating Calculation:**
   ```python
   func.sum(TaskRaw.sum_score) / func.sum(TaskRaw.count_reviews)
   WHERE count_reviews > 0
   ```

---

## Data Aggregation Logic

### Quality Dimensions Aggregation

1. **Filtering:** Only includes dimensions from `_get_allowed_quality_dimensions()`
2. **Deduplication:** Uses `conversation_ids` set to count unique tasks
3. **Score Aggregation:** 
   - Collects all scores per dimension
   - Calculates average: `sum(scores) / len(scores)`
4. **Task Score:** Stored per conversation_id (one per task)
5. **Rework Count:** Stored per conversation_id

### Trainer Aggregation

1. **Unique Tasks:** COUNT DISTINCT task_id from `TaskHistoryRaw` where `new_status='completed'` and `old_status != 'completed-approval'`
2. **New Tasks:** COUNT where `completed_status_count == 1`
3. **Rework:** COUNT where `completed_status_count > 1`
4. **Attribution:** Uses `author` field from `TaskHistoryRaw` (who actually made the transition)

### POD Lead Aggregation

1. **Mapping:** Trainer → POD Lead via `team_lead_id` or `PodLeadMapping` table
2. **Hierarchy:** POD Lead → Reviewers → Quality Dimensions
3. **Aggregation:** Sums trainer stats to POD level
4. **Jibble Hours:** Separate tracking for POD Lead vs trainers (prevents double-counting)

### Project Aggregation

1. **Iteration:** Loops through `all_project_ids_list`
2. **Per-Project Stats:** Aggregates by project_id
3. **Hierarchy:** Project → POD Leads → Trainers
4. **Totals:** Calculates project-level totals

---

## Edge Cases Handled

### Null Checks

1. **Task Fields:**
   - `created_at.isnot(None)` and `annotation_date.isnot(None)` for completion time
   - `current_user_id.isnot(None)` for trainer attribution
   - `author.isnot(None)` for history attribution

2. **Date Fields:**
   - `last_completed_date.isnot(None)`
   - `r_submitted_date.isnot(None)`
   - `entry_date` filtering with None checks

3. **Score Fields:**
   - `score.isnot(None)` before calculations
   - `count_reviews > 0` before division

4. **String Fields:**
   - `delivery_batch_name.isnot(None)` and `delivery_batch_name != ''`
   - `name` checks before processing

### Empty Results

1. **Empty Aggregations:**
   - Returns empty structure with zeros/None values
   - Example: `get_overall_aggregation()` returns dict with zeros if no data

2. **Empty Lists:**
   - Methods return empty list `[]` if no matching data
   - Example: `get_domain_aggregation()` returns `[]`

3. **Skip Logic:**
   - Skips trainers without POD Lead (line 500-501)
   - Skips contributors with no data (line 1444-1446)
   - Skips POD Leads with no trainers having data (line 2496-2498)

### Date Boundaries

1. **Date Range Filtering:**
   - Optional `start_date` and `end_date` parameters
   - Uses `>=` and `<=` for inclusive boundaries
   - Handles None values gracefully

2. **Date Type Handling:**
   - Converts date objects to datetime if needed (lines 268-276, 425-433)
   - Handles both date and datetime objects

3. **In Queue Status:**
   - **CRITICAL:** In Queue is a CURRENT status, not historical
   - Does NOT filter by date for in_queue tasks (lines 2200-2213, 2679-2690)

### Division by Zero

1. **Average Calculations:**
   - Checks `len(scores) > 0` before division
   - Checks `total_reviews > 0` before division
   - Checks `unique_tasks > 0` before division

2. **Percentage Calculations:**
   - Checks `(rework + new_tasks) > 0` before division
   - Checks `submissions > 0` before division

3. **Default Values:**
   - Returns `None` if denominator is zero
   - Returns `0` for counts if no data

### Missing Mappings

1. **Contributor Map:**
   - Returns `'Unknown'` if contributor_id not found
   - Handles missing email, name, status gracefully

2. **POD Lead Mapping:**
   - Skips trainers without POD Lead assignment
   - Uses fallback names if mapping missing

3. **Jibble Hours:**
   - Returns `None` or `0` if no matching hours found
   - Tries email matching first, then name matching

### Data Type Conversions

1. **String to Int:**
   - `int(filters['reviewer'])` and `int(filters['trainer'])` with potential ValueError risk

2. **Float Rounding:**
   - All averages rounded to 2 decimal places
   - Percentages rounded to 1 decimal place

3. **Date Formatting:**
   - Uses `.isoformat()` for date strings
   - Handles both date and datetime objects

---

## Potential Bugs & Issues

### Critical Issues

1. **Type Conversion Without Error Handling (Lines 177, 179, 628, 630, 899, 901)**
   ```python
   query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
   ```
   - **Issue:** Will raise `ValueError` if `filters['reviewer']` is not a valid integer
   - **Risk:** Application crash on invalid filter input
   - **Fix:** Add try/except or validation

2. **Hardcoded Project Filter (Lines 1551, 1639)**
   ```python
   TaskRaw.project_id == self.settings.project_id_filter
   ```
   - **Issue:** `get_reviewer_daily_stats()` and `get_trainers_by_reviewer_date()` hardcode project filter instead of using filters parameter
   - **Risk:** Inconsistent behavior compared to other methods
   - **Fix:** Use `effective_project_id` pattern like other methods

3. **Jibble Project Swap Logic (Lines 2760-2769)**
   ```python
   if project_id == 37:  # CFBench - use Multichallenge jibble hours (swapped)
       jibble_query = jibble_query.filter(...)
   elif project_id == 39:  # Multichallenge - use CFBench jibble hours (swapped)
   ```
   - **Issue:** Hardcoded data swap logic indicates data quality issue
   - **Risk:** If data is fixed, swap will cause incorrect results
   - **Fix:** Document clearly or fix root cause

4. **In Queue Date Filtering Inconsistency**
   - **Issue:** In Queue tasks are NOT filtered by date (current status), but delivered tasks ARE filtered
   - **Risk:** Confusion about what "In Queue" represents
   - **Note:** This appears intentional (see comments), but could be clearer

### Medium Issues

5. **Missing Date Validation**
   - **Issue:** No validation that `start_date <= end_date`
   - **Risk:** Returns empty results without warning
   - **Fix:** Add validation and error message

6. **Email Case Sensitivity**
   - **Issue:** Uses `.lower().strip()` inconsistently
   - **Risk:** Potential mismatches if emails have different casing
   - **Note:** Most places handle this, but could be more consistent

7. **BigQuery Query String Formatting (Line 36)**
   ```python
   WHERE project_id = {self.settings.project_id_filter} AND is_enabled = 1
   ```
   - **Issue:** Direct string interpolation in SQL query
   - **Risk:** SQL injection if project_id_filter is user-controlled (unlikely but risky pattern)
   - **Fix:** Use parameterized queries

8. **Division by Zero in Edge Cases**
   - **Issue:** Some calculations don't check for zero before division
   - **Example:** Line 539: `avg_task_score = round(sum(task_scores) / len(task_scores), 2) if task_scores else None`
   - **Note:** Most places handle this, but could be more consistent

9. **Missing Transaction Management**
   - **Issue:** Multiple queries in same method without explicit transaction boundaries
   - **Risk:** Inconsistent data if queries run at different times
   - **Note:** SQLAlchemy sessions handle this, but could be more explicit

10. **Cache Invalidation**
    - **Issue:** `_allowed_quality_dimensions_cache` never invalidated except by `force_refresh`
    - **Risk:** Stale data if quality dimensions change
    - **Fix:** Add TTL or invalidation mechanism

### Minor Issues

11. **Inconsistent Rounding**
    - Some percentages rounded to 0 decimal places, others to 1
    - Example: Line 1070: `round((rework / (rework + new_tasks)) * 100, 0)` vs Line 1462: `round((rework / (rework + new_tasks)) * 100, 0)`

12. **Duplicate Code**
    - Similar aggregation logic repeated across multiple methods
    - Could be refactored into helper methods

13. **Magic Numbers**
    - Line 2447: `merged_aht = round((new_tasks * 10 + rework * 4) / submissions, 2)`
    - Hardcoded multipliers (10, 4) should be constants

14. **Missing Type Hints**
    - Some return types use `Any` instead of specific types
    - Could improve type safety

15. **Logging Inconsistency**
    - Some methods log errors, others don't
    - Some methods log info, others don't
    - Could be more consistent

---

## Metrics Calculation Formulas

### Core Metrics

1. **Average Rework:**
   ```
   avg_rework = (total_completions / unique_tasks) - 1
   where total_completions = new_tasks + rework
   ```
   - **Interpretation:** Decimal number (e.g., 4.12 means average 4.12 reworks per task)
   - **Used in:** Trainer stats, Reviewer stats, POD Lead stats, Project stats

2. **Rework Percentage:**
   ```
   rework_percent = (rework / (rework + new_tasks)) * 100
   ```
   - **Interpretation:** Percentage of submissions that were rework
   - **Used in:** All aggregation methods

3. **Average Task Score:**
   ```
   avg_task_score = SUM(task_scores) / COUNT(task_scores)
   ```
   - **Used in:** Quality dimension aggregations

4. **Average Rating:**
   ```
   avg_rating = SUM(sum_score) / SUM(count_reviews)
   WHERE count_reviews > 0
   ```
   - **Data Source:** `TaskRaw` table
   - **Used in:** Trainer stats, Reviewer stats, Rating trends

5. **Total Rework Count:**
   ```
   total_rework_count = SUM(rework_count per conversation_id)
   ```
   - **Used in:** Quality dimension aggregations

6. **Average Rework Count:**
   ```
   average_rework_count = SUM(rework_count) / COUNT(conversation_ids)
   ```
   - **Used in:** Quality dimension aggregations

### Advanced Metrics

7. **Merged Expected AHT:**
   ```
   merged_exp_aht = (new_tasks * 10 + rework * 4) / (new_tasks + rework)
   ```
   - **Interpretation:** Weighted average expected handle time
   - **Constants:** 10 minutes for new tasks, 4 minutes for rework
   - **Used in:** Trainer stats, POD Lead stats, Project stats

8. **AHT of Submission:**
   ```
   aht_submission = jibble_hours / (new_tasks + rework)
   ```
   - **Interpretation:** Actual logged hours per submission
   - **Used in:** Trainer stats, POD Lead stats

9. **Efficiency:**
   ```
   efficiency = (accounted_hours / logged_hours) * 100
   where accounted_hours = (new_tasks * 10 + rework * 4)
   ```
   - **Interpretation:** Percentage of logged hours that match expected hours
   - **Used in:** Project stats

10. **Average Completion Time:**
    ```
    avg_completion_time = AVG(annotation_date - created_at) in hours
    WHERE annotation_date > created_at
    ```
    - **Used in:** Overall aggregation, Trainer aggregation

11. **Unique Tasks:**
    ```
    unique_tasks = COUNT(DISTINCT task_id)
    WHERE new_status='completed' AND old_status != 'completed-approval'
    ```
    - **Data Source:** `TaskHistoryRaw`
    - **Used in:** All aggregation methods

12. **New Tasks vs Rework:**
    ```
    new_tasks = COUNT WHERE completed_status_count == 1
    rework = COUNT WHERE completed_status_count > 1
    ```
    - **Data Source:** `TaskHistoryRaw`
    - **Used in:** All aggregation methods

### Attribution Metrics

13. **Approved Tasks:**
    ```
    Approved = COUNT WHERE first_author == last_completer
    Approved Rework = COUNT WHERE first_author != last_completer
    ```
    - **Logic:** First author is who made first completion, last completer is who got it approved
    - **Used in:** Trainer overall stats, POD Lead stats, Project stats

14. **Delivery Stats:**
    ```
    Delivered = COUNT WHERE delivery_status = 'delivered'
    In Queue = COUNT WHERE delivery_batch_name IS NOT NULL 
                AND delivery_status != 'delivered'
    ```
    - **Attribution:** Last completer from `TaskHistoryRaw`
    - **Used in:** Trainer overall stats, POD Lead stats, Project stats

---

## Filtering Mechanisms

### Filter Parameters

All aggregation methods accept optional `filters: Optional[Dict[str, Any]]` parameter.

### Supported Filters

1. **Domain Filter:**
   ```python
   if filters.get('domain'):
       query = query.filter(ReviewDetail.domain == filters['domain'])
   ```
   - **Used in:** Overall, Domain, Trainer, Reviewer aggregations

2. **Reviewer Filter:**
   ```python
   if filters.get('reviewer'):
       query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
   ```
   - **Used in:** Overall, Domain, Trainer aggregations
   - **Issue:** No error handling for invalid int conversion

3. **Trainer Filter:**
   ```python
   if filters.get('trainer'):
       query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
   ```
   - **Used in:** Overall, Domain, Reviewer aggregations
   - **Issue:** No error handling for invalid int conversion

4. **Project Filter:**
   ```python
   project_id = filters.get('project_id') if filters else None
   effective_project_id = project_id if project_id is not None else self.settings.project_id_filter
   ```
   - **Used in:** Trainer daily stats, Trainer overall stats
   - **Fallback:** Uses `settings.project_id_filter` if not provided

5. **Date Range Filters:**
   ```python
   start_date = filters.get('start_date') if filters else None
   end_date = filters.get('end_date') if filters else None
   ```
   - **Used in:** POD Lead stats, Project stats, Rating trends, Rating comparison
   - **Applied to:** Various date fields (`date`, `last_completed_date`, `entry_date`, `review_date`)

### Base Filters (Always Applied)

1. **is_delivered Filter:**
   ```python
   ReviewDetail.is_delivered == 'False'
   Task.is_delivered == 'False'
   ```
   - **Purpose:** Exclude delivered tasks from aggregations
   - **Applied:** All aggregation methods

2. **Quality Dimensions Filter:**
   ```python
   allowed_dimensions = self._get_allowed_quality_dimensions()
   if name and name in allowed_dimensions:
       # Process dimension
   ```
   - **Purpose:** Only include enabled quality dimensions
   - **Applied:** All quality dimension aggregations

3. **Derived Status Filter:**
   ```python
   TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated'])
   ```
   - **Purpose:** Only include tasks in specific statuses
   - **Applied:** Trainer daily stats, Trainer overall stats

4. **Review Count Filter:**
   ```python
   TaskRaw.count_reviews > 0
   ```
   - **Purpose:** Only include tasks that have been reviewed
   - **Applied:** Rating calculations

5. **Author Filter:**
   ```python
   TaskHistoryRaw.author.isnot(None)
   ```
   - **Purpose:** Only include events with valid author attribution
   - **Applied:** History-based aggregations

### Project Filtering Patterns

1. **Single Project:**
   ```python
   filter_project_ids = [effective_project_id] if effective_project_id is not None else None
   ```

2. **Multiple Projects:**
   ```python
   filter_project_ids = [project_id] if project_id else self.settings.all_project_ids_list
   ```

3. **Project ID List:**
   ```python
   if filter_project_ids:
       query = query.filter(SomeModel.project_id.in_(filter_project_ids))
   ```

---

## Hardcoded Values & Exclusions

### Hardcoded Project IDs

1. **Project ID Filter (Line 36, 1551, 1639):**
   ```python
   self.settings.project_id_filter
   ```
   - **Used in:** Quality dimensions query, Reviewer daily stats, Trainers by reviewer date
   - **Issue:** Hardcoded instead of using filters parameter

2. **All Project IDs List (Line 1975, 2561):**
   ```python
   self.settings.all_project_ids_list
   ```
   - **Used in:** POD Lead stats, Project stats
   - **Purpose:** Default to all projects if none specified

### Hardcoded Jibble Project Mappings

1. **Project to Jibble Name Map (Lines 1347-1355, 2321-2329, 2740-2748):**
   ```python
   project_jibble_map = {
       36: 'Nvidia - SysBench',
       37: 'Nvidia - CFBench Multilingual',
       38: 'Nvidia - InverseIFEval',
       39: 'Nvidia - Multichallenge',
       40: 'Nvidia - Multichallenge Advanced',
       41: 'Nvidia - ICPC',
       42: 'NVIDIA_STEM Math_Eval',
   }
   ```
   - **Purpose:** Map project IDs to Jibble project names
   - **Issue:** Hardcoded mapping, should be in config

2. **Project 39 Special Handling:**
   ```python
   if pid == 39:  # Multichallenge includes both regular and Advanced
       jibble_projects_to_filter.append('Nvidia - Multichallenge')
       jibble_projects_to_filter.append('Nvidia - Multichallenge Advanced')
   ```
   - **Purpose:** Include both Multichallenge projects for project 39

3. **CFBench/Multichallenge Swap (Lines 2760-2769):**
   ```python
   if project_id == 37:  # CFBench - use Multichallenge jibble hours (swapped)
       jibble_query = jibble_query.filter(
           or_(
               JibbleHours.project == 'Nvidia - Multichallenge',
               JibbleHours.project == 'Nvidia - Multichallenge Advanced'
           )
       )
   elif project_id == 39:  # Multichallenge - use CFBench jibble hours (swapped)
       jibble_query = jibble_query.filter(JibbleHours.project == 'Nvidia - CFBench Multilingual')
   ```
   - **Issue:** Hardcoded data swap indicates data quality problem
   - **Risk:** Will cause incorrect results if data is fixed

### Hardcoded Multipliers

1. **AHT Multipliers (Line 2447, 2506, 2851, 2991):**
   ```python
   merged_aht = round((new_tasks * 10 + rework * 4) / submissions, 2)
   ```
   - **Constants:** 10 minutes for new tasks, 4 minutes for rework
   - **Issue:** Should be configurable constants

### Hardcoded Status Values

1. **Derived Status Filter:**
   ```python
   TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated'])
   ```
   - **Used in:** Multiple methods
   - **Issue:** Should be configurable

2. **Task Status Filter:**
   ```python
   func.lower(TaskRaw.task_status) == 'completed'
   ```
   - **Used in:** Approved tasks query

3. **Delivery Status Filter:**
   ```python
   func.lower(TaskRaw.delivery_status) == 'delivered'
   ```

4. **Review Action Type Filter:**
   ```python
   or_(
       TaskRaw.review_action_type != 'rework',
       TaskRaw.review_action_type.is_(None)
   )
   ```
   - **Used in:** Approved tasks query

### Exclusions

1. **Trainers Without POD Lead (Line 500-501):**
   ```python
   if pod_lead_id is None:
       continue
   ```
   - **Purpose:** Skip trainers not assigned to a POD Lead
   - **Impact:** These trainers won't appear in POD Lead aggregations

2. **Contributors With No Data (Line 1444-1446):**
   ```python
   if unique_tasks == 0 and new_tasks == 0 and rework == 0:
       continue
   ```
   - **Purpose:** Skip trainers with no activity
   - **Impact:** Cleaner results, but may hide inactive trainers

3. **POD Leads With No Trainers Having Data (Line 2496-2498):**
   ```python
   if pod_totals['unique_tasks'] == 0 and pod_totals['new_tasks'] == 0 and pod_totals['rework'] == 0:
       continue
   ```
   - **Purpose:** Skip empty POD Leads
   - **Impact:** Cleaner results

4. **Delivered Tasks:**
   ```python
   ReviewDetail.is_delivered == 'False'
   ```
   - **Purpose:** Exclude delivered tasks from aggregations
   - **Impact:** Only shows in-progress tasks

5. **Disabled Quality Dimensions:**
   ```python
   if name and name in allowed_dimensions:
       # Process
   ```
   - **Purpose:** Only include enabled quality dimensions
   - **Impact:** Filters out disabled dimensions

---

## Key Business Logic

### Attribution Rules

1. **Task Completion Attribution:**
   - Uses `TaskHistoryRaw.author` field (who actually made the transition)
   - Ensures credit goes to the trainer who did the work, even if task was reassigned

2. **Approved Task Attribution:**
   - **First Author:** Person who made the FIRST completion (completed_status_count = 1)
   - **Last Completer:** Person who made the LAST completion (got it approved)
   - **Rule:** If first author == last completer → Approved (original owner got it approved)
   - **Rule:** If first author != last completer → Approved Rework (someone else fixed it)

3. **Delivery Attribution:**
   - Uses LAST COMPLETER from `TaskHistoryRaw`
   - Ensures consistency - the person who completed the work gets credit for delivery

4. **Review Attribution:**
   - Uses `TrainerReviewStats` table
   - Each review is attributed to the trainer who did the work that was reviewed
   - Example: Trainer A completes → rejected (3.3) → reworks → approved (4.8)
     - Trainer A gets 2 reviews: avg = (3.3 + 4.8) / 2 = 4.05

### Data Source Selection

1. **Unique Tasks, New Tasks, Rework:**
   - **Source:** `TaskHistoryRaw`
   - **Reason:** Tracks actual transitions and attribution

2. **Sum Number of Turns:**
   - **Source:** `TaskRaw`
   - **Filter:** `derived_status IN ('Completed', 'Reviewed', 'Rework', 'Validated')`
   - **Reason:** Matches spreadsheet formula

3. **Average Rating:**
   - **Source:** `TaskRaw` or `TrainerReviewStats`
   - **Formula:** `SUM(sum_score) / SUM(count_reviews)` where `count_reviews > 0`
   - **Reason:** Aggregated review scores

4. **AHT (Average Handle Time):**
   - **Source:** `TaskAHT` table
   - **Calculation:** `SUM(duration_minutes) / COUNT(task_id)` per contributor

5. **Jibble Hours:**
   - **Source:** `JibbleHours` table (from BigQuery)
   - **Matching:** Via `pod_lead_mapping` table (jibble_name → trainer_email)
   - **Filtering:** By project-specific Jibble project names

### Aggregation Hierarchy

1. **Overall:** All data aggregated together
2. **Domain:** Grouped by domain field
3. **Trainer:** Grouped by human_role_id (trainer)
4. **Reviewer:** Grouped by reviewer_id
5. **POD Lead:** Grouped by team_lead_id, with nested reviewers
6. **Project:** Grouped by project_id, with nested POD Leads and trainers

### Date Handling

1. **Completion Time:** Uses `annotation_date - created_at` (in hours)
2. **Daily Stats:** Groups by `submission_date`, `review_date`, `last_completed_date`
3. **Trend Analysis:** Groups by period (daily/weekly/monthly)
4. **In Queue:** NOT filtered by date (current status, not historical)

### Jibble Hours Logic

1. **Project Filtering:** Critical to filter by specific project to avoid cross-project counting
2. **Mapping:** Uses `pod_lead_mapping` table to map jibble_name → trainer_email
3. **Fallback:** Tries email matching first, then name matching
4. **Double-Counting Prevention:** Excludes POD Lead's own hours when summing trainer hours
5. **Project Swap:** Hardcoded swap for CFBench (37) and Multichallenge (39) projects

---

## Summary

### Strengths

1. **Comprehensive Coverage:** Handles all major aggregation scenarios
2. **Edge Case Handling:** Good null checks and empty result handling
3. **Attribution Logic:** Well-thought-out rules for task attribution
4. **Flexible Filtering:** Supports domain, reviewer, trainer, project, date filters
5. **Caching:** Quality dimensions cached to reduce BigQuery calls

### Weaknesses

1. **Error Handling:** Missing try/except for type conversions
2. **Hardcoded Values:** Project mappings, multipliers, status values should be configurable
3. **Inconsistency:** Some methods hardcode project filter, others use filters parameter
4. **Data Quality Issues:** Hardcoded swap logic indicates underlying data problems
5. **Code Duplication:** Similar aggregation logic repeated across methods

### Recommendations

1. **Add Input Validation:** Validate filter parameters before use
2. **Extract Constants:** Move hardcoded values to configuration
3. **Standardize Filtering:** Use consistent project filtering pattern across all methods
4. **Add Error Handling:** Wrap type conversions in try/except
5. **Refactor Common Logic:** Extract repeated aggregation patterns into helper methods
6. **Fix Data Quality:** Address root cause of CFBench/Multichallenge swap
7. **Add Logging:** More consistent logging across methods
8. **Documentation:** Add docstrings explaining complex attribution logic

---

**End of Analysis**
