/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 *
 * TRÊS ARMADILHAS DO POCKETBASE resolvidas aqui, cada uma custou uma rodada:
 *  1. arquivo terminando em `.js` NÃO registra — precisa ser `.pb.js`;
 *  2. `e.requestInfo()` não é função neste hook — `requestInfo` é ATRIBUTO;
 *  3. `e.auth` vem vazio — o usuário logado está em `e.requestInfo.auth`.
 *
 * A quarta suspeita (o hook causar 504 na listagem) era FALSA: a API deste
 * projeto oscila sozinha e devolve 504 esporádico em listas grandes. Medido
 * depois: 1.511 produtos em 0,8s por página de 200.
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
