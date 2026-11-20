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
import LancamentosPage from './pages/LancamentosPage'
import RelatoriosPage from './pages/RelatoriosPage'
import PainelPage from './pages/PainelPage'
import OrcamentosPage from './pages/OrcamentosPage'
import OrcamentoDetalhePage from './pages/OrcamentoDetalhePage'
import ContasPagarPage from './pages/ContasPagarPage'
import FluxoCaixaPage from './pages/FluxoCaixaPage'
import AgendaPage from './pages/AgendaPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import ConferenciaOSPage from './pages/ConferenciaOSPage'
import CustosPage from './pages/CustosPage'
import EstoquePage from './pages/EstoquePage'
import ContatosPage from './pages/ContatosPage'
import NotaFiscalPage from './pages/NotaFiscalPage'
import PedidoPage from './pages/PedidoPage'
import ComissoesPage from './pages/ComissoesPage'
import LucroPage from './pages/LucroPage'
import FaturamentoPage from './pages/FaturamentoPage'
import AliquotasPage from './pages/AliquotasPage'
import TecnicoPage from './pages/TecnicoPage'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            {/*
              A raiz é o PAINEL DO CRM, não o dashboard antigo: é o que o dono
              precisa ver ao abrir (a receber, OS em aberto, devedores,
              pendências). O dashboard antigo continua em /dashboard.
            */}
            <Route path="/" element={<PainelPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
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
            {/* ---- CRM ---- */}

            <Route path="/lancamentos" element={<LancamentosPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
            <Route path="/orcamentos" element={<OrcamentosPage />} />
            <Route path="/orcamentos/:id" element={<OrcamentoDetalhePage />} />
            <Route path="/contas-pagar" element={<ContasPagarPage />} />
            <Route path="/fluxo-caixa" element={<FluxoCaixaPage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
            <Route path="/conferencia" element={<ConferenciaOSPage />} />
            <Route path="/custos" element={<CustosPage />} />
            <Route path="/estoque" element={<EstoquePage />} />
            <Route path="/contatos" element={<ContatosPage />} />
            <Route path="/nota-fiscal" element={<NotaFiscalPage />} />
            <Route path="/pedido/novo" element={<PedidoPage />} />
            <Route path="/pedido/:id" element={<PedidoPage />} />
            <Route path="/comissoes" element={<ComissoesPage />} />
            <Route path="/lucro" element={<LucroPage />} />
            <Route path="/faturamento" element={<FaturamentoPage />} />
            <Route path="/aliquotas" element={<AliquotasPage />} />
            <Route path="/tecnico" element={<TecnicoPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
