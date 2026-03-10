import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Alert,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'

export default function ChangePassword() {
  const { token, updateToken, mustChangePassword } = useAuth()
  const navigate = useNavigate()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post(
        `${API_BASE}/auth/change-password`,
        { current_password: currentPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.data.access_token) {
        updateToken(res.data.access_token)
      }
      navigate('/task-metrics', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      }}
    >
      <Paper elevation={8} sx={{ p: 5, maxWidth: 420, width: '100%', borderRadius: 3, textAlign: 'center' }}>
        <Box
          sx={{
            width: 56, height: 56, borderRadius: 2,
            background: 'linear-gradient(135deg, #76B900 0%, #5A8F00 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 2,
            boxShadow: '0 4px 14px rgba(118, 185, 0, 0.35)',
          }}
        >
          <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '24px' }}>N</Typography>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, color: '#1E293B' }}>
          Change Password
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
          {mustChangePassword
            ? 'You must change your default password before continuing'
            : 'Choose a new password for your account'}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
          <TextField
            label="Current Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth required size="small"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            sx={{ mb: 2 }}
            autoFocus
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth required size="small"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="At least 8 characters"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Confirm New Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth required size="small"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            sx={{ mb: 3 }}
          />
          <Button
            type="submit" variant="contained" fullWidth
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600, py: 1.2 }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Change Password'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
