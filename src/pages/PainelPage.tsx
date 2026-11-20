/**
 * Painel — a primeira tela do dia.
 *
 * Responde em um olhar: quanto tenho a receber, quanto faturei no mês, quanto
 * recebi, quem mais me deve e o que vence esta semana.
 *
 * Todos os números são CALCULADOS — nada digitado à mão. A leitura vem da view
 * `client_summary` (uma linha por cliente), nunca dos lançamentos inteiros.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getClientsSummary, getTransactions, getBills } from '@/services/crm'
import type { ClientSummary, Transaction, Bill } from '@/types/crm'
import { brl, dataBR, totalDaLinha } from '@/types/crm'
import { getWorkOrders } from '@/services/api'
import type { WorkOrder } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wallet,
  TrendingUp,
  Users,
  Loader2,
  ArrowRight,
  AlertCircle,
  Plus,
  Receipt,
  CalendarClock,
} from 'lucide-react'

export default function Painel() {
  const [resumos, setResumos] = useState<ClientSummary[]>([])
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [contas, setContas] = useState<Bill[]>([])
  const [os, setOs] = useState<WorkOrder[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [rs, tx, bl, ordens] = await Promise.all([
          getClientsSummary(),
          getTransactions({ page: 1, perPage: 8 }),
          getBills(),
          getWorkOrders(),
        ])
        setResumos(rs)
        setLancamentos(tx.items)
        setContas(bl)
        setOs(ordens)
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  const aReceber = resumos.reduce((s, r) => s + (r.saldo > 0 ? r.saldo : 0), 0)
  const aCredito = resumos.reduce((s, r) => s + (r.saldo < 0 ? r.saldo : 0), 0)
  const devedores = resumos.filter((r) => r.saldo > 0.005).sort((a, b) => b.saldo - a.saldo)

  const recebidoMes = lancamentos
    .filter((t) => t.kind === 'DINHEIRO' && (t.date || '').slice(0, 7) === mesAtual)
    .reduce((s, t) => s + Math.abs(totalDaLinha(t)), 0)

  const emAberto = os.filter((o) => o.status !== 'FINALIZADA' && o.status !== 'CANCELADA')
  const hojeStr = hoje.toISOString().slice(0, 10)
  const osHoje = os.filter((o) => (o.scheduled_date || '').slice(0, 10) === hojeStr)

  const seteDias = new Date(hoje.getTime() + 7 * 86400000)
  const vencendo = contas.filter(
    (c) => (c.status || 'ABERTA') !== 'PAGA' && c.due_date && new Date(c.due_date) <= seteDias,
  )
  const totalVencendo = vencendo.reduce((s, c) => s + Number(c.amount || 0), 0)

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  const cartoes = [
    {
      titulo: 'A receber',
      valor: brl(aReceber),
      detalhe: `${devedores.length} cliente(s) devendo`,
      icone: Wallet,
      cor: 'text-amber-700',
      bg: 'border-amber-200 bg-amber-50',
    },
    {
      titulo: 'OS em aberto',
      valor: String(emAberto.length),
      detalhe: `${osHoje.length} agendada(s) para hoje`,
      icone: CalendarClock,
      cor: 'text-blue-700',
      bg: 'border-blue-200 bg-blue-50',
    },
    {
      titulo: 'Recebido no mês',
      valor: brl(recebidoMes),
      detalhe: 'pagamentos registrados',
      icone: TrendingUp,
      cor: 'text-emerald-700',
      bg: 'border-emerald-200 bg-emerald-50',
    },
    {
      titulo: 'A pagar (7 dias)',
      valor: brl(totalVencendo),
      detalhe: `${vencendo.length} conta(s) vencendo`,
      icone: Receipt,
      cor: 'text-rose-700',
      bg: 'border-rose-200 bg-rose-50',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Painel</h1>
          <p className="text-[11px] text-muted-foreground">
            Tudo calculado — sem digitação de total
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            asChild
            className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
          >
            <Link to="/lancamentos?novo=1">
              <Plus className="h-4 w-4" /> Lançar
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cartoes.map((c) => {
          const Icone = c.icone
          return (
            <Card key={c.titulo} className={`border ${c.bg}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase ${c.cor}`}>{c.titulo}</span>
                  <Icone className={`h-3.5 w-3.5 ${c.cor}`} />
                </div>
                <div className={`mt-1 text-lg font-black sm:text-xl ${c.cor}`}>{c.valor}</div>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{c.detalhe}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {Math.abs(aCredito) > 0.005 && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-900">
          <span className="shrink-0 font-bold">Crédito a devolver:</span>
          <span>
            {brl(Math.abs(aCredito))} — {resumos.filter((r) => r.saldo < -0.005).length} cliente(s).
            Somando tudo, o saldo geral é{' '}
            <strong>{brl(resumos.reduce((s, r) => s + r.saldo, 0))}</strong>.
          </span>
        </div>
      )}

      {/* OS em destaque */}
      <Card>
        <CardContent className="p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <CalendarClock className="h-4 w-4 text-[#0B3D91]" /> Ordens de serviço
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {emAberto.length} em aberto · {osHoje.length} hoje
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-[10px]">
              <Link to="/ordens">
                Ver todas <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="space-y-1.5">
            {emAberto.slice(0, 6).map((o) => (
              <Link
                key={o.id}
                to={`/ordens/${o.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 transition hover:border-[#0B3D91]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    #{o.order_number} · {o.expand?.client?.nickname || o.expand?.client?.name}
                  </p>
                  <p className="truncate text-[9px] text-muted-foreground">{o.description}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[8px]">
                  {o.status}
                </Badge>
              </Link>
            ))}
            {emAberto.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma OS em aberto.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Devedores */}
      <Card>
        <CardContent className="p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Maiores devedores
              </h2>
              <p className="text-[10px] text-muted-foreground">Total em aberto: {brl(aReceber)}</p>
            </div>
            <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-[10px]">
              <Link to="/relatorios">
                Relatórios <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="space-y-1.5">
            {devedores.slice(0, 8).map((r) => (
              <Link
                key={r.id}
                to={`/relatorios?cliente=${r.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 transition hover:border-[#0B3D91]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{r.nickname || r.name}</p>
                  {r.nickname && (
                    <p className="truncate text-[9px] text-muted-foreground">{r.name}</p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs font-bold text-amber-800">
                  {brl(r.saldo)}
                </span>
              </Link>
            ))}
            {devedores.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum cliente com saldo em aberto.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Últimos lançamentos */}
      <Card>
        <CardContent className="p-3.5">
          <h2 className="mb-2 text-sm font-bold">Últimos lançamentos</h2>
          <div className="space-y-1">
            {lancamentos.map((t) => {
              const v = totalDaLinha(t)
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 border-b p-1.5 text-[11px] last:border-0"
                >
                  <span className="shrink-0 text-muted-foreground">{dataBR(t.date)}</span>
                  <span className="flex-1 truncate">
                    {t.expand?.client?.nickname || t.expand?.client?.name || t.description}
                  </span>
                  <span
                    className={`shrink-0 font-mono font-bold ${
                      v < 0 ? 'text-emerald-700' : 'text-slate-800'
                    }`}
                  >
                    {brl(v)}
                  </span>
                </div>
              )
            })}
            {lancamentos.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum lançamento ainda. Comece pelo botão <strong>Lançar</strong>.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
