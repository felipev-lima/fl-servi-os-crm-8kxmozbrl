/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 * Esconder na tela não basta — o mesmo dado sai pela API, e qualquer um com o
 * token consegue ler. Este hook limpa os campos de dinheiro na RESPOSTA.
 *
 * ATENÇÃO AO NOME DO ARQUIVO: os hooks deste projeto usam o sufixo `.pb.js`
 * (`adminSetEmail.pb.js`, `usersManage.pb.js`). Com `.js` puro o arquivo é
 * enviado mas NÃO é registrado — e não aparece erro em lugar nenhum. Foi o que
 * aconteceu na primeira tentativa.
 */
onRecordEnrich((e) => {
  try {
    const info = e.requestInfo()
    const auth = info ? info.auth : null
    const papel = auth ? String(auth.get('role') || '') : ''
    const ehAdmin = papel === 'admin' || papel === 'superadmin'
    if (!ehAdmin) {
      e.record.set('price', 0)
      e.record.set('cost', 0)
    }
  } catch (_) {
    // nunca derrubar uma leitura por causa do filtro
  }
  e.next()
}, 'materials')
