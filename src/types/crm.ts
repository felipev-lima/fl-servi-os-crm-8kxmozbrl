/**
 * Tipos do CRM da FL SERVIÇOS.
 *
 * O modelo espelha a planilha que o Felipe usa há anos, com as quatro divisões
 * (CAPITAL / CONSUMO / SERVIÇO / DINHEIRO). A OS continua sendo o centro do
 * trabalho; o financeiro vive em volta dela.
 */
import type { Client } from './flservicos'

export type TransactionKind = 'CAPITAL' | 'CONSUMO' | 'SERVICO' | 'DINHEIRO'
export type ItemType = 'PRODUTO' | 'SERVICO'
export type SituacaoEnvio = 'PENDENTE' | 'ENVIADA'
export type QuoteStatus = 'ORCAMENTO' | 'PEDIDO' | 'ENTREGUE' | 'FATURADO' | 'CANCELADO'

export interface Transaction {
  id: string
  client: string
  date: string
  kind: TransactionKind
  item_type?: ItemType
  description: string
  details?: string
  quantity?: number
  unit_price?: number
  work_order_ref?: string
  quote_ref?: string
  sent_to_finance?: SituacaoEnvio
  sent_at?: string
  notes?: string
  legacy_row?: string
  expand?: { client?: Client }
  created: string
}

export interface ClientSummary {
  id: string
  name: string
  nickname?: string
  document?: string
  phone?: string
  city?: string
  capital: number
  consumo: number
  servico: number
  dinheiro: number
  saldo: number
  lancamentos: number
}

export interface QuoteItem {
  description: string
  quantity: number
  unit_price: number
  kind?: TransactionKind
  unit?: string
  material_id?: string
}

export interface Quote {
  id: string
  client: string
  number?: number
  date?: string
  items?: QuoteItem[]
  status?: QuoteStatus
  payment_terms?: string
  delivery_terms?: string
  validity_days?: number
  notes?: string
  delivered_at?: string
  invoiced_at?: string
  delivered_by_name?: string
  delivered_by_role?: string
  signature_client?: string
  signature_deliverer?: string
  photos?: string[]
  sent_to_finance?: SituacaoEnvio
  work_order?: string
  expand?: { client?: Client }
  created: string
}

export type BillStatus = 'ABERTA' | 'PAGA' | 'ATRASADA'
export type BillCategory =
  | 'FORNECEDOR'
  | 'ALUGUEL'
  | 'ENERGIA'
  | 'AGUA'
  | 'TELEFONE'
  | 'SALARIO'
  | 'IMPOSTO'
  | 'OUTRO'

export interface Bill {
  id: string
  supplier: string
  description?: string
  category?: BillCategory
  amount: number
  due_date: string
  paid_at?: string
  status?: BillStatus
  receipt?: string
  notes?: string
  /** Lançamento do financeiro gerado na baixa — preenchido = já baixada uma vez */
  payment_transaction?: string
  created: string
}

/** Rótulos e cores de cada divisão — as mesmas da planilha */
export const TIPOS: Record<
  TransactionKind,
  { label: string; descricao: string; cor: string; bg: string }
> = {
  CAPITAL: {
    label: 'Capital',
    descricao: 'Equipamento permanente: DVR, câmera, switch, HD',
    cor: 'border-indigo-400 text-indigo-900',
    bg: 'bg-indigo-50',
  },
  CONSUMO: {
    label: 'Consumo',
    descricao: 'Material de instalação: cabo, conector, toner',
    cor: 'border-sky-300 text-sky-800',
    bg: 'bg-sky-50',
  },
  SERVICO: {
    label: 'Serviço',
    descricao: 'Mão de obra: instalação, manutenção, vistoria',
    cor: 'border-blue-300 text-blue-800',
    bg: 'bg-blue-50',
  },
  DINHEIRO: {
    label: 'Dinheiro',
    descricao: 'Pagamento recebido — abate do saldo',
    cor: 'border-emerald-300 text-emerald-800',
    bg: 'bg-emerald-50',
  },
}

/**
 * Total de uma linha = quantidade × valor unitário.
 *
 * O sinal vem do valor gravado, não do tipo. Existem casos legítimos nos dois
 * sentidos: pagamento negativo abate, crédito positivo soma, desconto no
 * consumo é negativo. Forçar o sinal pelo tipo distorceu o total em R$ 7.882,66
 * quando foi tentado.
 */
export function totalDaLinha(t: { quantity?: number; unit_price?: number }): number {
  return Number(t.quantity ?? 0) * Number(t.unit_price ?? 0)
}

export function brl(v: number): string {
  const n = Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${v < 0 ? '- ' : ''}R$ ${n}`
}

export function dataBR(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

/** Sem acento e minúsculo, para busca local */
export function semAcento(s?: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
