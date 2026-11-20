/**
 * Comissão de técnico (C4).
 *
 * Calcula, no período escolhido, o que cada técnico tem a receber sobre os
 * serviços que executou. A base é o valor de mão de obra das OS finalizadas
 * (não o material — material é custo da empresa, não trabalho do técnico).
 *
 * O percentual é cadastrado por técnico e pode ficar zero: nesse caso a tela
 * avisa em vez de mostrar comissão inventada.
 */
import { useEffect, useMemo, useState } from 'react'
import { getTechnicians, getWorkOrders, updateTechnician } from '@/services/api'
import type { Technician, WorkOrder } from '@/types/flservicos'
import { brl, dataBR } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Save, Percent, Users } from 'lucide-react'
import { toast } from 'sonner'

export default function ComissoesPage() {
  const hoje = new Date()
  const [tecnicos, setTecnicos] = useState<Technician[]>([])
  const [os, setOs] = useState<WorkOrder[]>([])
  const [carregando, setCarregando] = useState(true)

  const primeiro = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const [de, setDe] = useState(primeiro)
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10))

  const [editando, setEditando] = useState<Technician | null>(null)
  const [pct, setPct] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [t, o] = await Promise.all([getTechnicians(), getWorkOrders()])
        setTecnicos(t)
        setOs(o)
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  /** Só OS finalizadas dentro do período entram na comissão */
  const osNoPeriodo = useMemo(
    () =>
      os.filter((o) => {
        if (o.status !== 'FINALIZADA') return false
        const d = (o.completed_at || o.scheduled_date || o.created || '').slice(0, 10)
        return d >= de && d <= ate
      }),
    [os, de, ate],
  )

  const base = (t: Technician) =>
    osNoPeriodo
      .filter((o) => o.technician === t.id)
      .reduce((s, o) => s + Number(o.service_value || 0), 0)

  const totalComissao = tecnicos.reduce(
    (s, t) => s + (base(t) * Number((t as any).commission_percent || 0)) / 100,
    0,
  )

  const abrir = (t: Technician) => {
    setEditando(t)
    setPct(String((t as any).commission_percent ?? ''))
  }

  const salvar = async () => {
    if (!editando) return
    setSalvando(true)
    try {
      const valor = Number(String(pct).replace(',', '.')) || 0
      await updateTechnician(editando.id, { commission_percent: valor } as any)
      setTecnicos((prev) =>
        prev.map((x) => (x.id === editando.id ? ({ ...x, commission_percent: valor } as any) : x)),
      )
      setEditando(null)
      toast.success('Percentual salvo.')
    } catch {
      toast.error('Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Comissões</h1>
        <p className="text-[11px] text-muted-foreground">
          {osNoPeriodo.length} OS finalizada(s) no período · total {brl(totalComissao)}
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-2 p-3">
          <div className="space-y-1">
            <Label className="text-[10px]">De</Label>
            <Input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Até</Label>
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        {tecnicos
          .filter((t) => t.active !== false)
          .map((t) => {
            const b = base(t)
            const p = Number((t as any).commission_percent || 0)
            const valor = (b * p) / 100
            const minhas = osNoPeriodo.filter((o) => o.technician === t.id)
            return (
              <Card key={t.id}>
                <CardContent className="space-y-1.5 p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold">{t.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {minhas.length} OS · base {brl(b)}
                      </p>
                    </div>
                    {p > 0 ? (
                      <>
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-0.5 px-1.5 py-0 text-[8px]"
                        >
                          <Percent className="h-2.5 w-2.5" />
                          {p}
                        </Badge>
                        <span className="shrink-0 font-mono text-xs font-bold text-emerald-700">
                          {brl(valor)}
                        </span>
                      </>
                    ) : (
                      <Badge className="shrink-0 border-amber-300 bg-amber-100 px-1.5 py-0 text-[8px] text-amber-800">
                        sem %
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrir(t)}
                      className="h-6 shrink-0 text-[9px]"
                    >
                      Editar
                    </Button>
                  </div>
                  {minhas.length > 0 && (
                    <div className="border-t pt-1">
                      {minhas.slice(0, 4).map((o) => (
                        <div key={o.id} className="flex justify-between py-0.5 text-[9px]">
                          <span className="truncate text-muted-foreground">
                            #{o.order_number} {dataBR(o.completed_at || o.scheduled_date)} ·{' '}
                            {(o.expand?.client?.nickname || o.expand?.client?.name || '').slice(
                              0,
                              22,
                            )}
                          </span>
                          <span className="shrink-0 font-mono">
                            {brl(Number(o.service_value || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-700">
        A comissão incide sobre o <strong>valor de mão de obra</strong> das OS finalizadas. Material
        não entra — é custo da empresa, não trabalho do técnico.
      </p>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="w-[94vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Comissão do técnico</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] font-semibold text-muted-foreground">{editando?.name}</p>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Percentual sobre a mão de obra</Label>
            <Input
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="10"
              className="h-9 text-xs"
            />
            <p className="text-[9px] text-muted-foreground">
              Deixe em branco ou zero se este técnico não recebe comissão.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditando(null)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando}
              className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
