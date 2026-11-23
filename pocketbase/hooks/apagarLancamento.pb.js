///
/// Apaga UM lançamento financeiro pelo id (correção de erro).
///
/// POR QUE EXISTE: em 23/11/2026 lancei por engano um pagamento de R$ 1.328,00
/// na Escola Natalio (OS 1018). O pagamento já tinha sido dado baixa ANTES de a
/// planilha ser montada: o que a planilha guarda é apenas o saldo que sobrou
/// (R$ 122,00), no lançamento "SERVIÇO DE CONFIGURAÇÃO DE PACT OFFICE".
/// Lançar o pagamento de novo abateu duas vezes e deixou o débito R$ 1.328
/// menor do que o real.
///
/// Esta rota apaga o lançamento errado e devolve o saldo do cliente antes e
/// depois, para conferência. Só apaga UM id por chamada, de propósito: apagar
/// em lote é o tipo de operação que não se deve oferecer.
///
/// POST /backend/v1/apagar-lancamento
/// header: X-Arquivador-Secret
/// body: { id }
routerAdd('POST', '/backend/v1/apagar-lancamento', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const id = String(body.id || '').trim()
  if (!id) throw new BadRequestError('Informe o id do lançamento.')

  let reg = null
  try {
    reg = $app.findRecordById('transactions', id)
  } catch (_) {
    throw new NotFoundError('Lançamento não encontrado.')
  }

  const clienteId = String(reg.getString('client') || '')
  const detalhe = {
    id: reg.id,
    data: reg.getString('date'),
    kind: reg.getString('kind'),
    descricao: reg.getString('description'),
    valor: Math.round(reg.getFloat('quantity') * reg.getFloat('unit_price') * 100) / 100,
  }

  const somaCliente = (cid) => {
    let s = 0
    for (const t of $app.findRecordsByFilter(
      'transactions',
      'client = "' + cid + '"',
      'date',
      0,
      0,
    )) {
      s += t.getFloat('quantity') * t.getFloat('unit_price')
    }
    return Math.round(s * 100) / 100
  }

  const antes = somaCliente(clienteId)

  try {
    $app.delete(reg)
  } catch (err) {
    $app.logger().error('apagar-lancamento: falha', 'id', id, 'erro', String(err))
    throw new BadRequestError('Não foi possível apagar: ' + String(err))
  }

  const depois = somaCliente(clienteId)

  let nomeCli = ''
  try {
    nomeCli = $app.findRecordById('clients', clienteId).getString('name')
  } catch (_) {}

  $app
    .logger()
    .info('lancamento apagado', 'id', id, 'cliente', nomeCli, 'antes', antes, 'depois', depois)

  return e.json(200, {
    ok: true,
    apagado: detalhe,
    cliente: nomeCli,
    saldo_antes: antes,
    saldo_depois: depois,
  })
})
