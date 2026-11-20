/**
 * Preço e custo — a regra que mantém a margem honesta.
 *
 * O Felipe trabalha assim: o preço de venda está defasado no catálogo, e ele
 * corrige conforme vende, produto por produto. Quando o preço muda, a margem
 * precisa refletir a realidade na hora.
 *
 * O problema que isso resolve:
 *
 *   A maioria dos custos foi CALCULADA pela marcação de 60% (preço ÷ 1,6),
 *   porque o sistema antigo nunca guardou custo. Se o preço muda e o custo
 *   calculado fica parado, a margem vira ficção — o custo continua amarrado ao
 *   preço velho.
 *
 * A regra:
 *   cost_estimated = true   -> custo é DERIVADO do preço; muda o preço,
 *                              recalcula o custo pela mesma marcação.
 *   cost_estimated = false  -> o custo é REAL, informado pelo Felipe; não se
 *                              toca nele nunca. Custo de compra não muda
 *                              porque o preço de venda mudou.
 *
 * É a diferença entre "não sei quanto paguei" e "paguei R$ 118".
 */

/** Marcação padrão aplicada ao catálogo: preço = custo × 1,6 */
export const MARCACAO_PADRAO = 1.6

/** Custo derivado do preço pela marcação (60% sobre o custo) */
export function custoPorMarcacao(preco: number, marcacao = MARCACAO_PADRAO): number {
  const p = Number(preco) || 0
  if (p <= 0 || marcacao <= 1) return 0
  return Math.round((p / marcacao) * 100) / 100
}

/** Margem sobre a venda, em % — null quando não dá para calcular */
export function margem(preco: number, custo: number): number | null {
  const p = Number(preco) || 0
  const c = Number(custo) || 0
  if (p <= 0 || c <= 0) return null
  return ((p - c) / p) * 100
}

/** Marcação sobre o custo, em % — a leitura que o Felipe usa */
export function marcacaoSobreCusto(preco: number, custo: number): number | null {
  const p = Number(preco) || 0
  const c = Number(custo) || 0
  if (c <= 0 || p <= 0) return null
  return ((p - c) / c) * 100
}

/** Lucro em reais por unidade */
export function lucroUnitario(preco: number, custo: number): number {
  return (Number(preco) || 0) - (Number(custo) || 0)
}

export interface MaterialPreco {
  price?: number
  cost?: number
  cost_estimated?: boolean
}

/**
 * Decide o que gravar ao mudar o preço de um produto.
 *
 * Devolve o custo que deve ir junto — o mesmo, quando ele informou o custo
 * real; recalculado, quando o custo era só uma estimativa derivada do preço.
 */
export function custoAoMudarPreco(
  material: MaterialPreco,
  novoPreco: number,
  marcacao = MARCACAO_PADRAO,
): { cost: number; recalculou: boolean } {
  const custoAtual = Number(material.cost) || 0
  const estimado = !!material.cost_estimated

  // custo real informado por ele: nunca mexer
  if (!estimado && custoAtual > 0) {
    return { cost: custoAtual, recalculou: false }
  }

  // sem custo nenhum e sem preço: nada a calcular
  if (novoPreco <= 0) {
    return { cost: custoAtual, recalculou: false }
  }

  const novoCusto = custoPorMarcacao(novoPreco, marcacao)
  return { cost: novoCusto, recalculou: Math.abs(novoCusto - custoAtual) > 0.005 }
}
