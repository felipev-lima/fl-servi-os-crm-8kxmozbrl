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
import { getWorkOrders, getMaterials, getClients } from '@/services/api'
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
  /** pendências que o dono precisa ver ao abrir o sistema */
  const [estoqueBaixo, setEstoqueBaixo] = useState(0)
  const [semContato, setSemContato] = useState(0)

  /**
   * Filtro de status DENTRO do painel (pedido do Felipe, 20/11/2026).
   *
   * Antes, clicar em "Abertas" levava para /ordens e ele perdia o painel de
   * vista. Agora o clique filtra a lista aqui embaixo, na mesma tela: ele vê
   * o número, clica e continua trabalhando sem trocar de página.
   *
   * `null` = todos os status em aberto (o padrão).
   */
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null)

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
        // contagem rápida das duas pendências que mais custam dinheiro
        try {
          const [mats, cls] = await Promise.all([getMaterials(), getClients()])
          setEstoqueBaixo(
            mats.filter(
              (m: any) =>
                m.control_stock &&
                Number(m.stock_min || 0) > 0 &&
                Number(m.current_stock || 0) < Number(m.stock_min || 0),
            ).length,
          )
          setSemContato(cls.filter((c) => !(c.phone || '').trim()).length)
        } catch {
          /* painel funciona sem esses contadores */
        }
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

  /** Contagem por status, para os chips clicáveis do painel */
  const contagemStatus = {
    ABERTA: os.filter((o) => o.status === 'ABERTA').length,
    AGENDADA: os.filter((o) => o.status === 'AGENDADA').length,
    'EM ANDAMENTO': os.filter((o) => o.status === 'EM ANDAMENTO').length,
    'AGUARDANDO MATERIAL': os.filter((o) => o.status === 'AGUARDANDO MATERIAL').length,
    FINALIZADA: os.filter((o) => o.status === 'FINALIZADA').length,
  }

  /**
   * A lista que aparece no painel.
   *
   * Sem filtro: as OS em aberto (o que ele precisa tocar hoje).
   * Com filtro: exatamente o status escolhido, inclusive FINALIZADA.
   */
  const osVisiveis = filtroStatus ? os.filter((o) => o.status === filtroStatus) : emAberto

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
      // clicar filtra a lista abaixo, sem sair do painel
      acao: () => setFiltroStatus(null),
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
          const clicavel = typeof (c as any).acao === 'function'
          const conteudo = (
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase ${c.cor}`}>{c.titulo}</span>
                <Icone className={`h-3.5 w-3.5 ${c.cor}`} />
              </div>
              <div className={`mt-1 text-lg font-black sm:text-xl ${c.cor}`}>{c.valor}</div>
              <p className="mt-0.5 text-[9px] text-muted-foreground">{c.detalhe}</p>
            </CardContent>
          )
          return clicavel ? (
            <button
              key={c.titulo}
              type="button"
              onClick={(c as any).acao}
              className="text-left"
              title="Ver as ordens no painel"
            >
              <Card className={`border ${c.bg} transition hover:shadow-md`}>{conteudo}</Card>
            </button>
          ) : (
            <Card key={c.titulo} className={`border ${c.bg}`}>
              {conteudo}
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

          {/*
            Chips de status clicáveis.
            Filtram a lista AQUI, sem trocar de tela — o Felipe continua no
            painel. Clicar de novo no mesmo chip volta a mostrar tudo em aberto.
          */}
          <div className="mb-2 flex flex-wrap gap-1">
            {(
              [
                [null, 'Em aberto', emAberto.length, 'bg-slate-900 text-white'],
                ['ABERTA', 'Abertas', contagemStatus.ABERTA, 'bg-slate-600 text-white'],
                ['AGENDADA', 'Agendadas', contagemStatus.AGENDADA, 'bg-blue-600 text-white'],
                [
                  'EM ANDAMENTO',
                  'Em andamento',
                  contagemStatus['EM ANDAMENTO'],
                  'bg-orange-600 text-white',
                ],
                [
                  'AGUARDANDO MATERIAL',
                  'Aguard. material',
                  contagemStatus['AGUARDANDO MATERIAL'],
                  'bg-amber-600 text-white',
                ],
                [
                  'FINALIZADA',
                  'Finalizadas',
                  contagemStatus.FINALIZADA,
                  'bg-emerald-700 text-white',
                ],
              ] as [string | null, string, number, string][]
            ).map(([valor, rotulo, qtd, cor]) => {
              const ativo = filtroStatus === valor
              return (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => setFiltroStatus(ativo ? null : valor)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                    ativo
                      ? `${cor} border-transparent`
                      : 'bg-white text-muted-foreground hover:border-[#0B3D91]/50'
                  }`}
                >
                  {rotulo} ({qtd})
                </button>
              )
            })}
          </div>

          <div className="space-y-1.5">
            {osVisiveis.slice(0, 12).map((o) => (
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
            {osVisiveis.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {filtroStatus
                  ? `Nenhuma OS com status "${filtroStatus}".`
                  : 'Nenhuma OS em aberto.'}
              </p>
            )}
            {osVisiveis.length > 12 && (
              <p className="pt-1 text-center text-[9px] text-muted-foreground">
                Mostrando 12 de {osVisiveis.length} —{' '}
                <Link to="/ordens" className="text-[#0B3D91] underline">
                  ver todas
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pendências que custam dinheiro se ficarem esquecidas */}
      {(estoqueBaixo > 0 || semContato > 0) && (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="space-y-1.5 p-3">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-rose-900">
              <AlertCircle className="h-4 w-4" /> Precisa de atenção
            </h2>
            {estoqueBaixo > 0 && (
              <Link
                to="/estoque"
                className="flex items-center justify-between rounded-lg border border-rose-200 bg-white p-2 transition hover:border-rose-400"
              >
                <span className="text-[11px] font-semibold">
                  {estoqueBaixo} produto(s) abaixo do estoque mínimo
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-rose-600" />
              </Link>
            )}
            {semContato > 0 && (
              <Link
                to="/contatos"
                className="flex items-center justify-between rounded-lg border border-rose-200 bg-white p-2 transition hover:border-rose-400"
              >
                <span className="text-[11px] font-semibold">
                  {semContato} cliente(s) sem telefone — impossível cobrar
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-rose-600" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

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
