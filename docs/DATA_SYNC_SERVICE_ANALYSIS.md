# Data Sync Service - Comprehensive Analysis

**File:** `backend/app/services/data_sync_service.py`  
**Date:** February 5, 2026  
**Purpose:** Synchronizes data from BigQuery to PostgreSQL for Nvidia Dashboard

---

## Table of Contents
1. [Overview](#overview)
2. [Sync Methods Summary](#sync-methods-summary)
3. [BigQuery Query Patterns](#bigquery-query-patterns)
4. [Data Transformation Logic](#data-transformation-logic)
5. [Error Handling](#error-handling)
6. [Batch Processing Logic](#batch-processing-logic)
7. [Edge Cases & Null Handling](#edge-cases--null-handling)
8. [Google Sheets Integration](#google-sheets-integration)
9. [Sync Scheduling & Triggers](#sync-scheduling--triggers)
10. [Data Integrity Issues](#data-integrity-issues)
11. [Hardcoded Values & Filters](#hardcoded-values--filters)

---

## Overview

The `DataSyncService` class is responsible for syncing data from BigQuery (GCP) to PostgreSQL. It handles:
- **15+ sync methods** for different data tables
- **BigQuery CTE queries** for complex aggregations
- **Google Sheets integration** for mapping data
- **Jibble API integration** for time tracking
- **Batch processing** for large datasets
- **Error logging** via `DataSyncLog` table

**Key Dependencies:**
- BigQuery client (Google Cloud)
- PostgreSQL via SQLAlchemy
- Google Sheets API (gspread)
- Jibble API service

---

## Sync Methods Summary

### 1. `sync_review_detail()`
**Purpose:** Syncs review detail data with quality dimension scores  
**Source:** BigQuery CTE query  
**Target Table:** `review_detail`

**What it syncs:**
- Review quality dimension values
- Task domain extraction (regex from statement)
- Reviewer information
- Task scores and review scores
- Delivery status

**Key Filters:**
- `project_id = {project_id_filter}` (hardcoded)
- `status IN ('completed', 'validated')`
- `review_type NOT IN ('auto')`
- `followup_required = 0`
- Latest published manual review per conversation

**Batch Size:** 5,000 records

---

### 2. `sync_task()`
**Purpose:** Syncs task-level data with domain extraction  
**Source:** BigQuery CTE query  
**Target Table:** `task`

**What it syncs:**
- Task metadata (id, dates, status, project_id)
- Domain extraction via regex: `\*\*Domain:\*\*\s*-\s*([^\n]+)`
- Rework count (from conversation_status_history)
- Week number calculation (from project_start_date)
- Number of turns
- Last completed date

**Key Features:**
- Calculates `week_number` using `calculate_week_number()` helper
- Uses `COALESCE(rc.rework_count, 0)` for null handling
- Filters by `project_id` and status

**Batch Size:** 5,000 records

---

### 3. `sync_contributor()`
**Purpose:** Syncs contributor/user information  
**Source:** BigQuery `contributor` table  
**Target Table:** `contributor`

**What it syncs:**
- Contributor ID, name, email
- Type, status
- **Self-referential FK:** `team_lead_id` (two-pass approach)

**Special Handling:**
- **Two-pass insert** to handle self-referential foreign key:
  1. Insert all contributors with `team_lead_id = NULL`
  2. Update `team_lead_id` for all contributors
- Prevents FK constraint violations

**No project filter** - syncs ALL contributors

**Batch Size:** Single commit (no batching)

---

### 4. `sync_task_reviewed_info()`
**Purpose:** Syncs task review metadata  
**Source:** BigQuery CTE  
**Target Table:** `task_reviewed_info`

**What it syncs:**
- Task ID (r_id)
- Delivery batch task ID
- RLHF Colab link
- Delivery status (`is_delivered`)
- Review status and score
- Contributor name
- Annotation date (first completion timestamp)

**Key Query Logic:**
- Gets latest published manual review per conversation
- Calculates annotation_date from `conversation_status_history`
- Filters: `project_id`, `status IN ('completed', 'validated')`, `review_type != 'auto'`

**Batch Size:** 5,000 records

---

### 5. `sync_task_aht()`
**Purpose:** Syncs Average Handle Time (AHT) metrics  
**Source:** BigQuery CTE  
**Target Table:** `task_aht`

**What it syncs:**
- Task ID
- Contributor ID and name
- Batch ID
- Start/end timestamps
- Duration (seconds and minutes)

**AHT Calculation:**
- Time from `pending → labeling` to `labeling → completed`
- Filters out durations > 3 hours (10,800 seconds)
- Uses `ROW_NUMBER()` to pick shortest duration per task

**Special Handling:**
- **FK validation:** Filters AHT records to only include tasks that exist in `task` table
- Prevents FK violations
- Hardcoded batch exclusion: `batch_id NOT IN (177)`

**Batch Size:** 5,000 records

---

### 6. `sync_contributor_task_stats()`
**Purpose:** Syncs aggregate contributor statistics  
**Source:** BigQuery CTE  
**Target Table:** `contributor_task_stats`

**What it syncs:**
- Contributor ID
- New tasks submitted (first completion)
- Rework submitted (subsequent completions)
- Total unique tasks
- First/last submission dates
- Sum of `number_of_turns` (for avg_rework calculation)

**Key Logic:**
- Uses window function: `COUNTIF(new_status = 'completed') OVER (...)`
- New task = `completed_status_count = 1`
- Rework = `completed_status_count > 1`
- Excludes `completed-approval` transitions

**Hardcoded Filters:**
- Batch names: `NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')`
- Batch status: `!= 'draft'`

**Batch Size:** 5,000 records

---

### 7. `sync_contributor_daily_stats()`
**Purpose:** Syncs daily-level contributor statistics  
**Source:** BigQuery CTE  
**Target Table:** `contributor_daily_stats`

**What it syncs:**
- Contributor ID
- Submission date
- New tasks submitted (date level)
- Rework submitted (date level)
- Total submissions
- Unique tasks
- Owned tasks (for avg_rework)
- Sum of number_of_turns
- **Post-sync calculation:** `tasks_ready_for_delivery`

**Post-Sync Processing:**
- After BigQuery sync, calculates `tasks_ready_for_delivery` from PostgreSQL:
  - Tasks with reviews AND `rework_count = 0`
  - Uses `task_reviewed_info` + `task` join

**Batch Size:** 5,000 records

---

### 8. `sync_reviewer_daily_stats()`
**Purpose:** Syncs daily-level reviewer statistics  
**Source:** BigQuery CTE  
**Target Table:** `reviewer_daily_stats`

**What it syncs:**
- Reviewer ID
- Review date
- Unique tasks reviewed
- New tasks reviewed
- Rework reviewed
- Total reviews
- Sum of number_of_turns
- **Post-sync calculation:** `tasks_ready_for_delivery`

**Key Logic:**
- Uses window function to calculate completion counts
- Matches reviews to task completion history
- Filters: `review_type = 'manual'`, `status = 'published'`

**Post-Sync Processing:**
- Calculates `tasks_ready_for_delivery` from `review_detail` + `task` join

**Batch Size:** 5,000 records

---

### 9. `sync_reviewer_trainer_daily_stats()`
**Purpose:** Syncs reviewer × trainer × date level statistics  
**Source:** BigQuery CTE  
**Target Table:** `reviewer_trainer_daily_stats`

**What it syncs:**
- Reviewer ID
- Trainer ID
- Review date
- Tasks reviewed
- New tasks reviewed
- Rework reviewed
- Total reviews
- Ready for delivery count
- Sum of number_of_turns

**Key Logic:**
- Three-dimensional aggregation (reviewer × trainer × date)
- Uses same completion count logic as other daily stats

**Batch Size:** 5,000 records

---

### 10. `sync_task_raw()`
**Purpose:** Mirrors spreadsheet's `tasks_raw` sheet exactly  
**Source:** BigQuery complex query  
**Target Table:** `task_raw`

**What it syncs:**
- Complete task metadata
- Review statistics (count, sum scores, duration)
- Latest review details
- First completion info
- Delivery batch info
- **Derived status calculation** (Python logic)

**Derived Status Logic (Python):**
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
# ... more status mappings
```

**Hardcoded Project IDs:** `IN (36, 37, 38, 39)` - All Nvidia projects

**Batch Size:** 5,000 records

---

### 11. `sync_task_history_raw()` (DUPLICATE METHOD)
**Purpose:** Mirrors spreadsheet's `task_history_raw` sheet  
**Source:** BigQuery query  
**Target Table:** `task_history_raw`

**What it syncs:**
- Conversation status history
- Timestamps and dates
- Status transitions (old_status → new_status)
- Author information
- Completion status count (window function)
- Last completed date (window function)
- Project and batch info

**Note:** This method appears **twice** in the file (lines 1211 and 1539) - potential duplicate code issue

**Hardcoded Project IDs:** `IN (36, 37, 38, 39)`

**Batch Size:** 10,000 records (larger than others)

---

### 12. `sync_pod_lead_mapping()`
**Purpose:** Syncs POD Lead mappings from Google Sheets  
**Source:** Google Sheets or Excel fallback  
**Target Table:** `pod_lead_mapping`

**What it syncs:**
- Trainer email → POD Lead email mapping
- Trainer name, role, status
- Jibble project, ID, name

**Google Sheets Integration:**
- Sheet ID from `POD_LEAD_MAPPING_SHEET_ID` env var
- Falls back to Excel: `static_data/pod_Jibble_mapping.xlsx`
- Handles duplicate headers (adds `.1`, `.2` suffixes)

**Hardcoded Filters:**
- Projects: `'Nvidia - SysBench'`, `'Nvidia - CFBench Multilingual'`, `'Nvidia - InverseIFEval'`, `'Nvidia - Multichallenge'`, `'Nvidia - Multichallenge Advanced'`
- Column: `'Pod Lead.1'` (Column K) - authoritative POD Lead column
- Filters out empty POD Lead values

**Special Handling:**
- Uses raw SQL inserts to avoid SQLAlchemy type caching issues
- Preserves POD Lead self-entries (where `trainer_email = pod_lead_email`)

**No batching** - processes row by row

---

### 13. `sync_jibble_hours()`
**Purpose:** Syncs Jibble hours from BigQuery  
**Source:** BigQuery `turing-230020.test.Jibblelogs`  
**Target Table:** `jibble_hours`

**What it syncs:**
- Member code (Jibble ID)
- Entry date
- Project name
- Full name
- Logged hours (summed)

**Hardcoded Project Filter:**
```sql
WHERE Jibble_PROJECT IN (
    "Nvidia - ICPC", 
    "Nvidia - CFBench Multilingual", 
    "Nvidia - InverseIFEval", 
    "Nvidia - Multichallenge", 
    "Nvidia - Multichallenge Advanced", 
    "Nvidia - SysBench", 
    "NVIDIA_STEM Math_Eval"
)
```

**Hardcoded Dataset:** `turing-230020.test.Jibblelogs` (different project!)

**No batching** - processes record by record

---

### 14. `sync_jibble_email_mapping()`
**Purpose:** Syncs Jibble ID → Turing Email mapping  
**Source:** Google Sheets  
**Target Table:** `jibble_email_mapping`

**What it syncs:**
- Jibble ID
- Jibble Email
- Jibble Name
- Turing Email

**Google Sheets Integration:**
- Sheet ID: `1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8` (hardcoded default)
- Worksheet GID: `1375209319` ("Brittney's Mapping" tab)
- Falls back to first sheet if GID not found

**Special Handling:**
- Uses `ON CONFLICT (jibble_id) DO UPDATE` for upserts
- Skips rows with missing `jibble_id` or `turing_email`
- Handles 'nan' string values

**No batching** - processes row by row

---

### 15. `sync_jibble_hours_from_api()`
**Purpose:** Syncs ALL Jibble hours from API (not just Nvidia)  
**Source:** Jibble API TimesheetsSummary endpoint  
**Target Table:** `jibble_hours` (with `source='jibble_api'`)

**What it syncs:**
- All people's timesheets (not filtered)
- Daily hour breakdowns
- Stores with `source='jibble_api'` marker
- Optional `turing_email` enrichment from mapping

**Auto-Detection Logic:**
- If no API records exist → treat as initial (90 days)
- If API records exist → treat as scheduled (7 days)
- Can override with `days_back` parameter

**Chunking Strategy:**
- Fetches in 14-day chunks (API date range limits)
- Merges chunks before storing

**Safety Check:**
- Only deletes old records if new records fetched
- Prevents data loss if API fails

**Batch Size:** 1,000 records per batch

---

### 16. `sync_jibble_hours_by_project()`
**Purpose:** Syncs Jibble hours with project filtering via TimeEntries API  
**Source:** Jibble API TimeEntries endpoint  
**Target Table:** `jibble_hours` (with project names)

**What it syncs:**
- Project-specific hours
- Calculated from In/Out entry pairs
- Accurate per-project breakdown

**Uses:** `JibbleTimeEntriesSync` service class

**Slower than TimesheetsSummary** but provides project breakdown

---

### 17. `sync_trainer_review_stats()`
**Purpose:** Attributes reviews to trainers who did the work  
**Source:** BigQuery CTE  
**Target Table:** `trainer_review_stats`

**What it syncs:**
- Review ID
- Task ID
- Trainer email (who did the work)
- Completion time and number
- Review time and date
- Score and followup_required
- Project ID

**Attribution Logic:**
- Finds most recent completion event BEFORE review submission
- Attributes review to trainer who made that completion
- Enables accurate per-trainer review metrics

**Hardcoded Project IDs:** Adds `[36, 37, 38, 39]` to settings filter

**Batch Size:** 5,000 records

---

## BigQuery Query Patterns

### Common Patterns

#### 1. **CTE-Based Queries**
Most queries use Common Table Expressions (CTEs) for complex logic:
```sql
WITH cte1 AS (...),
     cte2 AS (...)
SELECT * FROM cte2
```

#### 2. **Window Functions**
Used extensively for running counts and aggregations:
```sql
COUNTIF(new_status = 'completed') OVER (
    PARTITION BY conversation_id
    ORDER BY created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS completed_status_count
```

#### 3. **Subquery Filters**
Used for filtering to latest records:
```sql
WHERE r.id = (
    SELECT MAX(rn.id)
    FROM review rn
    WHERE rn.conversation_id = r.conversation_id
    AND rn.review_type = 'manual'
    AND rn.status = 'published'
)
```

#### 4. **ROW_NUMBER() for Deduplication**
```sql
ROW_NUMBER() OVER (
    PARTITION BY conversation_id 
    ORDER BY id DESC
) AS row_num
-- Then: WHERE row_num = 1
```

#### 5. **LEFT JOINs for Optional Data**
Most queries use LEFT JOINs to preserve all records:
```sql
LEFT JOIN delivery_batch_task bt ON bt.task_id = c.id
LEFT JOIN contributor cb ON cb.id = c.current_user_id
```

#### 6. **COALESCE for Null Handling**
```sql
COALESCE(rc.rework_count, 0) AS rework_count
COALESCE((SELECT ...), 0) as sum_number_of_turns
```

### Query Complexity

**Most Complex Queries:**
1. `sync_task_raw()` - Multiple CTEs, complex joins, derived fields
2. `sync_contributor_daily_stats()` - Window functions, subqueries, post-processing
3. `sync_reviewer_trainer_daily_stats()` - Three-dimensional aggregation
4. `sync_trainer_review_stats()` - Temporal matching logic

**Simplest Queries:**
1. `sync_contributor()` - Direct table select
2. `sync_jibble_hours()` - Simple aggregation

---

## Data Transformation Logic

### 1. **Domain Extraction**
Uses regex to extract domain from task statement:
```python
TRIM(REGEXP_EXTRACT(statement, r'\\*\\*Domain:\\*\\*\\s*-\\s*([^\\n]+)')) AS domain
```

### 2. **Week Number Calculation**
```python
def calculate_week_number(task_date: datetime, project_start_date: str) -> Optional[int]:
    start_date = datetime.strptime(project_start_date, "%Y-%m-%d")
    days_diff = (task_dt - start_date).days
    week_num = (days_diff // 7) + 1
    return max(1, week_num)
```
- Returns `None` if dates invalid
- Minimum week = 1

### 3. **Derived Status Calculation** (`sync_task_raw`)
Complex Python logic to calculate `derived_status`:
- Checks task status, review count, dates, review action type
- Maps to: 'Completed', 'Reviewed', 'Rework', 'Unclaimed', 'In Progress', etc.

### 4. **Completion Count Logic**
Uses window functions to track how many times a task was completed:
- `completed_status_count = 1` → New task
- `completed_status_count > 1` → Rework

### 5. **AHT Duration Filtering**
- Filters out durations > 3 hours (10,800 seconds)
- Picks shortest duration per task if multiple exist

### 6. **Email Normalization**
- Converts emails to lowercase: `.lower().strip()`
- Used in multiple sync methods

### 7. **Date Extraction**
- Uses `DATE(TIMESTAMP(...))` for date extraction
- Handles timezone conversions

---

## Error Handling

### Pattern Used in All Methods

```python
log_id = self.log_sync_start('table_name', sync_type)
try:
    # ... sync logic ...
    self.log_sync_complete(log_id, len(data), True)
    return True
except Exception as e:
    self.log_sync_complete(log_id, 0, False, str(e))
    logger.error(f"[ERROR] Error syncing table_name: {e}")
    return False
```

### Error Logging

**`log_sync_start()`:**
- Creates `DataSyncLog` entry with status='started'
- Returns log_id (0 if fails)
- Catches exceptions, logs but doesn't raise

**`log_sync_complete()`:**
- Updates existing log entry
- Sets `sync_status` ('completed' or 'failed')
- Records `records_synced` count
- Stores `error_message` if failed

### Specific Error Handling

1. **BigQuery Client Initialization**
   - Tries service account file first
   - Falls back to default credentials
   - Raises exception if both fail

2. **Google Sheets Fallback**
   - `sync_pod_lead_mapping()`: Falls back to Excel if Sheets unavailable
   - `sync_jibble_email_mapping()`: Returns False if Sheets unavailable (no fallback)

3. **FK Validation**
   - `sync_task_aht()`: Filters records to only include existing tasks
   - Prevents FK violations

4. **Empty Results**
   - `sync_jibble_hours_from_api()`: Skips delete if no records fetched
   - Prevents data loss

5. **Chunk Failures**
   - `sync_jibble_hours_from_api()`: Logs warning but continues if chunk fails
   - Partial data is better than no data

### Error Recovery

- **No retry logic** - fails fast
- **No partial commits** - all or nothing per batch
- **Logs all errors** - but doesn't stop other syncs in `sync_all_tables()`

---

## Batch Processing Logic

### Standard Batch Size: 5,000 records

Used by:
- `sync_review_detail()`
- `sync_task()`
- `sync_task_reviewed_info()`
- `sync_task_aht()`
- `sync_contributor_task_stats()`
- `sync_contributor_daily_stats()`
- `sync_reviewer_daily_stats()`
- `sync_reviewer_trainer_daily_stats()`
- `sync_task_raw()`
- `sync_trainer_review_stats()`

### Larger Batch Size: 10,000 records

Used by:
- `sync_task_history_raw()` (duplicate method)

### Smaller Batch Size: 1,000 records

Used by:
- `sync_jibble_hours_from_api()`

### No Batching

These methods process records individually:
- `sync_contributor()` - Two-pass approach
- `sync_pod_lead_mapping()` - Raw SQL inserts
- `sync_jibble_hours()` - Simple inserts
- `sync_jibble_email_mapping()` - Upsert logic

### Batch Processing Pattern

```python
batch_size = 5000
for i in range(0, len(data), batch_size):
    batch = data[i:i + batch_size]
    objects = [Model(**record) for record in batch]
    session.bulk_save_objects(objects)
    session.commit()
    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} records")
```

**Characteristics:**
- Commits after each batch
- Logs progress
- Uses `bulk_save_objects()` for performance

---

## Edge Cases & Null Handling

### 1. **Null Handling in Queries**

**COALESCE Usage:**
```sql
COALESCE(rc.rework_count, 0) AS rework_count
COALESCE((SELECT ...), 0) as sum_number_of_turns
```

**IS NOT NULL Filters:**
```sql
WHERE cs.completed_at IS NOT NULL
WHERE rwti.reviewer_id IS NOT NULL AND rwti.review_date IS NOT NULL
WHERE contributor_id IS NOT NULL AND submission_date IS NOT NULL
```

### 2. **Empty Results Handling**

**Most Methods:**
- Handle empty results gracefully
- Log count (0 records)
- Still commit (clears table)

**Special Case - `sync_jibble_hours_from_api()`:**
```python
if not records:
    logger.warning("No records fetched - skipping delete to preserve existing data")
    return True  # Don't delete existing data
```

### 3. **Missing Foreign Keys**

**`sync_task_aht()`:**
- Validates task IDs exist before inserting
- Filters out non-existent tasks
- Logs filtered count

### 4. **Self-Referential FK**

**`sync_contributor()`:**
- Two-pass approach prevents FK violations
- First pass: Insert with `team_lead_id = NULL`
- Second pass: Update `team_lead_id`

### 5. **Duplicate Headers (Google Sheets)**

**`sync_pod_lead_mapping()`:**
- Handles duplicate column headers
- Adds `.1`, `.2` suffixes
- Uses `'Pod Lead.1'` as authoritative column

### 6. **Invalid Dates**

**`calculate_week_number()`:**
- Returns `None` if dates invalid
- Catches exceptions, logs warning
- Returns `None` instead of raising

### 7. **Missing Email Mappings**

**`sync_jibble_email_mapping()`:**
- Skips rows without `jibble_id` or `turing_email`
- Handles 'nan' string values
- Continues processing other rows

### 8. **Invalid Date Strings**

**`sync_jibble_hours_from_api()`:**
```python
try:
    entry_date = datetime.fromisoformat(date_str).date()
except:
    continue  # Skip invalid dates
```

### 9. **Zero Hours**

**`sync_jibble_hours_from_api()`:**
```python
if hours == 0:
    continue  # Skip zero-hour entries
```

### 10. **Missing Week Number**

**`sync_task()`:**
```python
if task_date:
    row_dict['week_number'] = calculate_week_number(...)
else:
    row_dict['week_number'] = None
```

---

## Google Sheets Integration

### Credentials Setup

**Method:** `_get_google_sheets_credentials()`

**Environment Variables Required:**
- `GOOGLE_SERVICE_ACCOUNT_TYPE`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_PRIVATE_KEY_ID`
- `GOOGLE_PRIVATE_KEY` (multiline, replaces `\n`)
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_AUTH_URI` (default)
- `GOOGLE_TOKEN_URI` (default)
- `GOOGLE_AUTH_PROVIDER_CERT_URL` (default)
- `GOOGLE_CLIENT_CERT_URL`
- `GOOGLE_UNIVERSE_DOMAIN` (default: 'googleapis.com')

**Scopes:**
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/drive.readonly`

### Methods Using Google Sheets

#### 1. `sync_pod_lead_mapping()`
- **Sheet ID:** `POD_LEAD_MAPPING_SHEET_ID` env var
- **Fallback:** Excel file `static_data/pod_Jibble_mapping.xlsx`
- **Library:** `gspread`
- **Handles:** Duplicate headers, empty values

#### 2. `sync_jibble_email_mapping()`
- **Sheet ID:** `1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8` (hardcoded default)
- **Worksheet GID:** `1375209319` ("Brittney's Mapping")
- **No fallback** - returns False if fails
- **Uses:** `ON CONFLICT` upsert logic

### Error Handling

- **Import Error:** Falls back to Excel (pod_lead_mapping) or returns False (jibble_email_mapping)
- **API Error:** Logs warning, falls back or fails
- **Empty Sheet:** Raises ValueError

---

## Sync Scheduling & Triggers

### Main Sync Method

**`sync_all_tables()`** - Orchestrates all syncs

**Sync Order:**
1. `contributor` (foundation - needed by others)
2. `task_reviewed_info` (foundation)
3. `task` (foundation)
4. `review_detail` (depends on task)
5. `task_aht` (depends on task)
6. `contributor_task_stats`
7. `contributor_daily_stats`
8. `reviewer_daily_stats`
9. `reviewer_trainer_daily_stats`
10. `task_raw`
11. `task_history_raw`
12. `pod_lead_mapping`
13. `jibble_email_mapping`
14. `jibble_hours`
15. `trainer_review_stats`

**Error Handling:**
- Continues even if one sync fails
- Logs all errors
- Returns dict of `{table_name: success_bool}`

### Scheduled Execution

**Location:** `backend/app/main.py`

**Trigger:** IntervalTrigger based on `settings.sync_interval_hours`

**Code:**
```python
scheduler.add_job(
    sync_job,
    trigger=IntervalTrigger(hours=settings.sync_interval_hours),
    id='data_sync_job',
    name='Periodic Data Sync',
    replace_existing=True
)
```

**Execution:**
- Runs in thread pool (blocking ops)
- Updates table metrics after sync
- Logs success count

### Sync Types

1. **'scheduled'** - Regular interval sync
2. **'initial'** - First-time sync (may fetch more data)
3. **'auto'** - Auto-detected (used by Jibble API sync)
4. **'manual'** - Triggered via API endpoint

---

## Data Integrity Issues

### 1. **Duplicate Method**
- `sync_task_history_raw()` appears **twice** (lines 1211 and 1539)
- Both methods are identical
- **Risk:** Confusion, potential for divergence

### 2. **Hardcoded Project IDs**
- Multiple methods hardcode `IN (36, 37, 38, 39)`
- Should use `project_id_filter` setting
- **Risk:** Inconsistent filtering

### 3. **Hardcoded Batch Exclusions**
- `batch_id NOT IN (177)` in `sync_task_aht()`
- Batch names: `NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')`
- **Risk:** Hard to maintain, not configurable

### 4. **Different BigQuery Projects**
- `sync_jibble_hours()` uses `turing-230020.test.Jibblelogs`
- Other methods use `turing-gpt.{dataset}`
- **Risk:** Dependency on different project

### 5. **FK Validation Only in One Method**
- Only `sync_task_aht()` validates FK existence
- Other methods may have FK violations
- **Risk:** Data integrity issues

### 6. **No Transaction Rollback**
- If batch fails mid-way, partial data may be committed
- **Risk:** Inconsistent state

### 7. **Self-Referential FK Handling**
- Only `sync_contributor()` handles self-referential FK properly
- If other tables have similar issues, they're not handled

### 8. **Post-Sync Calculations**
- `sync_contributor_daily_stats()` and `sync_reviewer_daily_stats()` calculate `tasks_ready_for_delivery` after sync
- **Risk:** If sync fails, calculation may be wrong

### 9. **Email Case Sensitivity**
- Some methods normalize emails, others don't
- **Risk:** Duplicate records with different cases

### 10. **No Validation of Required Fields**
- Most methods don't validate required fields before insert
- **Risk:** Database constraint violations

---

## Hardcoded Values & Filters

### Project IDs

**Hardcoded in Multiple Methods:**
```sql
WHERE t.project_id IN (36, 37, 38, 39)
```

**Methods:**
- `sync_task_raw()` (line 1423)
- `sync_task_history_raw()` (lines 1249, 1579)

**Should Use:** `self.settings.project_id_filter`

### Batch Exclusions

**Hardcoded Batch ID:**
```sql
WHERE cs.batch_id NOT IN (177)
```
- `sync_task_aht()` (line 538)

**Hardcoded Batch Names:**
```sql
AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
```

**Methods:**
- `sync_contributor_task_stats()` (line 673)
- `sync_contributor_daily_stats()` (line 790)
- `sync_reviewer_daily_stats()` (line 954)
- `sync_reviewer_trainer_daily_stats()` (line 1103)
- `sync_task_raw()` (line 1425)
- `sync_task_history_raw()` (lines 1251, 1581)

### Jibble Projects

**Hardcoded Project Names:**
```sql
WHERE Jibble_PROJECT IN (
    "Nvidia - ICPC", 
    "Nvidia - CFBench Multilingual", 
    "Nvidia - InverseIFEval", 
    "Nvidia - Multichallenge", 
    "Nvidia - Multichallenge Advanced", 
    "Nvidia - SysBench", 
    "NVIDIA_STEM Math_Eval"
)
```
- `sync_jibble_hours()` (lines 1834-1842)

**Hardcoded POD Lead Projects:**
```python
nvidia_projects = [
    'Nvidia - SysBench',
    'Nvidia - CFBench Multilingual',
    'Nvidia - InverseIFEval',
    'Nvidia - Multichallenge',
    'Nvidia - Multichallenge Advanced',
]
```
- `sync_pod_lead_mapping()` (lines 1744-1750)

### Google Sheets IDs

**Hardcoded Sheet ID:**
```python
sheet_id = os.environ.get(
    'JIBBLE_EMAIL_MAPPING_SHEET_ID', 
    '1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8'  # Default
)
```
- `sync_jibble_email_mapping()` (line 1905)

**Hardcoded Worksheet GID:**
```python
worksheet_gid = os.environ.get('JIBBLE_EMAIL_MAPPING_SHEET_GID', '1375209319')
```
- `sync_jibble_email_mapping()` (line 1908)

### BigQuery Dataset

**Hardcoded Dataset:**
```sql
FROM `turing-230020.test.Jibblelogs`
```
- `sync_jibble_hours()` (line 1833)
- **Different project** than other queries!

### AHT Duration Limit

**Hardcoded Duration:**
```sql
AND TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) <= 10800
WHERE duration_seconds <= 10800
```
- `sync_task_aht()` (lines 561, 571)
- **3 hours** (10,800 seconds)

### Batch Sizes

**Hardcoded Batch Sizes:**
- Most: `5000`
- `sync_task_history_raw()`: `10000`
- `sync_jibble_hours_from_api()`: `1000`

### Chunk Sizes

**Hardcoded Chunk Days:**
```python
chunk_days = 14  # Smaller chunks for reliability
```
- `sync_jibble_hours_from_api()` (line 2073)

### Date Ranges

**Hardcoded Initial/Scheduled Days:**
```python
if is_first_sync:
    days_back = 90  # 3 months for first sync
else:
    days_back = 7   # 1 week for subsequent syncs
```
- `sync_jibble_hours_from_api()` (lines 2045, 2048)

### Column Names

**Hardcoded Column Reference:**
```python
df = df[df['Pod Lead.1'].notna() & (df['Pod Lead.1'].str.strip() != '')]
```
- `sync_pod_lead_mapping()` (line 1757)
- Assumes specific column structure

---

## Recommendations

### High Priority

1. **Remove duplicate `sync_task_history_raw()` method**
2. **Replace hardcoded project IDs with `project_id_filter`**
3. **Add FK validation to all methods that need it**
4. **Move hardcoded batch exclusions to configuration**

### Medium Priority

5. **Standardize batch sizes** (or make configurable)
6. **Add transaction rollback on batch failures**
7. **Validate required fields before insert**
8. **Standardize email normalization** across all methods

### Low Priority

9. **Extract hardcoded values to configuration file**
10. **Add retry logic for transient failures**
11. **Add data validation checks**
12. **Document all hardcoded values**

---

## Summary Statistics

- **Total Sync Methods:** 17 (including duplicate)
- **BigQuery Queries:** 15+
- **Google Sheets Integrations:** 2
- **Jibble API Integrations:** 2
- **Standard Batch Size:** 5,000 records
- **Hardcoded Project IDs:** 3 methods
- **Hardcoded Batch Exclusions:** 6+ methods
- **Post-Sync Calculations:** 2 methods
- **Self-Referential FK Handling:** 1 method
- **FK Validation:** 1 method

---

**End of Analysis**
