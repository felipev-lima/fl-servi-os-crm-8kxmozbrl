import React, { useEffect, useRef, useState } from 'react'
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
  /** dropdown "Mais" do menu do computador (ajuste 22/11/2026) */
  const [maisAberto, setMaisAberto] = useState(false)
  const maisRef = useRef<HTMLDivElement | null>(null)

  // fecha o "Mais" ao clicar fora ou ao trocar de tela
  useEffect(() => {
    if (!maisAberto) return
    const fora = (e: MouseEvent) => {
      if (maisRef.current && !maisRef.current.contains(e.target as Node)) setMaisAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [maisAberto])
  useEffect(() => {
    setMaisAberto(false)
  }, [location.pathname])

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
  // Menu em dois grupos: OPERAÇÃO (o dia a dia do sistema) e
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
    { name: 'Margem por OS', href: '/margem-os', icon: TrendingUp, adminOnly: true },
    { name: 'DRE', href: '/dre', icon: TrendingUp, adminOnly: true },
    { name: 'Faturamento', href: '/faturamento', icon: BarChart3, adminOnly: true },
    { name: 'Pedidos', href: '/pedidos', icon: ShoppingCart, adminOnly: false },
    { name: 'Nota fiscal', href: '/nota-fiscal', icon: FileBadge, adminOnly: true },
    { name: 'Empresas emissoras', href: '/empresas-nota', icon: Building2, adminOnly: true },
    { name: 'Recebimentos', href: '/recebimentos', icon: Wallet, adminOnly: true },
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
              {/*
                MOLDURA DA LOGOMARCA (ajuste 22/11/2026).
                Era um quadrado de 40×40. A arte nova é HORIZONTAL (1536×864,
                quase 16:9) e dentro de um quadrado ela encolhia até o texto
                ficar ilegível. A caixa agora acompanha a proporção da arte —
                nada na imagem é cortado, ela só tem o espaço que precisa.
              */}
              {logoUrl ? (
                <div className="flex h-11 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white px-1.5 py-1 shadow-inner">
                  <img
                    src={logoUrl}
                    alt="FL SERVIÇOS"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-inner">
                  <span className="text-[#0B3D91] font-black text-lg">FL</span>
                </div>
              )}
              <div>
                <span className="font-black text-base tracking-tight uppercase block leading-none">
                  FL SERVIÇOS
                </span>
                <span className="text-[10px] text-white/80 font-medium tracking-wider uppercase block">
                  CRM · Macaé / RJ
                </span>
              </div>
            </Link>
          </div>

          {/*
            NAVEGAÇÃO DO COMPUTADOR — cabe sem rolar de lado (22/11/2026).

            Antes os 28 itens ficavam numa fila só e, em tela de notebook, os
            últimos (Relatórios, Contas a pagar, Faturamento, Sair) ficavam fora
            da área visível: o Felipe precisava arrastar a barra para o lado.

            Agora os 6 primeiros ficam à vista e o resto entra num "Mais ▾" com
            painel em duas colunas. O botão de usuário/Sair saiu da fila e está
            sempre visível à direita.
          */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center min-w-0">
            {navigation.slice(0, 6).map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  title={item.name}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                    active
                      ? 'bg-white/25 text-white shadow-sm'
                      : 'text-white/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {/* RÓTULO SEMPRE À VISTA (inclusive no PWA standalone):
                      antes era `hidden xl:inline` e no app instalado a janela
                      fica mais estreita que 1280px — o menu saía só com ícones. */}
                  <span className="inline">{item.name}</span>
                </Link>
              )
            })}

            {navigation.length > 6 && (
              <div className="relative" ref={maisRef}>
                <button
                  type="button"
                  onClick={() => setMaisAberto((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                    maisAberto ? 'bg-white/25 text-white' : 'text-white/90 hover:bg-white/10'
                  }`}
                  aria-expanded={maisAberto}
                  aria-haspopup="true"
                >
                  <Menu className="w-4 h-4" />
                  Mais
                  <span className="text-[9px] opacity-70">▾</span>
                </button>

                {maisAberto && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[430px] rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
                    <p className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Gestão
                    </p>
                    <div className="grid grid-cols-2 gap-0.5">
                      {navigation.slice(6).map((item) => {
                        const Icon = item.icon
                        const active = isActive(item.href)
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setMaisAberto(false)}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                              active
                                ? 'bg-[#0B3D91] text-white'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/*
            USUÁRIO E SAIR SEMPRE À VISTA.
            Ficavam no fim da fila do menu e saíam da tela junto com os últimos
            itens. Agora este bloco é fixo à direita, com nome e perfil.
          */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-1.5">
                <div className="hidden md:flex flex-col items-end text-xs leading-none">
                  <span className="font-bold text-white leading-tight max-w-[110px] truncate">
                    {user.name}
                  </span>
                  <span className="text-[9px] text-sky-200 uppercase font-semibold">
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
                className="bg-white text-[#0B3D91] hover:bg-white/95 font-bold text-xs h-8 shadow"
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
