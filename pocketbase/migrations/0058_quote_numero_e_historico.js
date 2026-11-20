/**
 * 0058 — Pedido com NÚMERO de registro e histórico de movimentação.
 *
 * O Felipe pediu que o pedido funcione como a OS: número para consultar e
 * buscar, e um histórico do que aconteceu (gerado → encomendado → chegou →
 * entregue → faturado).
 *
 * O número já existe na coleção (`number`), mas nunca foi preenchido. Aqui:
 *  1. criamos a coleção `quote_history`, espelhando `order_history`;
 *  2. numeramos os pedidos existentes a partir de 1;
 *  3. deixamos `number` obrigatório no futuro vem do app.
 */
migrate(
  (app) => {
    // ---- histórico do pedido, igual ao da OS ----
    const existe = (() => {
      try {
        return app.findCollectionByNameOrId('quote_history')
      } catch (_) {
        return null
      }
    })()

    if (!existe) {
      const quotesId = app.findCollectionByNameOrId('quotes').id
      const col = new Collection({
        name: 'quote_history',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          {
            name: 'quote',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: quotesId,
            cascadeDelete: true,
          },
          { name: 'status_from', type: 'text', max: 40 },
          { name: 'status_to', type: 'text', max: 40 },
          { name: 'user_name', type: 'text', max: 120 },
          { name: 'user_id', type: 'text', max: 40 },
          { name: 'notes', type: 'text', max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
      })
      app.save(col)
    }

    // ---- numera os pedidos que já existem (do mais antigo para o mais novo) ----
    const quotes = app.findRecordsByFilter('quotes', '', 'created', 100000, 0)
    let n = 0
    for (const q of quotes) {
      n += 1
      q.set('number', n)
      app.save(q)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('quote_history')
      app.delete(col)
    } catch (_) {
      /* já não existe */
    }
  },
)
