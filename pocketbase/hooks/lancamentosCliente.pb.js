///
/// Lista os lançamentos de clientes específicos, para comparar duplicidades.
///
/// Por que existe: antes de juntar dois cadastros do mesmo cliente, o Felipe
/// precisa ver se as vendas de um e de outro são as MESMAS (duplicadas) ou
/// DIFERENTES (que se somam). Só ele pode decidir isso olhando item por item.
///
/// GET /backend/v1/lancamentos-cliente?ids=id1,id2,id3
/// header: X-Arquivador-Secret
/// resposta: { por_cliente: { id: { nome, apelido, saldo, itens: [...] } } }
routerAdd('GET', '/backend/v1/lancamentos-cliente', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const idsParam = String(e.request.queryParam('ids') || '').trim()
  if (!idsParam) throw new BadRequestError('Informe ids=id1,id2,...')
  const ids = idsParam
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '')

  const porCliente = {}

  for (const id of ids) {
    let cli = null
    try {
      cli = $app.findRecordById('clients', id)
    } catch (_) {
      continue
    }

    const filtro = 'client = "' + id + '"'
    const trans = $app.findRecordsByFilter('transactions', filtro, 'date', 0, 0)

    const itens = []
    let saldo = 0
    for (const t of trans) {
      const q = t.getFloat('quantity')
      const u = t.getFloat('unit_price')
      const v = q * u
      saldo += v
      itens.push({
        id: t.id,
        data: String(t.getString('date') || '').slice(0, 10),
        kind: t.getString('kind'),
        item_type: t.getString('item_type'),
        descricao: t.getString('description'),
        detalhes: t.getString('details'),
        qtd: q,
        unitario: u,
        total: Math.round(v * 100) / 100,
        legacy_row: t.getString('legacy_row'),
      })
    }
    itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))

    porCliente[id] = {
      nome: cli.getString('name'),
      apelido: cli.getString('nickname'),
      documento: cli.getString('document'),
      telefone: cli.getString('phone'),
      endereco: cli.getString('address'),
      saldo: Math.round(saldo * 100) / 100,
      quantidade: itens.length,
      itens: itens,
    }
  }

  return e.json(200, { por_cliente: porCliente })
})
