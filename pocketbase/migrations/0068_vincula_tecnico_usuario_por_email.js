///
/// 0068 — Vincula technicians.user ao usuário de mesmo e-mail.
///
/// Caso real: o técnico Marcos Silva tinha technicians.user vazio, e a regra da
/// coleção quotes (technicians.user ?= @request.auth.id) escondia os pedidos dele.
///
/// Regras desta migration:
/// - só preenche technicians.user quando está VAZIO;
/// - só para técnicos ativos (active = true);
/// - casa com users pelo e-mail, sem diferenciar maiúsculas/minúsculas e espaços;
/// - só vincula quando existe exatamente UM usuário com aquele e-mail;
/// - não apaga nem altera nenhum outro campo (UPDATE restrito ao campo user);
/// - idempotente: uma segunda execução não encontra técnico com user vazio.
/// - o down é vazio de propósito: desfazer o vínculo não é seguro (não há como
///   distinguir os vínculos feitos aqui dos feitos à mão).
migrate(
  (app) => {
    const tecnicos = app.findRecordsByFilter(
      'technicians',
      "active = true && (user = '' || user = null)",
      '',
      1000,
      0,
    )
    const usuarios = app.findRecordsByFilter('users', '', '', 5000, 0)
    const normaliza = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()

    for (const tec of tecnicos) {
      const email = normaliza(tec.getString('email'))
      if (!email) continue

      const casam = usuarios.filter((u) => normaliza(u.getString('email')) === email)
      if (casam.length !== 1) continue

      app
        .db()
        .newQuery(
          "UPDATE technicians SET user = {:u} WHERE id = {:id} AND (user IS NULL OR user = '')",
        )
        .bind({ u: casam[0].id, id: tec.id })
        .execute()
    }
  },
  (app) => {
    // Sem reversão: ver o comentário no topo do arquivo.
  },
)
