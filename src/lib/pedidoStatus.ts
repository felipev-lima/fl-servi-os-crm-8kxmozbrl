/**
 * Os cinco status do pedido, com a cor de cada um.
 *
 * O caminho que o Felipe descreveu:
 *
 *   ORÇAMENTO (amarelo)  → o cliente ainda não aprovou
 *   PEDIDO (laranja)     → aprovou, virou pedido de compra
 *   AGUARDANDO MATERIAL  → peça encomendada, esperando chegar
 *   ENTREGUE (verde)     → material na mão do cliente
 *   LANÇADO (azul)       → já entrou na planilha de cobrança
 *
 * CANCELADO fica em cinza escuro, fora do fluxo.
 *
 * A cor é definida AQUI e usada em todo lugar — painel, lista e ficha — para
 * não acontecer de o mesmo status sair de uma cor no painel e de outra na
 * lista.
 */

export type StatusPedido =
  | 'ORCAMENTO'
  | 'PEDIDO'
  | 'AGUARDANDO MATERIAL'
  | 'ENTREGUE'
  | 'LANCADO'
  | 'CANCELADO'

export interface ConfigStatus {
  chave: StatusPedido
  rotulo: string
  /** classes do cartão/badge */
  cor: string
  /** cor do texto/contador, para números grandes */
  texto: string
  ajuda: string
}

export const STATUS_PEDIDO: ConfigStatus[] = [
  {
    chave: 'ORCAMENTO',
    rotulo: 'Orçamento',
    cor: 'border-amber-300 bg-amber-50',
    texto: 'text-amber-800',
    ajuda: 'Cliente ainda não aprovou',
  },
  {
    chave: 'PEDIDO',
    rotulo: 'Pedido',
    cor: 'border-orange-300 bg-orange-50',
    texto: 'text-orange-800',
    ajuda: 'Aprovado, virou pedido',
  },
  {
    chave: 'AGUARDANDO MATERIAL',
    rotulo: 'Aguard. material',
    cor: 'border-red-300 bg-red-50',
    texto: 'text-red-700',
    ajuda: 'Esperando o material chegar',
  },
  {
    chave: 'ENTREGUE',
    rotulo: 'Entregue',
    cor: 'border-emerald-300 bg-emerald-50',
    texto: 'text-emerald-800',
    ajuda: 'Material entregue ao cliente',
  },
  {
    chave: 'LANCADO',
    rotulo: 'Lançado',
    cor: 'border-blue-300 bg-blue-50',
    texto: 'text-blue-800',
    ajuda: 'Já está na planilha de cobrança',
  },
]

/** Cancelado fica separado: não faz parte da esteira. */
export const STATUS_CANCELADO: ConfigStatus = {
  chave: 'CANCELADO',
  rotulo: 'Cancelado',
  cor: 'border-slate-300 bg-slate-100',
  texto: 'text-slate-600',
  ajuda: 'Fora do fluxo',
}

/** Busca a configuração de um status, com CANCELADO incluso. */
export function configStatus(status?: string | null): ConfigStatus {
  const achou = STATUS_PEDIDO.find((s) => s.chave === status)
  if (achou) return achou
  if (status === 'CANCELADO') return STATUS_CANCELADO
  // pedido antigo gravado como FATURADO cai no fim da esteira
  if (status === 'FATURADO') {
    return STATUS_PEDIDO.find((s) => s.chave === 'LANCADO')!
  }
  return STATUS_PEDIDO[0]
}

/** Todos os status, na ordem da esteira, para os botões. */
export const FLUXO_PEDIDO: StatusPedido[] = [
  'ORCAMENTO',
  'PEDIDO',
  'AGUARDANDO MATERIAL',
  'ENTREGUE',
  'LANCADO',
]
