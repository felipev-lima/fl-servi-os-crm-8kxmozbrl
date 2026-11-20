/**
 * 0020 — Aumenta o limite da foto da OS e libera mais formatos.
 *
 * O campo `image` de `order_photos` estava limitado a 10 MB, mas uma foto
 * tirada por celular moderno (iPhone/Android) chega a 12–15 MB. O upload
 * falhava com "Failed to create record" e o app mostrava apenas "Erro ao
 * enviar as fotos" — o que dava a impressão de que a foto "não salvava".
 *
 * Eleva o limite para 25 MB. Mesmo assim o app REDIMENSIONA a foto antes de
 * enviar (ver src/lib/imagem.ts), para o armazenamento não crescer sem
 * controle e o envio ficar rápido no 4G da rua.
 *
 * Também aceita HEIC/HEIF, que é o formato nativo da câmera do iPhone.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('order_photos')
    const campo = col.fields.getByName('image')
    if (campo) {
      campo.maxSize = 26214400 // 25 MB
      campo.mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('order_photos')
      const campo = col.fields.getByName('image')
      if (campo) {
        campo.maxSize = 10485760
        campo.mimeTypes = ['image/jpeg', 'image/png', 'image/webp']
        app.save(col)
      }
    } catch (_) {}
  },
)
