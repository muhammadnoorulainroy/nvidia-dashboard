import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'

// Lazy load pages for better performance
const TaskMetrics = lazy(() => import('./pages/TaskMetrics'))

// Loading fallback component
function PageLoader() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
      }}
    >
      <CircularProgress size={40} thickness={4} />
    </Box>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/task-metrics" replace />} />
              <Route path="/task-metrics" element={<TaskMetrics />} />
            </Routes>
          </Suspense>
        </Layout>
      </Box>
    </ErrorBoundary>
  )
}

export default App
