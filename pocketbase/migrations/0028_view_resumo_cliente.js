/**
 * 0028 — View de resumo por cliente.
 *
 * O painel precisa dos totais de cada cliente, mas carregar todos os
 * lançamentos com os dados do cliente junto já custou 1 MB de JSON e travou o
 * celular na versão anterior. Aqui o banco já entrega uma linha por cliente
 * com capital, consumo, serviço, dinheiro, saldo e número de lançamentos.
 *
 * Numa coleção `view` o PocketBase exige que cada coluna do SELECT seja
 * declarada como campo, e a consulta vai em `viewQuery`.
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
        COALESCE(SUM(CASE WHEN t.kind = 'DINHEIRO' THEN t.quantity * t.unit_price ELSE 0 END), 0) AS dinheiro,
        COALESCE(SUM(t.quantity * t.unit_price), 0) AS saldo,
        COUNT(t.id) AS lancamentos
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
