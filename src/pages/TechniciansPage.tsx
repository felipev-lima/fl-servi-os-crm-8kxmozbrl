import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import TechnicianImportDialog from '@/components/TechnicianImportDialog'
import { SignaturePad } from '@/components/SignaturePad'
import { getFileUrl } from '@/services/api'
import { FileSpreadsheet } from 'lucide-react'
import {
  getTechnicians,
  createTechnician,
  updateTechnician,
  deleteTechnician,
} from '@/services/api'
import { Technician } from '@/types/flservicos'
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
  Plus,
  Search,
  Wrench,
  Phone,
  Mail,
  Award,
  Edit2,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function TechniciansPage() {
  const { isAdmin } = useAuth()
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Dialog Form
  const [openDialog, setOpenDialog] = useState(false)
  const [openImport, setOpenImport] = useState(false)
  const [editingTech, setEditingTech] = useState<Technician | null>(null)
  const [formData, setFormData] = useState<Partial<Technician>>({
    name: '',
    phone: '',
    email: '',
    role_title: 'Técnico de Campo',
    specialties: '',
    active: true,
  })
  const [submitting, setSubmitting] = useState(false)

  // Rubrica: guarda a atual (do técnico em edição) e a nova desenhada
  const [rubricaAtual, setRubricaAtual] = useState('')
  const [rubricaNova, setRubricaNova] = useState('')
  // Referência direta ao canvas: na hora de salvar, lemos o desenho dele.
  // Depender só do evento de fim de traço fazia a rubrica se perder quando a
  // pessoa tocava em "Salvar" logo depois de desenhar.
  const rubricaCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    loadTechnicians()
  }, [])

  const loadTechnicians = async () => {
    setLoading(true)
    try {
      const data = await getTechnicians()
      setTechnicians(data)
    } catch (err) {
      toast.error('Erro ao carregar técnicos.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingTech(null)
    setFormData({
      name: '',
      phone: '',
      email: '',
      role_title: 'Técnico de Campo',
      specialties: '',
      active: true,
    })
    setRubricaAtual('')
    setRubricaNova('')
    setOpenDialog(true)
  }

  const handleOpenEdit = (t: Technician) => {
    setEditingTech(t)
    setFormData({
      name: t.name,
      phone: t.phone || '',
      email: t.email || '',
      role_title: t.role_title || 'Técnico de Campo',
      specialties: t.specialties || '',
      active: t.active,
    })
    setRubricaAtual(t.signature ? getFileUrl('technicians', t.id, t.signature) : '')
    setRubricaNova('')
    setOpenDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('Informe o nome do técnico.')
      return
    }

    setSubmitting(true)
    try {
      // A rubrica desenhada vira arquivo; se não desenhou nada, não mexe
      const payload: any = { ...formData }

      // Usa a imagem que o SignaturePad já entregou SEM o fundo branco
      // (toDataURL cru trazia o retângulo branco, que virava tarja no PDF).
      const rubricaData = rubricaNova

      if (rubricaData && rubricaData.startsWith('data:image')) {
        const blob = await (await fetch(rubricaData)).blob()
        const form = new FormData()
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== undefined && v !== null) form.append(k, String(v))
        })
        form.append('signature', blob, 'rubrica.png')
        if (editingTech) {
          await updateTechnician(editingTech.id, form as any)
          toast.success('Técnico atualizado com sucesso!')
        } else {
          await createTechnician(form as any)
          toast.success('Técnico cadastrado com sucesso!')
        }
      } else {
        if (editingTech) {
          await updateTechnician(editingTech.id, payload)
          toast.success('Técnico atualizado com sucesso!')
        } else {
          await createTechnician(payload)
          toast.success('Técnico cadastrado com sucesso!')
        }
      }
      setOpenDialog(false)
      loadTechnicians()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar técnico.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja remover este técnico da equipe?')) return
    try {
      await deleteTechnician(id)
      toast.success('Técnico removido.')
      loadTechnicians()
    } catch (err) {
      toast.error('Erro ao remover técnico.')
    }
  }

  const filtered = technicians.filter((t) => {
    const term = search.toLowerCase()
    return (
      t.name.toLowerCase().includes(term) ||
      (t.role_title || '').toLowerCase().includes(term) ||
      (t.specialties || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Técnicos de Campo</h1>
          <p className="text-xs text-muted-foreground">
            Equipe técnica responsável por instalações, manutenções e vistorias em Macaé.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenImport(true)}
              className="text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10 font-semibold text-xs gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" /> Importar planilha
            </Button>
            <Button
              onClick={handleOpenCreate}
              className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" /> Novo Técnico
            </Button>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="bg-card p-3 rounded-xl border flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar técnico por nome, cargo ou especialidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none shadow-none text-xs focus-visible:ring-0 h-8"
        />
      </div>

      {/* Grid de Técnicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tech) => (
          <Card key={tech.id} className="hover:border-[#0F6A3A]/40 transition shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#0F6A3A]/10 text-[#0F6A3A] flex items-center justify-center font-bold text-sm shrink-0">
                    {tech.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground line-clamp-1">{tech.name}</h3>
                    <p className="text-xs text-muted-foreground">{tech.role_title || 'Técnico'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      tech.active
                        ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                        : 'border-slate-300 text-slate-500 bg-slate-50'
                    }`}
                  >
                    {tech.active ? 'Ativo' : 'Inativo'}
                  </Badge>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(tech)}
                        className="h-8 px-2 text-[11px] font-semibold text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10 gap-1"
                        title="Editar os dados deste técnico"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tech.id)}
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        title="Remover técnico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t">
                {tech.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-[#0F6A3A]" />
                    <span>{tech.phone}</span>
                  </div>
                )}
                {tech.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-[#0F6A3A]" />
                    <span className="truncate">{tech.email}</span>
                  </div>
                )}
              </div>

              {tech.specialties && (
                <div className="pt-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 mb-0.5">
                    <Award className="w-3 h-3 text-[#0F6A3A]" /> Especialidades:
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {tech.specialties}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center border-2 border-dashed rounded-xl bg-card">
            <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Nenhum técnico cadastrado</p>
          </div>
        )}
      </div>

      {/* Modal Técnico */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingTech ? 'Editar Técnico' : 'Novo Técnico'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                placeholder="Ex: Carlos Alberto da Silva"
                value={formData.name || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
                <Input
                  placeholder="(22) 99876-5432"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">E-mail Corporativo</Label>
                <Input
                  type="email"
                  placeholder="carlos.silva@flservicos.com"
                  value={formData.email || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Função / Cargo</Label>
                <Input
                  placeholder="Ex: Técnico de Campo Sênior"
                  value={formData.role_title || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, role_title: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Situação</Label>
                <select
                  value={formData.active ? 'true' : 'false'}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, active: e.target.value === 'true' }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="true">Ativo na Equipe</option>
                  <option value="false">Inativo / Afastado</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Especialidades e Certificações</Label>
              <Input
                placeholder="Ex: CFTV, Fibra Óptica, Alarmes, NR10, NR35"
                value={formData.specialties || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, specialties: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>

            {/* Rubrica: desenha uma vez, sai impressa no PDF de toda OS dele */}
            <div className="space-y-1.5 rounded-lg border border-[#0F6A3A]/25 bg-[#0F6A3A]/5 p-2.5">
              <Label className="text-xs font-semibold text-[#0F6A3A]">Rubrica do técnico</Label>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Desenhe com o dedo. Ela entra no PDF de cada OS, acima do nome.
              </p>
              <SignaturePad
                initialImage={rubricaAtual || undefined}
                onSave={(dataUrl) => setRubricaNova(dataUrl)}
                onCanvasReady={(c) => {
                  rubricaCanvasRef.current = c
                }}
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
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Técnico'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação por Planilha */}
      <TechnicianImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        existingTechnicians={technicians}
        onImported={loadTechnicians}
      />
    </div>
  )
}
