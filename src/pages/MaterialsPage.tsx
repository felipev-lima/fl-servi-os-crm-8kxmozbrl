import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getMaterials, createMaterial, updateMaterial, deleteMaterial } from '@/services/api'
import { Material } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Search,
  Package,
  Tag,
  Edit2,
  Trash2,
  Loader2,
  Layers,
  AlertTriangle,
} from 'lucide-react'
import { CAMPO_ALTO, uc } from '@/lib/texto'
import { semAcento } from '@/lib/busca'
import { MaterialKind } from '@/types/flservicos'
import { toast } from 'sonner'

const KINDS: { value: MaterialKind; label: string; desc: string }[] = [
  { value: 'CAPITAL', label: 'CAPITAL', desc: 'equipamento — câmera, DVR, switch, rack...' },
  { value: 'CONSUMO', label: 'CONSUMO', desc: 'cabo, conector, fita, toner...' },
  { value: 'SERVICO', label: 'SERVICO', desc: 'mão de obra — instalação, manutenção, vistoria' },
]

export default function MaterialsPage() {
  const { isAdmin } = useAuth()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Aba de revisão: só os produtos que o técnico cadastrou em campo
  const [aba, setAba] = useState<'todos' | 'pendentes'>('todos')

  // Dialog Form
  const [openDialog, setOpenDialog] = useState(false)
  const [editingMat, setEditingMat] = useState<Material | null>(null)
  const [formData, setFormData] = useState<Partial<Material>>({
    name: '',
    unit: 'UN',
    default_kind: undefined,
    category: '',
    brand: '',
    price: 0,
    current_stock: 0,
    notes: '',
  })
  // Preço e estoque ficam como TEXTO enquanto a pessoa digita: se fossem
  // número, o campo nunca ficaria vazio e o zero inicial não sairia
  // (era o que atrapalhava ao digitar 17,90 e aparecer 017,90).
  const [precoTxt, setPrecoTxt] = useState('')
  const [estoTxt, setEstoTxt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadMaterials()
  }, [])

  const loadMaterials = async () => {
    setLoading(true)
    try {
      const data = await getMaterials()
      setMaterials(data)
    } catch (err) {
      toast.error('Erro ao carregar catálogo de materiais.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingMat(null)
    setFormData({
      name: '',
      unit: 'UN',
      default_kind: undefined,
      category: '',
      brand: '',
      price: 0,
      current_stock: 0,
      notes: '',
    })
    setPrecoTxt('')
    setEstoTxt('')
    setOpenDialog(true)
  }

  const handleOpenEdit = (m: Material) => {
    setEditingMat(m)
    setFormData({
      name: m.name,
      unit: m.unit,
      default_kind: (m.default_kind as MaterialKind) || undefined,
      category: m.category || '',
      brand: m.brand || '',
      price: m.price || 0,
      current_stock: m.current_stock || 0,
      notes: m.notes || '',
    })
    // só mostra o número quando ele existe de fato (zero aparece vazio)
    setPrecoTxt(m.price ? String(m.price).replace('.', ',') : '')
    setEstoTxt(m.current_stock ? String(m.current_stock) : '')
    setOpenDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('Informe o nome do material.')
      return
    }

    setSubmitting(true)
    try {
      if (editingMat) {
        // Ao salvar, o produto do campo sai da fila de revisão
        const era = editingMat.pending_review
        await updateMaterial(editingMat.id, { ...formData, pending_review: false } as any)
        toast.success(
          era ? 'Produto revisado e liberado no catálogo!' : 'Material atualizado com sucesso!',
        )
      } else {
        await createMaterial(formData)
        toast.success('Material cadastrado no catálogo!')
      }
      setOpenDialog(false)
      loadMaterials()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar material.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este item do catálogo?')) return
    try {
      await deleteMaterial(id)
      toast.success('Material excluído.')
      loadMaterials()
    } catch (err) {
      toast.error('Erro ao excluir material.')
    }
  }

  const pendentes = materials.filter((m) => m.pending_review)

  const filtered = (aba === 'pendentes' ? pendentes : materials).filter((m) => {
    // IGNORA ACENTO E MAIÚSCULA (a lista já vem inteira do backend, o filtro é local)
    const term = semAcento(search)
    if (!term) return true
    return (
      semAcento(m.name).includes(term) ||
      semAcento(m.category).includes(term) ||
      semAcento(m.brand).includes(term)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            Catálogo de Materiais
          </h1>
          <p className="text-xs text-muted-foreground">
            Peças, conectores, cabos e equipamentos utilizados nas ordens de serviço.
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={handleOpenCreate}
            className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" /> Novo Material
          </Button>
        )}
      </div>

      {/* Abas: todo o catálogo ou só o que veio do campo */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={aba === 'todos' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAba('todos')}
          className={`h-9 text-xs font-semibold gap-1.5 ${
            aba === 'todos' ? 'bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white' : ''
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Catálogo ({materials.length})
        </Button>
        <Button
          type="button"
          variant={aba === 'pendentes' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAba('pendentes')}
          className={`h-9 text-xs font-semibold gap-1.5 ${
            aba === 'pendentes'
              ? pendentes.length > 0
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white'
              : pendentes.length > 0
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : ''
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Aguardando revisão ({pendentes.length})
        </Button>
      </div>

      {aba === 'pendentes' && pendentes.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Estes produtos foram cadastrados pelo técnico em campo, só com o nome. Confira unidade,
            categoria e <strong>preencha o preço</strong>. Ao salvar, o produto sai desta lista e
            entra no catálogo normal.
          </span>
        </div>
      )}

      {/* Busca */}
      <div className="bg-card p-3 rounded-xl border flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={
            aba === 'pendentes'
              ? 'Buscar entre os produtos pendentes...'
              : 'Buscar material por nome, categoria ou marca...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none shadow-none text-xs focus-visible:ring-0 h-8"
        />
      </div>

      {/* Tabela / Grid de Materiais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((mat) => (
          <Card
            key={mat.id}
            className={`transition shadow-sm ${
              mat.pending_review
                ? 'border-red-300 bg-red-50/40 hover:border-red-400'
                : 'hover:border-[#0F6A3A]/40'
            }`}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      mat.pending_review
                        ? 'bg-red-100 text-red-600'
                        : 'bg-[#0F6A3A]/10 text-[#0F6A3A]'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3
                      className={`font-bold text-sm line-clamp-1 ${
                        mat.pending_review ? 'text-red-700' : 'text-foreground'
                      }`}
                    >
                      {mat.name}
                    </h3>
                    {mat.pending_review && (
                      <span className="inline-block mt-0.5 text-[9px] font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 rounded">
                        aguardando revisão
                      </span>
                    )}
                    {mat.default_kind && (
                      <span
                        className={`inline-block mr-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          mat.default_kind === 'CAPITAL'
                            ? 'bg-[#0B3D91]/10 text-[#0B3D91]'
                            : mat.default_kind === 'CONSUMO'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {mat.default_kind}
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">
                        {mat.unit}
                      </span>
                      {mat.category && <span>{mat.category}</span>}
                      {mat.brand && <span>• {mat.brand}</span>}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(mat)}
                      className="h-7 w-7 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(mat.id)}
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Preço Unitário</span>
                  <span className="font-mono font-bold text-slate-800">
                    {mat.price ? `R$ ${mat.price.toFixed(2)}` : 'R$ 0,00'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Estoque Atual</span>
                  <span className="font-mono font-medium text-slate-700">
                    {mat.current_stock ?? 0} {mat.unit}
                  </span>
                </div>
              </div>

              {mat.notes && (
                <p className="text-[11px] text-muted-foreground bg-muted/20 p-1.5 rounded line-clamp-2">
                  {mat.notes}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center border-2 border-dashed rounded-xl bg-card">
            <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">
              Nenhum material encontrado no catálogo
            </p>
          </div>
        )}
      </div>

      {/* Modal Material */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingMat ? 'Editar Material' : 'Novo Material'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome do Item / Peça *</Label>
              <Input
                placeholder="Ex: Conector RJ45 Blindado Cat6"
                value={formData.name || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: uc(e.target.value) }))}
                required
                className={`h-9 text-xs ${CAMPO_ALTO}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Unidade de Medida *</Label>
                <Select
                  value={formData.unit || 'UN'}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, unit: val as any }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {['UN', 'M', 'KG', 'L', 'CX', 'PC', 'PAR', 'ROLO'].map((u) => (
                      <SelectItem key={u} value={u} className="text-xs">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Categoria</Label>
                <Input
                  placeholder="Ex: Cabeamento / Câmeras"
                  value={formData.category || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, category: uc(e.target.value) }))
                  }
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo (classificação)</Label>
              <Select
                value={formData.default_kind || ''}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, default_kind: val as MaterialKind }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione CAPITAL, CONSUMO ou SERVICO" />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value} className="text-xs">
                      {k.label} — {k.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Vem preenchido automaticamente ao lançar o produto numa OS ou orçamento.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Preço Unitário (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={precoTxt}
                  onChange={(e) => {
                    // aceita vírgula ou ponto; guarda só número e separador
                    const limpo = e.target.value.replace(/[^0-9.,]/g, '')
                    setPrecoTxt(limpo)
                    setFormData((prev) => ({
                      ...prev,
                      price: parseFloat(limpo.replace(',', '.')) || 0,
                    }))
                  }}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Marca / Fabricante</Label>
                <Input
                  placeholder="Ex: Furukawa / Intelbras"
                  value={formData.brand || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brand: uc(e.target.value) }))}
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Estoque Disponível</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Ex: 50"
                value={estoTxt}
                onChange={(e) => {
                  const limpo = e.target.value.replace(/\D/g, '')
                  setEstoTxt(limpo)
                  setFormData((prev) => ({
                    ...prev,
                    current_stock: parseInt(limpo, 10) || 0,
                  }))
                }}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações Técnicas</Label>
              <Input
                placeholder="Ex: Bobina de 305m, uso interno/externo"
                value={formData.notes || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: uc(e.target.value) }))}
                className={`h-9 text-xs ${CAMPO_ALTO}`}
              />
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
                disabled={submitting}
                className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Material'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
