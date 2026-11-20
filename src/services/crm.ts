/**
 * Camada de dados do CRM.
 *
 * Toda a conversa com o PocketBase referente ao lado financeiro passa aqui:
 * lançamentos, orçamentos/pedidos, contas a pagar e resumo por cliente.
 *
 * Duas regras que custaram caro e estão respeitadas:
 *  - a view `client_summary` evita carregar todos os lançamentos na abertura;
 *  - `sort=-created` responde 400 nesta base, então a ordenação é por `date`.
 */
import pb from '@/lib/pocketbase/client'
import type {
  Transaction,
  TransactionKind,
  Quote,
  QuoteItem,
  Bill,
  ClientSummary,
} from '@/types/crm'
import type { Client } from '@/types/flservicos'

// ---------------- RESUMO POR CLIENTE (view) ----------------

/**
 * Uma linha por cliente, já com os totais somados no banco (73 linhas em vez
 * de 1 MB de JSON). É o que o painel e a lista de clientes leem.
 */
export async function getClientsSummary(): Promise<ClientSummary[]> {
  const res = await pb.collection('client_summary').getFullList({ sort: '-saldo' })
  return res.map((r: any) => ({
    id: r.id,
    name: r.name || '',
    nickname: r.nickname || '',
    document: r.document || '',
    phone: r.phone || '',
    city: r.city || '',
    capital: Number(r.capital || 0),
    consumo: Number(r.consumo || 0),
    servico: Number(r.servico || 0),
    dinheiro: Number(r.dinheiro || 0),
    saldo: Number(r.saldo || 0),
    lancamentos: Number(r.lancamentos || 0),
  }))
}

// ---------------- LANÇAMENTOS ----------------

export async function getTransactions(opts?: {
  page?: number
  perPage?: number
  kind?: string
  clientId?: string
  from?: string
  to?: string
}): Promise<{ items: Transaction[]; total: number }> {
  const filtros: string[] = []
  if (opts?.clientId) filtros.push(`client = "${opts.clientId}"`)
  if (opts?.kind && opts.kind !== 'TODOS') filtros.push(`kind = "${opts.kind}"`)
  if (opts?.from) filtros.push(`date >= "${opts.from} 00:00:00"`)
  if (opts?.to) filtros.push(`date <= "${opts.to} 23:59:59"`)

  const res = await pb.collection('transactions').getList(opts?.page || 1, opts?.perPage || 40, {
    sort: '-date',
    filter: filtros.join(' && '),
    expand: 'client',
  })
  return { items: res.items as unknown as Transaction[], total: res.totalItems }
}

/** Todos os lançamentos de um cliente (usado no relatório e na ficha). */
export async function getTransactionsByClient(clientId: string): Promise<Transaction[]> {
  const res = await pb.collection('transactions').getFullList({
    filter: `client = "${clientId}"`,
    sort: '-date',
  })
  return res as unknown as Transaction[]
}

export async function createTransaction(dados: Partial<Transaction>) {
  return pb.collection('transactions').create({
    ...dados,
    quantity: Number(dados.quantity ?? 0),
    unit_price: Number(dados.unit_price ?? 0),
  })
}

export async function updateTransaction(id: string, dados: Partial<Transaction>) {
  return pb.collection('transactions').update(id, dados)
}

export async function deleteTransaction(id: string) {
  return pb.collection('transactions').delete(id)
}

// ---------------- ORÇAMENTOS / PEDIDOS ----------------

export async function getQuotes(): Promise<Quote[]> {
  const res = await pb.collection('quotes').getFullList({
    sort: '-date',
    expand: 'client',
  })
  return res as unknown as Quote[]
}

export async function getQuote(id: string): Promise<Quote> {
  return (await pb.collection('quotes').getOne(id, {
    expand: 'client',
  })) as unknown as Quote
}

/**
 * Próximo número de pedido — mesma ideia da OS.
 *
 * Lê o maior número já usado e soma 1. O `getFullList` não serve aqui: com o
 * histórico crescendo ele traz tudo só para descobrir o último, então pedimos
 * uma linha ordenada.
 */
export async function getNextQuoteNumber(): Promise<number> {
  try {
    const l = await pb.collection('quotes').getList(1, 1, { sort: '-number' })
    const ultimo = l.items[0] ? Number((l.items[0] as any).number || 0) : 0
    return ultimo + 1
  } catch {
    return 1
  }
}

export async function createQuote(dados: Partial<Quote> | FormData) {
  // numeração automática quando não veio pronta
  if (dados instanceof FormData) {
    if (!dados.get('number')) dados.append('number', String(await getNextQuoteNumber()))
  } else if (!dados.number) {
    dados.number = await getNextQuoteNumber()
  }
  return pb.collection('quotes').create(dados as any)
}

/** Registra uma linha no histórico do pedido (não quebra o fluxo se falhar) */
export async function registrarHistoricoPedido(
  quoteId: string,
  de: string,
  para: string,
  usuario: string,
  nota?: string,
) {
  try {
    await pb.collection('quote_history').create({
      quote: quoteId,
      status_from: de || '',
      status_to: para,
      user_name: usuario || 'Sistema',
      user_id: pb.authStore.record?.id || '',
      notes: nota || '',
    })
  } catch (e) {
    console.warn('histórico do pedido não registrado', e)
  }
}

export async function getHistoricoPedido(quoteId: string) {
  try {
    return await pb.collection('quote_history').getFullList({
      filter: `quote = "${quoteId}"`,
      sort: '-created',
    })
  } catch {
    return []
  }
}

export async function updateQuote(id: string, dados: Partial<Quote> | FormData) {
  return pb.collection('quotes').update(id, dados as any)
}

export async function deleteQuote(id: string) {
  return pb.collection('quotes').delete(id)
}

/** Total de um documento, calculado dos itens */
export function totalDoDocumento(itens?: QuoteItem[]): number {
  return (itens || []).reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
}

// ---------------- CONTAS A PAGAR (C1) ----------------

export async function getBills(opts?: { status?: string }): Promise<Bill[]> {
  const filtro = opts?.status && opts.status !== 'TODOS' ? `status = "${opts.status}"` : ''
  const res = await pb.collection('bills').getFullList({ sort: 'due_date', filter: filtro })
  return res as unknown as Bill[]
}

export async function createBill(dados: Partial<Bill>) {
  return pb.collection('bills').create(dados)
}

export async function updateBill(id: string, dados: Partial<Bill>) {
  return pb.collection('bills').update(id, dados)
}

export async function deleteBill(id: string) {
  return pb.collection('bills').delete(id)
}

// ---------------- CLASSIFICAÇÃO DO PRODUTO ----------------

/**
 * Grava no cadastro a classificação e/ou o preço corrigidos no orçamento.
 *
 * É a resposta ao "posso perguntar se quero manter só neste orçamento ou
 * salvar no cadastro": sim, pergunta, e o cadastro aprende com o uso.
 */
export async function atualizarProdutoPelosDados(
  materialId: string,
  dados: { default_kind?: TransactionKind; price?: number },
) {
  const corpo: any = {}
  if (dados.default_kind && dados.default_kind !== 'DINHEIRO') {
    corpo.default_kind = dados.default_kind
  }
  if (dados.price !== undefined && !isNaN(dados.price)) corpo.price = dados.price
  if (Object.keys(corpo).length === 0) return null
  return pb.collection('materials').update(materialId, corpo)
}

// ---------------- CLIENTES ----------------

export async function getClientes(): Promise<Client[]> {
  const res = await pb.collection('clients').getFullList({ sort: 'name' })
  return res as unknown as Client[]
}

export async function getCliente(id: string): Promise<Client> {
  return (await pb.collection('clients').getOne(id)) as unknown as Client
}
