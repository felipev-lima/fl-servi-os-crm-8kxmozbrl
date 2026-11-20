///
/// 0007 — Checklist de itens pendentes por ordem de serviço.
///
/// Adiciona à coleção `work_orders` o campo JSON `checklist`
/// (array de { id, text, done }), salvo junto com os demais dados da OS.
///
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('work_orders')
    if (!collection.fields.getByName('checklist')) {
      collection.fields.add(
        new Field({
          type: 'json',
          name: 'checklist',
          maxSize: 2000000,
        }),
      )
      app.save(collection)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('work_orders')
    const field = collection.fields.getByName('checklist')
    if (field) {
      collection.fields.removeByName('checklist')
      app.save(collection)
    }
  },
)
