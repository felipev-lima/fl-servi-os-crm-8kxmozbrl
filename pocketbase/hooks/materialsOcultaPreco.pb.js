/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 * Esconder na tela não basta — o mesmo dado sai pela API e qualquer um com o
 * token consegue ler. Este hook limpa os campos de dinheiro na RESPOSTA.
 *
 * ARMADILHAS RESOLVIDAS (as duas custaram uma tentativa cada):
 *  1. o arquivo precisa terminar em `.pb.js` — com `.js` puro ele sobe mas não
 *     registra, e não aparece erro em lugar nenhum;
 *  2. dentro do `onRecordEnrich` NÃO existe `e.requestInfo()`: ele é atributo
 *     (`e.requestInfo`), e o usuário logado já vem em `e.auth`.
 *
 * O dado no banco continua intacto: só a resposta HTTP é limpa.
 */
onRecordEnrich((e) => {
  try {
    const auth = e.auth || null
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
