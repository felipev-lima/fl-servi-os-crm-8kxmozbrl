/**
 * DRE simples (C9) — demonstrativo mensal dos últimos 12 meses.
 *
 * Receita = lançamentos de venda (sem DINHEIRO, valor gravado).
 * Custo dos produtos = quantidade × custo cadastrado do material (serviço não tem custo).
 * Despesas = contas pagas no mês (bills com status PAGA).
 * Resultado = receita − custo − despesas. A coluna "Var." compara com o mês anterior.
 */
import { useEffect, useMemo, useState } from 'react'
import { getBills } from '@/services/crm'
import { getMaterials } from '@/services/api'
import { todosLancamentos } from '@/services/financeiro'
import type { Bill, Transaction } from '@/types/crm'
import { brl, totalDaLinha } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

type LinhaDRE = {
  chave: string
  receita: number
  custo: number
  despesas: number
  resultado: number
}

const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const rotuloMes = (chave: string) => {
  const [ano, mes] = chave.split('-')
  return `${MESES[Number(mes) - 1]}/${ano}`
}

export default function DrePage() {
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [contas, setContas] = useState<Bill[]>([])
  const [custoPorNome, setCustoPorNome] = useState<Map<string, number>>(new Map())
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [tx, bl, ms] = await Promise.all([todosLancamentos(), getBills(), getMaterials()])
        setLancamentos(tx)
        setContas(bl)
        setCustoPorNome(
          new Map(ms.map((m) => [(m.name || '').trim().toUpperCase(), Number(m.cost || 0)])),
        )
      } catch {
        toast.error('Não foi possível montar o DRE.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const meses = useMemo(() => {
    const hoje = new Date()
    const lista: LinhaDRE[] = []
    const indice = new Map<string, LinhaDRE>()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const linha = { chave: chaveMes(d), receita: 0, custo: 0, despesas: 0, resultado: 0 }
      lista.push(linha)
      indice.set(linha.chave, linha)
    }

    for (const t of lancamentos) {
      if (t.kind === 'DINHEIRO') continue
      const linha = indice.get((t.date || '').slice(0, 7))
      if (!linha) continue
      linha.receita += totalDaLinha(t)
      if (t.item_type !== 'SERVICO') {
        const custo = custoPorNome.get((t.description || '').trim().toUpperCase()) || 0
        linha.custo += custo * Number(t.quantity || 0)
      }
    }

    for (const c of contas) {
      if (c.status !== 'PAGA' || !c.paid_at) continue
      const linha = indice.get(c.paid_at.slice(0, 7))
      if (linha) linha.despesas += Number(c.amount || 0)
    }

    for (const l of lista) l.resultado = l.receita - l.custo - l.despesas
    return lista
  }, [lancamentos, contas, custoPorNome])

  const total = useMemo(
    () =>
      meses.reduce(
        (s, l) => ({
          receita: s.receita + l.receita,
          custo: s.custo + l.custo,
          despesas: s.despesas + l.despesas,
          resultado: s.resultado + l.resultado,
        }),
        { receita: 0, custo: 0, despesas: 0, resultado: 0 },
      ),
    [meses],
  )

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
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">DRE simples</h1>
        <p className="text-[11px] text-muted-foreground">
          Receita − custos − despesas, mês a mês (últimos 12 meses)
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <caption className="sr-only">Demonstrativo mensal</caption>
              <thead>
                <tr className="bg-[#0B3D91] text-white">
                  <th scope="col" className="p-2 text-left">
                    Mês
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Receita
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Custos
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Despesas
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Resultado
                  </th>
                  <th scope="col" className="p-2 text-right">
                    Var. mês ant.
                  </th>
                </tr>
              </thead>
              <tbody>
                {meses.map((l, i) => {
                  const anterior = i > 0 ? meses[i - 1] : null
                  const variacao =
                    anterior && anterior.resultado !== 0
                      ? ((l.resultado - anterior.resultado) / Math.abs(anterior.resultado)) * 100
                      : null
                  return (
                    <tr key={l.chave} className="border-b last:border-0">
                      <td className="p-2 font-semibold capitalize">{rotuloMes(l.chave)}</td>
                      <td className="p-2 text-right font-mono">{brl(l.receita)}</td>
                      <td className="p-2 text-right font-mono text-rose-700">{brl(l.custo)}</td>
                      <td className="p-2 text-right font-mono text-rose-700">{brl(l.despesas)}</td>
                      <td
                        className={`p-2 text-right font-mono font-bold ${
                          l.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {brl(l.resultado)}
                      </td>
                      <td className="p-2 text-right">
                        {variacao === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono ${
                              variacao >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {variacao >= 0 ? (
                              <TrendingUp className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <TrendingDown className="h-3 w-3" aria-hidden="true" />
                            )}
                            {variacao.toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold">
                  <th scope="row" className="p-2 text-left">
                    Total 12 meses
                  </th>
                  <td className="p-2 text-right font-mono">{brl(total.receita)}</td>
                  <td className="p-2 text-right font-mono">{brl(total.custo)}</td>
                  <td className="p-2 text-right font-mono">{brl(total.despesas)}</td>
                  <td className="p-2 text-right font-mono">{brl(total.resultado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
        Custo dos produtos usa o custo cadastrado em Materiais; item sem custo entra como zero.
        Pagamento recebido (dinheiro) não é receita.
      </p>
    </div>
  )
}
