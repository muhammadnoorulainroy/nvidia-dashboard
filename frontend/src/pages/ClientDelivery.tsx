import { useState, useEffect } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Grid,
  Card,
  CircularProgress,
} from '@mui/material'
import {
  Business as BusinessIcon,
  School as SchoolIcon,
  EmojiEvents as TrophyIcon,
  VerifiedUser as CalibratorIcon,
  Assignment as AssignmentIcon,
  RateReview as ReviewIcon,
  Category as CategoryIcon,
  Public as DomainIcon,
  LocalShipping as DeliveryIcon,
} from '@mui/icons-material'
import DomainWise from '../components/predelivery/DomainWise'
import TrainerWise from '../components/predelivery/TrainerWise'
import ReviewerWise from '../components/predelivery/ReviewerWise'
import DeliveryTracker from '../components/clientdelivery/DeliveryTracker'
import TaskWise from '../components/clientdelivery/TaskWise'
import FeedbackUpload from '../components/clientdelivery/FeedbackUpload'
import { getClientDeliveryOverallStats, getClientDeliveryDomainStats } from '../services/api'
import type { OverallAggregation, DomainAggregation } from '../types'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`clientdelivery-tabpanel-${index}`}
      aria-labelledby={`clientdelivery-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

interface SummaryCardProps {
  title: string
  value: string
  icon: React.ReactNode
  color: string
}

function SummaryCard({ title, value, icon, color }: SummaryCardProps) {
  return (
    <Card
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        border: `1px solid #E5E7EB`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 2,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 2px 8px rgba(0, 0, 0, 0.08)`,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            fontWeight: 600, 
            fontSize: '0.75rem', 
            textTransform: 'uppercase', 
            letterSpacing: '0.5px' 
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            backgroundColor: `${color}10`,
            borderRadius: 1.5,
            p: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            '& svg': {
              fontSize: '1.1rem',
            },
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography 
        variant="h4" 
        sx={{ 
          fontWeight: 700, 
          color: '#1F2937',
          fontSize: '1.75rem',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Card>
  )
}

export default function ClientDelivery() {
  const [activeTab, setActiveTab] = useState(0)
  const [overallData, setOverallData] = useState<OverallAggregation | null>(null)
  const [domainData, setDomainData] = useState<DomainAggregation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [overall, domains] = await Promise.all([
          getClientDeliveryOverallStats(),
          getClientDeliveryDomainStats()
        ])
        setOverallData(overall)
        setDomainData(domains)
      } catch (error) {
        console.error('Failed to fetch client delivery summary data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    
    // Listen for S3 sync events to refresh summary data
    const handleS3Synced = () => {
      console.log('🔄 S3 synced, refreshing summary stats...')
      fetchData()
    }
    
    window.addEventListener('s3Synced', handleS3Synced)
    
    return () => {
      window.removeEventListener('s3Synced', handleS3Synced)
    }
  }, [])

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  return (
    <Box>
      {/* Header with Description and S3 Sync */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={40} thickness={4} />
        </Box>
      ) : overallData && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Total Tasks"
              value={overallData.task_count.toLocaleString()}
              icon={<AssignmentIcon />}
              color="#6B7280"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Work Items"
              value={overallData.work_items_count?.toLocaleString() || '0'}
              icon={<DeliveryIcon />}
              color="#06B6D4"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Total Trainers"
              value={overallData.trainer_count.toLocaleString()}
              icon={<SchoolIcon />}
              color="#3B82F6"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Total Reviewers"
              value={overallData.reviewer_count.toLocaleString()}
              icon={<ReviewIcon />}
              color="#8B5CF6"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Total Domains"
              value={overallData.domain_count.toLocaleString()}
              icon={<DomainIcon />}
              color="#f39c12"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <SummaryCard
              title="Quality Dimensions"
              value={overallData.quality_dimensions_count?.toLocaleString() || '0'}
              icon={<CategoryIcon />}
              color="#10B981"
            />
          </Grid>
        </Grid>
      )}

      {/* Upload Feedback Section */}
      <Box sx={{ mb: 3 }}>
        <FeedbackUpload />
      </Box>

      <Box 
        sx={{ 
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: 'white',
          borderRadius: '8px 8px 0 0',
          px: 0,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="pre-delivery tabs"
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: '0.9375rem',
              fontWeight: 500,
              minHeight: 48,
              px: 3,
              color: '#6B7280',
              transition: 'color 0.2s ease',
              '&.Mui-selected': {
                color: '#f39c12',
                fontWeight: 600,
              },
              '&:hover': {
                color: '#374151',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#f39c12',
              height: 2,
            },
          }}
        >
          <Tab
            icon={<BusinessIcon />}
            iconPosition="start"
            label="Domain wise"
            id="clientdelivery-tab-0"
            aria-controls="clientdelivery-tabpanel-0"
          />
          <Tab
            icon={<SchoolIcon />}
            iconPosition="start"
            label="Trainer wise"
            id="clientdelivery-tab-1"
            aria-controls="clientdelivery-tabpanel-1"
          />
          <Tab
            icon={<TrophyIcon />}
            iconPosition="start"
            label="Reviewer wise"
            id="clientdelivery-tab-2"
            aria-controls="clientdelivery-tabpanel-2"
          />
          <Tab
            icon={<CalibratorIcon />}
            iconPosition="start"
            label="Task wise"
            id="clientdelivery-tab-3"
            aria-controls="clientdelivery-tabpanel-3"
          />
          <Tab
            icon={<DeliveryIcon />}
            iconPosition="start"
            label="Delivery Tracker"
            id="clientdelivery-tab-4"
            aria-controls="clientdelivery-tabpanel-4"
          />
        </Tabs>
      </Box>

      <TabPanel value={activeTab} index={0}>
        <DomainWise isClientDelivery={true} />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <TrainerWise isClientDelivery={true} />
      </TabPanel>
      <TabPanel value={activeTab} index={2}>
        <ReviewerWise isClientDelivery={true} />
      </TabPanel>
      <TabPanel value={activeTab} index={3}>
        <TaskWise />
      </TabPanel>
      <TabPanel value={activeTab} index={4}>
        <DeliveryTracker />
      </TabPanel>
    </Box>
  )
}

