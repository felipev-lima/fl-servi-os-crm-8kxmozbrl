import React, { useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  Wrench,
  Package,
  CalendarDays,
  LogOut,
  LogIn,
  Menu,
  X,
  FileText,
  UsersRound,
  Layers,
  FileSpreadsheet,
  Plug,
  Receipt,
  Wallet,
  TrendingUp,
  Settings,
  CheckSquare,
  Percent,
  BarChart3,
  Boxes,
  Phone,
  FileBadge,
  ShoppingCart,
} from 'lucide-react'
import { getEmpresa, urlArquivo, type Empresa } from '@/lib/empresa'

export default function Layout() {
  const { user, isAuthenticated, logout, isAdmin } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  /**
   * Logomarca vem das Configurações, não do código.
   *
   * Assim o Felipe troca a arte na tela e ela muda no cabeçalho e no PDF ao
   * mesmo tempo, sem depender de programador nem de novo build.
   */
  const [logoUrl, setLogoUrl] = useState('')
  /**
   * Busca sempre — a coleção `settings` é pública para leitura (migration 0033).
   *
   * Antes a consulta rodava uma vez só, ainda deslogado, e recebia 403: a logo
   * nunca aparecia no cabeçalho.
   */
  useEffect(() => {
    getEmpresa(true)
      .then((e: Empresa) => setLogoUrl(urlArquivo(e, 'logo')))
      .catch(() => setLogoUrl(''))
  }, [])
  // Menu em dois grupos: OPERAÇÃO (o dia a dia, o que já existia na FL) e
  // GESTÃO (o CRM: financeiro, orçamentos, relatórios). O técnico vê só
  // operação; o financeiro é do dono.
  /**
   * MENU ENXUTO (ajuste do Felipe, 21/11/2026).
   *
   * "Meus serviços" saiu para o ADMIN: ele já vê tudo no Painel, e a tela era
   * um segundo caminho para a mesma lista. Para o TÉCNICO ela continua, porque
   * é a tela de trabalho dele na rua — hoje/em aberto, sem financeiro.
   *
   * "Ordens de Serviço" FICA: é o único lugar com BUSCA (por número, cliente,
   * serviço, técnico ou descrição). O Painel lista por status, não procura —
   * sem esta tela, achar uma OS antiga exigiria rolar tudo.
   */
  const operacao = [
    { name: 'Painel', href: '/', icon: LayoutDashboard, adminOnly: false },
    {
      name: 'Meus serviços',
      href: '/tecnico',
      icon: ClipboardList,
      adminOnly: false,
      esconderDoAdmin: true,
    },
    { name: 'Ordens de Serviço', href: '/ordens', icon: ClipboardList, adminOnly: false },
    { name: 'Agenda', href: '/agenda', icon: CalendarDays, adminOnly: false },
    { name: 'Clientes', href: '/clientes', icon: Building2, adminOnly: false },
    { name: 'Contatos', href: '/contatos', icon: Phone, adminOnly: true },
    { name: 'Técnicos', href: '/tecnicos', icon: Wrench, adminOnly: false },
    { name: 'Materiais', href: '/materiais', icon: Package, adminOnly: false },
    { name: 'Listas de Material', href: '/listas-material', icon: Layers, adminOnly: false },
  ]
  const gestao = [
    { name: 'Lançamentos', href: '/lancamentos', icon: Receipt, adminOnly: true },
    { name: 'Orçamentos', href: '/orcamentos', icon: FileText, adminOnly: true },
    { name: 'Relatórios', href: '/relatorios', icon: FileSpreadsheet, adminOnly: true },
    { name: 'Contas a pagar', href: '/contas-pagar', icon: Wallet, adminOnly: true },
    { name: 'Fluxo de caixa', href: '/fluxo-caixa', icon: TrendingUp, adminOnly: true },
    { name: 'Conferência OS', href: '/conferencia', icon: CheckSquare, adminOnly: true },
    { name: 'Custos e margem', href: '/custos', icon: TrendingUp, adminOnly: true },
    { name: 'Estoque', href: '/estoque', icon: Boxes, adminOnly: true },
    { name: 'Comissões', href: '/comissoes', icon: Percent, adminOnly: true },
    { name: 'Lucro', href: '/lucro', icon: TrendingUp, adminOnly: true },
    { name: 'Faturamento', href: '/faturamento', icon: BarChart3, adminOnly: true },
    { name: 'Pedidos', href: '/pedidos', icon: ShoppingCart, adminOnly: false },
    { name: 'Nota fiscal', href: '/nota-fiscal', icon: FileBadge, adminOnly: true },
    { name: 'Alíquotas', href: '/aliquotas', icon: Percent, adminOnly: true },
    { name: 'Manutenções Futuras', href: '/manutencoes', icon: CalendarDays, adminOnly: true },
    { name: 'Planilha', href: '/planilha', icon: FileSpreadsheet, adminOnly: true },
    { name: 'Conectores', href: '/conectores', icon: Plug, adminOnly: true },
    { name: 'Configurações', href: '/configuracoes', icon: Settings, adminOnly: true },
    { name: 'Usuários', href: '/usuarios', icon: UsersRound, adminOnly: true },
  ]
  const navigation = [...operacao, ...gestao].filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    // itens marcados escondem-se do admin (o técnico continua vendo)
    if ((item as any).esconderDoAdmin && isAdmin) return false
    return true
  })

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Cabeçalho: identidade FL SERVIÇOS CRM, azul #0B3D91 */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[#0B3D91] to-[#1E6FD9] text-white shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-inner overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="FL" className="w-9 h-9 object-contain p-0.5" />
                ) : (
                  <span className="text-[#0B3D91] font-black text-lg">FL</span>
                )}
              </div>
              <div>
                <span className="font-black text-lg tracking-tight uppercase block leading-none">
                  FL SERVIÇOS
                </span>
                <span className="text-[10px] text-white/80 font-medium tracking-wider uppercase block">
                  CRM · Macaé / RJ
                </span>
              </div>
            </Link>
          </div>

          {/* Navegação Desktop */}
          <nav className="hidden lg:flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-white/20 text-white shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Usuário / Login */}
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end text-xs">
                  <span className="font-bold text-white leading-tight">{user.name}</span>
                  <span className="text-[10px] text-emerald-200 uppercase font-semibold">
                    {user.role}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="text-white hover:bg-white/10 h-8 px-2 text-xs gap-1"
                  title="Sair da conta"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-white text-[#0F6A3A] hover:bg-white/95 font-bold text-xs h-8 shadow"
              >
                <Link to="/login" className="flex items-center gap-1">
                  <LogIn className="w-3.5 h-3.5" /> Entrar
                </Link>
              </Button>
            )}

            {/* Botão Menu Mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-white hover:bg-white/10 p-1.5 h-8 w-8"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Menu Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0B3D91] border-t border-white/10 px-4 py-3 space-y-1 animate-slide-down">
            {navigation.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                    active ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        )}
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 print:p-0">
        <Outlet />
      </main>

      {/* Rodapé Fixo na tela */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-muted-foreground print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            <strong>FL SERVIÇOS</strong> • Gestão de OS, vendas e faturamento — Macaé / RJ
          </span>
          <span className="text-[11px]">CRM • Orçamentos, pedidos e financeiro</span>
        </div>
      </footer>
    </div>
  )
}
