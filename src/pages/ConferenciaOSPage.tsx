/**
 * Conferência das OS herdadas na migração para a LM.
 *
 * As 16 OS vieram junto com a cópia, e parte delas já foi passada para a
 * planilha do Felipe — parte não. Sem esta tela ele não tem como saber, meses
 * depois, qual OS já está lançada e qual ficou pendente.
 *
 * Três estados, na ordem do trabalho:
 *   PENDENTE        ainda não verifiquei
 *   CONFERIDA       já está na planilha dele, nada a fazer
 *   LANCADA_NO_CRM  foi lançada aqui dentro e já aparece no relatório do cliente
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkOrders, updateWorkOrder } from '@/services/api'
import type { WorkOrder } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, CheckCircle2, Clock3, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

type Marca = 'PENDENTE' | 'CONFERIDA' | 'LANCADA_NO_CRM'

const MARCAS: { valor: Marca; label: string; cor: string; icone: any }[] = [
  {
    valor: 'PENDENTE',
    label: 'Pendente',
    cor: 'border-amber-300 bg-amber-100 text-amber-800',
    icone: Clock3,
  },
  {
    valor: 'CONFERIDA',
    label: 'Conferida',
    cor: 'border-blue-300 bg-blue-100 text-blue-800',
    icone: CheckCircle2,
  },
  {
    valor: 'LANCADA_NO_CRM',
    label: 'Lançada no CRM',
    cor: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    icone: FileSpreadsheet,
  },
]

export default function ConferenciaOSPage() {
  const [os, setOs] = useState<WorkOrder[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('TODOS')

  const carregar = async () => {
    setCarregando(true)
    try {
      setOs(await getWorkOrders())
    } catch {
      toast.error('Não foi possível carregar as OS.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const marcaDe = (o: WorkOrder): Marca => ((o as any).planilha_conferida as Marca) || 'PENDENTE'

  const contagem = useMemo(() => {
    const c = { PENDENTE: 0, CONFERIDA: 0, LANCADA_NO_CRM: 0 } as Record<Marca, number>
    for (const o of os) c[marcaDe(o)] += 1
    return c
  }, [os])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return os
      .filter((o) => (filtro === 'TODOS' ? true : marcaDe(o) === filtro))
      .filter((o) => {
        if (!t) return true
        return (
          String(o.order_number).includes(t) ||
          (o.expand?.client?.name || '').toLowerCase().includes(t) ||
          (o.expand?.client?.nickname || '').toLowerCase().includes(t)
        )
      })
      .sort((a, b) => Number(b.order_number) - Number(a.order_number))
  }, [os, filtro, busca])

  const marcar = async (o: WorkOrder, m: Marca) => {
    try {
      await updateWorkOrder(o.id, { planilha_conferida: m } as any)
      setOs((prev) =>
        prev.map((x) => (x.id === o.id ? ({ ...x, planilha_conferida: m } as any) : x)),
      )
      toast.success(`OS ${o.order_number}: ${MARCAS.find((x) => x.valor === m)?.label}.`)
    } catch {
      toast.error('Não foi possível salvar a marcação.')
    }
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
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Conferência das OS</h1>
        <p className="text-[11px] text-muted-foreground">
          {contagem.PENDENTE} pendente(s) · {contagem.CONFERIDA} já na planilha ·{' '}
          {contagem.LANCADA_NO_CRM} lançada(s) aqui
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MARCAS.map((m) => {
          const Icone = m.icone
          return (
            <Card key={m.valor} className={`border ${m.cor.split(' ')[0]} ${m.cor.split(' ')[1]}`}>
              <CardContent className="p-2.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-bold uppercase ${m.cor.split(' ')[2]}`}>
                    {m.label}
                  </span>
                  <Icone className={`h-3 w-3 ${m.cor.split(' ')[2]}`} />
                </div>
                <span className={`font-mono text-sm font-black ${m.cor.split(' ')[2]}`}>
                  {contagem[m.valor]}
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número da OS ou cliente..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {[['TODOS', 'Todas'], ...MARCAS.map((m) => [m.valor, m.label])].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => setFiltro(v)}
            className={`h-7 text-[10px] ${filtro === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        {lista.map((o) => {
          const atual = marcaDe(o)
          const cfg = MARCAS.find((m) => m.valor === atual)!
          const Icone = cfg.icone
          return (
            <Card key={o.id}>
              <CardContent className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={`gap-0.5 border px-1.5 py-0 text-[8px] ${cfg.cor}`}>
                        <Icone className="h-2.5 w-2.5" /> {cfg.label}
                      </Badge>
                      <span className="text-[10px] font-bold">OS {o.order_number}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-semibold">
                      {o.expand?.client?.nickname || o.expand?.client?.name}
                    </p>
                    <p className="truncate text-[9px] text-muted-foreground">{o.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-6 shrink-0 gap-0.5 px-1 text-[9px] text-[#0B3D91]"
                  >
                    <Link to={`/ordens/${o.id}`}>
                      Abrir <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </Button>
                </div>

                <div className="flex gap-1 border-t pt-1">
                  {MARCAS.filter((m) => m.valor !== atual).map((m) => (
                    <Button
                      key={m.valor}
                      size="sm"
                      variant="outline"
                      onClick={() => marcar(o, m.valor)}
                      className="h-6 flex-1 gap-1 text-[9px]"
                    >
                      <m.icone className="h-2.5 w-2.5" /> {m.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {lista.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhuma OS neste filtro</p>
          </div>
        )}
      </div>
    </div>
  )
}
