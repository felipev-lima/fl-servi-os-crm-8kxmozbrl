///
/// Corrige dados de cadastro de cliente no CRM financeiro.
///
/// POR QUE EXISTE: a tela de Clientes desta base precisa de um caminho de
/// serviço para completar cadastro (usado aqui e pelas rotinas de
/// manutenção). O app de OS já tem a sua versão; esta é a do CRM.
///
/// REGRA DO PENDENTE (Felipe, 23/11/2026): cliente sem CNPJ e sem telefone
/// fica marcado como pendente (vermelho na lista). Aqui a marca é recalculada
/// a cada gravação, então completar o cadastro tira o vermelho sozinho.
///
/// POST /backend/v1/corrigir-cliente
/// header: X-Arquivador-Secret
/// body: { id, nome?, apelido?, documento?, endereco?, bairro?, cidade?, telefone?, email? }
routerAdd('POST', '/backend/v1/corrigir-cliente', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const id = String(body.id || '').trim()
  if (!id) throw new BadRequestError('Informe o id do cliente.')

  let cliente = null
  try {
    cliente = $app.findRecordById('clients', id)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  const antes = {
    nome: cliente.getString('name'),
    documento: cliente.getString('document'),
    telefone: cliente.getString('phone'),
    pendente: cliente.getBool('pendente'),
  }

  if (body.nome !== undefined) {
    const n = String(body.nome).trim()
    if (!n) throw new BadRequestError('O nome do cliente não pode ficar vazio.')
    cliente.set('name', n)
  }
  if (body.apelido !== undefined) cliente.set('nickname', String(body.apelido).trim())
  if (body.documento !== undefined) cliente.set('document', String(body.documento).trim())
  if (body.endereco !== undefined) cliente.set('address', String(body.endereco).trim())
  if (body.bairro !== undefined) cliente.set('neighborhood', String(body.bairro).trim())
  if (body.cidade !== undefined) cliente.set('city', String(body.cidade).trim())
  if (body.telefone !== undefined) cliente.set('phone', String(body.telefone).trim())
  if (body.email !== undefined) cliente.set('email', String(body.email).trim())

  // recalcula a marca de pendência a partir do que ficou gravado
  const docNum = String(cliente.getString('document') || '').replace(/[^0-9]/g, '')
  const foneNum = String(cliente.getString('phone') || '').replace(/[^0-9]/g, '')
  cliente.set('pendente', docNum.length < 11 && foneNum.length < 10)

  try {
    $app.save(cliente)
  } catch (err) {
    $app.logger().error('corrigir-cliente: falha', 'id', id, 'erro', String(err))
    throw new BadRequestError('Não foi possível salvar: ' + String(err))
  }

  const depois = {
    nome: cliente.getString('name'),
    documento: cliente.getString('document'),
    telefone: cliente.getString('phone'),
    pendente: cliente.getBool('pendente'),
  }

  $app
    .logger()
    .info(
      'cliente corrigido',
      'id',
      id,
      'antes',
      JSON.stringify(antes),
      'depois',
      JSON.stringify(depois),
    )

  return e.json(200, { ok: true, id: id, antes: antes, depois: depois })
})
