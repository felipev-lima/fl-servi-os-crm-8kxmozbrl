///
/// 0071 — Planilha do Google: onde ela vive.
///
/// PEDIDO DO FELIPE (27/11/2026): "crie uma planilha no Drive do Felipe com as
/// abas de Lançamentos e Contas a Receber, grave os dados e mantenha
/// sincronizado. Tudo dentro do CRM, usando o conector googlesheets."
///
/// POR QUE NA COLEÇÃO `settings` E NÃO NUM ARQUIVO DE TEXTO: o ID da planilha
/// precisa ser o MESMO para todo usuário do CRM e sobreviver a novas versões.
/// Guardar no registro único de configurações resolve os dois: é lido pelo
/// navegador de qualquer pessoa e não se perde no deploy.
///
/// `PENDENTE` no status é o estado inicial: a tela oferece criar ou apontar
/// para uma planilha existente. Nada é criado sozinho — criar um arquivo no
/// Drive do Felipe é ação que ele precisa autorizar na tela.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    const campos = [
      { name: 'gsheets_id', max: 200 },
      { name: 'gsheets_url', max: 500 },
      { name: 'gsheets_status', max: 40 },
      { name: 'gsheets_sincronizado_em', max: 40 },
      { name: 'gsheets_linhas', max: 20 },
      { name: 'gsheets_erro', max: 500 },
    ]

    for (const c of campos) {
      if (col.fields.getByName(c.name) === null) {
        col.fields.add(new TextField({ name: c.name, max: c.max }))
      }
    }
    app.save(col)

    // estado inicial: nenhuma planilha configurada ainda
    const regs = app.findRecordsByFilter('settings', '', '', 1, 0)
    if (regs.length > 0) {
      if (!regs[0].getString('gsheets_status')) {
        regs[0].set('gsheets_status', 'PENDENTE')
        app.save(regs[0])
      }
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('settings')
    for (const nome of [
      'gsheets_id',
      'gsheets_url',
      'gsheets_status',
      'gsheets_sincronizado_em',
      'gsheets_linhas',
      'gsheets_erro',
    ]) {
      try {
        col.fields.removeByName(nome)
      } catch (_) {}
    }
    app.save(col)
  },
)
