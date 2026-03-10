import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Alert,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email: email.trim() })
      setSent(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Something went wrong. Please try again.')
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
          Reset Password
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
          Enter your email and we'll send you a reset link
        </Typography>

        {sent ? (
          <>
            <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
              If that email is registered, a password reset link has been sent. Check your inbox.
            </Alert>
            <Button
              component={RouterLink} to="/login"
              variant="contained" fullWidth
              sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600 }}
            >
              Back to Sign In
            </Button>
          </>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
            <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
              <TextField
                label="Email"
                type="email"
                fullWidth required size="small"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 3 }}
                autoFocus
              />
              <Button
                type="submit" variant="contained" fullWidth
                disabled={loading || !email.trim()}
                sx={{ bgcolor: '#76B900', '&:hover': { bgcolor: '#5A8F00' }, textTransform: 'none', fontWeight: 600, py: 1.2 }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : 'Send Reset Link'}
              </Button>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 3, color: '#94A3B8' }}>
              Remember your password?{' '}
              <Typography
                component={RouterLink} to="/login" variant="caption"
                sx={{ color: '#76B900', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                Sign in
              </Typography>
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  )
}
