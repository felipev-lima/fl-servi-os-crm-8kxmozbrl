/**
 * Custos, margem e estoque — a tela de trabalho do Felipe.
 *
 * O objetivo é ele conseguir ajustar item por item, conforme vai achando os
 * produtos: pesquisa, digita o custo real na própria linha, a margem aparece
 * na hora e salva ao sair do campo. Sem abrir e fechar janela a cada produto.
 *
 * Três filtros pensados para esse trabalho:
 *   SEM_CUSTO        produtos sem preço (precisam de preço primeiro)
 *   ESTIMADO         os 942 calculados pela marcação de 60% — a fila de conferência
 *   CONFERIDO        já ajustados por ele, número confiável
 *
 * Regra que não pode ser violada: onde não há custo, a margem NÃO é calculada.
 * Mostrar 100% de lucro num item sem custo informado é mentira.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { getMaterials, updateMaterial } from '@/services/api'
import type { Material } from '@/types/flservicos'
import { brl } from '@/types/crm'
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
  Save,
  Package,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

const POR_PAGINA = 30
/** Marcação usada no cálculo automático: preço = custo × 1,6 (60% sobre o custo) */
const MARCACAO = 1.6

type Filtro = 'SEM_PRECO' | 'ESTIMADO' | 'CONFERIDO' | 'TODOS'

export default function CustosPage() {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('ESTIMADO')
  const [pagina, setPagina] = useState(1)

  /** valores digitados por linha, antes de salvar */
  const [rascunho, setRascunho] = useState<Record<string, { cost?: string; price?: string }>>({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  // diálogo para o estoque (menos usado, cabe numa janela)
  const [estoqueDe, setEstoqueDe] = useState<Material | null>(null)
  const [estoque, setEstoque] = useState('')
  const [minimo, setMinimo] = useState('')
  const [controlar, setControlar] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const focoRef = useRef<string | null>(null)

  const carregar = async () => {
    setCarregando(true)
    try {
      setMateriais(await getMaterials())
    } catch {
      toast.error('Não foi possível carregar o catálogo.')
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

  const semPreco = materiais.filter((m) => Number(m.price || 0) <= 0)
  const comCusto = materiais.filter((m) => Number(m.cost || 0) > 0)
  const estimados = materiais.filter((m) => Number(m.cost || 0) > 0 && (m as any).cost_estimated)
  const conferidos = materiais.filter((m) => Number(m.cost || 0) > 0 && !(m as any).cost_estimated)
  const cobertura = materiais.length ? (comCusto.length / materiais.length) * 100 : 0

  /** Margem média só sobre os itens com custo — nunca extrapolada */
  const margemMedia = useMemo(() => {
    const validos = comCusto.filter((m) => Number(m.price || 0) > 0)
    if (!validos.length) return 0
    return (
      validos.reduce(
        (s, m) => s + ((Number(m.price || 0) - Number(m.cost || 0)) / Number(m.price || 1)) * 100,
        0,
      ) / validos.length
    )
  }, [comCusto])

  const filtrados = useMemo(() => {
    const t = norm(busca)
    return materiais.filter((m) => {
      const preco = Number(m.price || 0)
      const custo = Number(m.cost || 0)
      const est = !!(m as any).cost_estimated
      if (filtro === 'SEM_PRECO' && preco > 0) return false
      if (filtro === 'ESTIMADO' && !(custo > 0 && est)) return false
      if (filtro === 'CONFERIDO' && !(custo > 0 && !est)) return false
      if (!t) return true
      return norm(m.name).includes(t) || norm(m.category).includes(t) || norm(m.brand).includes(t)
    })
  }, [materiais, busca, filtro, comCusto])

  const listados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))

  const valorDe = (m: Material, campo: 'cost' | 'price'): string => {
    const r = rascunho[m.id]
    if (r && r[campo] !== undefined) return r[campo] as string
    const v = Number((m as any)[campo] || 0)
    return v > 0 ? String(v) : ''
  }

  const digitar = (id: string, campo: 'cost' | 'price', valor: string) => {
    setRascunho((r) => ({ ...r, [id]: { ...(r[id] || {}), [campo]: valor } }))
  }

  /**
   * Salva ao sair do campo.
   *
   * É o que torna a conferência rápida: digita o custo, toca no próximo
   * produto e o anterior já gravou. O item deixa de ser "estimado" e passa a
   * "conferido" — o número agora é do Felipe, não da conta de marcação.
   */
  const salvarLinha = async (m: Material) => {
    const r = rascunho[m.id]
    if (!r) return
    const custoNum =
      r.cost !== undefined ? Number(String(r.cost).replace(',', '.')) || 0 : Number(m.cost || 0)
    const precoNum =
      r.price !== undefined ? Number(String(r.price).replace(',', '.')) || 0 : Number(m.price || 0)

    if (custoNum === Number(m.cost || 0) && precoNum === Number(m.price || 0)) {
      setRascunho((x) => {
        const c = { ...x }
        delete c[m.id]
        return c
      })
      return
    }

    setSalvandoId(m.id)
    try {
      await updateMaterial(m.id, {
        cost: custoNum,
        price: precoNum,
        cost_estimated: false,
      } as any)
      setMateriais((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? ({ ...x, cost: custoNum, price: precoNum, cost_estimated: false } as any)
            : x,
        ),
      )
      setRascunho((x) => {
        const c = { ...x }
        delete c[m.id]
        return c
      })
      toast.success('Salvo.', { duration: 1200 })
    } catch {
      toast.error('Não foi possível salvar este item.')
    } finally {
      setSalvandoId(null)
    }
  }

  /** Aplica a marcação de 60% nos que ficaram sem custo e têm preço */
  const aplicarMarcacao = async () => {
    const alvos = materiais.filter((m) => Number(m.price || 0) > 0 && Number(m.cost || 0) <= 0)
    if (alvos.length === 0) {
      toast.info('Nenhum produto sem custo para calcular.')
      return
    }
    if (
      !confirm(
        `Calcular o custo de ${alvos.length} produto(s) pela marcação de 60%?\n\n` +
          'Custo = preço ÷ 1,6. Depois você confere e ajusta um por um.',
      )
    )
      return
    setCarregando(true)
    try {
      let ok = 0
      for (const m of alvos) {
        const c = Math.round((Number(m.price) / MARCACAO) * 100) / 100
        await updateMaterial(m.id, { cost: c, cost_estimated: true } as any)
        ok++
      }
      toast.success(`${ok} custo(s) calculado(s).`)
      void carregar()
    } catch {
      toast.error('Falhou em parte do cálculo. Rode de novo.')
      void carregar()
    } finally {
      setCarregando(false)
    }
  }

  const abrirEstoque = (m: Material) => {
    setEstoqueDe(m)
    setEstoque(String((m as any).current_stock ?? ''))
    setMinimo(String((m as any).stock_min ?? ''))
    setControlar(!!(m as any).control_stock)
  }

  const salvarEstoque = async () => {
    if (!estoqueDe) return
    setSalvando(true)
    try {
      const dados: any = {
        current_stock: Number(String(estoque).replace(',', '.')) || 0,
        stock_min: Number(String(minimo).replace(',', '.')) || 0,
        control_stock: controlar,
      }
      await updateMaterial(estoqueDe.id, dados)
      setMateriais((prev) =>
        prev.map((x) => (x.id === estoqueDe.id ? ({ ...x, ...dados } as any) : x)),
      )
      setEstoqueDe(null)
      toast.success('Estoque atualizado.')
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const margemCalculada = (m: Material) => {
    const p = Number(valorDe(m, 'price') || 0)
    const c = Number(valorDe(m, 'cost') || 0)
    if (p <= 0 || c <= 0) return null
    return ((p - c) / p) * 100
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Custos e margem</h1>
          <p className="text-[11px] text-muted-foreground">
            {conferidos.length} conferido(s) · {estimados.length} estimado(s) · {semPreco.length}{' '}
            sem preço
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={aplicarMarcacao}
          className="h-8 shrink-0 gap-1 text-[10px]"
          title="Calcula custo = preço ÷ 1,6 nos produtos que ainda não têm custo"
        >
          <Wand2 className="h-3 w-3" /> Marcação 60%
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-blue-700">Cobertura</span>
              <Package className="h-3 w-3 text-blue-700" />
            </div>
            <span className="font-mono text-xs font-black text-blue-700">
              {cobertura.toFixed(0)}%
            </span>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-emerald-700">Margem</span>
              <TrendingUp className="h-3 w-3 text-emerald-700" />
            </div>
            <span className="font-mono text-xs font-black text-emerald-700">
              {margemMedia.toFixed(1)}%
            </span>
          </CardContent>
        </Card>
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-sky-700">Conferidos</span>
              <CheckCircle2 className="h-3 w-3 text-sky-700" />
            </div>
            <span className="font-mono text-xs font-black text-sky-700">{conferidos.length}</span>
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
          placeholder="Buscar produto, categoria ou marca..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['ESTIMADO', `A conferir (${estimados.length})`],
          ['CONFERIDO', `Conferidos (${conferidos.length})`],
          ['SEM_PRECO', `Sem preço (${semPreco.length})`],
          ['TODOS', `Todos (${materiais.length})`],
        ].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => {
              setFiltro(v as Filtro)
              setPagina(1)
            }}
            className={`h-7 text-[10px] ${filtro === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      {filtro === 'SEM_PRECO' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
          Estes produtos nunca tiveram preço de venda. Digite o preço que o custo pode ser calculado
          — ou os dois, se você já sabe.
        </p>
      )}

      {filtro === 'ESTIMADO' && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] text-sky-900">
          Custo <strong>calculado</strong> pela marcação de 60% (preço ÷ 1,6). Digite o custo real
          na linha e o item passa a <strong>conferido</strong> sozinho.
        </p>
      )}

      <div className="space-y-1.5">
        {listados.map((m) => {
          const mg = margemCalculada(m)
          const est = !!(m as any).cost_estimated && Number(m.cost || 0) > 0
          const salvandoEsta = salvandoId === m.id
          return (
            <Card key={m.id} className={salvandoEsta ? 'border-[#0B3D91]' : ''}>
              <CardContent className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold">{m.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {m.category} · {m.unit}
                    </p>
                  </div>
                  {salvandoEsta && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B3D91]" />}
                  {est && !salvandoEsta && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-sky-300 px-1 py-0 text-[7px] text-sky-700"
                    >
                      estimado
                    </Badge>
                  )}
                  {mg !== null && (
                    <Badge
                      className={`shrink-0 border px-1.5 py-0 text-[8px] ${
                        mg >= 30
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                          : mg >= 10
                            ? 'border-amber-300 bg-amber-100 text-amber-800'
                            : 'border-rose-300 bg-rose-100 text-rose-800'
                      }`}
                    >
                      {mg.toFixed(0)}%
                    </Badge>
                  )}
                </div>

                {/* edição direta na linha */}
                <div className="grid grid-cols-3 items-end gap-1.5">
                  <div>
                    <Label className="text-[8px] text-muted-foreground">Preço venda</Label>
                    <Input
                      inputMode="decimal"
                      value={valorDe(m, 'price')}
                      onChange={(e) => digitar(m.id, 'price', e.target.value)}
                      onBlur={() => salvarLinha(m)}
                      placeholder="0,00"
                      className="h-7 text-[10px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[8px] text-muted-foreground">Custo</Label>
                    <Input
                      inputMode="decimal"
                      value={valorDe(m, 'cost')}
                      onChange={(e) => digitar(m.id, 'cost', e.target.value)}
                      onBlur={() => salvarLinha(m)}
                      placeholder="0,00"
                      className="h-7 text-[10px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirEstoque(m)}
                    className="h-7 gap-1 text-[9px]"
                  >
                    <Package className="h-2.5 w-2.5" /> Estoque
                  </Button>
                </div>

                {mg !== null && (
                  <p className="text-[9px] text-muted-foreground">
                    Lucro por unidade:{' '}
                    <strong className="font-mono text-emerald-700">
                      {brl(Number(valorDe(m, 'price') || 0) - Number(valorDe(m, 'cost') || 0))}
                    </strong>
                  </p>
                )}
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
            {pagina} de {paginas} · {filtrados.length} itens
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

      {/* estoque */}
      <Dialog open={!!estoqueDe} onOpenChange={(v) => !v && setEstoqueDe(null)}>
        <DialogContent className="w-[94vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Estoque</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] font-semibold text-muted-foreground">{estoqueDe?.name}</p>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setControlar((c) => !c)}
              className={`w-full rounded-md border px-2 py-2 text-left text-[11px] font-semibold ${
                controlar ? 'border-[#0B3D91] bg-[#0B3D91] text-white' : 'bg-white'
              }`}
            >
              {controlar ? '✓ ' : ''}Controlar estoque deste produto
            </button>
            {controlar && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Atual</Label>
                  <Input
                    inputMode="decimal"
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Mínimo</Label>
                  <Input
                    inputMode="decimal"
                    value={minimo}
                    onChange={(e) => setMinimo(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEstoqueDe(null)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={salvarEstoque}
              disabled={salvando}
              className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
