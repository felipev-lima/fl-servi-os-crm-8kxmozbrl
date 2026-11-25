/**
 * Planilha de PEDIDOS e ORÇAMENTOS — mesmo formato da planilha de OS.
 *
 * Pedido do Felipe (25/11/2026): a tela Planilha só gerava planilha de OS;
 * ele precisa copiar o conteúdo do pedido para colar num backup numa planilha
 * externa dele. Aqui os itens do pedido (campo JSON `items` da coleção
 * `quotes`) viram as MESMAS linhas da planilha de OS — DATA | TIPO | PRODUTO /
 * SERVIÇO | DESCRIÇÃO | QTD | VALOR UNIT. — e a aba é desenhada pela MESMA
 * função `montarAba` de src/lib/planilhaOrcamento.ts, com os subtotais por
 * divisão (CAPITAL/CONSUMO/SERVIÇO/DINHEIRO) e as fórmulas do modelo dele.
 *
 * Nada aqui altera a geração de OS: é um caminho novo, paralelo.
 */
import ExcelJS from 'exceljs'
import type { LinhaPlanilha, TipoItem } from '@/lib/planilhaOrcamento'
import { tipoDoItem, montarAba } from '@/lib/planilhaOrcamento'
import { totalDaLinha } from '@/types/crm'
import type { Quote } from '@/types/crm'

const MAIUSCULA = (v: string) => String(v || '').toLocaleUpperCase('pt-BR')

function dataBR(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('pt-BR')
}

function valorTexto(v: number): string {
  // vírgula decimal: cola certo no Excel em pt-BR
  return Number(v || 0)
    .toFixed(2)
    .replace('.', ',')
}

/**
 * Monta as linhas de um PEDIDO/ORÇAMENTO a partir do campo `items`.
 *
 * O tipo vem do `kind` gravado no item (regra da base: o tipo é o que está
 * gravado). Item sem kind cai na classificação automática pelo nome do
 * produto — a mesma de `linhasDaOS`.
 */
export function linhasDoQuote(quote: any): LinhaPlanilha[] {
  const data = dataBR(quote.date || quote.created)
  const linhas: LinhaPlanilha[] = []
  for (const it of quote.items || []) {
    const nome = MAIUSCULA((it as any).name || it.description || 'ITEM')
    const k = String(it.kind || '') as TipoItem
    const tipo: TipoItem =
      k === 'CAPITAL' || k === 'CONSUMO' || k === 'SERVICO' || k === 'DINHEIRO'
        ? k
        : tipoDoItem('', nome)
    linhas.push({
      data,
      tipo,
      produtoServico: tipo === 'SERVICO' ? 'SERVIÇO' : 'PRODUTO',
      descricao: nome,
      qtd: Number(it.quantity || 0) || '',
      unit: Number(it.unit_price || 0),
    })
  }
  return linhas
}

/**
 * Gera o .xlsx de um ou mais pedidos/orçamentos, uma aba por documento,
 * reusando o layout exato da planilha de OS.
 */
/** Total do documento = soma de quantidade × valor unitário dos itens. */
export function totalDoQuote(q: Quote): number {
  return (q.items || []).reduce((s, it) => s + totalDaLinha(it), 0)
}

/** Copia texto para a área de transferência; false quando o navegador bloqueia. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // fallback: execCommand ainda funciona onde o Clipboard API é negado (http)
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export async function gerarPlanilhaQuotes(
  quotes: any[],
  prefixo: 'PEDIDO' | 'ORCAMENTO',
): Promise<{ blob: Blob; nome: string }> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FL SERVIÇOS CRM'

  for (const q of quotes) {
    const linhas = linhasDoQuote(q)
    const cli = q.expand?.client?.name || 'CLIENTE'
    montarAba(wb, `${prefixo} ${q.number ?? ''} - ${cli}`, q, linhas)
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  let nome: string
  if (quotes.length === 1) {
    const q = quotes[0]
    const cli = (q.expand?.client?.name || 'CLIENTE')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    nome = `${prefixo}-${q.number ?? 'SEM-NUMERO'} - ${cli}.xlsx`
  } else {
    nome = `${prefixo}S-${new Date().toISOString().slice(0, 10)}.xlsx`
  }

  return { blob, nome }
}

/**
 * Converte as linhas em TEXTO tabulado (TSV) para copiar e colar numa
 * planilha externa — colando numa célula, cada campo cai numa coluna.
 */
export function linhasParaTexto(titulo: string, linhas: LinhaPlanilha[]): string {
  const cab =
    'DATA\tTIPO\tPRODUTO / SERVIÇO\tDESCRIÇÃO DETALHADA\tQTD\tVALOR UNIT. (R$)\tVALOR TOTAL DO ITEM (R$)'
  const corpo = linhas
    .map((l) =>
      [
        l.data,
        l.tipo,
        l.produtoServico,
        l.descricao,
        l.qtd === '' ? '' : String(l.qtd),
        valorTexto(Number(l.unit || 0)),
        valorTexto(Number(l.qtd === '' ? 0 : l.qtd) * Number(l.unit || 0)),
      ].join('\t'),
    )
    .join('\n')
  const total = valorTexto(
    linhas.reduce((s, l) => s + Number(l.qtd === '' ? 0 : l.qtd) * Number(l.unit || 0), 0),
  )
  return [titulo, cab, corpo, `TOTAL\t\t\t\t\t\t${total}`].join('\n')
}
