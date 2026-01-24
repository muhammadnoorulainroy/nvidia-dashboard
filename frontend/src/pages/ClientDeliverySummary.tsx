import { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as PendingIcon,
  Description as FileIcon,
  Star as StarIcon,
  People as PeopleIcon,
  Assignment as AssignmentIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ResponsiveSankey } from '@nivo/sankey'
import axios from 'axios'

interface ClientDeliverySummary {
  total_tasks_delivered: number
  total_tasks_rejected: number
  total_tasks_accepted: number
  total_tasks_pending: number
  total_files: number
  average_turing_rating: number
  total_annotators: number
}

interface TimelineData {
  date: string
  total: number
  rejected: number
  approved: number
  pending: number
  average_rating: number
}

interface QualityTimelineData {
  date: string
  [key: string]: string | number  // Dynamic quality dimensions
}

interface SankeyData {
  nodes: Array<{ id: string; nodeColor?: string }>
  links: Array<{ source: string; target: string; value: number }>
}

interface DateSummary {
  delivery_date: string
  total_delivered: number
  with_client_status: number
  approved_count: number
}

interface QualitySummary {
  delivery_date: string
  [key: string]: string | number  // Dynamic quality dimensions
}

interface SummaryCardProps {
  title: string
  value: string
  icon: React.ReactNode
  color: string
  bgColor: string
}

function SummaryCard({ title, value, icon, color, bgColor }: SummaryCardProps) {
  return (
    <Card
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        border: `1px solid #E5E7EB`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 2,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 4px 12px rgba(0, 0, 0, 0.1)`,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            backgroundColor: bgColor,
            borderRadius: 2,
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography
        variant="h3"
        sx={{
          fontWeight: 700,
          color: '#1F2937',
          fontSize: '2rem',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </Typography>
    </Card>
  )
}

export default function ClientDeliverySummary() {
  const [data, setData] = useState<ClientDeliverySummary | null>(null)
  const [timelineData, setTimelineData] = useState<TimelineData[]>([])
  const [qualityTimelineData, setQualityTimelineData] = useState<QualityTimelineData[]>([])
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null)
  const [dateSummary, setDateSummary] = useState<DateSummary[]>([])
  const [qualitySummary, setQualitySummary] = useState<QualitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [summaryResponse, timelineResponse, qualityTimelineResponse, sankeyResponse, dateSummaryResponse, qualitySummaryResponse] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-summary`),
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-timeline`),
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-quality-timeline`),
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-sankey`),
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-date-summary`),
          axios.get(`${import.meta.env.VITE_API_URL || ''}/api/client-delivery-quality-summary`)
        ])
        setData(summaryResponse.data)
        setTimelineData(timelineResponse.data)
        setQualityTimelineData(qualityTimelineResponse.data)
        setSankeyData(sankeyResponse.data)
        setDateSummary(dateSummaryResponse.data)
        setQualitySummary(qualitySummaryResponse.data)
      } catch (err: any) {
        console.error('Failed to fetch client delivery data:', err)
        setError(err.message || 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Listen for S3 sync events to refresh data
    const handleS3Synced = () => {
      console.log('🔄 S3 synced, refreshing summary data...')
      fetchData()
    }

    window.addEventListener('s3Synced', handleS3Synced)

    return () => {
      window.removeEventListener('s3Synced', handleS3Synced)
    }
  }, [])

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress size={60} thickness={4} />
      </Box>
    )
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">
          {error || 'Failed to load client delivery summary'}
        </Typography>
      </Box>
    )
  }

  const summaryCards = [
    {
      title: 'Tasks Delivered',
      value: data.total_tasks_delivered.toLocaleString(),
      icon: <AssignmentIcon />,
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    {
      title: 'Tasks Accepted',
      value: data.total_tasks_accepted.toLocaleString(),
      icon: <CheckCircleIcon />,
      color: '#059669',
      bgColor: '#A7F3D0',
    },
    {
      title: 'Tasks Rejected',
      value: data.total_tasks_rejected.toLocaleString(),
      icon: <CancelIcon />,
      color: '#EF4444',
      bgColor: '#FEE2E2',
    },
    {
      title: 'Tasks Pending',
      value: data.total_tasks_pending.toLocaleString(),
      icon: <PendingIcon />,
      color: '#F59E0B',
      bgColor: '#FEF3C7',
    },
    {
      title: 'Files Delivered',
      value: data.total_files.toLocaleString(),
      icon: <FileIcon />,
      color: '#3B82F6',
      bgColor: '#DBEAFE',
    },
    {
      title: 'Avg Turing Rating',
      value: data.average_turing_rating.toFixed(2),
      icon: <StarIcon />,
      color: '#F59E0B',
      bgColor: '#FDE68A',
    },
    {
      title: 'Total Annotators',
      value: data.total_annotators.toLocaleString(),
      icon: <PeopleIcon />,
      color: '#8B5CF6',
      bgColor: '#EDE9FE',
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
            Comprehensive overview of client delivery metrics and performance indicators
          </Typography>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {summaryCards.map((card, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <SummaryCard
                title={card.title}
                value={card.value}
                icon={card.icon}
                color={card.color}
                bgColor={card.bgColor}
              />
            </Grid>
          ))}
        </Grid>

        {/* Delivery Date Summary Table */}
        {dateSummary.length > 0 && (
          <Paper
            sx={{
              p: 3,
              mb: 4,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 2,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: '#1F2937',
                mb: 3,
              }}
            >
              Delivery Date Summary
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableCell sx={{ fontWeight: 700, color: '#1F2937', fontSize: '0.875rem' }}>
                      Delivery Date
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937', fontSize: '0.875rem' }}>
                      Total Delivered
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937', fontSize: '0.875rem' }}>
                      Processed by Client
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#1F2937', fontSize: '0.875rem' }}>
                      Approved Count
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dateSummary.map((row, index) => (
                    <TableRow
                      key={row.delivery_date}
                      sx={{
                        '&:hover': { backgroundColor: '#F9FAFB' },
                        borderBottom: index === dateSummary.length - 1 ? 'none' : '1px solid #E5E7EB',
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.875rem', color: '#1F2937', fontWeight: 600 }}>
                        {row.delivery_date}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.875rem', color: '#000000', fontWeight: 700 }}>
                        {row.total_delivered}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.875rem', color: '#000000', fontWeight: 700 }}>
                        {row.with_client_status} ({row.total_delivered > 0 ? ((row.with_client_status / row.total_delivered) * 100).toFixed(1) : 0}%)
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          component="span"
                          sx={{
                            px: 1.5,
                            py: 0.5,
                            backgroundColor: row.with_client_status === 0 ? '#F3F4F6' : row.approved_count > 0 ? '#D1FAE5' : '#E5E7EB',
                            color: row.with_client_status === 0 ? '#9CA3AF' : row.approved_count > 0 ? '#065F46' : '#6B7280',
                            borderRadius: 1,
                            fontSize: '0.875rem',
                            fontWeight: 600,
                          }}
                        >
                          {row.with_client_status === 0 ? 'NA' : `${row.approved_count} (${row.total_delivered > 0 ? ((row.approved_count / row.total_delivered) * 100).toFixed(1) : 0}%)`}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Quality Dimensions Summary Table */}
        {qualitySummary.length > 0 && (() => {
          // Get all unique quality dimensions from the data
          const dimensionSet = new Set<string>()
          qualitySummary.forEach(item => {
            Object.keys(item).forEach(key => {
              if (key !== 'delivery_date') {
                dimensionSet.add(key)
              }
            })
          })
          
          // Sort dimensions with Turing Score first, then Turing Overall QD Score, then alphabetically
          const dimensionsArray = Array.from(dimensionSet)
          const turingScore = dimensionsArray.find(d => d === 'Turing Score')
          const turingQDScore = dimensionsArray.find(d => d === 'Turing Overall QD Score')
          const otherDimensions = dimensionsArray
            .filter(d => d !== 'Turing Score' && d !== 'Turing Overall QD Score')
            .sort()
          
          const dimensions = [
            ...(turingScore ? [turingScore] : []),
            ...(turingQDScore ? [turingQDScore] : []),
            ...otherDimensions
          ]
          
          return (
            <Paper
              sx={{
                p: 3,
                mt: 4,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 2,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: '#1F2937',
                  mb: 3,
                }}
              >
                Quality Dimensions Average Ratings by Date
              </Typography>
              <TableContainer sx={{ maxHeight: 600, overflowX: 'auto', overflowY: 'auto' }}>
                <Table stickyHeader sx={{ minWidth: 1200 }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#F9FAFB' }}>
                      <TableCell 
                        sx={{ 
                          fontWeight: 700, 
                          color: '#1F2937', 
                          fontSize: '0.875rem',
                          minWidth: 120,
                          position: 'sticky',
                          left: 0,
                          backgroundColor: '#F9FAFB',
                          zIndex: 3
                        }}
                      >
                        Delivery Date
                      </TableCell>
                      {dimensions.map((dimension) => (
                        <TableCell 
                          key={dimension} 
                          align="right" 
                          sx={{ 
                            fontWeight: 700, 
                            color: '#1F2937', 
                            fontSize: '0.875rem',
                            minWidth: 180,
                            whiteSpace: 'nowrap',
                            paddingX: 3
                          }}
                        >
                          {dimension}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {qualitySummary.map((row, index) => (
                      <TableRow
                        key={row.delivery_date}
                        sx={{
                          '&:hover': { backgroundColor: '#F9FAFB' },
                          borderBottom: index === qualitySummary.length - 1 ? 'none' : '1px solid #E5E7EB',
                        }}
                      >
                        <TableCell 
                          sx={{ 
                            fontSize: '0.875rem', 
                            color: '#1F2937', 
                            fontWeight: 600,
                            position: 'sticky',
                            left: 0,
                            backgroundColor: '#FFFFFF',
                            zIndex: 2,
                            minWidth: 120
                          }}
                        >
                          {row.delivery_date}
                        </TableCell>
                        {dimensions.map((dimension) => {
                          const score = typeof row[dimension] === 'number' ? row[dimension] as number : 0
                          return (
                            <TableCell 
                              key={dimension} 
                              align="right"
                              sx={{ 
                                minWidth: 180,
                                paddingX: 3
                              }}
                            >
                              <Box
                                component="span"
                                sx={{
                                  px: 2,
                                  py: 0.75,
                                  backgroundColor: score >= 4.5 ? '#D1FAE5' : 
                                                 score >= 4.0 ? '#FEF3C7' : 
                                                 score >= 3.0 ? '#FED7AA' : '#FEE2E2',
                                  color: score >= 4.5 ? '#065F46' : 
                                         score >= 4.0 ? '#92400E' : 
                                         score >= 3.0 ? '#9A3412' : '#991B1B',
                                  borderRadius: 1,
                                  fontSize: '0.875rem',
                                  fontWeight: 700,
                                  display: 'inline-block',
                                  minWidth: 60
                                }}
                              >
                                {score > 0 ? score.toFixed(2) : '-'}
                              </Box>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )
        })()}

        {/* Sankey Diagram: Total → Date → Domain → Status Flow */}
        {sankeyData && sankeyData.nodes && sankeyData.nodes.length > 0 && (
          <Paper
            sx={{
              p: 3,
              mt: 4,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 2,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: '#1F2937',
                mb: 3,
              }}
            >
              Delivery Flow: Total → Date → Domain → Status
            </Typography>
            <Box sx={{ height: 600 }}>
              <ResponsiveSankey
                data={sankeyData}
                margin={{ top: 20, right: 160, bottom: 20, left: 160 }}
                align="justify"
                colors={(node: any) => node.nodeColor || '#3B82F6'}
                nodeOpacity={1}
                nodeThickness={18}
                nodeSpacing={24}
                nodeBorderWidth={0}
                linkOpacity={0.5}
                linkHoverOpacity={0.8}
                linkContract={3}
                enableLinkGradient={true}
                label={(node: any) => {
                  // Extract readable labels from node IDs
                  const nodeId = node.id as string
                  if (nodeId.startsWith('date_')) {
                    return nodeId.replace('date_', '')
                  } else if (nodeId.startsWith('domain_')) {
                    // Extract domain name from "domain_DOMAINNAME"
                    return nodeId.replace('domain_', '')
                  }
                  return nodeId
                }}
                labelPosition="outside"
                labelOrientation="horizontal"
                labelPadding={16}
                labelTextColor="#1F2937"
                theme={{
                  fontSize: 12,
                  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                }}
              />
            </Box>
          </Paper>
        )}
      </Container>
    </Box>
  )
}

