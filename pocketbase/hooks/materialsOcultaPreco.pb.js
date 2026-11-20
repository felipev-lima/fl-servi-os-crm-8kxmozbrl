/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 * Esconder na tela não basta — o mesmo dado sai pela API e qualquer um com o
 * token consegue ler. Este hook limpa os campos de dinheiro na RESPOSTA.
 *
 * Como o usuário chega aqui (três tentativas até acertar):
 *  1. `.js` puro NÃO registra — o arquivo precisa terminar em `.pb.js`;
 *  2. `e.requestInfo()` NÃO é função neste hook — `requestInfo` é ATRIBUTO;
 *  3. `e.auth` vem vazio no enrich — o usuário logado está em
 *     `e.requestInfo.auth`.
 *
 * O dado no banco continua intacto: só a resposta HTTP é limpa.
 */
onRecordEnrich((e) => {
  try {
    const info = e.requestInfo
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
