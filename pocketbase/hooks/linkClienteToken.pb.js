/**
 * Token do link do cliente nasce no SERVIDOR, junto com o documento.
 *
 * O campo client_link_token (migration 0063) é preenchido aqui no create e
 * também no update (cobertura para os registros antigos da copiação). Assim o
 * CRM só monta a URL: /cliente/:tipo/:id?t=TOKEN.
 */
onRecordCreate(
  (e) => {
    try {
      if (!e.record.getString('client_link_token')) {
        e.record.set('client_link_token', $security.randomString(24))
      }
    } catch (err) {
      console.log('[link-cliente] token no create falhou: ' + err)
    }
    e.next()
  },
  'work_orders',
  'quotes',
)

onRecordUpdate(
  (e) => {
    try {
      if (!e.record.getString('client_link_token')) {
        e.record.set('client_link_token', $security.randomString(24))
      }
    } catch (err) {
      console.log('[link-cliente] token no update falhou: ' + err)
    }
    e.next()
  },
  'work_orders',
  'quotes',
)
