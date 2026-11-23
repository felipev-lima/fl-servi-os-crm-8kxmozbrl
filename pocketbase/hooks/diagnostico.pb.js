///
/// Diagnóstico do CRM financeiro antes da importação do histórico.
///
/// Responde três perguntas que precisam de resposta ANTES de gravar 943
/// lançamentos:
///   1. Quantos lançamentos existem hoje em `transactions`?
///   2. Qual o total já lançado, por tipo?
///   3. Existe algum `legacy_row` já usado (para não duplicar)?
///
/// GET /backend/v1/diagnostico?fin=1
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/diagnostico', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const resp = {}

  // ---------- transações ----------
  const trans = $app.findRecordsByFilter('transactions', '', 'date', 0, 0)
  resp.transactions_total = trans.length

  const porTipo = {}
  let soma = 0
  let comLegacy = 0
  let somaLegacy = 0
  let primeira = ''
  let ultima = ''
  for (const t of trans) {
    const k = t.getString('kind') || '(vazio)'
    // O campo de valor desta coleção é `total_price` (não `amount`).
    const v = t.getFloat('total_price') || t.getFloat('quantity') * t.getFloat('unit_price') || 0
    if (porTipo[k] === undefined) porTipo[k] = 0
    porTipo[k] += v
    soma += v
    const leg = String(t.getString('legacy_row') || '').trim()
    if (leg) {
      comLegacy++
      somaLegacy += v
    }
    const d = t.getString('date')
    if (d) {
      if (!primeira || d < primeira) primeira = d
      if (!ultima || d > ultima) ultima = d
    }
  }
  // amostra bruta dos 5 primeiros, para ver o que realmente está gravado
  const amostra = []
  for (let i = 0; i < Math.min(5, trans.length); i++) {
    const t = trans[i]
    amostra.push({
      id: t.id,
      client: String(t.getString('client') || '').slice(0, 15),
      date: t.getString('date'),
      kind: t.getString('kind'),
      item_type: t.getString('item_type'),
      description: String(t.getString('description') || '').slice(0, 40),
      quantity: t.getFloat('quantity'),
      unit_price: t.getFloat('unit_price'),
      tem_campo_total: String(t.get('total_price') === undefined ? 'nao' : 'sim'),
      legacy_row: t.getString('legacy_row'),
      sent_to_finance: t.getString('sent_to_finance'),
      notes: String(t.getString('notes') || '').slice(0, 50),
      created: t.getString('created'),
    })
  }
  // Lista completa das 54 existentes, com cliente, para cruzar com a planilha.
  // Os nomes dos campos de valor NAO sao confiaveis de memoria: a colecao
  // mostra `unit_price` e `quantity`, mas o valor total pode ter outro nome.
  // Aqui leio o registro CRU (JSON) para descobrir o nome real.
  const detalhe = []
  for (const t of trans) {
    let nomeCli = ''
    try {
      nomeCli = $app.findRecordById('clients', t.getString('client')).getString('name')
    } catch (_) {
      nomeCli = '(?)'
    }
    const cru = t
    let chaves = []
    let valorEncontrado = 0
    try {
      // Percorre os campos do registro para achar qualquer nome que pareca valor
      for (const campo of cru.collection().fields) {
        const nome = campo.name
        if (
          nome === 'id' ||
          nome === 'client' ||
          nome === 'date' ||
          nome === 'kind' ||
          nome === 'item_type' ||
          nome === 'description' ||
          nome === 'details' ||
          nome === 'work_order_ref' ||
          nome === 'quote_ref' ||
          nome === 'sent_to_finance' ||
          nome === 'sent_at' ||
          nome === 'notes' ||
          nome === 'legacy_row' ||
          nome === 'created' ||
          nome === 'updated'
        )
          continue
        chaves.push(nome)
        const v = cru.get(nome)
        if (typeof v === 'number' && Math.abs(v) > Math.abs(valorEncontrado)) valorEncontrado = v
      }
    } catch (_) {
      chaves = ['erro']
    }
    detalhe.push({
      id: t.id,
      cliente: nomeCli,
      data: String(t.getString('date') || '').slice(0, 10),
      kind: t.getString('kind'),
      descricao: String(t.getString('description') || '').slice(0, 50),
      campos_de_valor: chaves,
      valor_detectado: valorEncontrado,
    })
  }
  resp.existentes = detalhe

  resp.amostra = amostra

  resp.transactions_por_tipo = porTipo
  resp.transactions_soma = Math.round(soma * 100) / 100
  resp.transactions_com_legacy_row = comLegacy
  resp.transactions_soma_legacy = Math.round(somaLegacy * 100) / 100
  resp.transactions_periodo = { primeira: primeira, ultima: ultima }

  // ---------- clientes ----------
  const cli = $app.findRecordsByFilter('clients', '', 'name', 0, 0)
  resp.clientes = cli.length
  let comDoc = 0
  for (const c of cli) {
    if (String(c.getString('document') || '').replace(/[^0-9]/g, '').length >= 11) comDoc++
  }
  resp.clientes_com_documento = comDoc

  // ---------- outras coleções que podem receber o histórico ----------
  const somaColecao = (nome) => {
    try {
      return $app.findRecordsByFilter(nome, '', 'created', 0, 0).length
    } catch (_) {
      return -1
    }
  }
  resp.contagens = {
    quotes: somaColecao('quotes'),
    bills: somaColecao('bills'),
    client_summary: somaColecao('client_summary'),
    stock_movements: somaColecao('stock_movements'),
  }

  return e.json(200, resp)
})
