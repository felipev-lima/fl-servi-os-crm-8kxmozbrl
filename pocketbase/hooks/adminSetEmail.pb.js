///
/// Alteração de e-mail de usuário pelo administrador.
///
/// A regra da coleção `users` impede que alguém altere o próprio e-mail
/// (`@request.body.email:changed = false` no self-update), e o administrador
/// não consegue trocar o e-mail de outra conta pela API padrão sem a senha
/// antiga. Esta rota resolve os dois casos no servidor.
///
/// POST /backend/v1/admin-set-email
/// body: { userId: string, email: string }
///
routerAdd(
  'POST',
  '/backend/v1/admin-set-email',
  (e) => {
    const auth = e.auth
    if (!auth || auth.getString('role') !== 'admin') {
      throw new ForbiddenError('Somente um administrador pode alterar e-mails de acesso.')
    }

    const body = e.requestInfo().body || {}
    const userId = String(body.userId || '').trim()
    const email = String(body.email || '')
      .trim()
      .toLowerCase()

    if (!userId) throw new BadRequestError('Informe o usuário.')
    if (!email || email.indexOf('@') < 0) {
      throw new BadRequestError('Informe um e-mail válido.')
    }

    let user
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      throw new BadRequestError('Usuário não encontrado.')
    }

    // E-mail é único na coleção: recusa se outra conta já usa.
    try {
      const outro = $app.findAuthRecordByEmail('users', email)
      if (outro && outro.id !== user.id) {
        throw new BadRequestError('Este e-mail já está em uso por outra conta.')
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err
      // "no rows in result set" = ninguém usa esse e-mail, segue.
    }

    const anterior = user.email()
    user.setEmail(email)
    user.setVerified(true)
    user.set('emailVisibility', true)
    $app.save(user)

    $app
      .logger()
      .info(
        'e-mail de usuario alterado por administrador',
        'alvo',
        userId,
        'de',
        anterior,
        'para',
        email,
        'por',
        auth.id,
      )

    return e.json(200, { ok: true, userId: userId, email: user.email() })
  },
  $apis.requireAuth(),
)
