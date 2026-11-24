/**
 * DAR BAIXA — quitar itens específicos do cliente.
 *
 * PEDIDO DO FELIPE (23/11/2026): "quando eu for lançar um recebimento eu queria
 * ter esse controle na minha mão... eu consigo passar pro cliente: você ainda
 * me deve tanto de serviço, tanto de consumo, tanto de capital. E quando fosse
 * um pagamento avulso eu poderia lançar como dinheiro."
 *
 * O QUE ESTA TELA FAZ:
 *  - mostra os itens EM ABERTO do cliente, separados por tipo;
 *  - o Felipe marca o que está sendo pago e digita quanto;
 *  - valor MENOR que o item = pagamento parcial (o item fica com o resto);
 *  - valor IGUAL = item quitado;
 *  - valor MAIOR = quita o item e o excedente vira CRÉDITO avulso;
 *  - pagamento sem marcar item = crédito geral, abate os mais antigos.
 *
 * TRÊS REGRAS QUE PROTEGEM O SALDO (aprendidas errando na Natalio):
 *  1. o pagamento é gravado NEGATIVO (é abatimento) e vinculado ao item;
 *  2. o total de cada item é sempre quantidade × unitário, nunca digitado;
 *  3. esta tela não altera o valor do item — ela cria o PAGAMENTO que aponta
 *     para ele. O item original continua intacto para auditoria.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { brl, dataBR } from '@/types/crm'
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
import { ArrowLeft, Loader2, Check, Wallet, AlertTriangle, CheckCircle2, Coins } from 'lucide-react'
import { toast } from 'sonner'

interface ItemSaldo {
  id: string
  data: string
  kind: string
  descricao: string
  total: number
  pago: number
  em_aberto: number
  quitado: boolean
  tem_vinculo: boolean
}

interface SaldoTipo {
  cliente: string
  apelido: string
  servico: number
  consumo: number
  capital: number
  credito: number
  total: number
  itens: ItemSaldo[]
  pagamentos: { id: string; data: string; descricao: string; valor: number; settles: string }[]
}

const ROTULO: Record<string, string> = {
  SERVICO: 'Serviço',
  CONSUMO: 'Consumo',
  CAPITAL: 'Capital',
}

/**
 * Quantos dias desde a data de compra.
 *
 * Serve para o Felipe ver "há quanto tempo o cliente deve isso" na própria
 * linha, sem precisar calcular de cabeça. Data inválida devolve 0.
 */
function diasDesde(data: string): number {
  const m = String(data || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
  const hoje = new Date()
  const diff = Math.floor((hoje.getTime() - d.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

export default function DarBaixaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [dados, setDados] = useState<SaldoTipo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  /** item escolhido para pagar */
  const [itemId, setItemId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [descricao, setDescricao] = useState('')

  /** pagamento sem item (crédito avulso) */
  const [creditoAberto, setCreditoAberto] = useState(false)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      /**
       * `pb.send` já leva a sessão do usuário no header Authorization. A rota
       * aceita sessão de admin OU o segredo de serviço — foi corrigido em
       * 23/11/2026, quando a tela mostrava "Não foi possível abrir o cliente"
       * porque só o segredo era aceito e o navegador não o tem.
       */
      const r: any = await pb.send(`/backend/v1/saldo-por-tipo?cliente=${id}`, { method: 'GET' })
      if (!r || !Array.isArray(r.itens)) {
        throw new Error('Resposta inesperada do servidor.')
      }
      setDados(r)
    } catch (e: any) {
      console.error('saldo-por-tipo falhou', e)
      toast.error(
        e?.status === 403
          ? 'Sem permissão para ver o saldo deste cliente.'
          : e?.message || 'Não foi possível carregar o saldo.',
      )
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /**
   * ORDEM DOS GRUPOS (pedido do Felipe, 23/11/2026): "gostaria que deixasse um
   * botão para separar por prioridades... eu quero que o serviço seja
   * prioridade, mas aí o consumo e o capital fiquem logo abaixo. A minha
   * sequência é capital, consumo e serviço."
   *
   * IMPORTANTE: o botão só MUDA A ORDEM — nenhum item desaparece da tela. Ele
   * quer ver a planilha inteira, organizada, não filtrada. Por isso os grupos
   * com saldo continuam todos aparecendo, só em sequência diferente.
   */
  const [prioridade, setPrioridade] = useState<'CAPITAL' | 'CONSUMO' | 'SERVICO'>('CAPITAL')

  /** dentro do grupo: por data (mais antigo primeiro) ou por valor */
  const [ordemItens, setOrdemItens] = useState<'data' | 'valor'>('data')

  const grupos = useMemo(() => {
    if (!dados) return []
    // o tipo escolhido vai primeiro; os outros seguem na ordem natural
    const resto = (['CAPITAL', 'CONSUMO', 'SERVICO'] as const).filter((k) => k !== prioridade)
    const ordem = [prioridade, ...resto]
    return ordem
      .map((k) => {
        const itens = dados.itens
          .filter((i) => i.kind === k && i.em_aberto > 0.005)
          .slice()
          .sort((a, b) =>
            ordemItens === 'valor'
              ? b.em_aberto - a.em_aberto
              : a.data < b.data
                ? -1
                : a.data > b.data
                  ? 1
                  : 0,
          )
        return {
          tipo: k,
          rotulo: ROTULO[k],
          saldo: k === 'SERVICO' ? dados.servico : k === 'CONSUMO' ? dados.consumo : dados.capital,
          itens,
        }
      })
      .filter((g) => g.itens.length > 0)
  }, [dados, prioridade, ordemItens])

  const itemEscolhido = useMemo(
    () => dados?.itens.find((i) => i.id === itemId) || null,
    [dados, itemId],
  )

  const valorNum = Number(valor.replace(',', '.')) || 0
  const excedente = itemEscolhido ? Math.max(0, valorNum - itemEscolhido.em_aberto) : 0
  const falta = itemEscolhido ? Math.max(0, itemEscolhido.em_aberto - valorNum) : 0

  const escolherItem = (i: ItemSaldo) => {
    setItemId(i.id)
    // já sugere o valor total em aberto — o caso mais comum é quitar inteiro
    setValor(String(i.em_aberto).replace('.', ','))
    setDescricao(`PAGAMENTO - ${i.descricao.slice(0, 60)}`)
    setCreditoAberto(false)
  }

  const abrirCredito = () => {
    setItemId('')
    setValor('')
    setDescricao('PAGAMENTO AVULSO - CRÉDITO')
    setCreditoAberto(true)
  }

  const registrar = async () => {
    if (!id) return
    if (!dados) return
    if (!(valorNum > 0)) return toast.error('Informe o valor recebido.')

    setSalvando(true)
    try {
      const corpo: Record<string, unknown> = {
        client: id,
        date: `${data} 12:00:00.000Z`,
        kind: 'DINHEIRO',
        item_type: 'SERVICO',
        description: descricao.trim() || 'PAGAMENTO RECEBIDO',
        quantity: 1,
        // pagamento entra NEGATIVO: é abatimento do saldo
        unit_price: -Math.abs(valorNum),
        sent_to_finance: 'ENVIADA',
      }
      // vínculo com o item que está sendo quitado (vazio = crédito avulso)
      if (itemId) corpo.settles = itemId

      /**
       * EXCEDENTE: se pagou mais do que o item devia, o que sobra não pode
       * ficar preso no item (ele ficaria negativo). Grava-se um SEGUNDO
       * lançamento de crédito, sem vínculo, que abate os outros itens.
       */
      const principal = itemId ? Math.min(valorNum, itemEscolhido?.em_aberto || valorNum) : valorNum

      await pb.collection('transactions').create({
        ...corpo,
        unit_price: -Math.abs(principal),
      } as never)

      if (excedente > 0.005) {
        await pb.collection('transactions').create({
          client: id,
          date: `${data} 12:00:00.000Z`,
          kind: 'DINHEIRO',
          item_type: 'SERVICO',
          description: `CRÉDITO A FAVOR - excedente do pagamento (${itemEscolhido?.descricao.slice(0, 40) || 'avulso'})`,
          quantity: 1,
          unit_price: -Math.abs(excedente),
          sent_to_finance: 'ENVIADA',
        } as never)
      }

      toast.success(
        excedente > 0.005
          ? `Pagamento registrado. ${brl(excedente)} viraram crédito a favor.`
          : 'Pagamento registrado.',
      )
      setItemId('')
      setValor('')
      setCreditoAberto(false)
      await carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível registrar o pagamento.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando o saldo...
      </div>
    )
  }

  if (!dados) {
    return (
      <div className="p-10 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="text-sm font-bold">Não foi possível abrir o cliente.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/clientes')}>
          Voltar
        </Button>
      </div>
    )
  }

  const nadaEmAberto = dados.total <= 0.005 && dados.credito <= 0.005

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => navigate(`/clientes/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-black leading-tight">Dar baixa</h1>
          <p className="text-[10px] text-muted-foreground">{dados.apelido || dados.cliente}</p>
        </div>
      </div>

      {/* saldo por tipo — o que o Felipe mostra ao cliente */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Serviço</p>
            <p className="text-sm font-black text-blue-800">{brl(dados.servico)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Consumo</p>
            <p className="text-sm font-black text-amber-800">{brl(dados.consumo)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-slate-500">
          <CardContent className="p-2.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Capital</p>
            <p className="text-sm font-black text-slate-800">{brl(dados.capital)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <span className="text-[11px] font-bold">Total em aberto</span>
        <span className="text-base font-black text-rose-700">{brl(dados.total)}</span>
      </div>

      {dados.credito > 0.005 && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] text-emerald-900">
          <Coins className="mr-1 inline h-3 w-3" />
          Crédito a favor: <strong>{brl(dados.credito)}</strong> — já abatido dos itens mais
          antigos.
        </p>
      )}

      {/* ordem dos grupos — NÃO esconde nada, só reordena */}
      <div className="rounded-lg border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Ver primeiro:
          </span>
          {(['CAPITAL', 'CONSUMO', 'SERVICO'] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={prioridade === k ? 'default' : 'outline'}
              onClick={() => setPrioridade(k)}
              className={`h-7 text-[10px] ${prioridade === k ? 'bg-slate-900 text-white' : ''}`}
            >
              {ROTULO[k]}
            </Button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Dentro:</span>
          <Button
            type="button"
            size="sm"
            variant={ordemItens === 'data' ? 'default' : 'outline'}
            onClick={() => setOrdemItens('data')}
            className={`h-7 text-[10px] ${ordemItens === 'data' ? 'bg-slate-900 text-white' : ''}`}
          >
            Data
          </Button>
          <Button
            type="button"
            size="sm"
            variant={ordemItens === 'valor' ? 'default' : 'outline'}
            onClick={() => setOrdemItens('valor')}
            className={`h-7 text-[10px] ${ordemItens === 'valor' ? 'bg-slate-900 text-white' : ''}`}
          >
            Valor
          </Button>
        </div>
        <p className="mt-1 text-[9px] text-muted-foreground">
          A ordem muda, mas todos os itens continuam na tela.
        </p>
      </div>

      {isAdmin && !nadaEmAberto && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full gap-1.5 border-emerald-300 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
          onClick={abrirCredito}
        >
          <Wallet className="h-3.5 w-3.5" /> Pagamento avulso (sem apontar item)
        </Button>
      )}

      {/* itens por tipo */}
      {grupos.map((g) => (
        <Card key={g.tipo}>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
              <span className="text-[11px] font-bold">
                {g.rotulo} <span className="text-muted-foreground">({g.itens.length})</span>
              </span>
              <span className="text-[11px] font-black text-rose-700">{brl(g.saldo)}</span>
            </div>
            <div className="divide-y">
              {g.itens.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => escolherItem(i)}
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition ${
                    itemId === i.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold leading-tight">
                      {i.descricao}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {dataBR(i.data)} · total {brl(i.total)}
                      {i.pago > 0.005 && ` · já pago ${brl(i.pago)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-black text-rose-700">{brl(i.em_aberto)}</p>
                    <p className="text-[8px] uppercase text-muted-foreground">em aberto</p>
                  </div>
                  {itemId === i.id && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {nadaEmAberto && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <p className="text-sm font-bold">Nada em aberto</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Este cliente não tem débito pendente.
            </p>
          </CardContent>
        </Card>
      )}

      {/* histórico de pagamentos vinculados */}
      {dados.pagamentos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b bg-muted/30 px-3 py-2">
              <span className="text-[11px] font-bold">
                Pagamentos registrados ({dados.pagamentos.length})
              </span>
            </div>
            <div className="divide-y">
              {dados.pagamentos
                .slice(-8)
                .reverse()
                .map((p) => {
                  const alvo = dados.itens.find((i) => i.id === p.settles)
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-semibold">{p.descricao}</p>
                        <p className="text-[8px] text-muted-foreground">
                          {dataBR(p.data)} ·{' '}
                          {alvo ? `quitou: ${alvo.descricao.slice(0, 30)}` : 'crédito avulso'}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                        {brl(p.valor)}
                      </span>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* formulário de baixa */}
      <Dialog
        open={Boolean(itemId) || creditoAberto}
        onOpenChange={(v) => {
          if (!v) {
            setItemId('')
            setCreditoAberto(false)
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] w-[94vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {itemEscolhido ? 'Dar baixa neste item' : 'Pagamento avulso'}
            </DialogTitle>
          </DialogHeader>

          {itemEscolhido && (
            <div className="rounded-lg border bg-slate-50 p-2">
              <p className="text-[11px] font-bold leading-snug">{itemEscolhido.descricao}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {dataBR(itemEscolhido.data)} · {ROTULO[itemEscolhido.kind]} · em aberto{' '}
                <strong className="text-rose-700">{brl(itemEscolhido.em_aberto)}</strong>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-semibold">Valor recebido</Label>
                <Input
                  inputMode="decimal"
                  autoFocus
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="h-10 text-sm font-bold"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold">Data</Label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-semibold">Descrição</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* o que vai acontecer com o valor digitado */}
            {itemEscolhido && valorNum > 0 && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
                {falta > 0.005 && excedente <= 0.005 && (
                  <p className="text-[10px] text-amber-800">
                    <strong>Pagamento parcial.</strong> O item fica com{' '}
                    <strong>{brl(falta)}</strong> em aberto.
                  </p>
                )}
                {Math.abs(valorNum - itemEscolhido.em_aberto) <= 0.005 && (
                  <p className="text-[10px] text-emerald-800">
                    <strong>Quita o item.</strong> Não fica saldo nele.
                  </p>
                )}
                {excedente > 0.005 && (
                  <p className="text-[10px] text-blue-800">
                    <strong>Pagou a mais.</strong> {brl(itemEscolhido.em_aberto)} quitam o item e{' '}
                    <strong>{brl(excedente)}</strong> viram crédito a favor.
                  </p>
                )}
              </div>
            )}

            {creditoAberto && (
              <p className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-900">
                Sem apontar item: o valor vira crédito e abate os débitos mais antigos do cliente.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setItemId('')
                setCreditoAberto(false)
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 text-white hover:bg-emerald-800"
              disabled={salvando}
              onClick={registrar}
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Registrar {valorNum > 0 ? brl(valorNum) : 'pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[9px] text-muted-foreground">
        O pagamento fica registrado apontando para o item que quitou. O valor do item não muda —
        assim dá para auditar depois quem pagou o quê, quando e quanto.
      </p>
    </div>
  )
}
