/**
 * App do técnico (C10).
 *
 * Visão enxuta para quem está na rua: as OS do dia, o que fazer em cada uma, e
 * o caminho para registrar material, foto e assinatura. Sem valores, sem
 * financeiro, sem dado de cliente além do necessário para o serviço — o técnico
 * não precisa (e não deve) ver preço.
 *
 * É uma rota do mesmo app, decidida pelo perfil, e não um aplicativo separado:
 * resolve no celular sem depender de loja de aplicativos.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkOrders, getTechnicians } from '@/services/api'
import { getQuotes } from '@/services/crm'
import type { WorkOrder, Technician } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CalendarDays,
  MapPin,
  Camera,
  Package,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Truck,
} from 'lucide-react'

export default function TecnicoPage() {
  const { user, isAdmin } = useAuth()
  const [os, setOs] = useState<WorkOrder[]>([])
  const [tecnicos, setTecnicos] = useState<Technician[]>([])
  /**
   * PEDIDOS designados para ele (pedido do Felipe, 23/11/2026).
   *
   * O pedido é entrega de material: o técnico precisa ver o que vai levar,
   * para onde e para quem. Antes esta tela mostrava só OS, e ele não tinha
   * como saber da entrega pelo app. A regra do servidor já limita o pedido a
   * quem está designado nele.
   */
  const [pedidos, setPedidos] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [o, t, q] = await Promise.all([
          getWorkOrders(),
          getTechnicians(),
          // se o perfil não alcança pedido, a chamada falha e a lista fica vazia
          getQuotes().catch(() => [] as any[]),
        ])
        setOs(o)
        setTecnicos(t)
        setPedidos(Array.isArray(q) ? q : [])
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  /** O técnico logado é achado pelo vínculo com o usuário ou pelo e-mail */
  const eu = useMemo(() => {
    if (!user) return null
    return (
      tecnicos.find((t) => (t as any).user === user.id) ||
      tecnicos.find((t) => (t.email || '').toLowerCase() === (user.email || '').toLowerCase()) ||
      null
    )
  }, [tecnicos, user])

  const minhas = useMemo(() => {
    // o admin vê todas; o técnico vê só as dele.
    // Desde 23/11/2026 a OS aceita MAIS DE UM técnico: o campo pode vir como
    // string (um) ou array (vários). Comparar direto com `===` deixaria de
    // fora justamente as OS em que ele é o segundo designado.
    if (isAdmin) return os
    if (!eu) return []
    const dentro = (campo: unknown): boolean => {
      if (!campo) return false
      if (Array.isArray(campo)) return campo.indexOf(eu.id) >= 0
      return campo === eu.id
    }
    return os.filter((o) => dentro(o.technician))
  }, [os, eu, isAdmin])

  /** pedidos em que ele está designado e que ainda não foram entregues */
  const meusPedidos = useMemo(() => {
    const dentro = (campo: unknown): boolean => {
      if (!campo) return false
      if (Array.isArray(campo)) return campo.indexOf(eu?.id || '') >= 0
      return campo === eu?.id
    }
    const lista = isAdmin ? pedidos : pedidos.filter((q) => dentro(q.technicians))
    return lista.filter((q) => q.status !== 'ENTREGUE' && q.status !== 'CANCELADO')
  }, [pedidos, eu, isAdmin])

  const hojeStr = new Date().toISOString().slice(0, 10)
  const hoje = minhas.filter((o) => (o.scheduled_date || '').slice(0, 10) === hojeStr)
  const abertas = minhas.filter(
    (o) =>
      (o.status === 'ABERTA' ||
        o.status === 'EM ANDAMENTO' ||
        o.status === 'AGUARDANDO MATERIAL') &&
      (o.scheduled_date || '').slice(0, 10) !== hojeStr,
  )

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  const CartaoOS = ({ o }: { o: WorkOrder }) => (
    <Link
      to={`/ordens/${o.id}`}
      className="flex items-center gap-2 rounded-lg border bg-card p-2.5 transition hover:border-[#0B3D91]/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">
          #{o.order_number} · {o.expand?.client?.nickname || o.expand?.client?.name}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{o.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="px-1 py-0 text-[8px]">
            {o.service_type}
          </Badge>
          {o.expand?.client?.address && (
            <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" />
              {(o.expand.client.address || '').slice(0, 26)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight">Meus serviços</h1>
        <p className="text-[11px] text-muted-foreground">
          {eu ? eu.name : user?.name || 'Técnico'} · {hoje.length} hoje · {abertas.length} em aberto
        </p>
      </div>

      {!isAdmin && !eu && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Seu usuário ainda não está ligado a um cadastro de técnico. Peça ao administrador para
          vincular — assim as OS aparecem aqui.
        </div>
      )}

      <Card className="border-[#0B3D91]/30 bg-[#0B3D91]/5">
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[#0B3D91]" />
            <h2 className="text-sm font-bold">Hoje</h2>
            <span className="text-[10px] text-muted-foreground">
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              })}
            </span>
          </div>
          {hoje.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              Nada agendado para hoje. Bom descanso.
            </p>
          ) : (
            hoje.map((o) => <CartaoOS key={o.id} o={o} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold">Em aberto</h2>
          </div>
          {abertas.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">Nenhuma OS em aberto.</p>
          ) : (
            abertas.map((o) => <CartaoOS key={o.id} o={o} />)
          )}
        </CardContent>
      </Card>

      {/* ---------- PEDIDOS: entrega de material ---------- */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="space-y-1.5 p-3">
          <div className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm font-bold">Entregas</h2>
            <span className="text-[10px] text-muted-foreground">
              {meusPedidos.length} para entregar
            </span>
          </div>
          {meusPedidos.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              Nenhuma entrega designada para você.
            </p>
          ) : (
            meusPedidos.map((q) => (
              <Link
                key={q.id}
                to={`/pedido/${q.id}`}
                className="flex items-center gap-2 rounded-lg border bg-white p-2.5 transition hover:border-amber-400"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">
                    Pedido #{q.number || q.id.slice(-4)} ·{' '}
                    {q.expand?.client?.nickname || q.expand?.client?.name || 'Cliente'}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {Array.isArray(q.items) ? `${q.items.length} item(ns)` : 'ver materiais'} ·{' '}
                    {q.status || 'PEDIDO'}
                  </p>
                  {q.expand?.client?.address && (
                    <span className="mt-0.5 flex items-center gap-0.5 text-[8px] text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />
                      {(q.expand.client.address || '').slice(0, 30)}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <h2 className="mb-2 text-sm font-bold">No atendimento</h2>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Abra a OS para registrar o serviço executado:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              [Package, 'Materiais', 'o que usou'],
              [Camera, 'Fotos', 'evidência do serviço'],
              [CheckCircle2, 'Assinatura', 'do cliente'],
            ].map(([Icone, rot, sub]) => {
              const I = Icone as any
              return (
                <div key={rot as string} className="rounded-lg border bg-slate-50 p-2 text-center">
                  <I className="mx-auto mb-1 h-4 w-4 text-[#0B3D91]" />
                  <span className="block text-[10px] font-bold">{rot as string}</span>
                  <span className="block text-[8px] text-muted-foreground">{sub as string}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
        Valores, custos e financeiro não aparecem aqui — esta visão é só do serviço.
      </p>
    </div>
  )
}
