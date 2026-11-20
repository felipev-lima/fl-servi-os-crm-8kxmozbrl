import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkOrders, getFutureMaintenances } from '@/services/api'
import { WorkOrder, FutureMaintenance } from '@/types/flservicos'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ClipboardList,
  Clock,
  PlayCircle,
  PackageOpen,
  CheckCircle2,
  CalendarDays,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  MapPin,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react'

export default function Dashboard() {
  const { user, isTechnician, isAdmin } = useAuth()
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [maintenances, setMaintenances] = useState<FutureMaintenance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [allOrders, allMaint] = await Promise.all([getWorkOrders(), getFutureMaintenances()])
      setOrders(allOrders)
      setMaintenances(allMaint)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Contadores exigidos pelo resumo
  const countAberta = orders.filter((o) => o.status === 'ABERTA').length
  const countAgendada = orders.filter((o) => o.status === 'AGENDADA').length
  const countAndamento = orders.filter((o) => o.status === 'EM ANDAMENTO').length
  const countAguardando = orders.filter((o) => o.status === 'AGUARDANDO MATERIAL').length
  const countFinalizada = orders.filter((o) => o.status === 'FINALIZADA').length

  // Atendimentos do dia
  const todayStr = new Date().toISOString().split('T')[0]
  const countHoje = orders.filter((o) => {
    const scheduled = o.scheduled_date ? o.scheduled_date.split('T')[0] : ''
    const opened = o.opened_at ? o.opened_at.split('T')[0] : ''
    return scheduled === todayStr || opened === todayStr
  }).length

  const statusConfig = {
    ABERTA: { label: 'Aberta', color: 'bg-slate-100 text-slate-800 border-slate-300' },
    AGENDADA: { label: 'Agendada', color: 'bg-blue-100 text-blue-800 border-blue-300' },
    'EM ANDAMENTO': {
      label: 'Em Andamento',
      color: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    'AGUARDANDO MATERIAL': {
      label: 'Aguardando Material',
      color: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    FINALIZADA: {
      label: 'Finalizada',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    CANCELADA: { label: 'Cancelada', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  }

  return (
    <div className="space-y-6">
      {/* Top Banner de Boas-vindas */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-[#0F6A3A] to-[#2E8B57] text-white p-5 rounded-2xl shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              {user?.role || 'Usuário'}
            </span>
            <span className="text-white/80 text-xs">F. L. SERVIÇOS • Macaé/RJ</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Olá, {user?.name || 'Técnico'}!</h1>
          <p className="text-white/90 text-xs mt-0.5 max-w-xl">
            Painel de controle de atendimentos técnicos, materiais em campo e manutenções
            preventivas.
          </p>
        </div>

        {isTechnician && (
          <Button
            asChild
            className="bg-white text-[#0F6A3A] hover:bg-white/95 font-bold shadow-lg transition-transform active:scale-95"
          >
            <Link to="/ordens/nova" className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#0F6A3A]" />
              Nova Ordem de Serviço
            </Link>
          </Button>
        )}
      </div>

      {/* Grid de Contadores Principais — cada card abre a lista já filtrada */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Abertas */}
        <Link to="/ordens?status=ABERTA" className="block">
          <Card className="border-l-4 border-l-slate-400 hover:shadow-md hover:border-l-slate-600 transition cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase">Abertas</span>
                <ClipboardList className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-2xl font-black text-slate-800 mt-2">{countAberta}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Aguardando início</p>
            </CardContent>
          </Card>
        </Link>

        {/* Agendadas */}
        <Link to="/ordens?status=AGENDADA" className="block">
          <Card className="border-l-4 border-l-blue-500 hover:shadow-md hover:border-l-blue-700 transition cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase">Agendadas</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-700 mt-2">{countAgendada}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Com data definida</p>
            </CardContent>
          </Card>
        </Link>

        {/* Em Andamento */}
        <Link to="/ordens?status=EM%20ANDAMENTO" className="block">
          <Card className="border-l-4 border-l-orange-600 hover:shadow-md hover:border-l-orange-800 transition cursor-pointer h-full bg-orange-50/20">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase text-orange-900">
                  Em Andamento
                </span>
                <PlayCircle className="w-4 h-4 text-orange-600 animate-pulse" />
              </div>
              <div className="text-2xl font-black text-orange-700 mt-2">{countAndamento}</div>
              <p className="text-[11px] text-orange-800/80 mt-1">Atendimento ativo</p>
            </CardContent>
          </Card>
        </Link>

        {/* Aguardando Material */}
        <Link to="/ordens?status=AGUARDANDO%20MATERIAL" className="block">
          <Card className="border-l-4 border-l-amber-500 hover:shadow-md hover:border-l-amber-700 transition cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase">Aguard. Material</span>
                <PackageOpen className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-700 mt-2">{countAguardando}</div>
              <p className="text-[11px] text-muted-foreground mt-1">Peça pendente</p>
            </CardContent>
          </Card>
        </Link>

        {/* Finalizadas */}
        <Link to="/ordens?status=FINALIZADA" className="block">
          <Card className="border-l-4 border-l-red-600 hover:shadow-md hover:border-l-red-800 transition cursor-pointer h-full bg-red-50/20">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase text-emerald-900">
                  Finalizadas
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-red-700 mt-2">{countFinalizada}</div>
              <p className="text-[11px] text-red-800/80 mt-1">Laudos emitidos</p>
            </CardContent>
          </Card>
        </Link>

        {/* Atendimentos do Dia */}
        <Link to="/ordens?status=HOJE" className="block">
          <Card className="border-l-4 border-l-[#0F6A3A] bg-[#0F6A3A]/5 hover:shadow-md hover:border-l-[#0F6A3A]/70 transition cursor-pointer h-full">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-[#0F6A3A]">
                <span className="text-xs font-bold uppercase">
                  Hoje ({todayStr.slice(8, 10)}/{todayStr.slice(5, 7)})
                </span>
                <CalendarDays className="w-4 h-4 text-[#0F6A3A]" />
              </div>
              <div className="text-2xl font-black text-[#0F6A3A] mt-2">{countHoje}</div>
              <p className="text-[11px] text-[#0F6A3A]/80 mt-1 font-medium">Escaladas p/ hoje</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Conteúdo em Duas Colunas: Atendimentos Recentes & Manutenções */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ordens de Serviço Recentes (2 colunas) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Ordens de Serviço em Destaque</h2>
              <p className="text-xs text-muted-foreground">
                Atendimentos abertos e em execução em Macaé
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="text-xs gap-1">
              <Link to="/ordens">
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>

          <div className="space-y-2.5">
            {orders.slice(0, 5).map((order) => {
              const status = statusConfig[order.status] || {
                label: order.status,
                color: 'bg-slate-100 text-slate-800',
              }

              return (
                <Link
                  key={order.id}
                  to={`/ordens/${order.id}`}
                  className="block p-3.5 bg-card border rounded-xl hover:border-[#0F6A3A]/50 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#0F6A3A]">
                          OS #{order.order_number}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {order.expand?.client?.name || 'Cliente Avulso'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                        {order.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {order.service_type}
                        </span>
                        {order.expand?.technician && (
                          <span>Técnico: {order.expand.technician.name}</span>
                        )}
                        {order.location_address && (
                          <span className="flex items-center gap-1 line-clamp-1">
                            <MapPin className="w-3 h-3 text-[#0F6A3A]" /> Macaé/RJ
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`text-[10px] px-2 py-0.5 font-bold border ${status.color}`}>
                        {status.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground group-hover:text-[#0F6A3A] font-medium flex items-center gap-1">
                        Acessar <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}

            {orders.length === 0 && !loading && (
              <div className="p-8 text-center border-2 border-dashed rounded-xl bg-card">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">Nenhuma OS encontrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crie a primeira ordem de serviço para iniciar o fluxo.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Manutenções Futuras e Atalhos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Manutenções Futuras</h2>
              <p className="text-xs text-muted-foreground">Preventivas agendadas</p>
            </div>
            <Button variant="outline" size="sm" asChild className="text-xs gap-1">
              <Link to="/manutencoes">
                Ver agenda <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>

          <div className="space-y-2.5">
            {maintenances.slice(0, 4).map((m) => (
              <div key={m.id} className="p-3 bg-card border rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground line-clamp-1">
                    {m.expand?.client?.name || 'Cliente'}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-slate-50">
                    {m.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-700 font-medium">{m.maintenance_type}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 text-[#0F6A3A]" />
                  <span>
                    {m.scheduled_date
                      ? new Date(m.scheduled_date).toLocaleDateString('pt-BR')
                      : '-'}
                  </span>
                  {m.expand?.technician && (
                    <span className="border-l pl-2">Resp: {m.expand.technician.name}</span>
                  )}
                </div>
              </div>
            ))}

            {maintenances.length === 0 && !loading && (
              <div className="p-6 text-center border-2 border-dashed rounded-xl bg-card">
                <Calendar className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma manutenção futura pendente.</p>
              </div>
            )}
          </div>

          {/* Card de Identidade FL SERVIÇOS */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none shadow-md">
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                <FileText className="w-4 h-4" /> Relatório Técnico PDF V3
              </div>
              <p className="text-slate-300 leading-relaxed">
                Substituição do antigo AppSheet: relatórios agora contam com fotos, assinatura do
                cliente, localização GPS e padronização verde A4 (#0F6A3A e #2E8B57).
              </p>
              <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-700 flex justify-between">
                <span>F. L. SERVIÇOS • Macaé/RJ</span>
                <span className="text-emerald-400 font-semibold">100% Operacional</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
