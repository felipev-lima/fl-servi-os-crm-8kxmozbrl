/**
 * Contas a pagar (C1).
 *
 * O outro lado do dinheiro: o que a empresa deve. Ate aqui o sistema olhava
 * so o que o cliente devia; com esta tela ele mostra tambem fornecedor,
 * aluguel, energia, salario e imposto, com vencimento e baixa.
 */
import { useEffect, useMemo, useState } from 'react'
import { getBills, createBill, updateBill, deleteBill } from '@/services/crm'
import type { Bill, BillCategory } from '@/types/crm'
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
import { Plus, Loader2, Trash2, CheckCircle2, AlertTriangle, Clock3, Wallet } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORIAS: BillCategory[] = [
  'FORNECEDOR',
  'ALUGUEL',
  'ENERGIA',
  'AGUA',
  'TELEFONE',
  'SALARIO',
  'IMPOSTO',
  'OUTRO',
]

export default function ContasPagarPage() {
  const [contas, setContas] = useState<Bill[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('TODOS')
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState<BillCategory>('FORNECEDOR')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState(() => new Date().toISOString().slice(0, 10))

  const carregar = async () => {
    setCarregando(true)
    try {
      setContas(await getBills())
    } catch {
      toast.error('Não foi possível carregar as contas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const hoje = new Date().toISOString().slice(0, 10)

  /** Vencida = passou do vencimento e não foi paga */
  const estaVencida = (c: Bill) =>
    (c.status || 'ABERTA') !== 'PAGA' && c.due_date && c.due_date.slice(0, 10) < hoje

  const lista = useMemo(() => {
    const base =
      filtro === 'TODOS'
        ? contas
        : filtro === 'VENCIDA'
          ? contas.filter(estaVencida)
          : contas.filter((c) => (c.status || 'ABERTA') === filtro)
    return [...base].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [contas, filtro])

  const totalAberto = contas
    .filter((c) => (c.status || 'ABERTA') !== 'PAGA')
    .reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalVencido = contas.filter(estaVencida).reduce((s, c) => s + Number(c.amount || 0), 0)
  const totalPago = contas
    .filter((c) => c.status === 'PAGA')
    .reduce((s, c) => s + Number(c.amount || 0), 0)

  const salvar = async () => {
    if (!fornecedor.trim()) return toast.error('Informe o fornecedor.')
    const v = Number(String(valor).replace(',', '.')) || 0
    if (v <= 0) return toast.error('Informe o valor.')
    setSalvando(true)
    try {
      await createBill({
        supplier: fornecedor.trim().toUpperCase(),
        description: descricao.trim(),
        category: categoria,
        amount: v,
        due_date: `${vencimento} 12:00:00.000Z`,
        status: 'ABERTA',
      })
      toast.success('Conta registrada.')
      setAberto(false)
      setFornecedor('')
      setDescricao('')
      setValor('')
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const pagar = async (c: Bill) => {
    await updateBill(c.id, { status: 'PAGA', paid_at: new Date().toISOString() })
    toast.success('Conta marcada como paga.')
    void carregar()
  }

  const reabrir = async (c: Bill) => {
    await updateBill(c.id, { status: 'ABERTA', paid_at: '' })
    void carregar()
  }

  const excluir = async (c: Bill) => {
    if (!confirm(`Excluir a conta de ${c.supplier}?`)) return
    await deleteBill(c.id)
    toast.success('Excluída.')
    void carregar()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Contas a pagar</h1>
          <p className="text-[11px] text-muted-foreground">
            {brl(totalAberto)} em aberto · {brl(totalVencido)} vencido
          </p>
        </div>
        <Button
          onClick={() => setAberto(true)}
          className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
        >
          <Plus className="h-4 w-4" /> Nova
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['Em aberto', totalAberto, 'text-amber-700', 'border-amber-200 bg-amber-50'],
          ['Vencido', totalVencido, 'text-rose-700', 'border-rose-200 bg-rose-50'],
          ['Pago', totalPago, 'text-emerald-700', 'border-emerald-200 bg-emerald-50'],
        ].map(([rot, val, cor, bg]) => (
          <Card key={rot as string} className={`border ${bg as string}`}>
            <CardContent className="p-2.5">
              <span className={`block text-[9px] font-bold uppercase ${cor as string}`}>{rot}</span>
              <span className={`font-mono text-xs font-black ${cor as string}`}>
                {brl(val as number)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['TODOS', 'Todas'],
          ['ABERTA', 'Em aberto'],
          ['VENCIDA', 'Vencidas'],
          ['PAGA', 'Pagas'],
        ].map(([v, rot]) => (
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

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-1.5">
          {lista.map((c) => {
            const paga = c.status === 'PAGA'
            const vencida = estaVencida(c)
            return (
              <Card key={c.id} className={vencida ? 'border-rose-300' : ''}>
                <CardContent className="space-y-1.5 p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold">{c.supplier}</span>
                        <Badge variant="outline" className="px-1 py-0 text-[8px]">
                          {c.category || 'OUTRO'}
                        </Badge>
                        {paga ? (
                          <Badge className="border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[8px] text-emerald-800">
                            PAGA
                          </Badge>
                        ) : vencida ? (
                          <Badge className="border-rose-300 bg-rose-100 px-1.5 py-0 text-[8px] text-rose-800">
                            VENCIDA
                          </Badge>
                        ) : (
                          <Badge className="border-amber-300 bg-amber-100 px-1.5 py-0 text-[8px] text-amber-800">
                            ABERTA
                          </Badge>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-[10px] text-muted-foreground">{c.description}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground">
                        Vence {dataBR(c.due_date)}
                        {paga && c.paid_at ? ` · pago em ${dataBR(c.paid_at)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold">
                      {brl(Number(c.amount))}
                    </span>
                  </div>
                  <div className="flex gap-1 border-t pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (paga ? reabrir(c) : pagar(c))}
                      className={`h-6 flex-1 gap-1 text-[9px] ${
                        paga ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {paga ? (
                        <>
                          <Clock3 className="h-2.5 w-2.5" /> Reabrir
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-2.5 w-2.5" /> Marcar paga
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => excluir(c)}
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

          {lista.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center">
              <Wallet className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold">Nenhuma conta</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Registre fornecedores, aluguel e despesas fixas.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[94vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Nova conta a pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fornecedor</Label>
              <Input
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="NOME DO FORNECEDOR"
                className="h-9 text-xs uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição (opcional)</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Fatura de outubro"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Categoria</Label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as BillCategory)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Valor</Label>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vencimento</Label>
                <Input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
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
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
