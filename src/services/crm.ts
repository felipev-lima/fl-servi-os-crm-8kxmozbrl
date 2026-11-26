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
import { avisarSincronizacao } from '@/lib/onedriveSync'

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
    ultimo_lancamento: (r.ultimo_lancamento as string) || null,
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
  const rec = (await pb.collection('quotes').create(dados as any)) as any
  /**
   * BACKUP ONEDRIVE (pedido do Felipe, 23/11/2026): pedidos e orçamentos vão
   * para o OneDrive como as OS já iam. O sinal tem o numero do documento e o
   * tipo 'pedido'/'orcamento' — é o tipo que manda o assistente arquivar na
   * pasta PRÓPRIA de pedidos/orçamentos, não na pasta das OS. Falha aqui é
   * detalhe: o documento já está salvo no banco.
   */
  try {
    avisarSincronizacao(
      rec.id,
      Number(rec.number) || undefined,
      'criacao',
      String(rec.status) === 'ORCAMENTO' ? 'orcamento' : 'pedido',
    )
  } catch {
    /* sincronização nunca derruba a operação */
  }
  return rec
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
  const rec = (await pb.collection('quotes').update(id, dados as any)) as any
  /**
   * BACKUP ONEDRIVE: mesma ideia do create — avisa edição/troca de status/
   * anexo de fotos, com o numero do documento, para o assistente reenviar a
   * ficha e as fotos para a pasta certa.
   */
  try {
    avisarSincronizacao(
      id,
      Number(rec.number) || undefined,
      'edicao',
      String(rec.status) === 'ORCAMENTO' ? 'orcamento' : 'pedido',
    )
  } catch {
    /* sincronização nunca derruba a operação */
  }
  return rec
}

export async function deleteQuote(id: string) {
  // Antes de apagar, pega o número para o aviso ao assistente conseguir
  // localizar o registro no OneDrive — MESMO CAMINHO da exclusão de OS.
  let numero: number | undefined
  let orcamento = false
  try {
    const rec = (await pb.collection('quotes').getOne(id)) as any
    numero = Number(rec.number) || undefined
    orcamento = String(rec.status) === 'ORCAMENTO'
  } catch {
    /* segue sem o número */
  }
  const ok = await pb.collection('quotes').delete(id)
  try {
    // tipo certo para o assistente achar a pasta (pedido ou orcamento)
    avisarSincronizacao(id, numero, 'exclusao', orcamento ? 'orcamento' : 'pedido')
  } catch {
    /* sincronização nunca derruba a operação */
  }
  return ok
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

/**
 * BAIXA DE PAGAMENTO (C1) — marca a conta como PAGA e lança no financeiro.
 *
 * Como o lançamento entra (mesma regra da base, que já custou caro): kind =
 * DINHEIRO com o valor NEGATIVO em unit_price e quantity 1 — é o que abate do
 * caixa, igual à baixa de cliente (DarBaixaPage) e à rota lancar-pagamento.
 *
 * UMA ÚNICA VEZ: a conta fica presa ao lançamento pelo campo
 * `payment_transaction`. Se ele já está preenchido, a baixa é ignorada — baixar
 * duas vezes não duplica lançamento. O campo não tem cascadeDelete, então apagar
 * o lançamento não apaga a conta.
 *
 * REGRA DA BASE RESPEITADA: nenhum lançamento existente é lido para alteração —
 * só se cria um novo. Os 946 herdados da FL ficam intocados.
 *
 * O `client` do lançamento é obrigatório na coleção. Como uma conta de
 * fornecedor não pertence a cliente nenhum, usa-se o cliente "CONTA DA EMPRESA"
 * (criado uma única vez, sem tocar nos existentes) — é lá que a despesa aparece
 * no financeiro, e é ele que mantém o saldo dos clientes de verdade limpo.
 */
export async function pagarBill(conta: Bill, dataPagamento: string) {
  // já baixada com lançamento: não repete
  if ((conta as any).payment_transaction) {
    return { repetida: true as const, transaction: null }
  }

  // trava de corrida: relê o estado atual do banco antes de decidir
  const atual = (await pb.collection('bills').getOne(conta.id)) as any
  if (atual.payment_transaction) {
    return { repetida: true as const, transaction: null }
  }

  // cliente "CONTA DA EMPRESA" — a despesa da empresa não é de um cliente
  let clienteEmpresaId = ''
  try {
    const achado = await pb.collection('clients').getList(1, 1, {
      filter: `nickname = "CONTA DA EMPRESA"`,
    })
    clienteEmpresaId = achado.items[0]?.id || ''
  } catch {
    /* segue para criar */
  }
  if (!clienteEmpresaId) {
    const criado = await pb.collection('clients').create({
      name: 'CONTA DA EMPRESA',
      nickname: 'CONTA DA EMPRESA',
      type: 'EMPRESA',
    })
    clienteEmpresaId = criado.id
  }

  const descricao = `PAGAMENTO FORNECEDOR - ${conta.supplier}${conta.description ? ` (${conta.description})` : ''}`
  const lancamento = (await pb.collection('transactions').create({
    client: clienteEmpresaId,
    date: `${dataPagamento} 12:00:00.000Z`,
    kind: 'DINHEIRO',
    item_type: 'SERVICO',
    description: descricao.slice(0, 200),
    details: `Baixa da conta a pagar${conta.category ? ` - ${conta.category}` : ''}`,
    quantity: 1,
    unit_price: -Math.abs(Number(conta.amount)),
    sent_to_finance: 'ENVIADA',
    sent_at: new Date().toISOString(),
    notes: `CONTA A PAGAR id=${conta.id}`,
  })) as any

  await pb.collection('bills').update(conta.id, {
    status: 'PAGA',
    paid_at: new Date().toISOString(),
    payment_transaction: lancamento.id,
  })

  return { repetida: false as const, transaction: lancamento }
}

/** Desfaz a baixa: apaga o lançamento gerado e volta a conta para ABERTA. */
export async function reabrirBill(conta: Bill) {
  const atual = (await pb.collection('bills').getOne(conta.id)) as any
  const lancamentoId = String(atual.payment_transaction || '')
  if (lancamentoId) {
    try {
      await pb.collection('transactions').delete(lancamentoId)
    } catch {
      /* lançamento já não existe — segue */
    }
  }
  await pb.collection('bills').update(conta.id, {
    status: 'ABERTA',
    paid_at: '',
    payment_transaction: '',
  })
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
