/* Main App Component - Handles routing (using react-router-dom), query client and other providers */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import WorkOrderList from './pages/WorkOrderList'
import WorkOrderDetail from './pages/WorkOrderDetail'
import ClientsPage from './pages/ClientsPage'
import TechniciansPage from './pages/TechniciansPage'
import MaterialsPage from './pages/MaterialsPage'
import MaterialKitsPage from './pages/MaterialKitsPage'
import FutureMaintenancesPage from './pages/FutureMaintenancesPage'
import UsersPage from './pages/UsersPage'
import PlanilhaPage from './pages/PlanilhaPage'
import ConectoresPage from './pages/ConectoresPage'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/ordens" element={<WorkOrderList />} />
            <Route path="/ordens/:id" element={<WorkOrderDetail />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/tecnicos" element={<TechniciansPage />} />
            <Route path="/materiais" element={<MaterialsPage />} />
            <Route path="/listas-material" element={<MaterialKitsPage />} />
            <Route path="/manutencoes" element={<FutureMaintenancesPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/planilha" element={<PlanilhaPage />} />
            <Route path="/conectores" element={<ConectoresPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
