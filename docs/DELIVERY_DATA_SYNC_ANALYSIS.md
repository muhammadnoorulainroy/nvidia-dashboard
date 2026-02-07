# Delivery Data Sync Analysis: BigQuery to PostgreSQL

## Overview
This document analyzes how delivery data (`delivery_status` and `delivery_batch_name`) is synced from BigQuery to PostgreSQL in the `sync_task_raw` function.

## Location
**File**: `backend/app/services/data_sync_service.py`  
**Function**: `sync_task_raw()` (lines 1315-1552)

---

## 1. BigQuery Query Structure

### Main Query Components

The sync uses a complex BigQuery query with multiple CTEs (Common Table Expressions):

#### A. `task_delivery` CTE (Lines 1372-1385)
This CTE is responsible for fetching delivery batch information:

```sql
task_delivery AS (
    SELECT 
        dbt.task_id, 
        db.name AS delivery_batch_name,  
        db.status AS delivery_status, 
        c.turing_email AS delivery_batch_created_by, 
        db.open_date, 
        db.close_date,
        ROW_NUMBER() OVER (PARTITION BY dbt.task_id ORDER BY dbt.updated_at DESC) AS rn
    FROM `{project}.{dataset}.delivery_batch_task` dbt 
    LEFT JOIN `{project}.{dataset}.delivery_batch` db ON db.id = dbt.delivery_batch_id
    LEFT JOIN `{project}.{dataset}.contributor` c ON db.author_id = c.id
    QUALIFY rn = 1
)
```

**Key Points:**
- **Source Tables**: 
  - `delivery_batch_task` (links tasks to delivery batches)
  - `delivery_batch` (contains batch metadata including `status` and `name`)
  - `contributor` (for batch creator email)
- **Delivery Status Source**: `db.status` from the `delivery_batch` table
- **Delivery Batch Name Source**: `db.name` from the `delivery_batch` table
- **Deduplication Logic**: Uses `ROW_NUMBER()` with `ORDER BY dbt.updated_at DESC` to select only the **most recent** delivery batch assignment per task
- **Join Type**: `LEFT JOIN` - if a task has no delivery batch assignment, it will still be included with NULL delivery fields

#### B. Main SELECT Statement (Lines 1386-1441)

The main query joins the `task_delivery` CTE to the conversation table:

```sql
SELECT 
    ...
    td.delivery_batch_name, 
    td.delivery_status, 
    td.delivery_batch_created_by,
    DATE(TIMESTAMP(td.open_date)) AS db_open_date, 
    DATE(TIMESTAMP(td.close_date)) AS db_close_date,
    ...
FROM `{project}.{dataset}.conversation` t
INNER JOIN `{project}.{dataset}.batch` b ON t.batch_id = b.id
...
LEFT JOIN task_delivery td ON td.task_id = t.id
...
WHERE t.project_id IN ({PRIMARY_PROJECT_IDS})
  AND b.status != 'draft'
  AND {BATCH_EXCLUSION_SQL}
```

**Join Type**: `LEFT JOIN task_delivery td ON td.task_id = t.id`
- Tasks without delivery batch assignments will have **NULL** values for:
  - `delivery_batch_name`
  - `delivery_status`
  - `delivery_batch_created_by`
  - `db_open_date`
  - `db_close_date`

---

## 2. Filters and Exclusions

### A. Project ID Filter
**Location**: Line 1438
```sql
WHERE t.project_id IN ({self._project_ids_sql})
```

**Values**: `PRIMARY_PROJECT_IDS = [36, 37, 38, 39]`
- **Source**: `backend/app/constants.py` (line 49)
- **Excluded Projects**: Projects 40, 41, 42 (Advanced variants)
- **Impact**: Tasks from projects 40, 41, 42 are **completely excluded** from sync

### B. Batch Status Filter
**Location**: Line 1439
```sql
AND b.status != 'draft'
```

**Impact**: All tasks in batches with `status = 'draft'` are **excluded** from sync

### C. Batch Name Exclusion
**Location**: Line 1440
```sql
AND {self._batch_exclusion_sql}
```

**Implementation**: Lines 52-56
```python
@property
def _batch_exclusion_sql(self) -> str:
    excluded = self._constants.batches.EXCLUDED_BATCH_NAMES
    names = ", ".join(f"'{name}'" for name in excluded)
    return f"b.name NOT IN ({names})"
```

**Excluded Batch Names**: 
- `'sft-mcb-vanilla-batch-1'`
- `'sft-mcb-advance-batch-1'`

**Source**: `backend/app/constants.py` (lines 78-81)

**Impact**: All tasks in these specific batches are **excluded** from sync

---

## 3. How Delivery Status is Determined

### Source
`delivery_status` comes directly from the `delivery_batch.status` field in BigQuery.

### Flow
1. `delivery_batch_task` table links tasks to delivery batches via `delivery_batch_id`
2. `delivery_batch` table contains the `status` field
3. The `task_delivery` CTE joins these tables and selects `db.status AS delivery_status`
4. If a task has multiple delivery batch assignments, only the **most recent** one (by `updated_at`) is selected
5. The main query LEFT JOINs this CTE, so tasks without delivery batches get `NULL` delivery_status

### Important Notes
- **No transformation**: The status value is copied as-is from BigQuery
- **NULL handling**: Tasks without delivery batch assignments will have `NULL` delivery_status
- **Multiple assignments**: Only the latest assignment is used (based on `dbt.updated_at DESC`)

---

## 4. Data Insertion into PostgreSQL

### Process (Lines 1533-1544)

1. **Clear existing data**: All rows in `task_raw` table are deleted (line 1535)
2. **Bulk insert**: Data is inserted in batches of 5000 records
3. **No additional filtering**: All rows fetched from BigQuery are inserted (no post-query filtering)

### Mapping (Lines 1464-1468)
```python
'delivery_batch_name': row_dict.get('delivery_batch_name'),
'delivery_status': row_dict.get('delivery_status'),
'delivery_batch_created_by': row_dict.get('delivery_batch_created_by'),
'db_open_date': row_dict.get('db_open_date'),
'db_close_date': row_dict.get('db_close_date'),
```

**Note**: Uses `.get()` with no default, so NULL values from BigQuery are preserved as NULL in PostgreSQL.

---

## 5. Potential Data Loss Points

### ✅ Tasks That Are Excluded

1. **Wrong Project ID**
   - Tasks from projects 40, 41, 42 are excluded
   - **Impact**: High - entire projects excluded

2. **Draft Batches**
   - Tasks in batches with `status = 'draft'` are excluded
   - **Impact**: Medium - intentional exclusion for draft work

3. **Excluded Batch Names**
   - Tasks in `'sft-mcb-vanilla-batch-1'` or `'sft-mcb-advance-batch-1'` are excluded
   - **Impact**: Medium - intentional exclusion for specific batches

### ⚠️ Tasks That Are Included But May Have NULL Delivery Data

1. **Tasks Without Delivery Batch Assignments**
   - Tasks not linked to any delivery batch will have:
     - `delivery_batch_name = NULL`
     - `delivery_status = NULL`
     - `delivery_batch_created_by = NULL`
     - `db_open_date = NULL`
     - `db_close_date = NULL`
   - **Impact**: Medium - data exists but delivery info is missing

2. **Tasks with Orphaned Delivery Batch Links**
   - If `delivery_batch_task.delivery_batch_id` points to a non-existent `delivery_batch.id`, the LEFT JOIN will return NULL
   - **Impact**: Low - data integrity issue

3. **Tasks with NULL delivery_batch.author_id**
   - If a delivery batch has no author, `delivery_batch_created_by` will be NULL
   - **Impact**: Low - missing metadata only

### 🔍 Edge Cases

1. **Multiple Delivery Batch Assignments**
   - If a task is assigned to multiple delivery batches, only the most recent (by `updated_at`) is used
   - **Impact**: Medium - older assignments are lost
   - **Mitigation**: Uses `ROW_NUMBER() ... ORDER BY dbt.updated_at DESC` to select latest

2. **Delivery Batch Status Changes**
   - If a delivery batch's status changes after a task is assigned, the sync will reflect the current status
   - **Impact**: Low - reflects current state, not historical state

---

## 6. Summary

### Exact Sync Logic

1. **Query Execution**: Complex BigQuery query with multiple CTEs
2. **Delivery Data Source**: `delivery_batch` table joined via `delivery_batch_task`
3. **Deduplication**: Most recent delivery batch assignment per task (by `updated_at`)
4. **Filters Applied**:
   - Project IDs: Only 36, 37, 38, 39
   - Batch status: Exclude 'draft'
   - Batch names: Exclude 'sft-mcb-vanilla-batch-1' and 'sft-mcb-advance-batch-1'
5. **Insertion**: Bulk insert all fetched rows (no post-query filtering)

### Key Findings

✅ **Delivery Status**: Comes directly from `delivery_batch.status` field  
✅ **Delivery Batch Name**: Comes directly from `delivery_batch.name` field  
✅ **No Transformation**: Values are copied as-is from BigQuery  
⚠️ **NULL Values**: Tasks without delivery batches will have NULL delivery fields  
⚠️ **Project Exclusion**: Projects 40, 41, 42 are completely excluded  
⚠️ **Batch Exclusions**: Draft batches and specific batch names are excluded  
⚠️ **Multiple Assignments**: Only the most recent delivery batch assignment is used  

### Recommendations

1. **Monitor NULL delivery_status**: Track how many tasks have NULL delivery_status to identify missing assignments
2. **Review Project Exclusions**: Verify if projects 40, 41, 42 should be included
3. **Audit Batch Exclusions**: Confirm excluded batch names are still valid
4. **Historical Tracking**: Consider tracking all delivery batch assignments, not just the latest
5. **Data Validation**: Add checks for orphaned `delivery_batch_task` records pointing to non-existent batches
