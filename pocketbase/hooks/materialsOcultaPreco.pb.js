/**
 * Hook neutro — apenas passa adiante.
 *
 * HISTÓRICO: este arquivo escondia preço/custo de quem não é admin, mas a
 * filtragem por registro derrubava a listagem (a API devolvia timeout e as
 * telas de Custos e Pedido ficavam presas em "Carregando").
 *
 * O bloqueio de preço no BANCO fica pendente de outra estratégia. Por ora o
 * que garante é a TELA: PedidoPage e CustosPage só pedem/exibem preço quando
 * `isAdmin`.
 *
 * Este arquivo existe só para ocupar o slug já registrado no servidor e
 * garantir que a versão cara não volte a rodar.
 */
onRecordEnrich((e) => {
  e.next()
}, 'materials')
