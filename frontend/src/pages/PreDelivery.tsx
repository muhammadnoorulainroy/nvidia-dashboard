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
  VerifiedUser as CalibratorIcon,
  Assignment as AssignmentIcon,
  RateReview as ReviewIcon,
  Category as CategoryIcon,
  Public as DomainIcon,
  SupervisorAccount as PodLeadIcon,
  Timeline as TimelineIcon,
  Folder as FolderIcon,
} from '@mui/icons-material'
import DomainWise from '../components/predelivery/DomainWise'
import TrainerWise from '../components/predelivery/TrainerWise'
import PodLeadTab from '../components/predelivery/PodLeadTab'
import ProjectsTab from '../components/predelivery/ProjectsTab'
import TaskWise from '../components/predelivery/TaskWise'
import RatingTrends from '../components/predelivery/RatingTrends'
import { getOverallStats, getDomainStats } from '../services/api'
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
      id={`predelivery-tabpanel-${index}`}
      aria-labelledby={`predelivery-tab-${index}`}
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
        p: 2.5,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          borderColor: '#CBD5E1',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 500, 
            fontSize: '0.8125rem', 
            color: '#64748B',
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            backgroundColor: `${color}12`,
            borderRadius: 1.5,
            p: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            '& svg': {
              fontSize: '1.25rem',
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
          color: '#0F172A',
          fontSize: '2rem',
          letterSpacing: '-0.025em',
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Card>
  )
}

export default function PreDelivery() {
  const [activeTab, setActiveTab] = useState(0)
  const [overallData, setOverallData] = useState<OverallAggregation | null>(null)
  const [domainData, setDomainData] = useState<DomainAggregation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [overall, domains] = await Promise.all([
          getOverallStats(),
          getDomainStats()
        ])
        setOverallData(overall)
        setDomainData(domains)
      } catch (error) {
        console.error('Failed to fetch pre-delivery summary data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  return (
    <Box>
      {/* Description */}
      <Box sx={{ mb: 3 }}>
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#64748B',
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
          <Grid item xs={12} sm={6} md={2.4}>
            <SummaryCard
              title="Total Tasks"
              value={overallData.task_count.toLocaleString()}
              icon={<AssignmentIcon />}
              color="#475569"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <SummaryCard
              title="Total Trainers"
              value={overallData.trainer_count.toLocaleString()}
              icon={<SchoolIcon />}
              color="#2563EB"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <SummaryCard
              title="Total Reviewers"
              value={overallData.reviewer_count.toLocaleString()}
              icon={<ReviewIcon />}
              color="#7C3AED"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <SummaryCard
              title="Total Domains"
              value={overallData.domain_count.toLocaleString()}
              icon={<DomainIcon />}
              color="#EA580C"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <SummaryCard
              title="Quality Dimensions"
              value={overallData.quality_dimensions.length.toLocaleString()}
              icon={<CategoryIcon />}
              color="#059669"
            />
          </Grid>
        </Grid>
      )}

      <Box 
        sx={{ 
          backgroundColor: '#FFFFFF',
          borderRadius: 2,
          border: '1px solid #E2E8F0',
          mb: 0,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="pre-delivery tabs"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 52,
            px: 1,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              minHeight: 52,
              px: 2.5,
              py: 1.5,
              color: '#64748B',
              transition: 'all 0.15s ease',
              borderRadius: 1.5,
              mx: 0.5,
              my: 0.75,
              '&.Mui-selected': {
                color: '#0F172A',
                fontWeight: 600,
                backgroundColor: '#F1F5F9',
              },
              '&:hover': {
                backgroundColor: '#F8FAFC',
                color: '#334155',
              },
              '& .MuiSvgIcon-root': {
                fontSize: '1.125rem',
                marginRight: 1,
              },
            },
            '& .MuiTabs-indicator': {
              display: 'none',
            },
          }}
        >
          <Tab
            icon={<FolderIcon />}
            iconPosition="start"
            label="Projects"
            id="predelivery-tab-0"
            aria-controls="predelivery-tabpanel-0"
          />
          <Tab
            icon={<BusinessIcon />}
            iconPosition="start"
            label="Domain wise"
            id="predelivery-tab-1"
            aria-controls="predelivery-tabpanel-1"
          />
          <Tab
            icon={<SchoolIcon />}
            iconPosition="start"
            label="Trainer wise"
            id="predelivery-tab-2"
            aria-controls="predelivery-tabpanel-2"
          />
          <Tab
            icon={<PodLeadIcon />}
            iconPosition="start"
            label="POD Lead"
            id="predelivery-tab-3"
            aria-controls="predelivery-tabpanel-3"
          />
          <Tab
            icon={<CalibratorIcon />}
            iconPosition="start"
            label="Task wise"
            id="predelivery-tab-4"
            aria-controls="predelivery-tabpanel-4"
          />
          <Tab
            icon={<TimelineIcon />}
            iconPosition="start"
            label="Rating Trends"
            id="predelivery-tab-5"
            aria-controls="predelivery-tabpanel-5"
          />
        </Tabs>
      </Box>

      <TabPanel value={activeTab} index={0}>
        <ProjectsTab />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <DomainWise />
      </TabPanel>
      <TabPanel value={activeTab} index={2}>
        <TrainerWise />
      </TabPanel>
      <TabPanel value={activeTab} index={3}>
        <PodLeadTab />
      </TabPanel>
      <TabPanel value={activeTab} index={4}>
        <TaskWise />
      </TabPanel>
      <TabPanel value={activeTab} index={5}>
        <RatingTrends />
      </TabPanel>
    </Box>
  )
}

