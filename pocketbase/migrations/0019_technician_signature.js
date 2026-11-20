/**
 * 0019 — Rubrica do técnico.
 *
 * Cada técnico desenha a própria rubrica uma vez (na ficha dele). Ela passa a
 * aparecer já impressa no PDF da OS, ao lado do nome, no lugar do campo em
 * branco. O nome completo fica embaixo, menor.
 *
 * Guarda como arquivo de imagem (PNG) no campo `signature` da coleção de
 * técnicos.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('technicians')
    if (!col.fields.getByName('signature')) {
      col.fields.add(
        new FileField({
          name: 'signature',
          required: false,
          maxSelect: 1,
          maxSize: 524288,
          mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('technicians')
      const f = col.fields.getByName('signature')
      if (f) {
        col.fields.removeById(f.id)
        app.save(col)
      }
    } catch (_) {}
  },
)
