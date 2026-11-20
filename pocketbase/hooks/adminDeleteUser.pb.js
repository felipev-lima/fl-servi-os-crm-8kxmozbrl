///
/// Exclusão de usuário pelo administrador.
///
/// A API padrão recusa excluir um registro de `users` quando ele ainda tem
/// linhas nas coleções de sistema de autenticação (_authOrigins, _mfas, _otps,
/// _externalAuths). Esta rota remove essas linhas antes de excluir a conta e
/// devolve o que encontrou, para diagnóstico.
///
/// POST /backend/v1/admin-delete-user
/// body: { userId: string }
///
routerAdd(
  'POST',
  '/backend/v1/admin-delete-user',
  (e) => {
    const auth = e.auth
    if (!auth || auth.getString('role') !== 'admin') {
      throw new ForbiddenError('Somente um administrador pode excluir usuários.')
    }

    const body = e.requestInfo().body || {}
    const userId = String(body.userId || '').trim()
    if (!userId) throw new BadRequestError('Informe o usuário.')
    if (userId === auth.id) {
      throw new BadRequestError('Você não pode excluir a sua própria conta.')
    }

    let user
    try {
      user = $app.findRecordById('users', userId)
    } catch (_) {
      throw new BadRequestError('Usuário não encontrado.')
    }

    // Não deixa o sistema ficar sem administrador ativo.
    if (user.getString('role') === 'admin' && user.getBool('active')) {
      let outros = 0
      try {
        const admins = $app.findRecordsByFilter(
          'users',
          "role = 'admin' && active = true",
          '',
          0,
          0,
        )
        for (const r of admins) {
          if (r.id !== userId) outros++
        }
      } catch (_) {}
      if (outros === 0) {
        throw new BadRequestError('O sistema precisa de pelo menos um administrador ativo.')
      }
    }

    // Limpa vínculos das coleções de sistema que travam a exclusão.
    const removidos = {}
    const sistemas = ['_authOrigins', '_mfas', '_otps', '_externalAuths']
    for (const col of sistemas) {
      let apagados = 0
      try {
        const linhas = $app.findRecordsByFilter(
          col,
          "collectionRef = 'pbc_3142635823' && recordRef = '" + userId + "'",
          '',
          0,
          0,
        )
        for (const linha of linhas) {
          $app.delete(linha)
          apagados++
        }
      } catch (_) {
        // coleção ausente ou sem esses campos: segue
      }
      if (apagados > 0) removidos[col] = apagados
    }

    const nome = user.getString('name')
    try {
      $app.delete(user)
    } catch (err) {
      $app.logger().error('falha ao excluir usuario', 'alvo', userId, 'erro', String(err))
      throw new BadRequestError(
        'Nao foi possivel excluir: a conta ainda tem vinculo com outro registro. ' + String(err),
      )
    }

    $app
      .logger()
      .info('usuario excluido por administrador', 'alvo', userId, 'nome', nome, 'por', auth.id)

    return e.json(200, { ok: true, removidos: removidos, name: nome })
  },
  $apis.requireAuth(),
)
