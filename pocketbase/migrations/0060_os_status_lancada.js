/**
 * 0060 — OS ganha LANÇADA e perde AGUARDANDO MATERIAL da esteira.
 *
 * Pedido do Felipe (20/11/2026):
 *  - AGUARDANDO MATERIAL era um status que ninguém movimentava e travava OS;
 *    as que estavam nele voltam para EM ANDAMENTO, porque serviço parado por
 *    falta de peça continua em execução.
 *  - LANÇADA é o passo final: a OS conferida e enviada ao financeiro, entrando
 *    no contas a receber daquele cliente.
 *
 * O select perde AGUARDANDO MATERIAL mas o valor continua aceito na leitura
 * antiga? Não: o PocketBase valida na gravação, então primeiro movemos os
 * registros, depois trocamos a lista.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const campo = col.fields.getByName('status')

    // 1) tira do status que vai deixar de existir
    const paradas = app.findRecordsByFilter(
      'work_orders',
      "status = 'AGUARDANDO MATERIAL'",
      '',
      100000,
      0,
    )
    for (const o of paradas) {
      o.set('status', 'EM ANDAMENTO')
      app.save(o)
    }

    // 2) nova lista de valores, com LANÇADA no fim da esteira
    campo.values = ['ABERTA', 'AGENDADA', 'EM ANDAMENTO', 'FINALIZADA', 'LANCADA', 'CANCELADA']
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const campo = col.fields.getByName('status')
    const lancadas = app.findRecordsByFilter('work_orders', "status = 'LANCADA'", '', 100000, 0)
    for (const o of lancadas) {
      o.set('status', 'FINALIZADA')
      app.save(o)
    }
    campo.values = [
      'ABERTA',
      'AGENDADA',
      'EM ANDAMENTO',
      'AGUARDANDO MATERIAL',
      'FINALIZADA',
      'CANCELADA',
    ]
    app.save(col)
  },
)
