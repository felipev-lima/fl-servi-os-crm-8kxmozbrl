/**
 * Agenda de serviços (C7).
 *
 * Mostra as OS por data agendada, filtráveis por técnico. No celular começa
 * no dia de hoje — é o que interessa a quem está indo para a rua.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkOrders, getTechnicians } from '@/services/api'
import type { WorkOrder, Technician } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarDays, ChevronLeft, ChevronRight, User } from 'lucide-react'
import { toast } from 'sonner'

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export default function AgendaPage() {
  const [os, setOs] = useState<WorkOrder[]>([])
  const [tecnicos, setTecnicos] = useState<Technician[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mes, setMes] = useState(() => {
    const h = new Date()
    return { ano: h.getFullYear(), mes: h.getMonth() }
  })
  const [filtroTecnico, setFiltroTecnico] = useState('TODOS')

  useEffect(() => {
    ;(async () => {
      try {
        const [o, t] = await Promise.all([getWorkOrders(), getTechnicians()])
        setOs(o)
        setTecnicos(t)
      } catch {
        toast.error('Não foi possível carregar a agenda.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  /** Dias do mês + espaços antes do primeiro dia */
  const dias = useMemo(() => {
    const primeiro = new Date(mes.ano, mes.mes, 1)
    const ultimo = new Date(mes.ano, mes.mes + 1, 0)
    const vazios = primeiro.getDay()
    const lista: (number | null)[] = Array(vazios).fill(null)
    for (let d = 1; d <= ultimo.getDate(); d++) lista.push(d)
    return lista
  }, [mes])

  const porDia = useMemo(() => {
    const mapa = new Map<string, WorkOrder[]>()
    for (const o of os) {
      if (!o.scheduled_date) continue
      if (filtroTecnico !== 'TODOS' && o.technician !== filtroTecnico) continue
      const chave = o.scheduled_date.slice(0, 10)
      if (!mapa.has(chave)) mapa.set(chave, [])
      mapa.get(chave)!.push(o)
    }
    return mapa
  }, [os, filtroTecnico])

  const hojeStr = new Date().toISOString().slice(0, 10)
  const osHoje = porDia.get(hojeStr) || []

  const chaveDia = (d: number) =>
    `${mes.ano}-${String(mes.mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const mudarMes = (delta: number) => {
    setMes((m) => {
      const d = new Date(m.ano, m.mes + delta, 1)
      return { ano: d.getFullYear(), mes: d.getMonth() }
    })
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Agenda</h1>
        <p className="text-[11px] text-muted-foreground">
          {osHoje.length} serviço(s) hoje · {os.filter((o) => o.scheduled_date).length} agendados
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant={filtroTecnico === 'TODOS' ? 'default' : 'outline'}
          onClick={() => setFiltroTecnico('TODOS')}
          className={`h-7 text-[10px] ${filtroTecnico === 'TODOS' ? 'bg-slate-900 text-white' : ''}`}
        >
          Todos
        </Button>
        {tecnicos
          .filter((t) => t.active !== false)
          .map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={filtroTecnico === t.id ? 'default' : 'outline'}
              onClick={() => setFiltroTecnico(t.id)}
              className={`h-7 text-[10px] ${filtroTecnico === t.id ? 'bg-slate-900 text-white' : ''}`}
            >
              {t.name.split(' ')[0]}
            </Button>
          ))}
      </div>

      {/* Hoje primeiro no celular */}
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
          {osHoje.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              Nenhum serviço agendado para hoje.
            </p>
          ) : (
            osHoje.map((o) => (
              <Link
                key={o.id}
                to={`/ordens/${o.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border bg-white p-2 transition hover:border-[#0B3D91]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    #{o.order_number} · {o.expand?.client?.nickname || o.expand?.client?.name}
                  </p>
                  <p className="truncate text-[9px] text-muted-foreground">{o.description}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[8px]">
                  {o.status}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* Calendário do mês */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => mudarMes(-1)} className="h-7 w-7 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-bold capitalize">
              {MESES[mes.mes]} {mes.ano}
            </span>
            <Button size="sm" variant="ghost" onClick={() => mudarMes(1)} className="h-7 w-7 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <span key={i} className="pb-1 text-[8px] font-bold text-muted-foreground">
                {d}
              </span>
            ))}
            {dias.map((d, i) => {
              if (d === null) return <div key={`v${i}`} />
              const chave = chaveDia(d)
              const qtd = porDia.get(chave)?.length || 0
              const ehHoje = chave === hojeStr
              return (
                <div
                  key={chave}
                  className={`flex aspect-square flex-col items-center justify-center rounded text-[10px] ${
                    ehHoje
                      ? 'bg-[#0B3D91] font-bold text-white'
                      : qtd > 0
                        ? 'bg-[#0B3D91]/10 font-semibold'
                        : 'text-muted-foreground'
                  }`}
                >
                  {d}
                  {qtd > 0 && (
                    <span
                      className={`text-[7px] leading-none ${ehHoje ? 'text-white' : 'text-[#0B3D91]'}`}
                    >
                      {qtd} OS
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Por técnico */}
      <Card>
        <CardContent className="p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <User className="h-4 w-4" /> Por técnico
          </h2>
          <div className="space-y-1">
            {tecnicos
              .filter((t) => t.active !== false)
              .map((t) => {
                const qtd = os.filter(
                  (o) =>
                    o.technician === t.id && o.status !== 'FINALIZADA' && o.status !== 'CANCELADA',
                ).length
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border-b py-1 text-[11px] last:border-0"
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="font-mono font-bold text-[#0B3D91]">{qtd} em aberto</span>
                  </div>
                )
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
