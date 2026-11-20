/**
 * 0008 — Quantidade do material da OS passa a ser opcional.
 *
 * Quando o tecnico aplica uma lista pronta de material, os produtos entram com a
 * quantidade ZERADA (campo vazio na tela), e ele digita quanto realmente usou.
 * Antes o campo exigia valor minimo 0,01 e era obrigatorio, o que forcava um
 * numero errado (1) e confundia o fechamento do relatorio de produtos.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('order_materials')

    const qtd = col.fields.getByName('quantity')
    qtd.required = false
    qtd.min = 0

    // unit nao existe quando o item vem de uma lista sem unidade definida
    const unidade = col.fields.getByName('unit')
    if (unidade) unidade.required = false

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('order_materials')

    const qtd = col.fields.getByName('quantity')
    qtd.required = true
    qtd.min = 0.01

    const unidade = col.fields.getByName('unit')
    if (unidade) unidade.required = true

    app.save(col)
  },
)
