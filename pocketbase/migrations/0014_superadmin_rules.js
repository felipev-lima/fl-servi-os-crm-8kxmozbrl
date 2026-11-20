/**
 * 0014 — Ajuste das regras de usuários para o superadmin.
 *
 * A 0013 trocou o papel do dono do SaaS para `superadmin`, mas as regras de
 * usuários exigiam `role = 'admin'` para criar, editar e excluir pessoa —
 * então nem o próprio superadmin conseguia cadastrar usuário.
 *
 * Aqui as três regras aceitam o superadmin. O isolamento por empresa é
 * mantido: quem é de uma empresa só alcança o pessoal da própria empresa.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // DENTRO: registro da empresa do usuário; superadmin atravessa
    const DENTRO =
      "@request.auth.id != '' && (company = @request.auth.company || @request.auth.role = 'superadmin')"
    const GESTOR = `(@request.auth.role = 'admin' || @request.auth.role = 'superadmin')`

    users.createRule = `${DENTRO} && ${GESTOR}`
    users.updateRule = `${DENTRO} && ${GESTOR}`
    users.deleteRule = `${DENTRO} && ${GESTOR}`

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule =
      "@request.auth.id != '' && (company = @request.auth.company || @request.auth.role = 'superadmin') && @request.auth.role = 'admin'"
    users.deleteRule = users.createRule
    app.save(users)
  },
)
