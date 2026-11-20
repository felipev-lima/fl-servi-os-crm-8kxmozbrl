/**
 * 0012 — Multiempresa, parte 2: a FL SERVIÇOS como empresa nº 1, o vínculo dos
 * usuários e o campo `company` em todas as coleções de trabalho.
 *
 * Todo registro que já existe é marcado como da FL SERVIÇOS, então nada some.
 */
migrate(
  (app) => {
    const companiesId = app.findCollectionByNameOrId('companies').id

    // ---------- 1. FL SERVIÇOS como empresa nº 1 ----------
    let flId
    try {
      flId = app.findFirstRecordByFilter('companies', "slug = 'fl-servicos'").id
    } catch (_) {
      const fl = new Record(app.findCollectionByNameOrId('companies'))
      fl.set('name', 'FL SERVIÇOS')
      fl.set('trade_name', 'FL SERVIÇOS')
      fl.set('slug', 'fl-servicos')
      fl.set('city', 'Macaé / RJ')
      fl.set('active', true)
      app.save(fl)
      flId = fl.id
    }

    // ---------- 2. usuários: vínculo + papel superadmin ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('company')) {
      users.fields.add(
        new RelationField({
          name: 'company',
          required: false,
          collectionId: companiesId,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    const roleField = users.fields.getByName('role')
    if (roleField && roleField.values.indexOf('superadmin') === -1) {
      roleField.values = ['admin', 'tecnico', 'consulta', 'superadmin']
    }
    app.save(users)

    app
      .db()
      .newQuery("UPDATE users SET company = {:e} WHERE company = '' OR company IS NULL")
      .bind({ e: flId })
      .execute()

    // ---------- 3. campo company nas coleções de trabalho ----------
    const comEmpresa = [
      'clients',
      'technicians',
      'materials',
      'work_orders',
      'order_materials',
      'order_photos',
      'order_history',
      'future_maintenances',
      'material_kits',
      'material_kit_items',
    ]

    for (const nome of comEmpresa) {
      const col = app.findCollectionByNameOrId(nome)
      if (!col.fields.getByName('company')) {
        col.fields.add(
          new RelationField({
            name: 'company',
            required: false,
            collectionId: companiesId,
            cascadeDelete: false,
            maxSelect: 1,
          }),
        )
        app.save(col)
      }
    }

    // ---------- 4. amarra o que já existe à FL SERVIÇOS ----------
    for (const nome of comEmpresa) {
      app
        .db()
        .newQuery(`UPDATE ${nome} SET company = {:e} WHERE company = '' OR company IS NULL`)
        .bind({ e: flId })
        .execute()
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const c = users.fields.getByName('company')
      if (c) users.fields.removeById(c.id)
      const roleField = users.fields.getByName('role')
      if (roleField) roleField.values = ['admin', 'tecnico', 'consulta']
      app.save(users)
    } catch (_) {}

    for (const nome of [
      'clients',
      'technicians',
      'materials',
      'work_orders',
      'order_materials',
      'order_photos',
      'order_history',
      'future_maintenances',
      'material_kits',
      'material_kit_items',
    ]) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const c = col.fields.getByName('company')
        if (c) col.fields.removeById(c.id)
        app.save(col)
      } catch (_) {}
    }
  },
)
