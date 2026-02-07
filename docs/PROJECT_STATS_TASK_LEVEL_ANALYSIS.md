# Project Statistics API - Task Level Analysis

**Date:** February 6, 2026  
**Function Analyzed:** `get_project_stats_with_pod_leads` in `backend/app/services/query_service.py`  
**Purpose:** Analyze current API structure and propose task-level data addition

---

## 1. Current API Response Structure

### Hierarchy
```
Project
  └── POD Lead
      └── Trainer (multiple trainers per POD Lead)
```

### Response Format

#### Project Level (`project_results`)
```python
{
  'project_id': int,
  'project_name': str,
  'pod_lead_count': int,
  'trainer_count': int,
  'unique_tasks': int,              # True unique count (not summed)
  'new_tasks': int,
  'rework': int,
  'total_reviews': int,
  'agentic_reviews': int,
  'agentic_rating': float | None,
  'delivered': int,
  'in_queue': int,
  'avg_rework': float | None,
  'rework_percent': float | None,
  'avg_rating': float | None,
  'merged_exp_aht': float | None,
  'logged_hours': float,
  'total_pod_hours': float,
  'accounted_hours': float,
  'efficiency': float | None,
  'pod_leads': List[PodLeadUnderProject]
}
```

#### POD Lead Level (`pod_leads`)
```python
{
  'pod_lead_name': str,
  'pod_lead_email': str,
  'trainer_count': int,
  'unique_tasks': int,
  'new_tasks': int,
  'rework': int,
  'total_reviews': int,
  'agentic_reviews': int,
  'agentic_rating': float | None,
  'delivered': int,
  'in_queue': int,
  'avg_rework': float | None,
  'rework_percent': float | None,
  'avg_rating': float | None,
  'merged_exp_aht': float | None,
  'pod_jibble_hours': float,
  'trainer_jibble_hours': float,
  'accounted_hours': float,
  'efficiency': float | None,
  'trainers': List[TrainerUnderPodLead]  # ← Currently includes trainer details
}
```

#### Trainer Level (`trainers` array within each POD Lead)
```python
{
  'trainer_name': str,
  'trainer_email': str,
  'unique_tasks': int,
  'new_tasks': int,
  'rework': int,
  'total_reviews': int,
  'agentic_reviews': int,
  'agentic_rating': float | None,
  'delivered': int,
  'in_queue': int,
  'avg_rework': float | None,
  'rework_percent': float | None,
  'avg_rating': float | None,
  'merged_exp_aht': float | None,
  'jibble_hours': float,
  'accounted_hours': float,
  'efficiency': float | None,
  'status': str  # 'active', 'unmapped', 'delivery_only'
}
```

**Note:** Currently, trainers contain aggregated metrics only. No task-level details are included.

---

## 2. Task-Level Data Available in Database

### TaskRaw Table (Primary Source for Task Details)

The `TaskRaw` table contains comprehensive task-level information:

#### Basic Task Info
- `task_id` (BigInteger, PK) - Unique task identifier
- `created_date` (Date) - Task creation date
- `updated_at` (DateTime) - Last update timestamp
- `last_completed_at` (DateTime) - Last completion timestamp
- `last_completed_date` (Date, indexed) - Last completion date
- `trainer` (String, indexed) - Current trainer email
- `first_completion_date` (Date) - First completion date
- `first_completer` (String) - First completer email
- `colab_link` (Text) - Colab notebook link
- `number_of_turns` (Integer) - Number of conversation turns
- `task_status` (String, indexed) - Current task status
- `batch_name` (String) - Batch name
- `task_duration` (Integer) - Task duration in minutes
- `project_id` (Integer) - Project identifier

#### Delivery Info
- `delivery_batch_name` (String) - Delivery batch name
- `delivery_status` (String) - Delivery status ('delivered', etc.)
- `delivery_batch_created_by` (String) - Who created delivery batch
- `db_open_date` (Date) - Database open date
- `db_close_date` (Date) - Database close date

#### Review Stats (Aggregated)
- `count_reviews` (Integer) - Total number of reviews
- `sum_score` (Float) - Sum of all review scores
- `sum_ref_score` (Float) - Sum of reflected scores
- `sum_duration` (Integer) - Total review duration
- `sum_followup_required` (Integer) - Count of reviews requiring followup

#### Latest Review Info
- `review_id` (BigInteger) - Latest review ID
- `reviewer` (String) - Reviewer email
- `score` (Float) - Latest review score
- `reflected_score` (Float) - Latest reflected score
- `review_action` (Text) - Review action taken
- `review_action_type` (String) - 'delivery', 'rework', etc.
- `r_feedback` (Text) - Review feedback
- `followup_required` (Integer) - Followup required flag
- `r_duration` (Integer) - Review duration
- `r_submitted_at` (DateTime) - Review submission timestamp
- `r_submitted_date` (Date) - Review submission date
- `derived_status` (String, indexed) - Derived status

### TaskHistoryRaw Table (Task Attribution Source)

Used for determining which trainer completed which task:

- `task_id` (BigInteger, indexed) - Task identifier
- `author` (String, indexed) - Trainer email who made the status change
- `time_stamp` (DateTime) - When the change occurred
- `date` (Date, indexed) - Date of change
- `old_status` (String) - Previous status
- `new_status` (String, indexed) - New status
- `completed_status_count` (Integer) - Running count of completions
- `last_completed_date` (Date) - Last completion date
- `project_id` (Integer) - Project ID
- `batch_name` (String) - Batch name

**Key Attribution Logic:**
- Tasks are attributed to trainers based on `TaskHistoryRaw.author` (who actually completed the task)
- For delivery attribution, uses the **LAST completer** from `TaskHistoryRaw`
- Completion events: `new_status == 'completed' AND old_status != 'completed-approval'`

---

## 3. Task Data That Could Be Added to Response

### Recommended Task-Level Fields

For each trainer, we can add a `tasks` array containing task-level details:

```python
{
  'task_id': int,
  'created_date': str | None,              # ISO date string
  'last_completed_date': str | None,         # ISO date string
  'colab_link': str | None,
  'number_of_turns': int,
  'task_status': str | None,
  'batch_name': str | None,
  'task_duration': int | None,              # Duration in minutes
  'delivery_batch_name': str | None,
  'delivery_status': str | None,
  'is_delivered': bool,                      # Derived: delivery_status == 'delivered'
  'is_in_queue': bool,                       # Derived: has delivery_batch_name but not delivered
  'count_reviews': int,
  'latest_score': float | None,             # From TaskRaw.score
  'latest_reviewer': str | None,             # From TaskRaw.reviewer
  'review_action_type': str | None,          # 'delivery', 'rework', etc.
  'is_new_task': bool,                       # Derived: completed_status_count == 1
  'is_rework': bool                          # Derived: completed_status_count > 1
}
```

### Additional Metrics Per Task (Optional)

- `first_completion_date` - When task was first completed
- `first_completer` - Who first completed it
- `avg_score` - Average of all review scores (if multiple reviews)
- `review_count` - Number of reviews received
- `r_feedback` - Latest review feedback (if available)

---

## 4. Suggested Approach to Add Tasks Under Each Trainer

### Implementation Strategy

#### Step 1: Query Task IDs for Each Trainer

Within the existing `get_project_stats_with_pod_leads` function, after building `trainer_history`, add:

```python
# Get task IDs for each trainer from TaskHistoryRaw
trainer_task_ids = defaultdict(set)

task_attribution_query = session.query(
    TaskHistoryRaw.author,
    TaskHistoryRaw.task_id,
    TaskHistoryRaw.completed_status_count
).filter(
    TaskHistoryRaw.new_status == 'completed',
    TaskHistoryRaw.old_status != 'completed-approval',
    TaskHistoryRaw.project_id == project_id,
    TaskHistoryRaw.author.isnot(None)
)

if start_date:
    task_attribution_query = task_attribution_query.filter(TaskHistoryRaw.date >= start_date)
if end_date:
    task_attribution_query = task_attribution_query.filter(TaskHistoryRaw.date <= end_date)

task_attribution_results = task_attribution_query.all()

# Build trainer -> task_ids mapping with completion counts
trainer_task_completion_info = defaultdict(dict)  # {trainer_email: {task_id: completed_status_count}}
for row in task_attribution_results:
    if row.author:
        email = row.author.lower().strip()
        trainer_task_ids[email].add(row.task_id)
        # Store completion count for determining new_task vs rework
        trainer_task_completion_info[email][row.task_id] = row.completed_status_count
```

#### Step 2: Fetch Task Details from TaskRaw

```python
# Collect all unique task IDs
all_trainer_task_ids = set()
for task_set in trainer_task_ids.values():
    all_trainer_task_ids.update(task_set)

# Query TaskRaw for all task details
if all_trainer_task_ids:
    task_details_query = session.query(TaskRaw).filter(
        TaskRaw.task_id.in_(list(all_trainer_task_ids)),
        TaskRaw.project_id == project_id
    )
    
    # Optionally filter by date range on last_completed_date
    if start_date:
        task_details_query = task_details_query.filter(TaskRaw.last_completed_date >= start_date)
    if end_date:
        task_details_query = task_details_query.filter(TaskRaw.last_completed_date <= end_date)
    
    task_details_results = task_details_query.all()
    
    # Build task_id -> TaskRaw object map
    task_details_map = {task.task_id: task for task in task_details_results}
else:
    task_details_map = {}
```

#### Step 3: Build Task Objects for Each Trainer

```python
# Function to build task object from TaskRaw
def build_task_object(task_raw: TaskRaw, completion_count: int) -> Dict[str, Any]:
    return {
        'task_id': task_raw.task_id,
        'created_date': task_raw.created_date.isoformat() if task_raw.created_date else None,
        'last_completed_date': task_raw.last_completed_date.isoformat() if task_raw.last_completed_date else None,
        'colab_link': task_raw.colab_link,
        'number_of_turns': task_raw.number_of_turns or 0,
        'task_status': task_raw.task_status,
        'batch_name': task_raw.batch_name,
        'task_duration': task_raw.task_duration,
        'delivery_batch_name': task_raw.delivery_batch_name,
        'delivery_status': task_raw.delivery_status,
        'is_delivered': task_raw.delivery_status and task_raw.delivery_status.lower() == 'delivered',
        'is_in_queue': bool(task_raw.delivery_batch_name and 
                           task_raw.delivery_batch_name.strip() and
                           (not task_raw.delivery_status or task_raw.delivery_status.lower() != 'delivered')),
        'count_reviews': task_raw.count_reviews or 0,
        'latest_score': float(task_raw.score) if task_raw.score is not None else None,
        'latest_reviewer': task_raw.reviewer,
        'review_action_type': task_raw.review_action_type,
        'is_new_task': completion_count == 1,
        'is_rework': completion_count > 1
    }

# Build tasks array for each trainer
trainer_tasks_map = defaultdict(list)
for trainer_email, task_id_set in trainer_task_ids.items():
    for task_id in task_id_set:
        if task_id in task_details_map:
            task_raw = task_details_map[task_id]
            completion_count = trainer_task_completion_info[trainer_email].get(task_id, 1)
            task_obj = build_task_object(task_raw, completion_count)
            trainer_tasks_map[trainer_email].append(task_obj)
    
    # Sort tasks by last_completed_date (most recent first)
    trainer_tasks_map[trainer_email].sort(
        key=lambda x: x['last_completed_date'] or '',
        reverse=True
    )
```

#### Step 4: Add Tasks to Trainer Entry

When creating `trainer_entry` (around line 3152), add:

```python
trainer_entry = {
    'trainer_name': trainer_name,
    'trainer_email': trainer_email,
    # ... existing fields ...
    'tasks': trainer_tasks_map.get(trainer_email, [])  # Add tasks array
}
```

### Performance Considerations

1. **Query Optimization:**
   - Use `IN` clause for batch fetching task details
   - Ensure indexes exist on `TaskRaw.task_id` and `TaskRaw.project_id`
   - Consider pagination if trainers have many tasks (>1000)

2. **Memory Management:**
   - Process tasks in batches if needed
   - Consider adding a limit parameter (e.g., `max_tasks_per_trainer`)

3. **Optional Filtering:**
   - Add query parameters to control task inclusion:
     - `include_tasks: bool = False` - Only include tasks if explicitly requested
     - `task_limit: int = 100` - Limit number of tasks per trainer
     - `task_status_filter: List[str]` - Filter by task status

### Alternative: Lazy Loading Approach

Instead of including all tasks in the main response, consider:

1. **Option A:** Add a separate endpoint `/project-stats/{project_id}/trainers/{trainer_email}/tasks`
2. **Option B:** Add a query parameter `include_tasks=true` to the existing endpoint
3. **Option C:** Include task count only, with a separate endpoint for task details

---

## 5. Example Modified Response Structure

### Trainer Entry with Tasks

```python
{
  'trainer_name': 'John Doe',
  'trainer_email': 'john.doe@example.com',
  'unique_tasks': 45,
  'new_tasks': 30,
  'rework': 15,
  'total_reviews': 45,
  'agentic_reviews': 10,
  'agentic_rating': 4.2,
  'delivered': 25,
  'in_queue': 5,
  'avg_rework': 0.33,
  'rework_percent': 33.3,
  'avg_rating': 4.1,
  'merged_exp_aht': 120.5,
  'jibble_hours': 80.0,
  'accounted_hours': 90.0,
  'efficiency': 112.5,
  'status': 'active',
  'tasks': [  # ← NEW: Array of task objects
    {
      'task_id': 12345,
      'created_date': '2026-01-15',
      'last_completed_date': '2026-02-01',
      'colab_link': 'https://colab.research.google.com/...',
      'number_of_turns': 5,
      'task_status': 'completed',
      'batch_name': 'Batch_2026_01',
      'task_duration': 120,
      'delivery_batch_name': 'Delivery_2026_02',
      'delivery_status': 'delivered',
      'is_delivered': True,
      'is_in_queue': False,
      'count_reviews': 2,
      'latest_score': 4.5,
      'latest_reviewer': 'reviewer@example.com',
      'review_action_type': 'delivery',
      'is_new_task': True,
      'is_rework': False
    },
    # ... more tasks
  ]
}
```

---

## 6. Summary

### Current State
- ✅ API provides Project → POD Lead → Trainer hierarchy
- ✅ Trainer-level aggregated metrics are included
- ❌ No task-level details are returned

### Available Task Data
- ✅ Comprehensive task details available in `TaskRaw` table
- ✅ Task attribution logic already exists via `TaskHistoryRaw`
- ✅ All necessary fields for task objects are available

### Recommended Implementation
1. **Add `tasks` array to trainer entries** with core task fields
2. **Use existing attribution logic** (TaskHistoryRaw.author)
3. **Include optional filtering** to control response size
4. **Consider performance** - batch queries and optional pagination

### Next Steps
1. Review and approve the proposed task fields
2. Decide on inclusion strategy (always include vs. query parameter)
3. Implement the changes in `get_project_stats_with_pod_leads`
4. Update frontend TypeScript interfaces to include `tasks` array
5. Test with real data to ensure performance is acceptable

---

**End of Analysis**
