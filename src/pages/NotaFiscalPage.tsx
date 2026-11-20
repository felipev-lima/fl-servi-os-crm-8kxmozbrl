/**
 * Nota fiscal de serviço (NFS-e) — estrutura e controle, sem emissão.
 *
 * O combinado foi preparar o terreno, não integrar com a prefeitura. Então
 * esta tela NÃO emite nota: ela organiza o que precisa existir para emitir
 * quando chegar a hora, e evita perder o controle do que já foi emitido por
 * fora (no portal da prefeitura).
 *
 * O que ela resolve hoje:
 *   - ver quais serviços prestados ainda estão sem nota;
 *   - registrar número, data e valores da nota emitida fora do sistema;
 *   - conferir a alíquota de ISS aplicada;
 *   - ter a lista pronta para o contador no fim do mês.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkOrders } from '@/services/api'
import type { WorkOrder } from '@/types/flservicos'
import { brl, dataBR } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  FileBadge,
  AlertTriangle,
  CheckCircle2,
  Download,
  ArrowRight,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { baixarExcel, type BlocoPlanilha } from '@/lib/exportarPlanilha'
import pb from '@/lib/pocketbase/client'

type StatusNota = 'NAO_EMITIDA' | 'EMITIDA' | 'CANCELADA'

export default function NotaFiscalPage() {
  const [os, setOs] = useState<WorkOrder[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'PENDENTE' | 'EMITIDA' | 'TODOS'>('PENDENTE')

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

  const statusDe = (o: WorkOrder): StatusNota =>
    ((o as any).nfse_status as StatusNota) || 'NAO_EMITIDA'

  /** Só faz sentido emitir nota de serviço que foi executado */
  const prestados = os.filter((o) => o.status === 'FINALIZADA' || Number(o.service_value || 0) > 0)

  const pendentes = prestados.filter((o) => statusDe(o) === 'NAO_EMITIDA')
  const emitidas = prestados.filter((o) => statusDe(o) === 'EMITIDA')

  const valorPendente = pendentes.reduce((s, o) => s + Number(o.service_value || 0), 0)
  const valorEmitido = emitidas.reduce((s, o) => s + Number(o.service_value || 0), 0)

  const lista = useMemo(() => {
    const base = filtro === 'PENDENTE' ? pendentes : filtro === 'EMITIDA' ? emitidas : prestados
    return [...base].sort((a, b) => Number(b.order_number) - Number(a.order_number))
  }, [filtro, prestados, pendentes, emitidas])

  /** Planilha para o contador: o que foi prestado e o que já tem nota */
  const exportar = () => {
    const linhas = prestados.map((o) => [
      o.order_number,
      o.expand?.client?.name || '',
      o.expand?.client?.document || '',
      dataBR(o.completed_at || o.scheduled_date),
      Number(o.service_value || 0),
      statusDe(o) === 'EMITIDA'
        ? 'EMITIDA'
        : statusDe(o) === 'CANCELADA'
          ? 'CANCELADA'
          : 'PENDENTE',
      (o as any).nfse_number || '',
      dataBR((o as any).nfse_issued_at),
      (o as any).iss_rate || '',
      Number((o as any).iss_amount || 0),
    ])
    const bloco: BlocoPlanilha = {
      titulo: 'NOTAS FISCAIS DE SERVIÇO — CONTROLE',
      colunas: [
        { titulo: 'OS', largura: 70, alinhar: 'right' },
        { titulo: 'CLIENTE', largura: 300 },
        { titulo: 'CNPJ/CPF', largura: 140 },
        { titulo: 'DATA', largura: 80, alinhar: 'center' },
        { titulo: 'VALOR SERVIÇO', largura: 110, alinhar: 'right', moeda: true },
        { titulo: 'SITUAÇÃO', largura: 90, alinhar: 'center' },
        { titulo: 'Nº NOTA', largura: 80, alinhar: 'center' },
        { titulo: 'EMISSÃO', largura: 80, alinhar: 'center' },
        { titulo: 'ISS %', largura: 60, alinhar: 'right' },
        { titulo: 'ISS R$', largura: 90, alinhar: 'right', moeda: true },
      ],
      linhas,
      totais: [
        {
          rotulo: 'TOTAL SERVIÇOS',
          valor: prestados.reduce((s, o) => s + Number(o.service_value || 0), 0),
        },
        { rotulo: 'EMITIDO', valor: valorEmitido },
        { rotulo: 'SEM NOTA', valor: valorPendente, cor: '#FEF3C7' },
      ],
    }
    baixarExcel(`NOTAS-FISCAIS-${new Date().toISOString().slice(0, 10)}`, [bloco])
    toast.success('Planilha gerada para o contador.')
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Nota fiscal</h1>
          <p className="text-[11px] text-muted-foreground">
            Controle das notas de serviço — emissão ainda é no portal da prefeitura
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={exportar}
          className="h-8 shrink-0 gap-1 text-[10px]"
        >
          <Download className="h-3 w-3" /> Contador
        </Button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
        <p className="flex gap-1.5 text-[10px] leading-relaxed text-amber-900">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            O sistema <strong>não emite nota</strong> — a emissão continua no portal da prefeitura.
            Aqui você controla o que já foi emitido e o que falta, e leva a lista pronta para o
            contador.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-amber-700">Sem nota</span>
              <AlertTriangle className="h-3 w-3 text-amber-700" />
            </div>
            <span className="font-mono text-xs font-black text-amber-700">{pendentes.length}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-emerald-700">Emitidas</span>
              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
            </div>
            <span className="font-mono text-xs font-black text-emerald-700">{emitidas.length}</span>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-blue-700">A emitir</span>
              <FileBadge className="h-3 w-3 text-blue-700" />
            </div>
            <span className="font-mono text-xs font-black text-blue-700">{brl(valorPendente)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['PENDENTE', `Sem nota (${pendentes.length})`],
          ['EMITIDA', `Emitidas (${emitidas.length})`],
          ['TODOS', `Todos (${prestados.length})`],
        ].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => setFiltro(v as any)}
            className={`h-7 text-[10px] ${filtro === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        {lista.map((o) => {
          const st = statusDe(o)
          return (
            <Card key={o.id} className={st === 'NAO_EMITIDA' ? 'border-amber-200' : ''}>
              <CardContent className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {st === 'EMITIDA' ? (
                        <Badge className="border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-800">
                          EMITIDA
                        </Badge>
                      ) : st === 'CANCELADA' ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[8px]">
                          CANCELADA
                        </Badge>
                      ) : (
                        <Badge className="border-amber-300 bg-amber-100 px-1.5 py-0 text-[8px] text-amber-800">
                          SEM NOTA
                        </Badge>
                      )}
                      <span className="text-[10px] font-bold">OS {o.order_number}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {dataBR(o.completed_at || o.scheduled_date)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-semibold">
                      {o.expand?.client?.nickname || o.expand?.client?.name}
                    </p>
                    <p className="truncate text-[9px] text-muted-foreground">
                      {o.expand?.client?.document || 'sem CNPJ'} · {o.description}
                    </p>
                    {(o as any).nfse_number && (
                      <p className="text-[9px] text-emerald-700">
                        Nota nº {(o as any).nfse_number}
                        {(o as any).nfse_issued_at ? ` · ${dataBR((o as any).nfse_issued_at)}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block font-mono text-xs font-bold text-[#0B3D91]">
                      {brl(Number(o.service_value || 0))}
                    </span>
                    <Link
                      to={`/ordens/${o.id}`}
                      className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-[#0B3D91] hover:underline"
                    >
                      Abrir <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {lista.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <FileBadge className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">
              {filtro === 'PENDENTE' ? 'Nenhum serviço sem nota' : 'Nada neste filtro'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
