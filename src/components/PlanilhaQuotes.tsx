/**
 * Planilha de PEDIDOS e ORÇAMENTOS na tela Planilha — pedido do Felipe
 * (25/11/2026): a tela só gerava planilha de OS; ele precisa copiar o
 * conteúdo do pedido para colar num backup numa planilha externa dele.
 *
 * Aqui a lista vem da coleção `quotes` (mesma coleção das OS), filtrada por
 * status: PEDIDOS = PEDIDO/AGUARDANDO MATERIAL/ENTREGUE/LANCADO (e FATURADO
 * antigo); ORÇAMENTOS = ORCAMENTO. Cancelados ficam de fora, como as OS
 * canceladas já ficam.
 *
 * Dois caminhos de saída, sem mexer no fluxo das OS:
 *  1. Gerar o .xlsx no MESMO layout da planilha de OS (src/lib/planilhaPedido.ts).
 *  2. Copiar o conteúdo como texto tabulado (TSV) — colando numa célula da
 *     planilha externa, cada campo cai numa coluna.
 */
import { useEffect, useMemo, useState } from 'react'
import { getQuotes } from '@/services/crm'
import type { Quote } from '@/types/crm'
import { dataBR, semAcento } from '@/types/crm'
import { configStatus } from '@/lib/pedidoStatus'
import {
  gerarPlanilhaQuotes,
  linhasDoQuote,
  linhasParaTexto,
  copiarTexto,
  totalDoQuote,
} from '@/lib/planilhaPedido'
import { entregarPlanilha } from '@/lib/planilhaOrcamento'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  CalendarDays,
  Copy,
  ClipboardCheck,
} from 'lucide-react'
import { toast } from 'sonner'

type TipoLista = 'PEDIDOS' | 'ORCAMENTOS'

/** Status que contam como PEDIDO (FATURADO é legado, cai aqui também). */
const STATUS_PEDIDO_BUCKET = ['PEDIDO', 'AGUARDANDO MATERIAL', 'ENTREGUE', 'LANCADO', 'FATURADO']

function doBucket(q: Quote, tipo: TipoLista): boolean {
  const s = String(q.status || 'ORCAMENTO')
  if (s === 'CANCELADO') return false
  return tipo === 'ORCAMENTOS' ? s === 'ORCAMENTO' : STATUS_PEDIDO_BUCKET.includes(s)
}

export default function PlanilhaQuotes({ tipo }: { tipo: TipoLista }) {
  const [todos, setTodos] = useState<Quote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    let vivo = true
    setSelecionadas(new Set())
    setCarregando(true)
    getQuotes()
      .then((qs) => {
        if (vivo) setTodos(qs.filter((q) => doBucket(q, tipo)))
      })
      .catch(() => {
        toast.error('Não foi possível carregar os documentos.')
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [tipo])

  const dataDoDoc = (q: Quote) => String(q.date || q.created || '')

  const doMes = useMemo(() => todos.filter((q) => dataDoDoc(q).slice(0, 7) === mes), [todos, mes])

  const filtradas = useMemo(() => {
    const t = semAcento(busca)
    if (!t) return doMes
    return doMes.filter((q) => {
      const cli = q.expand?.client
      const alvo = semAcento(`${cli?.name || ''} ${cli?.nickname || ''}`)
      return alvo.includes(t) || String(q.number ?? '').includes(t)
    })
  }, [doMes, busca])

  const alternar = (id: string) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const selecionarMes = () => {
    setSelecionadas(new Set(doMes.map((q) => q.id)))
    toast.info(
      doMes.length === 0
        ? 'Nenhum documento nesse mês.'
        : `${doMes.length} documento(s) de ${mes} selecionado(s).`,
    )
  }

  const escolhidos = todos.filter((q) => selecionadas.has(q.id))
  const totalSelecionado = escolhidos.reduce((s, q) => s + totalDoQuote(q), 0)

  const prefixo: 'PEDIDO' | 'ORCAMENTO' = tipo === 'ORCAMENTOS' ? 'ORCAMENTO' : 'PEDIDO'

  const gerar = async () => {
    if (escolhidos.length === 0) {
      toast.error('Selecione pelo menos um documento.')
      return
    }
    setGerando(true)
    try {
      const { blob, nome } = await gerarPlanilhaQuotes(escolhidos, prefixo)
      await entregarPlanilha(blob, nome)
      toast.success(
        escolhidos.length === 1
          ? 'Planilha gerada!'
          : `Planilha com ${escolhidos.length} documento(s) gerada!`,
      )
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível gerar a planilha.')
    } finally {
      setGerando(false)
    }
  }

  /** Copia o conteúdo (TSV) dos documentos selecionados para a área de transferência. */
  const copiar = async () => {
    if (escolhidos.length === 0) {
      toast.error('Selecione pelo menos um documento.')
      return
    }
    setCopiando(true)
    try {
      const partes = escolhidos.map((q) => {
        const cli = q.expand?.client?.name || 'CLIENTE'
        return linhasParaTexto(`${prefixo} ${q.number ?? ''} - ${cli}`, linhasDoQuote(q))
      })
      const ok = await copiarTexto(partes.join('\n\n'))
      if (ok) {
        toast.success('Conteúdo copiado! Cole na sua planilha (Ctrl+V).')
      } else {
        toast.error('Não consegui copiar. Use "Gerar planilha Excel" e abra o arquivo.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível copiar o conteúdo.')
    } finally {
      setCopiando(false)
    }
  }

  const rotuloDoc = tipo === 'ORCAMENTOS' ? 'orçamento' : 'pedido'

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Mês</Label>
              <Input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-9 text-xs w-[150px]"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selecionarMes}
              className="h-9 text-xs gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Selecionar o mês
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelecionadas(new Set())}
              className="h-9 text-xs"
            >
              Limpar
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">Buscar cliente ou nº</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite parte do nome ou o número"
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando {rotuloDoc}s...
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((q) => {
            const marcada = selecionadas.has(q.id)
            const cfg = configStatus(String(q.status || 'ORCAMENTO'))
            const itens = (q.items || []).length
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => alternar(q.id)}
                className={`w-full text-left p-3 rounded-lg border transition flex items-start gap-3 ${
                  marcada
                    ? 'border-[#0B3D91] bg-[#0B3D91]/5'
                    : 'border-slate-200 bg-card hover:border-[#0B3D91]/40'
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    marcada ? 'bg-[#0B3D91] border-[#0B3D91]' : 'border-slate-300'
                  }`}
                >
                  {marcada && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#0B3D91]">
                      #{q.number ?? '—'}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {q.expand?.client?.name || 'Cliente'}
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      {cfg.rotulo}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span>{dataBR(dataDoDoc(q))}</span>
                    <span>
                      {itens} item{itens === 1 ? '' : 'ens'}
                    </span>
                    <span className="font-mono">Total R$ {totalDoQuote(q).toFixed(2)}</span>
                  </div>
                </div>
              </button>
            )
          })}

          {filtradas.length === 0 && (
            <div className="p-8 text-center border-2 border-dashed rounded-xl">
              <FileSpreadsheet className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhum {rotuloDoc} encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Ajuste o mês ou a busca.</p>
            </div>
          )}
        </div>
      )}

      {/* ações */}
      <div className="sticky bottom-2 bg-card border rounded-xl p-3 shadow-lg space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">
            {selecionadas.size === 0
              ? `Nenhum ${rotuloDoc} selecionado`
              : `${selecionadas.size} ${rotuloDoc}(s) selecionado(s)`}
          </span>
          {selecionadas.size > 0 && (
            <span className="font-mono text-[#0B3D91] font-bold">
              Total: R$ {totalSelecionado.toFixed(2)}
            </span>
          )}
        </div>

        <Button
          onClick={copiar}
          disabled={copiando || selecionadas.size === 0}
          variant="outline"
          className="w-full h-9 text-xs font-semibold gap-1.5 border-[#0B3D91] text-[#0B3D91] hover:bg-[#0B3D91]/5"
        >
          {copiando ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ClipboardCheck className="w-3.5 h-3.5" />
          )}
          {copiando ? 'Copiando...' : 'Copiar conteúdo (colar na planilha)'}
        </Button>

        <Button
          onClick={gerar}
          disabled={gerando || selecionadas.size === 0}
          className="w-full bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold gap-2"
        >
          {gerando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {gerando ? 'Gerando planilha...' : 'Gerar planilha Excel'}
        </Button>
      </div>
    </div>
  )
}
