///
/// Busca lançamentos financeiros por referência de OS ou de pedido.
///
/// POR QUE EXISTE: quando uma OS é lançada por engano, o Felipe precisa saber
/// exatamente quais linhas do financeiro vieram dela antes de cancelar — senão
/// o débito do cliente continua lá cobrando um serviço que não existe.
/// A tela de lançamentos do cliente não mostra a referência, e a planilha de
/// backup não carrega `work_order_ref`. Esta rota busca pelo campo.
///
/// GET /backend/v1/lancamentos-por-ref?ref=OS-1012
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/lancamentos-por-ref', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const ref = String(e.request.url.query().get('ref') || '').trim()
  if (!ref) throw new BadRequestError('Informe ref= (ex.: OS-1012 ou PEDIDO-9)')

  const nomeCli = {}
  for (const c of $app.findRecordsByFilter('clients', '', 'name', 0, 0)) {
    nomeCli[c.id] = c.getString('name')
  }

  // procura em work_order_ref e quote_ref
  const filtro = 'work_order_ref = "' + ref + '" || quote_ref = "' + ref + '"'
  let registros = []
  try {
    registros = $app.findRecordsByFilter('transactions', filtro, 'date', 0, 0)
  } catch (err) {
    throw new BadRequestError('Filtro recusado: ' + String(err))
  }

  const itens = []
  let soma = 0
  for (const t of registros) {
    const q = t.getFloat('quantity')
    const u = t.getFloat('unit_price')
    const total = Math.round(q * u * 100) / 100
    soma += total
    const cid = String(t.getString('client') || '')
    itens.push({
      id: t.id,
      data: String(t.getString('date') || '').slice(0, 10),
      cliente: nomeCli[cid] || '(sem cliente)',
      cliente_id: cid,
      kind: t.getString('kind'),
      descricao: t.getString('description'),
      qtd: q,
      unitario: u,
      total: total,
      settles: String(t.getString('settles') || ''),
      ref_os: t.getString('work_order_ref'),
      ref_pedido: t.getString('quote_ref'),
    })
  }

  return e.json(200, {
    ref: ref,
    quantidade: itens.length,
    soma: Math.round(soma * 100) / 100,
    lancamentos: itens,
  })
})
