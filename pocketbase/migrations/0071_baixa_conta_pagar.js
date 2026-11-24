/**
 * 0071 — Baixa de conta a pagar gerando lançamento no financeiro (C1).
 *
 * A coleção `bills` já existe (0027) e nada nela muda de estrutura — apenas
 * ganha o campo `payment_transaction`, que aponta para o lançamento criado
 * quando a conta é paga:
 *
 *   - preenchido  → a conta já tem lançamento, a baixa não repete;
 *   - vazio       → conta em aberto (ou paga antes deste campo existir, sem
 *                   lançamento — nessas a baixa pode ser refeita com segurança,
 *                   porque nenhuma conta existe ainda no banco).
 *
 * REGRA DO CLIENTE RESPEITADA: nada é apagado nem alterado — a migration só
 * acrescenta o campo e o índice da consulta de conferência. Os registros
 * herdados da FL em qualquer coleção ficam intactos.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bills')

    if (!col.fields.getByName('payment_transaction')) {
      col.fields.add(
        new RelationField({
          name: 'payment_transaction',
          collectionId: app.findCollectionByNameOrId('transactions').id,
          maxSelect: 1,
          required: false,
          cascadeDelete: false,
        }),
      )
    }

    const idx = 'CREATE INDEX idx_bills_payment ON bills (payment_transaction)'
    if (col.indexes.indexOf(idx) < 0) {
      col.indexes = [...col.indexes, idx]
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('bills')
    col.fields.removeByName('payment_transaction')
    app.save(col)
  },
)
