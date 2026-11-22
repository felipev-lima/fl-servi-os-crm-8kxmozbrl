/**
 * Faturamento mensal — o resultado do mês, do faturamento ao lucro líquido.
 *
 * A conta que o Felipe pediu, item por item:
 *
 *   1. FATURAMENTO      soma do capital + consumo + serviço (dinheiro NÃO entra:
 *                       pagamento abate dívida, não é venda nova)
 *   2. (-) CUSTO        custo do produto vendido, pelo cadastro
 *   3. = LUCRO BRUTO    e a margem bruta em %
 *   4. (-) IMPOSTO      8% em produto, 11% em serviço (configurável)
 *   5. (-) OPERACIONAL  3% sobre o faturamento (configurável)
 *   6. = LUCRO LÍQUIDO  e a margem líquida em %
 *
 * Todos os percentuais vêm de Configurações e são editáveis — nenhum fica
 * preso no código. Onde o custo do produto não está cadastrado, a tela DIZ que
 * o lucro está subestimado, em vez de mostrar número bonito e falso.
 */
import { useEffect, useMemo, useState } from 'react'
import { getTransactions, getClientsSummary } from '@/services/crm'
import { getMaterials } from '@/services/api'
import { getEmpresa } from '@/lib/empresa'
import { aliquotaDoMes, salvarAliquota, rotuloPeriodo } from '@/lib/aliquotas'
import type { Transaction } from '@/types/crm'
import type { Material } from '@/types/flservicos'
import { brl, TIPOS, totalDaLinha } from '@/types/crm'
import { baixarExcel, type BlocoPlanilha } from '@/lib/exportarPlanilha'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Percent,
  Receipt,
  Wallet,
  FileSpreadsheet,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export default function FaturamentoPage() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const [lancamentos, setLancamentos] = useState<Transaction[]>([])
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)

  // percentuais (vêm de settings, editáveis aqui também)
  const [impProduto, setImpProduto] = useState('8')
  const [impServico, setImpServico] = useState('11')
  const [operacional, setOperacional] = useState('3')
  const [salvandoPct, setSalvandoPct] = useState(false)
  /** de onde veio a alíquota: deste mês, de um mês anterior ou do padrão */
  const [origemAliquota, setOrigemAliquota] = useState<'MES' | 'ANTERIOR' | 'PADRAO'>('PADRAO')
  const [periodoAliquota, setPeriodoAliquota] = useState('')

  /**
   * Três recortes:
   *   MES   o mês escolhido (padrão)
   *   ANO   o ano inteiro, mês a mês no rodapé
   *   TUDO  tudo o que já foi lançado — o "até agora" que ele pediu
   */
  const [modo, setModo] = useState<'MES' | 'ANO' | 'TUDO'>('MES')

  /**
   * Base do imposto: o que foi FATURADO ou o que foi RECEBIDO.
   *
   * O Felipe informou que o Simples incide sobre produto (8%) e serviço (11%),
   * e mais 3% de operacional sobre tudo. A dúvida que fica é a base: no
   * Simples o tributo é sobre a receita, e receita mal paga ainda não é caixa.
   * Em "Recebido" a alíquota é aplicada proporcionalmente ao que entrou, o que
   * aproxima do imposto realmente devido no mês.
   */
  const [baseImposto, setBaseImposto] = useState<'FATURADO' | 'RECEBIDO'>('FATURADO')

  const inicio =
    modo === 'TUDO'
      ? '2000-01-01'
      : modo === 'ANO'
        ? `${ano}-01-01`
        : `${ano}-${String(mes).padStart(2, '0')}-01`
  const fim =
    modo === 'TUDO'
      ? '2100-12-31'
      : modo === 'ANO'
        ? `${ano}-12-31`
        : new Date(ano, mes, 0).toISOString().slice(0, 10)

  /**
   * BUG CORRIGIDO (22/11/2026) — a tela do Faturamento ficava VERDE/VAZIA.
   *
   * Esta variável se chamava `rotuloPeriodo`, o MESMO nome da função
   * `rotuloPeriodo()` importada de `@/lib/aliquotas`. Em JavaScript, a
   * declaração de dentro da função "esconde" o import — então as chamadas
   * `rotuloPeriodo(periodoAliquota)` lá embaixo passavam a chamar uma STRING,
   * e o React caía com "rotuloPeriodo is not a function".
   *
   * Como o erro acontecia durante a renderização, o React desmontava a árvore
   * inteira: `#root` ficava vazio e sobrava só o fundo verde da página. Nada
   * aparecia no console de forma óbvia e o build passava normalmente.
   *
   * Agora o texto tem nome próprio e a função importada continua acessível.
   */
  const rotuloPeriodoAtual =
    modo === 'TUDO'
      ? 'Tudo (acumulado)'
      : modo === 'ANO'
        ? `Ano ${ano}`
        : `${MESES[mes - 1]} / ${ano}`

  const carregar = async () => {
    setCarregando(true)
    try {
      const [tx, ms, emp] = await Promise.all([
        getTransactions({ page: 1, perPage: 1000, from: inicio, to: fim }),
        getMaterials(),
        getEmpresa(),
      ])
      setLancamentos(tx.items)
      setMateriais(ms)
      /**
       * A alíquota vem do MÊS consultado, não de um valor único.
       *
       * O Felipe apura a carga com o contador mês a mês. Guardar por período
       * impede que a alíquota de dezembro reescreva o resultado de novembro.
       * Sem linha para o mês, vale a mais recente anterior; sem nenhuma, o
       * padrão 8 / 11 / 3.
       */
      const periodoAtual = modo === 'MES' ? `${ano}-${String(mes).padStart(2, '0')}` : `${ano}-12`
      const aliq = await aliquotaDoMes(periodoAtual)
      setImpProduto(String(aliq.product_percent))
      setImpServico(String(aliq.service_percent))
      setOperacional(String(aliq.operational_percent))
      setOrigemAliquota(aliq.origem)
      setPeriodoAliquota(aliq.periodoUsado || '')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes, modo])

  /** custo por nome de produto, para casar o lançamento (texto) com o cadastro */
  const custoPorNome = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of materiais) {
      const k = (p.name || '').trim().toUpperCase()
      if (k) m.set(k, Number(p.cost || 0))
    }
    return m
  }, [materiais])

  /**
   * Números do mês.
   *
   * DINHEIRO fica de fora do faturamento: é pagamento recebido, abate dívida.
   * Somar pagamento como venda contaria o mesmo dinheiro duas vezes (uma na
   * venda, outra no recebimento).
   */
  const n = useMemo(() => {
    let vendaProduto = 0
    let vendaServico = 0
    let custo = 0
    let recebido = 0
    let itensSemCusto = 0
    let itensProduto = 0

    for (const t of lancamentos) {
      const v = totalDaLinha(t)
      if (t.kind === 'DINHEIRO') {
        recebido += Math.abs(v)
        continue
      }
      if (t.item_type === 'SERVICO' || t.kind === 'SERVICO') {
        vendaServico += v
      } else {
        vendaProduto += v
        itensProduto += 1
        const c = custoPorNome.get((t.description || '').trim().toUpperCase()) || 0
        if (c > 0) custo += c * Number(t.quantity || 0)
        else itensSemCusto += 1
      }
    }

    const faturamento = vendaProduto + vendaServico
    const lucroBruto = faturamento - custo

    /**
     * Proporção recebida.
     *
     * Em "Recebido", aplica ao imposto a mesma fração do faturamento que já
     * entrou no caixa. É o mais próximo do que a guia do Simples cobra de quem
     * ainda não recebeu boa parte do mês.
     */
    const proporcao =
      baseImposto === 'RECEBIDO' && faturamento > 0 ? Math.min(1, recebido / faturamento) : 1

    const valorImpProduto =
      vendaProduto * (Number(String(impProduto).replace(',', '.')) / 100) * proporcao
    const valorImpServico =
      vendaServico * (Number(String(impServico).replace(',', '.')) / 100) * proporcao
    const imposto = valorImpProduto + valorImpServico
    const valorOperacional = faturamento * (Number(String(operacional).replace(',', '.')) / 100)
    const lucroLiquido = lucroBruto - imposto - valorOperacional

    return {
      faturamento,
      vendaProduto,
      vendaServico,
      custo,
      lucroBruto,
      margemBruta: faturamento > 0 ? (lucroBruto / faturamento) * 100 : 0,
      valorImpProduto,
      valorImpServico,
      imposto,
      valorOperacional,
      lucroLiquido,
      margemLiquida: faturamento > 0 ? (lucroLiquido / faturamento) * 100 : 0,
      recebido,
      itensSemCusto,
      itensProduto,
      // quanto da venda ainda não foi pago
      aReceber: faturamento - recebido,
    }
  }, [lancamentos, custoPorNome, impProduto, impServico, operacional, baseImposto])

  /**
   * Resumo mês a mês dos lançamentos carregados.
   *
   * Serve para ver a evolução: em "Até agora" ou "Ano", aparece a linha de cada
   * mês com faturamento, lucro bruto, líquido e a margem.
   */
  const porMes = useMemo(() => {
    const mapa = new Map<
      string,
      { chave: string; rotulo: string; prod: number; serv: number; custo: number }
    >()
    for (const t of lancamentos) {
      if (t.kind === 'DINHEIRO') continue
      const chave = (t.date || '').slice(0, 7)
      if (!chave) continue
      if (!mapa.has(chave))
        mapa.set(chave, {
          chave,
          rotulo: `${MESES[Number(chave.slice(5, 7)) - 1]?.slice(0, 3)}/${chave.slice(2, 4)}`,
          prod: 0,
          serv: 0,
          custo: 0,
        })
      const alvo = mapa.get(chave)!
      const v = totalDaLinha(t)
      if (t.item_type === 'SERVICO' || t.kind === 'SERVICO') {
        alvo.serv += v
      } else {
        alvo.prod += v
        const c = custoPorNome.get((t.description || '').trim().toUpperCase()) || 0
        alvo.custo += c * Number(t.quantity || 0)
      }
    }

    const pp = Number(String(impProduto).replace(',', '.')) / 100
    const ps = Number(String(impServico).replace(',', '.')) / 100
    const po = Number(String(operacional).replace(',', '.')) / 100

    return Array.from(mapa.values())
      .map((m) => {
        const fat = m.prod + m.serv
        const bruto = fat - m.custo
        const liq = bruto - m.prod * pp - m.serv * ps - fat * po
        return {
          ...m,
          faturamento: fat,
          lucroBruto: bruto,
          lucroLiquido: liq,
          margemLiquida: fat > 0 ? (liq / fat) * 100 : 0,
        }
      })
      .sort((a, b) => a.chave.localeCompare(b.chave))
  }, [lancamentos, custoPorNome, impProduto, impServico, operacional])

  /**
   * Grava a alíquota NO MÊS consultado — não globalmente.
   *
   * É o que o Felipe pediu: quando o contador manda a nova carga, ele ajusta
   * aqui e o mês anterior continua com o número que valia nele.
   */
  const salvarPercentuais = async () => {
    // em "Ano" e "Até agora" não há um mês único para gravar
    if (modo !== 'MES') {
      toast.info('Escolha um mês específico para gravar a alíquota.', { duration: 3000 })
      return
    }
    setSalvandoPct(true)
    try {
      const periodo = `${ano}-${String(mes).padStart(2, '0')}`
      await salvarAliquota({
        periodo,
        product_percent: Number(String(impProduto).replace(',', '.')) || 0,
        service_percent: Number(String(impServico).replace(',', '.')) || 0,
        operational_percent: Number(String(operacional).replace(',', '.')) || 0,
      })
      setOrigemAliquota('MES')
      setPeriodoAliquota(periodo)
      toast.success(`Alíquota de ${rotuloPeriodo(periodo)} gravada.`)
    } catch {
      toast.error('Não foi possível gravar a alíquota.')
    } finally {
      setSalvandoPct(false)
    }
  }

  const exportar = () => {
    const bloco: BlocoPlanilha = {
      titulo: `FATURAMENTO — ${MESES[mes - 1].toUpperCase()} / ${ano}`,
      cabecalho: [
        { rotulo: 'PERÍODO:', valor: `${inicio} a ${fim}` },
        { rotulo: 'LANÇAMENTOS:', valor: String(lancamentos.length) },
      ],
      colunas: [
        { titulo: 'DISCRIMINAÇÃO', largura: 320 },
        { titulo: 'VALOR (R$)', largura: 130, alinhar: 'right', moeda: true },
        { titulo: '% DO FATURAMENTO', largura: 130, alinhar: 'right' },
      ],
      linhas: [
        [
          'Venda de PRODUTOS',
          n.vendaProduto,
          n.faturamento ? `${((n.vendaProduto / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        [
          'Venda de SERVIÇOS',
          n.vendaServico,
          n.faturamento ? `${((n.vendaServico / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        ['FATURAMENTO TOTAL', n.faturamento, '100%'],
        [
          '(-) Custo dos produtos',
          -n.custo,
          n.faturamento ? `${((n.custo / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        ['(=) LUCRO BRUTO', n.lucroBruto, `${n.margemBruta.toFixed(1)}%`],
        [
          `(-) Imposto produto (${impProduto}%)`,
          -n.valorImpProduto,
          n.faturamento ? `${((n.valorImpProduto / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        [
          `(-) Imposto serviço (${impServico}%)`,
          -n.valorImpServico,
          n.faturamento ? `${((n.valorImpServico / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        [
          `(-) Custo operacional (${operacional}%)`,
          -n.valorOperacional,
          n.faturamento ? `${((n.valorOperacional / n.faturamento) * 100).toFixed(1)}%` : '—',
        ],
        ['(=) LUCRO LÍQUIDO', n.lucroLiquido, `${n.margemLiquida.toFixed(1)}%`],
        ['Recebido no mês (pagamentos)', n.recebido, '—'],
        ['A receber das vendas do mês', n.aReceber, '—'],
      ],
    }
    baixarExcel(`FATURAMENTO-${ano}-${String(mes).padStart(2, '0')}`, [bloco])
  }

  const mudarMes = (d: number) => {
    const x = new Date(ano, mes - 1 + d, 1)
    setAno(x.getFullYear())
    setMes(x.getMonth() + 1)
  }

  const Linha = ({
    rotulo,
    valor,
    forte,
    negrito,
    cor,
    sinal,
    detalhe,
  }: {
    rotulo: string
    valor: number
    forte?: boolean
    negrito?: boolean
    cor?: string
    sinal?: 'menos' | 'igual'
    detalhe?: string
  }) => (
    <div
      className={`flex items-center justify-between gap-2 px-2 py-1.5 ${
        forte ? 'border-y-2 border-[#0B3D91] bg-[#0B3D91]/5' : 'border-b last:border-0'
      }`}
    >
      <div className="min-w-0 flex-1">
        <span
          className={`${forte ? 'text-[12px] font-black' : 'text-[11px]'} ${
            cor || 'text-foreground'
          }`}
        >
          {sinal === 'menos' && <span className="mr-1 text-muted-foreground">(−)</span>}
          {sinal === 'igual' && <span className="mr-1 text-muted-foreground">(=)</span>}
          {rotulo}
        </span>
        {detalhe && <p className="text-[9px] text-muted-foreground">{detalhe}</p>}
      </div>
      <span
        className={`shrink-0 font-mono ${forte ? 'text-sm font-black' : 'text-xs font-bold'} ${
          cor || (valor < 0 ? 'text-rose-700' : 'text-foreground')
        } ${negrito ? 'underline decoration-dotted' : ''}`}
      >
        {brl(valor)}
      </span>
    </div>
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Faturamento</h1>
          <p className="text-[11px] text-muted-foreground">
            Do faturamento ao lucro líquido, com imposto e custo operacional
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={exportar}
          className="h-8 shrink-0 gap-1 text-[10px]"
        >
          <FileSpreadsheet className="h-3 w-3" /> Excel
        </Button>
      </div>

      {/* recorte do período */}
      <div className="flex flex-wrap gap-1">
        {[
          ['MES', 'Mês'],
          ['ANO', 'Ano'],
          ['TUDO', 'Até agora'],
        ].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={modo === v ? 'default' : 'outline'}
            onClick={() => setModo(v as any)}
            className={`h-7 text-[10px] ${modo === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      {/*
        Base do imposto.

        No Simples Nacional o tributo incide sobre a RECEITA — e receita, na
        prática, é o que entrou no caixa. Calcular sobre o faturado quando a
        maior parte ainda não foi paga superestima o imposto do mês. Mas há
        quem apure por competência. Fica na mão do Felipe escolher, e a tela
        diz qual está usando.
      */}
      <div className="flex items-center gap-1.5 rounded-lg border bg-slate-50 px-2 py-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground">Imposto sobre:</span>
        <button
          type="button"
          onClick={() => setBaseImposto('FATURADO')}
          className={`rounded px-2 py-1 text-[10px] font-semibold ${
            baseImposto === 'FATURADO' ? 'bg-[#0B3D91] text-white' : 'bg-white border'
          }`}
        >
          Faturado
        </button>
        <button
          type="button"
          onClick={() => setBaseImposto('RECEBIDO')}
          className={`rounded px-2 py-1 text-[10px] font-semibold ${
            baseImposto === 'RECEBIDO' ? 'bg-[#0B3D91] text-white' : 'bg-white border'
          }`}
        >
          Recebido
        </button>
        <span className="ml-auto font-mono text-[10px] font-bold text-[#0B3D91]">
          {brl(n.imposto)}
        </span>
      </div>

      {/* seletor de período */}
      <Card>
        <CardContent className="flex items-center justify-between gap-2 p-2.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => mudarMes(-1)}
            disabled={modo === 'TUDO'}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <span className="block text-sm font-black capitalize">{rotuloPeriodoAtual}</span>
            <span className="block text-[9px] text-muted-foreground">
              {lancamentos.length} lançamento(s)
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => mudarMes(1)}
            disabled={modo === 'TUDO'}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* resultado */}
      <Card>
        <CardContent className="p-0">
          <Linha rotulo="Venda de produtos" valor={n.vendaProduto} />
          <Linha rotulo="Venda de serviços" valor={n.vendaServico} />
          <Linha rotulo="FATURAMENTO TOTAL" valor={n.faturamento} forte cor="text-[#0B3D91]" />
          <Linha
            rotulo="Custo dos produtos vendidos"
            valor={-n.custo}
            sinal="menos"
            detalhe={
              n.itensSemCusto > 0
                ? `${n.itensSemCusto} item(ns) sem custo cadastrado — o lucro está subestimado`
                : undefined
            }
          />
          <Linha
            rotulo="LUCRO BRUTO"
            valor={n.lucroBruto}
            forte
            cor="text-emerald-800"
            sinal="igual"
          />
          <div className="flex items-center justify-between bg-slate-50 px-2 py-1">
            <span className="text-[10px] text-muted-foreground">Margem bruta</span>
            <Badge className="border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[9px] text-emerald-800">
              {n.margemBruta.toFixed(1)}%
            </Badge>
          </div>

          <Linha
            rotulo={`Imposto sobre produto (${impProduto}%)`}
            valor={-n.valorImpProduto}
            sinal="menos"
            detalhe={
              baseImposto === 'RECEBIDO'
                ? 'aplicado sobre a parte já recebida do faturamento'
                : 'sobre a venda de produtos do período'
            }
          />
          <Linha
            rotulo={`Imposto sobre serviço (${impServico}%)`}
            valor={-n.valorImpServico}
            sinal="menos"
            detalhe={
              baseImposto === 'RECEBIDO'
                ? 'aplicado sobre a parte já recebida do faturamento'
                : 'sobre a venda de serviços do período'
            }
          />
          <Linha
            rotulo={`Custo operacional (${operacional}%)`}
            valor={-n.valorOperacional}
            sinal="menos"
            detalhe="sobre o faturamento total do período"
          />

          <div className="bg-[#0B3D91] px-2 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase text-white/90">Lucro líquido</span>
              <span
                className={`font-mono text-lg font-black ${
                  n.lucroLiquido >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {brl(n.lucroLiquido)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[9px] text-white/70">
                total de descontos: {brl(n.custo + n.imposto + n.valorOperacional)}
              </span>
              <span className="font-mono text-[10px] font-bold text-white/90">
                margem {n.margemLiquida.toFixed(1)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* caixa do mês */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b bg-slate-50 px-2 py-1.5">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">
              Movimento de dinheiro
            </span>
          </div>
          <Linha rotulo="Recebido no mês (pagamentos)" valor={n.recebido} cor="text-emerald-700" />
          <Linha
            rotulo="A receber das vendas do mês"
            valor={n.aReceber}
            cor={n.aReceber > 0 ? 'text-amber-700' : undefined}
          />
        </CardContent>
      </Card>

      {n.itensSemCusto > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
          <strong>Atenção:</strong> {n.itensSemCusto} de {n.itensProduto} item(ns) vendidos não têm
          custo cadastrado. O lucro bruto e o líquido estão <strong>subestimados</strong> — o custo
          real desses itens não entrou na conta. Cadastre em <strong>Custos e margem</strong>.
        </p>
      )}

      {/* mês a mês: o acompanhamento que ele quer a partir de dezembro */}
      {porMes.length > 1 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b bg-slate-50 px-2 py-1.5">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Mês a mês
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[#0B3D91] text-white">
                    <th className="p-1.5 text-left">MÊS</th>
                    <th className="p-1.5 text-right">FATURAM.</th>
                    <th className="p-1.5 text-right">LUCRO BRUTO</th>
                    <th className="p-1.5 text-right">LÍQUIDO</th>
                    <th className="p-1.5 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map((m) => (
                    <tr key={m.chave} className="border-b last:border-0">
                      <td className="whitespace-nowrap p-1.5 font-semibold capitalize">
                        {m.rotulo}
                      </td>
                      <td className="p-1.5 text-right font-mono">{brl(m.faturamento)}</td>
                      <td className="p-1.5 text-right font-mono text-emerald-700">
                        {brl(m.lucroBruto)}
                      </td>
                      <td
                        className={`p-1.5 text-right font-mono font-bold ${
                          m.lucroLiquido >= 0 ? 'text-emerald-800' : 'text-rose-700'
                        }`}
                      >
                        {brl(m.lucroLiquido)}
                      </td>
                      <td className="p-1.5 text-right font-mono text-muted-foreground">
                        {m.margemLiquida.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* percentuais editáveis */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-[#0B3D91]" />
            <Label className="text-xs font-bold">Percentuais aplicados</Label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[9px] text-muted-foreground">Imposto produto</Label>
              <Input
                inputMode="decimal"
                value={impProduto}
                onChange={(e) => setImpProduto(e.target.value)}
                onBlur={salvarPercentuais}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] text-muted-foreground">Imposto serviço</Label>
              <Input
                inputMode="decimal"
                value={impServico}
                onChange={(e) => setImpServico(e.target.value)}
                onBlur={salvarPercentuais}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] text-muted-foreground">Operacional</Label>
              <Input
                inputMode="decimal"
                value={operacional}
                onChange={(e) => setOperacional(e.target.value)}
                onBlur={salvarPercentuais}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            {salvandoPct
              ? 'Gravando...'
              : origemAliquota === 'MES'
                ? `Alíquota de ${rotuloPeriodo(periodoAliquota)}. Alterar aqui muda SÓ este mês.`
                : origemAliquota === 'ANTERIOR'
                  ? `Sem alíquota própria: usando a de ${rotuloPeriodo(periodoAliquota)}. Editar grava no mês consultado.`
                  : 'Nenhuma alíquota cadastrada ainda — usando o padrão 8 / 11 / 3.'}
          </p>
          {modo === 'MES' && (
            <p className="text-[9px] text-muted-foreground">
              Ao sair do campo, grava em{' '}
              <strong>{rotuloPeriodo(`${ano}-${String(mes).padStart(2, '0')}`)}</strong>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
