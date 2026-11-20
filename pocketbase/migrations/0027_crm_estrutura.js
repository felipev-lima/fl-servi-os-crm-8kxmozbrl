/**
 * 0027 — Estrutura do CRM: lançamentos, orçamentos, contas a pagar e empresa.
 *
 * A cópia da FL já trouxe `nickname` no cliente e `default_kind` no produto.
 * Falta o que sustenta o lado administrativo:
 *
 *   `transactions`  um lançamento por item (capital/consumo/serviço/dinheiro)
 *   `quotes`        orçamento → pedido → entregue → faturado
 *   `bills`         contas a pagar (C1)
 *   `settings`      dados da empresa para o PDF
 *
 * Regra que veio da planilha real do Felipe e não pode ser violada:
 * o SINAL vem do valor gravado, nunca do tipo. DINHEIRO negativo abate,
 * DINHEIRO positivo é crédito, CONSUMO negativo é desconto.
 */
migrate(
  (app) => {
    const clients = () => app.findCollectionByNameOrId('clients')

    // ---------- LANÇAMENTOS ----------
    let tx
    try {
      tx = app.findCollectionByNameOrId('transactions')
    } catch (_) {
      tx = null
    }
    if (!tx) {
      tx = new Collection({
        name: 'transactions',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
    }
    const camposTx = [
      {
        name: 'client',
        type: 'relation',
        required: true,
        collectionId: clients().id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { name: 'date', type: 'date', required: true },
      {
        name: 'kind',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['CAPITAL', 'CONSUMO', 'SERVICO', 'DINHEIRO'],
      },
      { name: 'item_type', type: 'select', maxSelect: 1, values: ['PRODUTO', 'SERVICO'] },
      { name: 'description', type: 'text', required: true },
      { name: 'details', type: 'text' },
      { name: 'quantity', type: 'number' },
      { name: 'unit_price', type: 'number' },
      // ligações: a OS e o pedido que geraram o lançamento
      { name: 'work_order_ref', type: 'text' },
      { name: 'quote_ref', type: 'text' },
      { name: 'sent_to_finance', type: 'select', maxSelect: 1, values: ['PENDENTE', 'ENVIADA'] },
      { name: 'sent_at', type: 'date' },
      { name: 'notes', type: 'text' },
      { name: 'legacy_row', type: 'text' },
    ]
    for (const f of camposTx) {
      if (!tx.fields.getByName(f.name)) tx.fields.add(new Field(f))
    }
    app.save(tx)

    // ---------- ORÇAMENTOS / PEDIDOS ----------
    let qt
    try {
      qt = app.findCollectionByNameOrId('quotes')
    } catch (_) {
      qt = null
    }
    if (!qt) {
      qt = new Collection({
        name: 'quotes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
    }
    const camposQt = [
      {
        name: 'client',
        type: 'relation',
        required: true,
        collectionId: clients().id,
        maxSelect: 1,
      },
      { name: 'number', type: 'number' },
      { name: 'date', type: 'date' },
      { name: 'items', type: 'json', maxSize: 2000000 },
      {
        name: 'status',
        type: 'select',
        maxSelect: 1,
        values: ['ORCAMENTO', 'PEDIDO', 'ENTREGUE', 'FATURADO', 'CANCELADO'],
      },
      { name: 'payment_terms', type: 'text' },
      { name: 'delivery_terms', type: 'text' },
      { name: 'validity_days', type: 'number' },
      { name: 'notes', type: 'text' },
      { name: 'delivered_at', type: 'date' },
      { name: 'invoiced_at', type: 'date' },
      { name: 'delivered_by_name', type: 'text' },
      { name: 'delivered_by_role', type: 'text' },
      { name: 'signature_client', type: 'file', maxSelect: 1, maxSize: 5242880 },
      { name: 'signature_deliverer', type: 'file', maxSelect: 1, maxSize: 5242880 },
      { name: 'photos', type: 'file', maxSelect: 20, maxSize: 10485760 },
      { name: 'sent_to_finance', type: 'select', maxSelect: 1, values: ['PENDENTE', 'ENVIADA'] },
      // OS gerada a partir deste pedido (C6)
      { name: 'work_order', type: 'text' },
    ]
    for (const f of camposQt) {
      if (!qt.fields.getByName(f.name)) qt.fields.add(new Field(f))
    }
    // o status pode já existir com valores antigos: `fields.add` é ignorado
    // nesse caso, então recria quando os valores não batem
    const st = qt.fields.getByName('status')
    if (st && st.type === 'select') {
      const ok = ['ORCAMENTO', 'PEDIDO', 'ENTREGUE', 'FATURADO', 'CANCELADO']
      const atuais = st.values || []
      if (atuais.length !== ok.length || !ok.every((v) => atuais.includes(v))) {
        qt.fields.removeById(st.id)
        qt.fields.add(new SelectField({ name: 'status', maxSelect: 1, values: ok }))
      }
    }
    app.save(qt)

    // ---------- CONTAS A PAGAR (C1) ----------
    let bills
    try {
      bills = app.findCollectionByNameOrId('bills')
    } catch (_) {
      bills = null
    }
    if (!bills) {
      bills = new Collection({
        name: 'bills',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
      for (const f of [
        { name: 'supplier', type: 'text', required: true },
        { name: 'description', type: 'text' },
        {
          name: 'category',
          type: 'select',
          maxSelect: 1,
          values: [
            'FORNECEDOR',
            'ALUGUEL',
            'ENERGIA',
            'AGUA',
            'TELEFONE',
            'SALARIO',
            'IMPOSTO',
            'OUTRO',
          ],
        },
        { name: 'amount', type: 'number', required: true },
        { name: 'due_date', type: 'date', required: true },
        { name: 'paid_at', type: 'date' },
        {
          name: 'status',
          type: 'select',
          maxSelect: 1,
          values: ['ABERTA', 'PAGA', 'ATRASADA'],
        },
        { name: 'receipt', type: 'file', maxSelect: 1, maxSize: 5242880 },
        { name: 'notes', type: 'text' },
      ]) {
        bills.fields.add(new Field(f))
      }
      app.save(bills)
    }

    // ---------- DADOS DA EMPRESA ----------
    let cfg
    try {
      cfg = app.findCollectionByNameOrId('settings')
    } catch (_) {
      cfg = null
    }
    if (!cfg) {
      cfg = new Collection({
        name: 'settings',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
      for (const f of [
        { name: 'razao_social', type: 'text' },
        { name: 'nome_fantasia', type: 'text' },
        { name: 'cnpj', type: 'text' },
        { name: 'ie', type: 'text' },
        { name: 'endereco', type: 'text' },
        { name: 'telefone', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'diretor_nome', type: 'text' },
        { name: 'logo', type: 'file', maxSelect: 1, maxSize: 2097152 },
        { name: 'assinatura_diretor', type: 'file', maxSelect: 1, maxSize: 1048576 },
      ]) {
        cfg.fields.add(new Field(f))
      }
      app.save(cfg)
    }

    // ---------- CUSTO DO PRODUTO (C3) e ESTOQUE (C8) ----------
    const mats = app.findCollectionByNameOrId('materials')
    for (const f of [
      // custo de compra: sem ele a margem não existe
      { name: 'cost', type: 'number', min: 0 },
      { name: 'stock_min', type: 'number', min: 0 },
      { name: 'control_stock', type: 'bool' },
    ]) {
      if (!mats.fields.getByName(f.name)) mats.fields.add(new Field(f))
    }
    app.save(mats)

    // ---------- COMISSÃO (C4) ----------
    const tec = app.findCollectionByNameOrId('technicians')
    if (!tec.fields.getByName('commission_percent')) {
      tec.fields.add(new NumberField({ name: 'commission_percent', min: 0, max: 100 }))
    }
    app.save(tec)

    // ---------- CONFERÊNCIA DAS OS HERDADAS ----------
    const wo = app.findCollectionByNameOrId('work_orders')
    if (!wo.fields.getByName('planilha_conferida')) {
      wo.fields.add(
        new SelectField({
          name: 'planilha_conferida',
          maxSelect: 1,
          values: ['PENDENTE', 'CONFERIDA', 'LANCADA_NO_CRM'],
        }),
      )
    }
    app.save(wo)
  },
  (app) => {
    for (const n of ['transactions', 'quotes', 'bills']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
