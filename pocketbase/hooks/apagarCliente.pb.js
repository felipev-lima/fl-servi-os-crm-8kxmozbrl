///
/// Apaga um cliente de teste / cadastro criado por engano.
///
/// Usado para limpar cadastros de teste desta sessão e para o Felipe remover
/// cliente que não serve. RECUSA apagar cliente que tenha lançamento
/// financeiro — apagar levaria a dívida junto e isso não pode acontecer por
/// engano.
///
/// POST /backend/v1/apagar-cliente
/// header: X-Arquivador-Secret
/// body: { id }
routerAdd('POST', '/backend/v1/apagar-cliente', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const id = String(body.id || '').trim()
  if (!id) throw new BadRequestError('Informe o id.')

  let cli = null
  try {
    cli = $app.findRecordById('clients', id)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  // trava de segurança: cliente com lançamento não é apagado
  const trans = $app.findRecordsByFilter('transactions', 'client = "' + id + '"', 'date', 0, 1)
  if (trans.length > 0) {
    return e.json(409, {
      ok: false,
      mensagem:
        'Este cliente tem lançamento financeiro. Junte com outro cadastro em vez de apagar.',
    })
  }

  const nome = cli.getString('name')
  $app.delete(cli)
  $app.logger().info('cliente apagado', 'id', id, 'nome', nome)

  return e.json(200, { ok: true, apagado: nome })
})
