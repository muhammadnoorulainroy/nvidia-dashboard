# Database Migration Analysis Report

**Generated:** February 5, 2026  
**Migration Directory:** `backend/alembic/versions/`  
**Total Migrations:** 6

---

## Executive Summary

This report provides a comprehensive analysis of all database migrations in the Nvidia Dashboard project. The migrations span from January 22, 2025 to February 2, 2025, evolving from an initial baseline schema to a fully configured system with foreign keys, configuration tables, and API integrations.

### Critical Issues Found

1. **⚠️ DUPLICATE TABLE CREATION**: `jibble_email_mapping` table is created in both:
   - Initial schema migration (001_initial)
   - Jibble API integration migration (006_jibble_api_integration)
   - **Impact**: Migration 006 will fail if run on a fresh database
   - **Risk Level**: HIGH

2. **⚠️ SCHEMA MISMATCH**: The `jibble_email_mapping` table has different schemas:
   - Initial schema: `turing_email`, `jibble_email`, `last_synced`, `created_at`
   - Migration 006: `jibble_id`, `jibble_email`, `jibble_name`, `turing_email`, `last_synced`, `created_at`
   - **Impact**: Data inconsistency, migration failures
   - **Risk Level**: HIGH

---

## Migration History Summary

### Migration Timeline

| Revision | Date | Description | Status |
|----------|------|-------------|--------|
| `001_initial` | 2025-01-22 | Initial baseline schema (18 tables) | ✅ Complete |
| `002` | 2025-01-22 | Add foreign keys and indices | ✅ Complete |
| `003_aht_config` | 2025-01-29 | Add AHT configuration table | ✅ Complete |
| `004_project_config` | 2025-01-29 | Add generic project configuration | ✅ Complete |
| `005_trainer_review_stats` | 2025-01-29 | Add trainer review stats table | ✅ Complete |
| `006_jibble_api_integration` | 2025-02-02 | Add Jibble API integration | ⚠️ Has Issues |

---

## Detailed Migration Analysis

### Migration 001: Initial Schema (`20250122_000001_initial_schema.py`)

**Revision ID:** `001_initial`  
**Down Revision:** None (baseline)  
**Date:** 2025-01-22

#### Tables Created (18 total):

1. **`task`** - Core task tracking
   - Primary Key: `id` (BigInteger)
   - Key Columns: `status`, `project_id`, `batch_id`, `current_user_id`, `domain`, `is_delivered`
   - Indexes: None (added in migration 002)

2. **`review_detail`** - Review quality dimensions
   - Primary Key: `id` (Integer, autoincrement)
   - Key Columns: `reviewer_id`, `conversation_id`, `domain`, `score`, `task_score`
   - Foreign Keys: None (added in migration 002)

3. **`contributor`** - User/contributor information
   - Primary Key: `id` (Integer)
   - Key Columns: `name`, `turing_email`, `type`, `status`, `team_lead_id`
   - Self-referential: `team_lead_id` → `contributor.id`

4. **`data_sync_log`** - Sync operation tracking
   - Primary Key: `id` (Integer, autoincrement)
   - Tracks: `table_name`, `sync_started_at`, `sync_completed_at`, `records_synced`, `sync_status`

5. **`work_item`** - Delivered work items
   - Primary Key: `id` (Integer, autoincrement)
   - Key Columns: `work_item_id`, `task_id`, `annotator_id`, `delivery_date`

6. **`task_reviewed_info`** - Task review metadata
   - Primary Key: `id` (Integer, autoincrement)
   - Key Columns: `r_id`, `delivered_id`, `task_score`, `status`, `is_delivered`

7. **`task_aht`** - Average Handling Time tracking
   - Primary Key: `id` (Integer, autoincrement)
   - Indexes: `task_id`, `contributor_id` (created inline)
   - Key Columns: `task_id`, `contributor_id`, `start_time`, `end_time`, `duration_seconds`

8. **`contributor_task_stats`** - Aggregated contributor statistics
   - Primary Key: `id` (Integer, autoincrement)
   - Unique: `contributor_id`
   - Index: `contributor_id`
   - Tracks: `new_tasks_submitted`, `rework_submitted`, `total_unique_tasks`

9. **`contributor_daily_stats`** - Daily contributor metrics
   - Primary Key: `id` (Integer, autoincrement)
   - Indexes: `contributor_id`, `submission_date`
   - Tracks daily submission counts and scores

10. **`reviewer_daily_stats`** - Daily reviewer metrics
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `reviewer_id`, `review_date`
    - Tracks daily review counts and scores

11. **`reviewer_trainer_daily_stats`** - Reviewer-Trainer daily stats
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `reviewer_id`, `trainer_id`, `review_date`
    - Composite relationship tracking

12. **`task_history_raw`** - Task status change history
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `task_id`, `date`, `new_status`, `author`
    - Tracks: `old_status`, `new_status`, `time_stamp`, `notes`

13. **`task_raw`** - Comprehensive task data (denormalized)
    - Primary Key: `task_id` (BigInteger)
    - Indexes: `last_completed_date`, `trainer`, `task_status`, `derived_status`
    - Contains: Task details, review data, delivery info (wide table)

14. **`pod_lead_mapping`** - Trainer to POD Lead mapping
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `trainer_email`, `pod_lead_email`, `jibble_id`
    - Maps trainers to POD leads and Jibble projects

15. **`jibble_person`** - Jibble person records
    - Primary Key: `id` (Integer, autoincrement)
    - Unique: `jibble_id`
    - Indexes: `jibble_id`, `personal_email`, `work_email`
    - Tracks: `full_name`, `status`, `latest_time_entry`

16. **`jibble_time_entry`** - Jibble time entry records
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `person_id`, `entry_date`
    - Tracks: `total_hours`, `entry_date`

17. **`jibble_email_mapping`** ⚠️ **DUPLICATE**
    - Primary Key: `id` (Integer, autoincrement)
    - Unique: `turing_email`
    - Indexes: `turing_email`, `jibble_email`
    - Columns: `turing_email`, `jibble_email`, `last_synced`, `created_at`
    - **ISSUE**: Also created in migration 006 with different schema

18. **`jibble_hours`** - Jibble hours aggregation
    - Primary Key: `id` (Integer, autoincrement)
    - Indexes: `member_code`, `entry_date`, `project`
    - Tracks: `logged_hours`, `entry_date`, `project`

#### Rollback Safety: ✅ SAFE
- Simple table drops in reverse order
- No data dependencies

---

### Migration 002: Foreign Keys (`20250122_000002_add_foreign_keys.py`)

**Revision ID:** `002`  
**Down Revision:** `001_initial`  
**Date:** 2025-01-22

#### Changes:

**Foreign Keys Added:**

1. **`task.current_user_id`** → `contributor.id`
   - On Delete: `SET NULL`
   - Index: `ix_task_current_user_id`

2. **`review_detail.reviewer_id`** → `contributor.id`
   - On Delete: `SET NULL`
   - Index: `ix_review_detail_reviewer_id`

3. **`review_detail.conversation_id`** → `task.id`
   - On Delete: `CASCADE`
   - Index: `ix_review_detail_conversation_id`

4. **`contributor.team_lead_id`** → `contributor.id` (self-referential)
   - On Delete: `SET NULL`
   - Index: `ix_contributor_team_lead_id`

5. **`task_aht.task_id`** → `task.id`
   - On Delete: `CASCADE`

6. **`task_aht.contributor_id`** → `contributor.id`
   - On Delete: `CASCADE`

7. **`contributor_task_stats.contributor_id`** → `contributor.id`
   - On Delete: `CASCADE`

8. **`contributor_daily_stats.contributor_id`** → `contributor.id`
   - On Delete: `CASCADE`

9. **`reviewer_daily_stats.reviewer_id`** → `contributor.id`
   - On Delete: `CASCADE`

10. **`reviewer_trainer_daily_stats.reviewer_id`** → `contributor.id`
    - On Delete: `CASCADE`

11. **`reviewer_trainer_daily_stats.trainer_id`** → `contributor.id`
    - On Delete: `CASCADE`

12. **`jibble_time_entry.person_id`** → `jibble_person.jibble_id`
    - On Delete: `CASCADE`

**Indices Added:**

- Single column indices: `status`, `project_id`, `domain`, `is_delivered` on `task`
- Single column indices: `domain`, `reviewer_id`, `conversation_id` on `review_detail`
- Single column indices: `type`, `team_lead_id` on `contributor`
- Composite indices:
  - `contributor_daily_stats`: `(contributor_id, submission_date)`
  - `reviewer_daily_stats`: `(reviewer_id, review_date)`
  - `reviewer_trainer_daily_stats`: `(reviewer_id, trainer_id, review_date)`
  - `jibble_time_entry`: `(person_id, entry_date)`

#### Rollback Safety: ✅ SAFE
- Properly removes constraints and indices in reverse order
- Uses `batch_alter_table` for safe operations

#### Potential Issues:
- ⚠️ **Data Validation**: Migration notes that FK operations may fail if data violates constraints
- ⚠️ **Production Risk**: Should validate data before running in production

---

### Migration 003: AHT Configuration (`20250129_000001_add_aht_configuration.py`)

**Revision ID:** `003_aht_config`  
**Down Revision:** `002`  
**Date:** 2025-01-29

#### Changes:

**Table Created:**

**`aht_configuration`** - Project-wise AHT settings
- Primary Key: `id` (Integer, autoincrement)
- Unique Index: `project_id`
- Columns:
  - `project_id` (Integer, NOT NULL)
  - `project_name` (String(255), NOT NULL)
  - `new_task_aht` (Float, default: 10.0)
  - `rework_aht` (Float, default: 4.0)
  - `created_at` (DateTime, default: now())
  - `updated_at` (DateTime, default: now())
  - `updated_by` (String(255), nullable)

**Features:**
- ✅ **Idempotent**: Checks if table exists before creating (safe for existing databases)
- ✅ **Default Values**: Server-side defaults for AHT values

#### Rollback Safety: ✅ SAFE
- Simple table drop
- No foreign key dependencies

---

### Migration 004: Project Configuration (`20250129_000002_add_project_configuration.py`)

**Revision ID:** `004_project_config`  
**Down Revision:** `003_aht_config`  
**Date:** 2025-01-29

#### Changes:

**Table Created:**

**`project_configuration`** - Generic, extensible configuration system
- Primary Key: `id` (Integer, autoincrement)
- **PostgreSQL Enum**: `config_type_enum` with values:
  - `throughput_target`
  - `review_target`
  - `performance_weights`
  - `classification_threshold`
  - `effort_threshold`
  - `color_coding`
  - `general`

**Columns:**
- `project_id` (Integer, NOT NULL, indexed)
- `config_type` (Enum, NOT NULL, indexed)
- `config_key` (String(100), NOT NULL)
- `entity_type` (String(50), nullable) - For trainer/reviewer specific configs
- `entity_id` (Integer, nullable) - Contributor ID
- `entity_email` (String(255), nullable) - For easier lookups
- `config_value` (JSONB, NOT NULL) - Flexible JSON storage
- `effective_from` (Date, default: CURRENT_DATE)
- `effective_to` (Date, nullable) - NULL = currently active
- `description` (Text, nullable)
- `created_at`, `updated_at` (DateTime)
- `created_by`, `updated_by` (String(255))

**Indices:**
1. `ix_project_config_project_type` - `(project_id, config_type)`
2. `ix_project_config_active` - `(project_id, config_type, config_key)` WHERE `effective_to IS NULL`
3. `ix_project_config_entity` - `(entity_type, entity_id)` WHERE `entity_id IS NOT NULL`
4. `ix_project_config_unique_active` - **UNIQUE** `(project_id, config_type, config_key, entity_type, entity_id)` WHERE `effective_to IS NULL`

**Features:**
- ✅ **Historical Tracking**: Effective date ranges for configuration changes
- ✅ **Entity-Level Config**: Supports trainer/reviewer specific configurations
- ✅ **JSON Flexibility**: JSONB column for flexible data structures
- ✅ **Unique Active Config**: Ensures only one active config per combination

#### Rollback Safety: ✅ SAFE
- Properly drops indices before table
- Drops enum type after table

#### Potential Issues:
- ⚠️ **PostgreSQL Specific**: Uses JSONB and partial unique index - not portable to other databases
- ⚠️ **Enum Type**: Custom enum type requires explicit drop in downgrade

---

### Migration 005: Trainer Review Stats (`20250129_000003_add_trainer_review_stats.py`)

**Revision ID:** `005_trainer_review_stats`  
**Down Revision:** `004_project_config`  
**Date:** 2025-01-29

#### Changes:

**Table Created:**

**`trainer_review_stats`** - Individual review attributions to trainers
- Primary Key: `id` (Integer, autoincrement)
- Unique Index: `review_id`
- Columns:
  - `review_id` (BigInteger, nullable) - **UNIQUE**
  - `task_id` (BigInteger, nullable)
  - `trainer_email` (String(255), nullable)
  - `completion_time` (DateTime, nullable)
  - `completion_number` (Integer, nullable)
  - `review_time` (DateTime, nullable)
  - `review_date` (Date, nullable)
  - `score` (Float, nullable)
  - `followup_required` (Integer, default: 0)
  - `project_id` (Integer, nullable)
  - `last_synced` (DateTime, default: now())

**Indices:**
1. `ix_trainer_review_stats_review_id` - **UNIQUE** on `review_id`
2. `ix_trainer_review_stats_task_id` - `task_id`
3. `ix_trainer_review_stats_trainer_email` - `trainer_email`
4. `ix_trainer_review_stats_review_date` - `review_date`
5. `ix_trainer_review_stats_project_id` - `project_id`
6. `ix_trainer_review_trainer_project` - Composite `(trainer_email, project_id)`
7. `ix_trainer_review_trainer_date` - Composite `(trainer_email, review_date)`

**Features:**
- ✅ **One-to-One**: Unique constraint on `review_id` ensures one record per review
- ✅ **Query Optimization**: Multiple composite indices for common query patterns

#### Rollback Safety: ✅ SAFE
- Properly drops all indices before table
- No foreign key dependencies

---

### Migration 006: Jibble API Integration (`20250202_000001_add_jibble_api_integration.py`)

**Revision ID:** `006_jibble_api_integration`  
**Down Revision:** `005_trainer_review_stats`  
**Date:** 2025-02-02

#### Changes:

**Table Created:**

**`jibble_email_mapping`** ⚠️ **DUPLICATE TABLE**
- Primary Key: `id` (Integer, autoincrement)
- Unique Index: `jibble_id`
- Columns:
  - `jibble_id` (String(50), nullable) - **UNIQUE**
  - `jibble_email` (String(255), nullable)
  - `jibble_name` (String(255), nullable)
  - `turing_email` (String(255), nullable)
  - `last_synced` (DateTime, nullable)
  - `created_at` (DateTime, default: now())

**Indices:**
1. `ix_jibble_email_mapping_jibble_id` - **UNIQUE** on `jibble_id`
2. `ix_jibble_email_mapping_jibble_email` - `jibble_email`
3. `ix_jibble_email_mapping_turing` - `turing_email`

**⚠️ CRITICAL ISSUE:**
- This table **already exists** from migration 001 (initial schema)
- **Schema Mismatch**:
  - Migration 001: `turing_email` (unique), `jibble_email`, `last_synced`, `created_at`
  - Migration 006: `jibble_id` (unique), `jibble_email`, `jibble_name`, `turing_email`, `last_synced`, `created_at`
- **Impact**: Migration will fail with "table already exists" error on fresh databases
- **Risk**: HIGH - Migration cannot be applied cleanly

**Columns Added to `jibble_hours`:**

1. `jibble_email` (String(255), nullable)
2. `turing_email` (String(255), nullable)
3. `source` (String(50), default: 'bigquery', nullable)

**Indices Added to `jibble_hours`:**
1. `ix_jibble_hours_jibble_email` - `jibble_email`
2. `ix_jibble_hours_turing_email` - `turing_email`
3. `ix_jibble_hours_source` - `source`
4. `ix_jibble_hours_email_date` - Composite `(turing_email, entry_date)`
5. `ix_jibble_hours_source_date` - Composite `(source, entry_date)`

**Features:**
- ✅ **Source Tracking**: `source` column distinguishes BigQuery vs API data
- ✅ **Email Mapping**: New columns enable email-based lookups

#### Rollback Safety: ⚠️ **RISKY**
- Downgrade will attempt to drop `jibble_email_mapping` table
- If table was created in migration 001, this will break the schema
- Column drops on `jibble_hours` are safe

#### Critical Issues:

1. **❌ DUPLICATE TABLE CREATION**
   - `jibble_email_mapping` created in both migrations 001 and 006
   - Migration 006 will fail: "relation jibble_email_mapping already exists"

2. **❌ SCHEMA INCONSISTENCY**
   - Different column sets between migrations
   - Migration 001: Focus on email mapping
   - Migration 006: Adds `jibble_id` and `jibble_name` for API integration

3. **❌ ROLLBACK RISK**
   - Downgrade will drop table that exists from migration 001
   - Breaks migration chain integrity

**Recommended Fix:**
- Migration 006 should **ALTER** existing `jibble_email_mapping` table instead of creating it
- Add missing columns: `jibble_id`, `jibble_name`
- Update unique constraint from `turing_email` to `jibble_id`

---

## Schema Evolution Timeline

### Phase 1: Baseline (2025-01-22)
- **18 core tables** created
- No foreign keys (data integrity handled at application level)
- Basic indexing on primary keys and common query columns

### Phase 2: Data Integrity (2025-01-22)
- **12 foreign key constraints** added
- **20+ indices** added for query optimization
- Composite indices for multi-column queries
- Cascade/SET NULL strategies defined

### Phase 3: Configuration System (2025-01-29)
- **AHT Configuration**: Project-specific AHT settings
- **Project Configuration**: Generic, extensible config system with:
  - JSONB for flexible values
  - Historical tracking (effective dates)
  - Entity-level configurations
  - PostgreSQL-specific features (enum, partial unique index)

### Phase 4: Analytics Enhancement (2025-01-29)
- **Trainer Review Stats**: Individual review attribution tracking
- Enables trainer-level performance analysis

### Phase 5: API Integration (2025-02-02)
- **Jibble API Integration**: Support for dual data sources (BigQuery + API)
- Source tracking for data provenance
- ⚠️ **Issues**: Duplicate table creation

---

## Current Final Schema State

### Total Tables: 21

#### Core Tables (18 from initial schema):
1. `task`
2. `review_detail`
3. `contributor`
4. `data_sync_log`
5. `work_item`
6. `task_reviewed_info`
7. `task_aht`
8. `contributor_task_stats`
9. `contributor_daily_stats`
10. `reviewer_daily_stats`
11. `reviewer_trainer_daily_stats`
12. `task_history_raw`
13. `task_raw`
14. `pod_lead_mapping`
15. `jibble_person`
16. `jibble_time_entry`
17. `jibble_email_mapping` ⚠️ (schema conflict)
18. `jibble_hours`

#### Configuration Tables (2):
19. `aht_configuration`
20. `project_configuration`

#### Analytics Tables (1):
21. `trainer_review_stats`

### Key Relationships:

```
contributor (self-referential)
  ├── team_lead_id → contributor.id
  
task
  ├── current_user_id → contributor.id
  
review_detail
  ├── reviewer_id → contributor.id
  └── conversation_id → task.id (CASCADE)
  
task_aht
  ├── task_id → task.id (CASCADE)
  └── contributor_id → contributor.id (CASCADE)
  
contributor_task_stats
  └── contributor_id → contributor.id (CASCADE)
  
contributor_daily_stats
  └── contributor_id → contributor.id (CASCADE)
  
reviewer_daily_stats
  └── reviewer_id → contributor.id (CASCADE)
  
reviewer_trainer_daily_stats
  ├── reviewer_id → contributor.id (CASCADE)
  └── trainer_id → contributor.id (CASCADE)
  
jibble_time_entry
  └── person_id → jibble_person.jibble_id (CASCADE)
```

### Index Summary:

- **Single Column Indices**: 40+
- **Composite Indices**: 8
- **Unique Indices**: 6
- **Partial Indices**: 2 (PostgreSQL-specific)

---

## Risky Migrations

### 🔴 HIGH RISK: Migration 006

**Issue:** Duplicate table creation for `jibble_email_mapping`

**Impact:**
- Migration will fail on fresh databases
- Schema inconsistency between migrations
- Rollback will break migration chain

**Recommendation:**
1. **Fix Migration 006** to ALTER existing table instead of creating:
   ```python
   # Check if table exists (from migration 001)
   if table_exists('jibble_email_mapping'):
       # Add missing columns
       op.add_column('jibble_email_mapping', 
                     sa.Column('jibble_id', sa.String(50), nullable=True))
       op.add_column('jibble_email_mapping',
                     sa.Column('jibble_name', sa.String(255), nullable=True))
       # Drop old unique constraint, add new one
       op.drop_index('ix_jibble_email_mapping_turing_email', 
                     table_name='jibble_email_mapping')
       op.create_index('ix_jibble_email_mapping_jibble_id', 
                      'jibble_email_mapping', ['jibble_id'], unique=True)
   else:
       # Create table (for databases that skipped migration 001)
       op.create_table(...)
   ```

2. **Alternative**: Remove `jibble_email_mapping` from migration 001 if it's not needed there

### 🟡 MEDIUM RISK: Migration 002

**Issue:** Foreign key constraints may fail if data violates constraints

**Impact:**
- Migration will fail if orphaned records exist
- Requires data cleanup before migration

**Recommendation:**
- Add data validation script before running migration
- Consider using `op.execute()` to clean orphaned records first

### 🟡 MEDIUM RISK: Migration 004

**Issue:** PostgreSQL-specific features (JSONB, enum, partial unique index)

**Impact:**
- Not portable to other databases
- Requires PostgreSQL

**Recommendation:**
- Document PostgreSQL requirement
- Consider alternatives if multi-database support needed

---

## Rollback Analysis

### Safe Rollbacks: ✅
- **Migration 001**: Simple table drops (no dependencies)
- **Migration 003**: Single table drop
- **Migration 004**: Properly drops enum type
- **Migration 005**: Properly drops all indices

### Risky Rollbacks: ⚠️
- **Migration 002**: Removes foreign keys - may break application if code depends on them
- **Migration 006**: Will drop `jibble_email_mapping` that exists from migration 001

### Rollback Order:
```
006 → 005 → 004 → 003 → 002 → 001
```

**Note:** Rolling back migration 006 will break the schema if `jibble_email_mapping` was created in migration 001.

---

## Recommendations

### Immediate Actions:

1. **Fix Migration 006**
   - Change table creation to ALTER existing table
   - Handle both scenarios (table exists vs. doesn't exist)

2. **Test Migration Chain**
   - Test on fresh database
   - Test on existing database
   - Test rollback scenarios

3. **Document PostgreSQL Requirement**
   - Migration 004 uses PostgreSQL-specific features
   - Add to project documentation

### Long-term Improvements:

1. **Add Migration Tests**
   - Unit tests for each migration
   - Integration tests for migration chain
   - Rollback tests

2. **Data Validation Scripts**
   - Pre-migration validation for foreign keys
   - Post-migration verification

3. **Migration Review Process**
   - Check for duplicate table/column creation
   - Verify rollback safety
   - Test on staging before production

---

## Conclusion

The migration history shows a well-structured evolution from a baseline schema to a fully configured system. However, **Migration 006 has a critical issue** with duplicate table creation that must be fixed before deployment to production.

The schema is well-designed with:
- ✅ Proper foreign key relationships
- ✅ Comprehensive indexing strategy
- ✅ Flexible configuration system
- ✅ Historical tracking capabilities

**Overall Health:** 🟡 **GOOD** (with one critical issue to fix)

---

**Report Generated:** February 5, 2026  
**Next Review:** After fixing Migration 006
