/**
 * 0010 — Pagamento recebido (DINHEIRO) na OS.
 *
 * Na planilha de faturamento do Felipe, a coluna TIPO aceita quatro valores:
 * CAPITAL, CONSUMO, SERVIÇO e DINHEIRO. O DINHEIRO é o pagamento que o cliente
 * fez: entra com valor NEGATIVO e abate do DÉBITO TOTAL da OS.
 *
 * Ex.: OS de R$ 1.416,00 com R$ 1.000,00 pagos -> saldo de R$ 416,00.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    if (!col.fields.getByName('payment_received')) {
      col.fields.add(
        new NumberField({
          name: 'payment_received',
          required: false,
          min: 0,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const f = col.fields.getByName('payment_received')
    if (f) {
      col.fields.removeById(f.id)
      app.save(col)
    }
  },
)
