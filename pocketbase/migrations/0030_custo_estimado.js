/**
 * 0030 — Custo estimado por marcação.
 *
 * A FL nunca teve custo, só preço de venda — e sem custo não existe margem.
 * Aqui entra um campo que separa o que foi CALCULADO do que o Felipe DIGITOU:
 *
 *   cost_estimated = true   -> custo veio da conta (preço ÷ 1,6)
 *   cost_estimated = false  -> custo informado por ele, vale mais
 *
 * Sem essa distinção, meses depois ninguém sabe qual número é real. Na hora de
 * o Felipe corrigir um item, o app marca como confirmado.
 */
migrate(
  (app) => {
    const mats = app.findCollectionByNameOrId('materials')
    if (!mats.fields.getByName('cost_estimated')) {
      mats.fields.add(new BoolField({ name: 'cost_estimated' }))
    }
    app.save(mats)
  },
  (app) => {
    // o campo fica: remover apagaria junto qual custo é estimado e qual é real
  },
)
