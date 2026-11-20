import pb from '@/lib/pocketbase/client'
import { User, UserRole } from '@/types/flservicos'

export interface AuthState {
  user: User | null
  token: string
  isAuthenticated: boolean
  role: UserRole
  isAdmin: boolean
  isTechnician: boolean
  isConsultant: boolean
}

export function getCurrentUser(): User | null {
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return null
  }
  const record = pb.authStore.record
  return {
    id: record.id,
    email: record.email || '',
    name: record.name || record.email?.split('@')[0] || 'Usuário',
    role: (record.role as UserRole) || 'tecnico',
    phone: record.phone,
    avatar: record.avatar,
    created: record.created,
    updated: record.updated,
  }
}

export function getAuthState(): AuthState {
  const user = getCurrentUser()
  const role = user?.role || 'consulta'
  return {
    user,
    token: pb.authStore.token,
    isAuthenticated: !!user,
    role,
    isAdmin: role === 'admin',
    isTechnician: role === 'tecnico' || role === 'admin',
    isConsultant: role === 'consulta',
  }
}

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const authData = await pb.collection('users').authWithPassword(email, pass)
  // Bloqueio de acesso: conta desativada não entra — nem no login, nem em
  // uma sessão que já estava salva no dispositivo.
  if (authData.record && authData.record.active === false) {
    pb.authStore.clear()
    throw new Error(
      'Acesso negado: este usuário está desativado. Procure um administrador do sistema.',
    )
  }
  const user = getCurrentUser()
  if (!user) throw new Error('Falha ao obter perfil após login')
  return user
}

export function logout(): void {
  pb.authStore.clear()
}

export function onAuthChange(callback: (user: User | null) => void) {
  return pb.authStore.onChange(() => {
    callback(getCurrentUser())
  })
}

/**
 * Proteção de sessão: se o usuário logado foi desativado (o campo `active`
 * ficou falso ou sumiu do próprio registro, o PocketBase recusa novos
 * logins, mas a sessão antiga continua válida no dispositivo), limpa a
 * sessão local e devolve null para o app deslogar.
 */
export async function ensureSessionValid(): Promise<User | null> {
  const user = getCurrentUser()
  if (!user) return null

  try {
    const fresh = await pb.collection('users').getOne(user.id, {
      fields: 'id,active,role,name,email',
    })
    if (fresh.active === false) {
      pb.authStore.clear()
      return null
    }
  } catch {
    // Registro sumiu ou sessão expirou: encerra a sessão local.
    pb.authStore.clear()
    return null
  }

  return user
}
