/**
 * Agenda de serviços (C7).
 *
 * Visão de DIA ou de SEMANA das OS pela data agendada, com cliente e técnico
 * responsável. Filtro por técnico. Cada OS abre o detalhe.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkOrders, getTechnicians } from '@/services/api'
import { getClientsSummary } from '@/services/crm'
import type { WorkOrder, Technician } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarDays, ChevronLeft, ChevronRight, User } from 'lucide-react'
import { toast } from 'sonner'

type OSAgenda = WorkOrder & {
  client?: string
  order_number?: number
  technician?: string
  status?: string
}

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Domingo da semana que contém a data */
const inicioDaSemana = (d: Date) => {
  const r = inicioDoDia(d)
  r.setDate(r.getDate() - r.getDay())
  return r
}

const rotuloDia = (d: Date) =>
  d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

export default function AgendaPage() {
  const [os, setOs] = useState<OSAgenda[]>([])
  const [tecnicos, setTecnicos] = useState<Technician[]>([])
  const [nomesClientes, setNomesClientes] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [visao, setVisao] = useState<'dia' | 'semana'>('dia')
  const [referencia, setReferencia] = useState(() => inicioDoDia(new Date()))
  const [filtroTecnico, setFiltroTecnico] = useState('TODOS')

  useEffect(() => {
    ;(async () => {
      try {
        const [o, t, cs] = await Promise.all([
          getWorkOrders(),
          getTechnicians(),
          getClientsSummary(),
        ])
        setOs(o as OSAgenda[])
        setTecnicos(t)
        setNomesClientes(Object.fromEntries(cs.map((c) => [c.id, c.name || 'Cliente'])))
      } catch {
        toast.error('Não foi possível carregar a agenda.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  /** Dias exibidos: um só no modo dia; sete (domingo a sábado) no modo semana */
  const dias = useMemo(() => {
    if (visao === 'dia') return [referencia]
    const ini = inicioDaSemana(referencia)
    return Array.from(
      { length: 7 },
      (_, i) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i),
    )
  }, [visao, referencia])

  /** OS agrupadas pela data agendada, já filtradas pelo técnico */
  const porDia = useMemo(() => {
    const mapa = new Map<string, OSAgenda[]>()
    for (const o of os) {
      if (!o.scheduled_date) continue
      if (filtroTecnico !== 'TODOS' && o.technician !== filtroTecnico) continue
      const chave = o.scheduled_date.slice(0, 10)
      if (!mapa.has(chave)) mapa.set(chave, [])
      mapa.get(chave)!.push(o)
    }
    return mapa
  }, [os, filtroTecnico])

  const nomeTecnico = (id?: string) => tecnicos.find((t) => t.id === id)?.name || 'Sem técnico'

  const mover = (direcao: -1 | 1) => {
    setReferencia((r) => {
      const n = new Date(r.getFullYear(), r.getMonth(), r.getDate())
      n.setDate(n.getDate() + direcao * (visao === 'dia' ? 1 : 7))
      return n
    })
  }

  const tituloPeriodo =
    visao === 'dia' ? rotuloDia(referencia) : `${rotuloDia(dias[0])} a ${rotuloDia(dias[6])}`

  const hojeChave = chaveDia(new Date())

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
        <h1 className="flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
          <CalendarDays className="h-5 w-5 text-[#0B3D91]" /> Agenda
        </h1>
        <p className="text-[11px] text-muted-foreground">
          Serviços por data agendada, com o técnico responsável
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={visao === 'dia' ? 'default' : 'outline'}
              aria-pressed={visao === 'dia'}
              onClick={() => setVisao('dia')}
              className="h-7 text-[11px]"
            >
              Dia
            </Button>
            <Button
              size="sm"
              variant={visao === 'semana' ? 'default' : 'outline'}
              aria-pressed={visao === 'semana'}
              onClick={() => setVisao('semana')}
              className="h-7 text-[11px]"
            >
              Semana
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReferencia(inicioDoDia(new Date()))}
              className="h-7 text-[11px]"
            >
              Hoje
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                aria-label={visao === 'dia' ? 'Dia anterior' : 'Semana anterior'}
                onClick={() => mover(-1)}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={visao === 'dia' ? 'Próximo dia' : 'Próxima semana'}
                onClick={() => mover(1)}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="agenda-tecnico" className="text-[10px]">
              Técnico
            </Label>
            <select
              id="agenda-tecnico"
              value={filtroTecnico}
              onChange={(e) => setFiltroTecnico(e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            >
              <option value="TODOS">Todos os técnicos</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-sm font-bold capitalize">{tituloPeriodo}</h2>

      <div
        className={visao === 'semana' ? 'grid gap-2 sm:grid-cols-2 lg:grid-cols-4' : 'space-y-2'}
      >
        {dias.map((d) => {
          const chave = chaveDia(d)
          const lista = porDia.get(chave) || []
          return (
            <Card key={chave} className={chave === hojeChave ? 'border-[#1E6FD9]' : undefined}>
              <CardContent className="space-y-2 p-3">
                <h3 className="text-[11px] font-bold capitalize">
                  {visao === 'semana'
                    ? d.toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })
                    : chave === hojeChave
                      ? 'Hoje'
                      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </h3>
                {lista.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Nenhum serviço agendado.</p>
                )}
                {lista.map((o) => (
                  <Link
                    key={o.id}
                    to={`/ordens/${o.id}`}
                    className="block rounded-lg border bg-card p-2 text-xs transition hover:border-[#1E6FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6FD9]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">OS #{o.order_number}</span>
                      {o.status && (
                        <Badge variant="outline" className="text-[9px]">
                          {o.status}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[11px]">
                      {nomesClientes[o.client || ''] || 'Cliente não informado'}
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <User className="h-3 w-3" aria-hidden="true" />
                      {nomeTecnico(o.technician)}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
