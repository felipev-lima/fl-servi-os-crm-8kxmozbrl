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
 * REGRA CORRIGIDA (Felipe, 20/11/2026 — ele estava certo):
 *
 * O padrão é sempre RECALCULAR o custo pela marcação de 60% sobre o preço.
 * Manter o custo antigo produz margem falsa: um monitor com custo de R$ 5,00
 * vendido por R$ 690 daria 99% de margem, e o lucro do relatório viraria
 * ficção. O preço de venda é a âncora; o custo vem dele.
 *
 * A ÚNICA exceção é o custo que ele confirmou à mão. Nesse caso a função
 * sinaliza `precisaPerguntar` e quem chama pergunta:
 *   "manter este custo ou recalcular pela marcação?"
 *
 * Deixar de perguntar era o defeito anterior: tratava R$ 5,00 de placeholder
 * como custo real e nunca corrigia.
 */
export function custoAoMudarPreco(
  material: MaterialPreco,
  novoPreco: number,
  marcacao = MARCACAO_PADRAO,
): { cost: number; recalculou: boolean; precisaPerguntar: boolean } {
  const custoAtual = Number(material.cost) || 0
  const eraConfirmado = material.cost_estimated === false && custoAtual > 0

  if (novoPreco <= 0) {
    return { cost: custoAtual, recalculou: false, precisaPerguntar: false }
  }

  const novoCusto = custoPorMarcacao(novoPreco, marcacao)
  const mudou = Math.abs(novoCusto - custoAtual) > 0.005

  // custo confirmado por ele: aplica a marcação por padrão, mas avisa que dá
  // para manter — quem pergunta é a tela
  if (eraConfirmado) {
    return { cost: novoCusto, recalculou: mudou, precisaPerguntar: mudou }
  }

  return { cost: novoCusto, recalculou: mudou, precisaPerguntar: false }
}

/** Marca um valor como suspeito de ser placeholder, não custo real */
export function custoPlaceholder(custo: number): boolean {
  return custo > 0 && custo <= 5.01
}
