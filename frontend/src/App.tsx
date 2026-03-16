import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './contexts/AuthContext'

const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const TaskMetrics = lazy(() => import('./pages/PreDelivery'))
const ClientDelivery = lazy(() => import('./pages/ClientDelivery'))
const ClientDeliverySummary = lazy(() => import('./pages/ClientDeliverySummary'))
const Configuration = lazy(() => import('./components/configuration/ConfigurationPage'))
const Analytics = lazy(() => import('./pages/Analytics'))
const TeamOverview = lazy(() => import('./pages/TeamOverview'))
const QualityRubrics = lazy(() => import('./pages/QualityRubrics'))
const ProjectSummary = lazy(() => import('./pages/ProjectSummary'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const SharedTaskRubrics = lazy(() => import('./pages/SharedTaskRubrics'))

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
  const { isAuthenticated, loading, mustChangePassword } = useAuth()

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress size={40} />
      </Box>
    )
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={isAuthenticated && !mustChangePassword ? <Navigate to="/task-metrics" replace /> : <Login />}
          />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/shared/:token" element={<SharedTaskRubrics />} />
          <Route
            path="/change-password"
            element={
              isAuthenticated ? <ChangePassword /> : <Navigate to="/login" replace />
            }
          />

          {/* Protected dashboard routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
                  <Layout>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/task-metrics" replace />} />
                        <Route path="/task-metrics" element={<TaskMetrics />} />
                        <Route path="/pre-delivery" element={<Navigate to="/task-metrics" replace />} />
                        <Route path="/client-delivery" element={<ClientDelivery />} />
                        <Route path="/client-delivery-summary" element={<ClientDeliverySummary />} />
                        <Route path="/configuration" element={<Configuration />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/team-overview" element={<TeamOverview />} />
                        <Route path="/quality-rubrics" element={<QualityRubrics />} />
                        <Route path="/project-summary" element={<ProjectSummary />} />
                        <Route
                          path="/users"
                          element={
                            <ProtectedRoute adminOnly>
                              <UserManagement />
                            </ProtectedRoute>
                          }
                        />
                      </Routes>
                    </Suspense>
                  </Layout>
                </Box>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
