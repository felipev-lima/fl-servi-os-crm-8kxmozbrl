/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 * Esconder na tela não basta — o mesmo dado sai pela API e qualquer um com o
 * token consegue ler. Este hook zera os campos de dinheiro na RESPOSTA, para
 * toda leitura de `materials` (lista, registro único e expand).
 *
 * O dado no banco continua intacto: só a resposta HTTP é limpa.
 *
 * POR QUE ZERAR EM VEZ DE REMOVER O CAMPO: o front tipa `price: number` e
 * `cost: number`; devolver `undefined` faria a tela mostrar "NaN" no lugar de
 * esconder. Com zero, o componente que já respeita `isAdmin` simplesmente não
 * exibe nada.
 */
onRecordEnrich((e) => {
  try {
    const auth = e.requestInfo().auth
    const papel = auth ? auth.get('role') : ''
    if (papel !== 'admin' && papel !== 'superadmin') {
      e.record.set('price', 0)
      e.record.set('cost', 0)
    }
  } catch (_) {
    // nunca derrubar uma leitura por causa do filtro
  }
  e.next()
}, 'materials')
