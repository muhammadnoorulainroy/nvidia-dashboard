import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Avatar,
  Tooltip,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Business as BusinessIcon,
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  GridView as GridViewIcon,
  FactCheck as FactCheckIcon,
  People as PeopleIcon,
  Logout as LogoutIcon,
  Summarize as SummarizeIcon,
  Lock as LockIcon,
} from '@mui/icons-material'
import axios from 'axios'
import SyncStatus from './common/SyncStatus'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_PREFIX || '/api'

const drawerWidth = 64

interface MenuItem {
  text: string
  icon: JSX.Element
  path: string
  adminOnly?: boolean
}

const menuItems: MenuItem[] = [
  { text: 'Task Metrics', icon: <BusinessIcon />, path: '/task-metrics' },
  { text: 'Project Summary', icon: <SummarizeIcon />, path: '/project-summary' },
  { text: 'Team Overview', icon: <GridViewIcon />, path: '/team-overview' },
  { text: 'Analytics', icon: <AnalyticsIcon />, path: '/analytics' },
  { text: 'Quality Rubrics', icon: <FactCheckIcon />, path: '/quality-rubrics' },
  { text: 'Configuration', icon: <SettingsIcon />, path: '/configuration' },
  { text: 'User Management', icon: <PeopleIcon />, path: '/users', adminOnly: true },
]

interface LayoutProps {
  children: React.ReactNode
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, updateToken } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    setError('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
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
      setSuccess(true)
      setTimeout(handleClose, 1500)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon sx={{ fontSize: 20, color: '#4F46E5' }} />
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Change Password</Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, fontSize: '0.8rem' }}>Password changed successfully</Alert>}
        <TextField
          label="Current Password"
          type="password"
          fullWidth
          size="small"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={loading || success}
          sx={{ mb: 2, mt: 1 }}
          autoFocus
        />
        <TextField
          label="New Password"
          type="password"
          fullWidth
          size="small"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading || success}
          helperText="Minimum 8 characters"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Confirm New Password"
          type="password"
          fullWidth
          size="small"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading || success}
          sx={{ mb: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} size="small" sx={{ color: '#64748B', textTransform: 'none', fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          size="small"
          disabled={loading || success}
          sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#4F46E5', '&:hover': { bgcolor: '#4338CA' } }}
        >
          {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Change Password'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pwDialogOpen, setPwDialogOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { user, isAdmin, logout } = useAuth()

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleNavigation = (path: string) => {
    navigate(path)
    if (isMobile) {
      setMobileOpen(false)
    }
  }

  const drawer = (
    <Box sx={{ height: '100%', backgroundColor: '#1E293B', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box
        sx={{
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          width: '100%',
        }}
      >
        <Box 
          sx={{ 
            width: 32, 
            height: 32, 
            borderRadius: 1.5,
            background: 'linear-gradient(135deg, #76B900 0%, #5A8F00 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(118, 185, 0, 0.3)',
          }}
        >
          <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '14px' }}>N</Typography>
        </Box>
      </Box>
      <List sx={{ pt: 1.5, px: 0.5, width: '100%' }}>
        {menuItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const isActive = location.pathname === item.path
            return (
              <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
                <Tooltip title={item.text} placement="right" arrow>
                  <ListItemButton
                    onClick={() => handleNavigation(item.path)}
                    selected={isActive}
                    sx={{
                      borderRadius: 1.5,
                      py: 1,
                      px: 0,
                      justifyContent: 'center',
                      minHeight: 40,
                      transition: 'all 0.15s ease',
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(118, 185, 0, 0.15)',
                        color: '#76B900',
                        '&:hover': {
                          backgroundColor: 'rgba(118, 185, 0, 0.2)',
                        },
                        '& .MuiListItemIcon-root': {
                          color: '#76B900',
                        },
                      },
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      },
                      color: '#94A3B8',
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: isActive ? '#76B900' : '#64748B',
                        minWidth: 0,
                        justifyContent: 'center',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            )
          })}
      </List>

      {user && (
        <Box sx={{ mt: 'auto', p: 1, borderTop: '1px solid rgba(255,255,255,0.08)', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={`${user.name || user.email} — Change Password`} placement="right" arrow>
            <Avatar
              onClick={() => setPwDialogOpen(true)}
              sx={{
                width: 30, height: 30, bgcolor: '#76B900', fontSize: '0.8rem', fontWeight: 700,
                cursor: 'pointer', transition: 'box-shadow 0.15s',
                '&:hover': { boxShadow: '0 0 0 2px #76B900' },
              }}
            >
              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </Avatar>
          </Tooltip>
          <Tooltip title="Logout" placement="right" arrow>
            <IconButton size="small" onClick={logout} sx={{ color: '#94A3B8', '&:hover': { color: '#EF4444' } }}>
              <LogoutIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: 'transparent',
          border: 'none',
          boxShadow: 'none',
          display: { xs: 'block', sm: 'none' },
        }}
      >
        <Toolbar sx={{ minHeight: 56, backgroundColor: 'transparent' }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ color: '#475569' }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation menu"
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundColor: '#1E293B',
              borderRight: 'none',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              backgroundColor: '#1E293B',
              borderRight: 'none',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.08)',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          pt: { xs: 10, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          backgroundColor: '#F8FAFC',
          minHeight: '100vh',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: { xs: 70, sm: 16 },
            right: 16,
            zIndex: 10,
          }}
        >
          <SyncStatus />
        </Box>
        {children}
      </Box>
      <ChangePasswordDialog open={pwDialogOpen} onClose={() => setPwDialogOpen(false)} />
    </Box>
  )
}
