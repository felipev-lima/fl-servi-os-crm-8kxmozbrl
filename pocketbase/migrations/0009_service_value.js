/**
 * 0009 — Valor de mão de obra (serviço) na OS.
 *
 * O Felipe fecha as notas por OS separando o que é PRODUTO do que é SERVIÇO.
 * O app já soma o valor dos materiais; faltava o valor do serviço prestado.
 * Este campo guarda esse valor (preenchido na hora de fechar a OS) e alimenta
 * a coluna "SUB TOTAL SERVIÇO" da planilha de orçamento/nota.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    if (!col.fields.getByName('service_value')) {
      col.fields.add(
        new NumberField({
          name: 'service_value',
          required: false,
          min: 0,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const f = col.fields.getByName('service_value')
    if (f) {
      col.fields.removeById(f.id)
      app.save(col)
    }
  },
)
