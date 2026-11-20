/**
 * 0034 — Movimentação de estoque.
 *
 * Até aqui `materials.current_stock` era um número solto: o Felipe digitava e
 * ficava por isso. Sem histórico, não se sabe por que o saldo mudou — se foi
 * compra, se foi uso numa OS, ou se alguém corrigiu.
 *
 * Cada movimento é um registro:
 *   ENTRADA  compra/recebimento (soma)
 *   SAIDA    uso numa OS (subtrai) — gerado ao lançar material na ordem
 *   AJUSTE   correção de inventário (define o valor)
 *   PERDA    avaria/extravio (subtrai)
 *
 * O saldo em `materials.current_stock` continua sendo a verdade rápida de
 * leitura; o histórico é a auditoria de como se chegou nele.
 */
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('stock_movements')
    } catch (_) {
      col = null
    }
    if (!col) {
      col = new Collection({
        name: 'stock_movements',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
      const mats = app.findCollectionByNameOrId('materials')
      for (const f of [
        {
          name: 'material',
          type: 'relation',
          required: true,
          collectionId: mats.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'type',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA'],
        },
        // positivo soma, negativo subtrai — o sinal vem daqui, não do tipo
        { name: 'quantity', type: 'number', required: true },
        { name: 'balance_after', type: 'number' },
        { name: 'reason', type: 'text' },
        { name: 'work_order_ref', type: 'text' },
        { name: 'user_name', type: 'text' },
        { name: 'date', type: 'date' },
      ]) {
        col.fields.add(new Field(f))
      }
      app.save(col)
    }
  },
  (app) => {
    // manter: apagar perderia o histórico de movimentação
  },
)
