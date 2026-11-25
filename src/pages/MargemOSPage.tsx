/**
 * Custo e margem por OS (C3).
 *
 * Recebido (pagamento recebido, ou o valor do serviço se não houver pagamento)
 * menos o custo dos materiais da OS (quantidade × custo cadastrado). Mostra as
 * OS mais rentáveis e as que deram prejuízo. Material sem custo cadastrado não
 * entra no custo — a tela avisa quantas OS estão nessa condição.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { getWorkOrders, getMaterials } from '@/services/api'
import { getClientsSummary } from '@/services/crm'
import type { WorkOrder } from '@/types/flservicos'
import { brl } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

type OSFonte = WorkOrder & {
  client?: string
  order_number?: number
  status?: string
  payment_received?: number
  service_value?: number
}

type LinhaMateriaOS = { work_order: string; material: string; quantity?: number }

type OSMargem = {
  id: string
  numero: number | undefined
  cliente: string
  recebido: number
  custo: number
  lucro: number
  margem: number | null
  semCusto: boolean
}

export default function MargemOSPage() {
  const [linhas, setLinhas] = useState<OSMargem[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [os, ms, materiais, clientes] = await Promise.all([
          getWorkOrders(),
          getMaterials(),
          pb.collection('order_materials').getFullList({ sort: 'created' }),
          getClientsSummary(),
        ])
        const nomes = new Map(clientes.map((c) => [c.id, c.name || 'Cliente']))
        const custoMaterial = new Map(ms.map((m) => [m.id, Number(m.cost || 0)]))

        // custo e linhas sem custo, agrupados por OS
        const porOS = new Map<string, { custo: number; semCusto: boolean }>()
        for (const l of materiais as unknown as LinhaMateriaOS[]) {
          const acc = porOS.get(l.work_order) ?? { custo: 0, semCusto: false }
          const c = custoMaterial.get(l.material) ?? 0
          if (c > 0) acc.custo += c * Number(l.quantity || 0)
          else acc.semCusto = true
          porOS.set(l.work_order, acc)
        }

        const montadas: OSMargem[] = []
        for (const o of os as OSFonte[]) {
          if (String(o.status) === 'CANCELADA') continue
          const recebido = Number(o.payment_received || o.service_value || 0)
          const acc = porOS.get(o.id) ?? { custo: 0, semCusto: false }
          if (recebido === 0 && acc.custo === 0) continue
          montadas.push({
            id: o.id,
            numero: o.order_number,
            cliente: nomes.get(o.client || '') || 'Cliente não informado',
            recebido,
            custo: acc.custo,
            lucro: recebido - acc.custo,
            margem: recebido > 0 ? ((recebido - acc.custo) / recebido) * 100 : null,
            semCusto: acc.semCusto,
          })
        }
        setLinhas(montadas.sort((a, b) => b.lucro - a.lucro))
      } catch {
        toast.error('Não foi possível carregar custo e margem.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const rentaveis = useMemo(() => linhas.filter((l) => l.lucro > 0).slice(0, 5), [linhas])
  const prejuizo = useMemo(
    () => linhas.filter((l) => l.lucro < 0).sort((a, b) => a.lucro - b.lucro),
    [linhas],
  )
  const totalSemCusto = linhas.filter((l) => l.semCusto).length

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  const renderLinha = (l: OSMargem) => (
    <Link
      key={l.id}
      to={`/ordens/${l.id}`}
      className="flex items-center gap-2 rounded-lg border bg-card p-2 text-left transition hover:border-[#1E6FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6FD9]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold">
          OS #{l.numero} · {l.cliente}
        </p>
        <p className="text-[9px] text-muted-foreground">
          recebido {brl(l.recebido)} · custo {brl(l.custo)}
          {l.semCusto ? ' · há material sem custo cadastrado' : ''}
        </p>
      </div>
      {l.margem !== null && (
        <Badge
          variant="outline"
          className={`shrink-0 px-1.5 py-0 text-[9px] ${
            l.margem >= 30
              ? 'border-emerald-300 text-emerald-800'
              : l.margem >= 0
                ? 'border-amber-300 text-amber-800'
                : 'border-rose-300 text-rose-800'
          }`}
        >
          {l.margem.toFixed(0)}%
        </Badge>
      )}
      <span
        className={`shrink-0 font-mono text-xs font-bold ${
          l.lucro >= 0 ? 'text-emerald-700' : 'text-rose-700'
        }`}
      >
        {brl(l.lucro)}
      </span>
    </Link>
  )

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Custo e margem por OS</h1>
        <p className="text-[11px] text-muted-foreground">
          Recebido menos o custo dos materiais de cada OS
        </p>
      </div>

      {totalSemCusto > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
          {totalSemCusto} OS têm material sem custo cadastrado — a margem delas está superestimada.
          Cadastre o custo em Materiais.
        </p>
      )}

      <section aria-labelledby="margem-rentaveis" className="space-y-1.5">
        <h2 id="margem-rentaveis" className="flex items-center gap-1 text-sm font-bold">
          <TrendingUp className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Mais rentáveis
        </h2>
        {rentaveis.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhuma OS com lucro ainda.</p>
        )}
        {rentaveis.map(renderLinha)}
      </section>

      <section aria-labelledby="margem-prejuizo" className="space-y-1.5">
        <h2 id="margem-prejuizo" className="flex items-center gap-1 text-sm font-bold">
          <TrendingDown className="h-4 w-4 text-rose-700" aria-hidden="true" /> Prejuízo
        </h2>
        {prejuizo.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhuma OS com prejuízo.</p>
        )}
        {prejuizo.map(renderLinha)}
      </section>

      <section aria-labelledby="margem-todas" className="space-y-1.5">
        <h2 id="margem-todas" className="text-sm font-bold">
          Todas as OS
        </h2>
        <Card>
          <CardContent className="space-y-1.5 p-2">{linhas.map(renderLinha)}</CardContent>
        </Card>
      </section>
    </div>
  )
}
