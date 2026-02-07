# Frontend Components Analysis - Comprehensive Summary

## Overview
This document provides a comprehensive analysis of all frontend tab components in the PreDelivery dashboard, including their metrics, API endpoints, data structures, and functionality.

---

## 1. API Service (`services/api.ts`)

### Base Configuration
- **Base URL**: Uses `VITE_API_PREFIX` environment variable or defaults to `/api`
- **Timeout**: 30 seconds
- **Caching**: 5-minute in-memory cache for all GET requests

### All API Endpoints

#### Pre-Delivery Endpoints
1. **`GET /overall`** - Overall aggregation statistics
2. **`GET /by-domain`** - Domain-wise aggregation
3. **`GET /by-reviewer`** - Reviewer-wise aggregation
4. **`GET /reviewers-with-trainers`** - Reviewers with their trainers
5. **`GET /by-trainer-level`** - Trainer-level aggregation
6. **`GET /by-trainer-daily`** - Trainer daily statistics
7. **`GET /by-trainer-overall`** - Trainer overall statistics
8. **`GET /by-reviewer-daily`** - Reviewer daily statistics
9. **`GET /trainers-by-reviewer-date`** - Trainers grouped by reviewer and date
10. **`GET /task-level`** - Task-level information
11. **`GET /project-stats`** - Project statistics with POD Leads hierarchy
12. **`GET /pod-lead-stats`** - POD Lead statistics
13. **`GET /rating-trends`** - Rating trends over time
14. **`GET /rating-comparison`** - Rating comparison between periods

#### Client Delivery Endpoints
15. **`GET /client-delivery/overall`** - Client delivery overall stats
16. **`GET /client-delivery/by-domain`** - Client delivery domain stats
17. **`GET /client-delivery/by-reviewer`** - Client delivery reviewer stats
18. **`GET /client-delivery/by-trainer`** - Client delivery trainer stats
19. **`GET /client-delivery/tracker`** - Delivery tracker

#### Configuration Endpoints
20. **`GET /config/aht`** - AHT configurations
21. **`GET /config/aht/{projectId}`** - AHT configuration for project
22. **`PUT /config/aht/{projectId}`** - Update AHT configuration
23. **`GET /config/targets/{projectId}`** - Throughput targets
24. **`GET /config/targets/{projectId}/default`** - Default throughput target
25. **`PUT /config/targets/{projectId}`** - Set throughput target
26. **`POST /config/targets/{projectId}/bulk`** - Bulk set throughput targets
27. **`GET /config/weights/{projectId}`** - Performance weights
28. **`PUT /config/weights/{projectId}`** - Set performance weights
29. **`GET /config/thresholds/{projectId}`** - Classification thresholds
30. **`PUT /config/thresholds/{projectId}`** - Set classification thresholds
31. **`GET /config/effort-thresholds/{projectId}`** - Effort thresholds
32. **`PUT /config/effort-thresholds/{projectId}`** - Set effort thresholds

#### Target Comparison Endpoints
33. **`GET /target-comparison/trainers/{projectId}`** - Trainer target comparison
34. **`GET /target-comparison/summary/{projectId}`** - Project target summary

#### Utility Endpoints
35. **`GET /health`** - Health check
36. **`GET /sync-info`** - Sync status information
37. **`POST /sync`** - Trigger S3 sync

### Filter Parameters (`FilterParams`)
All endpoints accept optional query parameters:
- `start_date` - Start date filter (YYYY-MM-DD)
- `end_date` - End date filter (YYYY-MM-DD)
- `project_id` - Project ID filter
- `domain` - Domain filter
- `quality_dimension` - Quality dimension filter
- `reviewer_id` - Reviewer ID filter
- `trainer_id` - Trainer ID filter

---

## 2. TypeScript Interfaces

### ProjectStats
```typescript
interface ProjectStats {
  project_id: number
  project_name: string
  pod_lead_count: number
  trainer_count: number
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  agentic_reviews: number
  agentic_rating: number | null
  delivered: number
  in_queue: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  logged_hours: number
  total_pod_hours: number
  accounted_hours: number
  efficiency: number | null
  pod_leads: PodLeadUnderProject[]
}
```

### PodLeadStats
```typescript
interface PodLeadStats {
  pod_lead_name: string
  pod_lead_email: string
  trainer_count: number
  unique_tasks: number
  new_tasks: number
  rework: number
  total_reviews: number
  ready_for_delivery?: number  // Deprecated
  approved_tasks: number
  approved_rework: number
  delivered_tasks: number
  in_delivery_queue: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  merged_exp_aht: number | null
  jibble_hours: number
  total_trainer_hours: number
  aht_submission: number | null
  trainers: TrainerUnderPod[]
}
```

### TrainerStats (TrainerLevelAggregation)
```typescript
interface TrainerLevelAggregation {
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  unique_tasks: number
  new_tasks_submitted: number
  rework_submitted: number
  total_submissions: number
  tasks_ready_for_delivery: number
  sum_number_of_turns: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
  total_reviews?: number
  approved?: number
  approved_rework?: number
  delivered?: number
  in_queue?: number
  jibble_hours?: number | null
}
```

### TaskUnderTrainer
```typescript
interface TaskUnderTrainer {
  task_id: number
  colab_link: string | null
  is_new: boolean
  rework_count: number
  reviews: number
  avg_rating: number | null
  agentic_reviews: number
  agentic_rating: number | null
  is_delivered: boolean
  is_in_queue: boolean
  task_status: string | null
  last_completed_date: string | null
  aht_mins: number | null       // AHT in minutes
  accounted_hours: number       // Accounted hours for this task
  rework_percent: number        // 0 for new, 100 for rework
}
```

---

## 3. Tab Components Analysis

### 3.1 ProjectsTab.tsx

#### Purpose
Displays a hierarchical view: **Project → POD Lead → Trainer → Tasks** (4-level hierarchy)

#### API Endpoint
- **`GET /project-stats`**
  - Parameters: `start_date`, `end_date`, `include_tasks=true`
  - Returns: `ProjectStats[]`

#### Metrics Displayed

**Project Level:**
- **Overview**: Project name, POD Lead count, Trainer count
- **Tasks**: Unique tasks, New tasks, Rework, Delivered, In Queue
- **Quality**: Total reviews, Avg Rating, Agentic reviews, Agentic rating, Avg Rework, Rework %
- **Time & Efficiency**: Merged Exp AHT, Logged hours, Accounted hours, Efficiency %, Total POD hours

**POD Lead Level:**
- **Overview**: POD Lead name, Email, Trainer count
- **Tasks**: Unique tasks, New tasks, Rework, Delivered, In Queue, Approved
- **Quality**: Total reviews, Avg Rating, Agentic reviews, Agentic rating, Avg Rework, Rework %
- **Time & Efficiency**: Merged Exp AHT, Jibble hours, Total trainer hours, AHT/Submission

**Trainer Level:**
- **Overview**: Trainer name, Email, Task count (expandable)
- **Tasks**: Unique tasks, New tasks, Rework, Delivered, In Queue
- **Quality**: Total reviews, Avg Rating, Agentic reviews, Agentic rating, Avg Rework, Rework %
- **Time & Efficiency**: Merged Exp AHT, Jibble hours, Accounted hours, Efficiency %

**Task Level (when expanded):**
- **Overview**: Task ID (with link to labeling tool)
- **Tasks**: Task count (1), New (1 or -), Rework count, Delivered (1 or -), In Queue (1 or -)
- **Quality**: Reviews, Avg Rating, Agentic reviews, Agentic rating, Avg Rework, Rework %
- **Time & Efficiency**: AHT (mins), Accounted hours

#### Column Groups
1. **Overview** (Gray) - Name, Size/Count
2. **Tasks** (Blue) - Task metrics
3. **Quality** (Green) - Quality metrics
4. **Time & Efficiency** (Yellow) - Time metrics

#### Client-Side Calculations
- **Efficiency**: `(accounted_hours / jibble_hours) * 100` (when project selected)
- **Accounted Hours**: Calculated using AHT configuration hook
- **Merged Exp AHT**: Weighted average based on new tasks and rework

#### Sorting/Filtering
- **Sortable Columns**: All numeric columns (click header dropdown)
- **Search**: By project name, POD Lead name/email
- **Timeframe Filter**: Overall, Daily, Weekly, Custom date range
- **Color Settings**: Customizable color coding for metrics

#### Color Coding (PMO Requirements)
- **Efficiency (EFF%)**: >=90% Green, 70-90% Yellow, <70% Red
- **Ratings (RATE)**: >4.8 Green, 4-4.8 Yellow, <4 Red
- **Rework % (R%)**: <=10% Green, 10-30% Yellow, >30% Red (lower is better)
- **Avg Rework (AVGR)**: <1 Green, 1-2.5 Yellow, >2.5 Red (lower is better)

#### Export
- Exports to Excel with hierarchical structure (Project → POD Lead → Trainer)

---

### 3.2 TrainerWise.tsx

#### Purpose
Displays trainer-level statistics with daily breakdown and time theft detection

#### API Endpoints
- **`GET /by-trainer-daily`** - Daily trainer statistics
- **`GET /by-trainer-overall`** - Overall trainer statistics
- **`GET /task-level`** - Task-level info (for reference)
- **`GET /config/targets/{projectId}`** - Throughput targets (when project selected)

#### Metrics Displayed

**Columns:**
- **Overview**: Trainer name, Email
- **Tasks**: Unique tasks, New tasks, Rework, Approved, Delivered, In Queue
- **Quality**: Total reviews, Avg Rework, Rework %, Avg Rating
- **Time & Efficiency**: Merged Exp AHT, Jibble hours
  - **When Project Selected**: Accounted hours, Efficiency %

#### Client-Side Calculations
- **Avg Rework**: `((sum_number_of_turns / new_tasks) - 1)` (for aggregated view)
- **Rework %**: `(rework / (rework + new_tasks)) * 100`
- **Avg Rating**: Weighted average by `unique_tasks`
- **Merged Exp AHT**: Uses AHT configuration hook (project-specific AHT values)
- **Accounted Hours**: `(new_tasks × new_task_aht) + (rework × rework_aht)`
- **Efficiency**: `(accounted_hours / jibble_hours) * 100` (only when project selected)

#### Sorting/Filtering
- **Sortable**: All columns (click header dropdown)
- **Search**: Multi-select autocomplete by trainer name/email
- **Text Filters**: Trainer name, Trainer email (contains/equals/startsWith/endsWith)
- **Numeric Filters**: Unique tasks, New tasks, Rework, Total submissions (slider range)
- **Timeframe**: Overall, Daily, D-1, D-2, D-3, Weekly, Custom
- **Project Filter**: Optional project selector

#### Timeframe Handling
- **Overall**: Uses `/by-trainer-overall` endpoint
- **Daily/Weekly/Custom**: Aggregates daily data client-side
- **Date Range**: Applied to Jibble hours filtering

#### Color Coding
- Same PMO requirements as ProjectsTab (Efficiency, Ratings, Rework %)

#### Export
- Exports to Excel with all metrics
- Includes time theft detection columns when project selected

---

### 3.3 PodLeadTab.tsx

#### Purpose
Displays POD Lead statistics with expandable trainer details

#### API Endpoint
- **`GET /pod-lead-stats`**
  - Parameters: `start_date`, `end_date`, `timeframe`, `project_id` (optional)
  - Returns: `PodLeadStats[]`

#### Metrics Displayed

**POD Lead Level:**
- **Overview**: POD Lead name, Email, Trainer count
- **Tasks**: Unique tasks, New tasks, Rework, Delivered, In Queue, Approved
- **Quality**: Total reviews, Avg Rework, Rework %, Avg Rating
- **Time & Efficiency**: Merged Exp AHT, Jibble hours, Total trainer hours, AHT/Submission

**Trainer Level (expandable):**
- **Overview**: Trainer name, Email
- **Tasks**: Unique tasks, New tasks, Rework, Delivered, In Queue, Approved
- **Quality**: Total reviews, Avg Rework, Rework %, Avg Rating
- **Time & Efficiency**: Merged Exp AHT, Jibble hours, AHT/Submission

#### Client-Side Calculations
- None (all data comes from backend)

#### Sorting/Filtering
- **Sortable**: All columns (click header dropdown)
- **Search**: By POD Lead name/email or trainer name/email
- **Numeric Filters**: All numeric columns (slider range)
- **Timeframe**: Overall, Daily, Weekly, Custom
- **Project Filter**: Optional project selector

#### Color Coding
- Same PMO requirements as ProjectsTab

#### Export
- Exports to Excel with POD Lead and Trainer details

---

### 3.4 ReviewerWise.tsx

#### Purpose
Displays reviewer statistics with expandable trainer details

#### API Endpoints
- **`GET /by-reviewer-daily`** - Daily reviewer statistics
- **`GET /trainers-by-reviewer-date`** - Trainers grouped by reviewer and date

#### Metrics Displayed

**Reviewer Level:**
- **Overview**: Reviewer name, Email, Date (when not overall), Trainer count
- **Reviews**: Unique tasks reviewed, New tasks reviewed, Rework reviewed, Total reviews, Ready for delivery
- **Quality**: Avg Rework, Rework %, Avg Rating
- **Time**: Merged Exp AHT

**Trainer Level (expandable):**
- **Overview**: Trainer name, Email, Date (when not overall)
- **Reviews**: Tasks reviewed, New tasks reviewed, Rework reviewed, Total reviews, Ready for delivery
- **Quality**: Avg Rework, Rework %, Avg Rating
- **Time**: Merged Exp AHT

#### Client-Side Calculations
- **Avg Rework**: `((sum_number_of_turns / unique_tasks_reviewed) - 1)` (for reviewer)
- **Rework %**: `(rework_reviewed / (rework_reviewed + new_tasks_reviewed)) * 100`
- **Avg Rating**: Weighted average by `total_reviews`
- **Merged Exp AHT**: Uses default AHT values (DEFAULT_NEW_TASK_AHT, DEFAULT_REWORK_AHT)

#### Sorting/Filtering
- **Sortable**: All columns (click header)
- **Search**: Multi-select autocomplete by reviewer name/email
- **Timeframe**: Overall, Daily, D-1, D-2, D-3, Weekly, Custom
- **Pagination**: 10, 20, 50, 100 rows per page

#### Timeframe Handling
- **Overall**: Aggregates all daily data by reviewer
- **Daily/Weekly/Custom**: Shows daily breakdown with date column

#### Color Coding
- Same PMO requirements as ProjectsTab

#### Export
- Exports to Excel with reviewer and trainer details

---

### 3.5 DomainWise.tsx

#### Purpose
Displays domain-wise statistics with task distribution visualization

#### API Endpoint
- **`GET /by-domain`** or **`GET /client-delivery/by-domain`**
  - Parameters: `start_date`, `end_date`
  - Returns: `DomainAggregation[]`

#### Metrics Displayed
- **Domain**: Domain name
- **Task Score**: Average task score for the domain
- **Total Tasks**: Total number of tasks in domain
- **Total Reworks**: Total rework count
- **Avg Rework**: Average rework count per task

#### Client-Side Calculations
- **Task Distribution Chart**: Calculates percentage of tasks per domain
- **Chart Data**: Sorted by task count (descending)

#### Sorting/Filtering
- **Sortable**: All columns (click header dropdown)
- **Search**: Multi-select autocomplete by domain name
- **Text Filters**: Domain name (contains/equals/startsWith/endsWith)
- **Numeric Filters**: Task score, Task count, Total rework count, Avg rework count (slider range)
- **Timeframe**: Overall, Daily, Weekly, Custom

#### Visualizations
- **Bar Chart**: Task distribution across domains
  - X-axis: Domain names (rotated -45°)
  - Y-axis: Number of tasks
  - Tooltip: Shows task count and percentage

#### Export
- Not implemented (no export button visible)

---

### 3.6 TaskWise.tsx

#### Purpose
Displays task-level details with comprehensive filtering

#### API Endpoint
- **`GET /task-level`**
  - Parameters: None (fetches all data, filters client-side)
  - Returns: `TaskLevelInfo[]`

#### Metrics Displayed
- **Task ID**: Clickable link to labeling tool
- **Annotator**: Name and ID
- **Annotator Email**: Email address
- **Reviewer**: Name and ID
- **Reviewer Email**: Email address
- **Task Score**: Numeric score
- **Rework Count**: Number of reworks
- **AHT (mins)**: Duration in minutes
- **Week Number**: Week number
- **Updated Date**: Last update date

#### Client-Side Calculations
- **Date Filtering**: Filters by `updated_at` field
- **Search Options**: Built from all tasks (Task ID, Annotator, Reviewer)

#### Sorting/Filtering
- **Sortable**: All columns (click header dropdown)
- **Search**: Multi-select autocomplete (Task ID, Annotator name/email, Reviewer name/email)
- **Text Filters**: Task ID, Annotator name/email, Reviewer name/email (contains/equals/startsWith/endsWith)
- **Numeric Filters**: Task score, Week number, Rework count, Duration minutes (slider range)
- **Date Filter**: Date range picker for Updated Date column
- **Pagination**: 10, 25, 50, 100 rows per page

#### Special Features
- **Labeling Tool Links**: Task IDs link to `https://labeling-n.turing.com/conversations/{task_id}/view`
- **Comprehensive Filtering**: Most advanced filtering of all tabs

#### Export
- Not implemented (no export button visible)

---

### 3.7 RatingTrends.tsx

#### Purpose
Displays rating trends over time and period comparisons

#### API Endpoints
- **`GET /rating-trends`**
  - Parameters: `granularity` (daily/weekly/monthly), `trainer_email` (optional)
  - Returns: `RatingTrendsResponse`
- **`GET /rating-comparison`**
  - Parameters: `period1_start`, `period1_end`, `period2_start`, `period2_end`, `trainer_email` (optional)
  - Returns: `RatingComparisonResponse`

#### Metrics Displayed

**Trends View:**
- **Summary Cards**: Current rating, Starting rating, Change (with trend icon), Data points
- **Chart**: Area chart showing rating trend over time
- **Table**: Top improving trainers (first rating, latest rating, change, data points)

**Comparison View:**
- **Period Cards**: Period 1 rating, Overall trend, Period 2 rating
- **Summary Stats**: Trainers improved, declined, stable, no data
- **Table**: Trainer-wise comparison (Period 1 rating/reviews, Period 2 rating/reviews, Change, Trend)

#### Client-Side Calculations
- **Chart Data**: Transforms API response to chart format
- **Top Trainers**: Calculates change and sorts by improvement

#### Sorting/Filtering
- **View Mode**: Toggle between Trends and Comparison
- **Granularity**: Daily, Weekly, Monthly (Trends view only)
- **Trainer Filter**: Autocomplete dropdown (all trainers)
- **Date Selectors**: Period 1 and Period 2 date ranges (Comparison view)

#### Visualizations
- **Area Chart**: Rating trend over time (Trends view)
  - X-axis: Period labels
  - Y-axis: Rating (0-5)
  - Tooltip: Shows rating value

#### Export
- Not implemented (no export button visible)

---

## 4. Common Features Across Tabs

### Timeframe Selector
All tabs (except TaskWise and RatingTrends) use a shared `TimeframeSelector` component:
- **Options**: Overall, Daily, D-1, D-2, D-3, Weekly, Custom
- **Custom Range**: Start date and end date pickers
- **Week Offset**: For weekly view (default: 0 = current week)

### Color Settings Panel
Tabs with color coding (ProjectsTab, PodLeadTab, ReviewerWise) include:
- **Customizable Thresholds**: For each metric
- **Apply Level**: Parent only, Child only, or Both
- **Persistent Settings**: Stored in localStorage

### Export Functionality
- **ProjectsTab**: Excel export with hierarchical structure
- **TrainerWise**: Excel export with time theft detection
- **PodLeadTab**: Excel export with POD Lead and Trainer details
- **ReviewerWise**: Excel export with Reviewer and Trainer details
- **DomainWise**: No export
- **TaskWise**: No export
- **RatingTrends**: No export

### Summary Stats Reporting
All tabs report summary statistics to parent component (`PreDelivery`):
- `totalTasks`
- `totalTrainers`
- `totalPodLeads`
- `totalProjects`
- `totalReviews`
- `newTasks`
- `rework`

---

## 5. Data Flow Summary

### Fetching Pattern
1. Component mounts → `fetchData()` called
2. API call with filters (date range, project, etc.)
3. Data stored in state
4. Filters applied client-side (if needed)
5. Data sorted and paginated
6. Rendered in table

### Filter Application Order
1. Timeframe filter (if applicable)
2. Search/autocomplete filter
3. Text filters
4. Numeric range filters
5. Date filters (TaskWise only)
6. Sorting
7. Pagination

### Caching Strategy
- **5-minute cache** for all GET requests
- Cache key includes endpoint + query parameters
- Cache cleared on sync trigger

---

## 6. Key Metrics Definitions

### Efficiency %
- **Formula**: `(accounted_hours / jibble_hours) * 100`
- **Accounted Hours**: `(new_tasks × new_task_aht) + (rework × rework_aht)`
- **Thresholds**: >=90% Green, 70-90% Yellow, <70% Red

### Avg Rework
- **Formula**: `((sum_number_of_turns / new_tasks) - 1)` or `((sum_number_of_turns / unique_tasks) - 1)`
- **Thresholds**: <1 Green, 1-2.5 Yellow, >2.5 Red

### Rework %
- **Formula**: `(rework / (rework + new_tasks)) * 100`
- **Thresholds**: <=10% Green, 10-30% Yellow, >30% Red

### Avg Rating
- **Formula**: Weighted average (by `unique_tasks` or `total_reviews`)
- **Thresholds**: >4.8 Green, 4-4.8 Yellow, <4 Red

### Merged Exp AHT
- **Formula**: `(new_tasks × new_task_aht + rework × rework_aht) / (new_tasks + rework)`
- Uses project-specific AHT values from configuration

---

## 7. Notes and Observations

1. **TaskWise** fetches ALL data upfront and filters client-side (no backend date filtering)
2. **RatingTrends** has two distinct views (Trends vs Comparison) with different data structures
3. **ProjectsTab** is the only tab with 4-level hierarchy (Project → POD Lead → Trainer → Tasks)
4. **Color coding** follows PMO requirements consistently across tabs
5. **Export functionality** is not implemented for DomainWise, TaskWise, and RatingTrends
6. **AHT Configuration** is fetched dynamically when a project is selected (TrainerWise)
7. **Time Theft Detection** is only shown in TrainerWise when a project is selected
8. **All tabs** support responsive design with breakpoints (xs, sm, md)

---

## 8. Dependencies

### External Libraries
- **Material-UI (MUI)**: UI components
- **Recharts**: Chart visualizations (DomainWise, RatingTrends)
- **Axios**: HTTP client
- **xlsx**: Excel export functionality

### Internal Utilities
- **`utils/columnTooltips`**: Tooltip definitions for column headers
- **`utils/dateUtils`**: Date range calculations
- **`utils/exportToExcel`**: Excel export utilities
- **`hooks/useAHTConfiguration`**: AHT configuration hook
- **`components/common/TimeframeSelector`**: Shared timeframe selector
- **`components/predelivery/ColorSettingsPanel`**: Color settings panel

---

*Document generated: 2026-02-06*
*Last updated: After comprehensive codebase analysis*
