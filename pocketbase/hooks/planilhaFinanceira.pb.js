///
/// Dados completos para as planilhas de backup (Lançamentos e Contas a Receber).
///
/// POR QUE EXISTE: o script de backup monta dois XLSX no OneDrive — um com todos
/// os lançamentos e outro com o saldo devedor por cliente. Ele precisa dos dados
/// numa chamada só, já com os nomes resolvidos.
///
/// A CONFERÊNCIA QUE MANDA NESTA ROTA:
///   `historicos_quantidade` e `historicos_soma` são os números do HISTÓRICO
///   importado da planilha (os que vieram com `legacy_row`). O script compara
///   com 943 e R$ 789.533,75 antes de gravar qualquer coisa.
///
///   A base INTEIRA soma diferente, e isso é esperado: inclui pagamentos e
///   lançamentos novos do dia a dia. Por isso a conferência olha só o histórico.
///
/// GET /backend/v1/planilha-financeira
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/planilha-financeira', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  // ---------- nomes dos clientes ----------
  const nome = {}
  const apelido = {}
  const documento = {}
  for (const c of $app.findRecordsByFilter('clients', '', 'name', 0, 0)) {
    nome[c.id] = c.getString('name')
    apelido[c.id] = c.getString('nickname')
    documento[c.id] = c.getString('document')
  }

  // ---------- lançamentos ----------
  const lancamentos = []
  const somaPorCliente = {}
  const somaPorTipoCliente = {}
  const qtdPorCliente = {}

  let histQtd = 0
  let histSoma = 0

  const todas = $app.findRecordsByFilter('transactions', '', 'date', 0, 0)
  for (const t of todas) {
    const cid = String(t.getString('client') || '')
    const q = t.getFloat('quantity')
    const u = t.getFloat('unit_price')
    const total = Math.round(q * u * 100) / 100
    const kind = t.getString('kind')
    const legado = String(t.getString('legacy_row') || '').trim()

    lancamentos.push({
      data: String(t.getString('date') || '').slice(0, 10),
      cliente: nome[cid] || '(sem cliente)',
      apelido: apelido[cid] || '',
      kind: kind,
      item_type: t.getString('item_type'),
      descricao: t.getString('description'),
      qtd: q,
      unitario: u,
      legacy_row: legado,
    })

    somaPorCliente[cid] = (somaPorCliente[cid] || 0) + total
    qtdPorCliente[cid] = (qtdPorCliente[cid] || 0) + 1
    if (!somaPorTipoCliente[cid]) {
      somaPorTipoCliente[cid] = { SERVICO: 0, CONSUMO: 0, CAPITAL: 0, DINHEIRO: 0 }
    }
    somaPorTipoCliente[cid][kind] = (somaPorTipoCliente[cid][kind] || 0) + total

    if (legado) {
      histQtd++
      histSoma += total
    }
  }

  // ---------- resumo por cliente (para Contas a Receber) ----------
  const clientes = []
  for (const cid in nome) {
    const s = somaPorCliente[cid] || 0
    const tipos = somaPorTipoCliente[cid] || { SERVICO: 0, CONSUMO: 0, CAPITAL: 0, DINHEIRO: 0 }
    clientes.push({
      id: cid,
      nome: nome[cid],
      apelido: apelido[cid],
      documento: documento[cid],
      servico: Math.round((tipos.SERVICO || 0) * 100) / 100,
      consumo: Math.round((tipos.CONSUMO || 0) * 100) / 100,
      capital: Math.round((tipos.CAPITAL || 0) * 100) / 100,
      dinheiro: Math.round((tipos.DINHEIRO || 0) * 100) / 100,
      // DINHEIRO entra negativo no banco, então já abate
      saldo: Math.round(s * 100) / 100,
      lancamentos: qtdPorCliente[cid] || 0,
    })
  }

  const arred = (v) => Math.round(v * 100) / 100

  return e.json(200, {
    lancamentos: lancamentos,
    clientes: clientes,
    // conferência do HISTÓRICO (o que veio da planilha)
    historicos_quantidade: histQtd,
    historicos_soma: arred(histSoma),
    total_transacoes: todas.length,
    gerado_em: new Date().toISOString(),
  })
})
