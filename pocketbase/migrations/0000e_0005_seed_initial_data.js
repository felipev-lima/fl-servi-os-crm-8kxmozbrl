migrate(
  (app) => {
    const clientsCol = app.findCollectionByNameOrId('clients')
    const techniciansCol = app.findCollectionByNameOrId('technicians')
    const materialsCol = app.findCollectionByNameOrId('materials')
    const workOrdersCol = app.findCollectionByNameOrId('work_orders')
    const orderMaterialsCol = app.findCollectionByNameOrId('order_materials')
    const futureMaintenancesCol = app.findCollectionByNameOrId('future_maintenances')

    // 1. Semente de Cliente
    let sampleClient
    try {
      sampleClient = app.findFirstRecordByData(
        'clients',
        'name',
        'PetroMacaé Engenharia e Serviços',
      )
    } catch (_) {
      sampleClient = new Record(clientsCol)
      sampleClient.set('name', 'PetroMacaé Engenharia e Serviços')
      sampleClient.set('type', 'PJ')
      sampleClient.set('phone', '(22) 2796-1200')
      sampleClient.set('email', 'operacoes@petromacae.com.br')
      sampleClient.set('document', '12.345.678/0001-90')
      sampleClient.set('address', 'Av. Agenor Caldas, 450 - Sala 302')
      sampleClient.set('neighborhood', 'Imbetiba')
      sampleClient.set('city', 'Macaé')
      sampleClient.set('notes', 'Acesso pela portaria B. Exige capacete e bota com biqueira.')
      app.save(sampleClient)
    }

    // 2. Semente de Técnico
    let sampleTech
    try {
      sampleTech = app.findFirstRecordByData('technicians', 'name', 'Carlos Alberto da Silva')
    } catch (_) {
      sampleTech = new Record(techniciansCol)
      sampleTech.set('name', 'Carlos Alberto da Silva')
      sampleTech.set('phone', '(22) 99876-5432')
      sampleTech.set('email', 'carlos.silva@flservicos.com')
      sampleTech.set('role_title', 'Técnico de Campo Sênior')
      sampleTech.set('specialties', 'CFTV, Cabeamento Estruturado, Alarmes e Elétrica')
      sampleTech.set('active', true)
      app.save(sampleTech)
    }

    // 3. Semente de Materiais (2 materiais conforme especificação)
    let mat1, mat2
    try {
      mat1 = app.findFirstRecordByData('materials', 'name', 'Cabo UTP Cat6 4 Pares Homologado')
    } catch (_) {
      mat1 = new Record(materialsCol)
      mat1.set('name', 'Cabo UTP Cat6 4 Pares Homologado')
      mat1.set('unit', 'M')
      mat1.set('category', 'Cabeamento')
      mat1.set('brand', 'Furukawa')
      mat1.set('price', 4.5)
      mat1.set('current_stock', 305)
      mat1.set('notes', 'Bobina azul 305m')
      app.save(mat1)
    }

    try {
      mat2 = app.findFirstRecordByData('materials', 'name', 'Conector RJ45 Macho Cat6 Blindado')
    } catch (_) {
      mat2 = new Record(materialsCol)
      mat2.set('name', 'Conector RJ45 Macho Cat6 Blindado')
      mat2.set('unit', 'UN')
      mat2.set('category', 'Conectividade')
      mat2.set('brand', 'Intelbras')
      mat2.set('price', 3.2)
      mat2.set('current_stock', 120)
      mat2.set('notes', 'Pacote com 100 unidades')
      app.save(mat2)
    }

    // 4. Semente de Ordem de Serviço
    let sampleOrder
    try {
      sampleOrder = app.findFirstRecordByData('work_orders', 'order_number', 1001)
    } catch (_) {
      sampleOrder = new Record(workOrdersCol)
      sampleOrder.set('order_number', 1001)
      sampleOrder.set('client', sampleClient.id)
      sampleOrder.set('technician', sampleTech.id)
      sampleOrder.set('service_type', 'CFTV / Alarme')
      sampleOrder.set('status', 'EM ANDAMENTO')
      sampleOrder.set(
        'description',
        'Adequação dos pontos de rede e substituição de câmeras IP no rack do galpão offshore.',
      )
      sampleOrder.set(
        'technical_report',
        'Iniciada passagem de cabo Cat6 pelo eletroduto da doca 2. Testado ponto 04 com sinal 100%.',
      )
      sampleOrder.set('scheduled_date', new Date().toISOString().split('T')[0])
      sampleOrder.set('opened_at', new Date().toISOString())
      sampleOrder.set('location_lat', -22.3768)
      sampleOrder.set('location_lng', -41.7869)
      sampleOrder.set('location_address', 'Av. Agenor Caldas, 450, Imbetiba, Macaé - RJ')
      sampleOrder.set(
        'notes',
        'Atendimento em andamento. Equipamento testado com sucesso preliminar.',
      )
      app.save(sampleOrder)

      // Material utilizado na OS 1001
      const orderMat = new Record(orderMaterialsCol)
      orderMat.set('work_order', sampleOrder.id)
      orderMat.set('material', mat1.id)
      orderMat.set('quantity', 45.5)
      orderMat.set('unit', 'M')
      orderMat.set('unit_price', 4.5)
      orderMat.set('total_price', 204.75)
      orderMat.set('notes', 'Ponto de rede entre rack central e doca')
      app.save(orderMat)
    }

    // 5. Semente de Manutenção Futura
    try {
      app.findFirstRecordByData('future_maintenances', 'client', sampleClient.id)
    } catch (_) {
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 30)
      const maint = new Record(futureMaintenancesCol)
      maint.set('client', sampleClient.id)
      maint.set('scheduled_date', nextDate.toISOString().split('T')[0])
      maint.set('maintenance_type', 'Inspeção Semestral do Sistema de Câmeras e Nobreaks')
      maint.set('technician', sampleTech.id)
      maint.set('status', 'PENDENTE')
      maint.set('notes', 'Verificar baterias do nobreak e foco das câmeras externas.')
      app.save(maint)
    }
  },
  (app) => {
    // Rollback seeds if needed
  },
)
