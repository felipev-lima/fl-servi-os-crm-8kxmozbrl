///
/// 0064 — Índices para a importação do histórico financeiro.
///
/// POR QUE EXISTE: a coleção `transactions` não tinha índice nenhum. Com 54
/// lançamentos isso não incomodava; com 943 importados da planilha, toda
/// consulta por cliente, por data ou por tipo varreria a tabela inteira.
///
/// Índices criados:
///  - (client, date): a consulta mais comum — "o extrato deste cliente".
///  - (date): relatórios por período (fluxo de caixa, faturamento).
///  - (kind): totais por tipo (capital, consumo, serviço, dinheiro).
///  - (legacy_row) único: garante que a importação da planilha não duplique.
///    Cada linha da planilha tem uma chave "aba#linha"; tentar importar duas
///    vezes falha no banco em vez de criar dado repetido.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('transactions')

    col.indexes = [
      'CREATE INDEX idx_transactions_client_date ON transactions (client, date)',
      'CREATE INDEX idx_transactions_date ON transactions (date)',
      'CREATE INDEX idx_transactions_kind ON transactions (kind)',
      // Índice único parcial: só vale quando legacy_row tem valor, para não
      // bloquear os lançamentos do dia a dia (que têm legacy_row vazio).
      "CREATE UNIQUE INDEX idx_transactions_legacy ON transactions (legacy_row) WHERE legacy_row != ''",
    ]
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('transactions')
    col.indexes = []
    app.save(col)
  },
)
