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
  const PALETA: Record<string, { label: string; cor: string; texto: string; faixa: string }> = {
    ABERTA: {
      label: 'Aberta',
      cor: 'border-sky-300 bg-sky-50',
      texto: 'text-sky-800',
      faixa: 'border-l-sky-500',
    },
    AGENDADA: {
      label: 'Agendada',
      cor: 'border-violet-300 bg-violet-50',
      texto: 'text-violet-800',
      faixa: 'border-l-violet-500',
    },
    'EM ANDAMENTO': {
      label: 'Em Andamento',
      cor: 'border-amber-300 bg-amber-50',
      texto: 'text-amber-800',
      faixa: 'border-l-amber-500',
    },
    FINALIZADA: {
      label: 'Finalizada',
      cor: 'border-emerald-300 bg-emerald-50',
      texto: 'text-emerald-800',
      faixa: 'border-l-emerald-500',
    },
    LANCADA: {
      label: 'Lançada',
      cor: 'border-blue-300 bg-blue-50',
      texto: 'text-blue-800',
      faixa: 'border-l-blue-500',
    },
    CANCELADA: {
      label: 'Cancelada',
      cor: 'border-slate-300 bg-slate-100',
      texto: 'text-slate-600',
      faixa: 'border-l-slate-400',
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

      {/* Lista de Ordens de Serviço */}
      <div className="space-y-3">
        {filteredOrders.map((order) => {
          const status = statusConfig[order.status] || {
            label: order.status,
            color: 'bg-slate-100 text-slate-800',
          }

          return (
            <Card
              key={order.id}
              className="hover:border-[#0F6A3A]/50 hover:shadow-md transition-all border border-border/80"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-base font-black text-[#0F6A3A] bg-[#0F6A3A]/10 px-2 py-0.5 rounded">
                        #{order.order_number}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-foreground">
                        {order.expand?.client?.name || 'Cliente Avulso'}
                      </h3>
                      <Badge className={`text-[11px] font-bold border ${status.color}`}>
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

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="text-xs font-semibold gap-1.5 border-[#0F6A3A]/30 text-[#0F6A3A] hover:bg-[#0F6A3A]/10 w-full sm:w-auto"
                    >
                      <Link to={`/ordens/${order.id}`}>
                        Abrir OS
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

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
