import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  adminSetEmail,
  ManagedUser,
  UserWrite,
} from '@/services/users'
import { UserRole } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Shield,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Wrench,
  Eye,
  Ban,
} from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  tecnico: 'Técnico',
  consulta: 'Consulta',
  superadmin: 'Super Administrador',
}

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  admin: 'border-[#0B3D91]/40 bg-[#0B3D91]/10 text-[#0B3D91]',
  tecnico: 'border-blue-200 bg-blue-50 text-blue-700',
  consulta: 'border-slate-300 bg-slate-100 text-slate-600',
  superadmin: 'border-purple-200 bg-purple-50 text-purple-700',
}

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  admin: <ShieldCheck className="w-3 h-3" />,
  tecnico: <Wrench className="w-3 h-3" />,
  consulta: <Eye className="w-3 h-3" />,
  superadmin: <ShieldCheck className="w-3 h-3" />,
}

interface UserFormData {
  name: string
  email: string
  role: UserRole
  active: boolean
  password: string
  confirmPassword: string
}

const EMPTY_FORM: UserFormData = {
  name: '',
  email: '',
  role: 'tecnico',
  active: true,
  password: '',
  confirmPassword: '',
}

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Criação
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Redefinição de senha
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // Mudança de perfil
  const [roleTarget, setRoleTarget] = useState<ManagedUser | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('tecnico')
  const [savingRole, setSavingRole] = useState(false)

  // Edição de nome e e-mail (o e-mail é o login da pessoa)
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const openEditDialog = (u: ManagedUser) => {
    setEditTarget(u)
    setEditName(u.name || '')
    setEditEmail(u.email || '')
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    const nome = editName.trim()
    const email = editEmail.trim().toLowerCase()
    if (!nome) {
      toast.error('Informe o nome.')
      return
    }
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido.')
      return
    }
    setSavingEdit(true)
    try {
      // O e-mail é o login da pessoa: a API padrão do PocketBase exige a senha
      // antiga para mudá-lo (o save do Júlio falhava em silêncio). Quando o
      // e-mail muda, vai pela rota do administrador; nome sempre pela padrão.
      if (email !== (editTarget.email || '').trim().toLowerCase()) {
        await adminSetEmail(editTarget.id, email)
        await updateUser(editTarget.id, { name: nome })
        toast.success('Dados do usuário atualizados. O novo e-mail já vale como login.')
      } else {
        await updateUser(editTarget.id, { name: nome })
        toast.success('Dados do usuário atualizados.')
      }
      setEditTarget(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar. Verifique se o e-mail já não está em uso.')
    } finally {
      setSavingEdit(false)
    }
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadUsers()
  }, [isAdmin, loadUsers])

  const filtered = users.filter((u) => {
    const term = search.toLowerCase()
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      ROLE_LABELS[u.role].toLowerCase().includes(term)
    )
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) {
      toast.error('Preencha nome, e-mail e senha.')
      return
    }
    if (form.password.length < 8) {
      toast.error('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não conferem.')
      return
    }

    setSubmitting(true)
    const payload: UserWrite = {
      name: form.name,
      email: form.email,
      role: form.role,
      active: form.active,
      password: form.password,
      passwordConfirm: form.confirmPassword,
    }
    try {
      await createUser(payload)
      toast.success('Usuário criado com sucesso!')
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      loadUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar usuário.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (target: ManagedUser) => {
    if (target.id === currentUser?.id) {
      toast.error('Você não pode desativar o seu próprio acesso.')
      return
    }
    try {
      await updateUser(target.id, { active: !target.active })
      toast.success(target.active ? 'Usuário desativado.' : 'Usuário ativado.')
      loadUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao alterar situação do usuário.')
    }
  }

  const openRoleDialog = (target: ManagedUser) => {
    setRoleTarget(target)
    setNewRole(target.role)
  }

  const handleRoleChange = async () => {
    if (!roleTarget) return
    if (roleTarget?.id === currentUser?.id && newRole !== 'admin') {
      toast.error('Você não pode remover o seu próprio perfil de Administrador.')
      return
    }
    if (newRole === roleTarget?.role) {
      setRoleTarget(null)
      return
    }

    setSavingRole(true)
    try {
      await updateUser(roleTarget.id, { role: newRole })
      toast.success(`Perfil de ${roleTarget.name} alterado para ${ROLE_LABELS[newRole]}.`)
      setRoleTarget(null)
      loadUsers()
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao alterar perfil.')
    } finally {
      setSavingRole(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    if (newPassword.length < 8) {
      toast.error('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    setResetting(true)
    try {
      await resetUserPassword(resetTarget.id, newPassword)
      toast.success(`Senha redefinida para ${resetTarget.name}.`)
      setResetTarget(null)
      setNewPassword('')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao redefinir senha.')
    } finally {
      setResetting(false)
    }
  }

  // A defesa final é server-side; aqui apenas evitamos renderizar a tela sem permissão.
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-sm w-full">
          <CardContent className="p-8 text-center space-y-2">
            <Ban className="w-8 h-8 text-destructive mx-auto" />
            <h2 className="font-bold text-foreground">Acesso restrito</h2>
            <p className="text-xs text-muted-foreground">
              Somente administradores podem gerenciar usuários e permissões.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0B3D91]" /> Usuários &amp; Permissões
          </h1>
          <p className="text-xs text-muted-foreground">
            Controle de acesso do sistema: perfis, situações e senhas dos usuários.
          </p>
        </div>

        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold text-xs gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" /> Novo Usuário
        </Button>
      </div>

      {/* Busca */}
      <div className="bg-card p-3 rounded-xl border flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, e-mail ou perfil..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-none shadow-none text-xs focus-visible:ring-0 h-8"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="text-[11px] font-bold uppercase tracking-wide">
                  Nome
                </TableHead>
                <TableHead className="hidden sm:table-cell text-[11px] font-bold uppercase tracking-wide">
                  E-mail
                </TableHead>
                <TableHead className="hidden md:table-cell text-[11px] font-bold uppercase tracking-wide">
                  Perfil
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wide">
                  Situação
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wide">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <TableCell className="font-semibold text-xs py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#0B3D91]/10 text-[#0B3D91] flex items-center justify-center font-bold text-[10px] shrink-0">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="line-clamp-1">{u.name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          (você)
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[220px] truncate">
                    {u.email}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${ROLE_BADGE_CLASSES[u.role]}`}
                    >
                      {ROLE_ICONS[u.role]}
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.active}
                        onCheckedChange={() => handleToggleActive(u)}
                        disabled={u.id === currentUser?.id}
                        aria-label={`Ativar ou desativar ${u.name}`}
                      />
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          u.active
                            ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                            : 'border-slate-300 text-slate-500 bg-slate-50'
                        }`}
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {/* O botão precisa de tamanho explícito em px: com
                            h-7 w-7 + p-0 o ícone ficava com área 0x0 e o menu
                            não abria ao clique (só o ícone aparecia). */}
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 shrink-0 inline-flex items-center justify-center"
                          aria-label="Menu de ações"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onClick={() => openEditDialog(u)}>
                          <Pencil className="w-3.5 h-3.5 text-[#0B3D91]" /> Editar nome e e-mail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRoleDialog(u)}>
                          <ShieldCheck className="w-3.5 h-3.5 text-[#0B3D91]" /> Alterar perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setResetTarget(u)
                            setNewPassword('')
                          }}
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#0B3D91]" /> Redefinir senha
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}

              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      Nenhum usuário encontrado
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modal Novo Usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Novo Usuário</DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre o acesso e escolha o perfil de permissão.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome Completo *</Label>
              <Input
                placeholder="Ex: Maria Souza"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">E-mail *</Label>
              <Input
                type="email"
                placeholder="maria.souza@flservicos.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Perfil de Acesso *</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="admin">Administrador</option>
                  <option value="tecnico">Técnico</option>
                  <option value="consulta">Consulta</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Situação</Label>
                <select
                  value={form.active ? 'true' : 'false'}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.value === 'true' }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Senha *</Label>
                <Input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  minLength={8}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Confirmar Senha *</Label>
                <Input
                  type="password"
                  placeholder="Repita a senha"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  required
                  minLength={8}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold text-xs"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Alterar Perfil */}
      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Alterar Perfil de Acesso</DialogTitle>
            <DialogDescription className="text-xs">
              {roleTarget?.name} — {roleTarget?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Novo Perfil</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="admin">Administrador — acesso total</option>
                <option value="tecnico">Técnico — executa ordens</option>
                <option value="consulta">Consulta — somente leitura</option>
              </select>
            </div>
            {roleTarget?.id === currentUser?.id && newRole !== 'admin' && (
              <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                Você não pode remover o seu próprio perfil de Administrador.
              </p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setRoleTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRoleChange}
              disabled={savingRole}
              className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold text-xs"
            >
              {savingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Redefinir Senha */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Redefinir Senha</DialogTitle>
            <DialogDescription className="text-xs">
              {resetTarget?.name} — {resetTarget?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nova Senha</Label>
              <Input
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                className="h-9 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground bg-slate-50 border rounded-md p-2">
              Informe a nova senha ao usuário — ela dá acesso imediato à conta dele.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setResetTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetting}
              className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold text-xs"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Redefinir Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar nome e e-mail do usuário */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Editar usuário</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome completo</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs"
                placeholder="Nome do usuário"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">E-mail (é o login dele)</Label>
              {/* O servidor recusa o próprio admin trocar o PRÓPRIO e-mail — a
                  regra da coleção veta o self-change de e-mail de propósito. */}
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                disabled={editTarget?.id === currentUser?.id}
                className="h-9 text-xs"
                placeholder="nome@flservicos.com"
              />
              {editTarget?.id === currentUser?.id && (
                <p className="text-[10px] text-muted-foreground">
                  O próprio e-mail do administrador não pode ser alterado aqui.
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2">
              Se trocar o e-mail, avise a pessoa: é com ele que ela vai entrar no app, a partir do
              próximo acesso. A senha continua a mesma.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold text-xs"
            >
              {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
