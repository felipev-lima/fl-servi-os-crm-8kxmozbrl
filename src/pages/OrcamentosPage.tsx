/**
 * Orçamentos e Pedidos — o fluxo de venda de produto.
 *
 * ORÇAMENTO → PEDIDO → ENTREGUE → FATURADO
 *
 * O produto entra da carteira com tipo (capital/consumo/serviço) e preço já
 * preenchidos; o Felipe só corrige se precisar. Ao mudar o tipo ou o preço de
 * um item da carteira, o app PERGUNTA se a correção vale só para este
 * documento ou se atualiza o cadastro.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  getQuotes,
  createQuote,
  deleteQuote,
  updateQuote,
  getClientsSummary,
  totalDoDocumento,
  atualizarProdutoPelosDados,
} from '@/services/crm'
import { getMaterials } from '@/services/api'
import type { Quote, QuoteItem, ClientSummary } from '@/types/crm'
import type { Material } from '@/types/flservicos'
import { TIPOS, brl, dataBR, semAcento, type TransactionKind } from '@/types/crm'
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
  FileText,
  Plus,
  Loader2,
  Trash2,
  Search,
  ArrowRight,
  Package,
  Truck,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'

const FLUXO = [
  {
    valor: 'ORCAMENTO',
    label: 'Orçamento',
    icone: FileText,
    cor: 'border-slate-300 bg-slate-100 text-slate-800',
  },
  {
    valor: 'PEDIDO',
    label: 'Pedido',
    icone: Package,
    cor: 'border-blue-300 bg-blue-100 text-blue-800',
  },
  {
    valor: 'ENTREGUE',
    label: 'Entregue',
    icone: Truck,
    cor: 'border-indigo-300 bg-indigo-100 text-indigo-800',
  },
  {
    valor: 'FATURADO',
    label: 'Faturado',
    icone: Receipt,
    cor: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  },
] as const

export default function OrcamentosPage() {
  const [params, setParams] = useSearchParams()
  const [docs, setDocs] = useState<Quote[]>([])
  const [clientes, setClientes] = useState<ClientSummary[]>([])
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('TODOS')
  const [busca, setBusca] = useState('')

  const [aberto, setAberto] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [itens, setItens] = useState<QuoteItem[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      const [qs, cs, ms] = await Promise.all([getQuotes(), getClientsSummary(), getMaterials()])
      setDocs(qs)
      setClientes(cs)
      setMateriais(ms)
    } catch {
      toast.error('Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  useEffect(() => {
    if (params.get('novo') === '1') setAberto(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const clientesFiltrados = useMemo(() => {
    const t = semAcento(buscaCliente)
    if (!t) return clientes.slice(0, 5)
    return clientes
      .filter(
        (c) =>
          semAcento(c.name).includes(t) ||
          semAcento(c.nickname || '').includes(t) ||
          (c.document || '').includes(buscaCliente.trim()),
      )
      .slice(0, 6)
  }, [clientes, buscaCliente])

  /**
   * Busca do produto: LOCAL, não no banco.
   *
   * O catálogo é digitado em MAIÚSCULA COM acento ("CÂMERA BULLET") e o filtro
   * do PocketBase não ignora acento — buscar "camera" devolvia zero. Trazer a
   * carteira uma vez e filtrar na memória resolve e ainda fica instantâneo.
   */
  const produtosFiltrados = useMemo(() => {
    const t = semAcento(buscaProduto)
    if (t.length < 2) return []
    return materiais
      .filter(
        (m) =>
          semAcento(m.name).includes(t) ||
          semAcento(m.category || '').includes(t) ||
          semAcento(m.brand || '').includes(t),
      )
      .slice(0, 8)
  }, [materiais, buscaProduto])

  const total = totalDoDocumento(itens)

  const adicionar = (m: Material) => {
    setItens((prev) => [
      ...prev,
      {
        description: m.name,
        quantity: 1,
        unit_price: Number(m.price || 0),
        kind: (m.default_kind || 'CONSUMO') as TransactionKind,
        unit: m.unit,
        material_id: m.id,
      },
    ])
    setBuscaProduto('')
  }

  const alterar = (i: number, campo: string, valor: any) => {
    const item = itens[i]
    setItens((prev) => prev.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

    // pergunta só quando o item veio da carteira e mudou tipo ou preço
    if (!item?.material_id) return
    if (campo !== 'kind' && campo !== 'unit_price') return

    const rotulo =
      campo === 'kind'
        ? `o tipo para ${TIPOS[valor as TransactionKind]?.label || valor}`
        : `o preço para ${brl(Number(valor) || 0)}`

    setTimeout(() => {
      if (
        confirm(
          `Você mudou ${rotulo}.\n\n` +
            'OK = atualizar também o CADASTRO do produto (vale para os próximos)\n' +
            'Cancelar = usar só neste documento',
        )
      ) {
        atualizarProdutoPelosDados(item.material_id!, {
          default_kind: campo === 'kind' ? (valor as TransactionKind) : item.kind,
          price: campo === 'unit_price' ? Number(valor) : undefined,
        })
          .then(() => toast.success('Cadastro do produto atualizado.'))
          .catch(() => toast.error('Não foi possível atualizar o cadastro.'))
      }
    }, 120)
  }

  const salvar = async () => {
    if (!clienteId) return toast.error('Escolha o cliente.')
    if (itens.length === 0) return toast.error('Adicione pelo menos um item.')
    setSalvando(true)
    try {
      await createQuote({
        client: clienteId,
        date: new Date().toISOString(),
        items: itens,
        status: 'ORCAMENTO',
        payment_terms: 'A combinar / Conforme contrato',
        delivery_terms: 'Imediato / Agendado',
        validity_days: 15,
      })
      toast.success('Orçamento criado.')
      setAberto(false)
      setItens([])
      setClienteId('')
      setBuscaCliente('')
      setParams(new URLSearchParams(), { replace: true })
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const avancar = async (d: Quote) => {
    const ordem = ['ORCAMENTO', 'PEDIDO', 'ENTREGUE', 'FATURADO']
    const atual = d.status || 'ORCAMENTO'
    const prox = ordem[ordem.indexOf(atual) + 1]
    if (!prox) return
    const dados: any = { status: prox }
    if (prox === 'ENTREGUE') dados.delivered_at = new Date().toISOString()
    if (prox === 'FATURADO') dados.invoiced_at = new Date().toISOString()
    await updateQuote(d.id, dados)
    toast.success(`Agora está como ${FLUXO.find((f) => f.valor === prox)?.label}.`)
    void carregar()
  }

  const excluir = async (d: Quote) => {
    if (!confirm('Excluir este documento?')) return
    await deleteQuote(d.id)
    toast.success('Excluído.')
    void carregar()
  }

  const filtrados = docs.filter((d) => {
    if (filtro !== 'TODOS' && (d.status || 'ORCAMENTO') !== filtro) return false
    const t = semAcento(busca)
    if (!t) return true
    return (
      semAcento(d.expand?.client?.nickname).includes(t) ||
      semAcento(d.expand?.client?.name).includes(t)
    )
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Orçamentos e Pedidos</h1>
          <p className="text-[11px] text-muted-foreground">
            Orçamento → Pedido → Entregue → Faturado
          </p>
        </div>
        <Button
          onClick={() => setAberto(true)}
          className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
        >
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant={filtro === 'TODOS' ? 'default' : 'outline'}
          onClick={() => setFiltro('TODOS')}
          className={`h-7 text-[10px] ${filtro === 'TODOS' ? 'bg-slate-900 text-white' : ''}`}
        >
          Todos ({docs.length})
        </Button>
        {FLUXO.map((f) => {
          const n = docs.filter((d) => (d.status || 'ORCAMENTO') === f.valor).length
          return (
            <Button
              key={f.valor}
              size="sm"
              variant={filtro === f.valor ? 'default' : 'outline'}
              onClick={() => setFiltro(f.valor)}
              className={`h-7 text-[10px] ${filtro === f.valor ? 'bg-slate-900 text-white' : ''}`}
            >
              {f.label} ({n})
            </Button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtrados.map((d) => {
            const cfg = FLUXO.find((f) => f.valor === (d.status || 'ORCAMENTO')) || FLUXO[0]
            const Icone = cfg.icone
            const prox = FLUXO[FLUXO.findIndex((f) => f.valor === (d.status || 'ORCAMENTO')) + 1]
            return (
              <Card key={d.id}>
                <CardContent className="space-y-1.5 p-2.5">
                  <Link to={`/orcamentos/${d.id}`} className="group flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={`gap-0.5 border px-1.5 py-0 text-[8px] ${cfg.cor}`}>
                          <Icone className="h-2.5 w-2.5" /> {cfg.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {dataBR(d.date || d.created)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-bold text-[#0B3D91] group-hover:underline">
                        {d.expand?.client?.nickname || d.expand?.client?.name || 'Cliente'}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {(d.items || []).length} item(ns) · abrir documento
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold text-[#0B3D91]">
                      {brl(totalDoDocumento(d.items))}
                    </span>
                  </Link>
                  <div className="flex gap-1 border-t pt-1">
                    {prox && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => avancar(d)}
                        className="h-6 flex-1 gap-1 text-[9px] text-[#0B3D91]"
                      >
                        <ArrowRight className="h-2.5 w-2.5" /> Marcar como {prox.label}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => excluir(d)}
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
              <FileText className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold">Nenhum documento</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Crie um orçamento para começar o processo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------- NOVO ---------- */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[88dvh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Novo orçamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
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
              {!clienteId && buscaCliente && (
                <div className="max-h-28 divide-y overflow-y-auto rounded-md border">
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
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Adicionar produto da carteira</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buscaProduto}
                  onChange={(e) => setBuscaProduto(e.target.value)}
                  placeholder="Digite 2 letras: cabo, camera, dvr..."
                  className="h-9 pl-8 text-xs"
                />
              </div>
              {produtosFiltrados.length > 0 && (
                <div className="max-h-40 divide-y overflow-y-auto rounded-md border">
                  {produtosFiltrados.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => adicionar(m)}
                      className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[#0B3D91]/5"
                    >
                      <Badge
                        className={`shrink-0 border px-1 py-0 text-[7px] ${
                          TIPOS[(m.default_kind || 'CONSUMO') as TransactionKind].cor
                        } ${TIPOS[(m.default_kind || 'CONSUMO') as TransactionKind].bg}`}
                      >
                        {TIPOS[(m.default_kind || 'CONSUMO') as TransactionKind].label}
                      </Badge>
                      <span className="flex-1 truncate text-[10px]">{m.name}</span>
                      <span className="shrink-0 font-mono text-[10px] font-bold">
                        {brl(Number(m.price || 0))}/{m.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Itens ({itens.length})</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItens((p) => [
                      ...p,
                      { description: '', quantity: 1, unit_price: 0, kind: 'SERVICO' },
                    ])
                  }
                  className="h-6 gap-1 text-[9px]"
                >
                  <Plus className="h-2.5 w-2.5" /> Linha em branco
                </Button>
              </div>

              {itens.map((it, i) => (
                <div key={i} className="space-y-1.5 rounded-md border bg-card p-2">
                  <div className="flex gap-1">
                    <Input
                      value={it.description}
                      onChange={(e) => alterar(i, 'description', e.target.value)}
                      placeholder="Descrição do item"
                      className="h-8 flex-1 text-[10px]"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setItens((p) => p.filter((_, j) => j !== i))}
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-red-600"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <select
                      value={it.kind || 'CONSUMO'}
                      onChange={(e) => alterar(i, 'kind', e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-1 text-[9px]"
                    >
                      {(['CAPITAL', 'CONSUMO', 'SERVICO'] as TransactionKind[]).map((k) => (
                        <option key={k} value={k}>
                          {TIPOS[k].label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={(e) => alterar(i, 'quantity', e.target.value)}
                      placeholder="Qtd"
                      className="h-8 text-[10px]"
                    />
                    <Input
                      inputMode="decimal"
                      value={it.unit_price}
                      onChange={(e) => alterar(i, 'unit_price', e.target.value)}
                      placeholder="Unit."
                      className="h-8 text-[10px]"
                    />
                    <div className="flex h-8 items-center justify-end pr-1 font-mono text-[10px] font-bold">
                      {brl(Number(it.quantity || 0) * Number(it.unit_price || 0))}
                    </div>
                  </div>
                </div>
              ))}

              {itens.length === 0 && (
                <p className="rounded-md border-2 border-dashed py-4 text-center text-[10px] text-muted-foreground">
                  Busque um produto acima ou adicione uma linha em branco.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#0B3D91]/20 bg-[#0B3D91]/5 p-2">
              <span className="text-[11px] font-semibold">Total</span>
              <span className="font-mono text-sm font-black text-[#0B3D91]">{brl(total)}</span>
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
                <FileText className="h-3.5 w-3.5" />
              )}
              {salvando ? 'Salvando...' : 'Criar orçamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
