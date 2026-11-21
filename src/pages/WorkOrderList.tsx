import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkOrders, getTechnicians } from '@/services/api'
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

  useEffect(() => {
    setStatusFilter(statusDaUrl || 'ALL')
  }, [statusDaUrl])

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    setLoading(true)
    try {
      const data = await getWorkOrders()
      setOrders(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

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
  // technicians.user = conta logada, criado pela migration 0022) para filtrar
  // a lista no cliente também. O servidor já restringe pela regra da coleção —
  // aqui é espelho, para a UI nunca mostrar OS de outro.
  const soProprias = isTechnician && !isAdmin
  const [meuTecnicoId, setMeuTecnicoId] = useState('')
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

  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase()
    const matchNumber = o.order_number.toString().includes(term)
    const matchClient = o.expand?.client?.name.toLowerCase().includes(term)
    const matchDesc = o.description.toLowerCase().includes(term)
    const matchService = o.service_type.toLowerCase().includes(term)
    const matchTech = o.expand?.technician?.name.toLowerCase().includes(term)

    const matchesSearch = matchNumber || matchClient || matchDesc || matchService || matchTech
    // "HOJE" não é um status: filtra as OS agendadas/abertas para hoje
    const hojeStr = new Date().toISOString().slice(0, 10)
    const ehHoje =
      (o.scheduled_date || '').slice(0, 10) === hojeStr ||
      (o.opened_at || '').slice(0, 10) === hojeStr
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'HOJE' ? ehHoje : passaNoFiltro(o.status, statusFilter))
    // Técnico comum: só a própria OS (vínculo technicians.user). Admin e
    // Consulta usam o dropdown; sem filtro, veem tudo.
    const matchesTech = soProprias
      ? meuTecnicoId !== '' && o.technician === meuTecnicoId
      : techFilter === 'ALL' || o.technician === techFilter

    return matchesSearch && matchesStatus && matchesTech
  })

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
            className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold shadow"
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
            <User className="w-4 h-4 text-[#0F6A3A]" />
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

        {/* Botões de Filtro Rápido por Status */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
          <Button
            type="button"
            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ALL')}
            className={`h-7 text-[11px] ${
              statusFilter === 'ALL' ? 'bg-[#0F6A3A] text-white hover:bg-[#0F6A3A]/90' : ''
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
        {grupos.map((g) => (
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
                            <span className="font-mono text-base font-black text-[#0F6A3A] bg-white/70 px-2 py-0.5 rounded">
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
                                <User className="w-3.5 h-3.5 text-[#0F6A3A]" />
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

        {semGrupo.length > 0 && (
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
                        <span className="font-mono text-sm font-black text-[#0F6A3A] bg-white/70 px-1.5 py-0.5 rounded">
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
                className="mt-4 bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white text-xs font-semibold"
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
