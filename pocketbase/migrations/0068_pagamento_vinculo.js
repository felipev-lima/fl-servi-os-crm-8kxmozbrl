///
/// 0068 — Vínculo do pagamento com o item que ele quita.
///
/// PEDIDO DO FELIPE (23/11/2026): "quando eu for lançar um recebimento... eu
/// queria ter esse controle na minha mão, porque aí eu coloco lá e eu consigo
/// passar pro cliente: você ainda me deve tanto de serviço, tanto de consumo,
/// tanto de capital. E quando fosse um pagamento avulso eu poderia lançar como
/// dinheiro."
///
/// O PROBLEMA DE HOJE: um pagamento entra como `kind = DINHEIRO` e abate o
/// TOTAL do cliente, sem dizer o que pagou. Assim não há como responder "quanto
/// ele deve de serviço" — só existe um número único.
///
/// A SOLUÇÃO: o lançamento de pagamento ganha o campo `settles`, apontando para
/// o lançamento (item) que ele está quitando. Com isso:
///   - serviço, consumo e capital passam a ter saldo próprio;
///   - pagamento parcial deixa no item só o que sobrou;
///   - pagamento sem vínculo continua sendo crédito avulso;
///   - o excedente de um pagamento pode ser tratado como crédito.
///
/// NADA É APAGADO OU ALTERADO: os 943 lançamentos importados ficam exatamente
/// como estão, com `settles` vazio. O vínculo é preenchido conforme o Felipe
/// for dando baixa.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('transactions')

    if (!col.fields.getByName('settles')) {
      col.fields.add(
        new RelationField({
          name: 'settles',
          collectionId: col.id,
          maxSelect: 1,
          required: false,
          cascadeDelete: false,
        }),
      )
    }

    // Índice para a consulta mais comum da tela de baixa: "quais pagamentos
    // quitam este item".
    const idx = 'CREATE INDEX idx_transactions_settles ON transactions (settles)'
    if (col.indexes.indexOf(idx) < 0) {
      col.indexes = [...col.indexes, idx]
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('transactions')
    col.fields.removeByName('settles')
    app.save(col)
  },
)
