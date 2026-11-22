import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getEmpresa, urlArquivo } from '@/lib/empresa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Wrench, Shield, CheckCircle, Lock, Mail, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function Login() {
  const { login, isAuthenticated, user, logout } = useAuth()

  /** logomarca das Configurações; aparece mesmo antes de entrar */
  const [logoLogin, setLogoLogin] = useState('')
  useEffect(() => {
    getEmpresa()
      .then((e) => setLogoLogin(urlArquivo(e, 'logo')))
      .catch(() => setLogoLogin(''))
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Preencha e-mail e senha.')
      return
    }

    setLoading(true)
    try {
      await login(email, password)
      toast.success('Login efetuado com sucesso!')
    } catch (err: any) {
      toast.error(err?.message || 'E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  // Preenche só o e-mail: a senha é digitada pelo usuário. Antes este atalho
  // sobrescrevia a senha com uma senha padrão antiga e fazia o login falhar
  // para quem já havia trocado a senha.
  const handleQuickLogin = (roleEmail: string) => {
    setEmail(roleEmail)
    setPassword('')
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center justify-center min-h-[70svh] py-6 px-4">
        <Card className="w-full max-w-md border-[#0B3D91]/30">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#0B3D91]/10 text-[#0B3D91] rounded-full flex items-center justify-center mb-2">
              <CheckCircle className="w-6 h-6" />
            </div>
            <CardTitle>Você já está conectado</CardTitle>
            <CardDescription>
              Logado como <strong>{user.name}</strong> ({user.role.toUpperCase()})
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center gap-3">
            <Button
              className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white"
              onClick={() => (window.location.href = '/')}
            >
              Ir para o Painel
            </Button>
            <Button variant="outline" onClick={logout}>
              Sair da conta
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[100svh] py-6 px-4">
      <div className="w-full max-w-md mb-4 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-lg mb-3 overflow-hidden p-1.5">
          {logoLogin ? (
            <img src={logoLogin} alt="FL SERVIÇOS" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[#0B3D91] font-black text-lg">FL</span>
          )}
        </div>
        <h1 className="text-2xl font-black text-[#0B3D91] tracking-tight uppercase">FL SERVIÇOS</h1>
        <p className="text-xs text-muted-foreground font-medium">
          CRM • OS, vendas e faturamento — Macaé/RJ
        </p>
      </div>

      <Card className="w-full max-w-md shadow-md border-border/80">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-bold">Acesse sua conta</CardTitle>
          <CardDescription className="text-xs">
            Entre com suas credenciais para gerenciar clientes e ordens de serviço
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" /> E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@lmservicos.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 text-sm"
              />
            </div>

            {/*
              Atalhos de acesso.

              Os e-mails precisam ser os que EXISTEM na coleção `users` deste
              projeto — os antigos (felipev.lima1981@flservicos.com,
              filipe.pinheiro@flservicos.com) não existem aqui e o botão só
              preenchia um endereço inválido.
            */}
            <div className="pt-2 border-t text-xs">
              <p className="text-muted-foreground font-medium mb-1.5">
                Atalhos — preenchem o e-mail, a senha é digitada:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('felipev.lima1981@gmail.com')}
                  className="text-[11px] h-7 px-1 text-[#0B3D91] border-[#0B3D91]/30 hover:bg-[#0B3D91]/10"
                >
                  Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickLogin('fp52172@gmail.com')}
                  className="text-[11px] h-7 px-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  Técnico
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white font-semibold h-10"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando...
                </>
              ) : (
                'Entrar no Sistema'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
