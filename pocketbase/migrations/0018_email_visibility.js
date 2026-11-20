/**
 * 0018 — E-mail do usuário visível na tela de Usuários.
 *
 * O PocketBase guarda `emailVisibility` por registro. Quando está `false`
 * (padrão), a API devolve o registro SEM o campo `email` — só o próprio dono
 * vê o seu. Por isso o e-mail não aparecia na lista de usuários cadastrados,
 * mesmo tendo sido gravado certinho (o login com ele funcionava).
 *
 * Num sistema interno, onde o administrador gerencia a equipe, o e-mail precisa
 * estar visível para quem administra.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // campo emailVisibility já existe (é do sistema); liga em todo mundo
    app.db().newQuery('UPDATE users SET emailVisibility = true').execute()

    // regra de listagem/visualização: administrador vê o e-mail da equipe
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    app.save(users)
  },
  (app) => {
    // sem volta: o e-mail ficar visível é o comportamento desejado
  },
)
