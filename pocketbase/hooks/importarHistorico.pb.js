///
/// Importa o histórico financeiro da planilha para `transactions`.
///
/// ESTRUTURA REAL desta coleção (verificada em 22/11/2026):
///   client (relação), date, kind (CAPITAL/CONSUMO/SERVICO/DINHEIRO),
///   item_type (PRODUTO/SERVICO), description, details, quantity, unit_price,
///   work_order_ref, quote_ref, sent_to_finance, sent_at, notes, legacy_row.
///
/// NÃO existe campo de valor total: o total é quantidade × preço unitário.
/// Por isso cada lançamento da planilha entra como quantity = 1 e
/// unit_price = valor. Assim o total calculado bate exatamente, e o valor
/// original fica preservado.
///
/// IDEMPOTENTE: `legacy_row` recebe "aba#linha" e tem índice único no banco.
/// Rodar duas vezes não duplica — a segunda tentativa é recusada pelo índice.
///
/// NÃO TOCA nos lançamentos existentes (os das OS de novembro). Eles ficam
/// como estão, conforme decisão do Felipe em 22/11/2026.
///
/// POST /backend/v1/importar-historico
/// header: X-Arquivador-Secret
/// body: { lancamentos: [{ aba, linha, data, tipo, produto, descricao, qtd, unit, valor }] }
routerAdd('POST', '/backend/v1/importar-historico', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const lista = Array.isArray(body.lancamentos) ? body.lancamentos : []
  if (lista.length === 0) throw new BadRequestError('Nenhum lançamento recebido.')

  const colecao = $app.findCollectionByNameOrId('transactions')

  // ---------- mapa de clientes: aba da planilha -> id no CRM ----------
  // A planilha identifica o cliente pelo nome da aba. O CRM pelo id.
  // O cruzamento já foi feito por CNPJ; aqui recebo o mapa pronto.
  const mapaAba = body.mapa_abas || {}

  let criados = 0
  let ignorados = 0
  let semCliente = 0
  let soma = 0

  for (const l of lista) {
    const chave = String(l.aba) + '#' + String(l.linha)

    // cliente: pelo mapa de abas; se não houver, tenta o documento
    let clienteId = mapaAba[String(l.aba)] || ''
    if (!clienteId && l.documento) {
      const d = String(l.documento).replace(/[^0-9]/g, '')
      if (d.length >= 11) {
        try {
          const achado = $app.findFirstRecordByFilter('clients', 'document ~ {:d}', { d: d })
          clienteId = achado.id
        } catch (_) {
          clienteId = ''
        }
      }
    }
    if (!clienteId) {
      semCliente++
      continue
    }

    const reg = new Record(colecao)
    reg.set('client', clienteId)
    reg.set('date', String(l.data) + ' 12:00:00.000Z')
    reg.set('kind', String(l.tipo))
    // item_type: a planilha diz PRODUTO ou SERVIÇO
    const prod = String(l.produto || '').toUpperCase()
    if (prod.indexOf('SERV') === 0) reg.set('item_type', 'SERVICO')
    else if (prod.indexOf('PROD') === 0) reg.set('item_type', 'PRODUTO')
    reg.set('description', String(l.descricao || l.produto || 'Lançamento histórico'))
    if (l.produto) reg.set('details', String(l.produto))
    // valor: quantidade 1 e unitário = valor, para o total bater exato
    reg.set('quantity', 1)
    reg.set('unit_price', Number(l.valor))
    reg.set('sent_to_finance', 'ENVIADA')
    reg.set('legacy_row', chave)
    reg.set('notes', 'Importado da planilha histórica em 22/11/2026')

    try {
      $app.save(reg)
      criados++
      soma += Number(l.valor)
    } catch (err) {
      // Índice único em legacy_row: já existe = já foi importado
      ignorados++
    }
  }

  $app
    .logger()
    .info(
      'importar-historico concluido',
      'criados',
      criados,
      'ignorados',
      ignorados,
      'sem_cliente',
      semCliente,
      'soma',
      Math.round(soma * 100) / 100,
    )

  return e.json(200, {
    criados: criados,
    ignorados: ignorados,
    sem_cliente: semCliente,
    soma_importada: Math.round(soma * 100) / 100,
  })
})
