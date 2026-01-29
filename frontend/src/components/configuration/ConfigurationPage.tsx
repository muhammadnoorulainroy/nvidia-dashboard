import { useState } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Typography,
} from '@mui/material'
import {
  Settings as SettingsIcon,
  AccessTime as AccessTimeIcon,
  TrackChanges as TrackChangesIcon,
  TuneOutlined as TuneIcon,
} from '@mui/icons-material'
import AHTConfigTab from './AHTConfigTab'
import TargetsConfigTab from './TargetsConfigTab'

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
      id={`config-tabpanel-${index}`}
      aria-labelledby={`config-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

export default function ConfigurationPage() {
  const [activeTab, setActiveTab] = useState(0)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <SettingsIcon sx={{ fontSize: 32, color: '#2E5CFF' }} />
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1E293B' }}>
            Configuration
          </Typography>
        </Box>
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#64748B',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            maxWidth: 800
          }}
        >
          Manage system settings and customize parameters for your dashboard. Configure time estimates, 
          thresholds, and other settings to match your project requirements.
        </Typography>
      </Box>

      {/* Tabs Container */}
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
          aria-label="configuration tabs"
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
            icon={<AccessTimeIcon />}
            iconPosition="start"
            label="Expected AHT"
            id="config-tab-0"
            aria-controls="config-tabpanel-0"
          />
          <Tab
            icon={<TrackChangesIcon />}
            iconPosition="start"
            label="Throughput Targets"
            id="config-tab-1"
            aria-controls="config-tabpanel-1"
          />
          {/* Future tabs can be added here */}
          {/* 
          <Tab
            icon={<TuneIcon />}
            iconPosition="start"
            label="Performance Weights"
            id="config-tab-2"
            aria-controls="config-tabpanel-2"
          />
          */}
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={activeTab} index={0}>
        <AHTConfigTab />
      </TabPanel>
      <TabPanel value={activeTab} index={1}>
        <TargetsConfigTab />
      </TabPanel>
      
      {/* Future tab panels can be added here */}
      {/*
      <TabPanel value={activeTab} index={2}>
        <PerformanceWeightsTab />
      </TabPanel>
      */}
    </Box>
  )
}
