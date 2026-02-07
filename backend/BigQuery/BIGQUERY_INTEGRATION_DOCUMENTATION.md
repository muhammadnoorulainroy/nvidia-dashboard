# BigQuery Integration Documentation

**Project**: Dashboard_prod_nvidia  
**Dataset**: `turing-gpt.prod_labeling_tool_n`  
**Last Updated**: 2026-02-06

---

## Table of Contents

1. [Overview](#overview)
2. [BigQuery Tables Used](#bigquery-tables-used)
3. [Data Sync Process](#data-sync-process)
4. [Complete BigQuery Queries](#complete-bigquery-queries)
5. [Data Transformations](#data-transformations)
6. [Sync Methods](#sync-methods)

---

## Overview

The BigQuery integration synchronizes data from Google BigQuery to PostgreSQL for the NVIDIA dashboard. The system uses two main services:

1. **`bigquery_service.py`**: Real-time query service for dashboard aggregations
2. **`data_sync_service.py`**: Batch synchronization service that periodically syncs data to PostgreSQL

---

## BigQuery Tables Used

### Core Tables

#### 1. `conversation` (Task Table)
- **Purpose**: Main task/conversation data
- **Key Columns**:
  - `id`: Task/conversation ID
  - `project_id`: Project identifier
  - `batch_id`: Batch identifier
  - `current_user_id`: Trainer/annotator ID
  - `status`: Task status (completed, validated, labeling, etc.)
  - `statement`: Task statement (contains domain info)
  - `colab_link`: RLHF link
  - `number_of_turns`: Conversation turns
  - `completed_at`: Completion timestamp
  - `created_at`, `updated_at`: Timestamps

#### 2. `conversation_status_history`
- **Purpose**: Complete history of task status transitions
- **Key Columns**:
  - `conversation_id`: Task ID
  - `old_status`: Previous status
  - `new_status`: New status
  - `author_id`: User who made the change
  - `created_at`: Transition timestamp
- **Used For**:
  - Task completion events
  - Rework counting
  - AHT (Average Handle Time) calculation
  - Task history tracking

#### 3. `review`
- **Purpose**: Review records for tasks
- **Key Columns**:
  - `id`: Review ID
  - `conversation_id`: Task ID
  - `reviewer_id`: Reviewer contributor ID
  - `review_type`: 'manual' or 'auto'
  - `status`: 'published' or other
  - `score`: Review score
  - `followup_required`: Boolean flag
  - `submitted_at`: Review submission timestamp
  - `created_at`, `updated_at`: Timestamps
- **Used For**:
  - Review aggregations
  - Quality dimension scores
  - Reviewer statistics

#### 4. `review_quality_dimension_value`
- **Purpose**: Quality dimension scores for reviews
- **Key Columns**:
  - `review_id`: Review ID
  - `quality_dimension_id`: Quality dimension ID
  - `score`: Dimension score
  - `score_text`: Score text value
- **Used For**:
  - Domain-wise aggregations
  - Quality dimension analysis

#### 5. `quality_dimension`
- **Purpose**: Quality dimension definitions
- **Key Columns**:
  - `id`: Dimension ID
  - `name`: Dimension name

#### 6. `delivery_batch`
- **Purpose**: Delivery batch information
- **Key Columns**:
  - `id`: Delivery batch ID
  - `name`: Batch name
  - `status`: Delivery status
  - `author_id`: Creator ID
  - `open_date`, `close_date`: Batch dates

#### 7. `delivery_batch_task`
- **Purpose**: Mapping of tasks to delivery batches
- **Key Columns**:
  - `task_id`: Task/conversation ID
  - `delivery_batch_id`: Delivery batch ID
  - `updated_at`: Last update timestamp
- **Used For**:
  - Determining if tasks are delivered
  - Delivery status tracking

#### 8. `contributor`
- **Purpose**: Contributor/user information
- **Key Columns**:
  - `id`: Contributor ID
  - `name`: Contributor name
  - `turing_email`: Email address
  - `type`: Contributor type
  - `status`: Contributor status
  - `team_lead_id`: Team lead reference
- **Used For**:
  - Trainer/annotator names
  - Reviewer names
  - Contributor mappings

#### 9. `batch`
- **Purpose**: Batch information
- **Key Columns**:
  - `id`: Batch ID
  - `name`: Batch name
  - `project_id`: Project ID
  - `status`: Batch status (draft, ongoing, etc.)

---

## Data Sync Process

### Sync Architecture

```
BigQuery (Source) → DataSyncService → PostgreSQL (Destination)
```

### Sync Flow

1. **Initialization**: BigQuery client is initialized with service account credentials
2. **Query Execution**: BigQuery queries are executed to fetch data
3. **Data Transformation**: Raw BigQuery results are transformed to match PostgreSQL schema
4. **Bulk Insert**: Data is inserted into PostgreSQL in batches (typically 5000 records)
5. **Logging**: Sync operations are logged in `data_sync_log` table

### Sync Types

- **`scheduled`**: Regular scheduled syncs
- **`manual`**: Manually triggered syncs
- **`initial`**: Initial data load

---

## Complete BigQuery Queries

### 1. Review Detail Query

**Purpose**: Fetches review details with quality dimensions, domain, and delivery status

**Location**: `bigquery_service.py::_build_review_detail_query()` and `data_sync_service.py::_build_review_detail_query()`

**Query**:
```sql
WITH task_reviewed_info AS ( 
    SELECT DISTINCT 
        r.conversation_id AS r_id,
        bt.task_id AS delivered_id,
        c.colab_link AS RLHF_Link,
        "False" AS is_delivered,
        r.status,
        r.score AS task_score,
        DATE(r.updated_at) AS updated_at,
        cb.name,
        (
            SELECT DATE(MIN(csh_inner.updated_at))
            FROM `{project_id}.{dataset}.conversation_status_history` csh_inner
            WHERE csh_inner.conversation_id = c.id
                AND csh_inner.old_status = 'labeling'
                AND csh_inner.new_status = 'completed'
        ) AS annotation_date
    FROM `{project_id}.{dataset}.conversation` c
    INNER JOIN `{project_id}.{dataset}.review` r
        ON c.id = r.conversation_id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON c.project_id = b.project_id
    LEFT JOIN `{project_id}.{dataset}.delivery_batch_task` bt
        ON bt.task_id = c.id
    LEFT JOIN `{project_id}.{dataset}.contributor` cb
        ON cb.id = c.current_user_id
    WHERE c.project_id = {project_id_filter}
        AND c.status IN ('completed', 'validated')
        AND r.review_type NOT IN ('auto')
        AND r.followup_required = 0
        AND r.id = (
            SELECT MAX(rn.id)
            FROM `{project_id}.{dataset}.review` rn
            WHERE rn.conversation_id = r.conversation_id
                AND rn.review_type = 'manual'
                AND rn.status = 'published'
        )
),
task AS (
    SELECT 
        *,
        tdi.is_delivered,
        CASE 
            WHEN REGEXP_CONTAINS(statement, r'\*\*domain\*\*') THEN
                TRIM(REGEXP_EXTRACT(statement, r'\*\*domain\*\*\s*-\s*([^\n]+)'))
            WHEN REGEXP_CONTAINS(statement, r'\*\*suggested-domain\*\*') THEN
                TRIM(REGEXP_EXTRACT(statement, r'\*\*suggested-domain\*\*\s*-\s*([^\n]+)'))
            ELSE NULL
        END AS domain
    FROM `{project_id}.{dataset}.conversation` as task_
    RIGHT JOIN task_reviewed_info AS tdi
        ON tdi.r_id = task_.id
    WHERE project_id = {project_id_filter} 
),
review AS (
    SELECT 
        *,
        ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY id DESC) AS row_num
    FROM `{project_id}.{dataset}.review`
    WHERE review_type = 'manual' 
        AND status = 'published'
        AND conversation_id IN (SELECT distinct id from task)
),
review_detail AS (
    SELECT 
        b.quality_dimension_id, 
        task_.domain,
        task_.human_role_id,
        b.review_id, 
        a.reviewer_id, 
        a.conversation_id, 
        tdi.is_delivered,
        a.score as task_score,
        rqd.name, 
        b.score_text, 
        b.score,
        tdi.updated_at
    FROM (SELECT * FROM review WHERE row_num = 1) a
    RIGHT JOIN task AS task_ 
        ON task_.id = a.conversation_id
    LEFT JOIN task_reviewed_info AS tdi
        ON tdi.r_id = task_.id
    LEFT JOIN `{project_id}.{dataset}.review_quality_dimension_value` AS b 
        ON b.review_id = a.id
    LEFT JOIN `{project_id}.{dataset}.quality_dimension` AS rqd
        ON rqd.id = b.quality_dimension_id
    WHERE 1=1
)
SELECT * FROM review_detail
```

**What It Fetches**:
- Review details with quality dimension scores
- Domain extracted from task statement
- Trainer/annotator ID (`human_role_id`)
- Reviewer ID
- Delivery status (`is_delivered`)
- Task scores and quality dimension scores
- Review update dates

**Tables Queried**:
- `conversation`
- `review`
- `batch`
- `delivery_batch_task`
- `contributor`
- `conversation_status_history` (subquery)
- `review_quality_dimension_value`
- `quality_dimension`

---

### 2. Task Query

**Purpose**: Fetches task information with rework counts and domain extraction

**Location**: `data_sync_service.py::_build_task_query()`

**Query**:
```sql
WITH task_reviewed_info AS ( 
    SELECT DISTINCT 
        r.conversation_id AS r_id,
        bt.task_id AS delivered_id,
        c.colab_link AS RLHF_Link,
        "False" AS is_delivered,
        r.status,
        r.score AS task_score,
        DATE(r.updated_at) AS updated_at,
        cb.name,
        (
            SELECT MIN(csh_inner.updated_at)
            FROM `{project_id}.{dataset}.conversation_status_history` csh_inner
            WHERE csh_inner.conversation_id = c.id
                AND csh_inner.old_status = 'labeling'
                AND csh_inner.new_status = 'completed'
        ) AS annotation_date
    FROM `{project_id}.{dataset}.conversation` c
    INNER JOIN `{project_id}.{dataset}.review` r
        ON c.id = r.conversation_id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON c.project_id = b.project_id
    LEFT JOIN `{project_id}.{dataset}.delivery_batch_task` bt
        ON bt.task_id = c.id
    LEFT JOIN `{project_id}.{dataset}.contributor` cb
        ON cb.id = c.current_user_id
    WHERE c.project_id = {project_id_filter}
        AND c.status IN ('completed', 'validated')
        AND r.review_type NOT IN ('auto')
        AND r.followup_required = 0
        AND r.id = (
            SELECT MAX(rn.id)
            FROM `{project_id}.{dataset}.review` rn
            WHERE rn.conversation_id = r.conversation_id
                AND rn.review_type = 'manual'
                AND rn.status = 'published'
        )
),
rework_counts AS (
    SELECT 
        conversation_id,
        -- Count only transitions INTO rework status (times task was sent to rework)
        COUNTIF(new_status = 'rework') AS rework_count
    FROM `{project_id}.{dataset}.conversation_status_history`
    WHERE conversation_id IN (SELECT r_id FROM task_reviewed_info)
    GROUP BY conversation_id
),
task AS (
    SELECT 
        c.id,
        c.created_at,
        c.updated_at,
        c.statement,
        c.status,
        c.project_id,
        c.batch_id,
        c.current_user_id,
        c.colab_link,
        tdi.is_delivered,
        COALESCE(rc.rework_count, 0) AS rework_count,
        TRIM(REGEXP_EXTRACT(c.statement, r'\*\*Domain:\*\*\s*-\s*([^\n]+)')) AS domain,
        c.number_of_turns,
        DATE(c.completed_at) AS last_completed_date
    FROM `{project_id}.{dataset}.conversation` c
    INNER JOIN task_reviewed_info AS tdi
        ON tdi.r_id = c.id
    LEFT JOIN rework_counts AS rc
        ON rc.conversation_id = c.id
    WHERE c.project_id = {project_id_filter} 
        AND c.status IN ('completed', 'validated')
)
SELECT * FROM task
```

**What It Fetches**:
- Task IDs and metadata
- Rework counts (number of times task was sent to rework)
- Domain extracted from statement
- Delivery status
- Completion dates
- Number of turns

**Tables Queried**:
- `conversation`
- `review`
- `batch`
- `delivery_batch_task`
- `contributor`
- `conversation_status_history` (for rework counts and annotation dates)

---

### 3. Task AHT (Average Handle Time) Query

**Purpose**: Calculates Average Handle Time from pending→labeling to labeling→completed transitions

**Location**: `data_sync_service.py::sync_task_aht()`

**Query**:
```sql
WITH task_transitions AS (
    SELECT DISTINCT
        csh.conversation_id AS task_id,
        csh.author_id,
        c.name AS contributor_name,
        cs.project_id,
        cs.batch_id AS batch_id,
        csh.old_status,
        csh.new_status,
        csh.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY csh.conversation_id, csh.author_id, csh.old_status, csh.new_status
            ORDER BY csh.created_at
        ) AS transition_order
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    JOIN `{project_id}.{dataset}.conversation` cs
        ON csh.conversation_id = cs.id
    JOIN `{project_id}.{dataset}.contributor` c
        ON c.id = csh.author_id
    WHERE cs.project_id = {project_id}
        AND cs.batch_id NOT IN (177)
),
annotator_aht AS (
    SELECT DISTINCT
        t1.task_id,
        t1.author_id,
        t1.contributor_name,
        t1.batch_id,
        t1.created_at AS starting_timestamp,
        t2.created_at AS completed_timestamp,
        t1.old_status AS starting_status,
        t1.new_status AS labeling_status,
        t2.old_status AS labeling_completed_status,
        t2.new_status AS completed_status,
        TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) AS duration_seconds
    FROM task_transitions t1
    JOIN task_transitions t2
        ON t1.task_id = t2.task_id
        AND t1.transition_order = t2.transition_order
        AND t1.old_status = 'pending'
        AND t1.new_status = 'labeling'
        AND t2.old_status = 'labeling'
        AND t2.new_status = 'completed'
        AND TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) <= 10800
    WHERE t2.created_at >= t1.created_at
),
annotator_filtered AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY task_id
            ORDER BY duration_seconds ASC
        ) AS rank_by_duration
    FROM annotator_aht
    WHERE duration_seconds <= 10800
)
SELECT DISTINCT
    a.task_id,
    a.author_id,
    a.contributor_name,
    a.batch_id,
    a.starting_timestamp,
    a.completed_timestamp,
    a.duration_seconds,
    CAST(a.duration_seconds AS FLOAT64) / 60.0 AS duration_minutes
FROM annotator_filtered a
WHERE rank_by_duration = 1
```

**What It Fetches**:
- Task ID
- Contributor ID and name
- Batch ID
- Start timestamp (pending→labeling)
- End timestamp (labeling→completed)
- Duration in seconds and minutes
- Filters out durations > 3 hours (10800 seconds)

**Tables Queried**:
- `conversation_status_history`
- `conversation`
- `contributor`

---

### 4. Contributor Task Stats Query

**Purpose**: Calculates new tasks vs rework submitted per contributor

**Location**: `data_sync_service.py::sync_contributor_task_stats()`

**Query**:
```sql
WITH task_completions AS (
    SELECT 
        csh.conversation_id as task_id,
        csh.author_id,
        csh.created_at,
        csh.old_status,
        csh.new_status,
        -- Running count of completed status per task (matches spreadsheet COUNTIF logic)
        COUNTIF(csh.new_status = 'completed') OVER (
            PARTITION BY csh.conversation_id
            ORDER BY csh.created_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS completed_status_count
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON csh.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
),
-- Filter to only completed transitions (matching spreadsheet filter)
completed_events AS (
    SELECT *
    FROM task_completions
    WHERE new_status = 'completed'
      AND old_status != 'completed-approval'
),
-- Calculate sum of number_of_turns using the exact same query as task_raw
trainer_task_turns AS (
    SELECT 
        c.id as trainer_id,
        SUM(cs.number_of_turns) as sum_turns
    FROM `{project_id}.{dataset}.conversation` cs
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    LEFT JOIN `{project_id}.{dataset}.contributor` c 
        ON cs.current_user_id = c.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND LOWER(cs.status) IN ('completed', 'reviewed', 'rework', 'validated')
      AND cs.completed_at IS NOT NULL
    GROUP BY c.id
)
SELECT 
    ce.author_id as contributor_id,
    -- New Tasks = completions where completed_status_count = 1 (first time task was completed)
    SUM(CASE WHEN completed_status_count = 1 THEN 1 ELSE 0 END) as new_tasks_submitted,
    -- Rework = completions where completed_status_count > 1 (task was completed before)
    SUM(CASE WHEN completed_status_count > 1 THEN 1 ELSE 0 END) as rework_submitted,
    -- Unique tasks = distinct task_ids this trainer completed
    COUNT(DISTINCT ce.task_id) as total_unique_tasks,
    MIN(ce.created_at) as first_submission_date,
    MAX(ce.created_at) as last_submission_date,
    -- Sum of number_of_turns for tasks owned by this contributor (for avg_rework)
    COALESCE((SELECT ttt.sum_turns FROM trainer_task_turns ttt WHERE ttt.trainer_id = ce.author_id), 0) as sum_number_of_turns
FROM completed_events ce
GROUP BY ce.author_id
```

**What It Fetches**:
- Contributor ID
- New tasks submitted (first-time completions)
- Rework submitted (subsequent completions)
- Total unique tasks
- First and last submission dates
- Sum of number_of_turns (for avg_rework calculation)

**Tables Queried**:
- `conversation_status_history`
- `conversation`
- `batch`
- `contributor`

---

### 5. Contributor Daily Stats Query

**Purpose**: Daily-level stats for contributors (new tasks vs rework per date)

**Location**: `data_sync_service.py::sync_contributor_daily_stats()`

**Query**:
```sql
WITH task_completions AS (
    SELECT 
        csh.conversation_id as task_id,
        csh.author_id,
        DATE(csh.created_at) as submission_date,
        csh.created_at,
        csh.new_status,
        csh.old_status,
        -- Running count of completed status per task (matches spreadsheet COUNTIF logic)
        COUNTIF(csh.new_status = 'completed') OVER (
            PARTITION BY csh.conversation_id
            ORDER BY csh.created_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS completed_status_count
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON csh.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
),
-- Filter to only completed transitions (matching spreadsheet filter)
completed_events AS (
    SELECT *
    FROM task_completions
    WHERE new_status = 'completed'
      AND old_status != 'completed-approval'
),
-- For avg_rework: count unique tasks and sum number_of_turns for tasks owned by this author
trainer_tasks AS (
    SELECT 
        cs.current_user_id as trainer_id,
        DATE(cs.completed_at) as last_completed_date,
        cs.id as task_id,
        cs.number_of_turns
    FROM `{project_id}.{dataset}.conversation` cs
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND LOWER(cs.status) IN ('completed', 'reviewed', 'rework', 'validated')
      AND cs.completed_at IS NOT NULL
),
-- Aggregate by trainer and date (for display in UI daily view)
trainer_date_stats AS (
    SELECT 
        trainer_id,
        last_completed_date,
        COUNT(DISTINCT task_id) as owned_tasks,
        SUM(number_of_turns) as sum_turns
    FROM trainer_tasks
    GROUP BY trainer_id, last_completed_date
)
SELECT 
    ce.author_id as contributor_id,
    ce.submission_date,
    -- New Tasks = completions where completed_status_count = 1 (first time task was completed)
    SUM(CASE WHEN ce.completed_status_count = 1 THEN 1 ELSE 0 END) as new_tasks_submitted,
    -- Rework = completions where completed_status_count > 1 (task was completed before)
    SUM(CASE WHEN ce.completed_status_count > 1 THEN 1 ELSE 0 END) as rework_submitted,
    COUNT(*) as total_submissions,
    -- Unique tasks = distinct task_ids this trainer completed (based on submission)
    COUNT(DISTINCT ce.task_id) as unique_tasks,
    -- Tasks owned by this trainer on this date (for avg_rework)
    COALESCE((SELECT tds.owned_tasks FROM trainer_date_stats tds WHERE tds.trainer_id = ce.author_id AND tds.last_completed_date = ce.submission_date), 0) as owned_tasks,
    -- Sum of number_of_turns for tasks owned by this author on this date
    COALESCE((SELECT tds.sum_turns FROM trainer_date_stats tds WHERE tds.trainer_id = ce.author_id AND tds.last_completed_date = ce.submission_date), 0) as sum_number_of_turns
FROM completed_events ce
GROUP BY ce.author_id, ce.submission_date
ORDER BY ce.author_id, ce.submission_date
```

**What It Fetches**:
- Contributor ID and submission date
- New tasks submitted per date
- Rework submitted per date
- Total submissions
- Unique tasks
- Owned tasks (for avg_rework calculation)
- Sum of number_of_turns

**Tables Queried**:
- `conversation_status_history`
- `conversation`
- `batch`
- `contributor`

---

### 6. Reviewer Daily Stats Query

**Purpose**: Daily-level stats for reviewers (tasks reviewed per date)

**Location**: `data_sync_service.py::sync_reviewer_daily_stats()`

**Query**:
```sql
WITH task_completion_counts AS (
    -- Calculate global completion count for each task
    SELECT 
        csh.conversation_id as task_id,
        csh.created_at,
        COUNTIF(csh.new_status = 'completed') OVER (
            PARTITION BY csh.conversation_id
            ORDER BY csh.created_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS completed_status_count
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON csh.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND csh.new_status = 'completed'
),
-- Get the latest completion count for each task
task_latest_count AS (
    SELECT 
        task_id,
        MAX(completed_status_count) as total_completions
    FROM task_completion_counts
    GROUP BY task_id
),
-- Reviews with task completion info
reviews_with_task_info AS (
    SELECT 
        r.reviewer_id,
        DATE(r.submitted_at) as review_date,
        r.conversation_id as task_id,
        COALESCE(tlc.total_completions, 0) as task_completions,
        cs.status as task_status,
        CASE 
            WHEN COALESCE(tlc.total_completions, 0) <= 1 THEN 1 
            ELSE 0 
        END as is_new_task,
        CASE 
            WHEN COALESCE(tlc.total_completions, 0) > 1 THEN 1 
            ELSE 0 
        END as is_rework
    FROM `{project_id}.{dataset}.review` r
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON r.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND r.review_type = 'manual'
      AND r.status = 'published'
      AND r.submitted_at IS NOT NULL
)
SELECT 
    rwti.reviewer_id,
    rwti.review_date,
    COUNT(DISTINCT rwti.task_id) as unique_tasks_reviewed,
    SUM(rwti.is_new_task) as new_tasks_reviewed,
    SUM(rwti.is_rework) as rework_reviewed,
    COUNT(*) as total_reviews,
    SUM(COALESCE(tr.number_of_turns, 0)) as sum_number_of_turns
FROM reviews_with_task_info rwti
LEFT JOIN `{project_id}.{dataset}.conversation` tr ON rwti.task_id = tr.id
WHERE rwti.reviewer_id IS NOT NULL AND rwti.review_date IS NOT NULL
GROUP BY rwti.reviewer_id, rwti.review_date
ORDER BY rwti.reviewer_id, rwti.review_date
```

**What It Fetches**:
- Reviewer ID and review date
- Unique tasks reviewed
- New tasks reviewed
- Rework reviewed
- Total reviews
- Sum of number_of_turns

**Tables Queried**:
- `conversation_status_history`
- `conversation`
- `batch`
- `review`

---

### 7. Reviewer-Trainer Daily Stats Query

**Purpose**: Reviewer x Trainer x Date level stats (what each reviewer reviewed for each trainer)

**Location**: `data_sync_service.py::sync_reviewer_trainer_daily_stats()`

**Query**:
```sql
WITH task_completion_counts AS (
    -- Calculate global completion count for each task
    SELECT 
        csh.conversation_id as task_id,
        csh.created_at,
        COUNTIF(csh.new_status = 'completed') OVER (
            PARTITION BY csh.conversation_id
            ORDER BY csh.created_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS completed_status_count
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON csh.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND csh.new_status = 'completed'
),
-- Get the latest completion count for each task
task_latest_count AS (
    SELECT 
        task_id,
        MAX(completed_status_count) as total_completions
    FROM task_completion_counts
    GROUP BY task_id
),
-- Reviews with task and trainer info
reviews_with_task_info AS (
    SELECT 
        r.reviewer_id,
        cs.current_user_id as trainer_id,
        DATE(r.submitted_at) as review_date,
        r.conversation_id as task_id,
        COALESCE(tlc.total_completions, 0) as task_completions,
        cs.status as task_status,
        cs.number_of_turns,
        CASE 
            WHEN COALESCE(tlc.total_completions, 0) <= 1 THEN 1 
            ELSE 0 
        END as is_new_task,
        CASE 
            WHEN COALESCE(tlc.total_completions, 0) > 1 THEN 1 
            ELSE 0 
        END as is_rework,
        CASE
            WHEN cs.status = 'reviewed' AND COALESCE(tlc.total_completions, 0) <= 1 THEN 1
            ELSE 0
        END as is_ready_for_delivery
    FROM `{project_id}.{dataset}.review` r
    INNER JOIN `{project_id}.{dataset}.conversation` cs 
        ON r.conversation_id = cs.id
    INNER JOIN `{project_id}.{dataset}.batch` b
        ON cs.batch_id = b.id
    LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
    WHERE cs.project_id = {project_id}
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
      AND r.review_type = 'manual'
      AND r.status = 'published'
      AND r.submitted_at IS NOT NULL
)
SELECT 
    rwti.reviewer_id,
    rwti.trainer_id,
    rwti.review_date,
    COUNT(DISTINCT rwti.task_id) as tasks_reviewed,
    SUM(rwti.is_new_task) as new_tasks_reviewed,
    SUM(rwti.is_rework) as rework_reviewed,
    COUNT(*) as total_reviews,
    SUM(rwti.is_ready_for_delivery) as ready_for_delivery,
    SUM(COALESCE(rwti.number_of_turns, 0)) as sum_number_of_turns
FROM reviews_with_task_info rwti
WHERE rwti.reviewer_id IS NOT NULL 
  AND rwti.trainer_id IS NOT NULL 
  AND rwti.review_date IS NOT NULL
GROUP BY rwti.reviewer_id, rwti.trainer_id, rwti.review_date
ORDER BY rwti.reviewer_id, rwti.trainer_id, rwti.review_date
```

**What It Fetches**:
- Reviewer ID, Trainer ID, and Review Date
- Tasks reviewed (unique count)
- New tasks reviewed
- Rework reviewed
- Total reviews
- Ready for delivery count
- Sum of number_of_turns

**Tables Queried**:
- `conversation_status_history`
- `conversation`
- `batch`
- `review`

---

### 8. Task History Raw Query

**Purpose**: Complete history of all task status transitions (mirrors spreadsheet)

**Location**: `data_sync_service.py::sync_task_history_raw()`

**Query**:
```sql
SELECT 
    th.conversation_id AS task_id,
    th.created_at AS time_stamp,
    DATE(TIMESTAMP(th.created_at)) AS date,
    th.old_status,
    th.new_status,
    th.notes,
    c.turing_email AS author,
    COUNTIF(th.new_status = 'completed') OVER (
        PARTITION BY th.conversation_id
        ORDER BY th.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS completed_status_count,
    MAX(CASE WHEN th.new_status = 'completed' THEN DATE(TIMESTAMP(th.created_at)) END) OVER (
        PARTITION BY th.conversation_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS last_completed_date,
    pr.project_id,
    pr.batch_name
FROM `{project_id}.{dataset}.conversation_status_history` th
LEFT JOIN `{project_id}.{dataset}.contributor` c ON th.author_id = c.id
INNER JOIN (
    SELECT t.id, t.project_id, b.name AS batch_name
    FROM `{project_id}.{dataset}.conversation` t
    INNER JOIN `{project_id}.{dataset}.batch` b ON t.batch_id = b.id
    WHERE t.project_id IN ({project_ids})
      AND b.status != 'draft'
      AND {batch_exclusion_sql}
) pr ON pr.id = th.conversation_id
ORDER BY task_id, time_stamp
```

**What It Fetches**:
- Complete history of all status transitions
- Task ID, timestamp, date
- Old and new status
- Author email
- Running count of completions
- Last completed date
- Project ID and batch name

**Tables Queried**:
- `conversation_status_history`
- `contributor`
- `conversation`
- `batch`

---

### 9. Task Raw Query

**Purpose**: Comprehensive task data with reviews and delivery info (mirrors spreadsheet)

**Location**: `data_sync_service.py::sync_task_raw()`

**Query**:
```sql
WITH review_stats AS (
    SELECT 
        conversation_id AS conversation_id_rs, 
        COUNT(id) AS count_reviews, 
        SUM(score) AS sum_score, 
        SUM(reflected_score) AS sum_ref_score,
        SUM(duration_minutes) AS sum_duration, 
        SUM(followup_required) AS sum_followup_required
    FROM `{project_id}.{dataset}.review`
    WHERE review_type IN ('manual') AND status = 'published'
    GROUP BY 1
),
latest_reviews AS (
    SELECT 
        r.conversation_id AS task_id_r, 
        r.created_at AS r_created_at,
        r.updated_at AS r_updated_at, 
        r.id AS review_id,
        c.turing_email AS reviewer, 
        r.score AS score,
        r.reflected_score,
        r.review_action,
        JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS review_action_type,
        r.feedback AS r_feedback, 
        r.followup_required,
        r.duration_minutes AS r_duration, 
        r.submitted_at AS r_submitted_at,
        DATE(TIMESTAMP(r.submitted_at)) AS r_submitted_date,
        ROW_NUMBER() OVER (PARTITION BY r.conversation_id ORDER BY r.created_at DESC) AS rn
    FROM `{project_id}.{dataset}.review` r
    LEFT JOIN `{project_id}.{dataset}.contributor` c ON r.reviewer_id = c.id
    WHERE r.review_type IN ('manual') AND r.status = 'published'
    QUALIFY rn = 1
),
first_completion AS (
    SELECT 
        t.conversation_id,
        DATE(TIMESTAMP(t.created_at)) AS first_completion_date, 
        c.turing_email AS first_completer,
        ROW_NUMBER() OVER (PARTITION BY t.conversation_id ORDER BY t.created_at ASC) AS rn
    FROM `{project_id}.{dataset}.conversation_status_history` t
    LEFT JOIN `{project_id}.{dataset}.contributor` c ON t.author_id = c.id
    WHERE new_status = 'completed'
    QUALIFY rn = 1
),
task_delivery AS (
    SELECT 
        dbt.task_id, 
        db.name AS delivery_batch_name,  
        db.status AS delivery_status, 
        c.turing_email AS delivery_batch_created_by, 
        db.open_date, 
        db.close_date,
        ROW_NUMBER() OVER (PARTITION BY dbt.task_id ORDER BY dbt.updated_at DESC) AS rn
    FROM `{project_id}.{dataset}.delivery_batch_task` dbt 
    LEFT JOIN `{project_id}.{dataset}.delivery_batch` db ON db.id = dbt.delivery_batch_id
    LEFT JOIN `{project_id}.{dataset}.contributor` c ON db.author_id = c.id
    QUALIFY rn = 1
)
SELECT 
    t.id AS task_id, 
    DATE(TIMESTAMP(t.created_at)) AS created_date, 
    t.updated_at,
    t.completed_at AS last_completed_at,
    DATE(TIMESTAMP(t.completed_at)) AS last_completed_date,
    c.turing_email AS trainer,
    fc.first_completion_date, 
    fc.first_completer, 
    t.colab_link, 
    t.number_of_turns,
    t.status AS task_status, 
    b.name AS batch_name,
    t.duration_minutes AS task_duration,
    td.delivery_batch_name, 
    td.delivery_status, 
    td.delivery_batch_created_by,
    DATE(TIMESTAMP(td.open_date)) AS db_open_date, 
    DATE(TIMESTAMP(td.close_date)) AS db_close_date,
    rs.conversation_id_rs,
    rs.count_reviews,
    rs.sum_score,
    rs.sum_ref_score,
    rs.sum_duration,
    rs.sum_followup_required,
    lr.task_id_r,
    lr.r_created_at,
    lr.r_updated_at,
    lr.review_id,
    lr.reviewer,
    lr.score,
    lr.reflected_score,
    lr.review_action,
    lr.review_action_type,
    lr.r_feedback,
    lr.followup_required,
    lr.r_duration,
    lr.r_submitted_at,
    lr.r_submitted_date,
    t.project_id
FROM `{project_id}.{dataset}.conversation` t
INNER JOIN `{project_id}.{dataset}.batch` b ON t.batch_id = b.id
LEFT JOIN `{project_id}.{dataset}.contributor` c ON t.current_user_id = c.id
LEFT JOIN first_completion fc ON fc.conversation_id = t.id
LEFT JOIN task_delivery td ON td.task_id = t.id
LEFT JOIN (
    SELECT rs.*, lr.*
    FROM latest_reviews lr
    LEFT JOIN review_stats rs ON rs.conversation_id_rs = lr.task_id_r
) r ON r.task_id_r = t.id
LEFT JOIN review_stats rs ON rs.conversation_id_rs = t.id
LEFT JOIN latest_reviews lr ON lr.task_id_r = t.id
WHERE t.project_id IN ({project_ids})
  AND b.status != 'draft'
  AND {batch_exclusion_sql}
```

**What It Fetches**:
- Complete task information
- Trainer email
- First completion date and completer
- Latest review information
- Review statistics (count, sum scores, duration)
- Delivery batch information
- Derived status (calculated in Python)

**Tables Queried**:
- `conversation`
- `batch`
- `contributor`
- `conversation_status_history` (for first completion)
- `delivery_batch_task`
- `delivery_batch`
- `review`

---

### 10. Trainer Review Stats Query

**Purpose**: Attributes each review to the trainer who did the work being reviewed

**Location**: `data_sync_service.py::sync_trainer_review_stats()`

**Query**:
```sql
WITH completions AS (
    -- All completion events with trainer info
    SELECT 
        csh.conversation_id,
        csh.created_at as completion_time,
        c.turing_email as trainer_email,
        ROW_NUMBER() OVER (
            PARTITION BY csh.conversation_id 
            ORDER BY csh.created_at
        ) as completion_number
    FROM `{project_id}.{dataset}.conversation_status_history` csh
    JOIN `{project_id}.{dataset}.contributor` c 
        ON csh.author_id = c.id
    JOIN `{project_id}.{dataset}.conversation` conv 
        ON conv.id = csh.conversation_id
    WHERE csh.new_status = 'completed'
    AND csh.old_status != 'completed-approval'
    AND conv.project_id IN ({project_ids})
),
reviews AS (
    -- All published reviews (manual and auto/agentic)
    SELECT 
        r.id as review_id,
        r.conversation_id,
        r.score,
        r.followup_required,
        r.created_at as review_time,
        r.review_type,
        conv.project_id
    FROM `{project_id}.{dataset}.review` r
    JOIN `{project_id}.{dataset}.conversation` conv 
        ON conv.id = r.conversation_id
    WHERE r.review_type IN ('manual', 'auto')
    AND r.status = 'published'
    AND conv.project_id IN ({project_ids})
),
review_completion_match AS (
    -- Match each review to the completion that triggered it
    SELECT 
        r.review_id,
        r.conversation_id as task_id,
        r.score,
        r.followup_required,
        r.review_time,
        r.review_type,
        r.project_id,
        c.trainer_email,
        c.completion_time,
        c.completion_number,
        ROW_NUMBER() OVER (
            PARTITION BY r.review_id 
            ORDER BY c.completion_time DESC
        ) as rn
    FROM reviews r
    JOIN completions c ON c.conversation_id = r.conversation_id
        AND c.completion_time <= r.review_time
)
SELECT 
    review_id,
    task_id,
    trainer_email,
    completion_time,
    completion_number,
    review_time,
    DATE(review_time) as review_date,
    score,
    followup_required,
    review_type,
    project_id
FROM review_completion_match
WHERE rn = 1 
AND trainer_email IS NOT NULL
ORDER BY review_time DESC
```

**What It Fetches**:
- Review ID and task ID
- Trainer email (who did the work)
- Completion time and number
- Review time and date
- Review score and followup_required
- Review type (manual/auto)

**Tables Queried**:
- `conversation_status_history`
- `contributor`
- `conversation`
- `review`

---

### 11. Contributor Query

**Purpose**: Fetches all contributor information

**Location**: `data_sync_service.py::sync_contributor()`

**Query**:
```sql
SELECT 
    id,
    name,
    turing_email,
    type,
    status,
    team_lead_id
FROM `{project_id}.{dataset}.contributor`
```

**What It Fetches**:
- Contributor ID, name, email
- Type and status
- Team lead ID (self-referential FK)

**Tables Queried**:
- `contributor`

---

## Data Transformations

### 1. Domain Extraction

**Source**: Task `statement` field  
**Method**: Regex extraction
```python
CASE 
    WHEN REGEXP_CONTAINS(statement, r'\*\*domain\*\*') THEN
        TRIM(REGEXP_EXTRACT(statement, r'\*\*domain\*\*\s*-\s*([^\n]+)'))
    WHEN REGEXP_CONTAINS(statement, r'\*\*suggested-domain\*\*') THEN
        TRIM(REGEXP_EXTRACT(statement, r'\*\*suggested-domain\*\*\s*-\s*([^\n]+)'))
    ELSE NULL
END AS domain
```

### 2. Rework Count Calculation

**Source**: `conversation_status_history`  
**Method**: Count transitions INTO 'rework' status
```sql
COUNTIF(new_status = 'rework') AS rework_count
```

### 3. Completion Status Count

**Source**: `conversation_status_history`  
**Method**: Running window count
```sql
COUNTIF(csh.new_status = 'completed') OVER (
    PARTITION BY csh.conversation_id
    ORDER BY csh.created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS completed_status_count
```

**Usage**:
- `completed_status_count = 1` → New task
- `completed_status_count > 1` → Rework

### 4. Annotation Date Calculation

**Source**: `conversation_status_history`  
**Method**: Find first transition from 'labeling' to 'completed'
```sql
(
    SELECT MIN(csh_inner.updated_at)
    FROM conversation_status_history csh_inner
    WHERE csh_inner.conversation_id = c.id
        AND csh_inner.old_status = 'labeling'
        AND csh_inner.new_status = 'completed'
) AS annotation_date
```

### 5. Delivery Status

**Source**: `delivery_batch_task`  
**Method**: LEFT JOIN to check if task exists in delivery batch
```sql
LEFT JOIN delivery_batch_task bt ON bt.task_id = c.id
-- If bt.task_id IS NOT NULL → task is delivered
```

### 6. Latest Review Selection

**Source**: `review` table  
**Method**: Window function to get latest published manual review
```sql
ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY id DESC) AS row_num
-- Then filter WHERE row_num = 1
```

### 7. AHT Duration Calculation

**Source**: `conversation_status_history`  
**Method**: Find matching transitions and calculate time difference
```sql
TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) AS duration_seconds
-- Where t1: pending→labeling, t2: labeling→completed
-- Filter: duration <= 10800 seconds (3 hours)
```

### 8. Week Number Calculation

**Source**: Task dates  
**Method**: Python calculation based on project start date
```python
days_diff = (task_date - project_start_date).days
week_num = (days_diff // 7) + 1
```

### 9. Derived Status (Task Raw)

**Source**: Task status, review count, review action  
**Method**: Python logic
```python
if task_status == 'completed':
    if count_reviews > 0:
        if r_submitted_date > created_date:
            derived_status = 'Rework' if review_action_type == 'rework' else 'Reviewed'
        else:
            derived_status = 'Completed' if review_action_type == 'rework' else 'Reviewed'
    else:
        derived_status = 'Completed'
elif task_status == 'pending':
    derived_status = 'Unclaimed'
# ... etc
```

---

## Sync Methods

### 1. `sync_review_detail()`
- **Purpose**: Sync review details with quality dimensions
- **PostgreSQL Table**: `review_detail`
- **Batch Size**: 5000
- **Transformation**: Direct mapping from BigQuery results

### 2. `sync_task()`
- **Purpose**: Sync task information with rework counts
- **PostgreSQL Table**: `task`
- **Batch Size**: 5000
- **Transformation**: 
  - Extract domain from statement
  - Calculate week_number in Python
  - Map rework_count

### 3. `sync_contributor()`
- **Purpose**: Sync contributor information
- **PostgreSQL Table**: `contributor`
- **Batch Size**: N/A (single pass)
- **Transformation**: 
  - Two-pass approach for self-referential FK (`team_lead_id`)
  - First pass: Insert with `team_lead_id = NULL`
  - Second pass: Update `team_lead_id`

### 4. `sync_task_reviewed_info()`
- **Purpose**: Sync task reviewed information
- **PostgreSQL Table**: `task_reviewed_info`
- **Batch Size**: 5000
- **Transformation**: Map column names (RLHF_Link → rlhf_link)

### 5. `sync_task_aht()`
- **Purpose**: Sync Average Handle Time data
- **PostgreSQL Table**: `task_aht`
- **Batch Size**: 5000
- **Transformation**: 
  - Filter to only tasks that exist in PostgreSQL (FK constraint)
  - Map column names

### 6. `sync_contributor_task_stats()`
- **Purpose**: Sync contributor-level task statistics
- **PostgreSQL Table**: `contributor_task_stats`
- **Batch Size**: 5000
- **Transformation**: Direct mapping

### 7. `sync_contributor_daily_stats()`
- **Purpose**: Sync contributor daily statistics
- **PostgreSQL Table**: `contributor_daily_stats`
- **Batch Size**: 5000
- **Transformation**: 
  - Calculate `tasks_ready_for_delivery` from PostgreSQL after sync

### 8. `sync_reviewer_daily_stats()`
- **Purpose**: Sync reviewer daily statistics
- **PostgreSQL Table**: `reviewer_daily_stats`
- **Batch Size**: 5000
- **Transformation**: 
  - Calculate `tasks_ready_for_delivery` from PostgreSQL after sync

### 9. `sync_reviewer_trainer_daily_stats()`
- **Purpose**: Sync reviewer x trainer daily statistics
- **PostgreSQL Table**: `reviewer_trainer_daily_stats`
- **Batch Size**: 5000
- **Transformation**: Direct mapping

### 10. `sync_task_history_raw()`
- **Purpose**: Sync complete task history
- **PostgreSQL Table**: `task_history_raw`
- **Batch Size**: 10000
- **Transformation**: Direct mapping

### 11. `sync_task_raw()`
- **Purpose**: Sync comprehensive task data
- **PostgreSQL Table**: `task_raw`
- **Batch Size**: 5000
- **Transformation**: 
  - Calculate `derived_status` in Python
  - Map JSON fields

### 12. `sync_trainer_review_stats()`
- **Purpose**: Sync trainer review attribution
- **PostgreSQL Table**: `trainer_review_stats`
- **Batch Size**: 5000
- **Transformation**: 
  - Lowercase and trim trainer_email
  - Filter out NULL emails

---

## Key Patterns

### 1. Latest Review Selection
Always selects the latest published manual review:
```sql
r.id = (
    SELECT MAX(rn.id)
    FROM review rn
    WHERE rn.conversation_id = r.conversation_id
        AND rn.review_type = 'manual'
        AND rn.status = 'published'
)
```

### 2. Completion Count Tracking
Uses window functions to track how many times a task has been completed:
```sql
COUNTIF(new_status = 'completed') OVER (
    PARTITION BY conversation_id
    ORDER BY created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS completed_status_count
```

### 3. Batch Exclusion
Filters out draft batches and excluded batch names:
```sql
WHERE b.status != 'draft'
  AND b.name NOT IN ('Batch1', 'Batch2', ...)
```

### 4. Project Filtering
All queries filter by project ID:
```sql
WHERE c.project_id = {project_id_filter}
-- or
WHERE t.project_id IN ({project_ids})
```

---

## Summary

### Tables Queried Most Frequently

1. **`conversation_status_history`**: Used in almost every query for:
   - Task completion events
   - Status transitions
   - Rework counting
   - AHT calculation
   - Task history

2. **`conversation`**: Core task data in all queries

3. **`review`**: Review data and aggregations

4. **`delivery_batch_task`**: Delivery status determination

5. **`contributor`**: Trainer/reviewer names and mappings

### Common Query Patterns

1. **CTE-based queries**: All major queries use Common Table Expressions
2. **Window functions**: For ranking, counting, and aggregations
3. **LEFT JOINs**: To preserve all tasks even without reviews/delivery
4. **Subqueries**: For latest review selection and annotation dates
5. **Regex extraction**: For domain parsing from statement field

### Data Flow

```
BigQuery Tables
    ↓
BigQuery Queries (CTEs)
    ↓
Data Transformation (Python)
    ↓
PostgreSQL Tables
    ↓
Dashboard API (PostgresQueryService)
```

---

## Notes

- All queries use parameterized project IDs and dataset names from settings
- Batch exclusion logic is centralized in `_batch_exclusion_sql` property
- Sync operations are logged in `data_sync_log` table
- Most syncs use batch inserts of 5000 records for performance
- Some calculations (like `tasks_ready_for_delivery`) are done in PostgreSQL after sync for efficiency
