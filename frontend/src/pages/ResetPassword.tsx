import { useState } from 'react'
import { useSearchParams, useNavigate, Link as RouterLink } from 'react-router-dom'
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

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, { token, password })
      setSuccess(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Reset failed. The link may be invalid or expired.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
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
          <Alert severity="error">Invalid reset link. Please request a new one.</Alert>
          <Button
            component={RouterLink} to="/forgot-password"
            variant="contained" fullWidth sx={{ mt: 2, bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600 }}
          >
            Request New Link
          </Button>
        </Paper>
      </Box>
    )
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
          Set New Password
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
          Choose a new password for your account
        </Typography>

        {success ? (
          <>
            <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
              Password reset successfully!
            </Alert>
            <Button
              variant="contained" fullWidth
              onClick={() => navigate('/login', { replace: true })}
              sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600 }}
            >
              Go to Sign In
            </Button>
          </>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
            <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
              <TextField
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth required size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText="At least 8 characters"
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
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth required size="small"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                sx={{ mb: 3 }}
              />
              <Button
                type="submit" variant="contained" fullWidth
                disabled={loading || !password || !confirmPassword}
                sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600, py: 1.2 }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Reset Password'}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  )
}
