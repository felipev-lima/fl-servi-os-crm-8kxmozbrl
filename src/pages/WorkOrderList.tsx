import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkOrders, getWorkOrdersPage, getTechnicians } from '@/services/api'
import pb from '@/lib/pocketbase/client'
import { WorkOrder, OrderStatus, Technician } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  PlusCircle,
  Search,
  Filter,
  ClipboardList,
  Calendar,
  User,
  ArrowRight,
  MapPin,
  Clock,
} from 'lucide-react'
import { useViewMode, ViewModeSelector } from '@/components/ViewModeSelector'

export default function WorkOrderList() {
  const { isTechnician, isAdmin, isConsultant, user } = useAuth()
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [techFilter, setTechFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // O painel manda o filtro pela URL (/ordens?status=AGENDADA), então o card
  // clicado abre a lista já filtrada.
  const [searchParams] = useSearchParams()
  const statusDaUrl = searchParams.get('status')
  const [statusFilter, setStatusFilter] = useState<string>(statusDaUrl || 'ALL')
  /** como ordenar DENTRO de cada grupo (pedido do Felipe, 21/11/2026) */
  const [ordem, setOrdem] = useState<'PRIORIDADE' | 'NUMERO' | 'CLIENTE' | 'DATA'>('PRIORIDADE')
  const [modo, setModo] = useViewMode('ordens')

  useEffect(() => {
    setStatusFilter(statusDaUrl || 'ALL')
  }, [statusDaUrl])

  /**
   * FILTRO E PAGINAÇÃO NO SERVIDOR (melhoria de 22/11/2026).
   *
   * Antes: `getWorkOrders()` baixava a base INTEIRA e o navegador filtrava.
   * Com 17 OS não se nota; com algumas centenas, abrir a lista demora e a
   * busca (disparada a cada tecla) trava a tela.
   *
   * Agora o PocketBase filtra e devolve só a página pedida. O agrupamento por
   * prioridade continua sendo feito aqui, na página já filtrada — é o que o
   * Felipe vê e usa.
   *
   * `--ver-todas` continua funcionando: baixa tudo de uma vez (17 hoje), para
   * quem quiser a lista completa sem paginar.
   */
  const [pagina, setPagina] = useState(1)
  const [totalOS, setTotalOS] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const PER_PAGE = 30

  /**
   * ORDEM DAS DECLARAÇÕES IMPORTA (bug de 22/11/2026).
   *
   * `soProprias` e `meuTecnicoId` eram declarados MAIS ABAIXO, mas usados aqui
   * dentro do `useCallback` — e no JavaScript `const` não existe antes da linha
   * onde é declarado (TDZ). O efeito disparava na montagem e derrubava a tela
   * inteira: `#root` vazio, só o fundo. O build passava, porque é erro de
   * execução, não de compilação.
   *
   * Agora as duas referências vêm ANTES de quem as usa.
   */
  const soProprias = isTechnician && !isAdmin
  const [meuTecnicoId, setMeuTecnicoId] = useState('')

  const loadOrders = React.useCallback(async () => {
    setLoading(true)
    try {
      const r = await getWorkOrdersPage({
        page: pagina,
        perPage: PER_PAGE,
        busca: search,
        status: statusFilter,
        tecnico: techFilter,
        apenasDoTecnico: soProprias ? meuTecnicoId : undefined,
      })
      setOrders(r.items)
      setTotalOS(r.totalItems)
      setTotalPaginas(r.totalPages)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [pagina, search, statusFilter, techFilter, soProprias, meuTecnicoId])

  /**
   * Recarrega quando muda filtro, busca ou página.
   * A busca espera 400 ms após a última tecla: sem isso, cada letra disparava
   * uma consulta ao servidor e a resposta chegava fora de ordem.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      void loadOrders()
    }, 400)
    return () => clearTimeout(t)
  }, [loadOrders])

  // filtro novo -> volta para a primeira página (senão cai em página vazia)
  useEffect(() => {
    setPagina(1)
  }, [search, statusFilter, techFilter])

  // Filtro por técnico: disponível para Administrador e Consulta. O técnico
  // comum continua vendo apenas as próprias OS por padrão.
  const podeFiltrarPorTecnico = isAdmin || isConsultant
  useEffect(() => {
    if (podeFiltrarPorTecnico) {
      getTechnicians()
        .then(setTechnicians)
        .catch((err) => console.error('Erro ao carregar técnicos', err))
    }
  }, [podeFiltrarPorTecnico])

  // Técnico comum: localiza o PRÓPRIO registro em `technicians` (o vínculo
  // technicians.user = conta logada, criado pela migration 0022) para a lista
  // pedir ao servidor só as OS dele. As duas variáveis são declaradas ACIMA,
  // antes do `loadOrders` que as usa.
  useEffect(() => {
    if (!soProprias || !user?.id) return
    pb.collection('technicians')
      .getFirstListItem(`user = "${user.id}"`)
      .then((rec) => setMeuTecnicoId(rec?.id || ''))
      .catch(() => setMeuTecnicoId(''))
  }, [soProprias, user?.id])

  /**
   * Situação de cada OS — a mesma paleta do painel.
   *
   * AGUARDANDO MATERIAL saiu (pedido do Felipe, 20/11/2026): ninguém
   * movimentava e travava OS. Quem ainda tiver esse valor gravado aparece
   * como "Em Andamento", porque serviço parado por peça continua em execução.
   * LANCADA entrou no fim: conferida e enviada ao financeiro.
   */
  /*
   * A MESMA paleta do PAINEL, cor por cor (ajuste do Felipe, 21/11/2026).
   * Antes aqui era tudo pastel claro e o painel usava tons mais firmes — a
   * mesma OS saía de cores diferentes nas duas telas. Agora é uma paleta só:
   *   aberta       cinza
   *   agendada     azul
   *   em andamento âmbar
   *   finalizada   verde
   *   lançada      índigo
   *   cancelada    cinza-forte
   */
  const PALETA: Record<string, { label: string; cor: string; texto: string; faixa: string }> = {
    ABERTA: {
      label: 'Aberta',
      cor: 'border-slate-300 bg-slate-200',
      texto: 'text-slate-900',
      faixa: 'border-l-slate-600',
    },
    AGENDADA: {
      label: 'Agendada',
      cor: 'border-blue-300 bg-blue-100',
      texto: 'text-blue-900',
      faixa: 'border-l-blue-500',
    },
    'EM ANDAMENTO': {
      label: 'Em Andamento',
      cor: 'border-amber-300 bg-amber-100',
      texto: 'text-amber-900',
      faixa: 'border-l-amber-500',
    },
    FINALIZADA: {
      label: 'Finalizada',
      cor: 'border-emerald-300 bg-emerald-100',
      texto: 'text-emerald-900',
      faixa: 'border-l-emerald-600',
    },
    LANCADA: {
      label: 'Lançada',
      cor: 'border-indigo-300 bg-indigo-100',
      texto: 'text-indigo-900',
      faixa: 'border-l-indigo-600',
    },
    CANCELADA: {
      label: 'Cancelada',
      cor: 'border-slate-400 bg-slate-300',
      texto: 'text-slate-700',
      faixa: 'border-l-slate-500',
    },
    // Proposta de orçamento (migration 0062): uma proposta não é pendência,
    // tem grupo/aba própria e sai das contagens de pendentes/atrasadas.
    ORCAMENTO: {
      label: 'Orçamento',
      cor: 'border-violet-300 bg-violet-100',
      texto: 'text-violet-900',
      faixa: 'border-l-violet-500',
    },
  }
  const statusConfig = PALETA as any
  /** normaliza o status antigo para o novo */
  const statusDe = (s: string) => (s === 'AGUARDANDO MATERIAL' ? 'EM ANDAMENTO' : s)

  /**
   * Filtro que casa com o status antigo gravado.
   *
   * Quem escolher "Em Andamento" precisa ver também as OS que ainda estão
   * gravadas como AGUARDANDO MATERIAL: a migration as move, mas uma OS salva
   * por um app aberto antes disso continuaria escondida.
   */
  const passaNoFiltro = (statusOS: string, filtro: string) => {
    if (filtro === 'ALL') return true
    if (filtro === 'EM ANDAMENTO') {
      return statusOS === 'EM ANDAMENTO' || statusOS === 'AGUARDANDO MATERIAL'
    }
    return statusOS === filtro
  }

  /**
   * O SERVIDOR JÁ FILTROU.
   *
   * Antes esta função repetia busca, status e técnico aqui no navegador sobre
   * a base inteira. Agora `getWorkOrdersPage` traz só o que casa com o filtro,
   * então repetir aqui não filtraria nada — e, pior, um resultado que o banco
   * aceitou poderia ser descartado por diferença de acento ou maiúscula.
   *
   * `passaNoFiltro` continua sendo usado apenas para CONTAR por situação nos
   * cartões do topo, que é sobre a página carregada.
   */
  const filteredOrders = orders

  /**
   * ORDEM DE PRIORIDADE (pedido do Felipe, 21/11/2026).
   *
   * A lista deixa de ser uma pilha por número e passa a mostrar primeiro o que
   * precisa ser resolvido hoje:
   *
   *   1º HOJE          — agendadas para hoje (o compromisso do dia)
   *   2º EM ANDAMENTO  — já começou, precisa terminar
   *   3º AGENDADAS     — marcadas para depois
   *   4º ABERTAS       — ainda sem data
   *   5º FINALIZADAS   — concluídas, aguardando conferência
   *   6º LANÇADAS      — já no financeiro
   *
   * Dentro de cada grupo o usuário escolhe: número da OS, nome do cliente ou
   * data. "Prioridade" é o padrão.
   */
  const GRUPOS: { chave: string; rotulo: string; status: string; cor: string; texto: string }[] = [
    {
      chave: 'HOJE',
      rotulo: 'Hoje',
      status: 'ABERTA',
      cor: 'bg-rose-50 border-rose-300',
      texto: 'text-rose-800',
    },
    {
      chave: 'EM ANDAMENTO',
      rotulo: 'Em andamento',
      status: 'EM ANDAMENTO',
      cor: 'bg-amber-100 border-amber-300',
      texto: 'text-amber-900',
    },
    {
      chave: 'AGENDADA',
      rotulo: 'Agendadas',
      status: 'AGENDADA',
      cor: 'bg-blue-100 border-blue-300',
      texto: 'text-blue-900',
    },
    {
      chave: 'ABERTA',
      rotulo: 'Abertas',
      status: 'ABERTA',
      cor: 'bg-slate-200 border-slate-300',
      texto: 'text-slate-900',
    },
    {
      chave: 'FINALIZADA',
      rotulo: 'Finalizadas',
      status: 'FINALIZADA',
      cor: 'bg-emerald-100 border-emerald-300',
      texto: 'text-emerald-900',
    },
    {
      chave: 'LANCADA',
      rotulo: 'Lançadas',
      status: 'LANCADA',
      cor: 'bg-indigo-100 border-indigo-300',
      texto: 'text-indigo-900',
    },
    {
      chave: 'ORCAMENTO',
      rotulo: 'Orçamento',
      status: 'ORCAMENTO',
      cor: 'bg-violet-100 border-violet-300',
      texto: 'text-violet-900',
    },
  ]

  /** comparação escolhida pelo usuário, aplicada DENTRO de cada grupo */
  const comparar = (a: WorkOrder, b: WorkOrder) => {
    if (ordem === 'NUMERO') return a.order_number - b.order_number
    if (ordem === 'CLIENTE') {
      const na = (a.expand?.client?.name || '').toUpperCase()
      const nb = (b.expand?.client?.name || '').toUpperCase()
      return na.localeCompare(nb, 'pt-BR')
    }
    if (ordem === 'DATA') {
      const da = a.scheduled_date || '9999'
      const db = b.scheduled_date || '9999'
      return da.localeCompare(db)
    }
    // PRIORIDADE: mais recente primeiro dentro do grupo
    return b.order_number - a.order_number
  }

  const hojeISO = new Date().toISOString().slice(0, 10)

  /**
   * Agrupa a lista. Quando o usuário filtra por um status específico, mostramos
   * só aquele grupo; senão, todos na ordem de prioridade.
   */
  const grupos = GRUPOS.map((g) => {
    const itens = filteredOrders
      .filter((o) => {
        const st = statusDe(o.status)
        if (g.chave === 'HOJE') {
          const ehHoje = (o.scheduled_date || '').slice(0, 10) === hojeISO
          // "hoje" só vale para OS que ainda dão trabalho
          return ehHoje && st !== 'FINALIZADA' && st !== 'LANCADA' && st !== 'CANCELADA'
        }
        if (st !== g.status) return false
        // quem aparece em HOJE não se repete no grupo do seu status
        if (
          (o.scheduled_date || '').slice(0, 10) === hojeISO &&
          st !== 'FINALIZADA' &&
          st !== 'LANCADA'
        )
          return false
        return true
      })
      .sort(comparar)
    return { ...g, itens }
  }).filter((g) => g.itens.length > 0)

  const semGrupo = filteredOrders.filter((o) => {
    const st = statusDe(o.status)
    const ehHoje = (o.scheduled_date || '').slice(0, 10) === hojeISO
    if (ehHoje && st !== 'FINALIZADA' && st !== 'LANCADA' && st !== 'CANCELADA') return false
    return !GRUPOS.some((g) => g.chave !== 'HOJE' && g.status === st)
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Lista */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Ordens de Serviço</h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe atendimentos, técnicos escalados e status em tempo real.
          </p>
        </div>

        {isTechnician && (
          <Button
            asChild
            className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold shadow"
          >
            <Link to="/ordens/nova" className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              Criar Nova OS
            </Link>
          </Button>
        )}
      </div>

      {/* Barra de Pesquisa e Filtros de Status */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-card p-3 rounded-xl border">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº da OS, cliente, serviço, técnico ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Filtro por Técnico (Administrador e Consulta) */}
        {podeFiltrarPorTecnico && technicians.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <User className="w-4 h-4 text-[#0B3D91]" />
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-w-[180px]"
              aria-label="Filtrar ordens por técnico"
            >
              <option value="ALL">Todos os técnicos</option>
              {technicians
                .filter((t) => t.active !== false)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Seletor de ordenação dentro de cada grupo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground">Ordenar:</span>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as any)}
            className="h-8 rounded-md border border-input bg-background px-1.5 text-[11px] font-semibold shadow-sm"
            aria-label="Ordenar OS"
          >
            <option value="PRIORIDADE">Prioridade</option>
            <option value="NUMERO">Nº da OS</option>
            <option value="CLIENTE">Nome do cliente</option>
            <option value="DATA">Data agendada</option>
          </select>
        </div>

        {/* Seletor de modo de visualização (Lista / Compacta / Cartões) */}
        <ViewModeSelector valor={modo} onChange={setModo} className="shrink-0" />

        {/* Botões de Filtro Rápido por Status */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
          <Button
            type="button"
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
            className={`h-7 text-[11px] ${
              statusFilter === 'ALL' ? 'bg-[#0B3D91] text-white hover:bg-[#0B3D91]/90' : ''
            }`}
          >
            Todas ({orders.length})
          </Button>

          {Object.entries(PALETA).map(([statusKey, conf]) => {
            const count = orders.filter((o) => statusDe(o.status) === statusKey).length
            if (statusKey === 'CANCELADA' && count === 0) return null
            const isSelected = statusFilter === statusKey
            return (
              <Button
                key={statusKey}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter(statusKey)}
                className={`h-7 text-[11px] border ${conf.cor} ${conf.texto} ${
                  isSelected ? 'ring-2 ring-slate-700 font-bold' : ''
                }`}
              >
                {conf.label} ({count})
              </Button>
            )
          })}
        </div>
      </div>

      {/* Lista agrupada por prioridade */}
      <div className="space-y-5">
        {modo !== 'cartoes' &&
          grupos.length === 0 &&
          semGrupo.length === 0 &&
          filteredOrders.length > 0 && (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {filteredOrders.map((order) => {
                const st = statusConfig[statusDe(order.status)] || {
                  label: order.status,
                  cor: 'border-slate-300 bg-slate-100',
                  texto: 'text-slate-700',
                  faixa: 'border-l-slate-400',
                }
                const compacto = modo === 'compacta'
                return (
                  <Link
                    key={order.id}
                    to={`/ordens/${order.id}`}
                    className={`flex items-center gap-2 px-3 hover:bg-muted/40 ${compacto ? 'min-h-[44px] py-1.5' : 'min-h-[44px] py-2.5'}`}
                  >
                    <span className="w-16 shrink-0 font-mono text-[11px] font-black text-[#0B3D91]">
                      #{order.order_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        {order.expand?.client?.name || 'Cliente Avulso'}
                      </p>
                      {!compacto && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {order.service_type}
                          {order.expand?.technician ? ` · ${order.expand.technician.name}` : ''}
                          {order.scheduled_date
                            ? ` · Prev: ${new Date(order.scheduled_date).toLocaleDateString('pt-BR')}`
                            : ''}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${st.texto}`}>
                      {st.label}
                    </Badge>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          )}
        {modo === 'cartoes' &&
          grupos.map((g) => (
            <div key={g.chave} className="space-y-2">
              {/* cabeçalho do grupo, com a cor da situação */}
              <div
                className={`flex items-center justify-between rounded-lg border-l-4 px-3 py-1.5 ${g.cor} ${g.texto}`}
              >
                <h2 className="text-xs font-black uppercase tracking-wide">
                  {g.rotulo} <span className="font-bold opacity-70">({g.itens.length})</span>
                </h2>
              </div>

              {g.itens.map((order) => {
                // status antigo (AGUARDANDO MATERIAL) cai na paleta de EM ANDAMENTO
                const status = statusConfig[statusDe(order.status)] || {
                  label: order.status,
                  cor: 'border-slate-300 bg-slate-100',
                  texto: 'text-slate-700',
                  faixa: 'border-l-slate-400',
                }

                return (
                  /**
                   * O CARTÃO INTEIRO ABRE A OS (pedido do Felipe, 21/11/2026).
                   *
                   * Havia um botão "Abrir OS" à direita, o que obrigava acertar o
                   * alvo. Agora tocar em qualquer ponto do cartão — nome do cliente,
                   * número, descrição — abre a OS. O botão saiu.
                   *
                   * A cor do cartão segue a paleta do PAINEL, para ele reconhecer a
                   * situação pelo fundo, sem ler: cinza, azul, âmbar, verde, azul
                   * escuro.
                   */
                  <Link key={order.id} to={`/ordens/${order.id}`} className="block">
                    <Card
                      className={`border-l-4 transition-all hover:shadow-md ${status.cor} ${status.faixa}`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono text-base font-black text-[#0B3D91] bg-white/70 px-2 py-0.5 rounded">
                                #{order.order_number}
                              </span>
                              <h3 className="font-bold text-sm sm:text-base text-foreground">
                                {order.expand?.client?.name || 'Cliente Avulso'}
                              </h3>
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-bold ${status.texto}`}
                              >
                                {status.label}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {order.description}
                            </p>

                            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 pt-1 text-xs text-muted-foreground">
                              <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                {order.service_type}
                              </span>

                              {order.expand?.technician && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-[#0B3D91]" />
                                  {order.expand.technician.name}
                                </span>
                              )}

                              {order.scheduled_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                  Prev: {new Date(order.scheduled_date).toLocaleDateString('pt-BR')}
                                </span>
                              )}

                              {order.location_address && (
                                <span className="flex items-center gap-1 line-clamp-1 max-w-[200px]">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  Macaé/RJ
                                </span>
                              )}
                            </div>
                          </div>

                          {/* o botão "Abrir OS" saiu: o cartão inteiro é o link */}
                          <ArrowRight className="hidden sm:block w-4 h-4 shrink-0 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ))}

        {modo === 'cartoes' && semGrupo.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-lg border-l-4 border-slate-400 bg-slate-100 px-3 py-1.5 text-slate-700">
              <h2 className="text-xs font-black uppercase tracking-wide">
                Outras <span className="font-bold opacity-70">({semGrupo.length})</span>
              </h2>
            </div>
            {semGrupo.map((order) => {
              const st = statusConfig[statusDe(order.status)] || {
                label: order.status,
                cor: 'border-slate-300 bg-slate-100',
                texto: 'text-slate-700',
                faixa: 'border-l-slate-400',
              }
              return (
                <Link key={order.id} to={`/ordens/${order.id}`} className="block">
                  <Card className={`border-l-4 hover:shadow-md ${st.cor} ${st.faixa}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-[#0B3D91] bg-white/70 px-1.5 py-0.5 rounded">
                          #{order.order_number}
                        </span>
                        <span className="truncate text-xs font-bold">
                          {order.expand?.client?.name || 'Cliente Avulso'}
                        </span>
                        <Badge variant="outline" className={`ml-auto text-[10px] ${st.texto}`}>
                          {st.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}

        {/*
          NAVEGAÇÃO DE PÁGINAS (melhoria de 22/11/2026).
          A lista agora vem do servidor em blocos de 30. Só aparece quando há
          mais de uma página — com 17 OS, o Felipe não vê este bloco.
        */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagina <= 1 || loading}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="h-8 text-xs"
            >
              ← Anterior
            </Button>

            <span className="text-[11px] font-semibold text-muted-foreground">
              Página {pagina} de {totalPaginas} · {totalOS} OS
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas || loading}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              className="h-8 text-xs"
            >
              Próxima →
            </Button>
          </div>
        )}

        {filteredOrders.length === 0 && !loading && (
          <div className="p-12 text-center border-2 border-dashed rounded-xl bg-card">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-base font-bold text-foreground">
              Nenhuma ordem de serviço encontrada
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Tente alterar os termos de busca ou o filtro de status selecionado.
            </p>
            {isTechnician && (
              <Button
                asChild
                className="mt-4 bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white text-xs font-semibold"
              >
                <Link to="/ordens/nova">Cadastrar Nova OS</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
