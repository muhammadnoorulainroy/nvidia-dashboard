# Comprehensive Database Models Documentation

This document provides a complete overview of all database models in the NVIDIA Dashboard backend, including table structures, relationships, and data categorization.

---

## Table of Contents
1. [Core Data Models](#core-data-models)
2. [Statistics & Aggregation Models](#statistics--aggregation-models)
3. [Jibble Integration Models](#jibble-integration-models)
4. [Configuration Models](#configuration-models)
5. [Data Categorization](#data-categorization)
6. [Relationship Diagram](#relationship-diagram)

---

## Core Data Models

### 1. Task (`task`)
**Purpose**: Stores task/conversation data synced from BigQuery conversation table.

**Columns**:
- `id` (BigInteger, Primary Key) - Task/conversation ID
- `created_at` (DateTime, Indexed) - Task creation timestamp
- `updated_at` (DateTime, Indexed) - Last update timestamp
- `statement` (Text) - Task statement/description
- `status` (String(50), Indexed) - Current task status
- `project_id` (Integer, Indexed) - Associated project ID
- `batch_id` (Integer, Indexed) - Batch identifier
- `current_user_id` (Integer, Foreign Key → `contributor.id`, Nullable, Indexed) - Current assignee
- `colab_link` (Text) - Google Colab link
- `is_delivered` (String(10), Default: 'False', Indexed) - Delivery status
- `rework_count` (Integer, Default: 0) - Number of reworks
- `domain` (String(255), Indexed) - Task domain
- `week_number` (Integer, Indexed) - Week number
- `number_of_turns` (Integer, Default: 0) - Number of conversation turns
- `last_completed_date` (Date, Indexed) - Last completion date

**Relationships**:
- `current_user` → `Contributor` (many-to-one via `current_user_id`)
- `reviews` → `ReviewDetail[]` (one-to-many via `conversation_id`)

**Foreign Keys**:
- `current_user_id` → `contributor.id` (ondelete='SET NULL')

---

### 2. ReviewDetail (`review_detail`)
**Purpose**: Stores review details synced from BigQuery CTE results.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Review detail ID
- `quality_dimension_id` (Integer, Indexed) - Quality dimension identifier
- `domain` (String(255), Indexed) - Review domain
- `human_role_id` (Integer) - Human role identifier
- `review_id` (Integer, Indexed) - Review identifier
- `reviewer_id` (Integer, Foreign Key → `contributor.id`, Nullable, Indexed) - Reviewer
- `conversation_id` (BigInteger, Foreign Key → `task.id`, Nullable, Indexed) - Associated task
- `is_delivered` (String(10), Default: 'False', Indexed) - Delivery status
- `name` (String(255)) - Review name/description
- `score_text` (String(50)) - Score as text
- `score` (Float) - Review score
- `task_score` (Float) - Task-level score
- `updated_at` (Date, Indexed) - Last update date

**Relationships**:
- `reviewer` → `Contributor` (many-to-one via `reviewer_id`)
- `task` → `Task` (many-to-one via `conversation_id`)

**Foreign Keys**:
- `reviewer_id` → `contributor.id` (ondelete='SET NULL')
- `conversation_id` → `task.id` (ondelete='CASCADE')

---

### 3. Contributor (`contributor`)
**Purpose**: Stores contributor information (trainers, reviewers, POD leads) synced from BigQuery.

**Columns**:
- `id` (Integer, Primary Key) - Contributor ID
- `name` (String(255), Indexed) - Contributor name
- `turing_email` (String(255), Unique, Indexed) - Turing email address
- `type` (String(50), Indexed) - Contributor type: 'trainer', 'reviewer', 'pod_lead'
- `status` (String(50), Indexed) - Status: 'active', 'inactive'
- `team_lead_id` (Integer, Foreign Key → `contributor.id`, Nullable, Indexed) - POD Lead ID (self-referential)

**Relationships**:
- `tasks` → `Task[]` (one-to-many via `current_user_id`)
- `reviews` → `ReviewDetail[]` (one-to-many via `reviewer_id`)
- `team_lead` → `Contributor` (many-to-one via `team_lead_id`) - Self-referential
- `team_members` → `Contributor[]` (one-to-many via `team_lead_id`) - Self-referential

**Foreign Keys**:
- `team_lead_id` → `contributor.id` (ondelete='SET NULL') - Self-referential

**Special Features**:
- Self-referential relationship for POD Lead hierarchy
- Supports trainer → POD Lead mapping

---

### 4. TaskReviewedInfo (`task_reviewed_info`)
**Purpose**: Stores task reviewed information synced from BigQuery CTE.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `r_id` (BigInteger) - Review ID
- `delivered_id` (BigInteger) - Delivered item ID
- `rlhf_link` (Text) - RLHF link
- `is_delivered` (String(10)) - Delivery status
- `status` (String(50)) - Task status
- `task_score` (Float) - Task score
- `updated_at` (Date) - Update date
- `name` (String(255)) - Name/description
- `annotation_date` (DateTime) - Full timestamp for completion time

**Relationships**: None (standalone table)

---

### 5. WorkItem (`work_item`)
**Purpose**: Tracks delivered work items.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Work item ID
- `work_item_id` (String(255)) - Work item identifier
- `task_id` (String(255)) - Associated task ID
- `colab_link` (Text) - Google Colab link
- `json_filename` (String(255)) - JSON filename
- `delivery_date` (DateTime) - Delivery date
- `annotator_id` (Integer) - Annotator ID
- `turing_status` (String(50)) - Turing status
- `client_status` (String(50)) - Client status
- `task_level_feedback` (Text) - Task-level feedback
- `error_categories` (Text) - Error categories

**Relationships**: None (standalone table)

---

### 6. TaskAHT (`task_aht`)
**Purpose**: Stores Average Handle Time (AHT) - duration from pending→labeling to labeling→completed.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `task_id` (BigInteger, Foreign Key → `task.id`, Nullable, Indexed) - Associated task
- `contributor_id` (Integer, Foreign Key → `contributor.id`, Nullable, Indexed) - Contributor
- `contributor_name` (String(255)) - Contributor name
- `batch_id` (Integer, Indexed) - Batch identifier
- `start_time` (DateTime) - Start timestamp
- `end_time` (DateTime) - End timestamp
- `duration_seconds` (Integer) - Duration in seconds
- `duration_minutes` (Float) - Duration in minutes

**Relationships**:
- `task` → `Task` (many-to-one via `task_id`)
- `contributor` → `Contributor` (many-to-one via `contributor_id`)

**Foreign Keys**:
- `task_id` → `task.id` (ondelete='CASCADE')
- `contributor_id` → `contributor.id` (ondelete='CASCADE')

---

### 7. TaskHistoryRaw (`task_history_raw`)
**Purpose**: Mirrors spreadsheet's task_history_raw sheet for calculating unique tasks completed, new tasks, and rework.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `task_id` (BigInteger, Indexed) - Conversation ID (Column A)
- `time_stamp` (DateTime) - Timestamp (Column B - th.created_at)
- `date` (Date, Indexed) - Date (Column C - DATE(th.created_at))
- `old_status` (String(50)) - Previous status (Column D)
- `new_status` (String(50), Indexed) - New status (Column E)
- `notes` (Text) - Notes (Column F)
- `author` (String(255), Indexed) - Author email (Column M - turing_email)
- `completed_status_count` (Integer, Default: 0) - Running count of completed (Column H)
- `last_completed_date` (Date) - Last completed date (Column I)
- `project_id` (Integer) - Project ID (Column J)
- `batch_name` (String(255)) - Batch name (Column K)

**Relationships**: None (standalone table)

---

### 8. TaskRaw (`task_raw`)
**Purpose**: Mirrors spreadsheet's tasks_raw sheet exactly for accurate avg_rework and metric calculations.

**Columns**:
- `task_id` (BigInteger, Primary Key) - Task ID
- `created_date` (Date) - Creation date
- `updated_at` (DateTime) - Update timestamp
- `last_completed_at` (DateTime) - Last completion timestamp
- `last_completed_date` (Date, Indexed) - Last completion date (Column E)
- `trainer` (String(255), Indexed) - Current user email (Column F)
- `first_completion_date` (Date) - First completion date
- `first_completer` (String(255)) - First completer
- `colab_link` (Text) - Google Colab link
- `number_of_turns` (Integer, Default: 0) - Number of turns (Column AS)
- `task_status` (String(50), Indexed) - Task status (Column AP)
- `batch_name` (String(255)) - Batch name
- `task_duration` (Integer) - Task duration
- `project_id` (Integer) - Project ID
- `delivery_batch_name` (String(255)) - Delivery batch name
- `delivery_status` (String(50)) - Delivery status
- `delivery_batch_created_by` (String(255)) - Delivery batch creator
- `db_open_date` (Date) - DB open date
- `db_close_date` (Date) - DB close date
- `conversation_id_rs` (BigInteger) - Conversation ID for reviews
- `count_reviews` (Integer, Default: 0) - Review count
- `sum_score` (Float) - Sum of scores
- `sum_ref_score` (Float) - Sum of reflected scores
- `sum_duration` (Integer) - Sum of durations
- `sum_followup_required` (Integer, Default: 0) - Sum of followup required
- `task_id_r` (BigInteger) - Task ID for review
- `r_created_at` (DateTime) - Review creation timestamp
- `r_updated_at` (DateTime) - Review update timestamp
- `review_id` (BigInteger) - Review ID
- `reviewer` (String(255)) - Reviewer
- `score` (Float) - Score
- `reflected_score` (Float) - Reflected score
- `review_action` (Text) - Review action
- `review_action_type` (String(50)) - Review action type ('delivery', 'rework', etc.)
- `r_feedback` (Text) - Review feedback
- `followup_required` (Integer, Default: 0) - Followup required flag
- `r_duration` (Integer) - Review duration
- `r_submitted_at` (DateTime) - Review submission timestamp
- `r_submitted_date` (Date) - Review submission date
- `derived_status` (String(50), Indexed) - Derived status (Column AP)

**Relationships**: None (standalone table)

---

### 9. DataSyncLog (`data_sync_log`)
**Purpose**: Logs data sync operations for tracking and debugging.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Log ID
- `table_name` (String(100)) - Table name being synced
- `sync_started_at` (DateTime) - Sync start timestamp
- `sync_completed_at` (DateTime) - Sync completion timestamp
- `records_synced` (Integer) - Number of records synced
- `sync_status` (String(50)) - Sync status
- `sync_type` (String(50)) - Sync type
- `error_message` (Text) - Error message if any

**Relationships**: None (standalone table)

---

## Statistics & Aggregation Models

### 10. ContributorTaskStats (`contributor_task_stats`)
**Purpose**: Stores contributor-level task submission statistics (new tasks vs rework).

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `contributor_id` (Integer, Foreign Key → `contributor.id`, Unique, Indexed) - Contributor ID
- `new_tasks_submitted` (Integer, Default: 0) - New tasks submitted
- `rework_submitted` (Integer, Default: 0) - Rework submitted
- `total_unique_tasks` (Integer, Default: 0) - Total unique tasks
- `first_submission_date` (DateTime) - First submission date
- `last_submission_date` (DateTime) - Last submission date
- `sum_number_of_turns` (Integer, Default: 0) - Sum of number_of_turns for avg_rework calculation

**Relationships**:
- `contributor` → `Contributor` (many-to-one via `contributor_id`)

**Foreign Keys**:
- `contributor_id` → `contributor.id` (ondelete='CASCADE')

---

### 11. ContributorDailyStats (`contributor_daily_stats`)
**Purpose**: Daily contributor task submission stats at trainer x date level.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `contributor_id` (Integer, Foreign Key → `contributor.id`, Indexed) - Contributor ID
- `submission_date` (Date, Indexed) - Submission date
- `new_tasks_submitted` (Integer, Default: 0) - New tasks submitted
- `rework_submitted` (Integer, Default: 0) - Rework submitted
- `total_submissions` (Integer, Default: 0) - Total submissions
- `unique_tasks` (Integer, Default: 0) - Unique tasks
- `tasks_ready_for_delivery` (Integer, Default: 0) - Reviewed tasks with number_of_turns = 0
- `sum_number_of_turns` (Integer, Default: 0) - Sum of number_of_turns for avg_rework
- `sum_score` (Float, Default: 0) - Sum of scores for avg_rating
- `sum_count_reviews` (Integer, Default: 0) - Sum of count_reviews for avg_rating

**Relationships**:
- `contributor` → `Contributor` (many-to-one via `contributor_id`)

**Foreign Keys**:
- `contributor_id` → `contributor.id` (ondelete='CASCADE')

**Indexes**:
- Composite: `('contributor_id', 'submission_date')`

---

### 12. ReviewerDailyStats (`reviewer_daily_stats`)
**Purpose**: Daily reviewer stats at reviewer x date level (tasks reviewed).

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `reviewer_id` (Integer, Foreign Key → `contributor.id`, Indexed) - Reviewer ID
- `review_date` (Date, Indexed) - Review date
- `unique_tasks_reviewed` (Integer, Default: 0) - Distinct tasks reviewed
- `new_tasks_reviewed` (Integer, Default: 0) - Tasks that were first-time completions
- `rework_reviewed` (Integer, Default: 0) - Tasks that were rework submissions
- `total_reviews` (Integer, Default: 0) - Total review actions
- `tasks_ready_for_delivery` (Integer, Default: 0) - Tasks reviewed ready for delivery
- `sum_number_of_turns` (Integer, Default: 0) - Sum of number_of_turns for avg_rework
- `sum_score` (Float, Default: 0) - Sum of scores for avg_rating
- `sum_count_reviews` (Integer, Default: 0) - Sum of count_reviews for avg_rating

**Relationships**:
- `reviewer` → `Contributor` (many-to-one via `reviewer_id`)

**Foreign Keys**:
- `reviewer_id` → `contributor.id` (ondelete='CASCADE')

**Indexes**:
- Composite: `('reviewer_id', 'review_date')`

---

### 13. ReviewerTrainerDailyStats (`reviewer_trainer_daily_stats`)
**Purpose**: Reviewer x Trainer x Date level stats - breakdown of what each reviewer reviewed per trainer per date.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `reviewer_id` (Integer, Foreign Key → `contributor.id`, Indexed) - Reviewer ID
- `trainer_id` (Integer, Foreign Key → `contributor.id`, Indexed) - Trainer ID
- `review_date` (Date, Indexed) - Review date
- `tasks_reviewed` (Integer, Default: 0) - Unique tasks reviewed for this trainer
- `new_tasks_reviewed` (Integer, Default: 0) - New tasks reviewed
- `rework_reviewed` (Integer, Default: 0) - Rework reviewed
- `total_reviews` (Integer, Default: 0) - Total review actions
- `ready_for_delivery` (Integer, Default: 0) - Tasks ready for delivery
- `sum_number_of_turns` (Integer, Default: 0) - For avg_rework calculation

**Relationships**:
- `reviewer` → `Contributor` (many-to-one via `reviewer_id`)
- `trainer` → `Contributor` (many-to-one via `trainer_id`)

**Foreign Keys**:
- `reviewer_id` → `contributor.id` (ondelete='CASCADE')
- `trainer_id` → `contributor.id` (ondelete='CASCADE')

**Indexes**:
- Composite: `('reviewer_id', 'trainer_id', 'review_date')`

---

### 14. TrainerReviewStats (`trainer_review_stats`)
**Purpose**: Individual reviews attributed to the trainer who did the specific work. Enables accurate per-trainer metrics.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `review_id` (BigInteger, Unique, Indexed) - BigQuery review.id
- `task_id` (BigInteger, Indexed) - Conversation ID
- `trainer_email` (String(255), Indexed) - Trainer who completed the work
- `completion_time` (DateTime) - When the trainer completed
- `completion_number` (Integer) - 1 = first completion (new task), >1 = rework
- `review_time` (DateTime) - Review timestamp
- `review_date` (Date, Indexed) - Review date
- `score` (Float) - Review score
- `followup_required` (Integer, Default: 0) - 0 = approved, 1 = sent to rework
- `review_type` (String(50), Indexed) - 'manual' or 'auto' (agentic)
- `project_id` (Integer, Indexed) - Project ID
- `last_synced` (DateTime, Server Default: now()) - Last sync timestamp

**Relationships**: None (standalone table, uses email for trainer reference)

**Indexes**:
- Composite: `('trainer_email', 'project_id')`
- Composite: `('trainer_email', 'review_date')`

---

## Jibble Integration Models

### 15. PodLeadMapping (`pod_lead_mapping`)
**Purpose**: POD Lead to Trainer mapping loaded from static Excel file.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `trainer_email` (String(255), Indexed) - Trainer email
- `trainer_name` (String(255)) - Trainer name
- `pod_lead_email` (String(255), Indexed) - POD Lead email
- `role` (String(50)) - Role
- `current_status` (String(50)) - Current status
- `jibble_project` (String(255)) - Jibble project name
- `jibble_id` (String(50), Indexed) - Jibble person ID for direct mapping
- `jibble_name` (String(255)) - Name as shown in Jibble

**Relationships**: None (standalone mapping table)

---

### 16. JibblePerson (`jibble_person`)
**Purpose**: Jibble person data synced from Jibble API.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `jibble_id` (String(100), Unique, Indexed) - Jibble person ID
- `full_name` (String(255)) - Full name
- `first_name` (String(100)) - First name
- `last_name` (String(100)) - Last name
- `personal_email` (String(255), Indexed) - Jibble login email
- `work_email` (String(255), Indexed) - Work email if different
- `status` (String(50)) - Status (Active, Inactive, etc.)
- `latest_time_entry` (DateTime) - Latest time entry timestamp
- `last_synced` (DateTime) - Last sync timestamp
- `created_at` (DateTime, Server Default: now()) - Creation timestamp

**Relationships**:
- `time_entries` → `JibbleTimeEntry[]` (one-to-many via `person_id`)

---

### 17. JibbleTimeEntry (`jibble_time_entry`)
**Purpose**: Jibble time entry data - daily hours per person.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `person_id` (String(100), Foreign Key → `jibble_person.jibble_id`, Indexed) - Jibble person ID
- `entry_date` (Date, Indexed) - Entry date
- `total_hours` (Float, Default: 0) - Total hours logged
- `last_synced` (DateTime) - Last sync timestamp
- `created_at` (DateTime, Server Default: now()) - Creation timestamp

**Relationships**:
- `person` → `JibblePerson` (many-to-one via `person_id`)

**Foreign Keys**:
- `person_id` → `jibble_person.jibble_id` (ondelete='CASCADE')

**Indexes**:
- Composite: `('person_id', 'entry_date')`

---

### 18. JibbleEmailMapping (`jibble_email_mapping`)
**Purpose**: Mapping between Turing email and Jibble ID/email. Synced from Google Sheet.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `jibble_id` (String(50), Unique, Indexed) - Maps to jibble_hours.member_code
- `jibble_email` (String(255), Indexed) - Jibble email
- `jibble_name` (String(255)) - Jibble name
- `turing_email` (String(255), Indexed) - Turing email
- `last_synced` (DateTime) - Last sync timestamp
- `created_at` (DateTime, Server Default: now()) - Creation timestamp

**Relationships**: None (standalone mapping table)

**Indexes**:
- Composite: `('turing_email')`

---

### 19. JibbleHours (`jibble_hours`)
**Purpose**: Jibble hours synced from BigQuery OR Jibble API directly.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `member_code` (String(100), Indexed) - Numeric ID (BigQuery) or UUID (API)
- `entry_date` (Date, Indexed) - Entry date
- `project` (String(255), Indexed) - Project name
- `full_name` (String(255)) - Full name
- `logged_hours` (Float, Default: 0) - Logged hours
- `jibble_email` (String(255), Indexed) - Personal email from Jibble
- `turing_email` (String(255), Indexed) - Matched Turing email
- `source` (String(50), Default: 'bigquery', Indexed) - 'bigquery' or 'jibble_api'
- `last_synced` (DateTime, Server Default: now()) - Last sync timestamp

**Relationships**: None (standalone table)

**Indexes**:
- Composite: `('turing_email', 'entry_date')`
- Composite: `('source', 'entry_date')`

---

## Configuration Models

### 20. AHTConfiguration (`aht_configuration`)
**Purpose**: Project-wise AHT (Average Handling Time) configuration. Stores expected hours for new tasks and rework tasks per project.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `project_id` (Integer, Unique, Indexed, Not Null) - Project ID
- `project_name` (String(255), Not Null) - Project name
- `new_task_aht` (Float, Not Null, Default: 10.0) - Expected hours for new tasks
- `rework_aht` (Float, Not Null, Default: 4.0) - Expected hours for rework tasks
- `created_at` (DateTime, Server Default: now()) - Creation timestamp
- `updated_at` (DateTime, Server Default: now(), On Update: now()) - Update timestamp
- `updated_by` (String(255)) - Email of user who last updated

**Relationships**: None (standalone configuration table)

**Default Values**:
- New Task AHT: 10 hours (fresh tasks require more research)
- Rework AHT: 4 hours (fixing/revising takes less time)

---

### 21. ProjectConfiguration (`project_configuration`)
**Purpose**: Generic, extensible configuration system for project-level settings. Supports multiple configuration types with entity-level and historical tracking.

**Columns**:
- `id` (Integer, Primary Key, Auto-increment) - Record ID
- `project_id` (Integer, Not Null, Indexed) - Project ID
- `config_type` (String(50), Not Null, Indexed) - Configuration type
- `config_key` (String(100), Not Null) - Configuration key
- `entity_type` (String(50), Nullable) - 'trainer', 'reviewer', 'pod_lead', null for project-level
- `entity_id` (Integer, Nullable) - contributor.id or null
- `entity_email` (String(255), Nullable) - For easier lookups
- `config_value` (Text, Not Null) - JSON string configuration value
- `effective_from` (Date, Not Null, Server Default: CURRENT_DATE) - Effective start date
- `effective_to` (Date, Nullable) - Effective end date (null = currently active)
- `description` (Text, Nullable) - Description
- `created_at` (DateTime, Server Default: now(), Not Null) - Creation timestamp
- `updated_at` (DateTime, Server Default: now(), Not Null) - Update timestamp
- `created_by` (String(255), Nullable) - Creator email
- `updated_by` (String(255), Nullable) - Updater email

**Relationships**: None (standalone configuration table)

**Supported Configuration Types**:
- `throughput_target`: Daily throughput targets for trainers
- `review_target`: Review throughput targets for reviewers/pod leads
- `performance_weights`: Weighted scoring configuration
- `classification_threshold`: A/B/C performer bucket thresholds
- `effort_threshold`: Hours vs expected effort thresholds
- `color_coding`: VMO color coding rules
- `general`: General settings

**Indexes**:
- Composite: `('project_id', 'config_type')`
- Composite: `('entity_type', 'entity_id')`

---

## Data Categorization

### Task Data Tables
- **`task`** - Core task/conversation data
- **`task_raw`** - Raw task data mirroring spreadsheet
- **`task_history_raw`** - Task status change history
- **`task_reviewed_info`** - Task reviewed information
- **`task_aht`** - Task Average Handle Time metrics
- **`work_item`** - Delivered work items

### Trainer Data Tables
- **`contributor`** (where `type='trainer'`) - Trainer information
- **`contributor_task_stats`** - Trainer-level task statistics
- **`contributor_daily_stats`** - Daily trainer submission stats
- **`trainer_review_stats`** - Reviews attributed to trainers

### Review Data Tables
- **`review_detail`** - Individual review details
- **`reviewer_daily_stats`** - Daily reviewer statistics
- **`reviewer_trainer_daily_stats`** - Reviewer x Trainer x Date breakdown
- **`trainer_review_stats`** - Reviews attributed to trainers

### Delivery Data Tables
- **`work_item`** - Delivered work items with delivery dates and statuses
- **`task`** (via `is_delivered` column) - Task delivery status
- **`task_raw`** (via delivery columns) - Delivery batch information

### POD Lead Mappings
- **`pod_lead_mapping`** - POD Lead to Trainer mapping from Excel
- **`contributor`** (via `team_lead_id` self-referential FK) - POD Lead hierarchy

### Jibble Hours Tables
- **`jibble_person`** - Jibble person data
- **`jibble_time_entry`** - Daily time entries per person
- **`jibble_email_mapping`** - Turing email ↔ Jibble ID mapping
- **`jibble_hours`** - Aggregated Jibble hours (from BigQuery or API)

### AHT Configuration Tables
- **`aht_configuration`** - Project-wise AHT configuration (new task vs rework hours)
- **`task_aht`** - Actual AHT metrics per task

---

## Relationship Diagram

```
Contributor (Self-Referential)
├── team_lead_id → Contributor.id (POD Lead hierarchy)
├── tasks → Task[] (via current_user_id)
└── reviews → ReviewDetail[] (via reviewer_id)

Task
├── current_user_id → Contributor.id (trainer)
└── reviews → ReviewDetail[] (via conversation_id)

ReviewDetail
├── reviewer_id → Contributor.id (reviewer)
└── conversation_id → Task.id (task)

TaskAHT
├── task_id → Task.id
└── contributor_id → Contributor.id

ContributorTaskStats
└── contributor_id → Contributor.id

ContributorDailyStats
└── contributor_id → Contributor.id

ReviewerDailyStats
└── reviewer_id → Contributor.id

ReviewerTrainerDailyStats
├── reviewer_id → Contributor.id
└── trainer_id → Contributor.id

JibbleTimeEntry
└── person_id → JibblePerson.jibble_id
```

---

## Key Design Patterns

1. **Self-Referential Relationships**: `Contributor` table uses `team_lead_id` to create POD Lead → Trainer hierarchy
2. **Cascade Deletes**: Most foreign keys use `ondelete='CASCADE'` for automatic cleanup
3. **Nullable Foreign Keys**: Many FKs are nullable with `ondelete='SET NULL'` for soft relationships
4. **Composite Indexes**: Daily stats tables use composite indexes on (contributor_id, date) for performance
5. **Dual Source Support**: `JibbleHours` supports both BigQuery and API sources via `source` column
6. **Historical Tracking**: `ProjectConfiguration` supports effective date ranges for configuration history
7. **Email-Based Lookups**: Several tables use email addresses for easier joins without FK constraints

---

## Summary Statistics

- **Total Tables**: 21
- **Core Data Tables**: 9
- **Statistics/Aggregation Tables**: 5
- **Jibble Integration Tables**: 5
- **Configuration Tables**: 2
- **Tables with Self-Referential Relationships**: 1 (`Contributor`)
- **Tables with Composite Indexes**: 6

---

*Last Updated: February 6, 2026*
