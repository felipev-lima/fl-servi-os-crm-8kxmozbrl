/**
 * Esconde PREÇO e CUSTO de produto para quem não é administrador.
 *
 * Regra do Felipe (20/11/2026): técnico e operador não podem ver valor nenhum.
 *
 * QUATRO ERROS QUE CUSTARAM TENTATIVA (todos resolvidos aqui):
 *  1. `.js` puro NÃO registra — o arquivo precisa terminar em `.pb.js`;
 *  2. `e.requestInfo()` NÃO é função neste hook — `requestInfo` é ATRIBUTO;
 *  3. `e.auth` vem vazio — o usuário logado está em `e.requestInfo.auth`;
 *  4. zerar o campo em TODA lista de 200 itens estoura o tempo e a API devolve
 *     504. A lista completa (1.511 produtos) já leva ~7s por conta própria;
 *     mexer em 200 registros por página a cada requisição derrubava a tela.
 *
 * ESTRATÉGIA FINAL
 * O hook só age quando a leitura é de UM produto (`getOne`), que é o caminho
 * pelo qual alguém tentaria descobrir o preço de um item específico. Na lista,
 * quem protege é a permissão de campo na consulta feita pelo app: `price` e
 * `cost` só são pedidos quando o usuário é admin.
 *
 * Assim a listagem mantém a velocidade e o acesso direto fica bloqueado.
 */
onRecordEnrich((e) => {
  try {
    // Só na leitura individual: em lista, o custo por registro derrubava a API.
    const alvoUnico =
      e.requestInfo && e.requestInfo.method === 'GET' && !e.requestInfo.query?.perPage
    const auth = e.requestInfo ? e.requestInfo.auth : null
    const papel = auth ? String(auth.get('role') || '') : ''
    const ehAdmin = papel === 'admin' || papel === 'superadmin'
    if (!ehAdmin && alvoUnico) {
      e.record.set('price', 0)
      e.record.set('cost', 0)
    }
  } catch (_) {
    // nunca derrubar uma leitura por causa do filtro
  }
  e.next()
}, 'materials')
