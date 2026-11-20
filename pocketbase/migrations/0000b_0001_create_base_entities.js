migrate(
  (app) => {
    // 1. Clientes
    const clients = new Collection({
      name: 'clients',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'type', type: 'select', values: ['PF', 'PJ'], maxSelect: 1 },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'document', type: 'text' },
        { name: 'address', type: 'text' },
        { name: 'neighborhood', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_clients_name ON clients (name)',
        'CREATE INDEX idx_clients_city ON clients (city)',
      ],
    })
    app.save(clients)

    // 2. Técnicos
    const technicians = new Collection({
      name: 'technicians',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'role_title', type: 'text' },
        { name: 'specialties', type: 'text' },
        { name: 'active', type: 'bool' },
        { name: 'user', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_technicians_name ON technicians (name)',
        'CREATE INDEX idx_technicians_active ON technicians (active)',
      ],
    })
    app.save(technicians)

    // 3. Materiais
    const materials = new Collection({
      name: 'materials',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'unit',
          type: 'select',
          values: ['UN', 'M', 'KG', 'L', 'CX', 'PC', 'PAR', 'ROLO'],
          maxSelect: 1,
          required: true,
        },
        { name: 'category', type: 'text' },
        { name: 'brand', type: 'text' },
        { name: 'price', type: 'number', min: 0 },
        { name: 'current_stock', type: 'number' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_materials_name ON materials (name)'],
    })
    app.save(materials)
  },
  (app) => {
    const materials = app.findCollectionByNameOrId('materials')
    if (materials) app.delete(materials)
    const technicians = app.findCollectionByNameOrId('technicians')
    if (technicians) app.delete(technicians)
    const clients = app.findCollectionByNameOrId('clients')
    if (clients) app.delete(clients)
  },
)
