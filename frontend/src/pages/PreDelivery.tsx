import { useState, useCallback } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Grid,
  Card,
  Skeleton,
} from '@mui/material'
import {
  Business as BusinessIcon,
  School as SchoolIcon,
  VerifiedUser as CalibratorIcon,
  Assignment as AssignmentIcon,
  RateReview as ReviewIcon,
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
  loading?: boolean
}

function SummaryCard({ title, value, icon, color, loading = false }: SummaryCardProps) {
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
      {loading ? (
        <Skeleton variant="text" width="60%" height={40} />
      ) : (
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
      )}
    </Card>
  )
}

// Summary stats interface that tabs can report
export interface TabSummaryStats {
  totalTasks: number
  totalTrainers: number
  totalPodLeads: number
  totalProjects: number
  totalReviews: number
  newTasks: number
  rework: number
}

export default function PreDelivery() {
  const [activeTab, setActiveTab] = useState(0)
  const [summaryStats, setSummaryStats] = useState<TabSummaryStats | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  // Callback for tabs to report their summary stats
  const onSummaryUpdate = useCallback((stats: TabSummaryStats) => {
    setSummaryStats(stats)
    setSummaryLoading(false)
  }, [])

  // Called when tab data is loading
  const onSummaryLoading = useCallback(() => {
    setSummaryLoading(true)
  }, [])

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
    setSummaryLoading(true) // Show loading when switching tabs
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

      {/* Summary Cards - Dynamic based on active tab */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Projects"
            value={summaryStats?.totalProjects.toLocaleString() ?? '-'}
            icon={<FolderIcon />}
            color="#10B981"
            loading={summaryLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="POD Leads"
            value={summaryStats?.totalPodLeads.toLocaleString() ?? '-'}
            icon={<PodLeadIcon />}
            color="#8B5CF6"
            loading={summaryLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Trainers"
            value={summaryStats?.totalTrainers.toLocaleString() ?? '-'}
            icon={<SchoolIcon />}
            color="#2563EB"
            loading={summaryLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Total Tasks"
            value={summaryStats?.totalTasks.toLocaleString() ?? '-'}
            icon={<AssignmentIcon />}
            color="#475569"
            loading={summaryLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="New Tasks"
            value={summaryStats?.newTasks.toLocaleString() ?? '-'}
            icon={<AssignmentIcon />}
            color="#059669"
            loading={summaryLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Reviews"
            value={summaryStats?.totalReviews.toLocaleString() ?? '-'}
            icon={<ReviewIcon />}
            color="#F59E0B"
            loading={summaryLoading}
          />
        </Grid>
      </Grid>

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
        <ProjectsTab onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <DomainWise onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
      <TabPanel value={activeTab} index={2}>
        <TrainerWise onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
      <TabPanel value={activeTab} index={3}>
        <PodLeadTab onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
      <TabPanel value={activeTab} index={4}>
        <TaskWise onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
      <TabPanel value={activeTab} index={5}>
        <RatingTrends onSummaryUpdate={onSummaryUpdate} onSummaryLoading={onSummaryLoading} />
      </TabPanel>
    </Box>
  )
}
