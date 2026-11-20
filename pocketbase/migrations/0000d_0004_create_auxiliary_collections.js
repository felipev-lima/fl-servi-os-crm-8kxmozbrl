migrate(
  (app) => {
    const workOrdersCol = app.findCollectionByNameOrId('work_orders')
    const materialsCol = app.findCollectionByNameOrId('materials')
    const clientsCol = app.findCollectionByNameOrId('clients')
    const techniciansCol = app.findCollectionByNameOrId('technicians')

    // 1. Materiais Utilizados na OS
    const orderMaterials = new Collection({
      name: 'order_materials',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      fields: [
        {
          name: 'work_order',
          type: 'relation',
          collectionId: workOrdersCol.id,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'material',
          type: 'relation',
          collectionId: materialsCol.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'quantity', type: 'number', required: true, min: 0.01 },
        { name: 'unit', type: 'text', required: true },
        { name: 'unit_price', type: 'number', min: 0 },
        { name: 'total_price', type: 'number', min: 0 },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_order_materials_wo ON order_materials (work_order)',
        'CREATE INDEX idx_order_materials_mat ON order_materials (material)',
      ],
    })
    app.save(orderMaterials)

    // 2. Fotos do Atendimento
    const orderPhotos = new Collection({
      name: 'order_photos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      fields: [
        {
          name: 'work_order',
          type: 'relation',
          collectionId: workOrdersCol.id,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'image',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          required: true,
        },
        { name: 'description', type: 'text' },
        { name: 'caption', type: 'text' },
        { name: 'display_order', type: 'number' },
        { name: 'captured_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_order_photos_wo ON order_photos (work_order)'],
    })
    app.save(orderPhotos)

    // 3. Histórico de Mudanças da OS
    const orderHistory = new Collection({
      name: 'order_history',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'work_order',
          type: 'relation',
          collectionId: workOrdersCol.id,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'status_from', type: 'text' },
        { name: 'status_to', type: 'text', required: true },
        { name: 'user_name', type: 'text', required: true },
        { name: 'user_id', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_order_history_wo ON order_history (work_order)'],
    })
    app.save(orderHistory)

    // 4. Manutenções Futuras / Preventivas
    const futureMaintenances = new Collection({
      name: 'future_maintenances',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'client',
          type: 'relation',
          collectionId: clientsCol.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'scheduled_date', type: 'date', required: true },
        { name: 'maintenance_type', type: 'text', required: true },
        { name: 'technician', type: 'relation', collectionId: techniciansCol.id, maxSelect: 1 },
        {
          name: 'status',
          type: 'select',
          values: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'],
          maxSelect: 1,
          required: true,
        },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_future_maint_client ON future_maintenances (client)',
        'CREATE INDEX idx_future_maint_date ON future_maintenances (scheduled_date)',
      ],
    })
    app.save(futureMaintenances)
  },
  (app) => {
    const futureMaintenances = app.findCollectionByNameOrId('future_maintenances')
    if (futureMaintenances) app.delete(futureMaintenances)
    const orderHistory = app.findCollectionByNameOrId('order_history')
    if (orderHistory) app.delete(orderHistory)
    const orderPhotos = app.findCollectionByNameOrId('order_photos')
    if (orderPhotos) app.delete(orderPhotos)
    const orderMaterials = app.findCollectionByNameOrId('order_materials')
    if (orderMaterials) app.delete(orderMaterials)
  },
)
