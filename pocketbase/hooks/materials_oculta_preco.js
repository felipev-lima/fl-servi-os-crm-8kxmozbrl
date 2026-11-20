/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 * Esconder na tela não basta — o mesmo dado sai pela API, e qualquer um com o
 * token consegue ler. Este hook limpa os campos de dinheiro na RESPOSTA.
 *
 * O dado no banco continua intacto: só a resposta HTTP é limpa.
 *
 * Duas armadilhas do PocketBase que este arquivo respeita:
 *  1. hooks rodam em VM separada — nada de função declarada no topo;
 *  2. `set()` no record durante o enrich exige que o campo exista; se o valor
 *     for nulo, `set` pode falhar silenciosamente, então também zeramos o
 *     objeto de resposta do item quando possível.
 */
onRecordEnrich(
  (e) => {
    try {
      const info = e.requestInfo()
      const auth = info ? info.auth : null
      const papel = auth ? String(auth.get('role') || '') : ''
      const ehAdmin = papel === 'admin' || papel === 'superadmin'
      console.log('[oculta_preco] papel=' + papel + ' admin=' + ehAdmin)
      if (!ehAdmin) {
        e.record.set('price', 0)
        e.record.set('cost', 0)
        console.log('[oculta_preco] zerou preco/custo de ' + e.record.get('name'))
      }
    } catch (err) {
      console.log('[oculta_preco] ERRO: ' + err)
    }
    e.next()
  },
  'materials',
)
