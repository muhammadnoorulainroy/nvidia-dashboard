import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Autocomplete,
  TextField,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
} from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'
import { getTooltipForHeader } from '../../utils/columnTooltips'
import { getPodLeadStats } from '../../services/api'
import type { PodLeadAggregation, ReviewerUnderPodLead } from '../../types'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

// Reviewer row under POD Lead
function ReviewerRow({ reviewer }: { reviewer: ReviewerUnderPodLead }) {
  return (
    <TableRow sx={{ backgroundColor: '#F0F4FF', '&:hover': { backgroundColor: '#E8EEFF' } }}>
      <TableCell sx={{ 
        position: 'sticky',
        left: 0,
        zIndex: 1,
        bgcolor: '#F0F4FF',
        borderRight: '2px solid #E2E8F0',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, ml: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
              ↳ {reviewer.reviewer_name || 'Unknown'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Reviewer ID: {reviewer.reviewer_id || 'N/A'}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
          {reviewer.reviewer_email || 'N/A'}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {reviewer.average_task_score?.toFixed(2) || 'N/A'}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {reviewer.task_count}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {reviewer.total_rework_count || 0}
        </Typography>
      </TableCell>
      <TableCell align="left">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {reviewer.average_rework_count?.toFixed(2) || '0.00'}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

// Expandable POD Lead row
function PodLeadRow({ 
  podLead
}: { 
  podLead: PodLeadAggregation
}) {
  const [open, setOpen] = useState(false)
  const hasReviewers = podLead.reviewers && podLead.reviewers.length > 0

  return (
    <>
      <TableRow 
        sx={{ 
          '&:hover': { backgroundColor: '#F9FAFB' },
          cursor: hasReviewers ? 'pointer' : 'default',
          backgroundColor: '#FFFBEB',
        }}
        onClick={() => hasReviewers && setOpen(!open)}
      >
        <TableCell sx={{ 
          position: 'sticky',
          left: 0,
          zIndex: 1,
          bgcolor: '#FFFBEB',
          borderRight: '2px solid #E2E8F0',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasReviewers && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            )}
            {!hasReviewers && <Box sx={{ width: 28 }} />}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#92400E' }}>
                👤 {podLead.pod_lead_name || 'Unknown'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID: {podLead.pod_lead_id || 'N/A'} • {podLead.reviewer_count} reviewers
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ color: '#1F2937', fontSize: '0.875rem' }}>
            {podLead.pod_lead_email || 'N/A'}
          </Typography>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.average_task_score?.toFixed(2) || 'N/A'}
          </Typography>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.task_count}
          </Typography>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.total_rework_count || 0}
          </Typography>
        </TableCell>
        <TableCell align="left">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.average_rework_count?.toFixed(2) || '0.00'}
          </Typography>
        </TableCell>
      </TableRow>
      {hasReviewers && open && podLead.reviewers.map((reviewer, idx) => (
        <ReviewerRow 
          key={reviewer.reviewer_id || idx} 
          reviewer={reviewer} 
        />
      ))}
    </>
  )
}

export default function PodLeadWise() {
  const [data, setData] = useState<PodLeadAggregation[]>([])
  const [filteredData, setFilteredData] = useState<PodLeadAggregation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPodLeads, setSelectedPodLeads] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [orderBy, setOrderBy] = useState<string>('pod_lead_name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      // Note: API returns PodLeadStats but component uses PodLeadAggregation
      // Type assertion used here - backend should be verified to match expected structure
      const result = await getPodLeadStats() as unknown as PodLeadAggregation[]
      setData(result)
      setFilteredData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch POD Lead statistics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Apply search filter
  useEffect(() => {
    let filtered = [...data]

    if (selectedPodLeads.length > 0) {
      filtered = filtered.filter(podLead => {
        const name = podLead.pod_lead_name || `ID: ${podLead.pod_lead_id}`
        const email = podLead.pod_lead_email ? ` (${podLead.pod_lead_email})` : ''
        const fullOption = `${name}${email}`
        return selectedPodLeads.includes(fullOption)
      })
    }

    setFilteredData(filtered)
    setPage(0)
  }, [selectedPodLeads, data])

  // Sorting
  const handleSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(property)
  }

  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any = a[orderBy as keyof PodLeadAggregation]
    let bValue: any = b[orderBy as keyof PodLeadAggregation]

    if (aValue === null || aValue === undefined) aValue = order === 'asc' ? Infinity : -Infinity
    if (bValue === null || bValue === undefined) bValue = order === 'asc' ? Infinity : -Infinity

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    return order === 'asc' ? aValue - bValue : bValue - aValue
  })

  const podLeadOptions = data.map(pl => {
    const name = pl.pod_lead_name || `ID: ${pl.pod_lead_id}`
    const email = pl.pod_lead_email ? ` (${pl.pod_lead_email})` : ''
    return `${name}${email}`
  })

  if (loading) {
    return <LoadingSpinner message="Loading POD Lead statistics..." />
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={fetchData} />
  }

  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <Box>
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        {/* Search/Filter Bar */}
        <Box sx={{ p: 2, backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 300 }}>
            <Autocomplete
              multiple
              options={podLeadOptions}
              value={selectedPodLeads}
              onChange={(_event, newValue) => setSelectedPodLeads(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  placeholder="Search POD Leads..."
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
                      backgroundColor: '#FDE68A',
                      color: '#92400E',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  />
                ))
              }
            />
          </Box>
          
          {selectedPodLeads.length > 0 && (
            <Chip
              icon={<FilterListIcon />}
              label="Clear All"
              size="small"
              onClick={() => setSelectedPodLeads([])}
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
        <Box sx={{ px: 2, py: 1, backgroundColor: '#FEF3C7', borderBottom: '1px solid #FCD34D' }}>
          <Typography variant="caption" sx={{ color: '#92400E' }}>
            👤 POD Leads with their reviewers • Click on a POD Lead to expand and see reviewers
          </Typography>
        </Box>

        {/* Table */}
        <TableContainer sx={{ maxHeight: 600, overflowX: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1000 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ 
                  fontWeight: 700, 
                  backgroundColor: '#F9FAFB', 
                  minWidth: 200,
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  borderRight: '2px solid #E2E8F0',
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TableSortLabel
                      active={orderBy === 'pod_lead_name'}
                      direction={orderBy === 'pod_lead_name' ? order : 'asc'}
                      onClick={() => handleSort('pod_lead_name')}
                    >
                      POD Lead
                    </TableSortLabel>
                    <Tooltip title={getTooltipForHeader('POD Lead / Trainer')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
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
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="left">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TableSortLabel
                      active={orderBy === 'average_task_score'}
                      direction={orderBy === 'average_task_score' ? order : 'asc'}
                      onClick={() => handleSort('average_task_score')}
                    >
                      Task Score
                    </TableSortLabel>
                    <Tooltip title={getTooltipForHeader('Task Score')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="left">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TableSortLabel
                      active={orderBy === 'task_count'}
                      direction={orderBy === 'task_count' ? order : 'asc'}
                      onClick={() => handleSort('task_count')}
                    >
                      Total Tasks
                    </TableSortLabel>
                    <Tooltip title={getTooltipForHeader('Unique Tasks')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="left">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TableSortLabel
                      active={orderBy === 'total_rework_count'}
                      direction={orderBy === 'total_rework_count' ? order : 'asc'}
                      onClick={() => handleSort('total_rework_count')}
                    >
                      Total Reworks
                    </TableSortLabel>
                    <Tooltip title={getTooltipForHeader('Rework')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="left">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TableSortLabel
                      active={orderBy === 'average_rework_count'}
                      direction={orderBy === 'average_rework_count' ? order : 'asc'}
                      onClick={() => handleSort('average_rework_count')}
                    >
                      Avg Rework
                    </TableSortLabel>
                    <Tooltip title={getTooltipForHeader('Avg Rework')} arrow placement="top" enterDelay={200} slotProps={{ tooltip: { sx: { bgcolor: '#1E293B', color: '#F8FAFC', fontSize: '0.75rem', maxWidth: 300, p: '8px 12px', borderRadius: 1 } } }}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: '#94A3B8', cursor: 'help', flexShrink: 0, visibility: 'visible !important', opacity: '1 !important', '&:hover': { color: '#64748B' } }} />
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((podLead) => (
                <PodLeadRow
                  key={podLead.pod_lead_id}
                  podLead={podLead}
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
