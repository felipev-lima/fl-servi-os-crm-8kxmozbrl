/**
 * Widget de pendências + conexões Google — a "telinha pequena" do Painel.
 *
 * PEDIDO DO FELIPE (27/11/2026): "Podia me deixar no próprio CRM uma telinha
 * pequena logo assim do painel, ali com um clicozinho vermelho, alguma coisa
 * assim pra que eu possa identificar o que tem de pendência a ser atualizado
 * no sistema ou qualquer tipo de falha que esteja acontecendo."
 *
 * O QUE TEM AQUI:
 *   1. Card "Conexões Google" — estado ao vivo dos 4 conectores DA CONTA
 *      LOGADA (mesmo mecanismo do ConnectorButton: /api/skip/connectors), com
 *      botão conectar/reconectar direto daqui.
 *   2. Widget de pendências — bolinha vermelha quando há alerta aberto
 *      (conexão expirada, falha de sistema) e, para ADMIN, o diário de
 *      atualizações do sistema (coleção system_updates). Ao clicar, abre o
 *      diálogo com a lista e a ação de resolver (leva para Configurações).
 *
 * O ADMIN VÊ MAIS: colaborador não-admin não vê o histórico de versões
 * (regra da coleção no banco, e o filtro aqui reforça).
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { listConnectors, connect, type ConnectorState } from '@/lib/skipConnectors'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Link2,
  Bell,
  History,
  Loader2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

const TOOLKITS: { toolkit: string; nome: string }[] = [
  { toolkit: 'googlesheets', nome: 'Sheets' },
  { toolkit: 'gmail', nome: 'Gmail' },
  { toolkit: 'googledrive', nome: 'Drive' },
  { toolkit: 'googlecalendar', nome: 'Agenda' },
]

interface AlertaPendencia {
  id: string
  tipo: string
  titulo: string
  mensagem: string
  acao: string
  acao_link: string
  avisado_em: string
}

interface AtualizacaoSistema {
  id: string
  version: string
  titulo: string
  detalhe: string
  data: string
}

const ROTULO_TOOLKIT: Record<string, string> = {
  googlesheets: 'Google Sheets',
  gmail: 'Gmail',
  googledrive: 'Google Drive',
  googlecalendar: 'Google Agenda',
}

/** Conexões Google + pendências + diário (admin) — a telinha do Painel. */
export function PainelSaudeSistema() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [conexoes, setConexoes] = useState<ConnectorState[] | null>(null)
  const [conectando, setConectando] = useState<string | null>(null)
  const [erroConexoes, setErroConexoes] = useState<string | null>(null)

  const [alertas, setAlertas] = useState<AlertaPendencia[] | null>(null)
  const [atualizacoes, setAtualizacoes] = useState<AtualizacaoSistema[] | null>(null)
  const [aberto, setAberto] = useState(false)

  const ehAdmin = isAdmin

  const carregarConexoes = useCallback(async () => {
    try {
      const lista = await listConnectors()
      setConexoes(lista)
      setErroConexoes(null)
    } catch {
      setErroConexoes('Não foi possível consultar as conexões agora.')
    }
  }, [])

  const carregarAlertas = useCallback(async () => {
    if (!user?.id) {
      setAlertas([])
      return
    }
    try {
      const res = await pb.collection('system_alerts').getList(1, 50, {
        filter: `user = "${user.id}" && resolvido = false`,
        sort: '-avisado_em',
      })
      setAlertas(res.items as unknown as AlertaPendencia[])
    } catch {
      setAlertas([])
    }
  }, [user?.id])

  const carregarAtualizacoes = useCallback(async () => {
    if (!ehAdmin) {
      setAtualizacoes([])
      return
    }
    try {
      const res = await pb.collection('system_updates').getList(1, 20, { sort: '-version' })
      setAtualizacoes(res.items as unknown as AtualizacaoSistema[])
    } catch {
      setAtualizacoes([])
    }
  }, [ehAdmin])

  useEffect(() => {
    carregarConexoes()
    carregarAlertas()
    if (ehAdmin) carregarAtualizacoes()
    // volta do consentimento do Google: o foco muda de janela — recarrega
    const aoVoltar = () => {
      carregarConexoes()
      carregarAlertas()
    }
    window.addEventListener('focus', aoVoltar)
    return () => window.removeEventListener('focus', aoVoltar)
  }, [carregarConexoes, carregarAlertas, carregarAtualizacoes, ehAdmin])

  const conectar = async (toolkit: string) => {
    setConectando(toolkit)
    try {
      await connect(toolkit)
    } finally {
      setConectando(null)
    }
  }

  const estadoDe = (toolkit: string): 'connected' | 'not_connected' | 'expired' | 'unknown' => {
    const st = conexoes?.find((c) => c.toolkit === toolkit)?.status
    return st ?? 'unknown'
  }

  const problemaConexao = (t: { toolkit: string }): boolean =>
    estadoDe(t.toolkit) === 'expired' || estadoDe(t.toolkit) === 'not_connected'

  const algumProblemaConexao = TOOLKITS.some(problemaConexao)
  const totalPendencias = (alertas?.length ?? 0) + (algumProblemaConexao ? 1 : 0)
  const temPendencia = totalPendencias > 0

  return (
    <div className="space-y-3">
      {/* ---------- card Conexões Google ---------- */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5 text-xs font-bold">
              <Link2 className="h-3.5 w-3.5" /> Conexões Google (sua conta)
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={carregarConexoes}
              aria-label="Atualizar estado das conexões Google"
              className="h-7 px-2"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>

          {conexoes === null && !erroConexoes && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Consultando conexões…
            </p>
          )}

          {erroConexoes && (
            <p role="alert" className="text-xs text-red-600">
              {erroConexoes}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {TOOLKITS.map((t) => {
              const st = estadoDe(t.toolkit)
              const cor =
                st === 'connected'
                  ? 'bg-green-500'
                  : st === 'expired'
                    ? 'bg-red-500'
                    : st === 'not_connected'
                      ? 'bg-slate-400'
                      : 'bg-slate-300'
              const rotulo =
                st === 'connected'
                  ? 'Conectado'
                  : st === 'expired'
                    ? 'Reconectar'
                    : st === 'not_connected'
                      ? 'Desconectado'
                      : '…'
              return (
                <div key={t.toolkit} className="flex items-center gap-2 rounded-md border p-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{t.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{rotulo}</p>
                  </div>
                  {st === 'expired' || st === 'not_connected' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => conectar(t.toolkit)}
                      disabled={conectando !== null}
                      className="h-6 px-2 text-[10px]"
                    >
                      {conectando === t.toolkit ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : st === 'expired' ? (
                        'Reconectar'
                      ) : (
                        'Conectar'
                      )}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>

          {(algumProblemaConexao || erroConexoes) && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-6 p-0 text-xs"
              onClick={() => navigate('/configuracoes')}
            >
              <ExternalLink className="mr-1 h-3 w-3" aria-hidden="true" /> Ir para Configurações
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---------- widget de pendências + diário ---------- */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-haspopup="dialog"
            className="flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="relative flex h-5 w-5 items-center justify-center">
              <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {temPendencia && (
                <span
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-600 ring-2 ring-background"
                  aria-hidden="true"
                />
              )}
              {!temPendencia && (
                <span
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold">
                {temPendencia
                  ? `${totalPendencias} pendência${totalPendencias > 1 ? 's' : ''} no sistema`
                  : 'Tudo em ordem'}
              </span>
              <span className="block text-[10px] text-muted-foreground">
                {temPendencia
                  ? 'Toque para ver o que precisa de atenção'
                  : 'Conexões e sistema sem pendências'}
              </span>
            </span>
            {ehAdmin && (
              <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </CardContent>
      </Card>

      {/* ---------- diálogo: pendências + diário (admin) ---------- */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" aria-hidden="true" /> Pendências do sistema
            </DialogTitle>
            <DialogDescription className="text-xs">
              O que precisa da sua atenção agora, e o que mudou no CRM.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4">
              {/* pendências */}
              <section aria-label="Pendências">
                <h3 className="mb-1.5 text-xs font-bold">Pendências</h3>
                {totalPendencias === 0 ? (
                  <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Tudo em ordem — nada
                    pendente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {algumProblemaConexao && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-300">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Conexão Google
                          precisa de atenção
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-red-700 dark:text-red-300">
                          {TOOLKITS.filter(problemaConexao).map((t) => (
                            <li key={t.toolkit}>
                              • {ROTULO_TOOLKIT[t.toolkit]} —{' '}
                              {estadoDe(t.toolkit) === 'expired' ? 'expirado' : 'desconectado'}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-1.5 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => navigate('/configuracoes')}
                          >
                            Reconectar em Configurações
                          </Button>
                        </div>
                      </div>
                    )}
                    {(alertas ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950"
                      >
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {a.titulo}
                        </p>
                        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                          {a.mensagem}
                        </p>
                        {a.acao_link && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-1.5 h-6 px-2 text-[10px]"
                            onClick={() => navigate(a.acao_link)}
                          >
                            {a.acao || 'Resolver'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* diário de atualizações — SÓ ADMIN */}
              {ehAdmin && (
                <section aria-label="Atualizações do sistema">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Atualizações do sistema
                    (diário)
                  </h3>
                  {atualizacoes === null ? (
                    <p className="text-xs text-muted-foreground">Carregando…</p>
                  ) : atualizacoes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma atualização registrada.</p>
                  ) : (
                    <ol className="space-y-2">
                      {atualizacoes.map((u) => (
                        <li key={u.id} className="rounded-md border p-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">
                              v{u.version}
                            </Badge>
                            <p className="text-xs font-semibold">{u.titulo}</p>
                          </div>
                          {u.detalhe && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{u.detalhe}</p>
                          )}
                          {u.data && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {new Date(u.data).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
