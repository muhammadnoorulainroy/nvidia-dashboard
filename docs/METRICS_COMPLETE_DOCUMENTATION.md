# Complete Metrics Documentation

## NVIDIA Dashboard - Metrics Calculation Reference

**Version**: 2.0  
**Last Updated**: 2026-02-06  
**Audience**: New developers joining the project

---

## Table of Contents

1. [How This Dashboard Works](#how-this-dashboard-works)
2. [Data Flow Overview](#data-flow-overview)
3. [Task-Level Metrics](#task-level-metrics)
4. [Trainer-Level Metrics](#trainer-level-metrics)
5. [POD Lead-Level Metrics](#pod-lead-level-metrics)
6. [Project-Level Metrics](#project-level-metrics)
7. [Other Tabs](#other-tabs)
8. [Configuration Reference](#configuration-reference)

---

## How This Dashboard Works

### The Hierarchy

The dashboard displays data in a 4-level hierarchy:

```
PROJECT (e.g., "Nvidia - SysBench")
    └── POD LEAD (e.g., "sardar.r1@turing.com")
            └── TRAINER (e.g., "aman.k3@turing.com")
                    └── TASK (e.g., Task ID 55288)
```

**Key Concept**: Data flows UPWARD. Task metrics aggregate to Trainer, Trainer metrics aggregate to POD Lead, and POD Lead metrics aggregate to Project.

### What is a "Task"?

A task (also called "conversation") is a unit of work. Trainers complete tasks, reviewers review them, and eventually tasks get delivered to the client.

### What is "Completion"?

When a trainer finishes working on a task and submits it, they "complete" it. A task can be completed multiple times:
- **First completion** = NEW task (trainer did original work)
- **Subsequent completions** = REWORK (trainer fixed issues after rejection)

---

## Data Flow Overview

### Step 1: BigQuery (Source of Truth)

All original data lives in Google BigQuery tables:

```
BigQuery Dataset: turing-gpt.prod_labeling_tool_n

Key Tables:
├── conversation          → Task/conversation data
├── conversation_status_history → Every status change (who did what, when)
├── review                → Review records with scores
├── delivery_batch_task   → Which tasks are in delivery
├── contributor           → User information (trainers, reviewers)
```

### Step 2: Data Sync to PostgreSQL

Every 60 minutes, data is synced from BigQuery to PostgreSQL:

```
BigQuery Tables → Data Sync Service → PostgreSQL Tables

Key PostgreSQL Tables (used by dashboard):
├── task_history_raw      → Complete status history
├── task_raw              → Current task state
├── trainer_review_stats  → Reviews attributed to trainers
├── jibble_hours          → Logged working hours
├── pod_lead_mapping      → Trainer ↔ POD Lead mapping
```

### Step 3: Dashboard API

The frontend calls backend API endpoints that query PostgreSQL and calculate metrics.

```
Frontend → API Call → Query Service → PostgreSQL → Response
```

---

## Task-Level Metrics

Task-level metrics appear when you expand a trainer row in the Projects Tab. Each row represents a single task that the trainer worked on.

---

### 1. Task ID

**What is it?**  
The unique identifier for each task/conversation.

**Where does it come from?**
- Table: `task_history_raw`
- Column: `task_id`

**How is it displayed?**  
As a clickable link: `https://labeling-n.turing.com/conversations/{task_id}/view`

**Example:**
```
Task ID: 55288
Link: https://labeling-n.turing.com/conversations/55288/view
```

---

### 2. Unique Tasks (UNIQ)

**What is it?**  
At task level, this is always `1` because you're looking at a single task.

**Calculation:**
```
UNIQ = 1 (constant for task level)
```

**Why does this column exist at task level?**  
To maintain consistent column structure across all hierarchy levels.

---

### 3. New Task (NEW)

**What is it?**  
Indicates whether this was the FIRST time this task was ever completed by anyone.

**Where does the data come from?**
- Table: `task_history_raw`
- Column: `completed_status_count`

**How is `completed_status_count` calculated?**  
It's a running count of how many times a task has been completed, calculated in BigQuery:

```sql
-- BigQuery Query (inside sync_task_history_raw)
COUNTIF(th.new_status = 'completed') OVER (
    PARTITION BY th.conversation_id
    ORDER BY th.created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS completed_status_count
```

**What this means:**
- When Trainer A completes Task 100 for the first time → `completed_status_count = 1` → **NEW**
- When Trainer B (or A) completes Task 100 again → `completed_status_count = 2` → **REWORK**

**Calculation:**
```
IF completed_status_count = 1 THEN
    is_new = TRUE
    Display: "1"
ELSE
    is_new = FALSE
    Display: "-"
```

**Example:**

```
Task 55288 History (from task_history_raw):
┌─────────┬─────────────────────┬────────────┬───────────────────────────┐
│ task_id │ time_stamp          │ new_status │ completed_status_count    │
├─────────┼─────────────────────┼────────────┼───────────────────────────┤
│ 55288   │ 2026-01-15 10:00:00 │ completed  │ 1 ← First completion      │
│ 55288   │ 2026-01-18 14:00:00 │ completed  │ 2 ← Second completion     │
│ 55288   │ 2026-02-06 09:00:00 │ completed  │ 9 ← Aman's completion     │
└─────────┴─────────────────────┴────────────┴───────────────────────────┘

For Aman (who completed it when count was 9):
- completed_status_count = 9
- is_new = FALSE (because 9 > 1)
- NEW column displays: "-"
```

**Full BigQuery Query for Task History:**

```sql
SELECT 
    th.conversation_id AS task_id,
    th.created_at AS time_stamp,
    DATE(TIMESTAMP(th.created_at)) AS date,
    th.old_status,
    th.new_status,
    c.turing_email AS author,
    -- This counts completions up to and including current row
    COUNTIF(th.new_status = 'completed') OVER (
        PARTITION BY th.conversation_id
        ORDER BY th.created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS completed_status_count,
    pr.project_id
FROM `turing-gpt.prod_labeling_tool_n.conversation_status_history` th
LEFT JOIN `turing-gpt.prod_labeling_tool_n.contributor` c 
    ON th.author_id = c.id
INNER JOIN (
    SELECT t.id, t.project_id, b.name AS batch_name
    FROM `turing-gpt.prod_labeling_tool_n.conversation` t
    INNER JOIN `turing-gpt.prod_labeling_tool_n.batch` b ON t.batch_id = b.id
    WHERE t.project_id IN (36, 37, 38, 39)
      AND b.status != 'draft'
) pr ON pr.id = th.conversation_id
ORDER BY task_id, time_stamp
```

---

### 4. Rework Count (RWK)

**What is it?**  
The number of times THIS TRAINER completed this task as rework (not new).

**Where does the data come from?**
- Table: `task_history_raw`
- Filter: `author = trainer_email` AND `completed_status_count > 1`

**Calculation:**
```
rework_count = COUNT of completions by this trainer WHERE completed_status_count > 1
```

**Example:**

```
Task 55147 - Trainer: parth.p@turing.com

task_history_raw records for Parth on this task:
┌─────────┬────────────────────────┬────────────┬───────────────────────────┐
│ task_id │ author                 │ new_status │ completed_status_count    │
├─────────┼────────────────────────┼────────────┼───────────────────────────┤
│ 55147   │ parth.p@turing.com     │ completed  │ 1 ← NEW                   │
│ 55147   │ parth.p@turing.com     │ completed  │ 2 ← REWORK                │
└─────────┴────────────────────────┴────────────┴───────────────────────────┘

Calculation for Parth:
- Total completions by Parth: 2
- Completions where count = 1: 1 (this was NEW)
- Completions where count > 1: 1 (this was REWORK)

Result:
- is_new = TRUE (first completion was by Parth)
- rework_count = 1
```

**Backend Code (query_service.py):**
```python
# For each task, track completions by this trainer
for event in completion_events:
    task_id = event.task_id
    trainer = event.author
    count = event.completed_status_count
    
    if count == 1:
        is_new = True
        rework_count = 0
    else:
        is_new = False
        rework_count += 1
```

---

### 5. Delivered (DEL)

**What is it?**  
Whether this task has been delivered to the client.

**Where does the data come from?**
- Table: `task_raw`
- Column: `delivery_status`

**Calculation:**
```
IF delivery_status = 'delivered' THEN
    Display: "1"
ELSE
    Display: "-"
```

**How is `delivery_status` populated?**

BigQuery query joins `delivery_batch_task` with `delivery_batch`:

```sql
-- Part of sync_task_raw query
WITH task_delivery AS (
    SELECT 
        dbt.task_id, 
        db.name AS delivery_batch_name,  
        db.status AS delivery_status
    FROM `turing-gpt.prod_labeling_tool_n.delivery_batch_task` dbt 
    LEFT JOIN `turing-gpt.prod_labeling_tool_n.delivery_batch` db 
        ON db.id = dbt.delivery_batch_id
)
SELECT 
    t.id AS task_id,
    td.delivery_status
FROM conversation t
LEFT JOIN task_delivery td ON td.task_id = t.id
```

**Example:**
```
Task 55288:
- delivery_status = 'delivered'
- DEL column displays: "1"

Task 55300:
- delivery_status = NULL (not in any delivery batch)
- DEL column displays: "-"
```

---

### 6. In Queue (QUEUE)

**What is it?**  
Whether this task is in a delivery batch but NOT yet delivered.

**Where does the data come from?**
- Table: `task_raw`
- Columns: `delivery_batch_name`, `delivery_status`

**Calculation:**
```
IF delivery_batch_name IS NOT NULL AND delivery_status != 'delivered' THEN
    is_in_queue = TRUE
    Display: "1"
ELSE
    is_in_queue = FALSE
    Display: "-"
```

**Important Note:**  
"In Queue" shows CURRENT status. It does NOT respect date filters. If you filter by last week, you still see current queue status.

**Example:**
```
Task 55400:
- delivery_batch_name = "Batch_2026_W5"
- delivery_status = 'pending'
- QUEUE column displays: "1" (in queue, waiting for delivery)

Task 55288:
- delivery_batch_name = "Batch_2026_W3"
- delivery_status = 'delivered'
- QUEUE column displays: "-" (already delivered)
```

---

### 7. Reviews (REV)

**What is it?**  
The total number of manual reviews on this task.

**Where does the data come from?**
- Table: `task_raw`
- Column: `count_reviews`

**How is `count_reviews` populated?**

BigQuery counts published manual reviews:

```sql
-- Part of sync_task_raw query
WITH review_stats AS (
    SELECT 
        conversation_id AS conversation_id_rs, 
        COUNT(id) AS count_reviews, 
        SUM(score) AS sum_score
    FROM `turing-gpt.prod_labeling_tool_n.review`
    WHERE review_type = 'manual' 
      AND status = 'published'
    GROUP BY conversation_id
)
SELECT 
    t.id AS task_id,
    rs.count_reviews,
    rs.sum_score
FROM conversation t
LEFT JOIN review_stats rs ON rs.conversation_id_rs = t.id
```

**Example:**
```
Task 55288:
- Had 3 review cycles (rejected twice, approved once)
- count_reviews = 3
- REV column displays: "3"
```

---

### 8. Rating (RATE)

**What is it?**  
The average review score for this task.

**Where does the data come from?**
- Table: `task_raw`
- Columns: `sum_score`, `count_reviews`

**Calculation:**
```
IF count_reviews > 0 THEN
    avg_rating = sum_score / count_reviews
ELSE
    avg_rating = NULL
```

**Example:**
```
Task 55288:
- Reviews: 3.2, 3.8, 4.5
- sum_score = 3.2 + 3.8 + 4.5 = 11.5
- count_reviews = 3
- avg_rating = 11.5 / 3 = 3.83

RATE column displays: "3.83"
```

---

### 9. Agentic Reviews (AGT)

**What is it?**  
The number of auto-generated (agentic) reviews on this task, attributed to this trainer.

**Where does the data come from?**
- Table: `trainer_review_stats`
- Filter: `task_id = X` AND `trainer_email = Y` AND `review_type = 'auto'`

**Why use `trainer_review_stats` instead of `task_raw`?**  
Because we need to attribute reviews to the TRAINER who did the work, not just count total reviews on the task.

**BigQuery Query for Trainer Review Stats:**

```sql
WITH completions AS (
    -- All completion events with trainer info
    SELECT 
        csh.conversation_id,
        csh.created_at as completion_time,
        c.turing_email as trainer_email
    FROM conversation_status_history csh
    JOIN contributor c ON csh.author_id = c.id
    WHERE csh.new_status = 'completed'
      AND csh.old_status != 'completed-approval'
),
reviews AS (
    -- All published reviews (manual and auto)
    SELECT 
        r.id as review_id,
        r.conversation_id,
        r.score,
        r.created_at as review_time,
        r.review_type  -- 'manual' or 'auto'
    FROM review r
    WHERE r.status = 'published'
      AND r.review_type IN ('manual', 'auto')
)
-- Match each review to the completion that triggered it
SELECT 
    r.review_id,
    r.conversation_id as task_id,
    c.trainer_email,  -- WHO gets credit for this review
    r.score,
    r.review_type
FROM reviews r
JOIN completions c 
    ON c.conversation_id = r.conversation_id
    AND c.completion_time <= r.review_time  -- Review came after completion
WHERE c.completion_time = (
    -- Get the MOST RECENT completion before this review
    SELECT MAX(c2.completion_time)
    FROM completions c2
    WHERE c2.conversation_id = r.conversation_id
      AND c2.completion_time <= r.review_time
)
```

**Example:**
```
Task 55288:
- Trainer A completes → Auto review (score 4.0)
- Trainer A reworks → Auto review (score 4.2)
- Trainer B reworks → Auto review (score 4.5)

Attribution:
- Trainer A: 2 agentic reviews
- Trainer B: 1 agentic review
```

---

### 10. Agentic Rating (AGTR)

**What is it?**  
The average score of agentic reviews attributed to this trainer for this task.

**Calculation:**
```
agentic_rating = SUM(agentic_scores) / COUNT(agentic_reviews)
```

**Example:**
```
Trainer A on Task 55288:
- Agentic review 1: score = 4.0
- Agentic review 2: score = 4.2

agentic_rating = (4.0 + 4.2) / 2 = 4.1
AGTR column displays: "4.10"
```

---

### 11. Rework Percent (R%)

**What is it?**  
What percentage of this trainer's submissions on this task were rework.

**Where does the data come from?**
- Calculated from: `is_new`, `rework_count`

**Calculation:**
```
total_submissions = (1 if is_new else 0) + rework_count

IF total_submissions > 0 THEN
    rework_percent = (rework_count / total_submissions) × 100
ELSE
    rework_percent = 0
```

**Example 1: Task was NEW for this trainer**
```
Task 55147 - Trainer: parth.p@turing.com
- is_new = TRUE (first completion was by Parth)
- rework_count = 1 (Parth also did 1 rework)
- total_submissions = 1 + 1 = 2
- rework_percent = (1 / 2) × 100 = 50%

R% column displays: "50%"
```

**Example 2: Task was REWORK for this trainer**
```
Task 55288 - Trainer: aman.k3@turing.com
- is_new = FALSE (Aman wasn't the first to complete)
- rework_count = 1 (Aman did 1 rework)
- total_submissions = 0 + 1 = 1
- rework_percent = (1 / 1) × 100 = 100%

R% column displays: "100%"
```

---

### 12. AHT (Average Handle Time)

**What is it?**  
The actual time (in minutes) the task took from start to completion.

**Where does the data come from?**
- Table: `task_raw`
- Column: `task_duration`

**How is `task_duration` populated?**

BigQuery calculates the time between `pending→labeling` and `labeling→completed`:

```sql
WITH task_transitions AS (
    SELECT
        csh.conversation_id AS task_id,
        csh.old_status,
        csh.new_status,
        csh.created_at
    FROM conversation_status_history csh
),
aht_calculation AS (
    SELECT
        t1.task_id,
        t1.created_at AS start_time,    -- pending → labeling
        t2.created_at AS end_time,      -- labeling → completed
        TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) AS duration_seconds
    FROM task_transitions t1
    JOIN task_transitions t2
        ON t1.task_id = t2.task_id
        AND t1.old_status = 'pending'
        AND t1.new_status = 'labeling'
        AND t2.old_status = 'labeling'
        AND t2.new_status = 'completed'
    WHERE TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) <= 10800  -- Max 3 hours
)
SELECT 
    task_id,
    duration_seconds / 60.0 AS duration_minutes
FROM aht_calculation
```

**Example:**
```
Task 55288:
- Started labeling: 2026-02-06 09:15:00
- Completed: 2026-02-06 09:45:00
- Duration: 30 minutes

AHT column displays: "30"
```

---

### 13. Accounted Hours (ACCT)

**What is it?**  
The "credited" hours for this task based on a formula, NOT actual time spent.

**Why use this instead of actual time?**  
To normalize productivity. Some tasks naturally take longer, but all NEW tasks are credited the same, and all REWORK submissions are credited the same.

**Configuration Values:**
```
NEW_TASK_AHT = 10.0 hours (credit for completing a new task)
REWORK_AHT = 4.0 hours (credit for each rework submission)
```

**Calculation:**
```
IF is_new THEN
    new_task_credit = 10.0 hours
ELSE
    new_task_credit = 0

rework_credit = rework_count × 4.0 hours

accounted_hours = new_task_credit + rework_credit
```

**Example 1: NEW task with 1 rework**
```
Task 55147 - Trainer: parth.p@turing.com
- is_new = TRUE
- rework_count = 1

accounted_hours = 10.0 + (1 × 4.0) = 14.0 hours
ACCT column displays: "14.0"
```

**Example 2: REWORK only**
```
Task 55288 - Trainer: aman.k3@turing.com
- is_new = FALSE
- rework_count = 1

accounted_hours = 0 + (1 × 4.0) = 4.0 hours
ACCT column displays: "4.0"
```

---

## Trainer-Level Metrics

Trainer metrics appear in the TrainerWise tab and when expanding POD Lead rows. These AGGREGATE all tasks worked on by this trainer.

---

### 1. Unique Tasks (UNIQ)

**What is it?**  
The number of DISTINCT tasks this trainer worked on.

**Why "unique"?**  
A trainer might complete a task multiple times (rework), but we count it once.

**Where does the data come from?**
- Table: `task_history_raw`
- Filter: `author = trainer_email` AND `new_status = 'completed'`

**Calculation:**
```sql
COUNT(DISTINCT task_id) WHERE author = 'trainer@email.com'
```

**BigQuery/PostgreSQL Query:**
```sql
SELECT 
    author AS trainer_email,
    COUNT(DISTINCT task_id) AS unique_tasks
FROM task_history_raw
WHERE new_status = 'completed'
  AND old_status != 'completed-approval'
  AND author IS NOT NULL
  AND project_id IN (36, 37, 38, 39)
GROUP BY author
```

**Example:**
```
Trainer: parth.p@turing.com
Tasks worked on:
- Task 55147 (completed 2 times)
- Task 55191 (completed 1 time)
- Task 55288 (completed 3 times)

unique_tasks = 3 (not 6!)
UNIQ column displays: "3"
```

---

### 2. New Tasks (NEW)

**What is it?**  
The number of times this trainer made a FIRST completion (was the first person to ever complete a task).

**Where does the data come from?**
- Table: `task_history_raw`
- Filter: `author = trainer_email` AND `completed_status_count = 1`

**Calculation:**
```sql
SUM(CASE WHEN completed_status_count = 1 THEN 1 ELSE 0 END)
WHERE author = 'trainer@email.com'
```

**PostgreSQL Query:**
```sql
SELECT 
    author AS trainer_email,
    SUM(CASE WHEN completed_status_count = 1 THEN 1 ELSE 0 END) AS new_tasks
FROM task_history_raw
WHERE new_status = 'completed'
  AND old_status != 'completed-approval'
  AND author IS NOT NULL
GROUP BY author
```

**Example:**
```
Trainer: parth.p@turing.com
Completion events:
┌─────────┬───────────────────────────┐
│ task_id │ completed_status_count    │
├─────────┼───────────────────────────┤
│ 55147   │ 1 ← NEW                   │
│ 55147   │ 2                         │
│ 55191   │ 1 ← NEW                   │
│ 55288   │ 5                         │
│ 55288   │ 6                         │
│ 55288   │ 7                         │
└─────────┴───────────────────────────┘

new_tasks = 2 (only count where completed_status_count = 1)
NEW column displays: "2"
```

---

### 3. Rework (RWK)

**What is it?**  
The number of times this trainer completed a task that was NOT a first completion.

**Where does the data come from?**
- Table: `task_history_raw`
- Filter: `author = trainer_email` AND `completed_status_count > 1`

**Calculation:**
```sql
SUM(CASE WHEN completed_status_count > 1 THEN 1 ELSE 0 END)
WHERE author = 'trainer@email.com'
```

**Example (continuing from above):**
```
Trainer: parth.p@turing.com
Completion events:
- 55147 count=1 → NEW
- 55147 count=2 → REWORK
- 55191 count=1 → NEW
- 55288 count=5 → REWORK
- 55288 count=6 → REWORK
- 55288 count=7 → REWORK

rework = 4 (count where completed_status_count > 1)
RWK column displays: "4"
```

---

### 4. Delivered (DEL)

**What is it?**  
The number of delivered tasks where this trainer was the LAST person to complete.

**Why "last completer"?**  
The person who did the final work before delivery gets credit.

**Where does the data come from?**
- Tables: `task_raw`, `task_history_raw`
- Logic: Find tasks where `delivery_status = 'delivered'`, then find who made the last completion

**Calculation Steps:**

1. Get all delivered task IDs:
```sql
SELECT task_id FROM task_raw WHERE delivery_status = 'delivered'
```

2. For each delivered task, find the LAST completer:
```sql
SELECT task_id, author AS last_completer
FROM task_history_raw
WHERE new_status = 'completed'
  AND task_id IN (delivered_task_ids)
ORDER BY time_stamp DESC
LIMIT 1 PER TASK
```

3. Count delivered tasks per trainer:
```sql
COUNT where last_completer = trainer_email
```

**Example:**
```
Task 55288 delivery history:
- Trainer A completes (count=1)
- Trainer A reworks (count=2)
- Trainer B reworks (count=3) ← LAST COMPLETER
- Task gets delivered

Attribution:
- Trainer B gets credit for this delivered task
- Trainer A gets 0 delivered credit (even though they did most work)

Why? The person who finalized the work gets delivery credit.
```

---

### 5. In Queue (QUEUE)

**What is it?**  
The number of tasks in delivery queue where this trainer was the last completer.

**Same logic as Delivered**, but filtering for:
```sql
WHERE delivery_batch_name IS NOT NULL 
  AND delivery_status != 'delivered'
```

**Important:** No date filter is applied to In Queue - it always shows CURRENT queue status.

---

### 6. Total Reviews (REV)

**What is it?**  
The number of reviews received by this trainer (for work they did).

**Where does the data come from?**
- Table: `trainer_review_stats`
- Filter: `trainer_email = X` AND `review_type = 'manual'`

**Key Concept - Review Attribution:**

Reviews are attributed to the trainer who did the work being reviewed, NOT the current task owner.

**Example of why this matters:**
```
Task 55288:
1. Trainer A completes → Reviewer gives score 3.0
2. Task reassigned to Trainer B (but B hasn't touched it)
3. Current owner = Trainer B

WITHOUT attribution: Review would go to Trainer B (wrong!)
WITH attribution: Review goes to Trainer A (correct!)
```

**PostgreSQL Query:**
```sql
SELECT 
    trainer_email,
    COUNT(review_id) AS total_reviews,
    SUM(score) AS total_score
FROM trainer_review_stats
WHERE review_type = 'manual' OR review_type IS NULL
  AND score IS NOT NULL
GROUP BY trainer_email
```

---

### 7. Rating (RATE)

**What is it?**  
The average review score this trainer received.

**Calculation:**
```
avg_rating = total_score / total_reviews
```

**Example:**
```
Trainer: parth.p@turing.com
Reviews received: 3.5, 4.0, 4.2, 3.8, 4.5

total_score = 3.5 + 4.0 + 4.2 + 3.8 + 4.5 = 20.0
total_reviews = 5
avg_rating = 20.0 / 5 = 4.0

RATE column displays: "4.00"
```

---

### 8. Agentic Reviews (AGT) & Agentic Rating (AGTR)

Same as task level, but aggregated across all tasks:

```sql
SELECT 
    trainer_email,
    COUNT(review_id) AS agentic_reviews,
    SUM(score) / COUNT(review_id) AS agentic_rating
FROM trainer_review_stats
WHERE review_type = 'auto'
GROUP BY trainer_email
```

---

### 9. Avg Rework (AVGR)

**What is it?**  
On average, how many times does each unique task get completed by this trainer?

**Intuition:**  
If AVGR = 2.5, it means on average each task is completed 2.5 times (original + 1.5 reworks).

**Calculation:**
```
total_submissions = new_tasks + rework
avg_rework = (total_submissions / unique_tasks) - 1

The "-1" removes the initial completion from the average
```

**Example:**
```
Trainer: parth.p@turing.com
- unique_tasks = 3
- new_tasks = 2
- rework = 4
- total_submissions = 2 + 4 = 6

avg_rework = (6 / 3) - 1 = 2 - 1 = 1.0

This means: On average, each task was reworked 1 time after initial completion.
AVGR column displays: "1.00"
```

---

### 10. Rework Percent (R%)

**What is it?**  
What percentage of this trainer's submissions were rework (not new work)?

**Calculation:**
```
rework_percent = (rework / (new_tasks + rework)) × 100
```

**Example:**
```
Trainer: parth.p@turing.com
- new_tasks = 2
- rework = 4
- total_submissions = 6

rework_percent = (4 / 6) × 100 = 66.67%
R% column displays: "66.67%"
```

---

### 11. Merged AHT (AHT)

**What is it?**  
The expected hours per submission, based on the mix of new tasks vs rework.

**Calculation:**
```
merged_aht = (new_tasks × NEW_TASK_AHT + rework × REWORK_AHT) / total_submissions

Where:
- NEW_TASK_AHT = 10.0 hours
- REWORK_AHT = 4.0 hours
```

**Example:**
```
Trainer: parth.p@turing.com
- new_tasks = 2
- rework = 4
- NEW_TASK_AHT = 10.0
- REWORK_AHT = 4.0

merged_aht = (2 × 10.0 + 4 × 4.0) / 6
           = (20 + 16) / 6
           = 36 / 6
           = 6.0 hours

AHT column displays: "6.00"
```

---

### 12. Jibble Hours (JIB)

**What is it?**  
The actual hours this trainer logged in Jibble (time tracking system).

**Where does the data come from?**
- Table: `jibble_hours`
- Matched by trainer email or name

**How is matching done?**

1. Try to match by email:
```sql
SELECT SUM(logged_hours)
FROM jibble_hours
WHERE LOWER(turing_email) = LOWER(trainer_email)
```

2. If no match, try by name via `pod_lead_mapping`:
```sql
SELECT SUM(jh.logged_hours)
FROM jibble_hours jh
JOIN pod_lead_mapping pm ON LOWER(jh.full_name) = LOWER(pm.jibble_name)
WHERE pm.trainer_email = trainer_email
```

**Example:**
```
Trainer: parth.p@turing.com
Jibble entries (Jan 27 - Feb 6):
- Jan 27: 8.5 hours
- Jan 28: 7.0 hours
- Jan 29: 9.0 hours
...

Total: 45.5 hours
JIB column displays: "45.5"
```

---

### 13. Accounted Hours (ACCT)

**What is it?**  
The total "credited" hours based on new tasks and rework count.

**Calculation:**
```
accounted_hours = (new_tasks × NEW_TASK_AHT) + (rework × REWORK_AHT)
```

**Example:**
```
Trainer: parth.p@turing.com
- new_tasks = 2
- rework = 4

accounted_hours = (2 × 10.0) + (4 × 4.0)
                = 20 + 16
                = 36.0 hours

ACCT column displays: "36.0"
```

---

### 14. Efficiency (EFF%)

**What is it?**  
How much of the trainer's logged time was "productive" (resulted in completed work).

**Calculation:**
```
efficiency = (accounted_hours / jibble_hours) × 100
```

**Interpretation:**
- **100%+**: Trainer completed more work than expected for time logged (very efficient)
- **70-100%**: Normal efficiency
- **<70%**: Below expected productivity

**Example:**
```
Trainer: parth.p@turing.com
- accounted_hours = 36.0
- jibble_hours = 45.5

efficiency = (36.0 / 45.5) × 100 = 79.1%

EFF% column displays: "79.1%"
Color: Yellow (between 70-90%)
```

---

## POD Lead-Level Metrics

POD Lead metrics AGGREGATE all trainers under that POD Lead.

---

### Key Concept: Aggregation

Most POD Lead metrics are simply sums of trainer metrics:

```
POD_LEAD.unique_tasks = SUM(trainer.unique_tasks) for all trainers under this POD Lead
POD_LEAD.new_tasks = SUM(trainer.new_tasks)
POD_LEAD.rework = SUM(trainer.rework)
POD_LEAD.delivered = SUM(trainer.delivered)
POD_LEAD.in_queue = SUM(trainer.in_queue)
POD_LEAD.total_reviews = SUM(trainer.total_reviews)
```

### Weighted Average Metrics

Some metrics use weighted averages:

**Rating (RATE):**
```
pod_lead_rating = SUM(trainer.total_score) / SUM(trainer.total_reviews)
```

This gives more weight to trainers with more reviews.

**Example:**
```
POD Lead: sardar.r1@turing.com
Trainers:
- Trainer A: 10 reviews, avg rating 4.0, total_score = 40
- Trainer B: 2 reviews, avg rating 5.0, total_score = 10

Simple average: (4.0 + 5.0) / 2 = 4.5 ← WRONG
Weighted average: (40 + 10) / (10 + 2) = 50 / 12 = 4.17 ← CORRECT
```

### Calculated Metrics

**Avg Rework (AVGR):**
```
total_submissions = SUM(trainer.new_tasks) + SUM(trainer.rework)
avg_rework = (total_submissions / SUM(trainer.unique_tasks)) - 1
```

**Rework Percent (R%):**
```
rework_percent = SUM(trainer.rework) / total_submissions × 100
```

### "No Pod Lead" Category

Trainers without a POD Lead mapping are grouped under "No Pod Lead":

```python
# In query_service.py
if trainer_email not in trainer_to_pod_mapping:
    # Add to "No Pod Lead" category
    unmapped_trainers.add(trainer_email)
```

This appears with an info tooltip: "These trainers have no POD Lead mapping in the sheet."

---

## Project-Level Metrics

Project metrics aggregate all POD Leads (and thus all trainers) under that project.

---

### CRITICAL: True Unique Tasks

**Problem with simple aggregation:**

If Trainer A and Trainer B both work on Task 55288:
- Trainer A: unique_tasks = 1
- Trainer B: unique_tasks = 1
- Simple SUM = 2 ← WRONG! It's still just 1 task.

**Solution:**

At project level, we query unique tasks DIRECTLY:

```sql
SELECT COUNT(DISTINCT task_id) AS true_unique_tasks
FROM task_history_raw
WHERE new_status = 'completed'
  AND project_id = 36
```

**Backend Code:**
```python
# query_service.py - get_project_stats_with_pod_leads()
project_true_unique = session.query(
    func.count(distinct(TaskHistoryRaw.task_id))
).filter(
    TaskHistoryRaw.new_status == 'completed',
    TaskHistoryRaw.old_status != 'completed-approval',
    TaskHistoryRaw.project_id == project_id
).scalar()

# This prevents overcounting!
```

### Jibble Hours Project Swap

**The Problem:**

Projects 37 (Multichallenge) and 39 (CFBench) have swapped Jibble data due to a historical data entry issue.

**The Solution:**

```python
# constants.py
JIBBLE_PROJECT_SWAP = {
    37: 39,  # Multichallenge uses CFBench Jibble hours
    39: 37,  # CFBench uses Multichallenge Jibble hours
}

# When querying Jibble hours for project 37, actually query project 39's data
```

---

## Other Tabs

### DomainWise Tab

Shows task distribution by domain (extracted from task statement).

**Domain Extraction Query:**
```sql
CASE 
    WHEN REGEXP_CONTAINS(statement, r'\*\*domain\*\*') THEN
        TRIM(REGEXP_EXTRACT(statement, r'\*\*domain\*\*\s*-\s*([^\n]+)'))
    WHEN REGEXP_CONTAINS(statement, r'\*\*suggested-domain\*\*') THEN
        TRIM(REGEXP_EXTRACT(statement, r'\*\*suggested-domain\*\*\s*-\s*([^\n]+)'))
    ELSE NULL
END AS domain
```

### ReviewerWise Tab

Shows statistics for reviewers (people who review trainer work).

**Key Metrics:**
- **Unique Tasks Reviewed**: Distinct tasks reviewed
- **New Tasks Reviewed**: Reviews on tasks where `completed_status_count ≤ 1`
- **Rework Reviewed**: Reviews on tasks where `completed_status_count > 1`

### TaskWise Tab

Shows individual task details with all quality dimension scores.

### RatingTrends Tab

Shows rating trends over time with:
- **Trends View**: Rating change over daily/weekly/monthly periods
- **Comparison View**: Compare two time periods

---

## Configuration Reference

### AHT Configuration (Updated Feb 2026)

| Setting | Default | Description |
|---------|---------|-------------|
| `NEW_TASK_AHT` | 10.0 hours | Credit for completing a new task (first completion) |
| `REWORK_AHT` | 4.0 hours | Credit for rework on a task (capped per task) |
| `MAX_REWORKS_TO_REWARD` | 1 | Maximum reworks credited per task per trainer |

**NEW Logic (Feb 2026):**

The AHT calculation was updated to prevent rewarding trainers for repeatedly failing to deliver quality work.

**Task-Level Accounted Hours:**
```
task_accounted = (10 if is_new else 0) + (4 × min(rework_count, MAX_REWORKS_TO_REWARD))
```

| Scenario | is_new | rework_count | Accounted Hours |
|----------|--------|--------------|-----------------|
| New task only | ✓ | 0 | 10 |
| New task + 1 rework | ✓ | 1 | 14 |
| New task + 5 reworks | ✓ | 5 | 14 (capped) |
| Rework only (1 submission) | ✗ | 1 | 4 |
| Rework only (3 submissions) | ✗ | 3 | 4 (capped) |

**Trainer-Level Accounted Hours:**
```
trainer_accounted = SUM(task_accounted for all tasks)
                  = (tasks_with_new × 10) + (tasks_with_rework × 4)
```

Where:
- `tasks_with_new` = count of unique tasks where trainer did the first completion
- `tasks_with_rework` = count of unique tasks where trainer did at least 1 rework

**Merged Expected AHT:**
```
merged_aht = accounted_hours / unique_tasks
```

This gives the average accounted hours per unique task worked on.

**Why this change?**
- Previously: Each rework event = 4 hours (trainer doing 5 reworks = 20 hours)
- Now: First rework = 4 hours, subsequent reworks = 0 hours (capped at 4 total)
- This prevents gaming the system by doing multiple low-quality reworks

These can be configured per-project via the Configuration page.

### Color Coding Thresholds

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Efficiency (EFF%) | ≥90% | 70-90% | <70% |
| Rating (RATE) | >4.8 | 4.0-4.8 | <4.0 |
| Rework % (R%) | ≤10% | 10-30% | >30% |
| Avg Rework (AVGR) | <1.0 | 1.0-2.5 | >2.5 |

### Project ID Mapping

| Project ID | Project Name | Jibble Names |
|------------|--------------|--------------|
| 36 | Nvidia - SysBench | "Nvidia - SysBench", "Nvidia - ICPC", "NVIDIA_STEM Math_Eval" |
| 37 | Nvidia - Multichallenge | "Nvidia - Multichallenge", "Nvidia - Multichallenge Advanced" |
| 38 | Nvidia - InverseIFEval | "Nvidia - InverseIFEval" |
| 39 | Nvidia - CFBench Multilingual | "Nvidia - CFBench Multilingual" |

---

## Glossary

| Term | Definition |
|------|------------|
| **Author** | The trainer who made a specific status transition (from `task_history_raw.author`) |
| **Completed Status Count** | Running count of how many times a task has been completed |
| **Attribution** | The process of giving credit to the correct trainer |
| **First Completer** | The trainer who first completed a task (`completed_status_count = 1`) |
| **Last Completer** | The trainer who most recently completed a task |
| **Merged AHT** | Average accounted hours per unique task: `accounted_hours / unique_tasks` |
| **tasks_with_rework** | Count of unique tasks where trainer did at least 1 rework |
| **True Unique Tasks** | Direct count at project level to prevent overcounting |
| **Agentic Review** | Auto-generated review (`review_type = 'auto'`) |

---

## Quick Reference

### How to trace a metric issue

1. **Identify the level**: Task, Trainer, POD Lead, or Project?
2. **Find the source table**: Usually `task_history_raw` or `trainer_review_stats`
3. **Check attribution**: Is credit going to the right person?
4. **Verify aggregation**: Are sums/averages calculated correctly?

### Common debugging queries

**Check trainer completions:**
```sql
SELECT task_id, time_stamp, completed_status_count
FROM task_history_raw
WHERE author = 'trainer@email.com'
  AND new_status = 'completed'
ORDER BY time_stamp DESC;
```

**Check review attribution:**
```sql
SELECT task_id, trainer_email, score, review_type
FROM trainer_review_stats
WHERE task_id = 55288;
```

**Check delivery status:**
```sql
SELECT task_id, delivery_batch_name, delivery_status
FROM task_raw
WHERE task_id = 55288;
```

---

*End of Documentation*
