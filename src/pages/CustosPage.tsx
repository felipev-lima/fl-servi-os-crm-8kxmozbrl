/**
 * Custos, margem e estoque dos produtos (C3 e C8).
 *
 * O catálogo da FL guarda preço de venda, não custo — e sem custo não existe
 * margem. Aqui o Felipe informa o custo e a margem aparece na hora.
 *
 * Regra que não pode ser violada: onde o custo é zero, NÃO se calcula margem.
 * Mostrar "100% de lucro" num item que não teve custo informado é mentira, e
 * contamina a decisão. A tela mostra a cobertura ("calculada sobre X% dos
 * itens") para ele saber o quanto o número vale.
 */
import { useEffect, useMemo, useState } from 'react'
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
import { Loader2, Search, Save, Package, AlertTriangle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

const POR_PAGINA = 30

/** Marcação usada no cálculo automático: preço = custo × 1,6 (60% sobre o custo) */
const MARCACAO = 1.6

export default function CustosPage() {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'TODOS' | 'SEM_CUSTO' | 'COM_CUSTO'>('SEM_CUSTO')
  const [pagina, setPagina] = useState(1)

  const [editando, setEditando] = useState<Material | null>(null)
  const [custo, setCusto] = useState('')
  const [preco, setPreco] = useState('')
  const [estoque, setEstoque] = useState('')
  const [minimo, setMinimo] = useState('')
  const [controlar, setControlar] = useState(false)
  const [salvando, setSalvando] = useState(false)

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

  const filtrados = useMemo(() => {
    const t = norm(busca)
    return materiais.filter((m) => {
      const c = Number(m.cost || 0)
      if (filtro === 'SEM_CUSTO' && c > 0) return false
      if (filtro === 'COM_CUSTO' && c <= 0) return false
      if (!t) return true
      return norm(m.name).includes(t) || norm(m.category).includes(t)
    })
  }, [materiais, busca, filtro])

  const comCusto = materiais.filter((m) => Number(m.cost || 0) > 0)
  const cobertura = materiais.length ? (comCusto.length / materiais.length) * 100 : 0

  /** Margem média só sobre os itens que TÊM custo — nunca extrapolada */
  const margemMedia = useMemo(() => {
    const validos = comCusto.filter((m) => Number(m.price || 0) > 0)
    if (!validos.length) return 0
    const soma = validos.reduce(
      (s, m) => s + ((Number(m.price || 0) - Number(m.cost || 0)) / Number(m.price || 1)) * 100,
      0,
    )
    return soma / validos.length
  }, [comCusto])

  /** Quantos custos vieram do cálculo automático, não de conferência */
  const estimados = materiais.filter(
    (m) => Number(m.cost || 0) > 0 && (m as any).cost_estimated,
  ).length

  const abaixoMinimo = materiais.filter(
    (m) =>
      (m as any).control_stock &&
      Number((m as any).stock_min || 0) > 0 &&
      Number((m as any).current_stock || 0) < Number((m as any).stock_min || 0),
  )

  const abrir = (m: Material) => {
    setEditando(m)
    setCusto(String(m.cost ?? ''))
    setPreco(String(m.price ?? ''))
    setEstoque(String((m as any).current_stock ?? ''))
    setMinimo(String((m as any).stock_min ?? ''))
    setControlar(!!(m as any).control_stock)
  }

  const salvar = async () => {
    if (!editando) return
    setSalvando(true)
    try {
      const dados: any = {
        cost: Number(String(custo).replace(',', '.')) || 0,
        price: Number(String(preco).replace(',', '.')) || 0,
        current_stock: Number(String(estoque).replace(',', '.')) || 0,
        stock_min: Number(String(minimo).replace(',', '.')) || 0,
        control_stock: controlar,
        // o Felipe conferiu este custo: deixa de ser estimativa
        cost_estimated: false,
      }
      await updateMaterial(editando.id, dados)
      setMateriais((prev) =>
        prev.map((x) => (x.id === editando.id ? ({ ...x, ...dados } as any) : x)),
      )
      setEditando(null)
      toast.success('Produto atualizado.')
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const margemDe = (m: Material) => {
    const p = Number(m.price || 0)
    const c = Number(m.cost || 0)
    if (c <= 0 || p <= 0) return null
    return ((p - c) / p) * 100
  }

  const listados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))

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
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Custos e margem</h1>
        <p className="text-[11px] text-muted-foreground">
          {comCusto.length} de {materiais.length} produtos com custo informado
        </p>
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
      </div>

      {estimados > 0 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] text-sky-900">
          <strong>{estimados} produto(s)</strong> com custo <strong>calculado</strong> pela marcação
          de 60% (custo = preço ÷ 1,6). Não é o custo real de compra — é a referência inicial. Ao
          editar um produto e salvar, ele passa a contar como <strong>conferido</strong>.
        </p>
      )}

      {cobertura < 100 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
          A margem é calculada <strong>só sobre os {comCusto.length} produtos com custo</strong>.
          Nos outros ela fica em branco — preencher com zero daria margem de 100% e número falso.
        </p>
      )}

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
          ['SEM_CUSTO', `Sem custo (${materiais.length - comCusto.length})`],
          ['COM_CUSTO', `Com custo (${comCusto.length})`],
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

      <div className="space-y-1.5">
        {listados.map((m) => {
          const mg = margemDe(m)
          return (
            <Card key={m.id}>
              <CardContent className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold">{m.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {m.category} · venda {brl(Number(m.price || 0))}
                    {Number(m.cost || 0) > 0 && ` · custo ${brl(Number(m.cost || 0))}`}
                  </p>
                </div>
                {(m as any).cost_estimated && Number(m.cost || 0) > 0 && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-sky-300 px-1 py-0 text-[7px] text-sky-700"
                    title="Custo calculado pela marcação de 60% — confira e edite se precisar"
                  >
                    estimado
                  </Badge>
                )}
                {mg !== null ? (
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
                ) : (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[8px]">
                    sem custo
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => abrir(m)}
                  className="h-6 shrink-0 gap-1 text-[9px]"
                >
                  Editar
                </Button>
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

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="w-[94vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Custo e estoque</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] font-semibold text-muted-foreground">{editando?.name}</p>

          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Preço de venda</Label>
                <Input
                  inputMode="decimal"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Custo de compra</Label>
                <Input
                  inputMode="decimal"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {Number(String(preco).replace(',', '.')) > 0 &&
              Number(String(custo).replace(',', '.')) > 0 && (
                <div className="rounded-lg border border-[#0B3D91]/20 bg-[#0B3D91]/5 p-2 text-[11px]">
                  Margem:{' '}
                  <strong className="font-mono">
                    {(
                      ((Number(String(preco).replace(',', '.')) -
                        Number(String(custo).replace(',', '.'))) /
                        Number(String(preco).replace(',', '.'))) *
                      100
                    ).toFixed(1)}
                    %
                  </strong>{' '}
                  · lucro{' '}
                  <strong className="font-mono">
                    {brl(
                      Number(String(preco).replace(',', '.')) -
                        Number(String(custo).replace(',', '.')),
                    )}
                  </strong>
                </div>
              )}

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
                  <Label className="text-xs font-semibold">Estoque atual</Label>
                  <Input
                    inputMode="decimal"
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Estoque mínimo</Label>
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
              onClick={() => setEditando(null)}
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
