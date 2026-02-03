/**
 * Column Tooltip Definitions
 * 
 * Centralized definitions for all table column tooltips across the dashboard.
 * These explain what each column represents to help users understand the metrics.
 */

export const COLUMN_TOOLTIPS: Record<string, string> = {
  // Common columns
  project_name: 'The name of the project containing tasks and trainers',
  project_id: 'Unique identifier for the project',
  pod_lead_name: 'Name of the POD Lead responsible for managing trainers',
  pod_lead_email: 'Email address of the POD Lead',
  trainer_name: 'Name of the trainer who works on tasks',
  trainer_email: 'Email address of the trainer',
  reviewer_name: 'Name of the reviewer who reviews completed tasks',
  reviewer_email: 'Email address of the reviewer',
  
  // Count columns
  count: 'Number of POD Leads and trainers under this project/POD Lead',
  trainer_count: 'Total number of trainers under this POD Lead',
  pod_lead_count: 'Total number of POD Leads in this project',
  
  // Task columns
  unique_tasks: 'Total number of distinct tasks worked on (each task counted once regardless of how many times it was submitted)',
  tasks_reviewed: 'Total number of distinct tasks that have been reviewed',
  new_tasks: 'Number of first-time task completions (task completed for the first time, not a rework)',
  new_tasks_submitted: 'Number of tasks submitted as new (first completion)',
  new_tasks_reviewed: 'Number of new task submissions that have been reviewed',
  
  // Rework columns
  rework: 'Number of times tasks were sent back for rework and re-completed (subsequent completions after the first)',
  rework_submitted: 'Number of rework submissions (task re-completed after being sent back)',
  rework_reviewed: 'Number of rework submissions that have been reviewed',
  rework_count: 'Total number of times this task was sent to rework status',
  
  // Review columns
  total_reviews: 'Total number of manual reviews completed (published reviews only)',
  count_reviews: 'Number of reviews received for this task',
  
  // Approval & Delivery columns
  approved_tasks: 'Tasks where the trainer is the ORIGINAL AUTHOR and the task got approved. Even if the task was rejected and the trainer reworked it themselves, they still get credit here since they are the first author',
  approved_rework: 'Tasks where the trainer FIXED SOMEONE ELSE\'S rejected work and got it approved. The trainer completed a rework on a task originally started by another trainer',
  tasks_approved: 'Number of new tasks approved (trainer\'s first completion was approved)',
  delivered_tasks: 'Tasks that have been added to a delivery batch and successfully delivered to the client',
  tasks_delivered: 'Number of tasks that have been delivered to the client (in delivered batches)',
  in_delivery_queue: 'Tasks that are in an ongoing delivery batch, pending delivery to the client',
  tasks_in_queue: 'Number of tasks waiting in delivery queue (in ongoing batches, not yet delivered)',
  
  // Legacy - kept for backwards compatibility
  ready_for_delivery: 'Deprecated - see Approved Tasks',
  tasks_ready_for_delivery: 'Deprecated - see Approved Tasks',
  
  // Percentage columns
  avg_rework: 'Average Rework = (Total Submissions / Unique Tasks) - 1. Shows the average number of additional submissions per task. A value of 1.5 means each task had 1.5 extra submissions on average',
  avg_rework_percent: 'Average rework percentage across all tasks. Higher values indicate more iterations needed per task',
  rework_percent: 'Rework % = (Rework / (New Tasks + Rework)) × 100. Proportion of submissions that are reworks vs new tasks',
  
  // Rating columns
  avg_rating: 'Average review score across all reviewed tasks. Scale is typically 1-5 where higher is better',
  task_score: 'The review score given to this specific task',
  score: 'Review score given by the reviewer',
  sum_score: 'Sum of all review scores for this task',
  
  // AHT (Average Handling Time) columns
  merged_exp_aht: 'Merged Expected AHT = (New Tasks × 10 + Rework × 4) / Total Submissions. Weighted average time allocation in minutes',
  aht: 'Average Handling Time - the average time spent working on tasks',
  aht_submission: 'Average time per task submission (total hours / total submissions)',
  aht_mins: 'Average handling time in minutes',
  
  // Hours columns
  logged_hours: 'Total hours logged by trainers and POD leads combined (from Jibble time tracking)',
  total_pod_hours: 'Total hours logged by POD Leads (from Jibble time tracking)',
  jibble_hours: 'Hours logged in Jibble time tracking system',
  pod_lead_hours: 'Total hours logged by the POD Lead',
  total_trainer_hours: 'Sum of hours logged by all trainers under this POD Lead',
  trainer_jibble_hours: 'Hours logged by trainers in Jibble',
  pod_jibble_hours: 'Hours logged by POD Lead in Jibble',
  accounted_hours: 'Hours accounted for by actual work = (New Tasks × 10 + Rework × 4) minutes converted to hours',
  efficiency: 'Efficiency = (Accounted Hrs / Jibble Hrs) × 100. Higher is better. Below 70% may indicate inefficiency',
  
  // Task-specific columns
  task_id: 'Unique identifier for the task/conversation',
  conversation_id: 'Unique conversation/task ID in the system',
  annotator: 'The trainer currently assigned to this task',
  annotator_email: 'Email of the assigned trainer',
  week_number: 'Week number since project start date',
  updated_date: 'Last date the task was updated',
  colab_link: 'Link to the Google Colab notebook for this task',
  
  // Status columns
  status: 'Current status of the trainer (active/inactive)',
  task_status: 'Current status of the task (pending, labeling, completed, rework, etc.)',
  derived_status: 'Calculated status based on task state and review status',
  
  // Domain columns
  domain: 'Subject area or category of the task content',
  
  // Date columns
  submission_date: 'Date when the task was submitted',
  created_date: 'Date when the task was created',
  first_completion_date: 'Date when the task was first completed',
  last_completed_date: 'Most recent date the task was completed',
  
  // Batch columns  
  batch_name: 'Name of the batch this task belongs to',
  delivery_batch_name: 'Name of the delivery batch for client delivery',
  
  // Additional columns
  email: 'Email address',
  total_reworks: 'Total number of rework occurrences',
  total_tasks: 'Total number of distinct tasks',
}

/**
 * Get tooltip for a column key
 * Returns empty string if no tooltip is defined
 */
export function getColumnTooltip(columnKey: string): string {
  // Try exact match first
  if (COLUMN_TOOLTIPS[columnKey]) {
    return COLUMN_TOOLTIPS[columnKey]
  }
  
  // Try lowercase match
  const lowerKey = columnKey.toLowerCase()
  if (COLUMN_TOOLTIPS[lowerKey]) {
    return COLUMN_TOOLTIPS[lowerKey]
  }
  
  // Try with underscores replaced by spaces
  const normalizedKey = columnKey.replace(/\s+/g, '_').toLowerCase()
  if (COLUMN_TOOLTIPS[normalizedKey]) {
    return COLUMN_TOOLTIPS[normalizedKey]
  }
  
  return ''
}

/**
 * Map display header names to tooltip keys
 */
export const HEADER_TO_KEY_MAP: Record<string, string> = {
  // Projects Tab
  'Project / POD Lead': 'project_name',
  'Count': 'count',
  'Unique Tasks': 'unique_tasks',
  'New Tasks': 'new_tasks',
  'Rework': 'rework',
  'Total Reviews': 'total_reviews',
  'Avg Rework': 'avg_rework',
  'Avg Rework %': 'avg_rework',  // Legacy mapping
  'Rework %': 'rework_percent',
  'Merged Exp. AHT': 'merged_exp_aht',
  'Logged Hours': 'logged_hours',
  'Total POD Hrs': 'total_pod_hours',
  
  // POD Lead Tab
  'POD Lead / Trainer': 'pod_lead_name',
  'Approved': 'approved_tasks',
  'Approved Tasks': 'approved_tasks',
  'Approved Rework': 'approved_rework',
  'Appr. Rework': 'approved_rework',
  'Delivered': 'delivered_tasks',
  'Delivered Tasks': 'delivered_tasks',
  'In Queue': 'in_delivery_queue',
  'In Delivery Queue': 'in_delivery_queue',
  'Tasks in Queue': 'in_delivery_queue',
  'Ready for Delivery': 'approved_tasks',  // Legacy mapping
  'Avg Rating': 'avg_rating',
  'POD Lead Hrs': 'pod_lead_hours',
  'Total Trainer Hrs': 'total_trainer_hours',
  'AHT/Submission': 'aht_submission',
  
  // Trainer Wise Tab
  'Trainer': 'trainer_name',
  'Trainer Email': 'trainer_email',
  'Date': 'submission_date',
  'Rework Submitted': 'rework_submitted',
  
  // Task Wise Tab
  'Task ID': 'task_id',
  'Annotator': 'annotator',
  'Annotator Email': 'annotator_email',
  'Reviewer': 'reviewer_name',
  'Reviewer Email': 'reviewer_email',
  'Task Score': 'task_score',
  'Rework Count': 'rework_count',
  'AHT (Mins)': 'aht_mins',
  'Week Number': 'week_number',
  'Updated Date': 'updated_date',
  
  // Domain Wise Tab
  'Domain': 'domain',
  'Tasks Reviewed': 'tasks_reviewed',
  'New Tasks Reviewed': 'new_tasks_reviewed',
  'Rework Reviewed': 'rework_reviewed',
  
  // Reviewer Wise Tab
  'Reviewer Name': 'reviewer_name',
  'Total Reworks': 'rework',
  'Total Tasks': 'unique_tasks',
  
  // Abbreviated headers (for compact grouped tables)
  'Name': 'trainer_name',
  'Email': 'trainer_email',
  'Size': 'trainer_count',
  'Uniq': 'unique_tasks',
  'New': 'new_tasks',
  'Rwk': 'rework',
  'Appr': 'approved_tasks',
  'Del': 'delivered_tasks',
  'Queue': 'in_delivery_queue',
  'Rev': 'total_reviews',
  'AvgR': 'avg_rework',
  'R%': 'rework_percent',
  'Rate': 'avg_rating',
  'AHT': 'merged_exp_aht',
  'Jibble': 'jibble_hours',
  'JIB': 'jibble_hours',
  'TrnHrs': 'total_trainer_hours',
  'AHT/S': 'aht_submission',
  'Acct': 'accounted_hours',
  'Eff%': 'efficiency',
  'Total': 'total_reviews',
  'Ready': 'approved_tasks',
}

/**
 * Get tooltip for a header display name
 */
export function getTooltipForHeader(headerName: string): string {
  const key = HEADER_TO_KEY_MAP[headerName]
  if (key) {
    return getColumnTooltip(key)
  }
  // Try direct lookup with normalized name
  return getColumnTooltip(headerName.replace(/\s+/g, '_').toLowerCase())
}
