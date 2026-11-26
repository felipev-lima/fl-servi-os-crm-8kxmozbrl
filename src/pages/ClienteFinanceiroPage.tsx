/**
 * PÁGINA DO CLIENTE — /cliente-financeiro/:id
 *
 * Pedido do Felipe (23/11/2026): "eu gostaria de editar diretamente no CRM.
 * Quando eu abro o cliente em si, que eu consiga visualizar ele e fazer a
 * correção diretamente nela, sem precisar sair da página. Que o CRM em si seja
 * a minha planilha de Excel que eu fazia fora."
 *
 * O QUE ESTA TELA É: o extrato do cliente com edição na própria linha — data,
 * tipo, descrição, quantidade e valor. Clicou no lápis, editou, salvou. Nada de
 * exportar planilha, corrigir fora e devolver.
 *
 * TRÊS DECISÕES QUE VÊM DO QUE JÁ DEU ERRADO (não mexer sem entender):
 *
 * 1. O TOTAL É CALCULADO, NUNCA DIGITADO. A coleção guarda `quantity` e
 *    `unit_price`; o total é o produto. Digitar total criaria divergência
 *    entre a linha e o saldo — foi assim que a planilha antiga se perdeu.
 *
 * 2. DINHEIRO É PAGAMENTO E ENTRA NEGATIVO. A tela mostra o valor POSITIVO
 *    para não confundir ("pagou R$ 500"), e inverte ao gravar. Esquecer o
 *    sinal foi a maior fonte de erro da planilha.
 *
 * 3. A BASE JÁ GUARDA O SALDO DEVEDOR, NÃO O HISTÓRICO DE VENDAS. Isso foi
 *    aprendido na Natalio: o lançamento de R$ 122 é o que SOBROU de um serviço
 *    de R$ 1.450 onde já foram pagos R$ 1.328. Lançar pagamento antigo aqui
 *    abate duas vezes. Por isso a tela avisa isso em cima, de forma visível.
 *
 * 4. CARTÕES POR TIPO MOSTRAM O SALDO EM ABERTO (defeito corrigido 26/11/2026,
 *    pedido do Felipe: "quando eu selecionasse os itens que foram pagos
 *    indicando nota fiscal ou pagando avulso esses itens saíssem da logística
 *    de capital consumo serviço e ficasse só o valor daquele item pendente").
 *    Antes os cartões somavam as linhas do tipo e ignoravam os pagamentos
 *    (kind = DINHEIRO, com `settles` apontando para o item). Agora a ficha usa
 *    o MESMO cálculo da tela Dar baixa: a rota /backend/v1/saldo-por-tipo,
 *    que já abate pagamento vinculado e crédito avulso e marca o quitado.
 *    Itens quitados saem dos cartões e da lista em aberto (ficam no filtro
 *    "Pagos"). O SALDO DEVEDOR continua somando TODAS as linhas, como sempre.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  getCliente,
  getTransactionsByClient,
  updateTransaction,
  createTransaction,
  deleteTransaction,
} from '@/services/crm'
import pb from '@/lib/pocketbase/client'
import type { Transaction, TransactionKind } from '@/types/crm'
import { TIPOS, brl, dataBR, totalDaLinha, semAcento } from '@/types/crm'
import type { Client } from '@/types/flservicos'
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
  ArrowLeft,
  Building2,
  Pencil,
  Trash2,
  Plus,
  Search,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Wallet,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { ExtratoClienteDialog } from '@/components/ExtratoClienteDialog'
import { DebitoClienteDialog } from '@/components/DebitoClienteDialog'
import { CorrigirRecebimentoDialog } from '@/components/CorrigirRecebimentoDialog'
import { HandCoins } from 'lucide-react'

/** Data do banco ("2026-11-13 12:00:00.000Z") para o campo <input type=date> */
function dataParaInput(valor?: string): string {
  if (!valor) return ''
  const s = String(valor).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

export default function ClienteFinanceiroPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [cliente, setCliente] = useState<Client | null>(null)
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvandoId, setSalvandoId] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('TODOS')

  /** linha em edição (só uma por vez, para não virar bagunça) */
  const [editando, setEditando] = useState<string>('')
  const [rascunho, setRascunho] = useState<{
    date: string
    kind: TransactionKind
    description: string
    quantity: string
    unit_price: string
  }>({ date: '', kind: 'SERVICO', description: '', quantity: '1', unit_price: '' })

  /** formulário de lançamento novo */
  const [novoAberto, setNovoAberto] = useState(false)
  /** Extrato em PDF aberto a partir desta ficha (24/11/2026) */
  const [extratoAberto, setExtratoAberto] = useState(false)
  /** "Débito do cliente" — PDF limpo só com o que falta pagar (26/11/2026) */
  const [debitoAberto, setDebitoAberto] = useState(false)
  /** CORRIGIR RECEBIMENTO (26/11/2026): ids das linhas DINHEIRO sendo corrigidas.
   * Abre o dialog que reescreve os vínculos (settles) do pagamento que JÁ existe —
   * sem apagar nada, sem redigitar o valor. */
  const [corrigirIds, setCorrigirIds] = useState<string[]>([])
  const [novo, setNovo] = useState({
    date: new Date().toISOString().slice(0, 10),
    kind: 'SERVICO' as TransactionKind,
    description: '',
    quantity: '1',
    unit_price: '',
  })

  /** SALDO POR ITEM (o mesmo da tela Dar baixa). O servidor `/saldo-por-tipo`
   * devolve cada lançamento de débito com total, pago, em_aberto e quitado. */
  interface ItemSaldo {
    id: string
    kind: string
    total: number
    pago: number
    em_aberto: number
    quitado: boolean
  }
  const [itensSaldo, setItensSaldo] = useState<ItemSaldo[]>([])

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      /**
       * Saldo POR TIPO vem da MESMA rota que a tela Dar baixa usa — o cálculo
       * de quanto cada item ainda deve (pagamento vinculado por `settles` +
       * crédito avulso abatendo os itens mais antigos) é feito lá, no servidor.
       * Se a rota falhar (ex.: permissão), a ficha segue com a soma simples.
       */
      let porTipoDoServidor: ItemSaldo[] = []
      try {
        const r: any = await pb.send(`/backend/v1/saldo-por-tipo?cliente=${id}`, {
          method: 'GET',
        })
        if (r && Array.isArray(r.itens)) porTipoDoServidor = r.itens as ItemSaldo[]
      } catch (_) {
        porTipoDoServidor = []
      }

      const [c, t] = await Promise.all([getCliente(id), getTransactionsByClient(id)])
      setCliente(c)
      setLancamentos(t)
      setItensSaldo(porTipoDoServidor)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir o cliente.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /** SALDO DEVEDOR GERAL: continua somando TODAS as linhas, como sempre foi —
   * (pagamento entra negativo e abate). Este número já bate e não se mexe. */
  const saldo = useMemo(() => lancamentos.reduce((s, t) => s + totalDaLinha(t), 0), [lancamentos])

  /** Cartões Capital/Consumo/Serviço: SOMENTE o que ainda está em aberto de
   * cada tipo, do mesmo cálculo da Dar baixa (itens quitados não entram). */
  const emAbertoPorTipo = useMemo(() => {
    const r: Record<string, number> = { CAPITAL: 0, CONSUMO: 0, SERVICO: 0 }
    for (const i of itensSaldo) {
      if (i.quitado || i.em_aberto <= 0.005) continue
      r[i.kind] = (r[i.kind] || 0) + i.em_aberto
    }
    return r
  }, [itensSaldo])

  /** Queda para o filtro "Pagos": o item em aberto cujo id é `settles` de um
   * pagamento registrado. Recalculado daqui, sem depender do servidor. */
  const pagosIds = useMemo(() => {
    const s = new Set<string>()
    for (const t of lancamentos) {
      const st = (t as unknown as { settles?: string }).settles
      if (t.kind === 'DINHEIRO' && st) s.add(st)
    }
    return s
  }, [lancamentos])

  /** ITENS EM ABERTO para o "Débito do cliente" (PDF limpo, 26/11/2026).
   * A MESMA lista da aba "Todos" da ficha: vem de /saldo-por-tipo (quitado
   * marcado pelo servidor); se a rota falhou, cai para o `settles` local.
   * Só itens de débito (nunca pagamentos), com o valor que ainda falta. */
  const itensEmAberto = useMemo(
    () =>
      lancamentos
        .filter((t) => t.kind !== 'DINHEIRO')
        .filter((t) => {
          const s = itensSaldo.find((i) => i.id === t.id)
          if (s) return s.quitado || s.em_aberto <= 0.005 ? false : s.em_aberto > 0.005
          return !pagosIds.has(t.id)
        })
        .map((t) => {
          const s = itensSaldo.find((i) => i.id === t.id)
          return {
            id: t.id,
            date: t.date,
            kind: t.kind,
            description: t.description,
            valor: s ? s.em_aberto : totalDaLinha(t),
          }
        }),
    [lancamentos, itensSaldo, pagosIds],
  )

  /** Total bruto dos pagamentos registrados (para mostrar no aviso verde). */
  const pagosTotalBruto = useMemo(
    () =>
      lancamentos.reduce((s, t) => (t.kind === 'DINHEIRO' ? s + Math.abs(totalDaLinha(t)) : s), 0),
    [lancamentos],
  )

  const filtrados = useMemo(() => {
    const termo = semAcento(busca)
    const saldoDoItem = new Map(itensSaldo.map((i) => [i.id, i]))
    /** O item já foi quitado? Pelo servidor; se ele não respondeu, cai para o
     * `settles` do pagamento registrado aqui na ficha. */
    const estaQuitado = (t: Transaction): boolean => {
      const s = saldoDoItem.get(t.id)
      if (s) return s.quitado || s.em_aberto <= 0.005
      return pagosIds.has(t.id)
    }
    return lancamentos.filter((t) => {
      // com busca ativa: procura em TUDO (inclusive pagamentos e quitados),
      // para o Felipe achar "NF 803" mesmo depois de quitado
      if (termo) {
        return (
          semAcento(t.description).includes(termo) ||
          semAcento(t.details || '').includes(termo) ||
          semAcento(dataBR(t.date)).includes(termo)
        )
      }
      if (filtroTipo === 'PAGOS') {
        // aba "Pagos": só itens de débito já quitados
        return t.kind !== 'DINHEIRO' && estaQuitado(t)
      }
      if (filtroTipo !== 'TODOS' && t.kind !== filtroTipo) return false
      if (filtroTipo === 'TODOS') {
        // lista em aberto: esconde pagamentos e itens quitados
        if (t.kind === 'DINHEIRO') return false
        return !estaQuitado(t)
      }
      // filtro por tipo: o que ainda falta daquele tipo
      return !estaQuitado(t)
    })
  }, [lancamentos, itensSaldo, pagosIds, busca, filtroTipo])

  const abrirEdicao = (t: Transaction) => {
    const pagamento = t.kind === 'DINHEIRO'
    setEditando(t.id)
    setRascunho({
      date: dataParaInput(t.date),
      kind: t.kind,
      description: t.description || '',
      quantity: String(Number(t.quantity ?? 1)),
      // pagamento é exibido positivo (o banco guarda negativo)
      unit_price: String(
        pagamento ? Math.abs(Number(t.unit_price || 0)) : Number(t.unit_price || 0),
      ),
    })
  }

  const salvarEdicao = async (t: Transaction) => {
    const q = Number(rascunho.quantity.replace(',', '.')) || 0
    const v = Number(rascunho.unit_price.replace(',', '.')) || 0
    if (!rascunho.description.trim()) {
      toast.error('A descrição não pode ficar vazia.')
      return
    }
    setSalvandoId(t.id)
    try {
      await updateTransaction(t.id, {
        date: `${rascunho.date} 12:00:00.000Z`,
        kind: rascunho.kind,
        // DINHEIRO SEMPRE NEGATIVO: é pagamento, abate o saldo.
        unit_price: rascunho.kind === 'DINHEIRO' ? -Math.abs(v) : v,
        quantity: q,
        description: rascunho.description.trim(),
        item_type:
          rascunho.kind === 'SERVICO' || rascunho.kind === 'DINHEIRO' ? 'SERVICO' : 'PRODUTO',
      } as never)
      toast.success('Lançamento corrigido.')
      setEditando('')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvandoId('')
    }
  }

  const apagar = async (t: Transaction) => {
    const ok = window.confirm(
      `Apagar este lançamento?\n\n${t.description}\n${brl(totalDaLinha(t))}\n\nO saldo do cliente muda. Não tem como desfazer.`,
    )
    if (!ok) return
    setSalvandoId(t.id)
    try {
      await deleteTransaction(t.id)
      toast.success('Lançamento apagado.')
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível apagar.')
    } finally {
      setSalvandoId('')
    }
  }

  const salvarNovo = async () => {
    const q = Number(novo.quantity.replace(',', '.')) || 0
    const v = Number(novo.unit_price.replace(',', '.')) || 0
    if (!novo.description.trim()) return toast.error('Descreva o lançamento.')
    if (v === 0) return toast.error('Informe o valor.')
    if (!id) return
    setSalvandoId('novo')
    try {
      await createTransaction({
        client: id,
        date: `${novo.date} 12:00:00.000Z`,
        kind: novo.kind,
        item_type: novo.kind === 'SERVICO' || novo.kind === 'DINHEIRO' ? 'SERVICO' : 'PRODUTO',
        description: novo.description.trim(),
        quantity: q,
        unit_price: novo.kind === 'DINHEIRO' ? -Math.abs(v) : v,
        sent_to_finance: 'PENDENTE',
      } as never)
      toast.success('Lançamento incluído.')
      setNovoAberto(false)
      setNovo({
        date: new Date().toISOString().slice(0, 10),
        kind: 'SERVICO',
        description: '',
        quantity: '1',
        unit_price: '',
      })
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível incluir.')
    } finally {
      setSalvandoId('')
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Abrindo o cliente...
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="p-10 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="text-sm font-bold">Cliente não encontrado</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/clientes')}>
          Voltar para a lista
        </Button>
      </div>
    )
  }

  const nomeCurto = (cliente as unknown as { nickname?: string }).nickname || cliente.name

  return (
    <div className="space-y-3">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate('/clientes')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-black leading-tight">{nomeCurto}</h1>
            <p className="text-[10px] text-muted-foreground">{cliente.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {cliente.document ? `${cliente.document} · ` : ''}
              {cliente.phone || 'sem telefone'}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              className="h-8 gap-1 bg-emerald-700 text-[11px] font-bold text-white hover:bg-emerald-800"
              onClick={() => navigate(`/clientes/${id}/dar-baixa`)}
              title="Receber pagamento e quitar itens"
            >
              <Wallet className="h-3.5 w-3.5" /> Dar baixa
            </Button>
            {/*
              EXTRATO EM PDF AQUI, NA FICHA DO CLIENTE (24/11/2026).
              O Felipe abre o cliente por AQUI — não pela lista. O botão estava
              só na lista de clientes, e por isso ele dizia "não aparece".
            */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px] font-bold text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10"
              onClick={() => setExtratoAberto(true)}
              title="Extrato de débito em PDF"
            >
              <FileText className="h-3 w-3" /> Extrato PDF
            </Button>
            {/* DÉBITO DO CLIENTE — segundo botão (26/11/2026): PDF limpo só com
                o que falta pagar, para o Felipe enviar ao cliente. */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px] font-bold text-[#0B3D91] border-[#0B3D91]/40 hover:bg-[#0B3D91]/10"
              onClick={() => setDebitoAberto(true)}
              title="Demonstrativo de débito em PDF (só o que falta pagar)"
            >
              <HandCoins className="h-3 w-3" /> Débito do cliente
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[10px] font-bold"
              onClick={() => setNovoAberto(true)}
            >
              <Plus className="h-3 w-3" /> Lançamento
            </Button>
          </div>
        )}
      </div>

      {/* totais — os cartões por tipo mostram SÓ O QUE AINDA ESTÁ EM ABERTO,
          pelo mesmo cálculo da Dar baixa (itens pagos saem do cartão). */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="border-l-4 border-l-[#0B3D91]">
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Saldo devedor</p>
            <p
              className={`text-base font-black ${saldo > 0.005 ? 'text-rose-700' : saldo < -0.005 ? 'text-emerald-700' : 'text-slate-600'}`}
            >
              {brl(saldo)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">
              Capital (em aberto)
            </p>
            <p className="text-sm font-bold">{brl(emAbertoPorTipo.CAPITAL || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">
              Consumo (em aberto)
            </p>
            <p className="text-sm font-bold">{brl(emAbertoPorTipo.CONSUMO || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">
              Serviço (em aberto)
            </p>
            <p className="text-sm font-bold">{brl(emAbertoPorTipo.SERVICO || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {pagosIds.size > 0 && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] text-emerald-900">
          <Wallet className="mr-1 inline h-3 w-3" />
          Pagamentos registrados nesta ficha:{' '}
          <strong>{pagosTotalBruto ? brl(Math.abs(pagosTotalBruto)) : '—'}</strong>
        </p>
      )}

      {/* aviso que evita o erro da Natalio */}
      <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-900">
        <strong>Atenção:</strong> esta lista é o <strong>saldo que ainda falta receber</strong>, não
        o histórico de vendas. Se o cliente já pagou parte de um serviço, a linha mostra só o que
        sobrou. Lançar aqui um pagamento que já foi descontado abaixa a dívida duas vezes.
      </p>

      {/* filtros */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou data..."
            className="h-8 pl-7 text-[11px]"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['TODOS', 'CAPITAL', 'CONSUMO', 'SERVICO', 'DINHEIRO', 'PAGOS'].map((k) => (
            <Button
              key={k}
              type="button"
              variant={filtroTipo === k ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltroTipo(k)}
              className={`h-7 text-[10px] ${filtroTipo === k ? 'bg-slate-900 text-white' : ''}`}
            >
              {k === 'TODOS'
                ? 'Todos'
                : k === 'PAGOS'
                  ? 'Pagos'
                  : TIPOS[k as TransactionKind]?.label || k}
            </Button>
          ))}
        </div>
      </div>

      {/* a "planilha" */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <span className="text-[11px] font-bold">
              {filtroTipo === 'PAGOS'
                ? `Itens já pagos (${filtrados.length})`
                : `Lançamentos em aberto (${filtrados.length})`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {filtroTipo === 'PAGOS'
                ? 'itens quitados por recebimento ou nota fiscal'
                : 'clique no lápis para corrigir'}
            </span>
          </div>

          <div className="divide-y">
            {filtrados.map((t) => {
              const emEdicao = editando === t.id
              const pagamento = t.kind === 'DINHEIRO'
              const valorLinha = totalDaLinha(t)
              return (
                <div key={t.id} className="px-2.5 py-2">
                  {emEdicao ? (
                    /* ---------- LINHA EM EDIÇÃO ---------- */
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-muted-foreground">
                            Data
                          </Label>
                          <Input
                            type="date"
                            value={rascunho.date}
                            onChange={(e) => setRascunho((p) => ({ ...p, date: e.target.value }))}
                            className="h-8 text-[11px]"
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-muted-foreground">
                            Tipo
                          </Label>
                          <select
                            value={rascunho.kind}
                            onChange={(e) =>
                              setRascunho((p) => ({
                                ...p,
                                kind: e.target.value as TransactionKind,
                              }))
                            }
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                          >
                            <option value="CAPITAL">Capital</option>
                            <option value="CONSUMO">Consumo</option>
                            <option value="SERVICO">Serviço</option>
                            <option value="DINHEIRO">Pagamento (dinheiro)</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[9px] font-bold uppercase text-muted-foreground">
                          Descrição
                        </Label>
                        <Input
                          value={rascunho.description}
                          onChange={(e) =>
                            setRascunho((p) => ({ ...p, description: e.target.value }))
                          }
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-muted-foreground">
                            Qtd
                          </Label>
                          <Input
                            inputMode="decimal"
                            value={rascunho.quantity}
                            onChange={(e) =>
                              setRascunho((p) => ({ ...p, quantity: e.target.value }))
                            }
                            className="h-8 text-[11px]"
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] font-bold uppercase text-muted-foreground">
                            Valor unitário {rascunho.kind === 'DINHEIRO' ? '(pago)' : ''}
                          </Label>
                          <Input
                            inputMode="decimal"
                            value={rascunho.unit_price}
                            onChange={(e) =>
                              setRascunho((p) => ({ ...p, unit_price: e.target.value }))
                            }
                            className="h-8 text-[11px]"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Total desta linha:{' '}
                        <strong>
                          {brl(
                            (Number(rascunho.quantity.replace(',', '.')) || 0) *
                              (Number(rascunho.unit_price.replace(',', '.')) || 0),
                          )}
                        </strong>
                        {rascunho.kind === 'DINHEIRO' && ' — vai abater do saldo'}
                      </p>
                      <div className="flex gap-1.5 pt-0.5">
                        <Button
                          size="sm"
                          className="h-8 flex-1 gap-1 bg-[#0B3D91] text-[11px] text-white hover:bg-[#0B3D91]/90"
                          disabled={salvandoId === t.id}
                          onClick={() => salvarEdicao(t)}
                        >
                          {salvandoId === t.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-[11px]"
                          onClick={() => setEditando('')}
                        >
                          <X className="h-3 w-3" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* ---------- LINHA NORMAL ---------- */
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold leading-tight">
                          {t.description}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {dataBR(t.date)} ·{' '}
                          {Number(t.quantity ?? 1) > 1
                            ? `${Number(t.quantity)} × ${brl(Number(t.unit_price || 0))}`
                            : 'valor único'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[8px] ${
                          pagamento
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : t.kind === 'SERVICO'
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {TIPOS[t.kind]?.label || t.kind}
                      </Badge>
                      <span
                        className={`w-[86px] shrink-0 text-right text-[11px] font-bold ${
                          valorLinha < 0 ? 'text-emerald-700' : 'text-slate-800'
                        }`}
                      >
                        {brl(valorLinha)}
                      </span>
                      {isAdmin && (
                        <div className="flex shrink-0 items-center">
                          {pagamento && (
                            /* CORRIGIR VÍNCULOS DO PAGAMENTO (26/11/2026): o
                               pedido do Felipe — reescrever quais itens este
                               pagamento quita, sem apagar o lançamento. */
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setCorrigirIds([t.id])}
                              title="Corrigir os itens que este pagamento quita"
                            >
                              <Link2 className="h-3.5 w-3.5 text-[#0B3D91]" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => abrirEdicao(t)}
                            title="Corrigir este lançamento"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => apagar(t)}
                            disabled={salvandoId === t.id}
                            title="Apagar este lançamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {filtrados.length === 0 && (
              <p className="p-8 text-center text-[11px] text-muted-foreground">
                Nenhum lançamento com esse filtro.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-[9px] text-muted-foreground">
        O total de cada linha é sempre quantidade × valor unitário — nunca digitado. É o que garante
        que o saldo bata.
      </p>

      {/* novo lançamento */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="max-h-[88dvh] w-[94vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Novo lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-semibold">Data</Label>
                <Input
                  type="date"
                  value={novo.date}
                  onChange={(e) => setNovo((p) => ({ ...p, date: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold">Tipo</Label>
                <select
                  value={novo.kind}
                  onChange={(e) =>
                    setNovo((p) => ({ ...p, kind: e.target.value as TransactionKind }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="CAPITAL">Capital (material)</option>
                  <option value="CONSUMO">Consumo (material)</option>
                  <option value="SERVICO">Serviço (mão de obra)</option>
                  <option value="DINHEIRO">Pagamento recebido</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-semibold">Descrição</Label>
              <Input
                value={novo.description}
                onChange={(e) => setNovo((p) => ({ ...p, description: e.target.value }))}
                placeholder="Ex: Serviço de instalação de câmera"
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-semibold">Quantidade</Label>
                <Input
                  inputMode="decimal"
                  value={novo.quantity}
                  onChange={(e) => setNovo((p) => ({ ...p, quantity: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold">
                  {novo.kind === 'DINHEIRO' ? 'Valor pago' : 'Valor unitário'}
                </Label>
                <Input
                  inputMode="decimal"
                  value={novo.unit_price}
                  onChange={(e) => setNovo((p) => ({ ...p, unit_price: e.target.value }))}
                  placeholder="0,00"
                  className="h-9 text-xs"
                />
              </div>
            </div>
            {novo.kind === 'DINHEIRO' && (
              <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">
                Digite o valor <strong>positivo</strong> — o sistema transforma em pagamento e abate
                do saldo.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Total:{' '}
              <strong>
                {brl(
                  (Number(novo.quantity.replace(',', '.')) || 0) *
                    (Number(novo.unit_price.replace(',', '.')) || 0),
                )}
              </strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#0B3D91] text-white hover:bg-[#0B3D91]/90"
              disabled={salvandoId === 'novo'}
              onClick={salvarNovo}
            >
              {salvandoId === 'novo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Incluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extrato de débito em PDF desta ficha */}
      {extratoAberto && cliente && (
        <ExtratoClienteDialog client={cliente} onClose={() => setExtratoAberto(false)} />
      )}

      {/* Débito do cliente — PDF limpo só com o que falta pagar (para enviar) */}
      {debitoAberto && cliente && (
        <DebitoClienteDialog
          client={cliente}
          itens={itensEmAberto}
          onClose={() => setDebitoAberto(false)}
        />
      )}
    </div>
  )
}
