/**
 * Estoque — o que tem, o que está acabando e o que aconteceu.
 *
 * Três perguntas que a tela resolve:
 *   1. o que está abaixo do mínimo (precisa comprar);
 *   2. quanto tem de cada produto (saldo e valor em custo);
 *   3. por que o saldo mudou (histórico de entradas, saídas da OS e ajustes).
 *
 * O valor do estoque usa o CUSTO, não o preço de venda — estoque é dinheiro
 * parado, e o que saiu do caixa foi o custo.
 */
import { useEffect, useMemo, useState } from 'react'
import { getMaterials } from '@/services/api'
import { movimentar, movimentosDoMaterial, type Movimento, type TipoMovimento } from '@/lib/estoque'
import type { Material } from '@/types/flservicos'
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
import {
  Loader2,
  Search,
  Package,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Settings2,
  History,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

const POR_PAGINA = 25

const TIPOS: Record<TipoMovimento, { label: string; icone: any; cor: string }> = {
  ENTRADA: { label: 'Entrada', icone: ArrowUpCircle, cor: 'text-emerald-700' },
  SAIDA: { label: 'Saída (OS)', icone: ArrowDownCircle, cor: 'text-rose-700' },
  AJUSTE: { label: 'Ajuste', icone: Settings2, cor: 'text-blue-700' },
  PERDA: { label: 'Perda', icone: AlertTriangle, cor: 'text-amber-700' },
}

export default function EstoquePage() {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'TODOS' | 'BAIXO' | 'CONTROLADO'>('BAIXO')
  const [pagina, setPagina] = useState(1)

  const [movDe, setMovDe] = useState<Material | null>(null)
  const [historicoDe, setHistoricoDe] = useState<Material | null>(null)
  const [historico, setHistorico] = useState<Movimento[]>([])
  const [carregandoHist, setCarregandoHist] = useState(false)

  const [tipo, setTipo] = useState<TipoMovimento>('ENTRADA')
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      setMateriais(await getMaterials())
    } catch {
      toast.error('Não foi possível carregar o estoque.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const norm = (s?: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const controlados = materiais.filter((m) => (m as any).control_stock)
  const abaixoMinimo = controlados.filter(
    (m) =>
      Number((m as any).stock_min || 0) > 0 &&
      Number(m.current_stock || 0) < Number((m as any).stock_min || 0),
  )

  /** valor parado em estoque, pelo CUSTO */
  const valorEstoque = controlados.reduce(
    (s, m) => s + Number(m.current_stock || 0) * Number(m.cost || 0),
    0,
  )

  const filtrados = useMemo(() => {
    const t = norm(busca)
    return materiais.filter((m) => {
      const ctrl = !!(m as any).control_stock
      if (filtro === 'BAIXO') {
        if (!ctrl) return false
        const min = Number((m as any).stock_min || 0)
        if (min <= 0 || Number(m.current_stock || 0) >= min) return false
      }
      if (filtro === 'CONTROLADO' && !ctrl) return false
      if (!t) return true
      return norm(m.name).includes(t) || norm(m.category).includes(t)
    })
  }, [materiais, busca, filtro])

  const listados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))

  const abrirMovimento = (m: Material, t: TipoMovimento = 'ENTRADA') => {
    setMovDe(m)
    setTipo(t)
    setQtd(t === 'AJUSTE' ? String(m.current_stock ?? 0) : '')
    setMotivo('')
  }

  const abrirHistorico = async (m: Material) => {
    setHistoricoDe(m)
    setCarregandoHist(true)
    try {
      setHistorico(await movimentosDoMaterial(m.id))
    } finally {
      setCarregandoHist(false)
    }
  }

  const salvar = async () => {
    if (!movDe) return
    const n = Number(String(qtd).replace(',', '.'))
    if (isNaN(n) || (tipo !== 'AJUSTE' && n <= 0)) {
      toast.error('Informe a quantidade.')
      return
    }
    setSalvando(true)
    try {
      const r = await movimentar({
        materialId: movDe.id,
        type: tipo,
        quantity: n,
        saldoAtual: Number(movDe.current_stock || 0),
        reason: motivo.trim(),
      })
      if (r.ficouNegativo) {
        toast.warning(
          `Saldo ficou negativo (${r.saldo}). O material saiu em quantidade maior que o estoque — confira.`,
          { duration: 6000 },
        )
      } else {
        toast.success(`Saldo agora: ${r.saldo} ${movDe.unit}.`)
      }
      setMovDe(null)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível movimentar.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Estoque</h1>
        <p className="text-[11px] text-muted-foreground">
          {controlados.length} produto(s) controlado(s) · {abaixoMinimo.length} abaixo do mínimo
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-rose-700">Abaixo mín.</span>
              <AlertTriangle className="h-3 w-3 text-rose-700" />
            </div>
            <span className="font-mono text-xs font-black text-rose-700">
              {abaixoMinimo.length}
            </span>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-blue-700">Controlados</span>
              <Package className="h-3 w-3 text-blue-700" />
            </div>
            <span className="font-mono text-xs font-black text-blue-700">{controlados.length}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-emerald-700">Em estoque</span>
              <Wallet className="h-3 w-3 text-emerald-700" />
            </div>
            <span className="font-mono text-xs font-black text-emerald-700">
              {brl(valorEstoque)}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
          placeholder="Buscar produto..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['BAIXO', `Abaixo do mínimo (${abaixoMinimo.length})`],
          ['CONTROLADO', `Controlados (${controlados.length})`],
          ['TODOS', 'Todos'],
        ].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => {
              setFiltro(v as any)
              setPagina(1)
            }}
            className={`h-7 text-[10px] ${filtro === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      {filtro === 'BAIXO' && abaixoMinimo.length === 0 && controlados.length > 0 && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-900">
          Nenhum produto abaixo do mínimo. Estoque em dia.
        </p>
      )}

      {filtro === 'BAIXO' && controlados.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
          Nenhum produto com controle de estoque ligado ainda. Ligue em{' '}
          <strong>Custos e margem</strong> → Estoque, no produto que você quer acompanhar.
        </p>
      )}

      <div className="space-y-1.5">
        {listados.map((m) => {
          const min = Number((m as any).stock_min || 0)
          const saldo = Number(m.current_stock || 0)
          const baixo = (m as any).control_stock && min > 0 && saldo < min
          return (
            <Card key={m.id} className={baixo ? 'border-rose-300' : ''}>
              <CardContent className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold">{m.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {m.category} · custo {brl(Number(m.cost || 0))}
                      {min > 0 && ` · mínimo ${min}`}
                    </p>
                  </div>
                  {baixo && (
                    <Badge className="shrink-0 border-rose-300 bg-rose-100 px-1.5 py-0 text-[8px] text-rose-800">
                      baixo
                    </Badge>
                  )}
                  <div className="shrink-0 text-right">
                    <span
                      className={`block font-mono text-sm font-black ${
                        saldo < 0 ? 'text-rose-700' : baixo ? 'text-rose-700' : 'text-[#0B3D91]'
                      }`}
                    >
                      {saldo}
                    </span>
                    <span className="block text-[8px] text-muted-foreground">{m.unit}</span>
                  </div>
                </div>
                <div className="flex gap-1 border-t pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirMovimento(m, 'ENTRADA')}
                    className="h-6 flex-1 gap-1 text-[9px] text-emerald-700"
                  >
                    <ArrowUpCircle className="h-2.5 w-2.5" /> Entrada
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirMovimento(m, 'AJUSTE')}
                    className="h-6 flex-1 gap-1 text-[9px] text-blue-700"
                  >
                    <Settings2 className="h-2.5 w-2.5" /> Ajuste
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => abrirHistorico(m)}
                    className="h-6 gap-1 px-1.5 text-[9px] text-muted-foreground"
                    aria-label="Histórico"
                  >
                    <History className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {listados.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhum produto neste filtro</p>
          </div>
        )}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-between px-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="h-7 text-[10px]"
          >
            Anterior
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {pagina} de {paginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="h-7 text-[10px]"
          >
            Próxima
          </Button>
        </div>
      )}

      {/* ---- movimentar ---- */}
      <Dialog open={!!movDe} onOpenChange={(v) => !v && setMovDe(null)}>
        <DialogContent className="w-[94vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Movimentar estoque</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] font-semibold text-muted-foreground">{movDe?.name}</p>
          <p className="text-[10px] text-muted-foreground">
            Saldo atual:{' '}
            <strong>
              {Number(movDe?.current_stock || 0)} {movDe?.unit}
            </strong>
          </p>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo</Label>
              <div className="grid grid-cols-2 gap-1">
                {(['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA'] as TipoMovimento[]).map((t) => {
                  const I = TIPOS[t].icone
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-[10px] font-semibold ${
                        tipo === t
                          ? 'border-[#0B3D91] bg-[#0B3D91] text-white'
                          : 'bg-white hover:border-[#0B3D91]/50'
                      }`}
                    >
                      <I className="h-3 w-3" /> {TIPOS[t].label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                {tipo === 'AJUSTE' ? 'Saldo contado (novo saldo)' : 'Quantidade'}
              </Label>
              <Input
                inputMode="decimal"
                value={qtd}
                onChange={(e) => setQtd(e.target.value)}
                placeholder="0"
                className="h-9 text-xs"
              />
              {tipo === 'AJUSTE' && (
                <p className="text-[9px] text-muted-foreground">
                  Informe quanto tem de verdade após a contagem.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Motivo (opcional)</Label>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Compra fornecedor / inventário / avaria"
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMovDe(null)}
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
                <Package className="h-3.5 w-3.5" />
              )}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- histórico ---- */}
      <Dialog open={!!historicoDe} onOpenChange={(v) => !v && setHistoricoDe(null)}>
        <DialogContent className="max-h-[85dvh] w-[94vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Histórico</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] font-semibold text-muted-foreground">{historicoDe?.name}</p>

          {carregandoHist ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </div>
          ) : historico.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Nenhuma movimentação registrada ainda.
            </p>
          ) : (
            <div className="space-y-1">
              {historico.map((h) => {
                const cfg = TIPOS[h.type] || TIPOS.AJUSTE
                const I = cfg.icone
                return (
                  <div key={h.id} className="flex items-start gap-2 border-b py-1.5 last:border-0">
                    <I className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cfg.cor}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold">
                        {cfg.label} · {Number(h.quantity)}
                        {h.balance_after !== undefined && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            → saldo {Number(h.balance_after)}
                          </span>
                        )}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {dataBR(h.date || h.created)} · {h.user_name || '—'}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
