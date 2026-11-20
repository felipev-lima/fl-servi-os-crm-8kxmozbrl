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
} from 'lucide-react'

export default function TecnicoPage() {
  const { user, isAdmin } = useAuth()
  const [os, setOs] = useState<WorkOrder[]>([])
  const [tecnicos, setTecnicos] = useState<Technician[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [o, t] = await Promise.all([getWorkOrders(), getTechnicians()])
        setOs(o)
        setTecnicos(t)
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
    // o admin vê todas; o técnico vê só as dele
    if (isAdmin) return os
    if (!eu) return []
    return os.filter((o) => o.technician === eu.id)
  }, [os, eu, isAdmin])

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
