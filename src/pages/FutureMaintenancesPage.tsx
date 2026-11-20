import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getFutureMaintenances,
  createFutureMaintenance,
  updateFutureMaintenance,
  deleteFutureMaintenance,
  getClients,
  getTechnicians,
} from '@/services/api'
import { FutureMaintenance, Client, Technician } from '@/types/flservicos'
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
  Calendar,
  User,
  Building2,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

export default function FutureMaintenancesPage() {
  const { isTechnician, isAdmin } = useAuth()
  const [maintenances, setMaintenances] = useState<FutureMaintenance[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Dialog Form
  const [openDialog, setOpenDialog] = useState(false)
  const [editingMaint, setEditingMaint] = useState<FutureMaintenance | null>(null)
  const [formData, setFormData] = useState<Partial<FutureMaintenance>>({
    client: '',
    maintenance_type: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    technician: '',
    status: 'PENDENTE',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [m, c, t] = await Promise.all([getFutureMaintenances(), getClients(), getTechnicians()])
      setMaintenances(m)
      setClients(c)
      setTechnicians(t)
    } catch (err) {
      toast.error('Erro ao carregar manutenções.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingMaint(null)
    setFormData({
      client: clients[0]?.id || '',
      maintenance_type: 'Inspeção Semestral do Sistema de Câmeras',
      scheduled_date: new Date().toISOString().split('T')[0],
      technician: technicians[0]?.id || '',
      status: 'PENDENTE',
      notes: '',
    })
    setOpenDialog(true)
  }

  const handleOpenEdit = (m: FutureMaintenance) => {
    setEditingMaint(m)
    setFormData({
      client: m.client,
      maintenance_type: m.maintenance_type,
      scheduled_date: m.scheduled_date ? m.scheduled_date.split('T')[0] : '',
      technician: m.technician || '',
      status: m.status,
      notes: m.notes || '',
    })
    setOpenDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.client || !formData.maintenance_type || !formData.scheduled_date) {
      toast.error('Preencha os campos obrigatórios.')
      return
    }

    setSubmitting(true)
    try {
      if (editingMaint) {
        await updateFutureMaintenance(editingMaint.id, formData)
        toast.success('Manutenção preventiva atualizada!')
      } else {
        await createFutureMaintenance(formData)
        toast.success('Manutenção preventiva agendada com sucesso!')
      }
      setOpenDialog(false)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar manutenção.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja cancelar/excluir este agendamento preventivo?')) return
    try {
      await deleteFutureMaintenance(id)
      toast.success('Agendamento excluído.')
      loadData()
    } catch (err) {
      toast.error('Erro ao excluir manutenção.')
    }
  }

  const filtered = maintenances.filter((m) => {
    const term = search.toLowerCase()
    const matchClient = (m.expand?.client?.name || '').toLowerCase().includes(term)
    const matchType = m.maintenance_type.toLowerCase().includes(term)
    return matchClient || matchType
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            Manutenções Futuras & Preventivas
          </h1>
          <p className="text-xs text-muted-foreground">
            Agenda de revisões preventivas, calibrações e vistorias periódicas por cliente.
          </p>
        </div>

        {isTechnician && (
          <Button
            onClick={handleOpenCreate}
            className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" /> Agendar Preventiva
          </Button>
        )}
      </div>

      {/* Busca */}
      <div className="bg-card p-3 rounded-xl border flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente ou tipo de manutenção..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none shadow-none text-xs focus-visible:ring-0 h-8"
        />
      </div>

      {/* Lista de Manutenções */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Card key={m.id} className="hover:border-[#0F6A3A]/40 transition shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F6A3A]">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="line-clamp-1">{m.expand?.client?.name || 'Cliente'}</span>
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{m.maintenance_type}</h3>
                </div>

                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    m.status === 'CONCLUIDA'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : m.status === 'PENDENTE'
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-rose-50 text-rose-700 border-rose-300'
                  }`}
                >
                  {m.status}
                </Badge>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#0F6A3A]" />
                  <span className="font-semibold text-slate-800">
                    Data:{' '}
                    {m.scheduled_date
                      ? new Date(m.scheduled_date).toLocaleDateString('pt-BR')
                      : '-'}
                  </span>
                </div>

                {m.expand?.technician && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Técnico Responsável: {m.expand.technician.name}</span>
                  </div>
                )}
              </div>

              {m.notes && (
                <p className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded italic">
                  {m.notes}
                </p>
              )}

              {isTechnician && (
                <div className="flex justify-end gap-1 pt-1 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(m)}
                    className="h-7 text-xs gap-1 text-slate-700"
                  >
                    <Edit2 className="w-3 h-3" /> Editar
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center border-2 border-dashed rounded-xl bg-card">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">
              Nenhuma manutenção preventiva encontrada
            </p>
          </div>
        )}
      </div>

      {/* Modal Manutenção */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingMaint ? 'Editar Manutenção Preventiva' : 'Nova Manutenção Preventiva'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Cliente *</Label>
              <Select
                value={formData.client || ''}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, client: val }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tipo / Escopo da Manutenção *</Label>
              <Input
                placeholder="Ex: Inspeção Semestral do Sistema de Câmeras e Nobreaks"
                value={formData.maintenance_type || ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, maintenance_type: e.target.value }))
                }
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Data Agendada *</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, scheduled_date: e.target.value }))
                  }
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Status</Label>
                <Select
                  value={formData.status || 'PENDENTE'}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val as any }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE" className="text-xs">
                      Pendente
                    </SelectItem>
                    <SelectItem value="CONCLUIDA" className="text-xs">
                      Concluída
                    </SelectItem>
                    <SelectItem value="CANCELADA" className="text-xs">
                      Cancelada
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Técnico Responsável</Label>
              <Select
                value={formData.technician || ''}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, technician: val }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o técnico" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações / Checklist</Label>
              <Input
                placeholder="Ex: Verificar baterias, limpar lentes e testar gravação"
                value={formData.notes || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                className="h-9 text-xs"
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
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Salvar Agendamento'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
