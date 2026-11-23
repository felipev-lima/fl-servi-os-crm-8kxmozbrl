///
/// Lança um PAGAMENTO (baixa de débito) no CRM financeiro.
///
/// Por que existe: o pagamento pode ser feito pela tela (Lancamentos → Novo →
/// DINHEIRO), mas algumas baixas chegam por fora — como a OS 1018, que foi
/// executada antes do sistema existir e só tem a ficha no OneDrive. Esta rota
/// registra o pagamento pelo servidor, com o valor conferido na origem.
///
/// COMO O PAGAMENTO ENTRA (regra desta base): `kind = DINHEIRO` e o valor
/// gravado em `unit_price` NEGATIVO com `quantity = 1`. É isso que abate o
/// saldo — a mesma coisa que a tela faz ao inverter o sinal digitado.
///
/// TRAVA: recusa valor zerado ou negativo na entrada. Quem chama manda o valor
/// POSITIVO (o que o cliente pagou); a inversão é feita aqui, para não repetir
/// o erro de sinal que já custou caro na planilha.
///
/// POST /backend/v1/lancar-pagamento
/// header: X-Arquivador-Secret
/// body: { cliente_id, valor, data?, descricao? }
routerAdd('POST', '/backend/v1/lancar-pagamento', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const clienteId = String(body.cliente_id || '').trim()
  const valor = Number(body.valor)
  const data = String(body.data || new Date().toISOString().slice(0, 10)).trim()
  const descricao = String(body.descricao || 'PAGAMENTO RECEBIDO').trim()

  if (!clienteId) throw new BadRequestError('Informe cliente_id.')
  if (!(valor > 0)) throw new BadRequestError('O valor do pagamento deve ser maior que zero.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new BadRequestError('Data inválida. Use AAAA-MM-DD.')
  }

  // cliente precisa existir
  let cli = null
  try {
    cli = $app.findRecordById('clients', clienteId)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  // saldo ANTES, para conferir depois
  let antes = 0
  for (const t of $app.findRecordsByFilter(
    'transactions',
    'client = "' + clienteId + '"',
    'date',
    0,
    0,
  )) {
    antes += t.getFloat('quantity') * t.getFloat('unit_price')
  }

  const col = $app.findCollectionByNameOrId('transactions')
  const reg = new Record(col)
  reg.set('client', clienteId)
  reg.set('date', data + ' 12:00:00.000Z')
  reg.set('kind', 'DINHEIRO')
  reg.set('item_type', 'SERVICO')
  reg.set('description', descricao)
  reg.set('quantity', 1)
  // negativo = abate o saldo. O chamador manda positivo; a inversão é aqui.
  reg.set('unit_price', -Math.abs(valor))
  reg.set('sent_to_finance', 'ENVIADA')
  reg.set('notes', 'Baixa lançada pelo assistente em ' + data)

  try {
    $app.save(reg)
  } catch (err) {
    $app.logger().error('lancar-pagamento: falha', 'erro', String(err))
    throw new BadRequestError('Não foi possível lançar: ' + String(err))
  }

  // saldo DEPOIS
  let depois = 0
  for (const t of $app.findRecordsByFilter(
    'transactions',
    'client = "' + clienteId + '"',
    'date',
    0,
    0,
  )) {
    depois += t.getFloat('quantity') * t.getFloat('unit_price')
  }

  $app
    .logger()
    .info(
      'pagamento lancado',
      'cliente',
      cli.getString('name'),
      'valor',
      valor,
      'saldo_antes',
      Math.round(antes * 100) / 100,
      'saldo_depois',
      Math.round(depois * 100) / 100,
    )

  return e.json(200, {
    ok: true,
    id: reg.id,
    cliente: cli.getString('name'),
    valor: valor,
    saldo_antes: Math.round(antes * 100) / 100,
    saldo_depois: Math.round(depois * 100) / 100,
    abateu: Math.round((antes - depois) * 100) / 100,
  })
})
