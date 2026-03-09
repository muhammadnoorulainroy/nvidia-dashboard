import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { Box, Typography, Paper, Alert } from '@mui/material'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    setError(null)
    try {
      if (!credentialResponse.credential) {
        setError('No credential received from Google')
        return
      }
      await login(credentialResponse.credential)
      navigate('/task-metrics', { replace: true })
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || 'Authentication failed. Please contact an admin.'
      setError(msg)
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
        sx={{
          p: 5,
          maxWidth: 420,
          width: '100%',
          borderRadius: 3,
          textAlign: 'center',
        }}
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
        <Typography variant="body2" sx={{ color: '#64748B', mb: 4 }}>
          Sign in with your Google account to continue
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Google sign-in failed. Please try again.')}
            theme="outline"
            size="large"
            shape="pill"
            width="300"
          />
        </Box>

        <Typography variant="caption" sx={{ display: 'block', mt: 4, color: '#94A3B8' }}>
          Only authorised users can access this dashboard.
          <br />
          Contact an admin if you need access.
        </Typography>
      </Paper>
    </Box>
  )
}
