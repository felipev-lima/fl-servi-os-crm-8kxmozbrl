/**
 * Linha fina de saúde do sistema — versão COMPACTA do final do Painel.
 *
 * PEDIDO DO FELIPE (28/11/2026): os widgets de saúde (card "Conexões Google"
 * e widget de pendências com sino) estavam grandes demais e tomavam espaço:
 *   "não precisa de um ícone tão grande pode ser bem pequeno e só para
 *    consulta e possível ativação... fica mais clean e bonito".
 *
 * O QUE É AGORA: UMA linha fina, discretíssima, no final do Painel —
 *   - quatro ícones pequenos (Sheets, Gmail, Drive, Agenda), cada um com a
 *     bolinha de estado (verde conectado / vermelho expirado / cinza
 *     desconectado). Clicável para conectar/reconectar na hora;
 *   - um sino pequeno com badge vermelho quando há pendência; ao clicar,
 *     lista as pendências (system_alerts + conexões com problema), como antes;
 *   - o diário de atualizações (system_updates, só admin) vira um botãozinho
 *     de histórico na mesma linha, que abre o diálogo embaixo.
 *
 * TUDO que existia continua: estado ao vivo (listConnectors / focus reload),
 * ativação (connect), alertas resolvidos preservados e SÓ ADMIN vê —
 * colaborador não renderiza nada (garantido também pelo `{isAdmin && ...}`
 * da PainelPage).
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { listConnectors, connect, type ConnectorState } from '@/lib/skipConnectors'
import { useAuth } from '@/contexts/AuthContext'
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
import {
  Bell,
  History,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

/** Bolinha de estado de um conector (verde/vermelha/cinza). */
function Bolinha({ st }: { st: 'connected' | 'not_connected' | 'expired' | 'unknown' }) {
  const cor =
    st === 'connected'
      ? 'bg-green-500'
      : st === 'expired'
        ? 'bg-red-500'
        : st === 'not_connected'
          ? 'bg-slate-400'
          : 'bg-slate-300'
  const pulso = st === 'expired' ? ' motion-safe:animate-pulse' : ''
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cor, pulso)} aria-hidden="true" />
}

/** Ícone de um conector Google, clicável para conectar/reconectar. */
function IconeConector({
  toolkit,
  nome,
  st,
  conectando,
  onConectar,
}: {
  toolkit: string
  nome: string
  st: 'connected' | 'not_connected' | 'expired' | 'unknown'
  conectando: boolean
  onConectar: () => void
}) {
  const rotulo =
    st === 'connected'
      ? `${nome}: conectado`
      : st === 'expired'
        ? `${nome}: conexão expirada — toque para reconectar`
        : st === 'not_connected'
          ? `${nome}: desconectado — toque para conectar`
          : `${nome}: consultando…`

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onConectar}
      disabled={st === 'unknown'}
      aria-label={rotulo}
      title={rotulo}
      className="relative h-6 w-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {conectando ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <Bolinha st={st} />
      )}
      - <span className="sr-only">{nome}</span>
    </Button>
  )
}

/** Conexões Google + pendências + diário (admin) — linha compacta do Painel. */
export function PainelSaudeSistema() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [conexoes, setConexoes] = useState<ConnectorState[] | null>(null)
  const [conectando, setConectando] = useState<string | null>(null)
  const [erroConexoes, setErroConexoes] = useState<string | null>(null)
  const [expandido, setExpandido] = useState(false)

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
      await carregarConexoes()
      await carregarAlertas()
    } catch {
      // consentimento cancelado: o estado recarrega no foco da janela
      carregarConexoes()
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
    <div>
      {/* ---------- linha fina compacta ---------- */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1',
          temPendencia ? 'border-red-200 bg-red-50/40' : 'bg-transparent',
        )}
      >
        {/* sino de pendências — pequeno, com badge vermelho */}
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-haspopup="dialog"
          aria-label={
            temPendencia
              ? `${totalPendencias} pendência${totalPendencias > 1 ? 's' : ''} no sistema — abrir lista`
              : 'Tudo em ordem — ver pendências'
          }
          title={
            temPendencia
              ? `${totalPendencias} pendência${totalPendencias > 1 ? 's' : ''} no sistema`
              : 'Tudo em ordem'
          }
          className="relative flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-background',
              temPendencia ? 'bg-red-600' : 'bg-green-500',
            )}
            aria-hidden="true"
          />
        </button>

        {/* diário de atualizações (só admin) — botão pequeno na mesma linha */}
        {ehAdmin && (
          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-haspopup="dialog"
            aria-label="Atualizações do sistema (diário)"
            title="Atualizações do sistema (diário)"
            className="flex h-6 items-center gap-1 rounded-full px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <History className="h-3 w-3" aria-hidden="true" />
          </button>
        )}

        {/* ícones pequenos por conector, com bolinha de estado */}
        <div
          className="ml-1 flex items-center gap-0.5 border-l pl-1.5"
          role="group"
          aria-label="Conexões Google (sua conta)"
        >
          {TOOLKITS.map((t) => (
            <IconeConector
              key={t.toolkit}
              toolkit={t.toolkit}
              nome={t.nome}
              st={estadoDe(t.toolkit)}
              conectando={conectando === t.toolkit}
              onConectar={() => conectar(t.toolkit)}
            />
          ))}
        </div>

        {/* status em texto bem pequeno + recolher/expandir */}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          aria-label={expandido ? 'Recolher detalhes' : 'Expandir detalhes'}
          className="ml-auto flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true">
            {temPendencia
              ? `${totalPendencias} pendência${totalPendencias > 1 ? 's' : ''}`
              : 'Em ordem'}
          </span>
          {expandido ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* ---------- detalhe expandido (erro de consulta / ícone por nome) ---------- */}
      {expandido && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          {erroConexoes ? (
            <p role="alert" className="text-[10px] text-red-600">
              {erroConexoes}
            </p>
          ) : (
            TOOLKITS.map((t) => {
              const st = estadoDe(t.toolkit)
              const precisa = st === 'expired' || st === 'not_connected'
              return (
                <button
                  key={t.toolkit}
                  type="button"
                  onClick={() => conectar(t.toolkit)}
                  disabled={conectando !== null}
                  title={precisa ? 'Conectar/reconectar' : 'Já conectado'}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  <Bolinha st={st} />
                  {t.nome}
                  {precisa && (
                    <span className="font-medium text-[#0B3D91]">
                      — {st === 'expired' ? 'reconectar' : 'conectar'}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}

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
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {TOOLKITS.filter(problemaConexao).map((t) => (
                            <Button
                              key={t.toolkit}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              disabled={conectando !== null}
                              onClick={() => conectar(t.toolkit)}
                            >
                              {conectando === t.toolkit ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                `Reconectar ${t.nome}`
                              )}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="link"
                            className="h-6 px-1 text-[10px]"
                            onClick={() => navigate('/configuracoes')}
                          >
                            Configurações
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

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-muted-foreground"
              onClick={() => {
                carregarConexoes()
                carregarAlertas()
                if (ehAdmin) carregarAtualizacoes()
              }}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" /> Atualizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
