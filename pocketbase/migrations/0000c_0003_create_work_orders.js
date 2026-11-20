migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')
    const techniciansCol = app.findCollectionByNameOrId('technicians')

    // 1. Ordens de Serviço
    const workOrders = new Collection({
      name: 'work_orders',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'order_number', type: 'number', required: true },
        {
          name: 'client',
          type: 'relation',
          collectionId: clientsCol.id,
          required: true,
          maxSelect: 1,
        },
        { name: 'technician', type: 'relation', collectionId: techniciansCol.id, maxSelect: 1 },
        {
          name: 'service_type',
          type: 'select',
          values: [
            'Instalação',
            'Manutenção Preventiva',
            'Manutenção Corretiva',
            'Vistoria Técnica',
            'CFTV / Alarme',
            'Rede / Telecom',
            'Outro',
          ],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          values: [
            'ABERTA',
            'AGENDADA',
            'EM ANDAMENTO',
            'AGUARDANDO MATERIAL',
            'FINALIZADA',
            'CANCELADA',
          ],
          maxSelect: 1,
          required: true,
        },
        { name: 'description', type: 'text', required: true },
        { name: 'technical_report', type: 'text' },
        { name: 'scheduled_date', type: 'date' },
        { name: 'opened_at', type: 'date' },
        { name: 'completed_at', type: 'date' },
        { name: 'location_lat', type: 'number' },
        { name: 'location_lng', type: 'number' },
        { name: 'location_address', type: 'text' },
        {
          name: 'signature_image',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        },
        { name: 'client_signer_name', type: 'text' },
        { name: 'client_signer_doc', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_work_orders_number ON work_orders (order_number)',
        'CREATE INDEX idx_work_orders_client ON work_orders (client)',
        'CREATE INDEX idx_work_orders_technician ON work_orders (technician)',
        'CREATE INDEX idx_work_orders_status ON work_orders (status)',
      ],
    })
    app.save(workOrders)
  },
  (app) => {
    const workOrders = app.findCollectionByNameOrId('work_orders')
    if (workOrders) app.delete(workOrders)
  },
)
