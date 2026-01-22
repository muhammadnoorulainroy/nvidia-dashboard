export interface QualityDimensionStats {
  name: string
  average_score: number | null
  task_count: number
}

export interface DomainAggregation {
  domain: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
}

export interface ReviewerAggregation {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
}

export interface TrainerUnderReviewer {
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
}

export interface ReviewerWithTrainers {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
  trainers: TrainerUnderReviewer[]
}

export interface TrainerLevelAggregation {
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  average_completion_time_hours: number | null
  avg_aht_minutes: number | null
  total_aht_minutes: number | null
  aht_task_count: number | null
  new_tasks_submitted: number | null
  rework_submitted: number | null
  total_unique_tasks: number | null
  first_submission_date: string | null
  last_submission_date: string | null
  quality_dimensions: QualityDimensionStats[]
}

export interface TrainerDailyStats {
  trainer_id: number | null
  trainer_name: string | null
  trainer_email: string | null
  submission_date: string | null
  unique_tasks: number
  new_tasks_submitted: number
  rework_submitted: number
  total_submissions: number
  tasks_ready_for_delivery: number
  sum_number_of_turns: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
}

export interface ReviewerDailyStats {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  review_date: string | null
  unique_tasks_reviewed: number
  new_tasks_reviewed: number
  rework_reviewed: number
  total_reviews: number
  tasks_ready_for_delivery: number
  sum_number_of_turns: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
}

export interface AggregatedReviewerStats {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  unique_tasks_reviewed: number
  new_tasks_reviewed: number
  rework_reviewed: number
  total_reviews: number
  tasks_ready_for_delivery: number
  sum_number_of_turns: number
  avg_rework: number | null
  rework_percent: number | null
  avg_rating: number | null
}

export interface ReviewerUnderPodLead {
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  task_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
}

export interface PodLeadAggregation {
  pod_lead_id: number | null
  pod_lead_name: string | null
  pod_lead_email: string | null
  task_count: number
  reviewer_count: number
  average_task_score: number | null
  total_rework_count: number
  average_rework_count: number
  quality_dimensions: QualityDimensionStats[]
  reviewers: ReviewerUnderPodLead[]
}

export interface OverallAggregation {
  task_count: number
  work_items_count?: number
  reviewer_count: number
  trainer_count: number
  domain_count: number
  delivered_tasks: number
  delivered_files: number
  total_rework_count: number
  average_rework_count: number
  average_completion_time_hours: number | null
  quality_dimensions: QualityDimensionStats[]
  quality_dimensions_count?: number
}

export interface QualityDimensionDetail {
  name: string
  score_text: string | null
  score: number | null
}

export interface TaskLevelInfo {
  task_id: number | null
  task_score: number | null
  annotator_id: number | null
  annotator_name: string | null
  annotator_email: string | null
  reviewer_id: number | null
  reviewer_name: string | null
  reviewer_email: string | null
  colab_link: string | null
  updated_at: string | null
  week_number: number | null
  rework_count: number | null
  duration_minutes: number | null
  quality_dimensions: Record<string, number>
}

export interface FilterParams {
  domain?: string
  reviewer?: string
  trainer?: string
  quality_dimension?: string
  min_score?: number
  max_score?: number
  min_task_count?: number
  date_from?: string
  date_to?: string
}

