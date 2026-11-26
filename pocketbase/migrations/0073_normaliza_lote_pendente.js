/**
 * 0073 — NORMALIZA linhas de pagamento de lote de NF que ficaram com
 * `sent_to_finance = PENDENTE` após uma correção parcial do diálogo
 * "Corrigir recebimento".
 *
 * CASO REAL (pedido do Felipe, 26/11/2026): na correção do recebimento da
 * NF 803 do cliente ESCOLA NATALIO SALVANTES ANTUNES, a linha DINHEIRO da bola
 * de vôlei (R$ 1.982,20) ficou com o sinal de envio inconsistente — as outras
 * 11 linhas do mesmo lote estão ENVIADA, essa ficou PENDENTE. O valor, o
 * vínculo (`settles`) e a nota estão corretos; só o marcador divergia, fazendo
 * a linha aparecer como "pendente" na listagem de lançamentos.
 *
 * O QUE A MIGRAÇÃO FAZ: para TODA transação que é pagamento (kind = DINHEIRO),
 * pertence a um lote de nota (nf_lote preenchido) e quita um item
 * (settles preenchido) mas está marcada PENDENTE — grava ENVIADA. É exatamente
 * o estado que a baixa por NF (RecebimentoLoteDialog) grava ao criar as linhas.
 *
 * IDEMPOTENTE: seleciona pelo estado errado; numa base já corrigida (ou vazia)
 * não encontra nada e não faz nada. NADA É APAGADO — só o marcador é gravado.
 */
migrate(
  (app) => {
    const erradas = app.findRecordsByFilter(
      'transactions',
      "kind = 'DINHEIRO' && nf_lote != '' && settles != '' && sent_to_finance = 'PENDENTE'",
      '-date',
      500,
      0,
    )
    for (const r of erradas) {
      r.set('sent_to_finance', 'ENVIADA')
      app.save(r)
    }
  },
  (app) => {
    // Reversão: é um conserto de dados pontual, sem efeito estrutural —
    // reverter regravaria o estado errado, então não faz nada.
  },
)
