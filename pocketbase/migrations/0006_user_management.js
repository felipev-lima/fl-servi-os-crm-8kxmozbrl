/**
 * 0006 — Gestão de usuários e permissões.
 *
 * - Adiciona o campo bool `active` ao cadastro de usuários (situação Ativo/Inativo).
 * - Reforça as regras da coleção `users` no servidor:
 *   * bloqueia autorregistro anônimo (createRule exige administrador autenticado);
 *   * impede que um usuário altere o próprio `role`, `active` ou e-mail via self-update;
 *   * list/view liberado a qualquer usuário autenticado (nomes/e-mails não são sensíveis),
 *     criação, mudança de perfil, ativação e exclusão restritos ao administrador.
 *   * exclusão protegida: um admin não pode se excluir (regra `id != @request.auth.id`).
 *
 * O hook `pocketbase/hooks/usersManage.pb.js` complementa com validações server-side
 * (senha mínima, admin não se rebaixa/desativa, último admin protegido).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('users')

    // 1. Campo `active` (default: ativo). Nunca `required` — bool required = só aceita true.
    if (!col.fields.getByName('active')) {
      col.fields.add(new BoolField({ name: 'active' }))
    }

    // 2. Regras server-side
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    col.updateRule =
      "(@request.auth.role = 'admin' && id != @request.auth.id) || " +
      '(id = @request.auth.id && @request.body.role:changed = false && ' +
      '@request.body.active:changed = false && @request.body.email:changed = false)'
    col.deleteRule = "@request.auth.role = 'admin' && id != @request.auth.id"

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('users')
    // Estado anterior (0002): self-update sem restrições
    col.listRule = 'id = @request.auth.id'
    col.viewRule = 'id = @request.auth.id'
    col.createRule = ''
    col.updateRule = 'id = @request.auth.id'
    col.deleteRule = 'id = @request.auth.id'
    if (col.fields.getByName('active')) {
      col.fields.removeByName('active')
    }
    app.save(col)
  },
)
