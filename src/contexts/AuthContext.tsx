import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, UserRole } from '@/types/flservicos'
import {
  getCurrentUser,
  loginWithEmail as apiLogin,
  logout as apiLogout,
  onAuthChange,
  ensureSessionValid,
} from '@/services/auth'

interface AuthContextType {
  user: User | null
  role: UserRole
  isAdmin: boolean
  isTechnician: boolean
  isConsultant: boolean
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, pass: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * `superadmin` é o papel legado do dono do sistema. Enquanto houver algum
 * registro antigo com esse valor, ele PRECISA continuar valendo como
 * administrador — senão a tela de Usuários aparece como "Acesso restrito" e o
 * cadastro fica bloqueado (bug relatado em 2026-11-19). A migration 0023
 * normaliza o banco; esta checagem cobre a sessão que já está no aparelho.
 */
function ehAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getCurrentUser())
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    // Desloga sessões de usuários que foram desativados após o login.
    ensureSessionValid().then((valid) => {
      setUser(valid)
      setLoading(false)
    })

    const unsubscribe = onAuthChange((newUser) => {
      setUser(newUser)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    const loggedUser = await apiLogin(email, pass)
    setUser(loggedUser)
    return loggedUser
  }

  const handleLogout = () => {
    apiLogout()
    setUser(null)
  }

  const role: UserRole = user?.role || 'consulta'
  const isAdmin = ehAdmin(role)
  const isTechnician = role === 'tecnico' || ehAdmin(role)
  const isConsultant = role === 'consulta'

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isTechnician,
        isConsultant,
        isAuthenticated: !!user,
        loading,
        login,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
