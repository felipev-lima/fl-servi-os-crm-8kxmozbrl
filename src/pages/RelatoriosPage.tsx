/**
 * Relatórios — a visão do cliente no formato da planilha.
 *
 * É a entrega central: escolher o cliente e ver TODOS os itens já lançados numa
 * lista com data, tipo, produto/serviço, descrição, quantidade, unitário e
 * total — sem abrir PDF por PDF. Fecha com os quatro subtotais e o débito.
 *
 * Exporta em Excel pelo mesmo layout, para ele guardar ou mandar.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getClientsSummary, getTransactionsByClient } from '@/services/crm'
import type { ClientSummary, Transaction } from '@/types/crm'
import { TIPOS, brl, dataBR, totalDaLinha, semAcento } from '@/types/crm'
import { baixarExcel, type BlocoPlanilha } from '@/lib/exportarPlanilha'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RelatorioDebitoDialog } from '@/components/RelatorioDebitoDialog'
import {
  Search,
  Loader2,
  FileSpreadsheet,
  Printer,
  Users,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  ArrowDownAZ,
  CalendarDays,
  CircleDollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { ordenarClientesDebito, ROTULO_ORDEM, type OrdemDebito } from '@/lib/ordenacaoDebito'

export default function RelatoriosPage() {
  const [params, setParams] = useSearchParams()
  const [resumos, setResumos] = useState<ClientSummary[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState<string | null>(params.get('cliente'))
  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [carregandoItens, setCarregandoItens] = useState(false)
  /** ordem escolhida nos botões — o PDF sai na MESMA sequência */
  const [ordem, setOrdem] = useState<OrdemDebito>('valor')
  /** PDF do relatório de débito por cliente */
  const [relatorioAberto, setRelatorioAberto] = useState(false)

  useEffect(() => {
    getClientsSummary()
      .then(setResumos)
      .catch(() => toast.error('Não foi possível carregar os clientes.'))
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
    if (!clienteId) return
    setCarregandoItens(true)
    getTransactionsByClient(clienteId)
      .then(setLancamentos)
      .catch(() => toast.error('Não foi possível carregar os lançamentos.'))
      .finally(() => setCarregandoItens(false))
  }, [clienteId])

  const cliente = resumos.find((r) => r.id === clienteId)

  /** A MESMA lista que o PDF usa — ordenada pela regra do Felipe. */
  const listaOrdenada = useMemo(() => ordenarClientesDebito(resumos, ordem), [resumos, ordem])

  const listaClientes = useMemo(() => {
    const t = semAcento(busca)
    if (!t && !busca.trim()) return listaOrdenada
    const alvo = busca.trim()
    return listaOrdenada.filter(
      (r) =>
        semAcento(r.name).includes(t) ||
        semAcento(r.nickname).includes(t) ||
        (r.document || '').includes(alvo),
    )
  }, [listaOrdenada, busca])

  /** totais para o resumo acima da lista */
  const totalDevedores = useMemo(
    () => listaOrdenada.filter((r) => r.saldo > 0.005).reduce((s, r) => s + r.saldo, 0),
    [listaOrdenada],
  )
  const qtdDevedores = useMemo(
    () => listaOrdenada.filter((r) => r.saldo > 0.005).length,
    [listaOrdenada],
  )

  const soma = (k: string) =>
    lancamentos.filter((t) => t.kind === k).reduce((s, t) => s + totalDaLinha(t), 0)

  const capital = soma('CAPITAL')
  const consumo = soma('CONSUMO')
  const servico = soma('SERVICO')
  const dinheiro = soma('DINHEIRO')
  const total = capital + consumo + servico + dinheiro

  const linhas = lancamentos.map((t) => [
    dataBR(t.date),
    TIPOS[t.kind].label,
    t.item_type === 'SERVICO' ? 'Serviço' : 'Produto',
    t.description,
    t.details || '',
    Number(t.quantity ?? 0),
    Number(t.unit_price ?? 0),
    totalDaLinha(t),
  ])

  const bloco: BlocoPlanilha | null = cliente
    ? {
        titulo: `RELATÓRIO DE LANÇAMENTOS — ${cliente.nickname || cliente.name}`,
        cabecalho: [
          { rotulo: 'CLIENTE:', valor: cliente.name },
          { rotulo: 'CNPJ/CPF:', valor: cliente.document || '—' },
          { rotulo: 'TELEFONE:', valor: cliente.phone || '—' },
          { rotulo: 'EMITIDO EM:', valor: new Date().toLocaleDateString('pt-BR') },
        ],
        colunas: [
          { titulo: 'DATA', largura: 80, alinhar: 'center' },
          { titulo: 'TIPO', largura: 90, alinhar: 'center' },
          { titulo: 'PRODUTO / SERVIÇO', largura: 110, alinhar: 'center' },
          { titulo: 'DESCRIÇÃO DETALHADA', largura: 320 },
          { titulo: 'OBSERVAÇÃO', largura: 140 },
          { titulo: 'QTD', largura: 55, alinhar: 'right' },
          { titulo: 'VALOR UNIT. (R$)', largura: 105, alinhar: 'right', moeda: true },
          { titulo: 'VALOR TOTAL (R$)', largura: 110, alinhar: 'right', moeda: true },
        ],
        linhas,
        totais: [
          { rotulo: 'SUB TOTAL CAPITAL', valor: capital, cor: '#EDE9FE' },
          { rotulo: 'SUB TOTAL CONSUMO', valor: consumo, cor: '#FEF3C7' },
          { rotulo: 'SUB TOTAL SERVIÇO', valor: servico, cor: '#DBEAFE' },
          { rotulo: 'SUB TOTAL DINHEIRO', valor: dinheiro, cor: '#D1FAE5' },
          { rotulo: 'DÉBITO TOTAL', valor: total, cor: '#0B3D91' },
        ],
      }
    : null

  const exportar = () => {
    if (!bloco || !cliente) return
    const nome = `RELATORIO-${(cliente.nickname || cliente.name)
      .replace(/[^\wÀ-ÿ ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40)}`
    baixarExcel(nome, [bloco])
    toast.success('Excel gerado.')
  }

  const abrirCliente = (id: string) => {
    setClienteId(id)
    const p = new URLSearchParams(params)
    p.set('cliente', id)
    setParams(p, { replace: true })
  }

  const voltar = () => {
    setClienteId(null)
    const p = new URLSearchParams(params)
    p.delete('cliente')
    setParams(p, { replace: true })
  }

  // ---------- lista de clientes ----------
  if (!clienteId) {
    return (
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Relatórios</h1>
          <p className="text-[11px] text-muted-foreground">
            Escolha o cliente e veja todos os itens lançados — no formato da planilha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ordenar por:
          </span>
          {(
            [
              ['nome', 'Nome', ArrowDownAZ],
              ['data', 'Data', CalendarDays],
              ['valor', 'Valor', CircleDollarSign],
            ] as const
          ).map(([chave, rotulo, Icone]) => (
            <Button
              key={chave}
              type="button"
              size="sm"
              variant={ordem === chave ? 'default' : 'outline'}
              onClick={() => setOrdem(chave)}
              aria-pressed={ordem === chave}
              className="h-7 gap-1 px-2 text-[11px]"
              style={ordem === chave ? { background: '#0B3D91', color: '#fff' } : undefined}
            >
              <Icone className="h-3 w-3" /> {rotulo}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-bold text-foreground">{qtdDevedores}</span> cliente(s) em débito ·
            total <span className="font-bold text-amber-800">{brl(totalDevedores)}</span> · ordem:{' '}
            {ROTULO_ORDEM[ordem]}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => setRelatorioAberto(true)}
            className="h-7 gap-1 bg-[#0B3D91] px-2.5 text-[11px] text-white hover:bg-[#0B3D91]/90"
          >
            <Printer className="h-3 w-3" /> Gerar relatório (PDF)
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por apelido, razão social ou CNPJ..."
            className="h-10 pl-9 text-sm"
          />
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-1.5">
            {listaClientes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => abrirCliente(r.id)}
                className="flex w-full items-center gap-2 rounded-lg border bg-card p-2.5 text-left transition hover:border-[#0B3D91]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{r.nickname || r.name}</p>
                  {r.nickname && (
                    <p className="truncate text-[9px] text-muted-foreground">{r.name}</p>
                  )}
                  <p className="text-[9px] text-muted-foreground">{r.lancamentos} lançamento(s)</p>
                </div>
                <span
                  className={`shrink-0 font-mono text-xs font-bold ${
                    r.saldo > 0.005
                      ? 'text-amber-800'
                      : r.saldo < -0.005
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                  }`}
                >
                  {brl(r.saldo)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}

            {listaClientes.length === 0 && (
              <div className="rounded-xl border-2 border-dashed p-10 text-center">
                <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-semibold">Nenhum cliente encontrado</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---------- relatório do cliente ----------
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={voltar} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-black">
            {cliente?.nickname || cliente?.name || 'Cliente'}
          </h1>
          <p className="text-[10px] text-muted-foreground">
            {lancamentos.length} lançamento(s) · formato da planilha
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button
          onClick={exportar}
          disabled={!bloco || lancamentos.length === 0}
          className="h-8 flex-1 gap-1.5 bg-[#0B3D91] text-[11px] text-white hover:bg-[#0B3D91]/90"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Baixar Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => window.print()}
          disabled={lancamentos.length === 0}
          className="h-8 gap-1.5 text-[11px]"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setCarregandoItens(true)
            getTransactionsByClient(clienteId)
              .then(setLancamentos)
              .finally(() => setCarregandoItens(false))
          }}
          className="h-8 w-8 p-0"
          aria-label="Recarregar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {carregandoItens ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens...
        </div>
      ) : lancamentos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <FileSpreadsheet className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Nenhum lançamento</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Este cliente ainda não tem itens lançados no CRM.
          </p>
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5">
              {[
                ['CAPITAL', capital],
                ['CONSUMO', consumo],
                ['SERVIÇO', servico],
                ['DINHEIRO', dinheiro],
                ['DÉBITO', total],
              ].map(([rot, val]) => (
                <div key={rot as string}>
                  <span className="block text-[8px] uppercase text-muted-foreground">{rot}</span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      rot === 'DÉBITO'
                        ? (val as number) > 0
                          ? 'text-amber-800'
                          : 'text-emerald-700'
                        : ''
                    }`}
                  >
                    {brl(val as number)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-x-auto">
            <CardContent className="p-0">
              <table className="w-full min-w-[720px] border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[#0B3D91] text-white">
                    {['DATA', 'TIPO', 'PROD/SERV', 'DESCRIÇÃO', 'QTD', 'UNIT.', 'TOTAL'].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`p-1.5 font-bold ${i >= 4 ? 'text-right' : 'text-left'}`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap p-1.5">{dataBR(t.date)}</td>
                      <td className="p-1.5">
                        <span
                          className={`rounded border px-1 py-0.5 text-[8px] font-bold ${
                            TIPOS[t.kind].cor
                          } ${TIPOS[t.kind].bg}`}
                        >
                          {TIPOS[t.kind].label}
                        </span>
                      </td>
                      <td className="p-1.5 text-muted-foreground">
                        {t.item_type === 'SERVICO' ? 'Serviço' : 'Produto'}
                      </td>
                      <td className="max-w-[260px] p-1.5">{t.description}</td>
                      <td className="p-1.5 text-right font-mono">{Number(t.quantity ?? 0)}</td>
                      <td className="p-1.5 text-right font-mono">
                        {brl(Number(t.unit_price ?? 0))}
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono font-bold ${
                          totalDaLinha(t) < 0 ? 'text-emerald-700' : ''
                        }`}
                      >
                        {brl(totalDaLinha(t))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {[
                    ['SUB TOTAL CAPITAL', capital, 'bg-violet-50'],
                    ['SUB TOTAL CONSUMO', consumo, 'bg-amber-50'],
                    ['SUB TOTAL SERVIÇO', servico, 'bg-blue-50'],
                    ['SUB TOTAL DINHEIRO', dinheiro, 'bg-emerald-50'],
                  ].map(([rot, val, cor]) => (
                    <tr key={rot as string} className={cor as string}>
                      <td colSpan={6} className="p-1.5 text-right font-bold">
                        {rot}
                      </td>
                      <td className="p-1.5 text-right font-mono font-bold">{brl(val as number)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#0B3D91] text-white">
                    <td colSpan={6} className="p-2 text-right font-black">
                      DÉBITO TOTAL
                    </td>
                    <td className="p-2 text-right font-mono font-black">{brl(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
