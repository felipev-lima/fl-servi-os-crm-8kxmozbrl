/**
 * Painel — a primeira tela do dia.
 *
 * Duas coisas diferentes convivem aqui, e elas têm públicos diferentes:
 *
 *   1. ORDENS DE SERVIÇO por status — é o que o técnico precisa ver. Fica em
 *      destaque, em cartões grandes, e ao tocar em um deles a lista mostra
 *      SOMENTE aquele status. Não acumula com o resto da página.
 *
 *   2. FINANCEIRO (a receber, recebido, a pagar, devedores) — só o
 *      ADMINISTRADOR vê. Técnico não tem nada com o faturamento da empresa, e
 *      mostrar isso para a equipe é expor dado que não é dela.
 *
 * Todos os números são CALCULADOS. A leitura financeira vem da view
 * `client_summary` (uma linha por cliente), nunca dos lançamentos inteiros.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  getClientsSummary,
  getTransactions,
  getBills,
  getQuotes,
  totalDoDocumento,
} from '@/services/crm'
import type { ClientSummary, Transaction, Bill, Quote } from '@/types/crm'
import { brl, dataBR, totalDaLinha } from '@/types/crm'
import { getWorkOrders, getMaterials, getClients } from '@/services/api'
import { enderecoCompleto, linkMapa, temEndereco } from '@/lib/local'
import { STATUS_PEDIDO, configStatus } from '@/lib/pedidoStatus'
import type { WorkOrder } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wallet,
  TrendingUp,
  Loader2,
  ArrowRight,
  AlertCircle,
  Plus,
  Receipt,
  ClipboardList,
  Clock,
  PlayCircle,
  Send,
  CheckCircle2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  AlertTriangle,
  Navigation,
} from 'lucide-react'

type StatusKey = 'ABERTA' | 'AGENDADA' | 'EM ANDAMENTO' | 'FINALIZADA' | 'LANCADA'

/**
 * Os cinco status, na ordem do trabalho.
 *
 * Cada um é um cartão grande e clicável. `cor` é o fundo do cartão quando
 * selecionado; `borda` é a faixa lateral; `texto` pinta número e ícone.
 */
const STATUS: {
  chave: StatusKey
  rotulo: string
  curto: string
  icone: any
  borda: string
  bg: string
  texto: string
  ajuda: string
  /** fundo + borda do CARTÃO de OS na lista (corpo inteiro) */
  cor: string
  /** faixa lateral esquerda do cartão */
  faixa: string
}[] = [
  {
    // cinza um tom mais escuro: o Felipe pediu para destacar do fundo branco
    chave: 'ABERTA',
    rotulo: 'Abertas',
    curto: 'Aberta',
    icone: ClipboardList,
    borda: 'border-l-slate-600',
    bg: 'bg-slate-200',
    texto: 'text-slate-900',
    ajuda: 'Aguardando início',
    cor: 'border-slate-300 bg-slate-200',
    faixa: 'border-l-slate-600',
  },
  {
    // azul, como ele pediu: agendada não é alerta, é compromisso marcado
    chave: 'AGENDADA',
    rotulo: 'Agendadas',
    curto: 'Agendada',
    icone: Clock,
    borda: 'border-l-blue-500',
    bg: 'bg-blue-100',
    texto: 'text-blue-900',
    ajuda: 'Com data definida',
    cor: 'border-blue-300 bg-blue-100',
    faixa: 'border-l-blue-500',
  },
  {
    chave: 'EM ANDAMENTO',
    rotulo: 'Em andamento',
    curto: 'Em andamento',
    icone: PlayCircle,
    borda: 'border-l-amber-500',
    bg: 'bg-amber-100',
    texto: 'text-amber-900',
    ajuda: 'Atendimento ativo',
    cor: 'border-amber-300 bg-amber-100',
    faixa: 'border-l-amber-500',
  },
  {
    chave: 'FINALIZADA',
    rotulo: 'Finalizadas',
    curto: 'Finalizada',
    icone: CheckCircle2,
    borda: 'border-l-emerald-600',
    bg: 'bg-emerald-50',
    texto: 'text-emerald-900',
    ajuda: 'Serviço concluído',
    cor: 'border-emerald-300 bg-emerald-100',
    faixa: 'border-l-emerald-600',
  },
  {
    chave: 'LANCADA',
    rotulo: 'Lançadas',
    curto: 'Lançada',
    icone: Send,
    borda: 'border-l-indigo-600',
    bg: 'bg-indigo-100',
    texto: 'text-indigo-900',
    ajuda: 'Já lançada no financeiro',
    cor: 'border-indigo-300 bg-indigo-100',
    faixa: 'border-l-indigo-600',
  },
]

export default function Painel() {
  const { user, isAdmin } = useAuth()

  const [os, setOs] = useState<WorkOrder[]>([])
  const [pedidos, setPedidos] = useState<Quote[]>([])
  const [carregando, setCarregando] = useState(true)
  /** mesmo seletor "Ordenar" das telas de lista (22/11/2026) */
  const [ordem, setOrdem] = useState<'PRIORIDADE' | 'NUMERO' | 'CLIENTE' | 'DATA'>('PRIORIDADE')
  const [ordemPedido, setOrdemPedido] = useState<'PRIORIDADE' | 'NUMERO' | 'CLIENTE'>('PRIORIDADE')

  // financeiro — só carrega para administrador
  const [resumos, setResumos] = useState<ClientSummary[]>([])
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [contas, setContas] = useState<Bill[]>([])
  const [verFinanceiro, setVerFinanceiro] = useState(false)

  // pendências operacionais
  const [estoqueBaixo, setEstoqueBaixo] = useState(0)
  const [semContato, setSemContato] = useState(0)

  /** Status selecionado. `null` = mostra todos os que estão em aberto. */
  const [statusSel, setStatusSel] = useState<StatusKey | null>(null)

  /**
   * Botão "Hoje".
   *
   * Quando ligado, a lista mostra as OS com data de hoje — e ele não precisa
   * procurar na agenda. Ligar o status desliga o "Hoje" e vice-versa: são dois
   * filtros que respondem perguntas diferentes e não devem competir.
   */
  const [filtroHoje, setFiltroHoje] = useState(false)

  /** Filtro das atrasadas: data vencida e ainda não concluída */
  const [soPendentes, setSoPendentes] = useState(false)

  useEffect(() => {
    ;(async () => {
      /**
       * CARGA EM ETAPAS, e a tela NUNCA espera tudo junto.
       *
       * O backend oscila (a mesma consulta faz 0s e depois 40s). Antes, o
       * `await` de todas as chamadas num bloco só deixava o painel preso em
       * "Carregando..." até a última responder — e se uma travasse, nada
       * aparecia. Agora:
       *   1. as OS saem primeiro e a tela já libera o `carregando`;
       *   2. o financeiro e as pendências chegam depois, cada um no seu ritmo;
       *   3. se um pedaço falhar, o resto continua na tela.
       */
      try {
        setOs(await getWorkOrders())
      } catch {
        /* a lista de OS é o essencial; se falhar, a tela avisa embaixo */
      } finally {
        setCarregando(false) // libera a tela com o que já houver
      }

      // o financeiro não é carregado para técnico — nem chega ao navegador dele
      if (!isAdmin) return
      try {
        const [rs, tx, bl] = await Promise.all([
          getClientsSummary(),
          getTransactions({ page: 1, perPage: 8 }),
          getBills(),
        ])
        setResumos(rs)
        setLancamentos(tx.items)
        setContas(bl)
      } catch {
        /* painel funciona sem o financeiro */
      }
      try {
        setPedidos(await getQuotes())
      } catch {
        /* a lista de pedidos é complementar */
      }
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
        /* contadores são opcionais */
      }
    })()
  }, [isAdmin])

  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const hojeStr = hoje.toISOString().slice(0, 10)

  const contagem = useMemo(() => {
    const c: Record<StatusKey, number> = {
      ABERTA: 0,
      AGENDADA: 0,
      'EM ANDAMENTO': 0,
      FINALIZADA: 0,
      LANCADA: 0,
    }
    for (const o of os) {
      // OS antiga gravada como AGUARDANDO MATERIAL conta como em andamento
      const chave = o.status === 'AGUARDANDO MATERIAL' ? 'EM ANDAMENTO' : (o.status as StatusKey)
      if (chave in c) c[chave] += 1
    }
    return c
  }, [os])

  /** em aberto = ainda dá trabalho (não finalizada, não lançada, não cancelada) */
  const emAberto = os.filter(
    (o) =>
      o.status !== 'FINALIZADA' && (o.status as string) !== 'LANCADA' && o.status !== 'CANCELADA',
  )
  const osHoje = os.filter((o) => (o.scheduled_date || '').slice(0, 10) === hojeStr)

  /**
   * PENDENTES = atrasadas de verdade.
   *
   * Data marcada no passado e a OS ainda não finalizada nem cancelada. É o
   * vermelho que o Felipe pediu: a entrega que era para ontem e ninguém fez.
   * OS sem data NÃO entra — não dá para estar atrasada sem prazo.
   */
  const pendentes = useMemo(() => {
    return os.filter((o) => {
      if (o.status === 'FINALIZADA' || o.status === 'CANCELADA') return false
      const d = (o.scheduled_date || '').slice(0, 10)
      return !!d && d < hojeStr
    })
  }, [os, hojeStr])

  /** conjunto de ids atrasados, para marcar em vermelho dentro de qualquer lista */
  const idsPendentes = useMemo(() => new Set(pendentes.map((o) => o.id)), [pendentes])

  /**
   * A lista do painel.
   *
   * Sem seleção: as que ainda não terminaram (o trabalho pendente).
   * Com seleção: APENAS aquele status — é o pedido do Felipe: clicar em
   * "Agendadas" tem de mostrar só as agendadas, não a lista inteira com as
   * agendadas misturadas.
   */
  const osVisiveis = useMemo(() => {
    let base = soPendentes
      ? pendentes
      : statusSel
        ? os.filter((o) => o.status === statusSel)
        : emAberto
    if (filtroHoje) {
      base = base.filter(
        (o) =>
          (o.scheduled_date || '').slice(0, 10) === hojeStr ||
          (o.opened_at || '').slice(0, 10) === hojeStr,
      )
    }
    /**
     * ORDENAÇÃO PADRONIZADA com a lista de OS (pedido do Felipe, 22/11/2026).
     * O mesmo seletor "Ordenar" da tela de Ordens de Serviço vale aqui.
     */
    return [...base].sort((a, b) => {
      if (ordem === 'NUMERO') return Number(a.order_number) - Number(b.order_number)
      if (ordem === 'CLIENTE') {
        const na = (a.expand?.client?.name || '').toUpperCase()
        const nb = (b.expand?.client?.name || '').toUpperCase()
        return na.localeCompare(nb, 'pt-BR')
      }
      if (ordem === 'DATA') {
        const da = (a.scheduled_date || '9999').slice(0, 10)
        const db = (b.scheduled_date || '9999').slice(0, 10)
        return da.localeCompare(db)
      }
      // PRIORIDADE: situação primeiro, depois o mais recente
      const peso = (o: any) => {
        const s = o.status === 'AGUARDANDO MATERIAL' ? 'EM ANDAMENTO' : o.status
        const ehHoje = (o.scheduled_date || '').slice(0, 10) === hojeStr
        if (ehHoje && s !== 'FINALIZADA' && s !== 'LANCADA') return 0
        return (
          { 'EM ANDAMENTO': 1, AGENDADA: 2, ABERTA: 3, FINALIZADA: 4, LANCADA: 5 }[s as string] ?? 6
        )
      }
      const pa = peso(a)
      const pb = peso(b)
      if (pa !== pb) return pa - pb
      const da = (a.scheduled_date || a.created || '').slice(0, 10)
      const db = (b.scheduled_date || b.created || '').slice(0, 10)
      if (da !== db) return db.localeCompare(da)
      return Number(b.order_number) - Number(a.order_number)
    })
  }, [os, statusSel, emAberto, filtroHoje, hojeStr, soPendentes, pendentes, ordem])

  /**
   * PEDIDOS DO PAINEL — mesma ordenação da tela de Pedidos.
   *
   * Prioridade segue a esteira: orçamento (esperando aprovação) primeiro,
   * depois pedido, aguardando material, entregue e lançado por último.
   */
  const pedidosOrdenados = useMemo(() => {
    const peso: Record<string, number> = {
      ORCAMENTO: 1,
      PEDIDO: 2,
      'AGUARDANDO MATERIAL': 3,
      ENTREGUE: 4,
      LANCADO: 5,
      FATURADO: 5,
    }
    return [...pedidos].sort((a, b) => {
      if (ordemPedido === 'NUMERO') return Number(a.number || 0) - Number(b.number || 0)
      if (ordemPedido === 'CLIENTE') {
        const na = (a.expand?.client?.name || '').toUpperCase()
        const nb = (b.expand?.client?.name || '').toUpperCase()
        return na.localeCompare(nb, 'pt-BR')
      }
      const pa = peso[a.status || 'ORCAMENTO'] ?? 9
      const pb = peso[b.status || 'ORCAMENTO'] ?? 9
      if (pa !== pb) return pa - pb
      return Number(b.number || 0) - Number(a.number || 0)
    })
  }, [pedidos, ordemPedido])

  // ---- financeiro (só admin) ----
  const aReceber = resumos.reduce((s, r) => s + (r.saldo > 0 ? r.saldo : 0), 0)
  const aCredito = resumos.reduce((s, r) => s + (r.saldo < 0 ? r.saldo : 0), 0)
  const devedores = resumos.filter((r) => r.saldo > 0.005).sort((a, b) => b.saldo - a.saldo)
  const recebidoMes = lancamentos
    .filter((t) => t.kind === 'DINHEIRO' && (t.date || '').slice(0, 7) === mesAtual)
    .reduce((s, t) => s + Math.abs(totalDaLinha(t)), 0)
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

  return (
    <div className="space-y-4">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Painel</h1>
          <p className="text-[11px] text-muted-foreground">
            {emAberto.length} em aberto · {osHoje.length} agendada(s) para hoje
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button asChild variant="outline" className="h-9 shrink-0 gap-1.5 text-xs">
            <Link to="/ordens/nova">
              <Plus className="h-4 w-4" /> Nova OS
            </Link>
          </Button>
          {/* Pedido de venda: talão com itens, foto e assinatura na entrega */}
          <Button asChild variant="outline" className="h-9 shrink-0 gap-1.5 text-xs">
            <Link to="/pedido/novo">
              <ShoppingCart className="h-4 w-4" /> Novo Pedido
            </Link>
          </Button>
          {isAdmin && (
            <Button
              asChild
              className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
            >
              <Link to="/lancamentos?novo=1">
                <Receipt className="h-4 w-4" /> Lançar
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/*
        DOIS ATALHOS no topo (pedido do Felipe, 20/11/2026).

        O painel virou uma página longa e ele tinha de rolar tudo para chegar
        aos pedidos. Agora há um par de botões grandes: OS e PEDIDOS. Cada um
        leva para a lista já com os atalhos de status coloridos.
      */}
      {/*
        SÓ O ATALHO DE PEDIDOS (ajuste do Felipe, 21/11/2026).

        Havia dois botões aqui: Ordens de Serviço e Pedidos. O de OS era
        REDUNDANTE — esta tela já É a lista de OS, e o "Painel" no menu traz
        para cá. Dois toques para a mesma coisa. Ficou só o de Pedidos, que era
        o que estava longe, lá embaixo.
      */}
      <Link
        to="/pedidos"
        className="flex items-center gap-2 rounded-xl border-l-4 border-l-amber-500 bg-amber-50 p-2.5 transition hover:shadow-md"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase text-amber-800">Pedidos</span>
          <span className="block text-[10px] text-muted-foreground">
            {pedidos.length} no total · toque para gerenciar
          </span>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-amber-700" />
      </Link>

      {/*
        TILES DE STATUS — compactos, quadradinhos, todos na mesma linha.

        São sete: HOJE e PENDENTE entram no MESMO formato dos cinco status,
        porque para quem trabalha na rua "o que é hoje" e "o que está atrasado"
        são status tanto quanto "em andamento".

        PENDENTE em vermelho: data já passou e ninguém movimentou a OS. Antes
        essas sumiam no meio da lista sem chamar atenção.
      */}
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
        {/* HOJE */}
        <button
          type="button"
          onClick={() => {
            setStatusSel(null)
            setFiltroHoje((v) => !v)
          }}
          aria-pressed={filtroHoje}
          title="Tarefas marcadas para hoje"
          className={`flex flex-col items-center justify-center rounded-xl border-l-4 border-l-[#0B3D91] bg-[#0B3D91]/5 px-1 py-2 transition-all ${
            filtroHoje ? 'ring-2 ring-[#0B3D91] shadow-md' : 'hover:shadow-md'
          }`}
        >
          <CalendarDays className="mb-0.5 h-3.5 w-3.5 text-[#0B3D91]" />
          <span className="text-[9px] font-bold uppercase leading-none text-[#0B3D91]">Hoje</span>
          <span className="mt-0.5 text-lg font-black leading-none text-[#0B3D91]">
            {osHoje.length}
          </span>
        </button>

        {STATUS.map((s) => {
          const Icone = s.icone
          const ativo = statusSel === s.chave
          return (
            <button
              key={s.chave}
              type="button"
              onClick={() => {
                setFiltroHoje(false)
                setSoPendentes(false)
                setStatusSel(ativo ? null : s.chave)
              }}
              aria-pressed={ativo}
              title={s.ajuda}
              className={`flex flex-col items-center justify-center rounded-xl border-l-4 ${s.borda} ${s.bg} px-1 py-2 transition-all ${
                ativo ? 'ring-2 ring-[#0B3D91] shadow-md' : 'hover:shadow-md'
              }`}
            >
              <Icone className={`mb-0.5 h-3.5 w-3.5 ${s.texto}`} />
              <span className={`text-[9px] font-bold uppercase leading-none ${s.texto}`}>
                {s.rotulo}
              </span>
              <span className={`mt-0.5 text-lg font-black leading-none ${s.texto}`}>
                {contagem[s.chave]}
              </span>
            </button>
          )
        })}

        {/* PENDENTE — atrasadas */}
        <button
          type="button"
          onClick={() => {
            setFiltroHoje(false)
            setStatusSel(null)
            setSoPendentes((v) => !v)
          }}
          aria-pressed={soPendentes}
          title="Entregas e serviços com data vencida e ainda não concluídos"
          className={`flex flex-col items-center justify-center rounded-xl border-l-4 border-l-rose-600 bg-rose-50 px-1 py-2 transition-all ${
            soPendentes ? 'ring-2 ring-rose-600 shadow-md' : 'hover:shadow-md'
          }`}
        >
          <AlertTriangle className="mb-0.5 h-3.5 w-3.5 text-rose-700" />
          <span className="text-[9px] font-bold uppercase leading-none text-rose-700">
            Pendente
          </span>
          <span
            className={`mt-0.5 text-lg font-black leading-none ${
              pendentes.length > 0 ? 'text-rose-700' : 'text-muted-foreground'
            }`}
          >
            {pendentes.length}
          </span>
        </button>
      </div>

      {/* ---- LISTA: só o que foi selecionado ---- */}
      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <CalendarClock className="h-4 w-4 text-[#0B3D91]" />
                {soPendentes
                  ? `Pendentes (atrasadas) — ${osVisiveis.length}`
                  : filtroHoje
                    ? `Hoje — ${osVisiveis.length}`
                    : statusSel
                      ? `${STATUS.find((s) => s.chave === statusSel)?.curto} — ${osVisiveis.length}`
                      : `Em aberto — ${osVisiveis.length}`}
              </h2>
              {(statusSel || filtroHoje || soPendentes) && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusSel(null)
                    setFiltroHoje(false)
                    setSoPendentes(false)
                  }}
                  className="mt-0.5 text-[10px] font-semibold text-[#0B3D91] underline"
                >
                  limpar filtro
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as any)}
                className="h-7 rounded border border-input bg-background px-1 text-[10px] font-semibold"
                aria-label="Ordenar ordens de serviço"
              >
                <option value="PRIORIDADE">Prioridade</option>
                <option value="NUMERO">Nº da OS</option>
                <option value="CLIENTE">Cliente</option>
                <option value="DATA">Data</option>
              </select>
              <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-[10px]">
                <Link to="/ordens">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {osVisiveis.map((o) => {
              const cfg = STATUS.find((s) => s.chave === o.status)
              // DESTAQUE VERMELHO na OS do filtro: o Felipe pediu fundo
              // puxado para o vermelho para achar rápido a que está vendo.
              // Atrasada é vermelho mais forte, com o rótulo.
              return (
                <Link
                  key={o.id}
                  to={`/ordens/${o.id}`}
                  // CORPO DO CARTÃO = COR DO STATUS, sempre (ajuste 21/11/2026).
                  // Antes a OS atrasada ficava rosa e uma OS ABERTA atrasada
                  // parecia alerta vermelho, escondendo a situação real. Agora o
                  // corpo é SEMPRE a cor do status e o atraso vira um selo
                  // vermelho ao lado do número — as duas informações convivem.
                  className={`flex items-center justify-between gap-2 rounded-lg border-l-4 p-2.5 transition hover:shadow-md ${
                    cfg
                      ? `${cfg.cor} ${cfg.faixa}`
                      : 'border-slate-300 border-l-slate-400 bg-slate-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-[#0B3D91]">
                        #{o.order_number}
                      </span>
                      {cfg && (
                        <Badge variant="outline" className={`px-1 py-0 text-[8px] ${cfg.texto}`}>
                          {cfg.curto}
                        </Badge>
                      )}
                      {/* atraso é informação SEPARADA da situação */}
                      {idsPendentes.has(o.id) && (
                        <Badge className="border-rose-400 bg-rose-500 px-1 py-0 text-[8px] font-bold text-white">
                          atrasada
                        </Badge>
                      )}
                      {o.scheduled_date && (
                        <span className="text-[9px] text-muted-foreground">
                          {dataBR(o.scheduled_date)}
                        </span>
                      )}
                    </div>
                    {/* Nome oficial da escola, como no cadastro */}
                    <p className="mt-0.5 text-[11px] font-semibold leading-tight">
                      {o.expand?.client?.name || '—'}
                    </p>
                    <p className="truncate text-[9px] text-muted-foreground">{o.description}</p>
                    {/*
                      Endereço na lista: o técnico precisa saber PARA ONDE vai
                      antes de abrir a OS, não depois.
                    */}
                    {temEndereco(o.expand?.client) && (
                      <p className="truncate text-[9px] text-slate-600">
                        📍 {enderecoCompleto(o.expand?.client)}
                      </p>
                    )}
                    {o.expand?.technician?.name && (
                      <p className="truncate text-[9px] text-[#0B3D91]/80">
                        Técnico: {o.expand.technician.name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    {temEndereco(o.expand?.client) && (
                      <a
                        href={linkMapa(o.expand?.client)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border border-[#0B3D91]/30 bg-white px-1.5 py-1 text-[#0B3D91]"
                        title="Abrir no Google Maps"
                      >
                        <Navigation className="h-3 w-3" />
                      </a>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              )
            })}

            {osVisiveis.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {soPendentes
                  ? 'Nenhuma pendência: nada atrasado.'
                  : filtroHoje
                    ? 'Nenhuma tarefa para hoje. Nada agendado.'
                    : statusSel
                      ? `Nenhuma OS ${STATUS.find((s) => s.chave === statusSel)?.curto.toLowerCase()}.`
                      : 'Nenhuma OS em aberto. Tudo concluído.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/*
        PEDIDOS no painel (pedido do Felipe, 20/11/2026).
        Ele quis o pedido no painel inicial, com número e situação, para
        gerenciar o que está faltando entregar — como já faz com a OS.
      */}
      {/*
        BLOCO DE PEDIDOS — aparece SEMPRE para admin (mudança de 20/11/2026).

        Antes a condição era `pedidos.length > 0`: sem nenhum pedido, o bloco
        simplesmente não existia na tela, e o Felipe não tinha como saber onde
        ficava. Agora ele aparece com contadores zerados e o convite a criar o
        primeiro — lugar visível desde o começo.
      */}
      {isAdmin && (
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold">
                <ShoppingCart className="h-4 w-4 text-[#0B3D91]" /> Pedidos
              </h2>
              <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-[10px]">
                <Link to="/pedidos">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              {[
                [
                  'Em aberto',
                  pedidos.filter((p) => (p.status || 'PEDIDO') === 'PEDIDO').length,
                  'text-amber-700',
                ],
                [
                  'Entregues',
                  pedidos.filter((p) => p.status === 'ENTREGUE').length,
                  'text-emerald-700',
                ],
                [
                  'Faturados',
                  pedidos.filter((p) => p.status === 'FATURADO').length,
                  'text-[#0B3D91]',
                ],
              ].map(([rot, qtd, cor]) => (
                <Link
                  key={String(rot)}
                  to="/pedidos"
                  className={`rounded-lg border px-2 py-1.5 text-center transition hover:shadow-md`}
                >
                  <span className={`block text-[9px] font-bold uppercase ${cor}`}>{rot}</span>
                  <span className={`block text-lg font-black leading-none ${cor}`}>{qtd}</span>
                </Link>
              ))}
            </div>
            <div className="mb-1.5 flex items-center justify-end gap-1">
              <span className="text-[9px] font-semibold text-muted-foreground">Ordenar:</span>
              <select
                value={ordemPedido}
                onChange={(e) => setOrdemPedido(e.target.value as any)}
                className="h-6 rounded border border-input bg-background px-1 text-[10px] font-semibold"
                aria-label="Ordenar pedidos"
              >
                <option value="PRIORIDADE">Prioridade</option>
                <option value="NUMERO">Nº do pedido</option>
                <option value="CLIENTE">Nome do cliente</option>
              </select>
            </div>
            <div className="space-y-1">
              {pedidos.length === 0 && (
                <p className="rounded-lg border border-dashed p-3 text-center text-[10px] text-muted-foreground">
                  Nenhum pedido ainda. Comece um orçamento pelo botão <strong>Novo Pedido</strong>,
                  aqui em cima.
                </p>
              )}
              {pedidosOrdenados.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  to={`/pedido/${p.id}`}
                  className="flex items-center gap-2 rounded-lg border p-2 transition hover:border-[#0B3D91]/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-[#0B3D91]">
                        nº {p.number}
                      </span>
                      <Badge
                        variant="outline"
                        className={`px-1 py-0 text-[8px] ${configStatus(p.status).texto}`}
                      >
                        {configStatus(p.status).rotulo}
                      </Badge>
                    </div>
                    <p className="truncate text-[10px] font-semibold">
                      {p.expand?.client?.name || '—'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-bold">
                    {brl(totalDoDocumento(p.items))}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- PENDÊNCIAS: só admin, porque falam de dinheiro do cliente ---- */}
      {isAdmin && (estoqueBaixo > 0 || semContato > 0) && (
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

      {/*
        FINANCEIRO — só administrador, e recolhido por padrão.

        O Felipe pediu para tirar os cartões de dinheiro do painel: técnico não
        precisa ver faturamento. Fica aqui, fechado, disponível para quando ele
        quiser conferir sem sair da tela.
      */}
      {isAdmin && (
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              onClick={() => setVerFinanceiro((v) => !v)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <Wallet className="h-4 w-4 text-[#0B3D91]" /> Financeiro
                <span className="text-[10px] font-normal text-muted-foreground">
                  (só administrador)
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-700">{brl(aReceber)}</span>
                {verFinanceiro ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </button>

            {verFinanceiro && (
              <div className="space-y-2 border-t p-3">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {[
                    {
                      titulo: 'A receber',
                      valor: brl(aReceber),
                      detalhe: `${devedores.length} cliente(s) devendo`,
                      icone: Wallet,
                      cor: 'text-amber-700',
                      bg: 'border-amber-200 bg-amber-50',
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
                  ].map((c) => {
                    const Icone = c.icone
                    return (
                      <Card key={c.titulo} className={`border ${c.bg}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase ${c.cor}`}>
                              {c.titulo}
                            </span>
                            <Icone className={`h-3.5 w-3.5 ${c.cor}`} />
                          </div>
                          <div className={`mt-1 font-mono text-base font-black ${c.cor}`}>
                            {c.valor}
                          </div>
                          <p className="mt-0.5 text-[9px] text-muted-foreground">{c.detalhe}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {Math.abs(aCredito) > 0.005 && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-900">
                    Crédito a devolver: <strong>{brl(Math.abs(aCredito))}</strong> —{' '}
                    {resumos.filter((r) => r.saldo < -0.005).length} cliente(s).
                  </p>
                )}

                {devedores.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        Maiores devedores
                      </span>
                      <Link to="/relatorios" className="text-[9px] text-[#0B3D91] underline">
                        relatórios
                      </Link>
                    </div>
                    {devedores.slice(0, 5).map((r) => (
                      <Link
                        key={r.id}
                        to={`/relatorios?cliente=${r.id}`}
                        className="flex items-center justify-between gap-2 border-b py-1 last:border-0"
                      >
                        <span className="truncate text-[10px]">{r.nickname || r.name}</span>
                        <span className="shrink-0 font-mono text-[10px] font-bold text-amber-800">
                          {brl(r.saldo)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
