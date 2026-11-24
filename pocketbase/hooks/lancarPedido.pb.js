///
/// Lança no financeiro os itens de um PEDIDO/ORÇAMENTO.
///
/// POR QUE EXISTE: o pedido, ao virar LANÇADO, não gerava lançamento nenhum.
/// A OS gera (hook lancarOSFinanceiro), o pedido não — e o Felipe deu baixa de
/// um pedido da Tarcísio em 24/11/2026 e o débito não apareceu no cliente.
///
/// COMO LÊ OS ITENS (descoberto em 24/11/2026): o campo `items` do pedido
/// guarda um ARRAY DE BYTES UTF-8, não objetos. Decodificado, é o JSON com
/// material, name, quantity, unit_price e kind. Sem a decodificação, todo
/// item sai com valor zero.
///
/// NÃO DUPLICA: se já existe lançamento com `quote_ref = PEDIDO-<n>`, não cria
/// outro. Assim dá para clicar duas vezes sem cobrar dobrado.
///
/// POST /backend/v1/lancar-pedido
/// header: X-Arquivador-Secret
/// body: { quote_id, pago? }
///   `pago` (opcional): valor já recebido, lançado como DINHEIRO negativo.
routerAdd('POST', '/backend/v1/lancar-pedido', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const quoteId = String(body.quote_id || '').trim()
  if (!quoteId) throw new BadRequestError('Informe quote_id.')

  let q = null
  try {
    q = $app.findRecordById('quotes', quoteId)
  } catch (_) {
    throw new NotFoundError('Pedido não encontrado.')
  }

  const cliente = String(q.getString('client') || '')
  if (!cliente) throw new BadRequestError('O pedido não tem cliente.')

  const numero = Number(q.getFloat('number')) || 0
  const ref = 'PEDIDO-' + String(numero)
  const data = String(q.getString('date') || new Date().toISOString()).slice(0, 10)

  // já lançado? não duplica
  const jaTem = $app.findRecordsByFilter('transactions', 'quote_ref = "' + ref + '"', '', 1, 0)
  if (jaTem.length > 0) {
    return e.json(200, {
      ok: true,
      ja_lancado: true,
      mensagem: 'Este pedido já tinha lançamento (' + ref + '). Nada foi criado.',
      referencia: ref,
    })
  }

  // ---------- decodificar os itens ----------
  const bruto = q.get('items')
  let lista = []
  let formato = 'desconhecido'

  if (Array.isArray(bruto) && bruto.length > 0 && typeof bruto[0] === 'object') {
    lista = bruto
    formato = 'objetos'
  } else if (Array.isArray(bruto) && bruto.length > 1) {
    try {
      const bytes = bruto.map((n) => Number(n) & 0xff)
      const texto = String.fromCharCode.apply(null, bytes)
      const decodificado = decodeURIComponent(escape(texto))
      const v = JSON.parse(decodificado)
      if (Array.isArray(v)) {
        lista = v
        formato = 'bytes-utf8'
      }
    } catch (_) {}
  } else if (typeof bruto === 'string') {
    try {
      const v = JSON.parse(bruto)
      if (Array.isArray(v)) {
        lista = v
        formato = 'string-json'
      }
    } catch (_) {}
  }

  if (lista.length === 0) {
    throw new BadRequestError(
      'Não consegui ler os itens deste pedido (formato ' + typeof bruto + '). Nada foi lançado.',
    )
  }

  const colTx = $app.findCollectionByNameOrId('transactions')
  const criados = []
  let totalPedido = 0

  for (const i of lista) {
    if (!i || typeof i !== 'object') continue
    const qtd = Number(i.quantity || 1)
    const preco = Number(i.unit_price || 0)
    if (qtd <= 0 || preco <= 0) continue

    const kindBruto = String(i.kind || 'CONSUMO').toUpperCase()
    const kind =
      kindBruto === 'CAPITAL' || kindBruto === 'SERVICO' || kindBruto === 'CONSUMO'
        ? kindBruto
        : 'CONSUMO'

    const t = new Record(colTx)
    t.set('client', cliente)
    t.set('date', data + ' 12:00:00.000Z')
    t.set('kind', kind)
    t.set('item_type', kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO')
    t.set('description', String(i.name || i.description || 'Item do pedido').slice(0, 300))
    t.set('quantity', qtd)
    t.set('unit_price', preco)
    t.set('quote_ref', ref)
    t.set('sent_to_finance', 'ENVIADA')
    t.set('notes', 'Lançado do pedido ' + numero + ' em ' + data)
    $app.save(t)
    totalPedido += qtd * preco
    criados.push({
      descricao: i.name || i.description,
      qtd: qtd,
      valor: preco,
      kind: kind,
    })
  }

  // ---------- pagamento já recebido (opcional) ----------
  let pago = Number(body.pago || 0)
  if (pago > 0) {
    const t = new Record(colTx)
    t.set('client', cliente)
    t.set('date', data + ' 12:00:00.000Z')
    t.set('kind', 'DINHEIRO')
    t.set('item_type', 'SERVICO')
    t.set('description', 'Pagamento recebido - Pedido ' + numero)
    t.set('quantity', 1)
    t.set('unit_price', -Math.abs(pago))
    t.set('quote_ref', ref)
    t.set('sent_to_finance', 'ENVIADA')
    $app.save(t)
  }

  const arred = (v) => Math.round(v * 100) / 100

  $app
    .logger()
    .info(
      'pedido lancado no financeiro',
      'pedido',
      numero,
      'cliente',
      cliente,
      'itens',
      criados.length,
      'total',
      arred(totalPedido),
      'formato',
      formato,
    )

  return e.json(200, {
    ok: true,
    referencia: ref,
    formato_lido: formato,
    itens_lancados: criados.length,
    itens: criados,
    total: arred(totalPedido),
    pago: arred(pago),
  })
})
