/**
 * 0059 — Cinco status no pedido, na ordem da esteira de venda.
 *
 * O Felipe descreveu o caminho real do negócio:
 *   ORÇAMENTO → PEDIDO → AGUARDANDO MATERIAL → ENTREGUE → LANÇADO
 *
 * Antes a coleção tinha ORCAMENTO, PEDIDO, ENTREGUE, FATURADO, CANCELADO.
 * Aqui:
 *  - entra AGUARDANDO MATERIAL (a peça encomendada que ainda não chegou);
 *  - FATURADO vira LANCADO (o nome que ele usa: lançado na planilha de
 *    cobrança);
 *  - os pedidos já gravados como FATURADO são migrados para LANCADO.
 *
 * Os registros com status fora da lista nova são ajustados ANTES de trocar os
 * valores — o PocketBase recusa salvar um select com valor que não existe.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('quotes')
    const campo = col.fields.getByName('status')

    // 1) leva quem estava em FATURADO para LANCADO antes de mexer na lista
    const antigos = app.findRecordsByFilter('quotes', "status = 'FATURADO'", '', 100000, 0)
    for (const q of antigos) {
      q.set('status', 'LANCADO')
      app.save(q)
    }

    // 2) troca a lista de valores aceitos
    campo.values = [
      'ORCAMENTO',
      'PEDIDO',
      'AGUARDANDO MATERIAL',
      'ENTREGUE',
      'LANCADO',
      'CANCELADO',
    ]
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('quotes')
    const campo = col.fields.getByName('status')
    const atuais = app.findRecordsByFilter('quotes', "status = 'LANCADO'", '', 100000, 0)
    for (const q of atuais) {
      q.set('status', 'FATURADO')
      app.save(q)
    }
    campo.values = ['ORCAMENTO', 'PEDIDO', 'ENTREGUE', 'FATURADO', 'CANCELADO']
    app.save(col)
  },
)
