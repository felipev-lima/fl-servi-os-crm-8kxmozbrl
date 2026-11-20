/**
 * 0032 — Alíquota de imposto POR MÊS.
 *
 * O Felipe apura a carga tributária mês a mês, junto com o contador. Se a
 * alíquota fosse uma só para o sistema, mudar em dezembro reescreveria o
 * resultado de novembro — e o histórico do lucro viraria mentira.
 *
 * Aqui cada mês tem a sua linha: `periodo` no formato "2026-11".
 * Na falta de uma linha para o mês consultado, a tela usa a mais recente
 * anterior — que é como a alíquota funciona de verdade: só muda quando muda.
 */
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('tax_rates')
    } catch (_) {
      col = null
    }
    if (!col) {
      col = new Collection({
        name: 'tax_rates',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      })
      for (const f of [
        // "2026-11" — mês de vigência
        { name: 'periodo', type: 'text', required: true },
        { name: 'product_percent', type: 'number', min: 0, max: 100 },
        { name: 'service_percent', type: 'number', min: 0, max: 100 },
        { name: 'operational_percent', type: 'number', min: 0, max: 100 },
        // de onde veio o número: "relatório do contador 11/2026"
        { name: 'note', type: 'text' },
        { name: 'aliq_efetiva', type: 'number', min: 0, max: 100 },
      ]) {
        col.fields.add(new Field(f))
      }
      // um registro por mês
      col.addIndex('idx_tax_rates_periodo', true, 'periodo', '')
      app.save(col)
    }
  },
  (app) => {
    // manter: apagar perderia o histórico de alíquotas
  },
)
