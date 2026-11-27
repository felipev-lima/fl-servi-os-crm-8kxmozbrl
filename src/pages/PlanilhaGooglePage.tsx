/**
 * TELA — PLANILHA DO GOOGLE
 *
 * Pedido do Felipe (27/11/2026): "crie uma planilha no Drive do Felipe com as
 * abas de Lançamentos e Contas a Receber, grave os dados e mantenha
 * sincronizado. Tudo dentro do CRM."
 *
 * O QUE ESTA TELA FAZ, em três passos que o Felipe dá sozinho:
 *   1. cria a planilha no Drive dele (ou aponta para uma que já existe);
 *   2. sincroniza — grava as duas abas com todos os dados;
 *   3. mostra quando foi a última sincronização, quantas linhas e o link.
 *
 * REGRA QUE A TELA RESPEITA: nada é criado no Drive sem o Felipe clicar. Criar
 * arquivo na conta dele é ação que precisa da mão dele — por isso não existe
 * criação automática no deploy nem em automação.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  lerConfigPlanilha,
  criarPlanilha,
  registrarPlanilhaCriada,
  apontarPlanilha,
  sincronizarPlanilha,
  type ConfigPlanilha,
} from '@/services/googleSheets'
import {
  Sheet,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Plus,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

export default function PlanilhaGooglePage() {
  const { isAdmin } = useAuth()
  const [cfg, setCfg] = useState<ConfigPlanilha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<'criar' | 'sincronizar' | 'apontar' | ''>('')
  const [linkManual, setLinkManual] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setCfg(await lerConfigPlanilha())
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const criar = async () => {
    setOcupado('criar')
    try {
      const r = await criarPlanilha()
      await registrarPlanilhaCriada(r.id, r.url)
      toast.success('Planilha criada no seu Google Drive.', {
        description: 'Agora toque em Sincronizar para gravar os dados.',
        duration: 8000,
      })
      await carregar()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Não consegui criar a planilha: ${msg}`, { duration: 10000 })
    } finally {
      setOcupado('')
    }
  }

  const sincronizar = async () => {
    setOcupado('sincronizar')
    try {
      const r = await sincronizarPlanilha()
      toast.success(r.mensagem, {
        description: 'Abra a planilha no link abaixo para conferir.',
        duration: 9000,
      })
      await carregar()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Falha na sincronização: ${msg}`, { duration: 12000 })
      await carregar()
    } finally {
      setOcupado('')
    }
  }

  const apontar = async () => {
    if (!linkManual.trim()) {
      toast.error('Cole o link da planilha do Google.')
      return
    }
    setOcupado('apontar')
    try {
      const r = await apontarPlanilha(linkManual)
      toast.success('Planilha configurada.', {
        description: r.url,
        duration: 8000,
      })
      setLinkManual('')
      await carregar()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Não consegui usar essa planilha: ${msg}`, { duration: 12000 })
    } finally {
      setOcupado('')
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="text-sm font-semibold">Somente administradores</p>
        <p className="mt-1 text-xs text-muted-foreground">A planilha é do dono do negócio.</p>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a configuração...
      </div>
    )
  }

  const temPlanilha = Boolean(cfg?.id)
  const ultima = cfg?.sincronizadoEm ? new Date(cfg.sincronizadoEm).toLocaleString('pt-BR') : ''

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black tracking-tight">
          <Sheet className="h-5 w-5 text-emerald-700" /> Planilha do Google
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          O financeiro do CRM gravado direto numa planilha do seu Drive — as abas Lançamentos e
          Contas a Receber, sempre iguais ao sistema.
        </p>
      </div>

      {/* ---------- sem planilha: oferece criar ---------- */}
      {!temPlanilha && (
        <Card className="border-emerald-300 bg-emerald-50/40">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-bold">Nenhuma planilha configurada</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Crie uma nova no seu Google Drive, ou aponte o CRM para uma que você já usa. Nada é
                criado sem você tocar no botão.
              </p>
            </div>
            <Button
              onClick={criar}
              disabled={ocupado === 'criar'}
              className="h-9 w-full gap-1.5 bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800"
            >
              {ocupado === 'criar' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar planilha no meu Drive
            </Button>

            <div className="relative py-1 text-center">
              <span className="text-[10px] uppercase text-muted-foreground">ou</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold">Usar uma planilha que já existe</Label>
              <Input
                value={linkManual}
                onChange={(e) => setLinkManual(e.target.value)}
                placeholder="Cole o link da planilha do Google"
                className="h-9 text-xs"
              />
              <Button
                onClick={apontar}
                disabled={ocupado === 'apontar'}
                variant="outline"
                className="h-8 w-full gap-1.5 text-[11px] font-bold"
              >
                {ocupado === 'apontar' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Usar esta planilha
              </Button>
              <p className="text-[10px] leading-snug text-muted-foreground">
                A planilha precisa ser sua ou estar compartilhada com você. O CRM vai criar as abas
                se ainda não existirem.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- com planilha: sincroniza ---------- */}
      {temPlanilha && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    {cfg?.status === 'SINCRONIZADO' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : cfg?.status === 'ERRO' ? (
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600" />
                    )}
                    {cfg?.status === 'SINCRONIZADO'
                      ? 'Sincronizada'
                      : cfg?.status === 'ERRO'
                        ? 'Última tentativa falhou'
                        : 'Configurada, ainda não sincronizada'}
                  </p>
                  {ultima && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Última sincronização: {ultima}
                    </p>
                  )}
                  {cfg?.linhas && (
                    <p className="text-[10px] text-muted-foreground">Conteúdo: {cfg.linhas}</p>
                  )}
                </div>
                <a href={cfg?.url} target="_blank" rel="noreferrer" className="shrink-0">
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px]">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </Button>
                </a>
              </div>

              {cfg?.erro && (
                <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] leading-snug text-rose-800">
                  {cfg.erro}
                </p>
              )}

              <Button
                onClick={sincronizar}
                disabled={ocupado === 'sincronizar'}
                className="h-10 w-full gap-1.5 bg-[#0B3D91] text-sm font-bold text-white hover:bg-[#0B3D91]/90"
              >
                {ocupado === 'sincronizar' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {ocupado === 'sincronizar' ? 'Gravando na planilha...' : 'Sincronizar agora'}
              </Button>
              <p className="text-[10px] leading-snug text-muted-foreground">
                A sincronização regrava as duas abas inteiras. A planilha é ESPELHO do CRM: o que
                você editar direto nela é substituído na próxima sincronização.
              </p>
            </CardContent>
          </Card>

          <details className="rounded-lg border bg-card p-3">
            <summary className="cursor-pointer text-[11px] font-bold">Trocar a planilha</summary>
            <div className="mt-2 space-y-1.5">
              <Input
                value={linkManual}
                onChange={(e) => setLinkManual(e.target.value)}
                placeholder="Cole o link da nova planilha"
                className="h-9 text-xs"
              />
              <Button
                onClick={apontar}
                disabled={ocupado === 'apontar'}
                variant="outline"
                className="h-8 w-full gap-1.5 text-[11px]"
              >
                {ocupado === 'apontar' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Usar esta planilha
              </Button>
            </div>
          </details>

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
            <strong>O backup no OneDrive continua.</strong> Esta planilha é uma segunda cópia, no
            Google, para você abrir no celular. Uma não substitui a outra.
          </p>
        </>
      )}
    </div>
  )
}
