///
/// Documentos (pedidos e orçamentos) para arquivamento no OneDrive.
///
/// POR QUE EXISTE: o Felipe quer que pedidos e orçamentos também fiquem no
/// OneDrive, em pasta própria, sem depender do Maestro. A rota devolve o que o
/// script de backup precisa:
///   ?lista=1        → todos os documentos, com id, numero, tipo, atualizado
///   ?id=<quote_id>  → o documento completo + itens normalizados
///
/// O `tipo` sai do status: ORCAMENTO continua orçamento; qualquer outro é
/// pedido. É o que define a subpasta no OneDrive.
///
/// GET /backend/v1/documentos-arquivar
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/documentos-arquivar', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const id = String(e.request.url.query().get('id') || '').trim()

  // ---------- um documento completo ----------
  if (id) {
    let q = null
    try {
      q = $app.findRecordById('quotes', id)
    } catch (_) {
      throw new NotFoundError('Documento não encontrado.')
    }

    let cliente = null
    try {
      cliente = $app.findRecordById('clients', q.getString('client'))
    } catch (_) {}

    // técnicos designados (campo criado na 0066)
    const nomesTecnicos = []
    const tecIds = q.get('technicians')
    const arr = Array.isArray(tecIds) ? tecIds : tecIds ? [tecIds] : []
    for (const tid of arr) {
      try {
        nomesTecnicos.push($app.findRecordById('technicians', tid).getString('name'))
      } catch (_) {}
    }

    // itens: o campo `items` é JSON com nome/tipo/qtd/valor por item
    const bruto = q.get('items')
    const itens = []
    if (Array.isArray(bruto)) {
      for (const i of bruto) {
        itens.push({
          descricao: i.description || i.name || i.descricao || 'Item',
          quantidade: Number(i.quantity || i.qtd || 1),
          valor: Number(i.unit_price || i.valor || 0),
          tipo: i.kind || i.tipo || '',
        })
      }
    }

    const status = q.getString('status')
    return e.json(200, {
      documento: {
        id: q.id,
        numero: Number(q.getFloat('number')) || 0,
        titulo:
          (status === 'ORCAMENTO' ? 'Orçamento ' : 'Pedido ') +
          (Number(q.getFloat('number')) || q.id.slice(-4)),
        status: status,
        data: String(q.getString('date') || '').slice(0, 10),
        cliente: cliente ? cliente.getString('name') : '(sem cliente)',
        documento: cliente ? cliente.getString('document') : '',
        tecnicos: nomesTecnicos.join(' / '),
        atualizado: String(q.getString('updated') || ''),
      },
      itens: itens,
    })
  }

  // ---------- lista ----------
  const docs = []
  for (const q of $app.findRecordsByFilter('quotes', '', '-number', 0, 0)) {
    const status = q.getString('status')
    if (status === 'CANCELADO') continue
    docs.push({
      id: q.id,
      numero: Number(q.getFloat('number')) || 0,
      tipo: status === 'ORCAMENTO' ? 'orcamento' : 'pedido',
      status: status,
      atualizado: String(q.getString('updated') || ''),
      data: String(q.getString('date') || '').slice(0, 10),
    })
  }

  return e.json(200, { total: docs.length, documentos: docs })
})
