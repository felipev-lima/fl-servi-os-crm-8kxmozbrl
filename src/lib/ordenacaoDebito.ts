/**
 * ORDEM DO RELATÓRIO DE DÉBITO POR CLIENTE (regra do Felipe, 27/11/2026).
 *
 * 1. sempre prioritariamente quem está EM DÉBITO (saldo > 0);
 * 2. depois quem está sem débito (zero) — inclusive quem nunca teve
 *    lançamento (prospecção de vendas);
 * 3. por último quem tem CRÉDITO a favor (saldo < 0).
 *
 * Dentro de cada grupo, a ordem é a escolhida no botão:
 *  - nome: alfabética, ignorando acento/maiúscula (PocketBase não ignora
 *    acento — normaliza aqui);
 *  - data: do ÚLTIMO lançamento mais recente para o mais antigo ("a última
 *    escola que eu lancei seja a primeira") — quem nunca lançou por último;
 *  - valor: do débito mais alto para o mais baixo.
 *
 * Usada pela tabela da aba Relatórios e pelo PDF — mesma lista, mesma
 * sequência.
 */
import { semAcento } from '@/types/crm'
import type { ClientSummary } from '@/types/crm'

export type OrdemDebito = 'nome' | 'data' | 'valor'

export const ROTULO_ORDEM: Record<OrdemDebito, string> = {
  nome: 'Alfabética (nome)',
  data: 'Data do último lançamento',
  valor: 'Valor do débito',
}

export const TOLERANCIA = 0.005

export function grupoDe(r: ClientSummary): 0 | 1 | 2 {
  if (r.saldo > TOLERANCIA) return 0 // em débito
  if (r.saldo < -TOLERANCIA) return 2 // crédito a favor
  return 1 // sem débito (zero, inclusive quem nunca lançou)
}

export function dataRef(r: ClientSummary): string {
  return r.ultimo_lancamento || ''
}

export function ordenarClientesDebito(lista: ClientSummary[], ordem: OrdemDebito): ClientSummary[] {
  const cmpNome = (a: ClientSummary, b: ClientSummary) =>
    semAcento(a.nickname || a.name).localeCompare(semAcento(b.nickname || b.name), 'pt-BR')
  const cmpData = (a: ClientSummary, b: ClientSummary) =>
    dataRef(b).localeCompare(dataRef(a)) || cmpNome(a, b)
  const cmpValor = (a: ClientSummary, b: ClientSummary) => b.saldo - a.saldo || cmpNome(a, b)
  const dentro: Record<OrdemDebito, (a: ClientSummary, b: ClientSummary) => number> = {
    nome: cmpNome,
    data: cmpData,
    valor: cmpValor,
  }
  return [...lista].sort((a, b) => grupoDe(a) - grupoDe(b) || dentro[ordem](a, b))
}
