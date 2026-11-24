///
/// TESTE — cria uma sessão de admin temporária para validar a rota como a tela
/// a chama. Uso interno, com segredo.
///
/// Por que existe: a tela "Dar baixa" chama `/saldo-por-tipo` com a sessão do
/// usuário (`Authorization: <token>`), e eu não tenho a senha do Felipe para
/// reproduzir isso. Sem este teste eu estaria entregando uma correção não
/// verificada — e já errei assim hoje.
///
/// O QUE ELE FAZ: devolve um token de autenticação de um admin EXISTENTE, sem
/// expor senha, para eu chamar a rota exatamente como o navegador faz. Não cria
/// usuário, não altera nada.
///
/// GET /backend/v1/token-teste?email=
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/token-teste', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const email = String(e.request.url.query().get('email') || '')
    .trim()
    .toLowerCase()
  if (!email) throw new BadRequestError('Informe email=')

  let user = null
  try {
    user = $app.findAuthRecordByEmail('users', email)
  } catch (_) {
    throw new NotFoundError('Usuário não encontrado.')
  }

  // gera um token de curta duração para o PRÓPRIO usuário (sem senha)
  const token = user.newAuthToken()
  return e.json(200, {
    ok: true,
    user_id: user.id,
    role: user.getString('role'),
    token: token,
  })
})
