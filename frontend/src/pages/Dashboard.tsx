import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  Tooltip as MuiTooltip,
} from '@mui/material'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assignment as TaskIcon,
  People as PeopleIcon,
  Domain as DomainIcon,
  Star as StarIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Speed as SpeedIcon,
  LocalShipping as DeliveryIcon,
  InsertDriveFile as FileIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorDisplay from '../components/ErrorDisplay'
import { getOverallStats, getTaskLevelInfo, getDomainStats, getReviewerStats, getTrainerStats } from '../services/api'
import type { OverallAggregation, TaskLevelInfo, DomainAggregation, ReviewerAggregation, TrainerLevelAggregation } from '../types'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overallData, setOverallData] = useState<OverallAggregation | null>(null)
  const [taskData, setTaskData] = useState<TaskLevelInfo[]>([])
  const [domainData, setDomainData] = useState<DomainAggregation[]>([])
  const [reviewerData, setReviewerData] = useState<ReviewerAggregation[]>([])
  const [trainerData, setTrainerData] = useState<TrainerLevelAggregation[]>([])

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [overall, tasks, domains, reviewers, trainers] = await Promise.all([
        getOverallStats(),
        getTaskLevelInfo({}),
        getDomainStats(),
        getReviewerStats(),
        getTrainerStats(),
      ])

      setOverallData(overall)
      setTaskData(tasks)
      setDomainData(domains)
      setReviewerData(reviewers)
      setTrainerData(trainers)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Calculate weekly task completion velocity
  const getWeeklyVelocityData = () => {
    const weeklyData: Record<number, Record<string, number>> = {}

    taskData.forEach(task => {
      if (task.week_number) {
        if (!weeklyData[task.week_number]) {
          weeklyData[task.week_number] = {}
        }
        
        // Get domain from task (you might need to add domain to TaskLevelInfo type)
        const domain = 'General' // Placeholder - adjust based on your data
        weeklyData[task.week_number][domain] = (weeklyData[task.week_number][domain] || 0) + 1
      }
    })

    return Object.entries(weeklyData)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([week, domains]) => ({
        week: `Week ${week}`,
        total: Object.values(domains).reduce((sum, count) => sum + count, 0),
        ...domains,
      }))
  }

  // Calculate quality trend over time
  const getQualityTrendData = () => {
    const weeklyQuality: Record<number, { scores: number[], count: number }> = {}

    taskData.forEach(task => {
      if (task.week_number && task.quality_dimensions) {
        if (!weeklyQuality[task.week_number]) {
          weeklyQuality[task.week_number] = { scores: [], count: 0 }
        }

        const avgScore = Object.values(task.quality_dimensions).reduce((sum, score) => sum + score, 0) / 
                        Object.values(task.quality_dimensions).length

        weeklyQuality[task.week_number].scores.push(avgScore)
        weeklyQuality[task.week_number].count++
      }
    })

    return Object.entries(weeklyQuality)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([week, data]) => ({
        week: `Week ${week}`,
        averageScore: data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length,
        taskCount: data.count,
      }))
  }

  // Get domain comparison data
  const getDomainComparisonData = () => {
    return domainData.map(domain => ({
      domain: domain.domain || 'Unknown',
      taskCount: domain.task_count,
      avgScore: domain.quality_dimensions.reduce((sum, qd) => sum + (qd.average_score || 0), 0) / 
               (domain.quality_dimensions.length || 1),
    })).sort((a, b) => b.taskCount - a.taskCount).slice(0, 10)
  }

  // Get reviewer performance data
  const getReviewerPerformanceData = () => {
    return reviewerData.map(reviewer => ({
      name: reviewer.reviewer_name || `Reviewer ${reviewer.reviewer_id}`,
      taskCount: reviewer.task_count,
      avgScore: reviewer.quality_dimensions.reduce((sum, qd) => sum + (qd.average_score || 0), 0) / 
               (reviewer.quality_dimensions.length || 1),
    })).filter(r => r.taskCount > 0)
  }

  // Get trainer performance data
  const getTrainerPerformanceData = () => {
    return trainerData.map(trainer => ({
      name: trainer.trainer_name || `Trainer ${trainer.trainer_id}`,
      taskCount: trainer.task_count,
      avgScore: trainer.quality_dimensions.reduce((sum, qd) => sum + (qd.average_score || 0), 0) / 
               (trainer.quality_dimensions.length || 1),
    })).filter(t => t.taskCount > 0)
  }

  // Calculate quality dimension fill rate (utilization)
  const getQualityDimensionFillRate = () => {
    if (!overallData || overallData.quality_dimensions.length === 0) return []

    const totalTasks = overallData.task_count
    
    return overallData.quality_dimensions
      .map(qd => ({
        name: qd.name,
        taskCount: qd.task_count || 0,
        fillRate: totalTasks > 0 ? ((qd.task_count || 0) / totalTasks) * 100 : 0,
        avgScore: qd.average_score || 0,
      }))
      .sort((a, b) => b.fillRate - a.fillRate) // Sort by fill rate descending
  }

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchAllData} />
  }

  if (!overallData) {
    return <ErrorDisplay message="No data available" onRetry={fetchAllData} />
  }

  const weeklyVelocity = getWeeklyVelocityData()
  const qualityTrendData = getQualityTrendData()
  const domainComparison = getDomainComparisonData()
  const reviewerPerformance = getReviewerPerformanceData()
  const trainerPerformance = getTrainerPerformanceData()
  const dimensionFillRate = getQualityDimensionFillRate()

  // Debug logging
  console.log('Dashboard Data:', {
    taskData: taskData.length,
    domainData: domainData.length,
    reviewerData: reviewerData.length,
    trainerData: trainerData.length,
    weeklyVelocity: weeklyVelocity.length,
    qualityTrendData: qualityTrendData.length,
    domainComparison: domainComparison.length,
    reviewerPerformance: reviewerPerformance.length,
    trainerPerformance: trainerPerformance.length,
    dimensionFillRate: dimensionFillRate.length,
  })

  // Calculate overall quality score
  const overallQualityScore = overallData.quality_dimensions.length > 0
    ? overallData.quality_dimensions.reduce((sum, qd) => sum + (qd.average_score || 0), 0) / overallData.quality_dimensions.length
    : 0

  // Calculate tasks at risk (below 3.5 average)
  const tasksAtRisk = taskData.filter(task => {
    if (!task.quality_dimensions || Object.keys(task.quality_dimensions).length === 0) return false
    const avgScore = Object.values(task.quality_dimensions).reduce((sum, score) => sum + score, 0) / Object.values(task.quality_dimensions).length
    return avgScore < 3.5
  }).length

  // Calculate high quality tasks (above 4.5 average)
  const highQualityTasks = taskData.filter(task => {
    if (!task.quality_dimensions || Object.keys(task.quality_dimensions).length === 0) return false
    const avgScore = Object.values(task.quality_dimensions).reduce((sum, score) => sum + score, 0) / Object.values(task.quality_dimensions).length
    return avgScore >= 4.5
  }).length

  // Calculate quality trend percentage (comparing last 2 weeks)
  let qualityTrendPercent = 0
  if (qualityTrendData.length >= 2) {
    const lastWeek = qualityTrendData[qualityTrendData.length - 1].averageScore
    const previousWeek = qualityTrendData[qualityTrendData.length - 2].averageScore
    qualityTrendPercent = ((lastWeek - previousWeek) / previousWeek) * 100
  }

  // Calculate average tasks per reviewer
  const avgTasksPerReviewer = overallData.reviewer_count > 0 
    ? (overallData.task_count / overallData.reviewer_count).toFixed(1)
    : '0'

  // Calculate quality consistency (std deviation of quality dimensions)
  const qualityScores = overallData.quality_dimensions.map(qd => qd.average_score || 0)
  const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
  const variance = qualityScores.reduce((sum, score) => sum + Math.pow(score - avgQuality, 2), 0) / qualityScores.length
  const qualityConsistency = Math.sqrt(variance)

  const summaryCards = [
    {
      title: 'Overall Quality',
      value: overallQualityScore.toFixed(2),
      subtitle: 'Average Score',
      tooltip: 'Average quality score across all tasks and dimensions. Calculated by averaging all quality dimension scores. Higher is better (max 5.0). Trend shows week-over-week change.',
      trend: qualityTrendPercent !== 0 ? `${qualityTrendPercent > 0 ? '+' : ''}${qualityTrendPercent.toFixed(1)}%` : null,
      icon: StarIcon,
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    {
      title: 'Total Undelivered Tasks',
      value: overallData.task_count.toLocaleString(),
      subtitle: 'Pending Delivery',
      tooltip: 'Total number of tasks that have been reviewed but not yet delivered. This represents work completed but pending final delivery to the client.',
      trend: null,
      icon: TaskIcon,
      color: '#3B82F6',
      bgColor: '#DBEAFE',
    },
    {
      title: 'High Quality Tasks',
      value: highQualityTasks.toLocaleString(),
      subtitle: `${((highQualityTasks / taskData.length) * 100).toFixed(1)}% of Total`,
      tooltip: 'Tasks with average quality score of 4.5 or higher. These represent excellence in work quality. Target: >70% for mature processes.',
      trend: null,
      icon: CheckCircleIcon,
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    {
      title: 'Tasks At Risk',
      value: tasksAtRisk.toLocaleString(),
      subtitle: tasksAtRisk > 0 ? 'Need Attention' : 'All Good',
      tooltip: 'Tasks with average quality score below 3.5. These require immediate attention and potential rework. Target: <10% at risk.',
      trend: null,
      icon: WarningIcon,
      color: tasksAtRisk > 0 ? '#EF4444' : '#10B981',
      bgColor: tasksAtRisk > 0 ? '#FEE2E2' : '#D1FAE5',
    },
    {
      title: 'Avg Tasks/Reviewer',
      value: avgTasksPerReviewer,
      subtitle: 'Workload Balance',
      tooltip: 'Average number of tasks per reviewer. Helps identify workload balance and capacity. Too high may indicate overwork; too low may indicate underutilization.',
      trend: null,
      icon: SpeedIcon,
      color: '#8B5CF6',
      bgColor: '#EDE9FE',
    },
    {
      title: 'Quality Consistency',
      value: qualityConsistency.toFixed(2),
      subtitle: qualityConsistency < 0.5 ? 'Excellent' : qualityConsistency < 1.0 ? 'Good' : 'Variable',
      tooltip: 'Standard deviation of quality scores across dimensions. Lower values indicate more consistent quality. <0.5 = Excellent, 0.5-1.0 = Good, >1.0 = Variable (needs process improvement).',
      trend: null,
      icon: qualityConsistency < 0.5 ? CheckCircleIcon : TrendingUpIcon,
      color: qualityConsistency < 0.5 ? '#10B981' : qualityConsistency < 1.0 ? '#F59E0B' : '#EF4444',
      bgColor: qualityConsistency < 0.5 ? '#D1FAE5' : qualityConsistency < 1.0 ? '#FEF3C7' : '#FEE2E2',
    },
    {
      title: 'Active Reviewers',
      value: overallData.reviewer_count.toLocaleString(),
      subtitle: 'Team Members',
      tooltip: 'Number of reviewers who have actively reviewed tasks. Represents the size of your quality assurance team.',
      trend: null,
      icon: PeopleIcon,
      color: '#8B5CF6',
      bgColor: '#EDE9FE',
    },
    {
      title: 'Active Trainers',
      value: overallData.trainer_count.toLocaleString(),
      subtitle: 'Support Team',
      tooltip: 'Number of trainers supporting the team. Trainers help improve reviewer skills and quality standards.',
      trend: null,
      icon: PeopleIcon,
      color: '#F59E0B',
      bgColor: '#FEF3C7',
    },
    {
      title: 'Domain Coverage',
      value: overallData.domain_count.toLocaleString(),
      subtitle: 'Areas Covered',
      tooltip: 'Number of distinct domains or project areas being worked on. Shows the breadth of work across different specializations.',
      trend: null,
      icon: DomainIcon,
      color: '#0EA5E9',
      bgColor: '#E0F2FE',
    },
    {
      title: 'Quality Dimensions',
      value: overallData.quality_dimensions.length.toLocaleString(),
      subtitle: 'Metrics Tracked',
      tooltip: 'Number of quality dimensions being evaluated for each task. More dimensions provide deeper quality insights but require more review effort.',
      trend: null,
      icon: StarIcon,
      color: '#EC4899',
      bgColor: '#FCE7F3',
    },
    {
      title: 'Delivered Tasks',
      value: overallData.delivered_tasks?.toLocaleString() || '0',
      subtitle: 'From S3',
      tooltip: 'Total number of work items delivered from S3 JSON files. This represents tasks that have been uploaded and are ready for processing.',
      trend: null,
      icon: DeliveryIcon,
      color: '#06B6D4',
      bgColor: '#CFFAFE',
    },
    {
      title: 'Work Items',
      value: overallData.work_items_count?.toLocaleString() || '0',
      subtitle: 'From S3',
      tooltip: 'Total number of distinct work items from the work_item table. Each work item represents a unit of work that may correspond to multiple tasks.',
      trend: null,
      icon: InventoryIcon,
      color: '#06B6D4',
      bgColor: '#CFFAFE',
    },
    {
      title: 'Delivered Files',
      value: overallData.delivered_files?.toLocaleString() || '0',
      subtitle: 'JSON Files',
      tooltip: 'Total number of distinct JSON files delivered to S3. Each file may contain multiple work items. This tracks data delivery frequency.',
      trend: null,
      icon: FileIcon,
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
  ]

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#F8FAFC', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="xl">
        {/* Description */}
        <Box sx={{ mb: 3 }}>
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#6B7280',
              fontSize: '0.875rem',
              lineHeight: 1.6,
            }}
          >
            Comprehensive overview of delivery metrics and performance indicators
          </Typography>
        </Box>

        {/* Summary Cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(6, 1fr)',
            },
            gap: 3,
            mb: 4,
          }}
        >
          {summaryCards.map((card, index) => {
            const Icon = card.icon
            return (
              <Box key={index}>
                <MuiTooltip
                  title={
                    <Box sx={{ p: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {card.title}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {card.tooltip}
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="top"
                  enterDelay={300}
                  leaveDelay={200}
                  componentsProps={{
                    tooltip: {
                      sx: {
                        bgcolor: '#1F2937',
                        maxWidth: 320,
                        fontSize: '0.875rem',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        '& .MuiTooltip-arrow': {
                          color: '#1F2937',
                        },
                      },
                    },
                  }}
                >
                  <Card
                    sx={{
                      height: '100%',
                      minHeight: 160,
                      background: 'white',
                      borderRadius: 2,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      border: '1px solid #E5E7EB',
                      transition: 'all 0.3s ease',
                      cursor: 'help',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        transform: 'translateY(-2px)',
                        borderColor: card.color,
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            backgroundColor: card.bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon sx={{ fontSize: 22, color: card.color }} />
                        </Box>
                        {card.trend && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 1,
                              backgroundColor: card.trend.startsWith('+') ? '#D1FAE5' : '#FEE2E2',
                            }}
                          >
                            {card.trend.startsWith('+') ? (
                              <TrendingUpIcon sx={{ fontSize: 12, color: '#10B981' }} />
                            ) : (
                              <TrendingDownIcon sx={{ fontSize: 12, color: '#EF4444' }} />
                            )}
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                color: card.trend.startsWith('+') ? '#10B981' : '#EF4444',
                              }}
                            >
                              {card.trend}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5, fontSize: '1.75rem' }}>
                        {card.value}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#374151', fontWeight: 600, fontSize: '0.875rem', mb: 0.25 }}>
                        {card.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>
                        {card.subtitle}
                      </Typography>
                    </CardContent>
                  </Card>
                </MuiTooltip>
              </Box>
            )
          })}
        </Box>

        {/* Charts Grid */}
        <Grid container spacing={3}>
          {/* 1. Weekly Task Completion Velocity */}
          <Grid item xs={12} lg={8}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                minHeight: 400,
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 3 }}>
                Weekly Task Completion Velocity
              </Typography>
              {weeklyVelocity.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography variant="body1" color="text.secondary">
                    No weekly data available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyVelocity}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="week" stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <Tooltip
                        formatter={(value: any) => {
                          if (typeof value === 'number') {
                            return value.toFixed(0)
                          }
                          return value
                        }}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        name="Total Tasks"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* 2. Quality Trend Over Time */}
          <Grid item xs={12} lg={4}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                minHeight: 400,
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 3 }}>
                Quality Trend
              </Typography>
              {qualityTrendData.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography variant="body1" color="text.secondary">
                    No quality trend data available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qualityTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="week" stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <Tooltip
                        formatter={(value: any) => {
                          if (typeof value === 'number') {
                            return value.toFixed(2)
                          }
                          return value
                        }}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="averageScore"
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={{ fill: '#10B981', r: 5 }}
                        name="Avg Quality Score"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* 3. Domain Comparison */}
          <Grid item xs={12} lg={6}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                minHeight: 400,
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 3 }}>
                Domain Performance Comparison
              </Typography>
              {domainComparison.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography variant="body1" color="text.secondary">
                    No domain data available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={domainComparison} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis type="number" stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <YAxis dataKey="domain" type="category" width={100} stroke="#6B7280" style={{ fontSize: '11px' }} />
                      <Tooltip
                        formatter={(value: any) => {
                          if (typeof value === 'number') {
                            return value.toFixed(0)
                          }
                          return value
                        }}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="taskCount" fill="#3B82F6" name="Task Count" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* 4. Reviewer vs Trainer Performance */}
          <Grid item xs={12} lg={6}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                minHeight: 400,
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 3 }}>
                Team Performance Distribution
              </Typography>
              {(reviewerPerformance.length === 0 && trainerPerformance.length === 0) ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography variant="body1" color="text.secondary">
                    No team performance data available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis
                        type="number"
                        dataKey="taskCount"
                        name="Task Count"
                        stroke="#6B7280"
                        style={{ fontSize: '12px' }}
                        label={{ value: 'Task Count', position: 'insideBottom', offset: -5, style: { fontSize: '12px', fill: '#6B7280' } }}
                      />
                      <YAxis
                        type="number"
                        dataKey="avgScore"
                        name="Avg Score"
                        domain={[1, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        stroke="#6B7280"
                        style={{ fontSize: '12px' }}
                        label={{ value: 'Avg Score', angle: -90, position: 'insideLeft', style: { fontSize: '12px', fill: '#6B7280' } }}
                      />
                      <Tooltip
                        formatter={(value: any) => {
                          if (typeof value === 'number') {
                            return value.toFixed(2)
                          }
                          return value
                        }}
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Legend />
                      <Scatter name="Reviewers" data={reviewerPerformance} fill="#8B5CF6" />
                      <Scatter name="Trainers" data={trainerPerformance} fill="#F59E0B" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* 5. Quality Dimension Fill Rate */}
          <Grid item xs={12} lg={6}>
            <Paper
              sx={{
                p: 3,
                height: '100%',
                minHeight: 400,
                borderRadius: 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid #E5E7EB',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937', mb: 0.5 }}>
                  Quality Dimension Utilization
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
                  Fill rate showing how frequently each quality dimension is evaluated across tasks
                </Typography>
              </Box>
              {dimensionFillRate.length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography variant="body1" color="text.secondary">
                    No quality dimension data available yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dimensionFillRate} layout="horizontal">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="name" 
                        type="category"
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        stroke="#6B7280" 
                        style={{ fontSize: '11px' }}
                      />
                      <YAxis 
                        type="number"
                        stroke="#6B7280" 
                        style={{ fontSize: '12px' }}
                        label={{ 
                          value: 'Fill Rate (%)', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { fontSize: '12px', fill: '#6B7280' }
                        }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <Box sx={{ 
                                backgroundColor: 'white',
                                border: '1px solid #E5E7EB',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                p: 1.5,
                              }}>
                                <Typography sx={{ fontWeight: 600, color: '#1F2937', mb: 0.5, fontSize: '0.875rem' }}>
                                  {data.name}
                                </Typography>
                                <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Fill Rate: {data.fillRate.toFixed(1)}%
                                </Typography>
                                <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Tasks: {data.taskCount}
                                </Typography>
                                <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Avg Score: {data.avgScore.toFixed(2)}
                                </Typography>
                              </Box>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="fillRate" radius={[4, 4, 0, 0]}>
                        {dimensionFillRate.map((_entry, index) => {
                          // Color gradient from high to low utilization
                          const colors = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444']
                          return (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={colors[index % colors.length]}
                            />
                          )
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}
