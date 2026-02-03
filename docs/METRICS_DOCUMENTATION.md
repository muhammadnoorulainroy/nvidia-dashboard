# NVIDIA Dashboard - Metrics Documentation

## Overview

This document provides comprehensive documentation of all metrics displayed in the NVIDIA Dashboard, including their definitions, calculation formulas, and data sources.

**Last Updated**: January 2025  
**Dashboard Version**: 1.0.0

---

## Table of Contents

1. [Data Sources](#data-sources)
2. [Global Header Metrics](#global-header-metrics)
3. [Projects Tab](#projects-tab)
4. [Domain Wise Tab](#domain-wise-tab)
5. [Trainer Wise Tab](#trainer-wise-tab)
6. [POD Lead Tab](#pod-lead-tab)
7. [Task Wise Tab](#task-wise-tab)
8. [Rating Trends Tab](#rating-trends-tab)
9. [Calculated Metrics Reference](#calculated-metrics-reference)
10. [Data Flow Architecture](#data-flow-architecture)

---

## Data Sources

### Primary Data Sources

| Source | Type | Description |
|--------|------|-------------|
| **BigQuery** | `turing-gpt.quasar_prod_ai_finetuning` | Primary source of truth for task and review data |
| **BigQuery** | `turing-230020.test.Jibblelogs` | Time tracking data from Jibble |
| **Excel File** | `pod_Jibble_mapping.xlsx` | Static mapping of trainers to POD Leads |

### PostgreSQL Cache Tables

Data is synced from BigQuery to PostgreSQL for faster dashboard queries:

| Table | Source | Description |
|-------|--------|-------------|
| `task_raw` | `conversation` table | Task/conversation data |
| `task_history_raw` | `conversation_status_history` | Task status transitions |
| `review_detail` | `review` table | Review records |
| `contributor` | `contributor` table | User information |
| `jibble_hours` | `Jibblelogs` | Aggregated time tracking |
| `pod_lead_mapping` | Excel file | Trainer to POD Lead mapping |

---

## Global Header Metrics

These metrics appear at the top of the dashboard across all tabs.

### Total Tasks

**Definition**: Count of unique tasks (conversations) in the selected project(s)

**Formula**:
```sql
COUNT(DISTINCT task_id)
WHERE project_id IN (selected_projects)
```

**Data Source**: `task_raw` table

---

### Total Trainers

**Definition**: Count of unique trainers who have completed at least one task

**Formula**:
```sql
COUNT(DISTINCT trainer_email)
WHERE trainer has POD Lead mapping
```

**Data Source**: `pod_lead_mapping` table filtered by activity

---

### Total Reviewers

**Definition**: Count of unique reviewers who have reviewed at least one task

**Formula**:
```sql
COUNT(DISTINCT reviewer_id)
FROM review_detail
WHERE project_id IN (selected_projects)
```

**Data Source**: `review_detail` table

---

### Total Domains

**Definition**: Count of unique domains (extracted from task statements)

**Formula**:
```sql
COUNT(DISTINCT domain)
FROM task_raw
WHERE domain IS NOT NULL
```

**Data Source**: `task_raw.domain` (extracted via regex from statement field)

---

### Quality Dimensions

**Definition**: Count of quality dimensions used for rating tasks

**Data Source**: `quality_dimension` table

---

## Projects Tab

The Projects tab shows metrics aggregated by project, then by POD Lead.

### Columns

#### Project / POD Lead

**Definition**: 
- At project level: Project name (e.g., "Nvidia - SysBench")
- At POD Lead level: POD Lead name and email

**Data Source**: 
- Project names from configuration
- POD Lead info from `contributor` table via `pod_lead_mapping`

---

#### Count

**Definition**: 
- At project level: Number of POD Leads in the project
- At POD Lead level: Number of trainers under this POD Lead

**Formula**:
```sql
-- POD Lead count per project
COUNT(DISTINCT pod_lead_email)
FROM pod_lead_mapping
WHERE jibble_project LIKE '%ProjectName%'

-- Trainer count per POD Lead
COUNT(DISTINCT trainer_email)
FROM pod_lead_mapping
WHERE pod_lead_email = 'pod_lead@turing.com'
```

**Data Source**: `pod_lead_mapping` table

---

#### Unique Tasks

**Definition**: Total number of distinct tasks that were completed (regardless of how many times resubmitted)

**Formula**:
```sql
COUNT(DISTINCT task_id)
FROM task_history_raw thr
INNER JOIN task_raw tr ON thr.task_id = tr.task_id
WHERE thr.new_status = 'completed'
  AND thr.old_status != 'completed-approval'
  AND trainer has POD Lead mapping
```

**Meaning**: If a task was submitted 5 times (1 new + 4 reworks), it counts as **1 unique task**

**Data Source**: `task_history_raw` joined with `task_raw`

---

#### New Tasks

**Definition**: Count of tasks submitted for the **first time** (not rework submissions)

**Formula**:
```sql
COUNT(*)
FROM task_history_raw
WHERE completed_status_count = 1
  AND new_status = 'completed'
  AND old_status != 'completed-approval'
```

**Technical Detail**: `completed_status_count` tracks how many times a task has transitioned to 'completed' status. A value of 1 means it's the first completion.

**Data Source**: `task_history_raw.completed_status_count`

---

#### Rework

**Definition**: Count of task re-submissions after being sent back for rework

**Formula**:
```sql
COUNT(*)
FROM task_history_raw
WHERE completed_status_count > 1
  AND new_status = 'completed'
  AND old_status != 'completed-approval'
```

**Example**: 
- Task A: submitted once → New Task = 1, Rework = 0
- Task B: submitted 3 times → New Task = 1, Rework = 2 (counted as 2 rework submissions)

**Data Source**: `task_history_raw.completed_status_count`

---

#### Total Reviews

**Definition**: Total count of reviews performed on tasks that are ready for delivery

**Formula**:
```sql
SUM(count_reviews)
FROM task_raw
WHERE derived_status = 'Reviewed'
  AND followup_required = 0
```

**Filter Conditions**:
- `derived_status = 'Reviewed'`: Task has been reviewed
- `followup_required = 0`: No pending follow-up actions

**Data Source**: `task_raw.count_reviews`

---

#### Avg Rework %

**Definition**: Average number of times each unique task was resubmitted, expressed as a percentage

**Formula**:
```
Avg Rework % = ((New Tasks + Rework) / Unique Tasks - 1) × 100
```

**Example Calculation**:
- Unique Tasks = 100
- New Tasks = 100
- Rework = 160
- Total Submissions = 100 + 160 = 260
- Avg Rework % = (260/100 - 1) × 100 = **160%**

**Interpretation**: On average, each task was submitted 2.6 times (1 initial + 1.6 reworks)

---

#### Rework %

**Definition**: Percentage of all submissions that were rework (not new tasks)

**Formula**:
```
Rework % = Rework / (New Tasks + Rework) × 100
```

**Example Calculation**:
- New Tasks = 100
- Rework = 160
- Rework % = 160 / 260 × 100 = **61.5%**

**Interpretation**: 61.5% of all submissions were rework attempts

---

#### Merged Exp. AHT

**Definition**: Weighted average expected handling time per submission, based on task type

**Formula**:
```
Merged Exp. AHT = (New Tasks × 10 + Rework × 4) / (New Tasks + Rework)
```

**Assumptions**:
- New task expected time: **10 minutes**
- Rework expected time: **4 minutes**

**Example Calculation**:
- New Tasks = 100
- Rework = 160
- Merged AHT = (100×10 + 160×4) / 260 = (1000 + 640) / 260 = **6.31 minutes**

**Unit**: Minutes

---

#### Logged Hours

**Definition**: Total hours logged in Jibble by the POD Lead themselves (or sum of trainer hours at project level)

**Data Source**: `jibble_hours` table matched by:
- POD Lead: `contributor.name` → `jibble_hours.full_name`
- Project level: Sum of all trainer hours

**Unit**: Hours

---

#### Total POD Hrs

**Definition**: Sum of hours logged by all trainers under this POD Lead

**Formula**:
```sql
SUM(logged_hours)
FROM jibble_hours jh
INNER JOIN pod_lead_mapping plm ON jh.member_code = plm.jibble_id
WHERE plm.pod_lead_email = 'pod_lead@turing.com'
```

**Data Source**: `jibble_hours` joined with `pod_lead_mapping` via `jibble_id`

**Unit**: Hours

---

## Domain Wise Tab

Shows metrics aggregated by domain (e.g., Math, Science, Coding).

### Domain

**Definition**: The domain/category extracted from the task statement

**Extraction Method**: 
```python
# Regex pattern to extract domain from statement
pattern = r'\[([^\]]+)\]'
# Example: "[Mathematics] Solve the equation..." → "Mathematics"
```

**Data Source**: Extracted from `conversation.statement` field in BigQuery

---

### Task Count

**Definition**: Number of unique tasks in this domain

---

### Average Task Score

**Definition**: Mean rating score across all reviewed tasks in this domain

**Formula**:
```sql
AVG(score)
FROM review_detail
WHERE domain = 'domain_name'
  AND followup_required = false
```

**Scale**: Typically 1-5 (higher is better)

---

### Total Rework Count / Average Rework Count

**Definition**: Sum and average of rework submissions per domain

---

## Trainer Wise Tab

Shows metrics at the individual trainer level.

### Columns (in addition to common metrics)

#### Status

**Definition**: Current employment status of the trainer

**Values**: `Active`, `Inactive`

**Data Source**: `pod_lead_mapping.current_status` (from Excel file)

---

#### Unique Tasks

**Definition**: Count of distinct tasks completed by this trainer

---

#### New Tasks

**Definition**: First-time submissions by this trainer

---

#### Rework

**Definition**: Rework submissions by this trainer

---

#### Total Reviews

**Definition**: Number of reviews received on this trainer's tasks

---

#### Ready for Delivery

**Definition**: Tasks that are completed, reviewed, and have no pending rework

**Formula**:
```sql
COUNT(*)
FROM task_raw
WHERE task_status = 'completed'
  AND count_reviews > 0
  AND (review_action_type != 'rework' OR review_action_type IS NULL)
  AND followup_required = 0
  AND trainer = 'trainer@turing.com'
```

---

#### Avg Rating

**Definition**: Average quality score given to this trainer's work

**Formula**:
```sql
SUM(sum_score) / SUM(count_reviews)
FROM task_raw
WHERE trainer = 'trainer@turing.com'
  AND count_reviews > 0
  AND sum_followup_required = 0
```

**Scale**: 1-5 (higher is better)

---

#### Jibble Hours

**Definition**: Total hours logged by this trainer in Jibble

**Matching Logic**:
```sql
SELECT SUM(logged_hours)
FROM jibble_hours jh
WHERE jh.member_code = (
    SELECT jibble_id FROM pod_lead_mapping 
    WHERE trainer_email = 'trainer@turing.com'
)
```

---

#### AHT/Submission

**Definition**: Actual average handling time per submission (logged hours divided by submissions)

**Formula**:
```
AHT/Submission = Jibble Hours / (New Tasks + Rework)
```

**Unit**: Hours per submission

---

## POD Lead Tab

Shows metrics aggregated by POD Lead with nested trainers.

### POD Lead Level Metrics

All metrics are aggregated from the trainers under each POD Lead.

| Metric | Aggregation |
|--------|-------------|
| Unique Tasks | SUM of trainer unique tasks |
| New Tasks | SUM of trainer new tasks |
| Rework | SUM of trainer rework |
| Total Reviews | SUM of trainer reviews |
| Avg Rework % | Calculated from POD totals |
| Rework % | Calculated from POD totals |
| Avg Rating | Weighted average across trainers |
| POD Lead Hrs | POD Lead's own Jibble hours |
| Total Trainer Hrs | SUM of all trainer Jibble hours |

---

### Trainer Rows (Nested)

Each POD Lead can be expanded to show individual trainer metrics.

---

## Task Wise Tab

Shows individual task-level information.

### Columns

| Column | Description | Source |
|--------|-------------|--------|
| Task ID | Unique identifier | `task_raw.task_id` |
| Trainer | Who completed the task | `task_raw.trainer` |
| Domain | Task category | Extracted from statement |
| Status | Current task status | `task_raw.derived_status` |
| Score | Review score (if reviewed) | `task_raw.sum_score / count_reviews` |
| Rework Count | Times sent back for rework | `task_raw.number_of_turns - 1` |
| Completed Date | Last completion date | `task_raw.last_completed_date` |
| Reviews | Number of reviews received | `task_raw.count_reviews` |

---

## Rating Trends Tab

Shows rating trends over time.

### Time-based Analysis

| View | Description |
|------|-------------|
| Daily | Average rating per day |
| Weekly | Average rating per week |
| Monthly | Average rating per month |

### Trend Metrics

- **Average Rating**: Mean score over time period
- **Task Volume**: Number of tasks reviewed
- **Rework Rate**: Percentage of rework over time

---

## Calculated Metrics Reference

### Quick Reference Table

| Metric | Formula | Unit |
|--------|---------|------|
| **Unique Tasks** | `COUNT(DISTINCT task_id) WHERE completed` | Count |
| **New Tasks** | `COUNT(*) WHERE completed_status_count = 1` | Count |
| **Rework** | `COUNT(*) WHERE completed_status_count > 1` | Count |
| **Total Submissions** | `New Tasks + Rework` | Count |
| **Avg Rework %** | `((Total Submissions / Unique Tasks) - 1) × 100` | Percentage |
| **Rework %** | `(Rework / Total Submissions) × 100` | Percentage |
| **Merged Exp. AHT** | `(New × 10 + Rework × 4) / Total Submissions` | Minutes |
| **Avg Rating** | `SUM(sum_score) / SUM(count_reviews)` | 1-5 Scale |
| **AHT/Submission** | `Jibble Hours / Total Submissions` | Hours |

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐     ┌─────────────────────┐                │
│  │     BigQuery        │     │    Excel File       │                │
│  │  (Source of Truth)  │     │  (Static Mapping)   │                │
│  │                     │     │                     │                │
│  │ • conversation      │     │ pod_Jibble_mapping  │                │
│  │ • conversation_     │     │   .xlsx             │                │
│  │   status_history    │     │                     │                │
│  │ • review            │     │ Contains:           │                │
│  │ • contributor       │     │ • Trainer Email     │                │
│  │ • batch             │     │ • POD Lead Email    │                │
│  │ • Jibblelogs        │     │ • Jibble ID         │                │
│  └──────────┬──────────┘     │ • Status            │                │
│             │                └──────────┬──────────┘                │
│             │                           │                            │
└─────────────┼───────────────────────────┼────────────────────────────┘
              │                           │
              │     DATA SYNC             │
              │     (Scheduled)           │
              ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL CACHE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │   task_raw     │  │task_history_raw│  │ review_detail  │         │
│  │                │  │                │  │                │         │
│  │ • task_id      │  │ • task_id      │  │ • review_id    │         │
│  │ • trainer      │  │ • old_status   │  │ • score        │         │
│  │ • domain       │  │ • new_status   │  │ • reviewer_id  │         │
│  │ • count_reviews│  │ • completed_   │  │ • conversation │         │
│  │ • sum_score    │  │   status_count │  │   _id          │         │
│  │ • derived_     │  │ • date         │  │                │         │
│  │   status       │  │ • author       │  │                │         │
│  └────────────────┘  └────────────────┘  └────────────────┘         │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │  contributor   │  │  jibble_hours  │  │pod_lead_mapping│         │
│  │                │  │                │  │                │         │
│  │ • id           │  │ • member_code  │  │ • trainer_email│         │
│  │ • name         │  │ • logged_hours │  │ • pod_lead_    │         │
│  │ • turing_email │  │ • full_name    │  │   email        │         │
│  │ • role_id      │  │ • entry_date   │  │ • jibble_id    │         │
│  └────────────────┘  └────────────────┘  └────────────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
              │
              │     QUERY SERVICE
              │     (Aggregation)
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD API                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  /api/project-stats    →  Projects Tab                              │
│  /api/by-domain        →  Domain Wise Tab                           │
│  /api/trainer-stats    →  Trainer Wise Tab                          │
│  /api/pod-lead-stats   →  POD Lead Tab                              │
│  /api/task-info        →  Task Wise Tab                             │
│  /api/rating-trends    →  Rating Trends Tab                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
              │
              │     REACT FRONTEND
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD UI                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐ │
│  │Projects │ │Domain Wise│ │Trainer    │ │ POD Lead │ │Task Wise │ │
│  │   Tab   │ │    Tab    │ │Wise Tab   │ │   Tab    │ │   Tab    │ │
│  └─────────┘ └───────────┘ └───────────┘ └──────────┘ └──────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Important Notes

### Data Filtering

1. **POD Lead Mapping Filter**: The dashboard only shows data for trainers who have a POD Lead assigned in the Excel mapping file. Tasks by unmapped trainers are excluded.

2. **Batch Exclusions**: Certain test batches are excluded:
   - `sft-mcb-vanilla-batch-1`
   - `sft-mcb-advance-batch-1`

3. **Draft Batches**: Batches with `status = 'draft'` are excluded.

### Status Transitions

Task status flow for counting:
```
new → in_progress → completed (New Task)
completed → rework → completed (Rework)
completed → reviewed → completed-approval (Ignored for rework counting)
```

### Color Coding

The dashboard uses color coding for quick visual assessment:

| Color | Meaning |
|-------|---------|
| 🟢 Green | Good performance (low rework, high rating) |
| 🟡 Yellow | Medium / needs attention |
| 🔴 Red | Poor performance (high rework, low rating) |

---

## Glossary

| Term | Definition |
|------|------------|
| **Task** | A single conversation/assignment to be completed |
| **Trainer** | Person who performs the task (annotation/labeling) |
| **Reviewer** | Person who reviews and scores completed tasks |
| **POD Lead** | Team leader managing multiple trainers |
| **Rework** | Task sent back for corrections |
| **AHT** | Average Handling Time |
| **Jibble** | Time tracking system |
| **BigQuery** | Google's data warehouse (source of truth) |
| **Derived Status** | Calculated status based on multiple fields |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Jan 2025 | Initial documentation |

