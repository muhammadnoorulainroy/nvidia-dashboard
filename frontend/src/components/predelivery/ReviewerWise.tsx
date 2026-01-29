import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Autocomplete,
  TextField,
  Chip,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Slider,
  Popover,
  Divider,
  Button,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TablePagination,
  Collapse,
  Tooltip,
} from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import SortIcon from '@mui/icons-material/Sort'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import FilterListIcon from '@mui/icons-material/FilterList'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import DownloadIcon from '@mui/icons-material/Download'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { exportReviewerWithTrainersToExcel } from '../../utils/exportToExcel'
import { getReviewerDailyStats, getTrainersByReviewerDate, TrainerByReviewerDate } from '../../services/api'
import type { ReviewerDailyStats, AggregatedReviewerStats } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'
import { useAHTConfiguration, DEFAULT_NEW_TASK_AHT, DEFAULT_REWORK_AHT } from '../../hooks/useAHTConfiguration'
import ColorSettingsPanel, { 
  ColorSettings, 
  defaultColorSettings, 
  getColorForValue, 
  getBackgroundColorForValue,
  getTextColorForValue,
  useColorSettings 
} from './ColorSettingsPanel'

interface ReviewerWiseProps {
  isClientDelivery?: boolean
}

type TimeframeOption = 'daily' | 'd-1' | 'd-2' | 'd-3' | 'weekly' | 'custom' | 'overall'

// Extended type to include trainers
interface ReviewerRowData extends Omit<AggregatedReviewerStats, 'sum_number_of_turns' | 'avg_rework' | 'rework_percent' | 'avg_rating'> {
  review_date?: string | null
  trainers?: TrainerByReviewerDate[]
  sum_number_of_turns?: number
  avg_rework?: number | null
  rework_percent?: number | null
  avg_rating?: number | null
}

// Trainer row component
function TrainerRow({ 
  trainer, 
  showDate,
  colorSettings 
}: { 
  trainer: TrainerByReviewerDate, 
  showDate: boolean,
  colorSettings: ColorSettings 
}) {
  // Calculate merged_exp_aht for this trainer using default AHT values
  const newTasks = trainer.new_tasks_reviewed || 0
  const rework = trainer.rework_reviewed || 0
  const total = newTasks + rework
  const merged_exp_aht = total > 0 ? (newTasks * DEFAULT_NEW_TASK_AHT + rework * DEFAULT_REWORK_AHT) / total : null

  return (
    <TableRow sx={{ backgroundColor: '#F0F4FF', '&:hover': { backgroundColor: '#E8EEFF' } }}>
      <TableCell sx={{ 
        position: 'sticky',
        left: 0,
        zIndex: 1,
        bgcolor: '#F0F4FF',
        borderRight: '2px solid #E2E8F0',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 4 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
            ↳ {trainer.trainer_name || 'Unknown'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            (ID: {trainer.trainer_id})
          </Typography>
        </Box>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
          {trainer.trainer_email || 'N/A'}
        </Typography>
      </TableCell>
      {showDate && (
        <TableCell align="left">
          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
            -
          </Typography>
        </TableCell>
      )}
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.tasks_reviewed, colorSettings.tasks_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.tasks_reviewed, colorSettings.tasks_reviewed) }}>
          {trainer.tasks_reviewed || 0}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.new_tasks_reviewed, colorSettings.new_tasks_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.new_tasks_reviewed, colorSettings.new_tasks_reviewed) }}>
          {trainer.new_tasks_reviewed || 0}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.rework_reviewed, colorSettings.rework_reviewed) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.rework_reviewed, colorSettings.rework_reviewed) }}>
          {trainer.rework_reviewed || 0}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.total_reviews, colorSettings.total_reviews) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.total_reviews, colorSettings.total_reviews) }}>
          {trainer.total_reviews || 0}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.ready_for_delivery, colorSettings.ready_for_delivery) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.ready_for_delivery, colorSettings.ready_for_delivery) }}>
          {trainer.ready_for_delivery || 0}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.avg_rework, colorSettings.avg_rework) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.avg_rework, colorSettings.avg_rework) }}>
          {trainer.avg_rework !== null && trainer.avg_rework !== undefined ? trainer.avg_rework.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.rework_percent, colorSettings.rework_percent) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.rework_percent, colorSettings.rework_percent) }}>
          {trainer.rework_percent !== null && trainer.rework_percent !== undefined ? `${Math.round(trainer.rework_percent)}%` : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(trainer.avg_rating, colorSettings.avg_rating) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(trainer.avg_rating, colorSettings.avg_rating) }}>
          {trainer.avg_rating !== null && trainer.avg_rating !== undefined ? trainer.avg_rating.toFixed(2) : '-'}
        </Typography>
      </TableCell>
      <TableCell 
        align="left"
        sx={{ backgroundColor: getBackgroundColorForValue(merged_exp_aht, colorSettings.merged_exp_aht) }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(merged_exp_aht, colorSettings.merged_exp_aht) }}>
          {merged_exp_aht !== null ? merged_exp_aht.toFixed(2) : '-'}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

// Expandable reviewer row component
function ReviewerRowComponent({ 
  reviewer, 
  showDate,
  colorSettings 
}: { 
  reviewer: ReviewerRowData
  showDate: boolean
  colorSettings: ColorSettings
}) {
  const [open, setOpen] = useState(false)
  const hasTrainers = reviewer.trainers && reviewer.trainers.length > 0

  // Calculate merged_exp_aht using default AHT values
  const newTasks = reviewer.new_tasks_reviewed || 0
  const rework = reviewer.rework_reviewed || 0
  const total = newTasks + rework
  const merged_exp_aht = total > 0 ? (newTasks * DEFAULT_NEW_TASK_AHT + rework * DEFAULT_REWORK_AHT) / total : null

  return (
    <>
      <TableRow
        sx={{
          '&:hover': { backgroundColor: '#F9FAFB' },
          cursor: hasTrainers ? 'pointer' : 'default',
        }}
        onClick={() => hasTrainers && setOpen(!open)}
      >
        <TableCell sx={{ 
          position: 'sticky',
          left: 0,
          zIndex: 1,
          bgcolor: '#FFFFFF',
          borderRight: '2px solid #E2E8F0',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasTrainers && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            )}
            {!hasTrainers && <Box sx={{ width: 28 }} />}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                {reviewer.reviewer_name || 'Unknown'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {reviewer.reviewer_id || 'N/A'} • {reviewer.trainers?.length || 0} trainers
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ color: '#1F2937', fontSize: '0.875rem' }}>
            {reviewer.reviewer_email || 'N/A'}
          </Typography>
        </TableCell>
        {showDate && (
          <TableCell align="left">
            {reviewer.review_date ? (
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#6366F1' }}>
                {new Date(reviewer.review_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>N/A</Typography>
            )}
          </TableCell>
        )}
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.unique_tasks_reviewed, colorSettings.tasks_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.unique_tasks_reviewed, colorSettings.tasks_reviewed) }}>
            {reviewer.unique_tasks_reviewed ?? 0}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.new_tasks_reviewed, colorSettings.new_tasks_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.new_tasks_reviewed, colorSettings.new_tasks_reviewed) }}>
            {reviewer.new_tasks_reviewed ?? 0}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.rework_reviewed, colorSettings.rework_reviewed) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.rework_reviewed, colorSettings.rework_reviewed) }}>
            {reviewer.rework_reviewed ?? 0}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.total_reviews, colorSettings.total_reviews) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.total_reviews, colorSettings.total_reviews) }}>
            {reviewer.total_reviews ?? 0}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.tasks_ready_for_delivery, colorSettings.ready_for_delivery) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.tasks_ready_for_delivery, colorSettings.ready_for_delivery) }}>
            {reviewer.tasks_ready_for_delivery ?? 0}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.avg_rework, colorSettings.avg_rework) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.avg_rework, colorSettings.avg_rework) }}>
            {reviewer.avg_rework !== null && reviewer.avg_rework !== undefined ? reviewer.avg_rework.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.rework_percent, colorSettings.rework_percent) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.rework_percent, colorSettings.rework_percent) }}>
            {reviewer.rework_percent !== null && reviewer.rework_percent !== undefined ? `${Math.round(reviewer.rework_percent)}%` : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(reviewer.avg_rating, colorSettings.avg_rating) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(reviewer.avg_rating, colorSettings.avg_rating) }}>
            {reviewer.avg_rating !== null && reviewer.avg_rating !== undefined ? reviewer.avg_rating.toFixed(2) : '-'}
          </Typography>
        </TableCell>
        <TableCell 
          align="left"
          sx={{ backgroundColor: getBackgroundColorForValue(merged_exp_aht, colorSettings.merged_exp_aht) }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: getColorForValue(merged_exp_aht, colorSettings.merged_exp_aht) }}>
            {merged_exp_aht !== null ? merged_exp_aht.toFixed(2) : '-'}
          </Typography>
        </TableCell>
      </TableRow>
      {hasTrainers && open && reviewer.trainers!.map((trainer, idx) => (
        <TrainerRow key={`${trainer.trainer_id}-${idx}`} trainer={trainer} showDate={showDate} colorSettings={colorSettings} />
      ))}
    </>
  )
}

export default function ReviewerWise({ isClientDelivery = false }: ReviewerWiseProps) {
  const [data, setData] = useState<ReviewerDailyStats[]>([])
  const [trainerData, setTrainerData] = useState<TrainerByReviewerDate[]>([])
  const [filteredData, setFilteredData] = useState<ReviewerRowData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [timeframe, setTimeframe] = useState<TimeframeOption>('overall')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [orderBy, setOrderBy] = useState<string>('reviewer_name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [colorSettings, setColorSettings] = useColorSettings('reviewerColorSettings')

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [dailyResult, trainersResult] = await Promise.all([
        getReviewerDailyStats({}),
        getTrainersByReviewerDate({})
      ])
      setData(dailyResult)
      setTrainerData(trainersResult)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reviewer statistics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [isClientDelivery])

  // Helper function to get trainers for a specific reviewer and date
  const getTrainersForReviewer = (reviewerId: number | null, reviewDate: string | null): TrainerByReviewerDate[] => {
    if (!reviewerId) return []
    
    return trainerData.filter(t => {
      if (t.reviewer_id !== reviewerId) return false
      if (reviewDate && t.review_date !== reviewDate) return false
      return true
    })
  }

  // Helper function to aggregate daily data to reviewer level
  const aggregateByReviewer = (dailyData: ReviewerDailyStats[]): ReviewerRowData[] => {
    const reviewerMap = new Map<number, ReviewerRowData>()
    
    dailyData.forEach(d => {
      const reviewerId = d.reviewer_id
      if (reviewerId === null) return
      
      if (!reviewerMap.has(reviewerId)) {
        reviewerMap.set(reviewerId, {
          reviewer_id: reviewerId,
          reviewer_name: d.reviewer_name,
          reviewer_email: d.reviewer_email,
          review_date: null,
          unique_tasks_reviewed: 0,
          new_tasks_reviewed: 0,
          rework_reviewed: 0,
          total_reviews: 0,
          tasks_ready_for_delivery: 0,
          sum_number_of_turns: 0,
          avg_rework: null,
          rework_percent: null,
          avg_rating: null,
          trainers: [],
        })
      }
      
      const existing = reviewerMap.get(reviewerId)!
      existing.unique_tasks_reviewed += d.unique_tasks_reviewed || 0
      existing.new_tasks_reviewed += d.new_tasks_reviewed || 0
      existing.rework_reviewed += d.rework_reviewed || 0
      existing.total_reviews += d.total_reviews || 0
      existing.tasks_ready_for_delivery += d.tasks_ready_for_delivery || 0
      existing.sum_number_of_turns = (existing.sum_number_of_turns || 0) + (d.sum_number_of_turns || 0)
      
      // Track weighted rating (rating * total_reviews for this day)
      if (d.avg_rating !== null && d.avg_rating !== undefined && d.total_reviews > 0) {
        const existingWeight = (existing as any)._rating_weight || 0
        const existingSum = (existing as any)._rating_sum || 0
        ;(existing as any)._rating_weight = existingWeight + d.total_reviews
        ;(existing as any)._rating_sum = existingSum + (d.avg_rating * d.total_reviews)
      }
    })
    
    // Calculate avg_rework, rework_percent, and avg_rating after aggregation
    reviewerMap.forEach((reviewer) => {
      // Avg Rework = ((sum_number_of_turns / unique_tasks) - 1) * 100
      if (reviewer.unique_tasks_reviewed > 0) {
        reviewer.avg_rework = parseFloat((((reviewer.sum_number_of_turns || 0) / reviewer.unique_tasks_reviewed) - 1).toFixed(2))
      }
      // Rework % = rework / (rework + new_tasks) * 100
      const total = (reviewer.rework_reviewed || 0) + (reviewer.new_tasks_reviewed || 0)
      if (total > 0) {
        reviewer.rework_percent = Math.round(((reviewer.rework_reviewed || 0) / total) * 100)
      }
      // Avg Rating = weighted average
      const ratingWeight = (reviewer as any)._rating_weight || 0
      const ratingSum = (reviewer as any)._rating_sum || 0
      if (ratingWeight > 0) {
        reviewer.avg_rating = Math.round((ratingSum / ratingWeight) * 100) / 100
      }
      // Clean up temp fields
      delete (reviewer as any)._rating_weight
      delete (reviewer as any)._rating_sum
    })
    
    // Add aggregated trainers for each reviewer (all time)
    reviewerMap.forEach((reviewer, reviewerId) => {
      const trainers = getTrainersForReviewer(reviewerId, null)
      // Aggregate trainers by trainer_id with all metrics
      const trainerAgg = new Map<number, TrainerByReviewerDate>()
      trainers.forEach(t => {
        if (!t.trainer_id) return
        if (!trainerAgg.has(t.trainer_id)) {
          trainerAgg.set(t.trainer_id, { 
            ...t, 
            tasks_reviewed: 0,
            new_tasks_reviewed: 0,
            rework_reviewed: 0,
            total_reviews: 0,
            ready_for_delivery: 0,
            avg_rework: null,
            rework_percent: null,
            avg_rating: null,
          })
        }
        const agg = trainerAgg.get(t.trainer_id)!
        agg.tasks_reviewed = (agg.tasks_reviewed || 0) + (t.tasks_reviewed || 0)
        agg.new_tasks_reviewed = (agg.new_tasks_reviewed || 0) + (t.new_tasks_reviewed || 0)
        agg.rework_reviewed = (agg.rework_reviewed || 0) + (t.rework_reviewed || 0)
        agg.total_reviews = (agg.total_reviews || 0) + (t.total_reviews || 0)
        agg.ready_for_delivery = (agg.ready_for_delivery || 0) + (t.ready_for_delivery || 0)
        
        // Track weighted avg_rework (avg_rework * tasks_reviewed for weighting)
        if (t.avg_rework !== null && t.avg_rework !== undefined && t.tasks_reviewed > 0) {
          const existingWeight = (agg as any)._rework_weight || 0
          const existingSum = (agg as any)._rework_sum || 0
          ;(agg as any)._rework_weight = existingWeight + t.tasks_reviewed
          ;(agg as any)._rework_sum = existingSum + (t.avg_rework * t.tasks_reviewed)
        }
        
        // Track weighted rating for trainer
        if (t.avg_rating !== null && t.avg_rating !== undefined && t.total_reviews > 0) {
          const existingWeight = (agg as any)._rating_weight || 0
          const existingSum = (agg as any)._rating_sum || 0
          ;(agg as any)._rating_weight = existingWeight + t.total_reviews
          ;(agg as any)._rating_sum = existingSum + (t.avg_rating * t.total_reviews)
        }
      })
      
      // Calculate derived metrics for each trainer
      trainerAgg.forEach((trainer) => {
        // Avg Rework = weighted average of daily avg_rework
        const reworkWeight = (trainer as any)._rework_weight || 0
        const reworkSum = (trainer as any)._rework_sum || 0
        if (reworkWeight > 0) {
          trainer.avg_rework = Math.round(reworkSum / reworkWeight)
        }
        
        // Rework % = rework / (rework + new_tasks) * 100
        const total = (trainer.rework_reviewed || 0) + (trainer.new_tasks_reviewed || 0)
        if (total > 0) {
          trainer.rework_percent = Math.round(((trainer.rework_reviewed || 0) / total) * 100)
        }
        
        // Avg Rating = weighted average
        const ratingWeight = (trainer as any)._rating_weight || 0
        const ratingSum = (trainer as any)._rating_sum || 0
        if (ratingWeight > 0) {
          trainer.avg_rating = Math.round((ratingSum / ratingWeight) * 100) / 100
        }
        
        // Clean up temp fields
        delete (trainer as any)._rework_weight
        delete (trainer as any)._rework_sum
        delete (trainer as any)._rating_weight
        delete (trainer as any)._rating_sum
      })
      
      reviewer.trainers = Array.from(trainerAgg.values())
    })
    
    return Array.from(reviewerMap.values())
  }

  // Helper function to filter data by timeframe
  const getFilteredByTimeframe = (allData: ReviewerDailyStats[], tf: TimeframeOption): ReviewerRowData[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let filteredDaily: ReviewerDailyStats[] = []
    
    switch (tf) {
      case 'daily': {
        const todayStr = today.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.review_date === todayStr)
        break
      }
      case 'd-1': {
        const d1 = new Date(today)
        d1.setDate(d1.getDate() - 1)
        const d1Str = d1.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.review_date === d1Str)
        break
      }
      case 'd-2': {
        const d2 = new Date(today)
        d2.setDate(d2.getDate() - 2)
        const d2Str = d2.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.review_date === d2Str)
        break
      }
      case 'd-3': {
        const d3 = new Date(today)
        d3.setDate(d3.getDate() - 3)
        const d3Str = d3.toISOString().split('T')[0]
        filteredDaily = allData.filter(d => d.review_date === d3Str)
        break
      }
      case 'weekly': {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        filteredDaily = allData.filter(d => {
          if (!d.review_date) return false
          const reviewDate = new Date(d.review_date)
          return reviewDate >= weekAgo && reviewDate <= today
        })
        break
      }
      case 'custom': {
        if (!startDate || !endDate) {
          filteredDaily = allData
        } else {
          const start = new Date(startDate)
          const end = new Date(endDate)
          filteredDaily = allData.filter(d => {
            if (!d.review_date) return false
            const reviewDate = new Date(d.review_date)
            return reviewDate >= start && reviewDate <= end
          })
        }
        break
      }
      case 'overall':
      default:
        return aggregateByReviewer(allData)
    }
    
    // For non-overall timeframes, return daily data with trainers attached
    return filteredDaily.map(d => ({
      ...d,
      trainers: getTrainersForReviewer(d.reviewer_id, d.review_date)
    }))
  }

  // Apply all filters
  useEffect(() => {
    let filtered = getFilteredByTimeframe(data, timeframe)

    // Apply search filter
    if (selectedReviewers.length > 0) {
      filtered = filtered.filter(reviewer => {
        const name = reviewer.reviewer_name || `ID: ${reviewer.reviewer_id}`
        const email = reviewer.reviewer_email ? ` (${reviewer.reviewer_email})` : ''
        const fullOption = `${name}${email}`
        return selectedReviewers.includes(fullOption)
      })
    }

    setFilteredData(filtered)
    setPage(0)
  }, [selectedReviewers, data, trainerData, timeframe, startDate, endDate])

  // Sorting
  const handleSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }

  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any = a[orderBy as keyof ReviewerRowData]
    let bValue: any = b[orderBy as keyof ReviewerRowData]

    if (aValue === null || aValue === undefined) aValue = order === 'asc' ? Infinity : -Infinity
    if (bValue === null || bValue === undefined) bValue = order === 'asc' ? Infinity : -Infinity

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    return order === 'asc' ? aValue - bValue : bValue - aValue
  })

  // Get reviewer options for search
  const reviewerOptions = Array.from(new Set(data.map(r => {
    const name = r.reviewer_name || `ID: ${r.reviewer_id}`
    const email = r.reviewer_email ? ` (${r.reviewer_email})` : ''
    return `${name}${email}`
  })))

  if (loading) {
    return <LoadingSpinner message="Loading reviewer statistics..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchData} />
  }

  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  const showDate = timeframe !== 'overall'

  // Download function - includes reviewers with their trainers
  const handleDownload = () => {
    const timestamp = new Date().toISOString().split('T')[0]
    exportReviewerWithTrainersToExcel(sortedData, showDate, `Reviewer_Stats_${timeframe}_${timestamp}`)
  }

  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ p: 2, backgroundColor: '#F7F7F7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Timeframe Selector */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="timeframe-label">Timeframe</InputLabel>
            <Select
              labelId="timeframe-label"
              value={timeframe}
              label="Timeframe"
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
              sx={{ backgroundColor: 'white' }}
            >
              <MenuItem value="daily">Daily (Today)</MenuItem>
              <MenuItem value="d-1">D-1 (Yesterday)</MenuItem>
              <MenuItem value="d-2">D-2</MenuItem>
              <MenuItem value="d-3">D-3</MenuItem>
              <MenuItem value="weekly">Weekly (Last 7 days)</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
              <MenuItem value="overall">Overall (All time)</MenuItem>
            </Select>
          </FormControl>

          {/* Date Range Picker */}
          {timeframe === 'custom' && (
            <>
              <TextField
                type="date"
                size="small"
                label="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160, backgroundColor: 'white' }}
              />
              <TextField
                type="date"
                size="small"
                label="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160, backgroundColor: 'white' }}
              />
            </>
          )}

          <Box sx={{ flex: 1, minWidth: 300 }}>
            <Autocomplete
            multiple
            options={reviewerOptions}
            value={selectedReviewers}
              onChange={(_, newValue) => setSelectedReviewers(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                variant="outlined"
                  placeholder="Search reviewers..."
                size="small"
                  sx={{ backgroundColor: 'white' }}
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option}
                  {...getTagProps({ index })}
                  size="small"
                  sx={{
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                />
              ))
            }
          />
          </Box>
          
          {/* Color Settings */}
          <ColorSettingsPanel 
            settings={colorSettings}
            onSettingsChange={setColorSettings}
            metrics={[
              'tasks_reviewed',
              'new_tasks_reviewed',
              'rework_reviewed',
              'total_reviews',
              'ready_for_delivery',
              'avg_rework',
              'rework_percent',
              'avg_rating',
              'merged_exp_aht'
            ]}
          />

          {/* Download Button */}
          <Tooltip title="Download as Excel">
            <Button
              variant="outlined"
                  size="small"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
                  sx={{
                borderColor: '#10B981',
                color: '#10B981',
                      '&:hover': {
                  borderColor: '#059669',
                  backgroundColor: '#ECFDF5',
                },
              }}
            >
              Export
            </Button>
          </Tooltip>

          {selectedReviewers.length > 0 && (
              <Chip
                icon={<FilterListIcon />}
                label="Clear All"
                size="small"
              onClick={() => setSelectedReviewers([])}
                sx={{
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              />
            )}
        </Box>

        {/* Info banner */}
        <Box sx={{ px: 2, py: 1, backgroundColor: '#EEF2FF', borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="caption" sx={{ color: '#4F46E5' }}>
            💡 Click on a reviewer row to expand and see trainers they have reviewed
          </Typography>
        </Box>

        {/* Table */}
        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1600 }}>
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    fontWeight: 700, 
                    backgroundColor: '#F9FAFB', 
                    minWidth: 200, 
                    cursor: 'pointer',
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    borderRight: '2px solid #E2E8F0',
                  }}
                  onClick={() => handleSort('reviewer_name')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Reviewer {orderBy === 'reviewer_name' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Reviewer Name')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', minWidth: 180 }} align="left">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Email
                    <Tooltip title={getTooltipForHeader('Reviewer Email')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                {showDate && (
                  <TableCell 
                    sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                    align="left"
                    onClick={() => handleSort('review_date')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Date {orderBy === 'review_date' && (order === 'asc' ? '↑' : '↓')}
                      <Tooltip title={getTooltipForHeader('Date')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                        <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                      </Tooltip>
                    </Box>
                  </TableCell>
                )}
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('unique_tasks_reviewed')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Unique Tasks {orderBy === 'unique_tasks_reviewed' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Unique Tasks')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('new_tasks_reviewed')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    New Tasks {orderBy === 'new_tasks_reviewed' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('New Tasks')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('rework_reviewed')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Rework Reviewed {orderBy === 'rework_reviewed' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Rework Reviewed')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('total_reviews')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Total Reviews {orderBy === 'total_reviews' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Total Reviews')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('tasks_ready_for_delivery')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Ready for Delivery {orderBy === 'tasks_ready_for_delivery' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Ready for Delivery')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('avg_rework')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Avg Rework {orderBy === 'avg_rework' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Avg Rework')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('rework_percent')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Rework % {orderBy === 'rework_percent' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Rework %')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('avg_rating')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Avg Rating {orderBy === 'avg_rating' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Avg Rating')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', cursor: 'pointer' }} 
                  align="left"
                  onClick={() => handleSort('merged_exp_aht')}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    Merged Exp. AHT {orderBy === 'merged_exp_aht' && (order === 'asc' ? '↑' : '↓')}
                    <Tooltip title={getTooltipForHeader('Merged Exp. AHT')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((reviewer, idx) => (
                <ReviewerRowComponent
                  key={`${reviewer.reviewer_id}-${reviewer.review_date || 'overall'}-${idx}`}
                  reviewer={reviewer}
                  showDate={showDate}
                  colorSettings={colorSettings}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={sortedData.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </Paper>
    </Box>
  )
}
