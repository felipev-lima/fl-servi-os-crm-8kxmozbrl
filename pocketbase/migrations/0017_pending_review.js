/**
 * 0017 — Produto cadastrado rápido pelo técnico, pendente de revisão.
 *
 * Na rua, o técnico pode precisar de um material que não está no catálogo. Ele
 * cadastra só o nome e lança na OS. Esse produto nasce marcado como
 * `pending_review` para o administrador revisar depois: completar unidade,
 * categoria e preço, e então liberar.
 *
 * Enquanto estiver pendente, o produto aparece destacado na OS e na lista de
 * materiais, para o admin saber o que veio do campo e não foi conferido.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('materials')
    if (!col.fields.getByName('pending_review')) {
      col.fields.add(new BoolField({ name: 'pending_review' }))
      app.save(col)
    }

    // produto sem unidade definida entra como UN, que é o padrão da casa
    app.db().newQuery("UPDATE materials SET unit = 'UN' WHERE unit = '' OR unit IS NULL").execute()
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('materials')
      const f = col.fields.getByName('pending_review')
      if (f) {
        col.fields.removeById(f.id)
        app.save(col)
      }
    } catch (_) {}
  },
)
