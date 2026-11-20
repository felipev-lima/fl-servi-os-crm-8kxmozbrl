/**
 * 0013 — Multiempresa, parte 3: isolamento real entre empresas.
 *
 * Com o campo `company` em todas as coleções (0012), aqui fechamos o cerco:
 *
 *  - as regras exigem que o registro seja da empresa do usuário logado. Quem é
 *    de uma empresa não lê, não altera e não apaga dado de outra — mesmo
 *    sabendo o id do registro;
 *  - `superadmin` é o dono do SaaS e atravessa as empresas;
 *  - o número da OS deixa de ser único no sistema e passa a ser único DENTRO
 *    da empresa, para cada cliente começar a contagem em 1001.
 */
migrate(
  (app) => {
    // ---------- 1. numeração por empresa ----------
    try {
      const wo = app.findCollectionByNameOrId('work_orders')
      const restantes = []
      for (const idx of wo.indexes) {
        if (idx.indexOf('idx_work_orders_number') === -1) restantes.push(idx)
      }
      if (restantes.join(' ').indexOf('idx_work_orders_company_number') === -1) {
        restantes.push(
          'CREATE UNIQUE INDEX idx_work_orders_company_number ON work_orders (company, order_number)',
        )
      }
      wo.indexes = restantes
      app.save(wo)
    } catch (_) {}

    // ---------- 2. regras por empresa ----------
    // DENTRO: registro da empresa do usuário (superadmin passa por cima)
    const DENTRO =
      "@request.auth.id != '' && (company = @request.auth.company || @request.auth.role = 'superadmin')"
    const ADMIN = `${DENTRO} && @request.auth.role = 'admin'`
    const EDITA = `${DENTRO} && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')`

    const regras = {
      clients: { create: EDITA, update: EDITA, del: ADMIN },
      technicians: { create: EDITA, update: EDITA, del: ADMIN },
      materials: { create: ADMIN, update: ADMIN, del: ADMIN },
      work_orders: { create: EDITA, update: EDITA, del: ADMIN },
      order_materials: { create: EDITA, update: EDITA, del: EDITA },
      order_photos: { create: EDITA, update: EDITA, del: EDITA },
      order_history: { create: EDITA, update: EDITA, del: ADMIN },
      future_maintenances: { create: EDITA, update: EDITA, del: ADMIN },
      material_kits: { create: EDITA, update: EDITA, del: ADMIN },
      material_kit_items: { create: EDITA, update: EDITA, del: EDITA },
    }

    for (const [nome, r] of Object.entries(regras)) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = DENTRO
      col.viewRule = DENTRO
      col.createRule = r.create
      col.updateRule = r.update
      col.deleteRule = r.del
      app.save(col)
    }

    // ---------- 3. usuários: cada empresa vê só o seu pessoal ----------
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.listRule = DENTRO
      users.viewRule = DENTRO
      users.createRule = `${DENTRO} && @request.auth.role = 'admin'`
      users.updateRule = `${DENTRO} && (@request.auth.role = 'admin' || id = @request.auth.id)`
      users.deleteRule = `${DENTRO} && @request.auth.role = 'admin'`
      app.save(users)
    } catch (_) {}

    // ---------- 4. a própria empresa: cada um vê a sua ----------
    try {
      const co = app.findCollectionByNameOrId('companies')
      co.listRule =
        "@request.auth.id != '' && (id = @request.auth.company || @request.auth.role = 'superadmin')"
      co.viewRule = co.listRule
      co.updateRule =
        "@request.auth.id != '' && (id = @request.auth.company || @request.auth.role = 'superadmin')"
      app.save(co)
    } catch (_) {}
  },
  (app) => {
    const nomes = [
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
    for (const nome of nomes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        col.listRule = "@request.auth.id != ''"
        col.viewRule = "@request.auth.id != ''"
        app.save(col)
      } catch (_) {}
    }
  },
)
