/**
 * Alíquotas por mês.
 *
 * O Felipe recebe do contador a carga tributária do mês. Aqui ele registra
 * cada uma, com a data de vigência e uma anotação de onde veio.
 *
 * O histórico importa: mudar a alíquota de dezembro NÃO pode reescrever o
 * lucro de novembro. Por isso cada mês tem a sua linha, e o Faturamento usa a
 * do mês que está sendo olhado.
 *
 * Um mês sem linha própria herda a do mês anterior mais próximo — é assim que
 * a carga funciona: só muda quando muda.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  listarAliquotas,
  salvarAliquota,
  apagarAliquota,
  rotuloPeriodo,
  PADRAO,
  type AliquotaMes,
} from '@/lib/aliquotas'
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
import { Loader2, Plus, Save, Trash2, Percent, Info, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

export default function AliquotasPage() {
  const [lista, setLista] = useState<AliquotaMes[]>([])
  const [carregando, setCarregando] = useState(true)

  const [aberto, setAberto] = useState(false)
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7))
  const [produto, setProduto] = useState('8')
  const [servico, setServico] = useState('11')
  const [operacional, setOperacional] = useState('3')
  const [efetiva, setEfetiva] = useState('')
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      setLista(await listarAliquotas())
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const abrirNovo = () => {
    setPeriodo(new Date().toISOString().slice(0, 7))
    setProduto(String(PADRAO.product_percent))
    setServico(String(PADRAO.service_percent))
    setOperacional(String(PADRAO.operational_percent))
    setEfetiva('')
    setNota('')
    setAberto(true)
  }

  const abrirEdicao = (a: AliquotaMes) => {
    setPeriodo(a.periodo)
    setProduto(String(a.product_percent ?? PADRAO.product_percent))
    setServico(String(a.service_percent ?? PADRAO.service_percent))
    setOperacional(String(a.operational_percent ?? PADRAO.operational_percent))
    setEfetiva(
      a.aliq_efetiva !== undefined && a.aliq_efetiva !== null ? String(a.aliq_efetiva) : '',
    )
    setNota(a.note || '')
    setAberto(true)
  }

  const salvar = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      toast.error('Informe o mês de vigência.')
      return
    }
    setSalvando(true)
    try {
      await salvarAliquota({
        periodo,
        product_percent: Number(String(produto).replace(',', '.')) || 0,
        service_percent: Number(String(servico).replace(',', '.')) || 0,
        operational_percent: Number(String(operacional).replace(',', '.')) || 0,
        aliq_efetiva: efetiva ? Number(String(efetiva).replace(',', '.')) : undefined,
        note: nota,
      })
      toast.success(`Alíquota de ${rotuloPeriodo(periodo)} gravada.`)
      setAberto(false)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gravar.')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (a: AliquotaMes) => {
    if (!a.id) return
    if (!confirm(`Excluir a alíquota de ${rotuloPeriodo(a.periodo)}?`)) return
    await apagarAliquota(a.id)
    toast.success('Excluída.')
    void carregar()
  }

  /** ordem do mais recente para o mais antigo */
  const ordenada = useMemo(
    () => [...lista].sort((a, b) => (b.periodo || '').localeCompare(a.periodo || '')),
    [lista],
  )

  /** o que vale hoje: a linha mais recente */
  const vigente = ordenada[0]

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Alíquotas</h1>
          <p className="text-[11px] text-muted-foreground">
            Carga tributária por mês — o Faturamento usa a do mês consultado
          </p>
        </div>
        <Button
          onClick={abrirNovo}
          className="h-9 shrink-0 gap-1.5 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
        >
          <Plus className="h-4 w-4" /> Nova
        </Button>
      </div>

      {vigente && (
        <Card className="border-[#0B3D91]/30 bg-[#0B3D91]/5">
          <CardContent className="space-y-1 p-3">
            <span className="text-[9px] font-bold uppercase text-[#0B3D91]">
              Vigente — {rotuloPeriodo(vigente.periodo)}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Produto', vigente.product_percent],
                ['Serviço', vigente.service_percent],
                ['Operacional', vigente.operational_percent],
              ].map(([rot, val]) => (
                <div key={rot as string}>
                  <span className="block text-[8px] text-muted-foreground">{rot}</span>
                  <span className="font-mono text-sm font-black text-[#0B3D91]">
                    {Number(val ?? 0)}%
                  </span>
                </div>
              ))}
            </div>
            {vigente.aliq_efetiva ? (
              <p className="text-[9px] text-muted-foreground">
                Alíquota efetiva informada pelo contador:{' '}
                <strong>{Number(vigente.aliq_efetiva)}%</strong>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5">
        <p className="flex gap-1.5 text-[10px] leading-relaxed text-sky-900">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Quando o contador mandar a carga nova, cadastre o mês aqui. O resultado dos meses
            anteriores <strong>não muda</strong> — cada mês fica com a alíquota que valia nele. Mês
            sem cadastro usa a do mês anterior mais próximo.
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        {ordenada.map((a) => (
          <Card key={a.id}>
            <CardContent className="space-y-1.5 p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="border-[#0B3D91] bg-[#0B3D91] px-1.5 py-0 text-[9px] font-bold text-white">
                      {rotuloPeriodo(a.periodo)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      prod. {Number(a.product_percent ?? 0)}% · serv.{' '}
                      {Number(a.service_percent ?? 0)}% · oper. {Number(a.operational_percent ?? 0)}
                      %
                    </span>
                  </div>
                  {a.aliq_efetiva ? (
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      efetiva: {Number(a.aliq_efetiva)}%
                    </p>
                  ) : null}
                  {a.note && <p className="text-[9px] italic text-muted-foreground">{a.note}</p>}
                </div>
              </div>
              <div className="flex gap-1 border-t pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => abrirEdicao(a)}
                  className="h-6 flex-1 gap-1 text-[9px]"
                >
                  <Save className="h-2.5 w-2.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => excluir(a)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {ordenada.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <CalendarDays className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhuma alíquota cadastrada</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              O Faturamento está usando o padrão 8% / 11% / 3%.
            </p>
          </div>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[94vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Alíquota do mês</DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Mês de vigência</Label>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold">Produto %</Label>
                <Input
                  inputMode="decimal"
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold">Serviço %</Label>
                <Input
                  inputMode="decimal"
                  value={servico}
                  onChange={(e) => setServico(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold">Operac. %</Label>
                <Input
                  inputMode="decimal"
                  value={operacional}
                  onChange={(e) => setOperacional(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">
                Alíquota efetiva do contador (opcional)
              </Label>
              <Input
                inputMode="decimal"
                value={efetiva}
                onChange={(e) => setEfetiva(e.target.value)}
                placeholder="ex.: 9,5"
                className="h-9 text-xs"
              />
              <p className="text-[9px] text-muted-foreground">
                Só para registro — o cálculo usa produto, serviço e operacional.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">Anotação (opcional)</Label>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Relatório do contador 11/2026"
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAberto(false)}
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
                <Percent className="h-3.5 w-3.5" />
              )}
              Gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
