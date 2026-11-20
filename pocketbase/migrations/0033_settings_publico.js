/**
 * 0033 — Dados da empresa legíveis sem login.
 *
 * A tela de login precisa mostrar a logomarca, e o pedido do PDF (feito para o
 * cliente, não para o sistema) também. A coleção `settings` guarda dados
 * públicos da empresa — razão social, CNPJ, IE, endereço, telefone, logo — e
 * nada sensível: nenhuma senha, nenhum dado de cliente.
 *
 * Sem isso o cabeçalho e o login consultavam sem token e recebiam 403, então a
 * logo nunca aparecia.
 *
 * Escrita continua restrita ao administrador.
 */
migrate(
  (app) => {
    const cfg = app.findCollectionByNameOrId('settings')
    cfg.listRule = ''
    cfg.viewRule = ''
    cfg.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    cfg.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    cfg.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(cfg)
  },
  (app) => {
    const cfg = app.findCollectionByNameOrId('settings')
    cfg.listRule = "@request.auth.id != ''"
    cfg.viewRule = "@request.auth.id != ''"
    app.save(cfg)
  },
)
