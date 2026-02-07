# Task-Level Data Analysis

## Overview

This document analyzes the database models to understand what task-level data is available and how to calculate task-level metrics.

**Date**: February 6, 2026  
**Models Analyzed**: `TaskRaw`, `TaskHistoryRaw`, `Task`, `ReviewDetail`, `TaskAHT`

---

## 1. TaskRaw Model - Primary Task Data Source

The `TaskRaw` model (lines 313-371 in `db_models.py`) is the **primary source** for task-level metrics. It mirrors the spreadsheet's `tasks_raw` sheet exactly.

### Available Fields

#### Basic Task Information
- **`task_id`** (BigInteger, Primary Key) - Unique task identifier (conversation_id)
- **`created_date`** (Date) - When the task was created
- **`updated_at`** (DateTime) - Last update timestamp
- **`last_completed_at`** (DateTime) - Last completion timestamp
- **`last_completed_date`** (Date, indexed) - Date of last completion
- **`task_status`** (String(50), indexed) - Current task status
- **`derived_status`** (String(50), indexed) - Calculated status based on task_status and review info
- **`project_id`** (Integer) - Project identifier
- **`batch_name`** (String(255)) - Batch name
- **`colab_link`** (Text) - Colab notebook link

#### Trainer Information
- **`trainer`** (String(255), indexed) - Current trainer email (Column F in spreadsheet)
- **`first_completion_date`** (Date) - Date of first completion
- **`first_completer`** (String(255)) - Email of trainer who first completed the task

#### Rework Tracking
- **`number_of_turns`** (Integer, default=0) - Number of times task was resubmitted (Column AS in spreadsheet)
  - **0** = New task (first submission)
  - **>0** = Rework (indicates how many rework cycles)

#### Task Duration
- **`task_duration`** (Integer) - Task duration in seconds

#### Delivery Information
- **`delivery_batch_name`** (String(255)) - Name of delivery batch
- **`delivery_status`** (String(50)) - Delivery status
- **`delivery_batch_created_by`** (String(255)) - Who created the delivery batch
- **`db_open_date`** (Date) - Delivery batch open date
- **`db_close_date`** (Date) - Delivery batch close date

#### Review Statistics (Aggregated)
- **`conversation_id_rs`** (BigInteger) - Conversation ID for review stats
- **`count_reviews`** (Integer, default=0) - **Total number of reviews** performed on this task
- **`sum_score`** (Float) - Sum of all review scores
- **`sum_ref_score`** (Float) - Sum of reflected scores
- **`sum_duration`** (Integer) - Total review duration
- **`sum_followup_required`** (Integer, default=0) - Count of reviews that required follow-up

#### Latest Review Information
- **`task_id_r`** (BigInteger) - Task ID for latest review
- **`r_created_at`** (DateTime) - Latest review creation time
- **`r_updated_at`** (DateTime) - Latest review update time
- **`review_id`** (BigInteger) - Latest review ID
- **`reviewer`** (String(255)) - Latest reviewer email
- **`score`** (Float) - **Latest review score**
- **`reflected_score`** (Float) - Latest reflected score
- **`review_action`** (Text) - Latest review action text
- **`review_action_type`** (String(50)) - Latest review action type ('delivery', 'rework', etc.)
- **`r_feedback`** (Text) - Latest review feedback
- **`followup_required`** (Integer, default=0) - Whether latest review requires follow-up (0=approved, 1=sent to rework)
- **`r_duration`** (Integer) - Latest review duration
- **`r_submitted_at`** (DateTime) - Latest review submission time
- **`r_submitted_date`** (Date) - Latest review submission date

---

## 2. TaskHistoryRaw Model - Task Event Tracking

The `TaskHistoryRaw` model (lines 289-311 in `db_models.py`) tracks **every status transition** for each task.

### Available Fields

- **`id`** (Integer, Primary Key, autoincrement)
- **`task_id`** (BigInteger, indexed) - Conversation ID
- **`time_stamp`** (DateTime) - When the transition occurred
- **`date`** (Date, indexed) - Date of transition
- **`old_status`** (String(50)) - Previous status
- **`new_status`** (String(50), indexed) - New status after transition
- **`notes`** (Text) - Transition notes
- **`author`** (String(255), indexed) - **Who made the transition** (turing_email)
- **`completed_status_count`** (Integer, default=0) - **Running count of completed status transitions**
  - **Key field for determining new vs rework!**
  - **1** = First completion (New Task)
  - **>1** = Subsequent completion (Rework)
- **`last_completed_date`** (Date) - Date of last completion
- **`project_id`** (Integer) - Project identifier
- **`batch_name`** (String(255)) - Batch name

### Key Use Cases

1. **Track task lifecycle**: See all status changes (pending → labeling → completed → rework → completed, etc.)
2. **Determine new vs rework**: Use `completed_status_count` field
3. **Attribute work correctly**: Use `author` field to know who made each transition
4. **Calculate submission dates**: Filter by `new_status = 'completed'` and `old_status != 'completed-approval'`

---

## 3. Task Model - Simplified Task View

The `Task` model (lines 18-45 in `db_models.py`) is a simplified view synced from BigQuery.

### Key Fields

- **`id`** (BigInteger, Primary Key) - Task ID
- **`created_at`** (DateTime, indexed)
- **`updated_at`** (DateTime, indexed)
- **`status`** (String(50), indexed) - Current status
- **`project_id`** (Integer, indexed)
- **`batch_id`** (Integer, indexed)
- **`current_user_id`** (Integer, ForeignKey) - Current task owner
- **`is_delivered`** (String(10), default='False', indexed) - Delivery status
- **`rework_count`** (Integer, default=0) - Number of rework cycles
- **`domain`** (String(255), indexed) - Task domain
- **`number_of_turns`** (Integer, default=0) - Rework count
- **`last_completed_date`** (Date, indexed)

### Relationships

- **`reviews`** - One-to-many relationship with `ReviewDetail` model

---

## 4. ReviewDetail Model - Individual Review Records

The `ReviewDetail` model (lines 48-78 in `db_models.py`) stores **individual review records** for each task.

### Available Fields

- **`id`** (Integer, Primary Key)
- **`review_id`** (Integer, indexed) - Review identifier
- **`conversation_id`** (BigInteger, ForeignKey to Task.id) - **Links to task**
- **`reviewer_id`** (Integer, ForeignKey) - Reviewer contributor ID
- **`reviewer`** (relationship) - Links to Contributor model
- **`score`** (Float) - Individual review score
- **`task_score`** (Float) - Task-level score
- **`score_text`** (String(50)) - Score as text
- **`quality_dimension_id`** (Integer) - Quality dimension being reviewed
- **`domain`** (String(255)) - Task domain
- **`is_delivered`** (String(10), default='False') - Delivery status
- **`name`** (String(255)) - Review name/description
- **`updated_at`** (Date, indexed) - Review update date

### How to Get Review Data Per Task

```python
# Query all reviews for a specific task
reviews = session.query(ReviewDetail).filter(
    ReviewDetail.conversation_id == task_id
).all()

# Get review count
review_count = session.query(func.count(ReviewDetail.id)).filter(
    ReviewDetail.conversation_id == task_id
).scalar()

# Get average score
avg_score = session.query(func.avg(ReviewDetail.score)).filter(
    ReviewDetail.conversation_id == task_id
).scalar()
```

**Or use TaskRaw aggregated fields:**
- `count_reviews` - Total review count
- `sum_score` - Sum of scores (divide by count_reviews for average)
- `score` - Latest review score

---

## 5. TaskAHT Model - Average Handle Time

The `TaskAHT` model (lines 164-187 in `db_models.py`) tracks **actual handling time** per task.

### Available Fields

- **`id`** (Integer, Primary Key)
- **`task_id`** (BigInteger, ForeignKey to Task.id) - **Links to task**
- **`contributor_id`** (Integer, ForeignKey) - Contributor who worked on task
- **`contributor_name`** (String(255)) - Contributor name
- **`batch_id`** (Integer, indexed) - Batch identifier
- **`start_time`** (DateTime) - When task started (pending→labeling transition)
- **`end_time`** (DateTime) - When task completed (labeling→completed transition)
- **`duration_seconds`** (Integer) - Duration in seconds
- **`duration_minutes`** (Float) - Duration in minutes

### How AHT is Calculated

AHT = Time from `pending → labeling` to `labeling → completed`

- Only counts transitions within 3 hours (10800 seconds)
- Uses the shortest duration if multiple transitions exist
- One record per task (shortest duration selected)

### How to Get AHT Per Task

```python
# Query AHT for a specific task
aht = session.query(TaskAHT).filter(
    TaskAHT.task_id == task_id
).first()

if aht:
    duration_minutes = aht.duration_minutes
    duration_seconds = aht.duration_seconds
```

---

## 6. Determining Task Metrics

### Is Task New or Rework?

**Method 1: Using TaskRaw.number_of_turns**
```python
# TaskRaw.number_of_turns:
#   0 = New task (first submission)
#   >0 = Rework (number indicates rework cycles)
is_new = task_raw.number_of_turns == 0
is_rework = task_raw.number_of_turns > 0
rework_count = task_raw.number_of_turns
```

**Method 2: Using TaskHistoryRaw.completed_status_count**
```python
# Query task history for completion events
completion = session.query(TaskHistoryRaw).filter(
    TaskHistoryRaw.task_id == task_id,
    TaskHistoryRaw.new_status == 'completed',
    TaskHistoryRaw.old_status != 'completed-approval'
).order_by(TaskHistoryRaw.completed_status_count.desc()).first()

if completion:
    is_new = completion.completed_status_count == 1
    is_rework = completion.completed_status_count > 1
    total_completions = completion.completed_status_count
    rework_submissions = completion.completed_status_count - 1  # Subtract 1 for new task
```

**Recommended**: Use `TaskRaw.number_of_turns` for simplicity, or `TaskHistoryRaw.completed_status_count` for detailed event tracking.

---

### How Many Rework Submissions?

**Using TaskRaw:**
```python
rework_submissions = task_raw.number_of_turns  # Direct count
```

**Using TaskHistoryRaw:**
```python
# Count completion events where completed_status_count > 1
rework_count = session.query(func.count(TaskHistoryRaw.id)).filter(
    TaskHistoryRaw.task_id == task_id,
    TaskHistoryRaw.completed_status_count > 1,
    TaskHistoryRaw.new_status == 'completed',
    TaskHistoryRaw.old_status != 'completed-approval'
).scalar()
```

---

### Review Count and Rating

**Method 1: Using TaskRaw aggregated fields (Recommended)**
```python
review_count = task_raw.count_reviews  # Total reviews
latest_score = task_raw.score  # Latest review score
avg_score = task_raw.sum_score / task_raw.count_reviews if task_raw.count_reviews > 0 else None
```

**Method 2: Using ReviewDetail model**
```python
# Get all reviews for task
reviews = session.query(ReviewDetail).filter(
    ReviewDetail.conversation_id == task_id
).all()

review_count = len(reviews)
scores = [r.score for r in reviews if r.score is not None]
avg_score = sum(scores) / len(scores) if scores else None
latest_review = max(reviews, key=lambda r: r.updated_at) if reviews else None
latest_score = latest_review.score if latest_review else None
```

---

### Delivery Status

**Using TaskRaw:**
```python
delivery_status = task_raw.delivery_status  # Delivery status string
delivery_batch_name = task_raw.delivery_batch_name
is_delivered = task_raw.delivery_status is not None  # Has delivery info
```

**Using Task model:**
```python
is_delivered = task.is_delivered == 'True'  # String comparison
```

---

### AHT Per Task

**Using TaskAHT model:**
```python
aht = session.query(TaskAHT).filter(
    TaskAHT.task_id == task_id
).first()

if aht:
    duration_minutes = aht.duration_minutes
    duration_hours = aht.duration_minutes / 60.0 if aht.duration_minutes else None
    start_time = aht.start_time
    end_time = aht.end_time
else:
    # No AHT data available
    duration_minutes = None
```

**Note**: AHT is only calculated for tasks that went through `pending → labeling → completed` transitions within 3 hours.

---

## 7. Suggested Task-Level Metrics to Display

Based on the available data, here are recommended task-level metrics:

### Core Metrics

1. **Task ID** - `task_id`
2. **Task Status** - `task_status` or `derived_status`
3. **Is New or Rework** - Based on `number_of_turns`:
   - New Task: `number_of_turns == 0`
   - Rework: `number_of_turns > 0`
4. **Rework Count** - `number_of_turns` (number of rework submissions)
5. **Review Count** - `count_reviews` (total reviews performed)
6. **Latest Review Score** - `score` (most recent review rating)
7. **Average Review Score** - `sum_score / count_reviews` (if count_reviews > 0)
8. **Delivery Status** - `delivery_status` or `is_delivered`
9. **AHT (Minutes)** - `TaskAHT.duration_minutes` (if available)

### Additional Useful Metrics

10. **Trainer** - `trainer` (current trainer email)
11. **First Completer** - `first_completer` (who first completed the task)
12. **Created Date** - `created_date`
13. **Last Completed Date** - `last_completed_date`
14. **Project ID** - `project_id`
15. **Batch Name** - `batch_name`
16. **Domain** - From `Task.domain` (if needed)
17. **Latest Review Action** - `review_action_type` ('delivery', 'rework', etc.)
18. **Follow-up Required** - `followup_required` (0=approved, 1=sent to rework)
19. **Latest Reviewer** - `reviewer` (email of latest reviewer)
20. **Latest Review Date** - `r_submitted_date`

### Calculated Metrics

21. **Rework Percentage** - `(number_of_turns / (number_of_turns + 1)) * 100` if rework
22. **Review Frequency** - Reviews per completion cycle
23. **Time to First Review** - Difference between `first_completion_date` and first review date
24. **Time to Delivery** - Difference between `first_completion_date` and delivery date

---

## 8. Example Query: Get Complete Task Metrics

```python
from sqlalchemy import func
from app.models.db_models import TaskRaw, TaskAHT, ReviewDetail

def get_task_metrics(task_id: int):
    """Get comprehensive task-level metrics."""
    with session() as s:
        # Get task raw data
        task = s.query(TaskRaw).filter(TaskRaw.task_id == task_id).first()
        if not task:
            return None
        
        # Get AHT
        aht = s.query(TaskAHT).filter(TaskAHT.task_id == task_id).first()
        
        # Build metrics dictionary
        metrics = {
            'task_id': task.task_id,
            'status': task.derived_status or task.task_status,
            'is_new': task.number_of_turns == 0,
            'is_rework': task.number_of_turns > 0,
            'rework_count': task.number_of_turns,
            'review_count': task.count_reviews or 0,
            'latest_score': task.score,
            'avg_score': task.sum_score / task.count_reviews if task.count_reviews and task.count_reviews > 0 else None,
            'delivery_status': task.delivery_status,
            'is_delivered': task.delivery_status is not None,
            'trainer': task.trainer,
            'first_completer': task.first_completer,
            'created_date': task.created_date,
            'last_completed_date': task.last_completed_date,
            'aht_minutes': aht.duration_minutes if aht else None,
            'aht_hours': (aht.duration_minutes / 60.0) if aht and aht.duration_minutes else None,
            'latest_reviewer': task.reviewer,
            'latest_review_date': task.r_submitted_date,
            'followup_required': task.followup_required == 1,
            'review_action_type': task.review_action_type,
        }
        
        return metrics
```

---

## 9. Summary

### Key Findings

1. **TaskRaw is the primary model** for task-level metrics - contains most aggregated data
2. **TaskHistoryRaw tracks events** - use for detailed event history and determining new vs rework
3. **ReviewDetail provides individual reviews** - use when you need review-level detail
4. **TaskAHT provides actual handling time** - use for performance metrics
5. **number_of_turns** is the simplest way to determine new vs rework (0 = new, >0 = rework)
6. **completed_status_count** in TaskHistoryRaw provides more detailed tracking
7. **count_reviews and score fields** in TaskRaw provide quick access to review metrics

### Recommended Approach

- **For quick metrics**: Use `TaskRaw` model - it has most fields pre-aggregated
- **For event history**: Use `TaskHistoryRaw` model - tracks all status transitions
- **For review details**: Use `ReviewDetail` model - individual review records
- **For AHT**: Use `TaskAHT` model - actual handling time per task

---

**Document Version**: 1.0  
**Last Updated**: February 6, 2026
