import { useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Alert,
  TextField,
  Button,
  Divider,
  InputAdornment,
  IconButton,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await login(email.trim(), password)
      if (result.must_change_password) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/task-metrics', { replace: true })
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Authentication failed. Please try again.')
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
      <Paper
        elevation={8}
        sx={{ p: 5, maxWidth: 420, width: '100%', borderRadius: 3, textAlign: 'center' }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #76B900 0%, #5A8F00 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
            boxShadow: '0 4px 14px rgba(118, 185, 0, 0.35)',
          }}
        >
          <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '24px' }}>N</Typography>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, color: '#1E293B' }}>
          NVIDIA Dashboard
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
          Sign in to continue
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            required
            size="small"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ mb: 2 }}
            autoFocus
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            required
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 1 }}
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
          <Box sx={{ textAlign: 'right', mb: 2 }}>
            <Typography
              component={RouterLink}
              to="/forgot-password"
              variant="caption"
              sx={{ color: '#76B900', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Forgot password?
            </Typography>
          </Box>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !email.trim() || !password}
            sx={{
              bgcolor: '#76B900',
              '&:hover': { bgcolor: '#5A8F00' },
              textTransform: 'none',
              fontWeight: 600,
              py: 1.2,
            }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
          </Button>
        </Box>

        <Divider sx={{ my: 3, color: '#CBD5E1', fontSize: '0.75rem' }}>or</Divider>

        <Tooltip title="Google Sign-In is not available at the moment" arrow>
          <span>
            <Button
              variant="outlined"
              fullWidth
              disabled
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                py: 1.1,
                borderColor: '#E2E8F0',
                color: '#94A3B8',
              }}
              startIcon={
                <Box
                  component="img"
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt=""
                  sx={{ width: 18, height: 18 }}
                />
              }
            >
              Sign in with Google
            </Button>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#CBD5E1', fontStyle: 'italic' }}>
          Google Sign-In coming soon
        </Typography>

        <Typography variant="caption" sx={{ display: 'block', mt: 3, color: '#94A3B8' }}>
          Only authorised users can access this dashboard.
          <br />
          Contact an admin if you need access.
        </Typography>
      </Paper>
    </Box>
  )
}
