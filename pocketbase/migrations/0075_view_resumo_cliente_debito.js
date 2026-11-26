/**
 * 0075 — Correção da 0074: volta o `debito` para somar TODAS as linhas.
 *
 * A 0074 excluiu do débito os pagamentos vinculados (settles + ENVIADA),
 * achando que o relatório de débito seguia o em-aberto por item. O Felipe
 * confirmou depois que o número do relatório deve ser o MESMO da ficha — o
 * Saldo Devedor, que soma todas as linhas (pagamento entra negativo e abate).
 *
 * Aproveita para levar `ultimo_lancamento` (data do último lançamento, NULL
 * quando não tem — alimenta a ordenação "por data" do relatório) e a coluna
 * `debito`, agora idêntica ao `saldo`.
 */
migrate(
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('client_summary'))
    } catch (_) {}

    const view = new Collection({
      name: 'client_summary',
      type: 'view',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
    })

    for (const f of [
      { name: 'name', type: 'text' },
      { name: 'nickname', type: 'text' },
      { name: 'document', type: 'text' },
      { name: 'phone', type: 'text' },
      { name: 'city', type: 'text' },
      { name: 'capital', type: 'number' },
      { name: 'consumo', type: 'number' },
      { name: 'servico', type: 'number' },
      { name: 'dinheiro', type: 'number' },
      { name: 'saldo', type: 'number' },
      { name: 'lancamentos', type: 'number' },
      { name: 'ultimo_lancamento', type: 'date' },
    ]) {
      view.fields.add(new Field(f))
    }

    view.viewQuery = `
      SELECT
        c.id AS id,
        c.name AS name,
        c.nickname AS nickname,
        c.document AS document,
        c.phone AS phone,
        c.city AS city,
        COALESCE(SUM(CASE WHEN t.kind = 'CAPITAL' THEN t.quantity * t.unit_price ELSE 0 END), 0) AS capital,
        COALESCE(SUM(CASE WHEN t.kind = 'CONSUMO' THEN t.quantity * t.unit_price ELSE 0 END), 0) AS consumo,
        COALESCE(SUM(CASE WHEN t.kind = 'SERVICO' THEN t.quantity * t.unit_price ELSE 0 END), 0) AS servico,
        COALESCE(SUM(t.quantity * t.unit_price), 0) AS saldo,
        COUNT(t.id) AS lancamentos,
        MAX(t.date) AS ultimo_lancamento
      FROM clients c
      LEFT JOIN transactions t ON t.client = c.id
      GROUP BY c.id
    `

    app.save(view)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('client_summary'))
    } catch (_) {}
  },
)
