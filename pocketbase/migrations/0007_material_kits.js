/**
 * 0007 — Listas de materiais padrão ("kits de serviço").
 *
 * Um kit é um conjunto de produtos que normalmente são usados juntos num tipo de
 * serviço (ex.: CFTV, rede, alarme). Dentro da OS, o técnico escolhe o kit e o
 * sistema traz a lista de materiais de uma vez, com a quantidade padrão; ele ajusta
 * a quantidade de cada item, apaga o que não usou e acrescenta outros produtos.
 *
 * Duas coleções:
 *  - material_kits       — o cabeçalho do kit (nome, descrição, tipo de serviço).
 *  - material_kit_items  — os produtos de cada kit, com quantidade padrão.
 */
migrate(
  (app) => {
    const materialsId = app.findCollectionByNameOrId('materials').id

    const kits = new Collection({
      name: 'material_kits',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text', required: false },
        {
          name: 'service_type',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: [
            'Instalação',
            'Manutenção Preventiva',
            'Manutenção Corretiva',
            'Vistoria Técnica',
            'CFTV / Alarme',
            'Rede / Telecom',
            'Outro',
          ],
        },
        { name: 'active', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_material_kits_name ON material_kits (name)'],
    })
    app.save(kits)

    const kitsId = app.findCollectionByNameOrId('material_kits').id

    const items = new Collection({
      name: 'material_kit_items',
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
          name: 'kit',
          type: 'relation',
          required: true,
          collectionId: kitsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'material',
          type: 'relation',
          required: true,
          collectionId: materialsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'quantity', type: 'number', required: false },
        { name: 'notes', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_kit_items_kit ON material_kit_items (kit)'],
    })
    app.save(items)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('material_kit_items'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('material_kits'))
    } catch (_) {}
  },
)
