import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listConnectors, type ConnectorState } from '@/lib/skipConnectors'
import { ConnectorButton } from '@/components/skip/ConnectorButton'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Mail,
  Sheet,
  HardDrive,
  Calendar,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Tela de Conectores.
 *
 * O `id` de cada item PRECISA ser exatamente o `toolkit` que
 * GET /api/skip/connectors devolve. Conferido em 25/11/2026 contra a resposta
 * real da API neste projeto: gmail, googledrive, googlecalendar, googlesheets.
 * Antes estava `gcalendar` (nome usado por outras plataformas, NÃO por esta) e
 * o Google Calendar aparecia como "não conectado" mesmo depois de conectado.
 *
 * OneDrive foi retirado do catálogo: a plataforma não o lista no toolkit, então
 * ele nunca poderia ficar "conectado" e a linha só confundia.
 */
type Catalogo = {
  id: string
  nome: string
  descricao: string
  paraQue: string
  icon: React.ReactNode
}

const CATALOGO: Catalogo[] = [
  {
    id: 'googlesheets',
    nome: 'Google Sheets',
    descricao: 'Escreve os lançamentos direto na sua planilha',
    paraQue:
      'Em vez de baixar o Excel e copiar à mão, o app passa a gravar os lançamentos direto na planilha do Google.',
    icon: <Sheet className="w-5 h-5" />,
  },
  {
    id: 'gmail',
    nome: 'Gmail',
    descricao: 'Envia o PDF da OS por e-mail ao cliente',
    paraQue:
      'Ao finalizar a OS, o app manda o relatório em PDF para o e-mail do cliente automaticamente.',
    icon: <Mail className="w-5 h-5" />,
  },
  {
    id: 'googledrive',
    nome: 'Google Drive',
    descricao: 'Guarda as OS numa pasta do Google',
    paraQue: 'Alternativa ao OneDrive para arquivar as fichas e fotos das ordens de serviço.',
    icon: <HardDrive className="w-5 h-5" />,
  },
  {
    id: 'googlecalendar',
    nome: 'Google Calendar',
    descricao: 'Coloca as OS agendadas na sua agenda',
    paraQue: 'Cada OS com data agendada entra na sua agenda, e o técnico vê o dia dele no celular.',
    icon: <Calendar className="w-5 h-5" />,
  },
]

export default function ConectoresPage() {
  const { isAdmin } = useAuth()
  const [estado, setEstado] = useState<ConnectorState[] | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    setCarregando(true)
    setErro('')
    try {
      const lista = await listConnectors()
      setEstado(lista)
    } catch (e: any) {
      // 503 "Connectors are not enabled for this app" = falta a Adapta habilitar.
      setErro(e?.message || 'Não foi possível consultar os conectores.')
      setEstado(null)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-semibold">Somente administradores</p>
        <p className="text-xs text-muted-foreground mt-1">
          A conexão de contas é uma decisão do dono do negócio.
        </p>
      </div>
    )
  }

  const bloqueado = erro.includes('503') || /not enabled/i.test(erro)
  const statusDe = (id: string) => estado?.find((c) => c.toolkit === id)?.status

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Conectores</h1>
          <p className="text-xs text-muted-foreground">
            Conecte suas contas para o app executar tarefas sozinho, sem trabalho manual.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={carregar}
          disabled={carregando}
          className="h-8 text-xs gap-1.5 shrink-0"
        >
          {carregando ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Verificar
        </Button>
      </div>

      {/* Situação da plataforma */}
      {bloqueado && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Ainda não liberado pela Adapta
          </div>
          <p className="text-[11px] text-amber-900/90 leading-relaxed">
            O servidor respondeu:{' '}
            <code className="bg-amber-100 px-1 rounded text-[10px]">{erro.slice(0, 90)}</code>
          </p>
          <p className="text-[11px] text-amber-900/90 leading-relaxed">
            Isso não é erro do app: falta a Adapta habilitar os conectores nesta conta. Assim que
            liberarem, é só tocar em <strong>Conectar</strong> aqui e a integração passa a
            funcionar.
          </p>
        </div>
      )}

      {erro && !bloqueado && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[11px] text-red-800">
          <strong>Não foi possível consultar:</strong> {erro}
        </div>
      )}

      {/* Como funciona */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex gap-2">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-700 leading-relaxed">
          Cada conexão é feita <strong>com a sua conta</strong> e pode ser desfeita a qualquer
          momento no botão <strong>Desconectar</strong>. O app não guarda sua senha: a autorização é
          feita no site do próprio serviço.
        </p>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Verificando conectores...
        </div>
      ) : (
        <div className="space-y-2.5">
          {CATALOGO.map((c) => {
            const st = statusDe(c.id)
            const conectado = st === 'connected'
            return (
              <Card key={c.id} className={conectado ? 'border-emerald-300 bg-emerald-50/30' : ''}>
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        conectado
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{c.nome}</span>
                        {conectado ? (
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300">
                            CONECTADO
                          </Badge>
                        ) : st === 'expired' ? (
                          <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300">
                            EXPIRADO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px]">
                            NÃO CONECTADO
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{c.descricao}</p>
                      <p className="text-[11px] text-slate-600 leading-snug mt-1.5">{c.paraQue}</p>
                    </div>
                  </div>

                  {/* Botão da plataforma: só aparece quando a consulta funciona */}
                  {!bloqueado && !erro && (
                    <ConnectorButton toolkit={c.id} name={c.nome} className="pt-1" />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border p-3 text-[11px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Sobre o OneDrive:</strong> ele não é um conector
        disponível nesta plataforma, por isso não aparece na lista. O arquivamento das OS no
        OneDrive continua sendo feito pelo processo externo, a cada 30 minutos — o trabalho não
        para.
      </div>
    </div>
  )
}
