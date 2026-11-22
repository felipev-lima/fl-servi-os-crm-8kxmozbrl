import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getMaterialKits,
  getMaterialKitItems,
  createMaterialKit,
  updateMaterialKit,
  deleteMaterialKit,
  addMaterialKitItem,
  updateMaterialKitItem,
  deleteMaterialKitItem,
  getMaterials,
} from '@/services/api'
import { MaterialKit, MaterialKitItem, Material, ServiceType } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { SearchCombobox } from '@/components/SearchCombobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Layers, Edit2, Trash2, Loader2, Package, X, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useViewMode, ViewModeSelector } from '@/components/ViewModeSelector'

const TIPOS: ServiceType[] = [
  'Instalação',
  'Manutenção Preventiva',
  'Manutenção Corretiva',
  'Vistoria Técnica',
  'CFTV / Alarme',
  'Rede / Telecom',
  'Outro',
]

export default function MaterialKitsPage() {
  const { isAdmin } = useAuth()

  const [kits, setKits] = useState<MaterialKit[]>([])
  const [catalog, setCatalog] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog do cabeçalho da lista
  const [openDialog, setOpenDialog] = useState(false)
  const [editingKit, setEditingKit] = useState<MaterialKit | null>(null)
  const [form, setForm] = useState<Partial<MaterialKit>>({
    name: '',
    description: '',
    service_type: 'Manutenção Preventiva',
    active: true,
  })
  const [savingKit, setSavingKit] = useState(false)

  // Dialog dos produtos da lista
  const [openItems, setOpenItems] = useState(false)
  const [kitAtual, setKitAtual] = useState<MaterialKit | null>(null)
  const [itens, setItens] = useState<MaterialKitItem[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [novoMaterial, setNovoMaterial] = useState('')
  const [novaQtd, setNovaQtd] = useState('')
  const [salvandoItem, setSalvandoItem] = useState(false)
  const [modo, setModo] = useViewMode('listas-material')

  const carregar = async () => {
    setLoading(true)
    try {
      const [k, m] = await Promise.all([getMaterialKits(), getMaterials()])
      setKits(k)
      setCatalog(m)
    } catch (err) {
      toast.error('Erro ao carregar as listas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const catalogMap = useMemo(() => {
    const m = new Map<string, Material>()
    catalog.forEach((c) => m.set(c.id, c))
    return m
  }, [catalog])

  const abrirNova = () => {
    setEditingKit(null)
    setForm({
      name: '',
      description: '',
      service_type: 'Manutenção Preventiva',
      active: true,
    })
    setOpenDialog(true)
  }

  const abrirEdicao = (k: MaterialKit) => {
    setEditingKit(k)
    setForm({
      name: k.name,
      description: k.description || '',
      service_type: k.service_type || 'Manutenção Preventiva',
      active: k.active !== false,
    })
    setOpenDialog(true)
  }

  const salvarKit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name?.trim()) {
      toast.error('Dê um nome à lista.')
      return
    }
    setSavingKit(true)
    try {
      if (editingKit) {
        const atualizado = await updateMaterialKit(editingKit.id, form)
        toast.success('Lista atualizada.')
        // Se está editando dentro da tela de itens, mantém o cabeçalho novo
        if (kitAtual?.id === atualizado.id) setKitAtual(atualizado)
      } else {
        const criado = await createMaterialKit(form)
        toast.success('Lista criada. Agora adicione os produtos.')
        setOpenItems(true)
        abrirItens(criado)
      }
      setOpenDialog(false)
      await carregar()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar a lista.')
    } finally {
      setSavingKit(false)
    }
  }

  const excluirKit = async (k: MaterialKit) => {
    if (!confirm(`Apagar a lista "${k.name}" e todos os seus produtos?`)) return
    try {
      await deleteMaterialKit(k.id)
      toast.success('Lista apagada.')
      await carregar()
    } catch (err) {
      toast.error('Erro ao apagar a lista.')
    }
  }

  const abrirItens = async (k: MaterialKit) => {
    setKitAtual(k)
    setOpenItems(true)
    setLoadingItens(true)
    try {
      const dados = await getMaterialKitItems(k.id)
      setItens(dados)
    } catch (err) {
      toast.error('Erro ao carregar os produtos da lista.')
    } finally {
      setLoadingItens(false)
    }
  }

  const adicionarItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kitAtual) return
    if (!novoMaterial) {
      toast.error('Escolha o produto.')
      return
    }
    // Quantidade opcional: vazio ou 0 significa "a preencher na OS".
    const qtd = novaQtd.trim() === '' ? 0 : parseFloat(novaQtd)
    if (isNaN(qtd) || qtd < 0) {
      toast.error('Quantidade inválida.')
      return
    }
    if (itens.some((i) => i.material === novoMaterial)) {
      toast.error('Este produto já está na lista. Ajuste a quantidade dele.')
      return
    }

    setSalvandoItem(true)
    try {
      await addMaterialKitItem({
        kit: kitAtual.id,
        material: novoMaterial,
        quantity: qtd,
      })
      const dados = await getMaterialKitItems(kitAtual.id)
      setItens(dados)
      setNovoMaterial('')
      setNovaQtd('')
      toast.success('Produto adicionado.')
    } catch (err) {
      toast.error('Erro ao adicionar o produto.')
    } finally {
      setSalvandoItem(false)
    }
  }

  // Quantidade e opcional: campo vazio grava 0 ("nao definida"). Na OS o
  // tecnico digita a quantidade que realmente usou.
  const alterarQtd = async (item: MaterialKitItem, valor: string) => {
    const qtd = valor.trim() === '' ? 0 : parseFloat(valor)
    if (isNaN(qtd) || qtd < 0) return
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: qtd } : i)))
    try {
      await updateMaterialKitItem(item.id, { quantity: qtd })
    } catch (err) {
      toast.error('Erro ao salvar a quantidade.')
    }
  }

  const removerItem = async (item: MaterialKitItem) => {
    try {
      await deleteMaterialKitItem(item.id)
      setItens((prev) => prev.filter((i) => i.id !== item.id))
      toast.success('Produto removido da lista.')
    } catch (err) {
      toast.error('Erro ao remover o produto.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#0F6A3A]" />
            Listas de Material
          </h1>
          <p className="text-xs text-muted-foreground">
            Atalhos de produtos por tipo de serviço. Na OS, o técnico escolhe a lista e os produtos
            entram de uma vez.
          </p>
        </div>

        <Button
          onClick={abrirNova}
          className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> Nova Lista
        </Button>
      </div>

      <ViewModeSelector valor={modo} onChange={setModo} className="ml-auto" />

      {loading && (
        <div className="p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0F6A3A]" />
        </div>
      )}

      {!loading && kits.length === 0 && (
        <div className="p-12 text-center border-2 border-dashed rounded-xl bg-card">
          <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-semibold text-foreground">Nenhuma lista criada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Nova Lista" para montar o primeiro atalho de materiais.
          </p>
        </div>
      )}

      {modo !== 'cartoes' && kits.length > 0 && (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {kits.map((k) => {
            const compacto = modo === 'compacta'
            return (
              <div
                key={k.id}
                className={`flex items-center gap-2 px-3 ${compacto ? 'min-h-[44px] py-1.5' : 'min-h-[44px] py-2.5'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{k.name}</p>
                  {!compacto && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {k.service_type || '—'}
                      {k.description ? ` · ${k.description}` : ''}
                    </p>
                  )}
                </div>
                {k.active === false && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] border-slate-300 text-slate-500 bg-slate-50"
                  >
                    Inativa
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => abrirEdicao(k)}
                  className="h-8 w-8 shrink-0 p-0"
                  title="Editar nome e descrição"
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => excluirKit(k)}
                    className="h-8 w-8 shrink-0 p-0 text-destructive hover:bg-destructive/10"
                    title="Apagar lista"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirItens(k)}
                  className="h-8 shrink-0 gap-1 text-[10px] font-semibold text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10"
                  title="Gerenciar produtos"
                >
                  <Package className="w-3.5 h-3.5" />
                  {!compacto && <span>Produtos</span>}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${modo !== 'cartoes' ? 'hidden' : ''}`}
      >
        {kits.map((k) => (
          <Card key={k.id} className="hover:border-[#0F6A3A]/40 transition shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#0F6A3A]/10 text-[#0F6A3A] flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-foreground line-clamp-2">{k.name}</h3>
                    {k.service_type && (
                      <p className="text-[11px] text-muted-foreground">{k.service_type}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {k.active === false && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-slate-300 text-slate-500 bg-slate-50"
                    >
                      Inativa
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abrirEdicao(k)}
                    className="h-7 w-7 p-0"
                    title="Editar nome e descrição"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => excluirKit(k)}
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      title="Apagar lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {k.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">{k.description}</p>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => abrirItens(k)}
                className="w-full h-8 text-xs font-semibold text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10 gap-1.5"
              >
                <Package className="w-3.5 h-3.5" /> Gerenciar produtos
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog: cabeçalho da lista */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingKit ? 'Editar Lista' : 'Nova Lista de Material'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={salvarKit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome da lista *</Label>
              <Input
                placeholder="Ex: Manutenção CFTV"
                value={form.name || ''}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo de serviço</Label>
              <select
                value={form.service_type || ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, service_type: e.target.value as ServiceType }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição (opcional)</Label>
              <Textarea
                placeholder="Para que serve esta lista"
                value={form.description || ''}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="text-xs min-h-[60px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="kit-ativo"
                checked={form.active !== false}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                className="h-4 w-4 accent-[#0F6A3A]"
              />
              <Label htmlFor="kit-ativo" className="text-xs font-semibold">
                Lista ativa (aparece na OS)
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingKit}
                className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
              >
                {savingKit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Lista'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: produtos da lista */}
      <Dialog open={openItems} onOpenChange={setOpenItems}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0F6A3A]" />
              {kitAtual?.name || 'Produtos da lista'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <form
              onSubmit={adicionarItem}
              className="p-3 bg-muted/40 rounded-lg border grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
            >
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">Produto</Label>
                <SearchCombobox
                  options={catalog.map((m) => ({
                    value: m.id,
                    label: m.name,
                    hint: `${m.unit}${m.category ? ' · ' + m.category : ''}`,
                    keywords: m.category || '',
                  }))}
                  value={novoMaterial}
                  onChange={setNovoMaterial}
                  placeholder="Digite o nome do produto..."
                  searchPlaceholder="Buscar produto..."
                  emptyText="Nenhum produto com esse nome."
                  className="bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Qtd (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={novaQtd}
                  onChange={(e) => setNovaQtd(e.target.value)}
                  className="h-9 text-xs bg-background"
                />
              </div>

              <Button
                type="submit"
                disabled={salvandoItem}
                className="h-9 text-xs font-semibold bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white gap-1"
              >
                {salvandoItem ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Adicionar
              </Button>
            </form>

            {loadingItens && (
              <div className="py-8 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#0F6A3A]" />
              </div>
            )}

            {!loadingItens && itens.length === 0 && (
              <div className="py-8 text-center border-2 border-dashed rounded-lg">
                <Package className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
                <p className="text-xs text-muted-foreground">
                  Nenhum produto nesta lista ainda. Use o campo acima para incluir.
                </p>
              </div>
            )}

            {!loadingItens && itens.length > 0 && (
              <div className="border rounded-lg divide-y">
                {itens.map((item) => {
                  const mat = item.expand?.material || catalogMap.get(item.material) || undefined
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {mat?.name || 'Produto removido do catálogo'}
                        </p>
                        {mat && (
                          <p className="text-[10px] text-muted-foreground">
                            Unidade: {mat.unit}
                            {mat.category ? ` · ${mat.category}` : ''}
                          </p>
                        )}
                      </div>

                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        defaultValue={item.quantity ? item.quantity : ''}
                        onBlur={(e) => alterarQtd(item, e.target.value)}
                        className="h-7 w-16 text-xs text-center"
                        title="Quantidade padrao (opcional)"
                      />

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removerItem(item)}
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        title="Remover da lista"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {itens.length} {itens.length === 1 ? 'produto' : 'produtos'} nesta lista. A quantidade
              é opcional: em branco, o técnico digita quanto usou na OS.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenItems(false)}
              className="gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
