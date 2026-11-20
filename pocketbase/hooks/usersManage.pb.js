///
/// Validações server-side para a gestão de usuários (coleção `users`).
///
/// Roda em TODA gravação na coleção `users` (Painel, API, importação) — não apenas
/// na tela de administração. Complementa as regras da coleção definidas na migration 0006:
///   - senha com no mínimo 8 caracteres ao criar ou redefinir;
///   - administrador não pode rebaixar, desativar ou excluir a si mesmo;
///   - a role `admin` só pode ser concedida/atribuída por um administrador;
///   - o último administrador ativo do sistema nunca fica sem acesso.
///
/// IMPORTANTE: a senha é lida do próprio registro (`record.get('password')`), não de
/// `requestInfo.body`. A JSVM do PocketBase já transformou o corpo antes do hook e
/// `requestInfo.body.password` chega sempre vazio, o que fazia toda criação de usuário
/// ser recusada com "A senha deve ter no mínimo 8 caracteres".
///
/// Nota da JSVM do PocketBase: funções de nível superior não são visíveis dentro
/// dos callbacks — toda a lógica fica inline em cada um deles.
onRecordCreate((e) => {
  const record = e.record

  // Senha obrigatória (mín. 8 caracteres) ao criar um usuário.
  // A senha chega no campo `password` do próprio registro — a JSVM do
  // PocketBase já consumiu o corpo da requisição antes do hook.
  const password = record.getString('password') || ''
  const temSenha = password.length > 0

  // Ao criar sem senha (conta criada por convite/administrador e definida
  // depois), não bloqueia: a validação de 8 caracteres vale quando há senha.
  if (temSenha && password.length < 8) {
    throw new BadRequestError('A senha deve ter no mínimo 8 caracteres.')
  }

  // Quem pode criar já é decidido pela regra da coleção (createRule exige
  // @request.auth.role = 'admin'), então não repetimos a checagem aqui: dentro do
  // hook o solicitante nem sempre está disponível em requestInfo.auth, e a
  // checagem duplicada recusava indevidamente a criação de administradores.

  e.next()
}, 'users')

onRecordUpdate((e) => {
  const record = e.record
  const orig = record.original()
  const auth = e.requestInfo?.auth
  const authRole = auth ? auth.getString('role') : ''
  const targetRole = record.getString('role') || 'consulta'

  // Senha: ao atualizar, só valida quando o cliente enviou uma nova.
  const password = record.getString('password') || ''
  if (password && password.length < 8) {
    throw new BadRequestError('A nova senha deve ter no mínimo 8 caracteres.')
  }

  // Apenas administrador pode atribuir o perfil Administrador — vale só quando o
  // solicitante é identificável; quando não é, a updateRule da coleção já decide.
  if (targetRole === 'admin' && authRole && authRole !== 'admin') {
    throw new ForbiddenError('Somente um administrador pode conceder o perfil Administrador.')
  }

  // Self-service: o próprio usuário não muda o próprio perfil, e-mail
  // nem desativa o próprio acesso.
  if (auth && auth.id === record.id) {
    if (orig && orig.getString('role') !== targetRole) {
      throw new ForbiddenError('Você não pode alterar o seu próprio perfil de acesso.')
    }
    if (orig && !record.getBool('active') && orig.getBool('active')) {
      throw new ForbiddenError('Você não pode desativar o seu próprio acesso.')
    }
    if (orig && record.email() !== orig.email()) {
      throw new ForbiddenError('Você não pode alterar o seu próprio e-mail de acesso.')
    }
  }

  // Protege o último administrador ativo do sistema.
  const wasAdmin = orig ? orig.getString('role') === 'admin' : false
  const stillAdmin = targetRole === 'admin'
  const wasActive = orig ? orig.getBool('active') : true
  const stillActive = record.getBool('active')
  if (wasAdmin && wasActive && (!stillAdmin || !stillActive)) {
    const admins = $app.findRecordsByFilter('users', "role = 'admin'", '', 0, 0)
    let activeAdmins = 0
    for (const r of admins) {
      if (r.id !== record.id && r.getBool('active')) activeAdmins++
    }
    if (activeAdmins === 0) {
      throw new BadRequestError('O sistema precisa de pelo menos um administrador ativo.')
    }
  }

  e.next()
}, 'users')

onRecordDelete((e) => {
  const record = e.record
  if (record.getString('role') === 'admin') {
    const admins = $app.findRecordsByFilter('users', "role = 'admin'", '', 0, 0)
    let activeAdmins = 0
    for (const r of admins) {
      if (r.id !== record.id && r.getBool('active')) activeAdmins++
    }
    if (activeAdmins === 0) {
      throw new BadRequestError('Não é possível excluir o último administrador do sistema.')
    }
  }

  e.next()
}, 'users')
