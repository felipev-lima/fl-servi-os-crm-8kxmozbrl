///
/// Cadastro e atualização de usuário pelo administrador — rota única.
///
/// Por que existe: a API padrão do PocketBase recusa/obscurece três casos
/// comuns no uso real da LM SERVIÇOS:
///   1. trocar o e-mail de outra conta (exige a senha antiga da pessoa);
///   2. alterar um usuário cujo papel é diferente de 'admin' → a regra da
///      coleção devolve um 400 genérico ("Failed to update record"), sem
///      dizer o campo culpado;
///   3. criar conta com `active` ausente.
/// O resultado era o "salvar bloqueado" sem explicação na tela.
///
/// Esta rota faz o trabalho no servidor, com mensagem clara em cada falha.
///
/// POST /backend/v1/admin-upsert-user
/// body: { userId?, name, email, role, active?, password? }
routerAdd(
  'POST',
  '/backend/v1/admin-upsert-user',
  (e) => {
    const auth = e.auth
    if (!auth || auth.getString('role') !== 'admin') {
      throw new ForbiddenError('Somente um administrador pode cadastrar ou alterar usuários.')
    }

    const body = e.requestInfo().body || {}
    const userId = String(body.userId || '').trim()
    const nome = String(body.name || '').trim()
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const role = String(body.role || '').trim()
    const senha = String(body.password || '')

    if (!nome) throw new BadRequestError('Informe o nome do usuário.')
    if (!email || email.indexOf('@') < 0) {
      throw new BadRequestError('Informe um e-mail válido.')
    }
    if (['admin', 'tecnico', 'consulta'].indexOf(role) < 0) {
      throw new BadRequestError('Perfil inválido. Use Administrador, Técnico ou Consulta.')
    }
    if (senha && senha.length < 8) {
      throw new BadRequestError('A senha deve ter no mínimo 8 caracteres.')
    }

    // ---------- e-mail único ----------
    try {
      const outro = $app.findAuthRecordByEmail('users', email)
      if (outro && outro.id !== userId) {
        throw new BadRequestError('Este e-mail já está em uso por outra conta.')
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err
      // "no rows" = ninguém usa; segue
    }

    const users = $app.findCollectionByNameOrId('users')
    let user = null
    const criando = !userId
    if (criando) {
      user = new Record(users)
      user.set('active', body.active === undefined ? true : body.active === true)
    } else {
      try {
        user = $app.findRecordById('users', userId)
      } catch (_) {
        throw new BadRequestError('Usuário não encontrado.')
      }
    }

    // ---------- protege o último administrador ativo ----------
    if (!criando) {
      const eraAdminAtivo = user.getString('role') === 'admin' && user.getBool('active')
      const ficaAdminAtivo = role === 'admin' && body.active !== false
      if (eraAdminAtivo && !ficaAdminAtivo) {
        let outros = 0
        const admins = $app.findRecordsByFilter('users', "role = 'admin'", '', 0, 0)
        for (const r of admins) {
          if (r.id !== user.id && r.getBool('active')) outros++
        }
        if (outros === 0) {
          throw new BadRequestError('O sistema precisa de pelo menos um administrador ativo.')
        }
      }
      if (user.id === auth.id && role !== 'admin') {
        throw new BadRequestError('Você não pode remover o seu próprio perfil de Administrador.')
      }
    }

    // ---------- grava ----------
    user.set('name', nome)
    user.set('email', email)
    user.set('role', role)
    user.setVerified(true)
    user.set('emailVisibility', true)
    if (!criando && body.active !== undefined) {
      user.set('active', body.active === true)
    }
    if (senha) {
      user.setPassword(senha)
    } else if (criando) {
      throw new BadRequestError('Informe a senha de acesso do novo usuário.')
    }

    try {
      $app.save(user)
    } catch (err) {
      $app.logger().error('falha ao gravar usuario', 'alvo', user.id, 'erro', String(err))
      throw new BadRequestError(
        'Não foi possível salvar o usuário. Detalhe do servidor: ' + String(err),
      )
    }

    $app
      .logger()
      .info(
        criando ? 'usuario criado por administrador' : 'usuario atualizado por administrador',
        'alvo',
        user.id,
        'email',
        email,
        'role',
        role,
        'por',
        auth.id,
      )

    return e.json(200, {
      ok: true,
      criado: criando,
      user: {
        id: user.id,
        name: user.getString('name'),
        email: user.email(),
        role: user.getString('role'),
        active: user.getBool('active'),
      },
    })
  },
  $apis.requireAuth(),
)
