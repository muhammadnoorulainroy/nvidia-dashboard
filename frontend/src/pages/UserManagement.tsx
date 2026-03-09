import { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Alert,
  Tooltip,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'

interface DashboardUser {
  id: number
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string | null
  last_login: string | null
}

function authHeaders(token: string | null) {
  return { headers: { Authorization: `Bearer ${token}` } }
}

export default function UserManagement() {
  const { token } = useAuth()
  const [users, setUsers] = useState<DashboardUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('user')

  const [editUser, setEditUser] = useState<DashboardUser | null>(null)
  const [editRole, setEditRole] = useState('user')

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/users`, authHeaders(token))
      setUsers(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to fetch users')
    }
  }, [token])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleAdd = async () => {
    setError(null)
    try {
      await axios.post(
        `${API_BASE}/users`,
        { email: newEmail.trim(), role: newRole, name: newName.trim() || undefined },
        authHeaders(token),
      )
      setSuccess(`User ${newEmail} added`)
      setAddOpen(false)
      setNewEmail('')
      setNewName('')
      setNewRole('user')
      fetchUsers()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add user')
    }
  }

  const handleUpdate = async () => {
    if (!editUser) return
    setError(null)
    try {
      await axios.put(
        `${API_BASE}/users/${editUser.id}`,
        { role: editRole },
        authHeaders(token),
      )
      setSuccess(`Updated ${editUser.email}`)
      setEditUser(null)
      fetchUsers()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update user')
    }
  }

  const handleDelete = async (u: DashboardUser) => {
    if (!window.confirm(`Remove ${u.email} from the dashboard?`)) return
    setError(null)
    try {
      await axios.delete(`${API_BASE}/users/${u.id}`, authHeaders(token))
      setSuccess(`Removed ${u.email}`)
      fetchUsers()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete user')
    }
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E293B' }}>
          User Management
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
          sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600 }}
        >
          Add User
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Last Login</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ fontSize: '0.85rem' }}>{u.email}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem', color: '#64748B' }}>{u.name || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={u.role}
                    size="small"
                    color={u.role === 'admin' ? 'warning' : 'default'}
                    sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={u.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={u.is_active ? 'success' : 'default'}
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: '#64748B' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit role">
                    <IconButton size="small" onClick={() => { setEditUser(u); setEditRole(u.role) }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove user">
                    <IconButton size="small" color="error" onClick={() => handleDelete(u)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: '#94A3B8' }}>
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add User</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            size="small"
          />
          <FormControl fullWidth size="small">
            <InputLabel>Role</InputLabel>
            <Select value={newRole} label="Role" onChange={(e) => setNewRole(e.target.value)}>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!newEmail.trim()}
            sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none' }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Role — {editUser?.email}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <FormControl fullWidth size="small">
            <InputLabel>Role</InputLabel>
            <Select value={editRole} label="Role" onChange={(e) => setEditRole(e.target.value)}>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditUser(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate}
            sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none' }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
