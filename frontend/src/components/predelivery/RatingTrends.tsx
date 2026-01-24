import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Autocomplete,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Star as StarIcon,
  Timeline as TimelineIcon,
  Compare as CompareIcon,
} from '@mui/icons-material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { getRatingTrends, getRatingComparison, RatingTrendsResponse, RatingComparisonResponse } from '../../services/api'

type ViewMode = 'trends' | 'comparison'
type Granularity = 'daily' | 'weekly' | 'monthly'

export function RatingTrends() {
  const [viewMode, setViewMode] = useState<ViewMode>('trends')
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const [selectedTrainer, setSelectedTrainer] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Trends data
  const [trendsData, setTrendsData] = useState<RatingTrendsResponse | null>(null)
  
  // Comparison data
  const [comparisonData, setComparisonData] = useState<RatingComparisonResponse | null>(null)
  const [period1Start, setPeriod1Start] = useState('')
  const [period1End, setPeriod1End] = useState('')
  const [period2Start, setPeriod2Start] = useState('')
  const [period2End, setPeriod2End] = useState('')
  
  // Initialize default dates
  useEffect(() => {
    const today = new Date()
    const lastWeek = new Date(today)
    lastWeek.setDate(today.getDate() - 7)
    const twoWeeksAgo = new Date(today)
    twoWeeksAgo.setDate(today.getDate() - 14)
    const threeWeeksAgo = new Date(today)
    threeWeeksAgo.setDate(today.getDate() - 21)
    
    setPeriod1Start(threeWeeksAgo.toISOString().split('T')[0])
    setPeriod1End(twoWeeksAgo.toISOString().split('T')[0])
    setPeriod2Start(lastWeek.toISOString().split('T')[0])
    setPeriod2End(today.toISOString().split('T')[0])
  }, [])
  
  // Fetch trends data
  useEffect(() => {
    if (viewMode === 'trends') {
      fetchTrends()
    }
  }, [viewMode, granularity, selectedTrainer])
  
  const fetchTrends = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRatingTrends(granularity, selectedTrainer || undefined)
      setTrendsData(data)
    } catch (err) {
      setError('Failed to fetch rating trends')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  const fetchComparison = async () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      setError('Please select all date ranges')
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const data = await getRatingComparison(
        period1Start,
        period1End,
        period2Start,
        period2End,
        selectedTrainer || undefined
      )
      setComparisonData(data)
    } catch (err) {
      setError('Failed to fetch rating comparison')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUpIcon sx={{ color: 'success.main' }} />
      case 'declining':
        return <TrendingDownIcon sx={{ color: 'error.main' }} />
      default:
        return <TrendingFlatIcon sx={{ color: 'warning.main' }} />
    }
  }
  
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'success'
      case 'declining':
        return 'error'
      default:
        return 'warning'
    }
  }
  
  const trainers = trendsData ? Object.keys(trendsData.by_trainer).sort() : []
  
  // Prepare chart data
  const chartData = trendsData?.overall_trends.map(point => ({
    period: point.period,
    rating: point.avg_rating,
    reviews: point.total_reviews,
  })) || []
  
  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <TimelineIcon color="primary" />
          <Typography variant="h5" fontWeight="bold">
            Rating Trends Analysis
          </Typography>
        </Box>
        
        {/* View Mode Toggle */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
            size="small"
          >
            <ToggleButton value="trends">
              <TimelineIcon sx={{ mr: 1 }} /> Trends Over Time
            </ToggleButton>
            <ToggleButton value="comparison">
              <CompareIcon sx={{ mr: 1 }} /> Period Comparison
            </ToggleButton>
          </ToggleButtonGroup>
          
          {viewMode === 'trends' && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Granularity</InputLabel>
              <Select
                value={granularity}
                label="Granularity"
                onChange={(e) => setGranularity(e.target.value as Granularity)}
              >
                <MenuItem value="daily">Daily</MenuItem>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </Select>
            </FormControl>
          )}
          
          <Autocomplete
            size="small"
            sx={{ minWidth: 250 }}
            options={trainers}
            value={selectedTrainer}
            onChange={(_, newValue) => setSelectedTrainer(newValue || '')}
            renderInput={(params) => (
              <TextField {...params} label="Filter by Trainer" placeholder="All Trainers" />
            )}
            freeSolo
          />
        </Box>
        
        {/* Comparison Mode Date Selectors */}
        {viewMode === 'comparison' && (
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Period 1 Start"
                  value={period1Start}
                  onChange={(e) => setPeriod1Start(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Period 1 End"
                  value={period1End}
                  onChange={(e) => setPeriod1End(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Period 2 Start"
                  value={period2Start}
                  onChange={(e) => setPeriod2Start(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2.5}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Period 2 End"
                  value={period2End}
                  onChange={(e) => setPeriod2End(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <Box
                  component="button"
                  onClick={fetchComparison}
                  sx={{
                    width: '100%',
                    py: 1,
                    px: 3,
                    bgcolor: 'primary.main',
                    color: 'white',
                    border: 'none',
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'primary.dark' },
                  }}
                >
                  Compare
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        
        {/* Trends View */}
        {viewMode === 'trends' && trendsData && !loading && (
          <>
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ bgcolor: 'primary.light', color: 'white' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StarIcon />
                      <Typography variant="body2">Current Rating</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="bold">
                      {trendsData.improvement_stats.last_rating?.toFixed(2) || '-'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Starting Rating
                    </Typography>
                    <Typography variant="h4" fontWeight="bold">
                      {trendsData.improvement_stats.first_rating?.toFixed(2) || '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {trendsData.improvement_stats.first_period || ''}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ 
                  bgcolor: trendsData.improvement_stats.trend === 'improving' ? 'success.light' : 
                           trendsData.improvement_stats.trend === 'declining' ? 'error.light' : 'warning.light'
                }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getTrendIcon(trendsData.improvement_stats.trend || 'stable')}
                      <Typography variant="body2">Change</Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="bold">
                      {trendsData.improvement_stats.rating_change !== undefined 
                        ? (trendsData.improvement_stats.rating_change > 0 ? '+' : '') + trendsData.improvement_stats.rating_change.toFixed(2)
                        : '-'}
                    </Typography>
                    <Typography variant="caption">
                      {trendsData.improvement_stats.improvement_percent !== undefined
                        ? `(${trendsData.improvement_stats.improvement_percent > 0 ? '+' : ''}${trendsData.improvement_stats.improvement_percent}%)`
                        : ''}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Data Points
                    </Typography>
                    <Typography variant="h4" fontWeight="bold">
                      {trendsData.period_count}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {trendsData.trainer_count} trainers tracked
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            
            {/* Chart */}
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Rating Trend ({granularity})
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [value?.toFixed(2), 'Avg Rating']}
                    labelFormatter={(label) => `Period: ${label}`}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="rating" 
                    stroke="#4F46E5" 
                    fill="#4F46E5" 
                    fillOpacity={0.3}
                    name="Avg Rating"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
            
            {/* Trainer-wise breakdown */}
            {Object.keys(trendsData.by_trainer).length > 0 && !selectedTrainer && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Top Improving Trainers
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell>Trainer</TableCell>
                        <TableCell align="center">First Rating</TableCell>
                        <TableCell align="center">Latest Rating</TableCell>
                        <TableCell align="center">Change</TableCell>
                        <TableCell align="center">Data Points</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(trendsData.by_trainer)
                        .map(([trainer, points]) => {
                          const first = points[0]?.avg_rating
                          const last = points[points.length - 1]?.avg_rating
                          const change = first && last ? last - first : null
                          return { trainer, first, last, change, points: points.length }
                        })
                        .filter(t => t.change !== null)
                        .sort((a, b) => (b.change || 0) - (a.change || 0))
                        .slice(0, 10)
                        .map((row) => (
                          <TableRow key={row.trainer} hover>
                            <TableCell>{row.trainer}</TableCell>
                            <TableCell align="center">{row.first?.toFixed(2) || '-'}</TableCell>
                            <TableCell align="center">{row.last?.toFixed(2) || '-'}</TableCell>
                            <TableCell align="center">
                              <Chip
                                size="small"
                                label={row.change ? (row.change > 0 ? '+' : '') + row.change.toFixed(2) : '-'}
                                color={row.change && row.change > 0 ? 'success' : row.change && row.change < 0 ? 'error' : 'default'}
                                icon={row.change && row.change > 0 ? <TrendingUpIcon /> : row.change && row.change < 0 ? <TrendingDownIcon /> : undefined}
                              />
                            </TableCell>
                            <TableCell align="center">{row.points}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </>
        )}
        
        {/* Comparison View */}
        {viewMode === 'comparison' && comparisonData && !loading && (
          <>
            {/* Overall Comparison */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Period 1: {comparisonData.period1.start} to {comparisonData.period1.end}
                    </Typography>
                    <Typography variant="h3" fontWeight="bold" color="primary">
                      {comparisonData.period1.stats.avg_rating?.toFixed(2) || '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {comparisonData.period1.stats.total_reviews} reviews • {comparisonData.period1.stats.trainer_count} trainers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card sx={{ 
                  bgcolor: getTrendColor(comparisonData.overall_comparison.trend) + '.light',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                      {getTrendIcon(comparisonData.overall_comparison.trend)}
                      <Typography variant="body1" fontWeight="bold">
                        {comparisonData.overall_comparison.trend.toUpperCase()}
                      </Typography>
                    </Box>
                    <Typography variant="h4" fontWeight="bold">
                      {comparisonData.overall_comparison.rating_change !== null
                        ? (comparisonData.overall_comparison.rating_change > 0 ? '+' : '') + comparisonData.overall_comparison.rating_change.toFixed(2)
                        : '-'}
                    </Typography>
                    <Typography variant="body2">
                      {comparisonData.overall_comparison.change_percent !== null
                        ? `(${comparisonData.overall_comparison.change_percent > 0 ? '+' : ''}${comparisonData.overall_comparison.change_percent}%)`
                        : ''}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Period 2: {comparisonData.period2.start} to {comparisonData.period2.end}
                    </Typography>
                    <Typography variant="h3" fontWeight="bold" color="primary">
                      {comparisonData.period2.stats.avg_rating?.toFixed(2) || '-'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {comparisonData.period2.stats.total_reviews} reviews • {comparisonData.period2.stats.trainer_count} trainers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            
            {/* Summary Stats */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6} sm={3}>
                <Card sx={{ bgcolor: 'success.light' }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TrendingUpIcon sx={{ fontSize: 30, color: 'success.dark' }} />
                    <Typography variant="h4" fontWeight="bold">{comparisonData.summary.trainers_improved}</Typography>
                    <Typography variant="caption">Improved</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card sx={{ bgcolor: 'error.light' }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TrendingDownIcon sx={{ fontSize: 30, color: 'error.dark' }} />
                    <Typography variant="h4" fontWeight="bold">{comparisonData.summary.trainers_declined}</Typography>
                    <Typography variant="caption">Declined</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card sx={{ bgcolor: 'warning.light' }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TrendingFlatIcon sx={{ fontSize: 30, color: 'warning.dark' }} />
                    <Typography variant="h4" fontWeight="bold">{comparisonData.summary.trainers_stable}</Typography>
                    <Typography variant="caption">Stable</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Card sx={{ bgcolor: 'grey.200' }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" fontWeight="bold">{comparisonData.summary.trainers_no_data}</Typography>
                    <Typography variant="caption">No Data</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            
            {/* Trainer Comparison Table */}
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Trainer-wise Comparison
              </Typography>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Trainer</TableCell>
                      <TableCell align="center">Period 1 Rating</TableCell>
                      <TableCell align="center">Period 1 Reviews</TableCell>
                      <TableCell align="center">Period 2 Rating</TableCell>
                      <TableCell align="center">Period 2 Reviews</TableCell>
                      <TableCell align="center">Change</TableCell>
                      <TableCell align="center">Trend</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisonData.by_trainer.map((row) => (
                      <TableRow key={row.trainer} hover>
                        <TableCell>{row.trainer}</TableCell>
                        <TableCell align="center">{row.period1_rating?.toFixed(2) || '-'}</TableCell>
                        <TableCell align="center">{row.period1_reviews}</TableCell>
                        <TableCell align="center">{row.period2_rating?.toFixed(2) || '-'}</TableCell>
                        <TableCell align="center">{row.period2_reviews}</TableCell>
                        <TableCell align="center">
                          {row.rating_change !== null ? (
                            <Chip
                              size="small"
                              label={(row.rating_change > 0 ? '+' : '') + row.rating_change.toFixed(2)}
                              color={row.rating_change > 0 ? 'success' : row.rating_change < 0 ? 'error' : 'default'}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                            {getTrendIcon(row.trend)}
                            <Typography variant="caption">
                              {row.trend}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
        
        {!loading && viewMode === 'comparison' && !comparisonData && (
          <Alert severity="info">
            Select date ranges and click "Compare" to see rating comparison between periods.
          </Alert>
        )}
      </Paper>
    </Box>
  )
}

export default RatingTrends
