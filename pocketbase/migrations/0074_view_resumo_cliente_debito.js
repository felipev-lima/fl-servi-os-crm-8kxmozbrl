/**
 * 0074 — View client_summary v2: débito real (abate pagamentos vinculados)
 * e data do último lançamento.
 *
 * POR QUE MEXER NA VIEW (pedido do Felipe, 26/11/2026 — Relatórios):
 *
 *   "eu não consigo imprimir um relatório disso do nome da escola... já com o
 *    valor que ele deve — seria basicamente essa mesma planilha que tá aqui
 *    com o nome, quantidade de lançamento, o valor do débito"
 *
 * A view antiga somava TODAS as linhas (pagamento DINHEIRO entra negativo e
 * abate). O problema: pagamento VINCULADO a um item (settles) já zerou o item
 * nos cartões da ficha (/saldo-por-tipo), e o relatório de débito precisa
 * bater com o Saldo Devedor da ficha — que usa o em aberto por item.
 *
 * 0073 normalizou os pagamentos antigos: quem tem settles válido ficou com
 * sent_to_finance = ENVIADA. A regra do débito, então:
 *
 *   - pagamento com settles e ENVIADA → é baixa de item: não entra aqui
 *     (o débito do item já está corrigido no valor da linha do item),
 *     e não volta como crédito — o /saldo-por-tipo trata o excedente;
 *   - pagamento sem settles → abate o saldo (a ficha já soma a linha
 *     negativa, então o mesmo aqui: entra na soma);
 *   - recebimento CORRIGIDO regrava ENVIADA nas linhas reescritas, então a
 *     regra continua valendo depois de uma correção (nunca delete).
 *
 * E `ultimo_lancamento` alimenta a ordenação "por data" do relatório — a
 * escola lançada por último aparece primeiro. Cliente sem lançamento nenhum
 * fica com NULL, e vai pro fim do relatório (prospecção de vendas).
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
      { name: 'debito', type: 'number' },
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
        COALESCE(SUM(CASE WHEN t.kind = 'DINHEIRO' THEN t.quantity * t.unit_price ELSE 0 END), 0) AS dinheiro,
        COALESCE(SUM(t.quantity * t.unit_price), 0) AS saldo,
        COALESCE(SUM(
          CASE
            WHEN t.kind = 'DINHEIRO'
                 AND COALESCE(t.settles, '') != ''
                 AND COALESCE(t.sent_to_finance, '') = 'ENVIADA'
            THEN 0
            ELSE t.quantity * t.unit_price
          END
        ), 0) AS debito,
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
