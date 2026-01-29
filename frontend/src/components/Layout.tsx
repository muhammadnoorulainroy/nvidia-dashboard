import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Business as BusinessIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'

const drawerWidth = 260

// Get app info from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'NVIDIA DASHBOARD'
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0'

interface MenuItem {
  text: string
  icon: JSX.Element
  path: string
}

const menuItems: MenuItem[] = [
  { text: 'Task Metrics', icon: <BusinessIcon />, path: '/task-metrics' },
  { text: 'Configuration', icon: <SettingsIcon />, path: '/configuration' },
]

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

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
    <Box sx={{ height: '100%', backgroundColor: '#1E293B' }}>
      <Toolbar
        sx={{
          backgroundColor: '#0F172A',
          minHeight: 72,
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          py: 2,
          px: 2.5,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
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
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#F8FAFC',
              fontSize: '15px',
            }}
          >
            {APP_NAME}
          </Typography>
        </Box>
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'rgba(148, 163, 184, 0.8)',
            fontWeight: 500,
            fontSize: '11px',
            pl: 5.5,
          }}
        >
          Task Metrics v{APP_VERSION}
        </Typography>
      </Toolbar>
      <List sx={{ pt: 2, px: 1.5 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                selected={isActive}
                sx={{
                  borderRadius: 1.5,
                  py: 1.25,
                  px: 2,
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
                    minWidth: 36,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '-0.01em',
                  }}
                />
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
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
            sx={{ 
              color: '#475569',
            }}
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
          ModalProps={{
            keepMounted: true,
          }}
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
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
