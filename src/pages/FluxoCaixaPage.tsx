/**
 * Fluxo de caixa (C2).
 *
 * Responde "tenho dinheiro?" no dia a dia: junta as ENTRADAS (pagamentos
 * recebidos, DINHEIRO nos lançamentos) com as SAÍDAS (contas pagas) e mostra
 * o saldo do período.
 *
 * Não é contabilidade — é caixa.
 */
import { useEffect, useMemo, useState } from 'react'
import { getBills, getTransactions } from '@/services/crm'
import type { Bill, Transaction } from '@/types/crm'
import { brl, dataBR, totalDaLinha } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react'

export default function FluxoCaixaPage() {
  const hoje = new Date()
  const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`

  const [de, setDe] = useState(primeiroDia)
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10))
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [contas, setContas] = useState<Bill[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    setCarregando(true)
    try {
      const [tx, bl] = await Promise.all([
        getTransactions({ page: 1, perPage: 500, from: de, to: ate }),
        getBills(),
      ])
      setLancamentos(tx.items)
      setContas(bl)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate])

  /** Entradas: pagamentos recebidos no período (DINHEIRO é negativo no banco) */
  const entradas = useMemo(
    () =>
      lancamentos
        .filter((t) => t.kind === 'DINHEIRO')
        .reduce((s, t) => s + Math.abs(totalDaLinha(t)), 0),
    [lancamentos],
  )

  /** Saídas: contas pagas dentro do período */
  const saidas = useMemo(
    () =>
      contas
        .filter(
          (c) =>
            c.status === 'PAGA' &&
            c.paid_at &&
            c.paid_at.slice(0, 10) >= de &&
            c.paid_at.slice(0, 10) <= ate,
        )
        .reduce((s, c) => s + Number(c.amount || 0), 0),
    [contas, de, ate],
  )

  const saldo = entradas - saidas

  const movimentos = useMemo(() => {
    const mov: { data: string; tipo: 'ENTRADA' | 'SAIDA'; desc: string; valor: number }[] = []
    for (const t of lancamentos) {
      if (t.kind !== 'DINHEIRO') continue
      mov.push({
        data: t.date,
        tipo: 'ENTRADA',
        desc: `${t.expand?.client?.nickname || t.expand?.client?.name || 'Cliente'} — ${t.description}`,
        valor: Math.abs(totalDaLinha(t)),
      })
    }
    for (const c of contas) {
      if (c.status !== 'PAGA' || !c.paid_at) continue
      const d = c.paid_at.slice(0, 10)
      if (d < de || d > ate) continue
      mov.push({
        data: c.paid_at,
        tipo: 'SAIDA',
        desc: `${c.supplier} — ${c.description || c.category || 'conta'}`,
        valor: Number(c.amount || 0),
      })
    }
    return mov.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  }, [lancamentos, contas, de, ate])

  const atalho = (rotulo: string, dias: number) => {
    const fim = new Date()
    const inicio = new Date(fim.getTime() - dias * 86400000)
    setDe(inicio.toISOString().slice(0, 10))
    setAte(fim.toISOString().slice(0, 10))
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Fluxo de caixa</h1>
        <p className="text-[11px] text-muted-foreground">
          Entradas recebidas menos contas pagas no período
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">De</Label>
              <Input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Até</Label>
              <Input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => atalho('Hoje', 0)}
              className="h-6 text-[9px]"
            >
              Hoje
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => atalho('7 dias', 7)}
              className="h-6 text-[9px]"
            >
              7 dias
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => atalho('30 dias', 30)}
              className="h-6 text-[9px]"
            >
              30 dias
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDe(primeiroDia)
                setAte(new Date().toISOString().slice(0, 10))
              }}
              className="h-6 text-[9px]"
            >
              Este mês
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-emerald-700">Entrou</span>
              <TrendingUp className="h-3 w-3 text-emerald-700" />
            </div>
            <span className="font-mono text-xs font-black text-emerald-700">{brl(entradas)}</span>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-rose-700">Saiu</span>
              <TrendingDown className="h-3 w-3 text-rose-700" />
            </div>
            <span className="font-mono text-xs font-black text-rose-700">{brl(saidas)}</span>
          </CardContent>
        </Card>
        <Card
          className={saldo >= 0 ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}
        >
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span
                className={`text-[9px] font-bold uppercase ${
                  saldo >= 0 ? 'text-blue-700' : 'text-amber-700'
                }`}
              >
                Saldo
              </span>
              <Wallet className={`h-3 w-3 ${saldo >= 0 ? 'text-blue-700' : 'text-amber-700'}`} />
            </div>
            <span
              className={`font-mono text-xs font-black ${
                saldo >= 0 ? 'text-blue-700' : 'text-amber-700'
              }`}
            >
              {brl(saldo)}
            </span>
          </CardContent>
        </Card>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <Card>
          <CardContent className="p-3">
            <h2 className="mb-2 text-sm font-bold">Movimento do período</h2>
            <div className="space-y-1">
              {movimentos.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 border-b p-1.5 text-[11px] last:border-0"
                >
                  {m.tipo === 'ENTRADA' ? (
                    <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  )}
                  <span className="shrink-0 text-muted-foreground">{dataBR(m.data)}</span>
                  <span className="flex-1 truncate">{m.desc}</span>
                  <span
                    className={`shrink-0 font-mono font-bold ${
                      m.tipo === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {m.tipo === 'ENTRADA' ? '+' : '−'} {brl(m.valor)}
                  </span>
                </div>
              ))}
              {movimentos.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum movimento no período.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
