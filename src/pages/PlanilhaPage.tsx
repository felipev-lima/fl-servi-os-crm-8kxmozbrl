import React, { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkOrders, getOrderMaterials } from '@/services/api'
import { WorkOrder } from '@/types/flservicos'
import { gerarPlanilhaOrcamento, entregarPlanilha } from '@/lib/planilhaOrcamento'
import {
  avisarSincronizacaoLote,
  ultimaSincronizacao,
  EstadoSincronizacao,
} from '@/lib/onedriveSync'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  Circle,
  CalendarDays,
  AlertTriangle,
  CloudUpload,
  CloudOff,
  Send,
  Clock3,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * Gera a planilha de faturamento no formato da planilha interna do Felipe e
 * controla o que já foi transmitido para o sistema financeiro dele.
 *
 * O controle de envio ('PENDENTE' / 'ENVIADA') vive na própria OS, campo
 * `planilha_envio`. Assim ele marca cada OS como transmitida e, na próxima vez,
 * vê de imediato o que ainda falta mandar — sem conferir na planilha externa.
 */
export default function PlanilhaPage() {
  const { isAdmin } = useAuth()
  const [ordens, setOrdens] = useState<WorkOrder[]>([])
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [sync, setSync] = useState<EstadoSincronizacao | null>(null)
  /** Filtro da lista: todas, só pendentes, só enviadas */
  const [filtroEnvio, setFiltroEnvio] = useState<'TODAS' | 'PENDENTE' | 'ENVIADA'>('TODAS')
  const [marcando, setMarcando] = useState(false)

  useEffect(() => {
    void carregar()
    setSync(ultimaSincronizacao())
  }, [])

  const carregar = async () => {
    setCarregando(true)
    try {
      const lista = await getWorkOrders('status != "CANCELADA"')
      setOrdens(lista)
    } catch (_) {
      toast.error('Não foi possível carregar as ordens de serviço.')
    } finally {
      setCarregando(false)
    }
  }

  /** Situação de envio de uma OS (sem o campo = pendente) */
  const situacao = (o: WorkOrder): 'PENDENTE' | 'ENVIADA' =>
    (o as any).planilha_envio === 'ENVIADA' ? 'ENVIADA' : 'PENDENTE'

  const alternar = (id: string) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  /** Seleciona todas as OS do mês escolhido, respeitando o filtro de envio */
  const selecionarMes = () => {
    const doMes = ordensDoMes.filter((o) => {
      if (filtroEnvio === 'TODAS') return true
      return situacao(o) === filtroEnvio
    })
    setSelecionadas(new Set(doMes.map((o) => o.id)))
    toast.info(
      doMes.length === 0
        ? 'Nenhuma OS nesse mês com esse filtro.'
        : `${doMes.length} OS de ${mes} selecionada(s).`,
    )
  }

  const gerar = async () => {
    const escolhidas = ordens.filter((o) => selecionadas.has(o.id))
    if (escolhidas.length === 0) {
      toast.error('Selecione pelo menos uma OS.')
      return
    }
    setGerando(true)
    try {
      const dados: { order: any; materiais: any[] }[] = []
      for (const o of escolhidas) {
        const materiais = await getOrderMaterials(o.id)
        dados.push({ order: o, materiais })
      }
      const { blob, nome } = await gerarPlanilhaOrcamento(dados)
      await entregarPlanilha(blob, nome)

      avisarSincronizacaoLote(
        escolhidas.map((o) => o.id),
        'planilha/orcamento gerado',
      )
      setTimeout(() => setSync(ultimaSincronizacao()), 1500)

      toast.success(
        escolhidas.length === 1
          ? 'Planilha gerada! Marque como enviada quando transmitir ao financeiro.'
          : `Planilha com ${escolhidas.length} OS gerada! Marque como enviada quando transmitir.`,
      )
    } catch (err: any) {
      console.error(err)
      toast.error('Não foi possível gerar a planilha.')
    } finally {
      setGerando(false)
    }
  }

  /** Marca as OS selecionadas como ENVIADAS ou PENDENTES */
  const marcarEnvio = async (novaSituacao: 'ENVIADA' | 'PENDENTE') => {
    const ids = Array.from(selecionadas)
    if (ids.length === 0) {
      toast.error('Selecione pelo menos uma OS.')
      return
    }
    setMarcando(true)
    let ok = 0
    let falhou = 0
    try {
      for (const id of ids) {
        try {
          await pb.collection('work_orders').update(id, {
            planilha_envio: novaSituacao,
            planilha_enviada_em: novaSituacao === 'ENVIADA' ? new Date().toISOString() : '',
          })
          ok++
        } catch (_) {
          falhou++
        }
      }

      // atualiza a lista local sem recarregar tudo
      setOrdens((prev) =>
        prev.map((o) =>
          ids.includes(o.id)
            ? ({
                ...o,
                planilha_envio: novaSituacao,
                planilha_enviada_em: novaSituacao === 'ENVIADA' ? new Date().toISOString() : '',
              } as any)
            : o,
        ),
      )

      if (falhou === 0) {
        toast.success(
          `${ok} OS marcada(s) como ${novaSituacao === 'ENVIADA' ? 'ENVIADA(S)' : 'PENDENTE(S)'}.`,
        )
      } else {
        toast.warning(`${ok} marcada(s), ${falhou} falharam.`)
      }
    } finally {
      setMarcando(false)
    }
  }

  const dataDaOs = (o: WorkOrder) =>
    String((o as any).scheduled_date || (o as any).completed_at || (o as any).created || '')

  const ordensDoMes = useMemo(
    () => ordens.filter((o) => dataDaOs(o).slice(0, 7) === mes),
    [ordens, mes],
  )

  const filtradas = useMemo(() => {
    const base = ordensDoMes
    const t = busca.trim().toLowerCase()
    return base.filter((o) => {
      if (filtroEnvio !== 'TODAS' && situacao(o) !== filtroEnvio) return false
      if (!t) return true
      const nome = (o.expand?.client?.name || '').toLowerCase()
      return nome.includes(t) || String(o.order_number).includes(t)
    })
  }, [ordensDoMes, busca, filtroEnvio])

  const totalSelecionadas = ordens
    .filter((o) => selecionadas.has(o.id))
    .reduce((acc, o) => acc + Number((o as any).service_value || 0), 0)

  const pendentesNoMes = ordensDoMes.filter((o) => situacao(o) === 'PENDENTE').length
  const enviadasNoMes = ordensDoMes.filter((o) => situacao(o) === 'ENVIADA').length

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-semibold">Somente administradores</p>
        <p className="text-xs text-muted-foreground mt-1">
          A planilha de faturamento mostra valores e é restrita ao administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Planilha de Faturamento</h1>
        <p className="text-xs text-muted-foreground">
          Gera o Excel no seu formato e controla o que já foi transmitido ao financeiro.
        </p>
      </div>

      {sync && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${
            sync.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {sync.ok ? (
            <CloudUpload className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>
            <strong>OneDrive:</strong> {sync.ok ? 'aviso enviado' : 'aviso não confirmado'} em{' '}
            {new Date(sync.quando).toLocaleString('pt-BR')} — {sync.motivo}
          </span>
        </div>
      )}

      {/* mês + filtro de envio */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Mês</Label>
              <Input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="h-9 text-xs w-[150px]"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selecionarMes}
              className="h-9 text-xs gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Selecionar o mês
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelecionadas(new Set())}
              className="h-9 text-xs"
            >
              Limpar
            </Button>
          </div>

          {/* Filtro de situação do envio */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold">Situação do envio</Label>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={filtroEnvio === 'TODAS' ? 'default' : 'outline'}
                onClick={() => setFiltroEnvio('TODAS')}
                className={`h-8 text-[11px] ${filtroEnvio === 'TODAS' ? 'bg-slate-900 text-white' : ''}`}
              >
                Todas ({ordensDoMes.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filtroEnvio === 'PENDENTE' ? 'default' : 'outline'}
                onClick={() => setFiltroEnvio('PENDENTE')}
                className={`h-8 text-[11px] gap-1 ${
                  filtroEnvio === 'PENDENTE' ? 'bg-amber-600 text-white' : 'text-amber-700'
                }`}
              >
                <Clock3 className="w-3 h-3" /> Faltam enviar ({pendentesNoMes})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filtroEnvio === 'ENVIADA' ? 'default' : 'outline'}
                onClick={() => setFiltroEnvio('ENVIADA')}
                className={`h-8 text-[11px] gap-1 ${
                  filtroEnvio === 'ENVIADA' ? 'bg-emerald-700 text-white' : 'text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" /> Já enviadas ({enviadasNoMes})
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">Buscar cliente ou nº da OS</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite parte do nome ou o número"
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando ordens...
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((o) => {
            const marcada = selecionadas.has(o.id)
            const enviada = situacao(o) === 'ENVIADA'
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                className={`w-full text-left p-3 rounded-lg border transition flex items-start gap-3 ${
                  marcada
                    ? 'border-[#0F6A3A] bg-[#0F6A3A]/5'
                    : 'border-slate-200 bg-card hover:border-[#0F6A3A]/40'
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    marcada ? 'bg-[#0F6A3A] border-[#0F6A3A]' : 'border-slate-300'
                  }`}
                >
                  {marcada && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#0F6A3A]">
                      #{o.order_number}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {o.expand?.client?.name || 'Cliente'}
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      {o.status}
                    </Badge>
                    {/* selo de situação do envio ao financeiro */}
                    {enviada ? (
                      <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border-emerald-300 gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> ENVIADA
                      </Badge>
                    ) : (
                      <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300 gap-0.5">
                        <Circle className="w-2.5 h-2.5" /> PENDENTE
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span>
                      {o.scheduled_date
                        ? new Date(o.scheduled_date).toLocaleDateString('pt-BR')
                        : '—'}
                    </span>
                    <span>{o.service_type}</span>
                    <span className="font-mono">
                      MO R$ {Number((o as any).service_value || 0).toFixed(2)}
                    </span>
                    {enviada && (o as any).planilha_enviada_em && (
                      <span className="text-emerald-700">
                        Enviada em{' '}
                        {new Date((o as any).planilha_enviada_em).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {filtradas.length === 0 && (
            <div className="p-8 text-center border-2 border-dashed rounded-xl">
              <FileSpreadsheet className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold">Nenhuma OS encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ajuste o mês, o filtro de envio ou a busca.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ações */}
      <div className="sticky bottom-2 bg-card border rounded-xl p-3 shadow-lg space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">
            {selecionadas.size === 0
              ? 'Nenhuma OS selecionada'
              : `${selecionadas.size} OS selecionada(s)`}
          </span>
          {selecionadas.size > 0 && (
            <span className="font-mono text-[#0F6A3A] font-bold">
              Mão de obra: R$ {totalSelecionadas.toFixed(2)}
            </span>
          )}
        </div>

        {/* marcar envio ao financeiro */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => marcarEnvio('ENVIADA')}
            disabled={marcando || selecionadas.size === 0}
            className="h-9 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold gap-1.5 text-xs"
          >
            {marcando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Marcar como ENVIADA
          </Button>
          <Button
            onClick={() => marcarEnvio('PENDENTE')}
            disabled={marcando || selecionadas.size === 0}
            variant="outline"
            className="h-9 text-xs font-semibold gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            <Clock3 className="w-3.5 h-3.5" />
            Marcar como PENDENTE
          </Button>
        </div>

        <Button
          onClick={gerar}
          disabled={gerando || selecionadas.size === 0}
          className="w-full bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold gap-2"
        >
          {gerando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {gerando ? 'Gerando planilha...' : 'Gerar planilha Excel'}
        </Button>
      </div>
    </div>
  )
}
