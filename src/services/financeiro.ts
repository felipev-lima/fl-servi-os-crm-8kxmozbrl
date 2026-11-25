/**
 * Consultas financeiras que precisam do histórico completo (C2 e C9).
 *
 * Ficam aqui para as telas de caixa e de DRE não repetirem a paginação.
 * Nada é gravado: são só leituras.
 */
import pb from '@/lib/pocketbase/client'
import type { Transaction } from '@/types/crm'

/** Todos os lançamentos, em ordem de data */
export async function todosLancamentos(): Promise<Transaction[]> {
  const itens = await pb.collection('transactions').getFullList({ sort: 'date' })
  return itens as unknown as Transaction[]
}

/** Total recebido (DINHEIRO, em valor absoluto) com data anterior a `de` (AAAA-MM-DD) */
export async function recebidosAntesDe(de: string): Promise<number> {
  const itens = await pb.collection('transactions').getFullList({
    filter: `kind = "DINHEIRO" && date < "${de} 00:00:00"`,
  })
  return itens.reduce(
    (s, t) => s + Math.abs(Number(t.quantity || 0) * Number(t.unit_price || 0)),
    0,
  )
}
