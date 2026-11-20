/**
 * 0016 — Reverte a estrutura multiempresa (decisão do Felipe, 2026-11-12).
 *
 * O multiempresa foi construído para avaliar a venda do app como SaaS, mas a
 * decisão é: primeiro estruturar o app para o uso da FL SERVIÇOS, e só no
 * futuro pensar em vender. Enquanto o campo `company` existir com as regras de
 * isolamento, toda criação precisa carimbá-lo — e qualquer tela antiga que não
 * carimbe deixa o registro invisível. Então o certo é remover de verdade.
 *
 * Esta migration desfaz 0011 a 0015:
 *  - apaga a coleção `companies`;
 *  - remove o campo `company` de todas as coleções e dos usuários;
 *  - devolve as regras de acesso de antes (qualquer usuário logado);
 *  - devolve a numeração da OS como única no sistema;
 *  - os usuários que viraram `superadmin` voltam a `admin` (a FL tem admin).
 */
migrate(
  (app) => {
    const colecoes = [
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

    // ---------- 1. devolve a numeração única da OS ----------
    try {
      const wo = app.findCollectionByNameOrId('work_orders')
      const semCompany = []
      for (const idx of wo.indexes) {
        if (idx.indexOf('idx_work_orders_company_number') === -1) semCompany.push(idx)
      }
      if (semCompany.join(' ').indexOf('idx_work_orders_number') === -1) {
        semCompany.push('CREATE UNIQUE INDEX idx_work_orders_number ON work_orders (order_number)')
      }
      wo.indexes = semCompany
      app.save(wo)
    } catch (_) {}

    // ---------- 2. remove o campo company e devolve as regras ----------
    const regras = {
      clients: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      technicians: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      materials: {
        list: "@request.auth.id != ''",
        create: "@request.auth.id != '' && @request.auth.role = 'admin'",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      work_orders: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      order_materials: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      },
      order_photos: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      },
      order_history: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      future_maintenances: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      material_kits: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && @request.auth.role = 'admin'",
      },
      material_kit_items: {
        list: "@request.auth.id != ''",
        create:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
        del: "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      },
    }

    for (const nome of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const campo = col.fields.getByName('company')
        if (campo) col.fields.removeById(campo.id)

        const r = regras[nome]
        col.listRule = r.list
        col.viewRule = r.list
        col.createRule = r.create
        col.updateRule = r.create
        col.deleteRule = r.del
        app.save(col)
      } catch (_) {}
    }

    // ---------- 3. usuários: fora o vínculo e fora o papel superadmin ----------
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')

      // quem é superadmin volta a admin
      app.db().newQuery("UPDATE users SET role = 'admin' WHERE role = 'superadmin'").execute()

      const campo = users.fields.getByName('company')
      if (campo) users.fields.removeById(campo.id)

      const roleField = users.fields.getByName('role')
      if (roleField) roleField.values = ['admin', 'tecnico', 'consulta']

      users.listRule = "@request.auth.id != ''"
      users.viewRule = "@request.auth.id != ''"
      users.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      users.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      app.save(users)
    } catch (_) {}

    // ---------- 4. apaga a coleção de empresas ----------
    try {
      app.delete(app.findCollectionByNameOrId('companies'))
    } catch (_) {}
  },
  () => {
    // Reverter a reversão não é necessário: o multiempresa pode ser refeito
    // do zero quando o Felipe decidir vender o app.
  },
)
