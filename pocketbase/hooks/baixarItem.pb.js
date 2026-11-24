///
/// Registra um pagamento VINCULADO ao item que ele quita.
///
/// POR QUE EXISTE: a tela "Dar baixa" grava pelo PocketBase com a sessão do
/// admin. Para eu conseguir TESTAR o fluxo de verdade — e para o Felipe lançar
/// pelo WhatsApp quando estiver na rua — o mesmo trabalho precisa acontecer
/// pelo servidor, autenticado pelo segredo.
///
/// A REGRA DO EXCEDENTE (parte delicada): se o valor pago for MAIOR que o item,
/// o item é quitado com o que ele devia e o resto vira um lançamento separado
/// de crédito (sem vínculo). Sem isso o item ficaria negativo e o saldo por
/// tipo mentiria.
///
/// POST /backend/v1/baixar-item
/// header: X-Arquivador-Secret
/// body: { cliente_id, item_id?, valor, data?, descricao? }
routerAdd('POST', '/backend/v1/baixar-item', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const clienteId = String(body.cliente_id || '').trim()
  const itemId = String(body.item_id || '').trim()
  const valor = Number(body.valor)
  const data = String(body.data || new Date().toISOString().slice(0, 10)).trim()
  const descricao = String(body.descricao || 'PAGAMENTO RECEBIDO').trim()

  if (!clienteId) throw new BadRequestError('Informe cliente_id.')
  if (!(valor > 0)) throw new BadRequestError('O valor deve ser maior que zero.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new BadRequestError('Data inválida.')

  let cli = null
  try {
    cli = $app.findRecordById('clients', clienteId)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  // saldo do item antes (para saber onde cortar o excedente)
  let emAbertoItem = 0
  if (itemId) {
    let item = null
    try {
      item = $app.findRecordById('transactions', itemId)
    } catch (_) {
      throw new NotFoundError('Item não encontrado.')
    }
    if (String(item.getString('client')) !== clienteId) {
      throw new BadRequestError('Este item não pertence ao cliente informado.')
    }
    const totalItem = item.getFloat('quantity') * item.getFloat('unit_price')
    // quanto já foi pago neste item
    let jaPago = 0
    const pagos = $app.findRecordsByFilter(
      'transactions',
      'settles = "' + itemId + '" && kind = "DINHEIRO"',
      'date',
      0,
      0,
    )
    for (const p of pagos) jaPago += Math.abs(p.getFloat('quantity') * p.getFloat('unit_price'))
    emAbertoItem = Math.round((totalItem - jaPago) * 100) / 100
    if (emAbertoItem < 0) emAbertoItem = 0
  }

  const principal = itemId ? Math.min(valor, emAbertoItem) : valor
  const excedente = Math.round((valor - principal) * 100) / 100

  const col = $app.findCollectionByNameOrId('transactions')

  const criar = (campos) => {
    const reg = new Record(col)
    reg.set('client', clienteId)
    reg.set('date', data + ' 12:00:00.000Z')
    reg.set('kind', 'DINHEIRO')
    reg.set('item_type', 'SERVICO')
    reg.set('quantity', 1)
    reg.set('sent_to_finance', 'ENVIADA')
    for (const k in campos) reg.set(k, campos[k])
    $app.save(reg)
    return reg
  }

  const pago = criar({
    description: descricao,
    unit_price: -Math.abs(principal),
    settles: itemId || '',
  })

  let creditoId = ''
  if (excedente > 0.005) {
    const credito = criar({
      description: 'CRÉDITO A FAVOR - excedente do pagamento',
      unit_price: -Math.abs(excedente),
      settles: '',
      notes: 'Gerado no pagamento ' + pago.id,
    })
    creditoId = credito.id
  }

  $app
    .logger()
    .info(
      'baixa registrada',
      'cliente',
      cli.getString('name'),
      'item',
      itemId,
      'valor',
      valor,
      'principal',
      principal,
      'excedente',
      excedente,
    )

  return e.json(200, {
    ok: true,
    pagamento_id: pago.id,
    credito_id: creditoId,
    cliente: cli.getString('name'),
    valor: valor,
    quitou_item: principal,
    excedente_credito: excedente,
    item_em_aberto_antes: emAbertoItem,
    item_em_aberto_depois: Math.max(0, Math.round((emAbertoItem - principal) * 100) / 100),
  })
})
