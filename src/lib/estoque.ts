/**
 * Estoque — movimentação e saldo.
 *
 * Duas responsabilidades:
 *   1. dar baixa quando o material é usado numa OS (e devolver se for removido);
 *   2. registrar entrada, ajuste e perda com histórico.
 *
 * A regra que evita o pior erro: o saldo NUNCA vai negativo por acidente. Se a
 * OS usar mais do que há, o movimento é gravado assim mesmo (a OS aconteceu de
 * verdade) e o alerta aparece — mas o saldo é corrigido e a tela avisa. Esconder
 * a diferença faria o estoque mentir para sempre.
 */
import pb from '@/lib/pocketbase/client'

export type TipoMovimento = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'PERDA'

export interface Movimento {
  id?: string
  material: string
  type: TipoMovimento
  quantity: number
  balance_after?: number
  reason?: string
  work_order_ref?: string
  user_name?: string
  date?: string
  expand?: { material?: { name: string; unit?: string } }
  created?: string
}

/** Histórico de um produto, do mais recente para o mais antigo */
export async function movimentosDoMaterial(materialId: string): Promise<Movimento[]> {
  try {
    const lista = await pb.collection('stock_movements').getFullList({
      filter: `material = "${materialId}"`,
      sort: '-date',
    })
    return lista as unknown as Movimento[]
  } catch {
    return []
  }
}

/** Últimos movimentos de todos os produtos */
export async function movimentosRecentes(limite = 50): Promise<Movimento[]> {
  try {
    const res = await pb.collection('stock_movements').getList(1, limite, {
      sort: '-date',
      expand: 'material',
    })
    return res.items as unknown as Movimento[]
  } catch {
    return []
  }
}

/**
 * Aplica um movimento e atualiza o saldo do produto.
 *
 * `quantity` é sempre positivo para ENTRADA/SAIDA/PERDA — o sinal é decidido
 * pelo tipo. Em AJUSTE, `quantity` é o saldo novo (não a diferença), porque é
 * assim que quem conta o estoque pensa: "tem 12 peças".
 */
export async function movimentar(dados: {
  materialId: string
  type: TipoMovimento
  quantity: number
  saldoAtual: number
  reason?: string
  workOrderRef?: string
  userName?: string
}): Promise<{ saldo: number; ficouNegativo: boolean }> {
  const qtd = Math.abs(Number(dados.quantity) || 0)
  let novo = Number(dados.saldoAtual) || 0

  if (dados.type === 'ENTRADA') novo += qtd
  else if (dados.type === 'SAIDA' || dados.type === 'PERDA') novo -= qtd
  else novo = Number(dados.quantity) || 0

  /**
   * O saldo NUNCA fica negativo (decisão do Felipe, 20/11/2026).
   *
   * Ele ainda não faz controle de entrada/saída: vende o produto e o estoque
   * não deve virar dívida imaginária. O piso é zero. Quando ele passar a
   * controlar de verdade, é aqui que se volta a permitir negativo (com alerta).
   */
  if (novo < 0) novo = 0

  const ficouNegativo = false

  await pb.collection('materials').update(dados.materialId, { current_stock: novo } as any)
  try {
    await pb.collection('stock_movements').create({
      material: dados.materialId,
      type: dados.type,
      quantity: dados.type === 'AJUSTE' ? novo : qtd,
      balance_after: novo,
      reason: dados.reason || '',
      work_order_ref: dados.workOrderRef || '',
      user_name: dados.userName || pb.authStore.record?.name || 'Sistema',
      date: new Date().toISOString(),
    } as any)
  } catch {
    /* o saldo já foi atualizado; o histórico não pode travar a operação */
  }

  return { saldo: novo, ficouNegativo }
}

/**
 * Baixa automática ao lançar material numa OS.
 *
 * Só age quando o produto tem controle de estoque ligado e quantidade maior
 * que zero — a lista de material padrão entra com quantidade zero de propósito,
 * e isso não pode virar baixa de nada.
 */
export async function baixarPorUsoNaOS(opts: {
  materialId: string
  quantity: number
  saldoAtual: number
  orderNumber?: number | string
  userName?: string
}): Promise<{ aplicado: boolean; saldo: number; ficouNegativo: boolean }> {
  if (!opts.materialId || Number(opts.quantity) <= 0) {
    return { aplicado: false, saldo: opts.saldoAtual, ficouNegativo: false }
  }
  const r = await movimentar({
    materialId: opts.materialId,
    type: 'SAIDA',
    quantity: Number(opts.quantity),
    saldoAtual: opts.saldoAtual,
    reason: `Uso na OS ${opts.orderNumber ?? ''}`.trim(),
    workOrderRef: String(opts.orderNumber ?? ''),
    userName: opts.userName,
  })
  return { aplicado: true, ...r }
}

/** Devolve ao estoque quando o material é removido da OS */
export async function devolverPorRemocaoDaOS(opts: {
  materialId: string
  quantity: number
  saldoAtual: number
  orderNumber?: number | string
  userName?: string
}): Promise<{ saldo: number; ficouNegativo: boolean }> {
  if (!opts.materialId || Number(opts.quantity) <= 0) {
    return { saldo: opts.saldoAtual, ficouNegativo: false }
  }
  return movimentar({
    materialId: opts.materialId,
    type: 'ENTRADA',
    quantity: Number(opts.quantity),
    saldoAtual: opts.saldoAtual,
    reason: `Devolução — material removido da OS ${opts.orderNumber ?? ''}`.trim(),
    workOrderRef: String(opts.orderNumber ?? ''),
    userName: opts.userName,
  })
}
