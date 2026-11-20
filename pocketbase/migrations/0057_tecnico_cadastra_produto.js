/**
 * 0057 — Técnico pode CADASTRAR produto; ninguém além do admin LÊ preço.
 *
 * Regra do Felipe (20/11/2026): o técnico na rua às vezes compra no comércio
 * local para entregar na hora, e o produto não está no catálogo. Ele precisa
 * cadastrar — mas não pode ver nem informar valor, porque preço é assunto do
 * dono.
 *
 * O que muda:
 *  - createRule de `materials` passa a aceitar admin OU tecnico;
 *  - o produto criado pelo técnico nasce com `pending_review = true` e preço 0,
 *    então aparece em vermelho para o admin revisar.
 *
 * updateRule e deleteRule continuam SÓ de admin: técnico cadastra, não corrige
 * preço de item existente. Esconder a leitura de preço na API é feito por hook
 * (arquivo `materials_oculta_preco_*.js`), porque regra de coleção não esconde
 * campo — ela libera ou bloqueia a LINHA inteira.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('materials')
    col.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')"
    app.save(col)

    /**
     * Os 569 produtos sem preço já existentes ganham marcação de revisão?
     * Não: eles nunca tiveram preço na origem, e marcar 569 itens de uma vez
     * esvaziaria o sentido do alerta. Só o que o TÉCNICO criar entra assim.
     */
  },
  (app) => {
    const col = app.findCollectionByNameOrId('materials')
    col.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(col)
  },
)
