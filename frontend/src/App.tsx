import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'

// Lazy load pages for better performance
const TaskMetrics = lazy(() => import('./pages/PreDelivery'))
const ClientDelivery = lazy(() => import('./pages/ClientDelivery'))
const ClientDeliverySummary = lazy(() => import('./pages/ClientDeliverySummary'))
const Configuration = lazy(() => import('./components/configuration/ConfigurationPage'))

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
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/task-metrics" replace />} />
              <Route path="/task-metrics" element={<TaskMetrics />} />
              <Route path="/pre-delivery" element={<Navigate to="/task-metrics" replace />} />
              <Route path="/client-delivery" element={<ClientDelivery />} />
              <Route path="/client-delivery-summary" element={<ClientDeliverySummary />} />
              <Route path="/configuration" element={<Configuration />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </Box>
  )
}

export default App
