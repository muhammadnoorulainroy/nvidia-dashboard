# Database Schema Documentation

**Generated from:** `backend/app/models/db_models.py`  
**Date:** February 5, 2026  
**Database:** SQLAlchemy ORM Models for NVIDIA Dashboard

---

## Table of Contents

1. [Core Tables](#core-tables)
2. [Statistics & Aggregation Tables](#statistics--aggregation-tables)
3. [Raw Data Tables](#raw-data-tables)
4. [Jibble Integration Tables](#jibble-integration-tables)
5. [Configuration Tables](#configuration-tables)
6. [Relationship Diagram](#relationship-diagram)
7. [Index Summary](#index-summary)
8. [Potential Schema Issues](#potential-schema-issues)

---

## Core Tables

### 1. `task`
**Purpose:** Main task table synced from BigQuery conversation table.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | BigInteger | PRIMARY KEY | NO | - | - | Task/conversation ID |
| `created_at` | DateTime | - | YES | - | ✓ | Task creation timestamp |
| `updated_at` | DateTime | - | YES | - | ✓ | Last update timestamp |
| `statement` | Text | - | YES | - | - | Task statement/description |
| `status` | String(50) | - | YES | - | ✓ | Task status |
| `project_id` | Integer | - | YES | - | ✓ | Project identifier |
| `batch_id` | Integer | - | YES | - | ✓ | Batch identifier |
| `current_user_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Current assignee (SET NULL on delete) |
| `colab_link` | Text | - | YES | - | - | Colab notebook link |
| `is_delivered` | String(10) | - | YES | 'False' | ✓ | Delivery status flag |
| `rework_count` | Integer | - | YES | 0 | - | Number of reworks |
| `domain` | String(255) | - | YES | - | ✓ | Task domain |
| `week_number` | Integer | - | YES | - | ✓ | Week number |
| `number_of_turns` | Integer | - | YES | 0 | - | Number of conversation turns |
| `last_completed_date` | Date | - | YES | - | ✓ | Last completion date |

**Relationships:**
- `current_user` → `Contributor` (many-to-one, via `current_user_id`)
- `reviews` → `ReviewDetail[]` (one-to-many, via `conversation_id`)

**Foreign Keys:**
- `current_user_id` → `contributor.id` (ON DELETE SET NULL)

---

### 2. `review_detail`
**Purpose:** Review details synced from BigQuery CTE results.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Review detail ID |
| `quality_dimension_id` | Integer | - | YES | - | ✓ | Quality dimension identifier |
| `domain` | String(255) | - | YES | - | ✓ | Review domain |
| `human_role_id` | Integer | - | YES | - | - | Human role identifier |
| `review_id` | Integer | - | YES | - | ✓ | Review identifier |
| `reviewer_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Reviewer (SET NULL on delete) |
| `conversation_id` | BigInteger | FK → `task.id` | YES | - | ✓ | Task/conversation ID (CASCADE on delete) |
| `is_delivered` | String(10) | - | YES | 'False' | ✓ | Delivery status |
| `name` | String(255) | - | YES | - | - | Review name |
| `score_text` | String(50) | - | YES | - | - | Score as text |
| `score` | Float | - | YES | - | - | Numeric score |
| `task_score` | Float | - | YES | - | - | Task-level score |
| `updated_at` | Date | - | YES | - | ✓ | Update date |

**Relationships:**
- `reviewer` → `Contributor` (many-to-one, via `reviewer_id`)
- `task` → `Task` (many-to-one, via `conversation_id`)

**Foreign Keys:**
- `reviewer_id` → `contributor.id` (ON DELETE SET NULL)
- `conversation_id` → `task.id` (ON DELETE CASCADE)

---

### 3. `contributor`
**Purpose:** Contributor table synced from BigQuery (trainers, reviewers, pod leads).

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY | NO | - | - | Contributor ID |
| `name` | String(255) | - | YES | - | ✓ | Contributor name |
| `turing_email` | String(255) | UNIQUE | NO | - | ✓ | Turing email (unique) |
| `type` | String(50) | - | YES | - | ✓ | Type: 'trainer', 'reviewer', 'pod_lead' |
| `status` | String(50) | - | YES | - | ✓ | Status: 'active', 'inactive' |
| `team_lead_id` | Integer | FK → `contributor.id` | YES | - | ✓ | POD Lead ID (self-referential, SET NULL on delete) |

**Relationships:**
- `tasks` → `Task[]` (one-to-many, via `Task.current_user_id`)
- `reviews` → `ReviewDetail[]` (one-to-many, via `ReviewDetail.reviewer_id`)
- `team_lead` → `Contributor` (many-to-one, self-referential, via `team_lead_id`)
- `team_members` → `Contributor[]` (one-to-many, self-referential, via `team_lead_id`)

**Foreign Keys:**
- `team_lead_id` → `contributor.id` (ON DELETE SET NULL, self-referential)

**Unique Constraints:**
- `turing_email` (unique)

---

### 4. `data_sync_log`
**Purpose:** Log table for tracking data sync operations.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Log entry ID |
| `table_name` | String(100) | - | YES | - | - | Table name synced |
| `sync_started_at` | DateTime | - | YES | - | - | Sync start time |
| `sync_completed_at` | DateTime | - | YES | - | - | Sync completion time |
| `records_synced` | Integer | - | YES | - | - | Number of records synced |
| `sync_status` | String(50) | - | YES | - | - | Sync status |
| `sync_type` | String(50) | - | YES | - | - | Type of sync operation |
| `error_message` | Text | - | YES | - | - | Error message if failed |

**Relationships:** None

---

### 5. `task_reviewed_info`
**Purpose:** Task reviewed info synced from BigQuery CTE.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Record ID |
| `r_id` | BigInteger | - | YES | - | - | Review ID |
| `delivered_id` | BigInteger | - | YES | - | - | Delivery ID |
| `rlhf_link` | Text | - | YES | - | - | RLHF link |
| `is_delivered` | String(10) | - | YES | - | - | Delivery status |
| `status` | String(50) | - | YES | - | - | Status |
| `task_score` | Float | - | YES | - | - | Task score |
| `updated_at` | Date | - | YES | - | - | Update date |
| `name` | String(255) | - | YES | - | - | Name |
| `annotation_date` | DateTime | - | YES | - | - | Full timestamp for completion time |

**Relationships:** None

---

### 6. `work_item`
**Purpose:** Work item table for tracking delivered items.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Work item ID |
| `work_item_id` | String(255) | - | YES | - | - | Work item identifier |
| `task_id` | String(255) | - | YES | - | - | Task identifier |
| `colab_link` | Text | - | YES | - | - | Colab link |
| `json_filename` | String(255) | - | YES | - | - | JSON filename |
| `delivery_date` | DateTime | - | YES | - | - | Delivery date |
| `annotator_id` | Integer | - | YES | - | - | Annotator ID |
| `turing_status` | String(50) | - | YES | - | - | Turing status |
| `client_status` | String(50) | - | YES | - | - | Client status |
| `task_level_feedback` | Text | - | YES | - | - | Task-level feedback |
| `error_categories` | Text | - | YES | - | - | Error categories |

**Relationships:** None

---

### 7. `task_aht`
**Purpose:** Task AHT (Average Handle Time) - duration from pending→labeling to labeling→completed.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | AHT record ID |
| `task_id` | BigInteger | FK → `task.id` | YES | - | ✓ | Task ID (CASCADE on delete) |
| `contributor_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Contributor ID (CASCADE on delete) |
| `contributor_name` | String(255) | - | YES | - | - | Contributor name |
| `batch_id` | Integer | - | YES | - | ✓ | Batch ID |
| `start_time` | DateTime | - | YES | - | - | Start time |
| `end_time` | DateTime | - | YES | - | - | End time |
| `duration_seconds` | Integer | - | YES | - | - | Duration in seconds |
| `duration_minutes` | Float | - | YES | - | - | Duration in minutes |

**Relationships:** None (FKs only, no explicit relationships defined)

**Foreign Keys:**
- `task_id` → `task.id` (ON DELETE CASCADE)
- `contributor_id` → `contributor.id` (ON DELETE CASCADE)

---

## Statistics & Aggregation Tables

### 8. `contributor_task_stats`
**Purpose:** Contributor task submission stats - new tasks vs rework.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Stats record ID |
| `contributor_id` | Integer | FK → `contributor.id`, UNIQUE | NO | - | ✓ | Contributor ID (CASCADE, unique) |
| `new_tasks_submitted` | Integer | - | YES | 0 | - | New tasks submitted count |
| `rework_submitted` | Integer | - | YES | 0 | - | Rework submitted count |
| `total_unique_tasks` | Integer | - | YES | 0 | - | Total unique tasks |
| `first_submission_date` | DateTime | - | YES | - | - | First submission date |
| `last_submission_date` | DateTime | - | YES | - | - | Last submission date |
| `sum_number_of_turns` | Integer | - | YES | 0 | - | Sum of turns for avg_rework |

**Relationships:** None (FK only, no explicit relationship)

**Foreign Keys:**
- `contributor_id` → `contributor.id` (ON DELETE CASCADE)

**Unique Constraints:**
- `contributor_id` (one stats record per contributor)

---

### 9. `contributor_daily_stats`
**Purpose:** Daily contributor task submission stats - trainer x date level.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Daily stats ID |
| `contributor_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Contributor ID (CASCADE) |
| `submission_date` | Date | - | YES | - | ✓ | Submission date |
| `new_tasks_submitted` | Integer | - | YES | 0 | - | New tasks submitted |
| `rework_submitted` | Integer | - | YES | 0 | - | Rework submitted |
| `total_submissions` | Integer | - | YES | 0 | - | Total submissions |
| `unique_tasks` | Integer | - | YES | 0 | - | Unique tasks |
| `tasks_ready_for_delivery` | Integer | - | YES | 0 | - | Tasks ready for delivery |
| `sum_number_of_turns` | Integer | - | YES | 0 | - | Sum of turns for avg_rework |
| `sum_score` | Float | - | YES | 0 | - | Sum of scores for avg_rating |
| `sum_count_reviews` | Integer | - | YES | 0 | - | Sum of review counts |

**Relationships:** None (FK only)

**Foreign Keys:**
- `contributor_id` → `contributor.id` (ON DELETE CASCADE)

**Composite Indexes:**
- `ix_contributor_daily_stats_contributor_date` (`contributor_id`, `submission_date`)

---

### 10. `reviewer_daily_stats`
**Purpose:** Daily reviewer stats - reviewer x date level (tasks reviewed).

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Daily stats ID |
| `reviewer_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Reviewer ID (CASCADE) |
| `review_date` | Date | - | YES | - | ✓ | Review date |
| `unique_tasks_reviewed` | Integer | - | YES | 0 | - | Distinct tasks reviewed |
| `new_tasks_reviewed` | Integer | - | YES | 0 | - | New tasks reviewed |
| `rework_reviewed` | Integer | - | YES | 0 | - | Rework reviewed |
| `total_reviews` | Integer | - | YES | 0 | - | Total review actions |
| `tasks_ready_for_delivery` | Integer | - | YES | 0 | - | Tasks ready for delivery |
| `sum_number_of_turns` | Integer | - | YES | 0 | - | Sum of turns for avg_rework |
| `sum_score` | Float | - | YES | 0 | - | Sum of scores for avg_rating |
| `sum_count_reviews` | Integer | - | YES | 0 | - | Sum of review counts |

**Relationships:** None (FK only)

**Foreign Keys:**
- `reviewer_id` → `contributor.id` (ON DELETE CASCADE)

**Composite Indexes:**
- `ix_reviewer_daily_stats_reviewer_date` (`reviewer_id`, `review_date`)

---

### 11. `reviewer_trainer_daily_stats`
**Purpose:** Reviewer x Trainer x Date level stats - breakdown of what each reviewer reviewed per trainer per date.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Stats ID |
| `reviewer_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Reviewer ID (CASCADE) |
| `trainer_id` | Integer | FK → `contributor.id` | YES | - | ✓ | Trainer ID (CASCADE) |
| `review_date` | Date | - | YES | - | ✓ | Review date |
| `tasks_reviewed` | Integer | - | YES | 0 | - | Unique tasks reviewed |
| `new_tasks_reviewed` | Integer | - | YES | 0 | - | New tasks reviewed |
| `rework_reviewed` | Integer | - | YES | 0 | - | Rework reviewed |
| `total_reviews` | Integer | - | YES | 0 | - | Total review actions |
| `ready_for_delivery` | Integer | - | YES | 0 | - | Tasks ready for delivery |
| `sum_number_of_turns` | Integer | - | YES | 0 | - | Sum of turns for avg_rework |

**Relationships:** None (FKs only)

**Foreign Keys:**
- `reviewer_id` → `contributor.id` (ON DELETE CASCADE)
- `trainer_id` → `contributor.id` (ON DELETE CASCADE)

**Composite Indexes:**
- `ix_reviewer_trainer_daily_stats_all` (`reviewer_id`, `trainer_id`, `review_date`)

---

### 12. `trainer_review_stats`
**Purpose:** Individual reviews attributed to the trainer who did the specific work.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Stats ID |
| `review_id` | BigInteger | UNIQUE | NO | - | ✓ | BigQuery review.id (unique) |
| `task_id` | BigInteger | - | YES | - | ✓ | Conversation ID |
| `trainer_email` | String(255) | - | YES | - | ✓ | Trainer email who completed work |
| `completion_time` | DateTime | - | YES | - | - | When trainer completed |
| `completion_number` | Integer | - | YES | - | - | 1 = first, >1 = rework |
| `review_time` | DateTime | - | YES | - | - | Review timestamp |
| `review_date` | Date | - | YES | - | ✓ | Review date |
| `score` | Float | - | YES | - | - | Review score |
| `followup_required` | Integer | - | YES | 0 | - | 0 = approved, 1 = rework |
| `project_id` | Integer | - | YES | - | ✓ | Project ID |
| `last_synced` | DateTime | - | YES | now() | - | Last sync timestamp |

**Relationships:** None

**Unique Constraints:**
- `review_id` (unique)

**Composite Indexes:**
- `ix_trainer_review_trainer_project` (`trainer_email`, `project_id`)
- `ix_trainer_review_trainer_date` (`trainer_email`, `review_date`)

---

## Raw Data Tables

### 13. `task_history_raw`
**Purpose:** Task history raw table - mirrors spreadsheet's task_history_raw sheet.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Record ID |
| `task_id` | BigInteger | - | YES | - | ✓ | Conversation ID |
| `time_stamp` | DateTime | - | YES | - | - | Timestamp |
| `date` | Date | - | YES | - | ✓ | Date (DATE(time_stamp)) |
| `old_status` | String(50) | - | YES | - | - | Old status |
| `new_status` | String(50) | - | YES | - | ✓ | New status |
| `notes` | Text | - | YES | - | - | Notes |
| `author` | String(255) | - | YES | - | ✓ | Turing email |
| `completed_status_count` | Integer | - | YES | 0 | - | Running count of completed |
| `last_completed_date` | Date | - | YES | - | - | Last completed date |
| `project_id` | Integer | - | YES | - | - | Project ID |
| `batch_name` | String(255) | - | YES | - | - | Batch name |

**Relationships:** None

---

### 14. `task_raw`
**Purpose:** Task raw table - mirrors spreadsheet's tasks_raw sheet exactly.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `task_id` | BigInteger | PRIMARY KEY | NO | - | - | Task/conversation ID |
| `created_date` | Date | - | YES | - | - | Created date |
| `updated_at` | DateTime | - | YES | - | - | Updated timestamp |
| `last_completed_at` | DateTime | - | YES | - | - | Last completed timestamp |
| `last_completed_date` | Date | - | YES | - | ✓ | Last completed date |
| `trainer` | String(255) | - | YES | - | ✓ | Current user email |
| `first_completion_date` | Date | - | YES | - | - | First completion date |
| `first_completer` | String(255) | - | YES | - | - | First completer email |
| `colab_link` | Text | - | YES | - | - | Colab link |
| `number_of_turns` | Integer | - | YES | 0 | - | Number of turns |
| `task_status` | String(50) | - | YES | - | ✓ | Task status |
| `batch_name` | String(255) | - | YES | - | - | Batch name |
| `task_duration` | Integer | - | YES | - | - | Task duration |
| `project_id` | Integer | - | YES | - | - | Project ID |
| `delivery_batch_name` | String(255) | - | YES | - | - | Delivery batch name |
| `delivery_status` | String(50) | - | YES | - | - | Delivery status |
| `delivery_batch_created_by` | String(255) | - | YES | - | - | Delivery batch creator |
| `db_open_date` | Date | - | YES | - | - | DB open date |
| `db_close_date` | Date | - | YES | - | - | DB close date |
| `conversation_id_rs` | BigInteger | - | YES | - | - | Conversation ID RS |
| `count_reviews` | Integer | - | YES | 0 | - | Review count |
| `sum_score` | Float | - | YES | - | - | Sum of scores |
| `sum_ref_score` | Float | - | YES | - | - | Sum of reflected scores |
| `sum_duration` | Integer | - | YES | - | - | Sum of durations |
| `sum_followup_required` | Integer | - | YES | 0 | - | Sum of followup required |
| `task_id_r` | BigInteger | - | YES | - | - | Task ID R |
| `r_created_at` | DateTime | - | YES | - | - | Review created at |
| `r_updated_at` | DateTime | - | YES | - | - | Review updated at |
| `review_id` | BigInteger | - | YES | - | - | Review ID |
| `reviewer` | String(255) | - | YES | - | - | Reviewer email |
| `score` | Float | - | YES | - | - | Score |
| `reflected_score` | Float | - | YES | - | - | Reflected score |
| `review_action` | Text | - | YES | - | - | Review action |
| `review_action_type` | String(50) | - | YES | - | - | Review action type |
| `r_feedback` | Text | - | YES | - | - | Review feedback |
| `followup_required` | Integer | - | YES | 0 | - | Followup required flag |
| `r_duration` | Integer | - | YES | - | - | Review duration |
| `r_submitted_at` | DateTime | - | YES | - | - | Review submitted at |
| `r_submitted_date` | Date | - | YES | - | - | Review submitted date |
| `derived_status` | String(50) | - | YES | - | ✓ | Derived status |

**Relationships:** None

---

### 15. `pod_lead_mapping`
**Purpose:** POD Lead to Trainer mapping - loaded from static Excel file.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Mapping ID |
| `trainer_email` | String(255) | - | YES | - | ✓ | Trainer email |
| `trainer_name` | String(255) | - | YES | - | - | Trainer name |
| `pod_lead_email` | String(255) | - | YES | - | ✓ | POD Lead email |
| `role` | String(50) | - | YES | - | - | Role |
| `current_status` | String(50) | - | YES | - | - | Current status |
| `jibble_project` | String(255) | - | YES | - | - | Jibble project |
| `jibble_id` | String(50) | - | YES | - | ✓ | Jibble person ID |
| `jibble_name` | String(255) | - | YES | - | - | Name as shown in Jibble |

**Relationships:** None

---

## Jibble Integration Tables

### 16. `jibble_person`
**Purpose:** Jibble person data - synced from Jibble API.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Record ID |
| `jibble_id` | String(100) | UNIQUE | NO | - | ✓ | Jibble person ID (unique) |
| `full_name` | String(255) | - | YES | - | - | Full name |
| `first_name` | String(100) | - | YES | - | - | First name |
| `last_name` | String(100) | - | YES | - | - | Last name |
| `personal_email` | String(255) | - | YES | - | ✓ | Jibble login email |
| `work_email` | String(255) | - | YES | - | ✓ | Work email if different |
| `status` | String(50) | - | YES | - | - | Active, Inactive, etc. |
| `latest_time_entry` | DateTime | - | YES | - | - | Latest time entry |
| `last_synced` | DateTime | - | YES | - | - | Last sync timestamp |
| `created_at` | DateTime | - | YES | now() | - | Creation timestamp |

**Relationships:** None (referenced by `jibble_time_entry`)

**Unique Constraints:**
- `jibble_id` (unique)

---

### 17. `jibble_time_entry`
**Purpose:** Jibble time entry data - daily hours per person.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Entry ID |
| `person_id` | String(100) | FK → `jibble_person.jibble_id` | YES | - | ✓ | Jibble person ID (CASCADE) |
| `entry_date` | Date | - | YES | - | ✓ | Entry date |
| `total_hours` | Float | - | YES | 0 | - | Total hours logged |
| `last_synced` | DateTime | - | YES | - | - | Last sync timestamp |
| `created_at` | DateTime | - | YES | now() | - | Creation timestamp |

**Relationships:** None (FK only)

**Foreign Keys:**
- `person_id` → `jibble_person.jibble_id` (ON DELETE CASCADE)

**Composite Indexes:**
- `ix_jibble_time_entry_person_date` (`person_id`, `entry_date`)

---

### 18. `jibble_email_mapping`
**Purpose:** Mapping between Turing email and Jibble ID/email.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Mapping ID |
| `jibble_id` | String(50) | UNIQUE | NO | - | ✓ | Maps to jibble_hours.member_code |
| `jibble_email` | String(255) | - | YES | - | ✓ | Jibble email |
| `jibble_name` | String(255) | - | YES | - | - | Jibble name |
| `turing_email` | String(255) | - | YES | - | ✓ | Turing email |
| `last_synced` | DateTime | - | YES | - | - | Last sync timestamp |
| `created_at` | DateTime | - | YES | now() | - | Creation timestamp |

**Relationships:** None

**Unique Constraints:**
- `jibble_id` (unique)

**Composite Indexes:**
- `ix_jibble_email_mapping_turing` (`turing_email`)

---

### 19. `jibble_hours`
**Purpose:** Jibble hours - synced from BigQuery OR Jibble API directly.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Hours record ID |
| `member_code` | String(100) | - | YES | - | ✓ | Numeric ID (BigQuery) or UUID (API) |
| `entry_date` | Date | - | YES | - | ✓ | Entry date |
| `project` | String(255) | - | YES | - | ✓ | Project name |
| `full_name` | String(255) | - | YES | - | - | Full name |
| `logged_hours` | Float | - | YES | 0 | - | Logged hours |
| `jibble_email` | String(255) | - | YES | - | ✓ | Personal email from Jibble |
| `turing_email` | String(255) | - | YES | - | ✓ | Matched Turing email |
| `source` | String(50) | - | YES | 'bigquery' | ✓ | 'bigquery' or 'jibble_api' |
| `last_synced` | DateTime | - | YES | now() | - | Last sync timestamp |

**Relationships:** None

**Composite Indexes:**
- `ix_jibble_hours_email_date` (`turing_email`, `entry_date`)
- `ix_jibble_hours_source_date` (`source`, `entry_date`)

---

## Configuration Tables

### 20. `aht_configuration`
**Purpose:** Project-wise AHT (Average Handling Time) configuration.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Config ID |
| `project_id` | Integer | UNIQUE | NO | - | ✓ | Project ID (unique) |
| `project_name` | String(255) | - | NO | - | - | Project name |
| `new_task_aht` | Float | - | NO | 10.0 | - | Expected hours for new tasks |
| `rework_aht` | Float | - | NO | 4.0 | - | Expected hours for rework |
| `created_at` | DateTime | - | YES | now() | - | Creation timestamp |
| `updated_at` | DateTime | - | YES | now() | - | Update timestamp |
| `updated_by` | String(255) | - | YES | - | - | Email of user who updated |

**Relationships:** None

**Unique Constraints:**
- `project_id` (one config per project)

---

### 21. `project_configuration`
**Purpose:** Generic, extensible configuration system for project-level settings.

| Column | Type | Constraints | Nullable | Default | Index | Description |
|--------|------|-------------|----------|---------|-------|-------------|
| `id` | Integer | PRIMARY KEY, AUTO_INCREMENT | NO | - | - | Config ID |
| `project_id` | Integer | - | NO | - | ✓ | Project ID |
| `config_type` | String(50) | - | NO | - | ✓ | Config type |
| `config_key` | String(100) | - | NO | - | - | Config key |
| `entity_type` | String(50) | - | YES | - | - | 'trainer', 'reviewer', 'pod_lead', null |
| `entity_id` | Integer | - | YES | - | - | contributor.id or null |
| `entity_email` | String(255) | - | YES | - | - | For easier lookups |
| `config_value` | Text | - | NO | - | - | JSON string value |
| `effective_from` | Date | - | NO | CURRENT_DATE | - | Effective from date |
| `effective_to` | Date | - | YES | - | - | Effective to date (null = active) |
| `description` | Text | - | YES | - | - | Description |
| `created_at` | DateTime | - | NO | now() | - | Creation timestamp |
| `updated_at` | DateTime | - | NO | now() | - | Update timestamp |
| `created_by` | String(255) | - | YES | - | - | Creator email |
| `updated_by` | String(255) | - | YES | - | - | Updater email |

**Relationships:** None

**Composite Indexes:**
- `ix_project_config_project_type` (`project_id`, `config_type`)
- `ix_project_config_entity` (`entity_type`, `entity_id`)

---

## Relationship Diagram

```
┌─────────────────┐
│   contributor   │◄─────┐
│                 │       │ (self-referential)
│ PK: id          │       │ team_lead_id
│ UK: turing_email│       │
└────────┬────────┘       │
         │                │
         │                │
    ┌────┴────┐      ┌────┴────┐
    │         │      │         │
    │ FK      │      │ FK      │
    │         │      │         │
┌───▼─────────▼──┐ ┌─▼─────────▼──┐
│     task       │ │ review_detail │
│                │ │               │
│ PK: id         │ │ PK: id        │
│ FK: current_   │ │ FK: reviewer_ │
│     user_id    │ │     id        │
│ FK: conversation│ │ FK: conversa- │
│     _id        │ │     tion_id   │
└────────────────┘ └───────────────┘
         │
         │ FK
         │
┌────────▼────────┐
│    task_aht     │
│                 │
│ PK: id          │
│ FK: task_id     │
│ FK: contributor │
│     _id         │
└─────────────────┘

┌─────────────────┐
│   contributor   │
└────────┬────────┘
         │ FK
         │
┌────────▼──────────────────────┐
│ contributor_task_stats        │
│                               │
│ PK: id                        │
│ FK: contributor_id (UNIQUE)   │
└───────────────────────────────┘

┌─────────────────┐
│   contributor   │
└────────┬────────┘
         │ FK
         │
┌────────▼──────────────────────┐
│ contributor_daily_stats      │
│                               │
│ PK: id                        │
│ FK: contributor_id            │
│ IDX: (contributor_id, date)   │
└───────────────────────────────┘

┌─────────────────┐      ┌─────────────────┐
│   contributor   │      │   contributor   │
│  (reviewer)     │      │   (trainer)     │
└────────┬────────┘      └────────┬────────┘
         │ FK                      │ FK
         │                         │
         └──────────┬──────────────┘
                    │
         ┌──────────▼──────────────────────┐
         │ reviewer_trainer_daily_stats    │
         │                                 │
         │ PK: id                          │
         │ FK: reviewer_id                 │
         │ FK: trainer_id                  │
         │ IDX: (reviewer, trainer, date)  │
         └─────────────────────────────────┘

┌─────────────────┐
│  jibble_person  │
│                 │
│ PK: id          │
│ UK: jibble_id   │
└────────┬────────┘
         │ FK
         │
┌────────▼──────────────┐
│ jibble_time_entry     │
│                       │
│ PK: id                │
│ FK: person_id         │
│ IDX: (person_id, date)│
└───────────────────────┘
```

---

## Index Summary

### Single Column Indexes

| Table | Column(s) | Purpose |
|-------|-----------|---------|
| `task` | `created_at`, `updated_at`, `status`, `project_id`, `batch_id`, `current_user_id`, `is_delivered`, `domain`, `week_number`, `last_completed_date` | Query performance on common filters |
| `review_detail` | `quality_dimension_id`, `domain`, `review_id`, `reviewer_id`, `conversation_id`, `is_delivered`, `updated_at` | Review queries |
| `contributor` | `name`, `turing_email`, `type`, `status`, `team_lead_id` | Contributor lookups |
| `task_aht` | `task_id`, `contributor_id`, `batch_id` | AHT queries |
| `contributor_task_stats` | `contributor_id` | Stats lookup |
| `contributor_daily_stats` | `contributor_id`, `submission_date` | Daily stats queries |
| `reviewer_daily_stats` | `reviewer_id`, `review_date` | Reviewer daily queries |
| `reviewer_trainer_daily_stats` | `reviewer_id`, `trainer_id`, `review_date` | Cross-referenced stats |
| `trainer_review_stats` | `review_id`, `task_id`, `trainer_email`, `review_date`, `project_id` | Trainer review attribution |
| `task_history_raw` | `task_id`, `date`, `new_status`, `author` | History queries |
| `task_raw` | `last_completed_date`, `trainer`, `task_status`, `derived_status` | Raw task queries |
| `pod_lead_mapping` | `trainer_email`, `pod_lead_email`, `jibble_id` | Mapping lookups |
| `jibble_person` | `jibble_id`, `personal_email`, `work_email` | Person lookups |
| `jibble_time_entry` | `person_id`, `entry_date` | Time entry queries |
| `jibble_email_mapping` | `jibble_id`, `jibble_email`, `turing_email` | Email mapping |
| `jibble_hours` | `member_code`, `entry_date`, `project`, `jibble_email`, `turing_email`, `source` | Hours queries |
| `aht_configuration` | `project_id` | Config lookup |
| `project_configuration` | `project_id`, `config_type` | Config queries |

### Composite Indexes

| Table | Index Name | Columns | Purpose |
|-------|------------|---------|---------|
| `contributor_daily_stats` | `ix_contributor_daily_stats_contributor_date` | `contributor_id`, `submission_date` | Daily stats by contributor |
| `reviewer_daily_stats` | `ix_reviewer_daily_stats_reviewer_date` | `reviewer_id`, `review_date` | Daily stats by reviewer |
| `reviewer_trainer_daily_stats` | `ix_reviewer_trainer_daily_stats_all` | `reviewer_id`, `trainer_id`, `review_date` | Cross-referenced daily stats |
| `jibble_time_entry` | `ix_jibble_time_entry_person_date` | `person_id`, `entry_date` | Time entries by person and date |
| `jibble_email_mapping` | `ix_jibble_email_mapping_turing` | `turing_email` | Turing email lookups |
| `jibble_hours` | `ix_jibble_hours_email_date` | `turing_email`, `entry_date` | Hours by email and date |
| `jibble_hours` | `ix_jibble_hours_source_date` | `source`, `entry_date` | Hours by source and date |
| `trainer_review_stats` | `ix_trainer_review_trainer_project` | `trainer_email`, `project_id` | Trainer reviews by project |
| `trainer_review_stats` | `ix_trainer_review_trainer_date` | `trainer_email`, `review_date` | Trainer reviews by date |
| `project_configuration` | `ix_project_config_project_type` | `project_id`, `config_type` | Config by project and type |
| `project_configuration` | `ix_project_config_entity` | `entity_type`, `entity_id` | Entity-specific configs |

---

## Potential Schema Issues

### 1. **Data Type Inconsistencies**

#### Issue: String vs Integer for IDs
- **Location:** `task_raw.task_id` (BigInteger) vs `work_item.task_id` (String(255))
- **Impact:** Potential join issues if these represent the same entity
- **Recommendation:** Standardize on BigInteger if they reference the same task IDs

#### Issue: String vs Integer for Status Flags
- **Location:** Multiple tables use `String(10)` for boolean-like fields (`is_delivered`)
- **Examples:** `task.is_delivered`, `review_detail.is_delivered`, `task_reviewed_info.is_delivered`
- **Impact:** Inconsistent data representation, potential for 'True'/'False' vs 'true'/'false' issues
- **Recommendation:** Consider using Boolean type or standardized enum

### 2. **Missing Foreign Key Constraints**

#### Issue: No FK from `work_item` to `task`
- **Location:** `work_item.task_id` (String) doesn't reference `task.id` (BigInteger)
- **Impact:** Data integrity not enforced at database level
- **Recommendation:** Add FK if relationship exists, or clarify if `task_id` format differs

#### Issue: No FK from `task_history_raw` to `task`
- **Location:** `task_history_raw.task_id` (BigInteger) could reference `task.id`
- **Impact:** Orphaned history records possible
- **Recommendation:** Add FK constraint if relationship exists

#### Issue: No FK from `task_raw` to `task`
- **Location:** `task_raw.task_id` (BigInteger) could reference `task.id`
- **Impact:** Data synchronization issues not caught
- **Recommendation:** Add FK if `task_raw` is meant to mirror `task`

#### Issue: No FK from `pod_lead_mapping` to `contributor`
- **Location:** `pod_lead_mapping.trainer_email` and `pod_lead_email` could reference `contributor.turing_email`
- **Impact:** Mapping to non-existent contributors possible
- **Recommendation:** Add FK constraints using email matching or add contributor_id columns

### 3. **Nullable Primary Key Dependencies**

#### Issue: Foreign keys allow NULL but may need values
- **Location:** Many FK columns are nullable (e.g., `task.current_user_id`, `review_detail.reviewer_id`)
- **Impact:** Valid business case (SET NULL on delete), but may need application-level validation
- **Status:** Likely intentional for soft deletes

### 4. **Missing Unique Constraints**

#### Issue: No unique constraint on `contributor_daily_stats` (contributor_id, submission_date)
- **Location:** `contributor_daily_stats`
- **Impact:** Duplicate daily stats possible for same contributor/date
- **Recommendation:** Add unique constraint if one record per contributor per date is expected

#### Issue: No unique constraint on `reviewer_daily_stats` (reviewer_id, review_date)
- **Location:** `reviewer_daily_stats`
- **Impact:** Duplicate daily stats possible
- **Recommendation:** Add unique constraint if one record per reviewer per date is expected

#### Issue: No unique constraint on `reviewer_trainer_daily_stats` (reviewer_id, trainer_id, review_date)
- **Location:** `reviewer_trainer_daily_stats`
- **Impact:** Duplicate stats possible
- **Recommendation:** Add unique constraint if one record per combination is expected

#### Issue: No unique constraint on `jibble_time_entry` (person_id, entry_date)
- **Location:** `jibble_time_entry`
- **Impact:** Multiple entries per person per date possible
- **Recommendation:** Add unique constraint if one entry per person per date is expected

#### Issue: No unique constraint on `jibble_hours` (member_code, entry_date, project)
- **Location:** `jibble_hours`
- **Impact:** Duplicate hours entries possible
- **Recommendation:** Add unique constraint if one entry per member/date/project is expected

### 5. **Inconsistent Naming Conventions**

#### Issue: Mixed naming styles
- **Examples:** `current_user_id` vs `contributor_id` vs `reviewer_id` vs `trainer_id`
- **Impact:** Less intuitive, harder to maintain
- **Recommendation:** Standardize naming (e.g., all use `contributor_id` with role context)

### 6. **Server Defaults Not Portable**

#### Issue: `server_default='now()'` may not work across all databases
- **Location:** Multiple tables use `server_default='now()'`
- **Impact:** PostgreSQL-specific, may fail on MySQL/SQLite
- **Recommendation:** Use SQLAlchemy's `func.now()` or database-agnostic defaults

### 7. **Missing Indexes**

#### Issue: `project_configuration.effective_from` and `effective_to` not indexed
- **Location:** `project_configuration`
- **Impact:** Queries filtering by effective date range may be slow
- **Recommendation:** Add index or composite index with date columns

#### Issue: `task_raw.project_id` not indexed
- **Location:** `task_raw`
- **Impact:** Project-based queries may be slow
- **Recommendation:** Add index if project filtering is common

### 8. **Text Fields Without Length Limits**

#### Issue: Some Text fields could benefit from length limits
- **Location:** `task.statement`, `work_item.task_level_feedback`, `work_item.error_categories`
- **Impact:** Unbounded growth possible
- **Recommendation:** Consider max length if business rules exist

### 9. **Date vs DateTime Inconsistency**

#### Issue: Mix of Date and DateTime for similar concepts
- **Examples:** `task.last_completed_date` (Date) vs `task_raw.last_completed_at` (DateTime)
- **Impact:** Potential precision loss or inconsistency
- **Recommendation:** Standardize based on business requirements

### 10. **Self-Referential Relationship Complexity**

#### Issue: `contributor.team_lead_id` self-referential FK
- **Location:** `contributor`
- **Impact:** Circular references possible if not validated
- **Status:** Likely intentional for POD Lead hierarchy, but application should prevent cycles

---

## Summary Statistics

- **Total Tables:** 21
- **Total Indexes:** ~50+ (including composite)
- **Total Foreign Keys:** 12
- **Total Unique Constraints:** 5
- **Self-Referential Relationships:** 1 (`contributor`)

---

## Recommendations

1. **Add missing unique constraints** on daily stats tables to prevent duplicates
2. **Standardize boolean fields** - use Boolean type or enum instead of String(10)
3. **Add foreign key constraints** where relationships exist but aren't enforced
4. **Review nullable FKs** - ensure application handles NULL cases appropriately
5. **Add indexes** on frequently queried columns (project_id, date ranges)
6. **Standardize naming conventions** for consistency
7. **Consider database-agnostic defaults** for portability
8. **Add validation** for self-referential relationships to prevent cycles

---

**Document Generated:** February 5, 2026  
**Last Updated:** Based on current schema in `db_models.py`
