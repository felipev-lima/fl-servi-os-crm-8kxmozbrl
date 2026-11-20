migrate(
  (app) => {
    // findCollectionByNameOrId LANÇA erro quando a coleção não existe
    // ("sql: no rows in result set") — por isso o try/catch.
    let existe = null
    try {
      existe = app.findCollectionByNameOrId('companies')
    } catch (_) {
      existe = null
    }
    if (existe) return

    app.save(
      new Collection({
        name: 'companies',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'trade_name', type: 'text' },
          { name: 'slug', type: 'text', required: true },
          { name: 'whatsapp', type: 'text' },
          { name: 'email', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'active', type: 'bool' },
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('companies'))
    } catch (_) {}
  },
)
