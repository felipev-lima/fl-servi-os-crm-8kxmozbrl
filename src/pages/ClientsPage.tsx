import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getClients, createClient, updateClient, deleteClient } from '@/services/api'
import { Client } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
  Building2,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Trash2,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import ClientImportDialog from '@/components/ClientImportDialog'
import { CAMPO_ALTO, uc } from '@/lib/texto'
import { semAcento } from '@/lib/busca'
import { ListagemModos, useViewMode, ViewModeSelector } from '@/components/ViewModeSelector'

export default function ClientsPage() {
  const { isTechnician, isAdmin } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modo, setModo] = useViewMode('clientes')

  // Dialog Form
  const [openDialog, setOpenDialog] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    nickname: '',
    type: 'PJ',
    phone: '',
    email: '',
    document: '',
    address: '',
    neighborhood: '',
    city: 'Macaé',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // Importação por planilha
  const [openImport, setOpenImport] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch (err) {
      toast.error('Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingClient(null)
    setFormData({
      name: '',
      nickname: '',
      type: 'PJ',
      phone: '',
      email: '',
      document: '',
      address: '',
      neighborhood: '',
      city: 'Macaé',
      notes: '',
    })
    setOpenDialog(true)
  }

  const handleOpenEdit = (c: Client) => {
    setEditingClient(c)
    setFormData({
      name: c.name,
      nickname: c.nickname || '',
      type: c.type || 'PJ',
      phone: c.phone || '',
      email: c.email || '',
      document: c.document || '',
      address: c.address || '',
      neighborhood: c.neighborhood || '',
      city: c.city || 'Macaé',
      notes: c.notes || '',
    })
    setOpenDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('Informe o nome/razão social.')
      return
    }

    setSubmitting(true)
    try {
      // PADRAO FL: nome, endereco, bairro, cidade, documento e telefone em
      // MAIUSCULA, mesmo que tenham sido digitados em minuscula. E-mail fica
      // como veio (endereco de e-mail nao tem caixa alta).
      const dados: Partial<Client> = {
        ...formData,
        name: uc(formData.name).trim(),
        nickname: uc(formData.nickname || '').trim(),
        document: uc(formData.document).trim(),
        address: uc(formData.address).trim(),
        neighborhood: uc(formData.neighborhood).trim(),
        city: uc(formData.city).trim(),
        phone: uc(formData.phone).trim(),
        notes: uc(formData.notes),
      }
      if (editingClient) {
        await updateClient(editingClient.id, dados)
        toast.success('Cliente atualizado com sucesso!')
      } else {
        await createClient(dados)
        toast.success('Cliente cadastrado com sucesso!')
      }
      setOpenDialog(false)
      loadClients()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar cliente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este cliente?')) return
    try {
      await deleteClient(id)
      toast.success('Cliente removido.')
      loadClients()
    } catch (err) {
      toast.error('Erro ao remover cliente.')
    }
  }

  const filtered = clients.filter((c) => {
    // IGNORA ACENTO E MAIÚSCULA: o filtro do PocketBase não ignora acento, então
    // a lista vem inteira e o filtro é local. Busca por apelido, razão social,
    // documento e cidade.
    const term = semAcento(search)
    if (!term) return true
    return (
      semAcento(c.name).includes(term) ||
      semAcento(c.nickname).includes(term) ||
      semAcento(c.document).includes(term) ||
      semAcento(c.city).includes(term)
    )
  })

  // CARTÕES: o formato original desta tela, intacto.
  const cartaoCliente = (client: Client) => (
    <Card key={client.id} className="hover:border-[#0F6A3A]/40 transition shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0F6A3A]/10 text-[#0F6A3A] flex items-center justify-center font-bold text-xs shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground line-clamp-1">{client.name}</h3>
              {client.nickname && (
                <span className="block text-[10px] text-[#0F6A3A] font-semibold uppercase">
                  {client.nickname}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                {client.type || 'PJ'} {client.document ? `• ${client.document}` : ''}
              </span>
            </div>
          </div>

          {isTechnician && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenEdit(client)}
                className="h-7 w-7 p-0"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(client.id)}
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t">
          {client.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-[#0F6A3A]" />
              <span>{client.phone}</span>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3 h-3 text-[#0F6A3A]" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3 h-3 text-[#0F6A3A] shrink-0 mt-0.5" />
            <span className="line-clamp-2">
              {client.address
                ? `${client.address}, ${client.neighborhood || ''} - ${client.city || 'Macaé'}`
                : client.city || 'Macaé/RJ'}
            </span>
          </div>
        </div>

        {client.notes && (
          <p className="text-[11px] text-muted-foreground/80 bg-muted/30 p-2 rounded line-clamp-2 italic">
            &quot;{client.notes}&quot;
          </p>
        )}
      </CardContent>
    </Card>
  )

  // LISTA / COMPACTA: mesmos dados, em linhas.
  const linhaCliente = (client: Client) => ({
    titulo: client.nickname || client.name,
    subtitulo: client.name,
    detalhe: [
      client.phone,
      client.address
        ? `${client.address}, ${client.neighborhood || ''} - ${client.city || 'Macaé'}`
        : client.city,
    ]
      .filter(Boolean)
      .join(' • '),
    badge: `${client.type || 'PJ'}${client.document ? ` • ${client.document}` : ''}`,
    extras: isTechnician ? (
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleOpenEdit(client)}
          className="h-7 w-7 p-0"
        >
          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(client.id)}
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    ) : undefined,
  })

  const vazioClientes =
    filtered.length === 0 && !loading ? (
      <div className="p-12 text-center border-2 border-dashed rounded-xl bg-card">
        <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">Nenhum cliente encontrado</p>
      </div>
    ) : undefined

  const listagem = (
    <ListagemModos
      modo={modo}
      itens={filtered}
      chaveItem={(c) => c.id}
      cartoes={cartaoCliente}
      linhaDe={linhaCliente}
      vazio={vazioClientes}
    />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Clientes</h1>
          <p className="text-xs text-muted-foreground">
            Cadastro de empresas e clientes atendidos pela FL SERVIÇOS em Macaé e região.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isTechnician && (
            <Button
              onClick={handleOpenCreate}
              className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" /> Novo Cliente
            </Button>
          )}

          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setOpenImport(true)}
              className="text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10 font-semibold text-xs gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" /> Importar planilha
            </Button>
          )}
        </div>
      </div>

      {/* Busca */}
      <div className="bg-card p-3 rounded-xl border flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente por nome, documento ou cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none shadow-none text-xs focus-visible:ring-0 h-8"
        />
        <ViewModeSelector valor={modo} onChange={setModo} className="ml-auto" />
      </div>

      {/* Listagem de Clientes (modos: lista, compacta e cartões) */}
      {modo === 'cartoes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{listagem}</div>
      ) : (
        listagem
      )}

      {/* Modal de Criação / Edição */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome / Razão Social *</Label>
              <Input
                placeholder="Ex: PetroMacaé Engenharia Ltda"
                value={formData.name || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: uc(e.target.value) }))}
                required
                className={`h-9 text-xs ${CAMPO_ALTO}`}
              />
              <p className="text-[10px] text-muted-foreground">
                Este é o nome impresso no PDF da OS.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Apelido (busca no CRM)</Label>
              <Input
                placeholder="Ex: ESCOLA PARQUE"
                value={formData.nickname || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, nickname: uc(e.target.value) }))}
                className={`h-9 text-xs ${CAMPO_ALTO}`}
              />
              <p className="text-[10px] text-muted-foreground">
                Nome curto para achar o cliente na busca. Não aparece no PDF.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Tipo</Label>
                <Select
                  value={formData.type || 'PJ'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, type: val as 'PF' | 'PJ' }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ" className="text-xs">
                      Pessoa Jurídica (PJ)
                    </SelectItem>
                    <SelectItem value="PF" className="text-xs">
                      Pessoa Física (PF)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">CNPJ / CPF</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={formData.document || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, document: uc(e.target.value) }))
                  }
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Telefone</Label>
                <Input
                  placeholder="(22) 99999-9999"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: uc(e.target.value) }))}
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">E-mail</Label>
                <Input
                  type="email"
                  placeholder="contato@cliente.com"
                  value={formData.email || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Endereço Completo</Label>
              <Input
                placeholder="Rua, número, complemento"
                value={formData.address || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: uc(e.target.value) }))}
                className={`h-9 text-xs ${CAMPO_ALTO}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Bairro</Label>
                <Input
                  placeholder="Ex: Imbetiba / Granja dos Cavaleiros"
                  value={formData.neighborhood || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, neighborhood: uc(e.target.value) }))
                  }
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Cidade</Label>
                <Input
                  placeholder="Macaé"
                  value={formData.city || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: uc(e.target.value) }))}
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Observações / Requisitos de Acesso</Label>
              <Input
                placeholder="Ex: Exige EPI completo, crachá na portaria B"
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
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação por Planilha */}
      <ClientImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        existingClients={clients}
        onImported={loadClients}
      />
    </div>
  )
}
