///
/// Saldo do cliente POR TIPO, com o que cada item ainda deve.
///
/// POR QUE EXISTE: o Felipe precisa responder ao cliente "você me deve tanto
/// de serviço, tanto de consumo, tanto de capital" — e isso não dá para
/// calcular só somando `kind`, porque um pagamento vinculado a um item abate
/// aquele item, não o tipo inteiro.
///
/// COMO CALCULA:
///   - cada ITEM (CAPITAL/CONSUMO/SERVICO) deve o seu total menos a soma dos
///     pagamentos (kind = DINHEIRO) cujo `settles` aponta para ele;
///   - pagamento SEM vínculo é crédito do cliente: abate os itens mais antigos
///     primeiro (ordem de data), como se fosse um abatimento geral;
///   - se sobrar crédito depois de quitar tudo, aparece como `credito`.
///
/// GET /backend/v1/saldo-por-tipo?cliente=<id>
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/saldo-por-tipo', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const clienteId = String(e.request.url.query().get('cliente') || '').trim()
  if (!clienteId) throw new BadRequestError('Informe cliente=')

  let cli = null
  try {
    cli = $app.findRecordById('clients', clienteId)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  const todos = $app.findRecordsByFilter(
    'transactions',
    'client = "' + clienteId + '"',
    'date',
    0,
    0,
  )

  // separa itens e pagamentos
  const itens = []
  const pagamentos = []
  for (const t of todos) {
    const q = t.getFloat('quantity')
    const u = t.getFloat('unit_price')
    const bruto = Math.round(q * u * 100) / 100
    const reg = {
      id: t.id,
      data: String(t.getString('date') || '').slice(0, 10),
      kind: t.getString('kind'),
      descricao: t.getString('description'),
      total: bruto,
      settles: String(t.getString('settles') || ''),
    }
    if (reg.kind === 'DINHEIRO') pagamentos.push(reg)
    else itens.push(reg)
  }

  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))

  // quanto cada item já recebeu por pagamento vinculado
  const pagoPorItem = {}
  for (const p of pagamentos) {
    if (!p.settles) continue
    pagoPorItem[p.settles] = (pagoPorItem[p.settles] || 0) + Math.abs(p.total)
  }

  // pagamento avulso vira crédito e abate os itens mais antigos
  let creditoLivre = 0
  for (const p of pagamentos) {
    if (!p.settles) creditoLivre += Math.abs(p.total)
  }

  const detalhe = []
  let totalServico = 0
  let totalConsumo = 0
  let totalCapital = 0

  for (const it of itens) {
    let emAberto = Math.round((it.total - (pagoPorItem[it.id] || 0)) * 100) / 100
    if (emAberto < 0) emAberto = 0 // pagou a mais: o excedente vira crédito abaixo

    // crédito avulso abate os itens mais antigos primeiro
    if (
      creditoLivre > 0 &&
      (it.kind === 'SERVICO' || it.kind === 'CONSUMO' || it.kind === 'CAPITAL')
    ) {
      const abate = Math.min(creditoLivre, emAberto)
      emAberto = Math.round((emAberto - abate) * 100) / 100
      creditoLivre = Math.round((creditoLivre - abate) * 100) / 100
    }

    if (it.kind === 'SERVICO') totalServico += emAberto
    else if (it.kind === 'CONSUMO') totalConsumo += emAberto
    else if (it.kind === 'CAPITAL') totalCapital += emAberto

    detalhe.push({
      id: it.id,
      data: it.data,
      kind: it.kind,
      descricao: it.descricao,
      total: it.total,
      pago: Math.round((pagoPorItem[it.id] || 0) * 100) / 100,
      em_aberto: emAberto,
      quitado: emAberto <= 0.005,
      tem_vinculo: Boolean(it.settles),
    })
  }

  const arred = (v) => Math.round(v * 100) / 100

  return e.json(200, {
    cliente: cli.getString('name'),
    apelido: cli.getString('nickname'),
    servico: arred(totalServico),
    consumo: arred(totalConsumo),
    capital: arred(totalCapital),
    credito: arred(creditoLivre),
    total: arred(totalServico + totalConsumo + totalCapital),
    itens: detalhe,
    pagamentos: pagamentos.map((p) => ({
      id: p.id,
      data: p.data,
      descricao: p.descricao,
      valor: Math.abs(p.total),
      settles: p.settles,
    })),
  })
})
