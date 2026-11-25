/**
 * ORÇAMENTO → OS (C6).
 *
 * A conversão é a mesma migração que já existe (migrarPedidoParaOS): copia
 * cliente, itens e fotos para a nova OS e deixa o orçamento original
 * CANCELADO, com nota no histórico. Aqui só acrescentamos o registro da
 * aprovação (quem converteu e quando).
 *
 * REGRA ABSOLUTA: nada é apagado. O financeiro não é tocado.
 */
import { getQuote, registrarHistoricoPedido } from '@/services/crm'
import { migrarPedidoParaOS, type ResultadoMigracao } from '@/services/migracao'

export async function converterOrcamentoEmOS(
  quoteId: string,
  usuario: string,
): Promise<ResultadoMigracao> {
  const orc: any = await getQuote(quoteId)
  if (orc.status !== 'ORCAMENTO') throw new Error('Só um orçamento em aberto pode virar OS.')

  const resultado = await migrarPedidoParaOS(quoteId, usuario)

  const data = new Date().toLocaleDateString('pt-BR')
  try {
    await registrarHistoricoPedido(
      quoteId,
      'ORCAMENTO',
      'CONVERTIDO',
      usuario,
      `Orçamento aprovado em ${data} e convertido na OS nº ${resultado.destinoNumero}`,
    )
  } catch {
    /* a conversão já aconteceu; a OS nova guarda a origem no histórico */
  }
  return resultado
}
