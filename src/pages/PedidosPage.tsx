/**
 * Lista de pedidos — o que foi vendido, para reabrir e reimprimir.
 *
 * Antes só existia a criação (`/pedido/novo`): o pedido era salvo e sumia de
 * vista, sem lugar para consultar. Aqui ficam todos, com busca por cliente e
 * atalho para abrir o talão de novo.
 *
 * Valores só aparecem para administrador — mesma regra do pedido.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuotes, totalDoDocumento } from '@/services/crm'
import type { Quote } from '@/types/crm'
import { brl, dataBR } from '@/types/crm'
import { STATUS_PEDIDO, configStatus } from '@/lib/pedidoStatus'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react'
import { useViewMode, ViewModeSelector } from '@/components/ViewModeSelector'

export default function PedidosPage() {
  const { isAdmin } = useAuth()
  const [pedidos, setPedidos] = useState<Quote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<string>('TODOS')
  const [modo, setModo] = useViewMode('pedidos')

  useEffect(() => {
    ;(async () => {
      try {
        setPedidos(await getQuotes())
      } catch {
        /* a lista avisa vazia */
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const norm = (s?: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  /** ordenação dentro de cada grupo (pedido do Felipe, 21/11/2026) */
  const [ordem, setOrdem] = useState<'PRIORIDADE' | 'NUMERO' | 'CLIENTE'>('PRIORIDADE')

  const lista = useMemo(() => {
    const t = norm(busca)
    return pedidos.filter((p) => {
      if (filtro !== 'TODOS') {
        const st = p.status || 'ORCAMENTO'
        // pedidos antigos gravados como FATURADO contam como LANÇADO
        const bate = st === filtro || (filtro === 'LANCADO' && st === 'FATURADO')
        if (!bate) return false
      }
      if (!t) return true
      const nome = norm(p.expand?.client?.name)
      const apel = norm((p.expand?.client as any)?.nickname)
      return nome.includes(t) || apel.includes(t)
    })
  }, [pedidos, busca, filtro])

  /**
   * MESMA LÓGICA DA OS, aplicada ao pedido.
   *
   * A esteira já tem ordem de prioridade: orçamento (esperando o cliente
   * aprovar) → pedido (aprovado, comprar) → aguardando material (encomendado)
   * → entregue → lançado. A lista segue essa ordem, agrupada, para ele ver de
   * cima o que trava o negócio.
   */
  const compararPedido = (a: Quote, b: Quote) => {
    if (ordem === 'NUMERO') return Number(a.number || 0) - Number(b.number || 0)
    if (ordem === 'CLIENTE') {
      const na = (a.expand?.client?.name || '').toUpperCase()
      const nb = (b.expand?.client?.name || '').toUpperCase()
      return na.localeCompare(nb, 'pt-BR')
    }
    // prioridade: o mais recente primeiro dentro do grupo
    return Number(b.number || 0) - Number(a.number || 0)
  }

  const gruposPedido = STATUS_PEDIDO.map((s) => ({
    ...s,
    itens: lista
      .filter(
        (p) =>
          (p.status || 'ORCAMENTO') === s.chave ||
          (s.chave === 'LANCADO' && p.status === 'FATURADO'),
      )
      .sort(compararPedido),
  })).filter((g) => g.itens.length > 0)

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* voltar para o painel sem passar pelo menu */}
      <button
        type="button"
        onClick={() =>
          window.history.length > 1 ? window.history.back() : (window.location.href = '/')
        }
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B3D91] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Pedidos</h1>
          <p className="text-[11px] text-muted-foreground">
            {pedidos.length} pedido(s) · toque para abrir e reimprimir
          </p>
        </div>
        <Button
          asChild
          className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
        >
          <Link to="/pedido/novo">
            <Plus className="h-4 w-4" /> Novo pedido
          </Link>
        </Button>
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

      {/*
        ATALHOS DE STATUS COLORIDOS (pedido do Felipe, 20/11/2026).
        Cada etapa da esteira tem sua cor, e o MESMO esquema pinta o cartão do
        pedido na lista — ele bate o olho e sabe em que pé está.
        Tocar no atalho filtra; tocar de novo volta para todos.
      */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => setFiltro('TODOS')}
          className={`flex flex-col items-center justify-center rounded-xl border-l-4 border-l-slate-500 bg-slate-50 px-1 py-2 transition-all ${
            filtro === 'TODOS' ? 'ring-2 ring-slate-700 shadow-md' : 'hover:shadow-md'
          }`}
        >
          <span className="text-[9px] font-bold uppercase leading-none text-slate-700">Todos</span>
          <span className="mt-0.5 text-lg font-black leading-none text-slate-800">
            {pedidos.length}
          </span>
        </button>

        {STATUS_PEDIDO.map((s) => {
          const ativo = filtro === s.chave
          const qtd = pedidos.filter(
            (p) =>
              (p.status || 'ORCAMENTO') === s.chave ||
              (s.chave === 'LANCADO' && p.status === 'FATURADO'),
          ).length
          return (
            <button
              key={s.chave}
              type="button"
              onClick={() => setFiltro(ativo ? 'TODOS' : (s.chave as any))}
              title={s.ajuda}
              className={`flex flex-col items-center justify-center rounded-xl border-l-4 px-1 py-2 transition-all ${s.cor} ${
                ativo ? 'ring-2 ring-slate-700 shadow-md' : 'hover:shadow-md'
              }`}
            >
              <span className={`text-[9px] font-bold uppercase leading-none ${s.texto}`}>
                {s.rotulo}
              </span>
              <span className={`mt-0.5 text-lg font-black leading-none ${s.texto}`}>{qtd}</span>
            </button>
          )
        })}
      </div>

      {/* ordenação dentro dos grupos */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground">Ordenar:</span>
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as any)}
          className="h-8 rounded-md border border-input bg-background px-1.5 text-[11px] font-semibold shadow-sm"
          aria-label="Ordenar pedidos"
        >
          <option value="PRIORIDADE">Prioridade</option>
          <option value="NUMERO">Nº do pedido</option>
          <option value="CLIENTE">Nome do cliente</option>
        </select>
        <ViewModeSelector valor={modo} onChange={setModo} className="ml-auto" />
      </div>

      {modo === 'cartoes' ? (
        <div className="space-y-4">
          {gruposPedido.map((g) => (
            <div key={g.chave} className="space-y-1.5">
              {/* cabeçalho do grupo, com a cor da etapa */}
              <div
                className={`flex items-center justify-between rounded-lg border-l-4 px-3 py-1.5 ${g.cor}`}
              >
                <h2 className={`text-[11px] font-black uppercase tracking-wide ${g.texto}`}>
                  {g.rotulo} <span className="font-bold opacity-70">({g.itens.length})</span>
                </h2>
              </div>

              {g.itens.map((p) => {
                const itens = p.items || []
                const total = totalDoDocumento(itens)
                const cfg = configStatus(p.status)
                return (
                  <Link key={p.id} to={`/pedido/${p.id}`} className="block">
                    {/* a cor do cartão é a do status: bate o olho e já sabe a etapa */}
                    <Card className={`border-l-4 ${cfg.cor}`}>
                      <CardContent className="flex items-center gap-2 p-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`px-1.5 py-0 text-[8px] ${cfg.texto}`}
                            >
                              {cfg.rotulo}
                            </Badge>
                            {p.number ? (
                              <span className="font-mono text-[10px] font-bold text-[#0B3D91]">
                                nº {p.number}
                              </span>
                            ) : null}
                            <span className="text-[9px] text-muted-foreground">
                              {dataBR(p.date)}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              · {itens.length} item(ns)
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] font-semibold leading-tight">
                            {p.expand?.client?.name || '—'}
                          </p>
                          {p.delivered_by_name && (
                            <p className="truncate text-[9px] text-muted-foreground">
                              Entregue por {p.delivered_by_name}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {isAdmin && (
                            <span className="block font-mono text-xs font-bold text-[#0B3D91]">
                              {brl(total)}
                            </span>
                          )}
                          <ArrowRight className="mt-0.5 ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ))}

          {lista.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center">
              <ShoppingCart className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold">
                {pedidos.length === 0 ? 'Nenhum pedido ainda' : 'Nada neste filtro'}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {pedidos.length === 0
                  ? 'Crie o primeiro pelo botão "Novo pedido".'
                  : 'Tente outro termo de busca.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* LISTA e LISTA COMPACTA: linhas simples agrupadas pela mesma esteira */
        <div className="space-y-4">
          {gruposPedido.map((g) => (
            <div key={g.chave} className="space-y-1">
              <div
                className={`flex items-center justify-between rounded-lg border-l-4 px-3 py-1.5 ${g.cor}`}
              >
                <h2 className={`text-[11px] font-black uppercase tracking-wide ${g.texto}`}>
                  {g.rotulo} <span className="font-bold opacity-70">({g.itens.length})</span>
                </h2>
              </div>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {g.itens.map((p) => {
                  const compacto = modo === 'compacta'
                  return (
                    <Link
                      key={p.id}
                      to={`/pedido/${p.id}`}
                      className={`flex items-center gap-2 px-3 ${compacto ? 'min-h-[44px] py-1.5' : 'min-h-[44px] py-2.5'}`}
                    >
                      {p.number ? (
                        <span className="w-14 shrink-0 font-mono text-[10px] font-bold text-[#0B3D91]">
                          nº {p.number}
                        </span>
                      ) : (
                        <span className="w-14 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold leading-tight">
                          {p.expand?.client?.name || '—'}
                        </p>
                        {!compacto && (
                          <p className="truncate text-[9px] text-muted-foreground">
                            {configStatus(p.status).rotulo} · {dataBR(p.date)} ·{' '}
                            {(p.items || []).length} item(ns)
                            {p.delivered_by_name ? ` · entregue por ${p.delivered_by_name}` : ''}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <span className="shrink-0 font-mono text-xs font-bold text-[#0B3D91]">
                          {brl(totalDoDocumento(p.items || []))}
                        </span>
                      )}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          {lista.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center">
              <ShoppingCart className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-semibold">
                {pedidos.length === 0 ? 'Nenhum pedido ainda' : 'Nada neste filtro'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
