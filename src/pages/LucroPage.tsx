/**
 * Relatório de lucro (C9).
 *
 * Por cliente: quanto entrou, quanto custou, qual a margem.
 * A mesma ressalva da tela de custos: onde o custo do produto não está
 * cadastrado, a margem NÃO é calculada — fica em branco e o relatório diz
 * sobre quantos por cento dos itens ele realmente vale.
 */
import { useEffect, useMemo, useState } from 'react'
import { getClientsSummary, getTransactions } from '@/services/crm'
import { getMaterials } from '@/services/api'
import type { ClientSummary, Transaction } from '@/types/crm'
import type { Material } from '@/types/flservicos'
import { brl, totalDaLinha } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, Search, Users, ArrowLeft } from 'lucide-react'

export default function LucroPage() {
  const hoje = new Date()
  const primeiro = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const [de, setDe] = useState(primeiro)
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10))
  const [resumos, setResumos] = useState<ClientSummary[]>([])
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setCarregando(true)
      try {
        const [rs, tx, ms] = await Promise.all([
          getClientsSummary(),
          getTransactions({ page: 1, perPage: 500, from: de, to: ate }),
          getMaterials(),
        ])
        setResumos(rs)
        setLancamentos(tx.items)
        setMateriais(ms)
      } finally {
        setCarregando(false)
      }
    })()
  }, [de, ate])

  /** mapa nome→custo, para casar o lançamento (texto) com o cadastro */
  const custoPorNome = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of materiais) {
      const k = (p.name || '').trim().toUpperCase()
      if (k) m.set(k, Number(p.cost || 0))
    }
    return m
  }, [materiais])

  /**
   * Calcula receita, custo e margem por cliente.
   *
   * DINHEIRO é pagamento, não receita — entra abatendo o saldo, não somando.
   * O custo só existe para PRODUTO; mão de obra não tem custo de material.
   */
  const porCliente = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; receita: number; custo: number; itensComCusto: number; itens: number }
    >()
    for (const t of lancamentos) {
      if (t.kind === 'DINHEIRO') continue
      const id = t.client
      if (!mapa.has(id))
        mapa.set(id, {
          nome: t.expand?.client?.nickname || t.expand?.client?.name || 'Cliente',
          receita: 0,
          custo: 0,
          itensComCusto: 0,
          itens: 0,
        })
      const alvo = mapa.get(id)!
      const v = totalDaLinha(t)
      alvo.receita += v
      alvo.itens += 1
      if (t.item_type !== 'SERVICO') {
        const c = custoPorNome.get((t.description || '').trim().toUpperCase()) || 0
        if (c > 0) {
          alvo.custo += c * Number(t.quantity || 0)
          alvo.itensComCusto += 1
        }
      }
    }
    return Array.from(mapa.entries())
      .map(([id, v]) => ({
        id,
        ...v,
        lucro: v.receita - v.custo,
        margem: v.receita > 0 ? ((v.receita - v.custo) / v.receita) * 100 : 0,
        cobertura: v.itens ? (v.itensComCusto / v.itens) * 100 : 0,
      }))
      .sort((a, b) => b.lucro - a.lucro)
  }, [lancamentos, custoPorNome])

  const totais = porCliente.reduce(
    (s, c) => ({
      receita: s.receita + c.receita,
      custo: s.custo + c.custo,
      lucro: s.lucro + c.lucro,
    }),
    { receita: 0, custo: 0, lucro: 0 },
  )

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? porCliente.filter((c) => c.nome.toLowerCase().includes(t)) : porCliente
  }, [porCliente, busca])

  const detalhe = clienteId ? porCliente.find((c) => c.id === clienteId) : null
  const itensDetalhe = lancamentos.filter((t) => t.client === clienteId && t.kind !== 'DINHEIRO')

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  if (detalhe) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setClienteId(null)} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black">{detalhe.nome}</h1>
            <p className="text-[10px] text-muted-foreground">Lucro no período</p>
          </div>
        </div>

        <Card>
          <CardContent className="grid grid-cols-3 gap-2 p-3">
            {[
              ['Receita', detalhe.receita, 'text-blue-700'],
              ['Custo', detalhe.custo, 'text-rose-700'],
              ['Lucro', detalhe.lucro, detalhe.lucro >= 0 ? 'text-emerald-700' : 'text-rose-700'],
            ].map(([rot, val, cor]) => (
              <div key={rot as string}>
                <span className="block text-[8px] uppercase text-muted-foreground">{rot}</span>
                <span className={`font-mono text-[11px] font-bold ${cor}`}>
                  {brl(val as number)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {detalhe.cobertura < 100 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
            Margem calculada sobre <strong>{detalhe.cobertura.toFixed(0)}%</strong> dos itens — os
            demais não têm custo cadastrado.
          </p>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-[#0B3D91] text-white">
                  <th className="p-1.5 text-left">ITEM</th>
                  <th className="p-1.5 text-right">RECEITA</th>
                  <th className="p-1.5 text-right">CUSTO</th>
                  <th className="p-1.5 text-right">LUCRO</th>
                </tr>
              </thead>
              <tbody>
                {itensDetalhe.map((t) => {
                  const r = totalDaLinha(t)
                  const c =
                    t.item_type === 'SERVICO'
                      ? 0
                      : (custoPorNome.get((t.description || '').trim().toUpperCase()) || 0) *
                        Number(t.quantity || 0)
                  return (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="max-w-[200px] p-1.5">{t.description}</td>
                      <td className="p-1.5 text-right font-mono">{brl(r)}</td>
                      <td className="p-1.5 text-right font-mono text-rose-700">
                        {c > 0 ? brl(c) : '—'}
                      </td>
                      <td className="p-1.5 text-right font-mono font-bold text-emerald-700">
                        {c > 0 ? brl(r - c) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">Lucro</h1>
        <p className="text-[11px] text-muted-foreground">
          Receita {brl(totais.receita)} · custo {brl(totais.custo)} · lucro{' '}
          <strong className="text-emerald-700">{brl(totais.lucro)}</strong>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        {lista.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClienteId(c.id)}
            className="flex w-full items-center gap-2 rounded-lg border bg-card p-2.5 text-left transition hover:border-[#0B3D91]/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{c.nome}</p>
              <p className="text-[9px] text-muted-foreground">
                receita {brl(c.receita)} · custo {brl(c.custo)}
              </p>
            </div>
            <Badge
              className={`shrink-0 border px-1.5 py-0 text-[8px] ${
                c.margem >= 30
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                  : c.margem >= 10
                    ? 'border-amber-300 bg-amber-100 text-amber-800'
                    : 'border-rose-300 bg-rose-100 text-rose-800'
              }`}
            >
              {c.margem.toFixed(0)}%
            </Badge>
            <span className="shrink-0 font-mono text-xs font-bold text-emerald-700">
              {brl(c.lucro)}
            </span>
          </button>
        ))}

        {lista.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhum lançamento no período</p>
          </div>
        )}
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">
        Só o que tem custo cadastrado entra no cálculo. Cadastre em <strong>Custos e margem</strong>
        . Registro de pagamento (dinheiro) não é receita.
      </p>
    </div>
  )
}
