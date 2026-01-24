import { Routes, Route, Navigate } from 'react-router-dom'
import { Box } from '@mui/material'
import Layout from './components/Layout'
import PreDelivery from './pages/PreDelivery'

function App() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/pre-delivery" replace />} />
          <Route path="/pre-delivery" element={<PreDelivery />} />
        </Routes>
      </Layout>
    </Box>
  )
}

export default App
