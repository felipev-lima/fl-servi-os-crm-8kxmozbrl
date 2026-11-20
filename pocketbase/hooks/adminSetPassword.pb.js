///
/// Redefinição de senha pelo administrador.
///
/// A API padrão do PocketBase exige a senha ANTIGA mesmo quando quem altera é um
/// administrador (erro `oldPassword: Cannot be blank`), então a tela de Usuários
/// não consegue redefinir a senha de outra pessoa. Esta rota faz isso no servidor:
/// recebe o id do usuário e a nova senha, confirma que quem pediu é admin e grava.
///
/// POST /backend/v1/admin-set-password
/// body: { userId: string, newPassword: string }
///
routerAdd(
  'POST',
  '/backend/v1/admin-set-password',
  (e) => {
    const auth = e.auth
    if (!auth || auth.getString('role') !== 'admin') {
      throw new ForbiddenError('Somente um administrador pode redefinir senhas.')
    }

    const body = e.requestInfo().body || {}
    const userId = String(body.userId || '').trim()
    const newPassword = String(body.newPassword || '')

    if (!userId) throw new BadRequestError('Informe o usuário.')
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestError('A senha deve ter no mínimo 8 caracteres.')
    }

    let user
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      throw new BadRequestError('Usuário não encontrado.')
    }

    // setPassword calcula o hash; record.set('password', ...) gravaria texto puro.
    user.setPassword(newPassword)
    $app.save(user)

    $app.logger().info('senha redefinida por administrador', 'alvo', userId, 'por', auth.id)

    return e.json(200, { ok: true, userId: userId, name: user.getString('name') })
  },
  $apis.requireAuth(),
)
