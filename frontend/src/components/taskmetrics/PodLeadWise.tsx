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
import { getPodLeadStats, PodLeadStats, TrainerUnderPod } from '../../services/api'
import LoadingSpinner from '../LoadingSpinner'
import ErrorDisplay from '../ErrorDisplay'

// Trainer row under POD Lead
function TrainerRow({ trainer }: { trainer: TrainerUnderPod }) {
  return (
    <TableRow sx={{ backgroundColor: '#F0F4FF', '&:hover': { backgroundColor: '#E8EEFF' } }}>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, ml: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
              ↳ {trainer.trainer_name || 'Unknown'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {trainer.trainer_email || 'N/A'}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {trainer.unique_tasks}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {trainer.new_tasks}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {trainer.rework}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {trainer.ready_for_delivery}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
          {trainer.avg_rating?.toFixed(2) || 'N/A'}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

// Expandable POD Lead row
function PodLeadRow({ 
  podLead
}: { 
  podLead: PodLeadStats
}) {
  const [open, setOpen] = useState(false)
  const hasTrainers = podLead.trainers && podLead.trainers.length > 0

  return (
    <>
      <TableRow 
        sx={{ 
          '&:hover': { backgroundColor: '#F9FAFB' },
          cursor: hasTrainers ? 'pointer' : 'default',
          backgroundColor: '#FFFBEB',
        }}
        onClick={() => hasTrainers && setOpen(!open)}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasTrainers && (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            )}
            {!hasTrainers && <Box sx={{ width: 28 }} />}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#92400E' }}>
                👤 {podLead.pod_lead_name || 'Unknown'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {podLead.pod_lead_email || 'N/A'} • {podLead.trainer_count} trainers
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.unique_tasks}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.new_tasks}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.rework}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.ready_for_delivery}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
            {podLead.avg_rating?.toFixed(2) || 'N/A'}
          </Typography>
        </TableCell>
      </TableRow>
      {hasTrainers && open && podLead.trainers.map((trainer, idx) => (
        <TrainerRow 
          key={trainer.trainer_email || idx} 
          trainer={trainer} 
        />
      ))}
    </>
  )
}

export default function PodLeadWise() {
  const [data, setData] = useState<PodLeadStats[]>([])
  const [filteredData, setFilteredData] = useState<PodLeadStats[]>([])
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
      const result = await getPodLeadStats()
      setData(result)
      setFilteredData(result)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch POD Lead statistics'
      setError(errorMessage)
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
        const name = podLead.pod_lead_name || 'Unknown'
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
    const aValue = a[orderBy as keyof PodLeadStats]
    const bValue = b[orderBy as keyof PodLeadStats]

    // Handle null/undefined
    if (aValue === null || aValue === undefined) return order === 'asc' ? 1 : -1
    if (bValue === null || bValue === undefined) return order === 'asc' ? -1 : 1

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return order === 'asc' ? aValue - bValue : bValue - aValue
    }

    return 0
  })

  const podLeadOptions = data.map(pl => {
    const name = pl.pod_lead_name || 'Unknown'
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
            👤 POD Leads with their trainers • Click on a POD Lead to expand and see trainers
          </Typography>
        </Box>

        {/* Table */}
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB', minWidth: 200 }}>
                  <TableSortLabel
                    active={orderBy === 'pod_lead_name'}
                    direction={orderBy === 'pod_lead_name' ? order : 'asc'}
                    onClick={() => handleSort('pod_lead_name')}
                  >
                    POD Lead
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="center">
                  <TableSortLabel
                    active={orderBy === 'unique_tasks'}
                    direction={orderBy === 'unique_tasks' ? order : 'asc'}
                    onClick={() => handleSort('unique_tasks')}
                  >
                    Unique Tasks
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="center">
                  <TableSortLabel
                    active={orderBy === 'new_tasks'}
                    direction={orderBy === 'new_tasks' ? order : 'asc'}
                    onClick={() => handleSort('new_tasks')}
                  >
                    New Tasks
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="center">
                  <TableSortLabel
                    active={orderBy === 'rework'}
                    direction={orderBy === 'rework' ? order : 'asc'}
                    onClick={() => handleSort('rework')}
                  >
                    Rework
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="center">
                  <TableSortLabel
                    active={orderBy === 'ready_for_delivery'}
                    direction={orderBy === 'ready_for_delivery' ? order : 'asc'}
                    onClick={() => handleSort('ready_for_delivery')}
                  >
                    Ready for Delivery
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, backgroundColor: '#F9FAFB' }} align="center">
                  <TableSortLabel
                    active={orderBy === 'avg_rating'}
                    direction={orderBy === 'avg_rating' ? order : 'asc'}
                    onClick={() => handleSort('avg_rating')}
                  >
                    Avg Rating
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((podLead, index) => (
                <PodLeadRow
                  key={podLead.pod_lead_email || index}
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
