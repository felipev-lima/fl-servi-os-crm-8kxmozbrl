/**
 * Status da OS: os sete da esteira, com a cor de cada um.
 *
 * O que mudou a pedido do Felipe (20/11/2026):
 *  - AGUARDANDO MATERIAL saiu da esteira da OS (é coisa de pedido de compra);
 *  - entrou LANÇADA, o passo depois de FINALIZADA: a OS conferida e jogada
 *    para o financeiro, entrando no contas a receber do cliente.
 *
 * Ordem da esteira:
 *   ABERTA → AGENDADA → EM ANDAMENTO → FINALIZADA → LANÇADA
 * e PENDENTE/HOJE são recortes por data, não passos.
 *
 * A cor aqui é a MESMA usada nos cartões da lista — é o que faz ele bater o
 * olho e reconhecer a situação sem ler.
 */

export type StatusOS =
  | 'ABERTA'
  | 'AGENDADA'
  | 'EM ANDAMENTO'
  | 'AGUARDANDO MATERIAL'
  | 'FINALIZADA'
  | 'LANCADA'
  | 'CANCELADA'

export interface ConfigStatusOS {
  chave: StatusOS
  /** nome curto, para o cartão */
  curto: string
  rotulo: string
  cor: string
  texto: string
  borda: string
  bg: string
  ajuda: string
}

export const STATUS_OS: ConfigStatusOS[] = [
  {
    chave: 'ABERTA',
    curto: 'Aberta',
    rotulo: 'Abertas',
    cor: 'border-sky-300 bg-sky-50',
    texto: 'text-sky-800',
    borda: 'border-l-sky-500',
    bg: 'bg-sky-50',
    ajuda: 'Criada, aguardando início',
  },
  {
    chave: 'AGENDADA',
    curto: 'Agendada',
    rotulo: 'Agendadas',
    cor: 'border-violet-300 bg-violet-50',
    texto: 'text-violet-800',
    borda: 'border-l-violet-500',
    bg: 'bg-violet-50',
    ajuda: 'Com data definida',
  },
  {
    chave: 'EM ANDAMENTO',
    curto: 'Em andamento',
    rotulo: 'Em andamento',
    cor: 'border-amber-300 bg-amber-50',
    texto: 'text-amber-800',
    borda: 'border-l-amber-500',
    bg: 'bg-amber-50',
    ajuda: 'Serviço sendo executado',
  },
  {
    chave: 'FINALIZADA',
    curto: 'Finalizada',
    rotulo: 'Finalizadas',
    cor: 'border-emerald-300 bg-emerald-50',
    texto: 'text-emerald-800',
    borda: 'border-l-emerald-500',
    bg: 'bg-emerald-50',
    ajuda: 'Serviço concluído',
  },
  {
    chave: 'LANCADA',
    curto: 'Lançada',
    rotulo: 'Lançadas',
    cor: 'border-blue-300 bg-blue-50',
    texto: 'text-blue-800',
    borda: 'border-l-blue-500',
    bg: 'bg-blue-50',
    ajuda: 'Já lançada no financeiro',
  },
]

/** Cancelada fora do fluxo, como no pedido */
export const STATUS_OS_CANCELADA: ConfigStatusOS = {
  chave: 'CANCELADA',
  curto: 'Cancelada',
  rotulo: 'Canceladas',
  cor: 'border-slate-300 bg-slate-100',
  texto: 'text-slate-600',
  borda: 'border-l-slate-400',
  bg: 'bg-slate-100',
  ajuda: 'Fora do fluxo',
}

export function configStatusOS(status?: string | null): ConfigStatusOS | undefined {
  return STATUS_OS.find((s) => s.chave === status)
}
