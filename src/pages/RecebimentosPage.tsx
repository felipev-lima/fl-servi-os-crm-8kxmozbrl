import { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { brl, dataBR } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { baixarExcel, type BlocoPlanilha } from '@/lib/exportarPlanilha'
import {
  Wallet,
  Receipt,
  Loader2,
  Search,
  Building2,
  FileSpreadsheet,
  TrendingUp,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * RECEBIMENTOS — o banco de dados de tudo que foi PAGO (pedido do Felipe,
 * 25/11/2026).
 *
 * "quero criar um banco de dados de tudo que for pago, gerado na nota fiscal...
 *  tudo que for dado como pago, lançado, eu sei a minha margem de lucro, quanto
 *  eu faturo no mês, quanto eu recebi"
 *
 * O QUE É: uma leitura só dos lançamentos de DINHEIRO (pagamento recebido).
 * Cada linha é um pagamento — com nota fiscal ou não, em lote ou individual.
 * É a visão de CAIXA, que é diferente da visão de FATURAMENTO:
 *
 *   FATURAMENTO = o que foi vendido   (capital + consumo + serviço)
 *   RECEBIMENTO = o que foi PAGO      (linhas DINHEIRO, que entram negativas)
 *
 * As duas se igualam no fim da vida da empresa, mas em meses diferentes — é
 * justamente essa diferença que mostra quanto está em atraso.
 *
 * O QUE A TELA RESPONDE:
 *  - quanto entrou no período
 *  - quanto entrou por empresa emissora (as do cadastro)
 *  - quanto entrou com nota e quanto entrou sem nota
 *  - quais notas foram recebidas, com o total de cada uma
 *  - o detalhe de cada pagamento, com cliente, data e observação
 */

interface Recebimento {
  id: string
  date: string
  description?: string
  details?: string
  notes?: string
  quantity?: number
  unit_price?: number
  client?: string
  nf_numero?: string
  nf_data?: string
  nf_lote?: string
  empresa_nota?: string
  settles?: string
  expand?: {
    client?: { id: string; name?: string; nickname?: string }
    empresa_nota?: { id: string; nome_curto?: string }
  }
}

const hojeISO = () => new Date().toISOString().slice(0, 10)
const primeiroDiaDoMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

/** Valor absoluto do pagamento (as linhas vêm negativas no banco). */
const valorDe = (r: Recebimento) => Math.abs(Number(r.quantity || 0) * Number(r.unit_price || 0))

export default function RecebimentosPage() {
  const [de, setDe] = useState(primeiroDiaDoMes())
  const [ate, setAte] = useState(hojeISO())
  const [busca, setBusca] = useState('')
  const [somenteNota, setSomenteNota] = useState(false)
  const [lista, setLista] = useState<Recebimento[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    setCarregando(true)
    try {
      const filtros = [
        'kind = "DINHEIRO"',
        `date >= "${de} 00:00:00"`,
        `date <= "${ate} 23:59:59"`,
      ]
      if (somenteNota) filtros.push('nf_numero != ""')

      const resp = await pb.collection('transactions').getFullList({
        filter: filtros.join(' && '),
        sort: 'date',
        expand: 'client,empresa_nota',
      })
      setLista(resp as unknown as Recebimento[])
    } catch (e: any) {
      console.error(e)
      toast.error('Não foi possível carregar os recebimentos.')
      setLista([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, somenteNota])

  /** Filtro de texto livre (cliente, descrição, número da nota). */
  const filtrados = useMemo(() => {
    const t = busca.trim().toUpperCase()
    if (!t) return lista
    return lista.filter((r) => {
      const cli = r.expand?.client?.nickname || r.expand?.client?.name || ''
      const alvo = [cli, r.description, r.details, r.nf_numero, r.notes]
        .filter(Boolean)
        .join(' ')
        .toUpperCase()
      return alvo.includes(t)
    })
  }, [lista, busca])

  const total = useMemo(() => filtrados.reduce((s, r) => s + valorDe(r), 0), [filtrados])

  const comNota = useMemo(() => filtrados.filter((r) => (r.nf_numero || '').trim()), [filtrados])
  const semNota = useMemo(() => filtrados.filter((r) => !(r.nf_numero || '').trim()), [filtrados])

  const totalComNota = useMemo(() => comNota.reduce((s, r) => s + valorDe(r), 0), [comNota])
  const totalSemNota = useMemo(() => semNota.reduce((s, r) => s + valorDe(r), 0), [semNota])

  /** Recebido por empresa emissora. */
  const porEmpresa = useMemo(() => {
    const mapa = new Map<string, { nome: string; qtd: number; valor: number }>()
    for (const r of filtrados) {
      const nome = r.expand?.empresa_nota?.nome_curto || 'sem empresa informada'
      const atual = mapa.get(nome) || { nome, qtd: 0, valor: 0 }
      atual.qtd += 1
      atual.valor += valorDe(r)
      mapa.set(nome, atual)
    }
    return [...mapa.values()].sort((a, b) => b.valor - a.valor)
  }, [filtrados])

  /** Agrupado por nota fiscal, para conferir contra a contabilidade. */
  const porNota = useMemo(() => {
    const mapa = new Map<string, { numero: string; empresa: string; data: string; valor: number }>()
    for (const r of comNota) {
      const numero = String(r.nf_numero || '').trim()
      const empresa = r.expand?.empresa_nota?.nome_curto || '—'
      const chave = `${empresa}::${numero}`
      const atual = mapa.get(chave) || {
        numero,
        empresa,
        data: String(r.nf_data || r.date || '').slice(0, 10),
        valor: 0,
      }
      atual.valor += valorDe(r)
      mapa.set(chave, atual)
    }
    return [...mapa.values()].sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [comNota])

  const exportar = () => {
    if (filtrados.length === 0) return toast.info('Nada para exportar neste período.')

    const blocos: BlocoPlanilha[] = [
      {
        titulo: `RECEBIMENTOS ${dataBR(de)} a ${dataBR(ate)}`,
        cabecalho: [
          { rotulo: 'Total recebido', valor: brl(total) },
          {
            rotulo: 'Com nota fiscal',
            valor: `${brl(totalComNota)} (${comNota.length} pagamento(s))`,
          },
          {
            rotulo: 'Sem nota fiscal',
            valor: `${brl(totalSemNota)} (${semNota.length} pagamento(s))`,
          },
        ],
        colunas: [
          { titulo: 'Data', largura: 80 },
          { titulo: 'Cliente', largura: 220 },
          { titulo: 'Descrição', largura: 260 },
          { titulo: 'NF', largura: 70 },
          { titulo: 'Empresa', largura: 130 },
          { titulo: 'Valor', largura: 90, alinhar: 'right', moeda: true },
        ],
        linhas: filtrados.map((r) => [
          dataBR(r.date),
          r.expand?.client?.nickname || r.expand?.client?.name || '—',
          r.description || '',
          r.nf_numero || '',
          r.expand?.empresa_nota?.nome_curto || '',
          valorDe(r),
        ]),
        totais: [{ rotulo: 'TOTAL RECEBIDO', valor: total, cor: '#D9EAD3' }],
      },
      {
        titulo: 'POR NOTA FISCAL',
        colunas: [
          { titulo: 'Data', largura: 80 },
          { titulo: 'Empresa', largura: 130 },
          { titulo: 'Nota', largura: 90 },
          { titulo: 'Recebido', largura: 100, alinhar: 'right', moeda: true },
        ],
        linhas: porNota.map((n) => [dataBR(n.data), n.empresa, n.numero, n.valor]),
        totais: [{ rotulo: 'TOTAL COM NOTA', valor: totalComNota }],
      },
    ]

    baixarExcel(`recebimentos-${de}-a-${ate}.xls`, blocos)
    toast.success('Planilha gerada.')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground">Recebimentos</h1>
          <p className="text-[11px] text-muted-foreground">
            Tudo que foi pago — com nota fiscal ou não. É o caixa real, não o faturado.
          </p>
        </div>
        <Button
          onClick={exportar}
          variant="outline"
          className="h-8 shrink-0 gap-1.5 border-emerald-300 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-4">
          <div>
            <label className="text-[9px] font-bold uppercase text-muted-foreground">De</label>
            <Input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase text-muted-foreground">Até</label>
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] font-bold uppercase text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="cliente, nota, descrição..."
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card className="border-l-4 border-l-[#0F6A3A]">
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Total recebido</p>
            <p className="text-base font-black text-[#0F6A3A]">{brl(total)}</p>
            <p className="text-[9px] text-muted-foreground">{filtrados.length} pagamento(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted-foreground">
              <Receipt className="h-2.5 w-2.5" /> Com nota fiscal
            </p>
            <p className="text-sm font-black text-slate-800">{brl(totalComNota)}</p>
            <p className="text-[9px] text-muted-foreground">{comNota.length} pagamento(s)</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-2.5">
            <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted-foreground">
              <Wallet className="h-2.5 w-2.5" /> Sem nota fiscal
            </p>
            <p className="text-sm font-black text-slate-800">{brl(totalSemNota)}</p>
            <p className="text-[9px] text-muted-foreground">{semNota.length} pagamento(s)</p>
          </CardContent>
        </Card>
      </div>

      {porEmpresa.length > 0 && (
        <Card>
          <CardContent className="p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase text-slate-600">
              <Building2 className="h-3 w-3" /> Recebido por empresa emissora
            </p>
            <div className="space-y-1">
              {porEmpresa.map((e) => (
                <div key={e.nome} className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-slate-700">
                    {e.nome}
                    <span className="ml-1 text-[9px] text-muted-foreground">({e.qtd})</span>
                  </span>
                  <span className="shrink-0 font-bold text-slate-900">{brl(e.valor)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {porNota.length > 0 && (
        <Card>
          <CardContent className="p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase text-slate-600">
              <TrendingUp className="h-3 w-3" /> Notas fiscais recebidas ({porNota.length})
            </p>
            <div className="max-h-52 space-y-0.5 overflow-y-auto">
              {porNota.map((n) => (
                <div
                  key={`${n.empresa}-${n.numero}`}
                  className="flex items-center justify-between border-b border-dashed pb-0.5 text-[11px] last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold text-slate-800">NF {n.numero}</span>
                    <span className="ml-1 text-[9px] text-muted-foreground">
                      {n.empresa} · {dataBR(n.data)}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold text-[#0F6A3A]">{brl(n.valor)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-600">
              <Calendar className="h-3 w-3" /> Pagamentos ({filtrados.length})
            </p>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center">
              <Wallet className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-xs font-semibold text-slate-700">Nenhum recebimento no período</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Mude as datas ou dê baixa num cliente para aparecer aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtrados.map((r) => {
                const cli = r.expand?.client?.nickname || r.expand?.client?.name || '—'
                const emp = r.expand?.empresa_nota?.nome_curto
                return (
                  <div key={r.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-800">{cli}</p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {dataBR(r.date)}
                        {r.nf_numero ? ` · NF ${r.nf_numero}` : ' · sem nota'}
                        {emp ? ` · ${emp}` : ''}
                      </p>
                      <p className="truncate text-[9px] text-muted-foreground/80">
                        {r.description || ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-black text-[#0F6A3A]">{brl(valorDe(r))}</p>
                      {r.settles && (
                        <Badge variant="outline" className="mt-0.5 text-[7px] uppercase">
                          item quitado
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
