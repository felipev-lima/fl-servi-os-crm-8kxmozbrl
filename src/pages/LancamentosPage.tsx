/**
 * Lançamentos — o lado financeiro do CRM.
 *
 * É a linha da planilha do Felipe, sem a planilha: cliente, divisão
 * (capital/consumo/serviço/dinheiro), descrição, quantidade e valor.
 *
 * Diferenças deliberadas em relação à planilha:
 *  - o pagamento é digitado POSITIVO e o sistema inverte (esquecer o sinal
 *    era a maior fonte de erro);
 *  - o total nunca é digitado, sempre calculado;
 *  - a data é data de verdade, não texto;
 *  - a lista é paginada e o filtro de tipo roda no servidor.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getClientsSummary,
} from '@/services/crm'
import type { Transaction, TransactionKind, ClientSummary } from '@/types/crm'
import { TIPOS, brl, dataBR, totalDaLinha, semAcento } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Search,
  Loader2,
  Trash2,
  CheckCircle2,
  Send,
  Clock3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useViewMode, ViewModeSelector } from '@/components/ViewModeSelector'
import { useAuth } from '@/contexts/AuthContext'

const POR_PAGINA = 40

export default function LancamentosPage() {
  const [params, setParams] = useSearchParams()
  const [resumos, setResumos] = useState<ClientSummary[]>([])
  const [itens, setItens] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useViewMode('lancamentos')
  const { isAdmin } = useAuth()

  // formulário
  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [tipo, setTipo] = useState<TransactionKind>('SERVICO')
  const [descricao, setDescricao] = useState('')
  const [detalhes, setDetalhes] = useState('')
  const [qtd, setQtd] = useState('1')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [osRef, setOsRef] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = async (pag = pagina, t = filtroTipo) => {
    setCarregando(true)
    try {
      const [rs, lista] = await Promise.all([
        resumos.length ? Promise.resolve(resumos) : getClientsSummary(),
        getTransactions({ page: pag, perPage: POR_PAGINA, kind: t }),
      ])
      setResumos(rs)
      setItens(lista.items)
      setTotal(lista.total)
    } catch {
      toast.error('Não foi possível carregar os lançamentos.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar(pagina, filtroTipo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, filtroTipo])

  useEffect(() => {
    if (params.get('novo') === '1') {
      setAberto(true)
      const c = params.get('cliente')
      if (c) setClienteId(c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, resumos])

  const clientesFiltrados = useMemo(() => {
    const t = semAcento(buscaCliente.trim())
    if (!t) return resumos.slice(0, 6)
    return resumos
      .filter(
        (r) =>
          semAcento(r.name).includes(t) ||
          semAcento(r.nickname || '').includes(t) ||
          (r.document || '').includes(t),
      )
      .slice(0, 8)
  }, [resumos, buscaCliente])

  const clienteEscolhido = resumos.find((r) => r.id === clienteId)

  const totalForm = useMemo(() => {
    const q = Number(qtd) || 0
    const v = Number(String(valor).replace(',', '.')) || 0
    return tipo === 'DINHEIRO' ? -Math.abs(q * v) : q * v
  }, [qtd, valor, tipo])

  /**
   * No DINHEIRO o valor é gravado NEGATIVO (abate do saldo). Nos outros tipos
   * o sinal vem do que a pessoa digitou — desconto é digitado com menos.
   */
  const salvar = async () => {
    if (!clienteId) return toast.error('Escolha o cliente.')
    if (!descricao.trim()) return toast.error('Descreva o lançamento.')
    setSalvando(true)
    try {
      const q = Number(qtd) || 0
      const v = Number(String(valor).replace(',', '.')) || 0
      await createTransaction({
        client: clienteId,
        date: `${data} 12:00:00.000Z`,
        kind: tipo,
        item_type: tipo === 'SERVICO' || tipo === 'DINHEIRO' ? 'SERVICO' : 'PRODUTO',
        description: descricao.trim(),
        details: detalhes.trim(),
        quantity: q,
        unit_price: tipo === 'DINHEIRO' ? -Math.abs(v) : v,
        work_order_ref: osRef.trim(),
        sent_to_finance: 'PENDENTE',
      })
      toast.success('Lançamento registrado.')
      setAberto(false)
      setDescricao('')
      setDetalhes('')
      setValor('')
      setOsRef('')
      setClienteId('')
      setBuscaCliente('')
      setResumos([])
      setParams(new URLSearchParams(), { replace: true })
      void carregar(1, filtroTipo)
      setPagina(1)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (t: Transaction) => {
    if (!confirm(`Excluir "${t.description}"?`)) return
    try {
      await deleteTransaction(t.id)
      toast.success('Excluído.')
      setResumos([])
      void carregar(pagina, filtroTipo)
    } catch {
      toast.error('Não foi possível excluir.')
    }
  }

  const marcar = async (t: Transaction, situacao: 'PENDENTE' | 'ENVIADA') => {
    await updateTransaction(t.id, {
      sent_to_finance: situacao,
      sent_at: situacao === 'ENVIADA' ? new Date().toISOString() : '',
    })
    void carregar(pagina, filtroTipo)
  }

  const filtrados = itens.filter((t) => {
    const s = semAcento(busca.trim())
    if (!s) return true
    return (
      semAcento(t.expand?.client?.nickname || '').includes(s) ||
      semAcento(t.expand?.client?.name || '').includes(s) ||
      semAcento(t.description).includes(s)
    )
  })

  const somaPagina = filtrados.reduce((s, t) => s + totalDaLinha(t), 0)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">Lançamentos</h1>
          <p className="text-[11px] text-muted-foreground">
            {total} registro(s) · capital, consumo, serviço e dinheiro
          </p>
        </div>
        <Button
          onClick={() => setAberto(true)}
          className="h-9 gap-1.5 shrink-0 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
        >
          <Plus className="w-4 h-4" /> Lançar
        </Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente ou descrição..."
            className="h-9 pl-9 text-xs"
          />
        </div>
        <ViewModeSelector valor={modo} onChange={setModo} className="ml-auto" />
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={filtroTipo === 'TODOS' ? 'default' : 'outline'}
            onClick={() => {
              setFiltroTipo('TODOS')
              setPagina(1)
            }}
            className={`h-7 text-[10px] ${filtroTipo === 'TODOS' ? 'bg-slate-900 text-white' : ''}`}
          >
            Todos
          </Button>
          {(['CAPITAL', 'CONSUMO', 'SERVICO', 'DINHEIRO'] as TransactionKind[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filtroTipo === k ? 'default' : 'outline'}
              onClick={() => {
                setFiltroTipo(k)
                setPagina(1)
              }}
              className={`h-7 text-[10px] ${filtroTipo === k ? 'bg-slate-900 text-white' : ''}`}
            >
              {TIPOS[k].label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px]">
        <span className="font-semibold">
          {filtrados.length} de {total} lançamento(s)
        </span>
        <span className="font-mono font-bold text-[#0B3D91]">Página: {brl(somaPagina)}</span>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : modo === 'cartoes' ? (
        <div className="space-y-1.5">
          {filtrados.map((t) => {
            const cfg = TIPOS[t.kind]
            const v = totalDaLinha(t)
            const enviado = (t.sent_to_finance || 'PENDENTE') === 'ENVIADA'
            return (
              <Card key={t.id}>
                <CardContent className="space-y-1.5 p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={`border px-1.5 py-0 text-[8px] ${cfg.cor} ${cfg.bg}`}>
                          {cfg.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{dataBR(t.date)}</span>
                        {enviado ? (
                          <Badge className="border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-800">
                            ENVIADO
                          </Badge>
                        ) : (
                          <Badge className="border-amber-300 bg-amber-100 px-1.5 py-0 text-[8px] text-amber-800">
                            PENDENTE
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-bold">
                        {t.expand?.client?.nickname || t.expand?.client?.name || 'Cliente'}
                      </p>
                      <p className="break-words text-[10px]">{t.description}</p>
                      {t.work_order_ref && (
                        <p className="text-[9px] text-muted-foreground">OS {t.work_order_ref}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`block font-mono text-xs font-bold ${
                          v < 0 ? 'text-emerald-700' : 'text-slate-800'
                        }`}
                      >
                        {brl(v)}
                      </span>
                      <span className="block text-[9px] text-muted-foreground">
                        {Number(t.quantity ?? 0)} × {brl(Number(t.unit_price ?? 0))}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 border-t pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => marcar(t, enviado ? 'PENDENTE' : 'ENVIADA')}
                      className={`h-6 flex-1 gap-1 text-[9px] ${
                        enviado ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {enviado ? (
                        <>
                          <Clock3 className="h-2.5 w-2.5" /> Marcar pendente
                        </>
                      ) : (
                        <>
                          <Send className="h-2.5 w-2.5" /> Marcar enviado
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => excluir(t)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {filtrados.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center">
              <p className="text-sm font-semibold">Nenhum lançamento</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ajuste os filtros ou registre um novo.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* LISTA e LISTA COMPACTA: linhas simples — mesma paginação de 40 */
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtrados.map((t) => {
            const cfg = TIPOS[t.kind]
            const v = totalDaLinha(t)
            const enviado = (t.sent_to_finance || 'PENDENTE') === 'ENVIADA'
            const compacto = modo === 'compacta'
            return (
              <div
                key={t.id}
                className={`flex items-center gap-2 px-3 ${compacto ? 'min-h-[44px] py-1.5' : 'min-h-[44px] py-2.5'}`}
              >
                <Badge className={`shrink-0 border px-1.5 py-0 text-[8px] ${cfg.cor} ${cfg.bg}`}>
                  {cfg.label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold">
                    {t.expand?.client?.nickname || t.expand?.client?.name || 'Cliente'}
                  </p>
                  {!compacto && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {dataBR(t.date)} · {t.description}
                      {t.work_order_ref ? ` · OS ${t.work_order_ref}` : ''}
                    </p>
                  )}
                </div>
                {enviado ? (
                  <Badge className="shrink-0 border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-800">
                    ENVIADO
                  </Badge>
                ) : (
                  <Badge className="shrink-0 border-amber-300 bg-amber-100 px-1.5 py-0 text-[8px] text-amber-800">
                    PENDENTE
                  </Badge>
                )}
                {isAdmin && (
                  <span
                    className={`shrink-0 font-mono text-xs font-bold ${
                      v < 0 ? 'text-emerald-700' : 'text-slate-800'
                    }`}
                  >
                    {brl(v)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => marcar(t, enviado ? 'PENDENTE' : 'ENVIADA')}
                  className={`h-7 w-7 shrink-0 p-0 ${
                    enviado ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                  aria-label={enviado ? 'Marcar pendente' : 'Marcar enviado'}
                >
                  {enviado ? <Clock3 className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => excluir(t)}
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-red-600"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )
          })}

          {filtrados.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center">
              <p className="text-sm font-semibold">Nenhum lançamento</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ajuste os filtros ou registre um novo.
              </p>
            </div>
          )}
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between gap-2 px-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="h-7 gap-1 text-[10px]"
          >
            <ChevronLeft className="h-3 w-3" /> Anterior
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Página {pagina} de {paginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="h-7 gap-1 text-[10px]"
          >
            Próxima <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* ---------- NOVO LANÇAMENTO ---------- */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[88dvh] w-[94vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Novo lançamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Cliente</Label>
              <Input
                value={buscaCliente}
                onChange={(e) => {
                  setBuscaCliente(e.target.value)
                  setClienteId('')
                }}
                placeholder="Apelido, razão social ou CNPJ..."
                className="h-9 text-xs"
              />
              {clienteEscolhido && (
                <p className="rounded bg-[#0B3D91]/5 px-2 py-1 text-[10px]">
                  <strong>{clienteEscolhido.nickname || clienteEscolhido.name}</strong>
                  {' · saldo '}
                  {brl(Number(clienteEscolhido.saldo || 0))}
                </p>
              )}
              {!clienteId && buscaCliente && (
                <div className="max-h-32 divide-y overflow-y-auto rounded-md border">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteId(c.id)
                        setBuscaCliente(c.nickname || c.name)
                      }}
                      className="w-full px-2 py-1.5 text-left hover:bg-[#0B3D91]/5"
                    >
                      <span className="block text-[11px] font-semibold">
                        {c.nickname || c.name}
                      </span>
                      <span className="block text-[9px] text-muted-foreground">{c.name}</span>
                    </button>
                  ))}
                  {clientesFiltrados.length === 0 && (
                    <p className="px-2 py-2 text-[10px] text-muted-foreground">
                      Nenhum cliente com esse nome.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Divisão</Label>
              <div className="grid grid-cols-2 gap-1">
                {(['CAPITAL', 'CONSUMO', 'SERVICO', 'DINHEIRO'] as TransactionKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTipo(k)}
                    className={`rounded-md border px-2 py-2 text-[10px] font-semibold ${
                      tipo === k
                        ? 'border-[#0B3D91] bg-[#0B3D91] text-white'
                        : 'bg-white hover:border-[#0B3D91]/50'
                    }`}
                  >
                    {TIPOS[k].label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground">{TIPOS[tipo].descricao}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={tipo === 'DINHEIRO' ? 'PAGAMENTO RECEBIDO' : 'Câmera dome 4MP'}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Quantidade</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor unitário</Label>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Data</Label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">OS (opcional)</Label>
                <Input
                  value={osRef}
                  onChange={(e) => setOsRef(e.target.value)}
                  placeholder="nº da OS"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#0B3D91]/20 bg-[#0B3D91]/5 p-2">
              <span className="text-[11px] font-semibold">Total</span>
              <span
                className={`font-mono text-sm font-black ${
                  totalForm < 0 ? 'text-emerald-700' : 'text-[#0B3D91]'
                }`}
              >
                {brl(totalForm)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAberto(false)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando}
              className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {salvando ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
