/**
 * Link exclusivo do cliente por documento (Pedido e OS) — rotas públicas.
 *
 * Pedido do Felipe: "Crie um link exclusivo por pedido e por OS, sem login,
 * que o cliente abre pelo WhatsApp: vê materiais/serviços com quantidades e
 * fotos SEM valores, baixa o ZIP das fotos e pode ASSINAR a confirmação de
 * recebimento na tela."
 *
 * O QUE AS ROTAS FAZEM:
 *  - GET  /backend/v1/cliente/:tipo/:id?t=TOKEN   → documento "enxuto": itens,
 *    fotos e assinatura, SEM nenhum campo de valor. É a leitura viva: chamada
 *    toda vez que o cliente abre o link, devolve sempre a versão atualizada
 *    (item/foto novo lançado no CRM já aparece no mesmo link).
 *  - POST /backend/v1/cliente/:tipo/:id/assinar   → recebe { t, nome, documento,
 *    assinatura(dataURL png) }, grava a assinatura no documento (signature_client
 *    no quote / signature_image na work_order) e registra no histórico
 *    (quote_history / order_history). NUNCA APAGA: o restante do documento e as
 *    fotos originais ficam intactos.
 *
 * O token é validado contra o campo client_link_token do próprio documento —
 * sem ele a rota responde 404 (não 403, para não confirmar existência).
 *
 * NENHUM VALOR sai por aqui: os itens são recortados campo a campo, e o JSON
 * bruto do documento nunca é devolvido.
 */

function baseUrl(e) {
  const esquema = e.request.url().scheme() || 'https'
  const host = e.request.host()
  return `${esquema}://${host}`
}

function carregarDocumento(e, tipo, id, token) {
  if (tipo !== 'os' && tipo !== 'pedido') return null
  let doc = null
  try {
    doc = $app.findRecordById(tipo === 'os' ? 'work_orders' : 'quotes', id)
  } catch (_) {
    return null
  }
  const salvo = doc.getString('client_link_token')
  if (!token || !salvo || token !== salvo) return null
  return doc
}

function itensDaOS(doc) {
  const itens = []
  const materiais = $app.findRecordsByFilter(
    'order_materials',
    'work_order = {:id}',
    'created',
    0,
    0,
    { id: doc.id },
  )
  for (const m of materiais) {
    let descricao = 'Material'
    try {
      const mat = $app.findRecordById('materials', m.getString('material'))
      descricao = mat.getString('name')
    } catch (_) {}
    itens.push({
      descricao,
      quantidade: m.getFloat('quantity'),
      unidade: m.getString('unit') || 'UN',
      tipo: m.getString('kind') === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
    })
  }
  const desc = doc.getString('description')
  if (desc) {
    // o texto da OS entra como a linha do serviço
    itens.unshift({ descricao: desc, quantidade: 1, unidade: 'serviço', tipo: 'SERVICO' })
  }
  return itens
}

function itensDoPedido(doc) {
  const itens = []
  const brutos = doc.get('items') || []
  for (const it of brutos) {
    itens.push({
      descricao: it.description || '',
      quantidade: Number(it.quantity || 0),
      unidade: it.unit || 'UN',
      // tipo entra só como rótulo PRODUTO/SERVIÇO — sem valor nenhum
      tipo: it.kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
    })
  }
  return itens
}

function fotosDaOS(doc, base) {
  const fotos = []
  const registros = $app.findRecordsByFilter(
    'order_photos',
    'work_order = {:id}',
    'created',
    0,
    0,
    { id: doc.id },
  )
  for (const f of registros) {
    const nome = f.getString('image')
    if (!nome) continue
    fotos.push({
      nome,
      caption: f.getString('caption') || '',
      url: `${base}/api/files/order_photos/${f.id}/${nome}`,
    })
  }
  return fotos
}

function fotosDoPedido(doc, base) {
  const fotos = []
  const nomes = doc.get('photos') || []
  for (const nome of nomes) {
    if (!nome) continue
    fotos.push({
      nome,
      caption: '',
      url: `${base}/api/files/quotes/${doc.id}/${nome}`,
    })
  }
  return fotos
}

function assinaturaDoDoc(doc, tipo, base) {
  const nome = tipo === 'os' ? doc.getString('signature_image') : doc.getString('signature_client')
  if (!nome) return ''
  const colecao = tipo === 'os' ? 'work_orders' : 'quotes'
  return `${base}/api/files/${colecao}/${doc.id}/${nome}`
}

// data de gravação da assinatura: vem do histórico (status_to = ASSINADO),
// que é onde a confirmação fica registrada com data
function dataDaAssinatura(tipo, docId) {
  try {
    const colecao = tipo === 'os' ? 'order_history' : 'quote_history'
    const filtro =
      tipo === 'os'
        ? 'work_order = {:id} && status_to = "ASSINADO"'
        : 'quote = {:id} && status_to = "ASSINADO"'
    const linhas = $app.findRecordsByFilter(colecao, filtro, '-created', 1, 0, { id: docId })
    return linhas.length > 0 ? linhas[0].getString('created') : ''
  } catch (_) {
    return ''
  }
}

routerAdd(
  'GET',
  '/backend/v1/cliente/{tipo}/{id}',
  (e) => {
    const tipo = e.request.pathValue('tipo')
    const token = e.request.url().query().get('t') || ''
    const id = e.request.pathValue('id')

    const doc = carregarDocumento(e, tipo, id, token)
    if (!doc) return e.json(404, { error: 'Documento não encontrado.' })

    const base = baseUrl(e)

    const cliente = { name: '', document: '', phone: '' }
    const clienteId = doc.getString('client')
    if (clienteId) {
      try {
        const c = $app.findRecordById('clients', clienteId)
        // RAZÃO SOCIAL (name) — o nickname/apelido nunca sai por este link
        cliente.name = c.getString('name')
        cliente.document = c.getString('document')
        cliente.phone = c.getString('phone')
      } catch (_) {}
    }

    return e.json(200, {
      tipo,
      id: doc.id,
      numero: tipo === 'os' ? doc.getInt('order_number') : doc.getInt('number'),
      status: doc.getString('status'),
      atualizado_em: doc.getString('updated'),
      cliente,
      itens: tipo === 'os' ? itensDaOS(doc) : itensDoPedido(doc),
      fotos: tipo === 'os' ? fotosDaOS(doc, base) : fotosDoPedido(doc, base),
      assinatura_url: assinaturaDoDoc(doc, tipo, base),
      assinado_em: dataDaAssinatura(tipo, doc.id),
      assinado_por: doc.getString('client_signer_name') || '',
    })
  },
  /* sem autenticação */ null,
)

routerAdd(
  'POST',
  '/backend/v1/cliente/{tipo}/{id}/assinar',
  (e) => {
    const tipo = e.request.pathValue('tipo')
    const id = e.request.pathValue('id')
    const corpo = $requestInfo.body

    const token = String(corpo.t || '')
    const nome = String(corpo.nome || '')
      .trim()
      .slice(0, 120)
    const documento = String(corpo.documento || '')
      .trim()
      .slice(0, 40)
    const assinatura = String(corpo.assinatura || '')

    if (!assinatura.startsWith('data:image/png;base64,')) {
      return e.json(400, { error: 'Assine na tela antes de confirmar.' })
    }
    if (!nome) {
      return e.json(400, { error: 'Informe quem está recebendo.' })
    }

    const doc = carregarDocumento(e, tipo, id, token)
    if (!doc) return e.json(404, { error: 'Documento não encontrado.' })

    const bytes = $security.base64Decode(assinatura.split(',')[1])
    const arquivo = filesystem.NewFileFromBytes(bytes, 'assinatura-cliente.png')

    const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const nota = `Cliente confirmou o recebimento pelo link em ${quando} — assinado por ${nome.toUpperCase()}${documento ? ` (doc. ${documento})` : ''}.`

    // grava POR CIMA apenas o campo da assinatura — nada no documento é apagado
    if (tipo === 'os') {
      doc.set('signature_image', arquivo)
      doc.set('client_signer_name', nome)
      if (documento) doc.set('client_signer_doc', documento)
      $app.save(doc)
      $app.collection('order_history').create({
        work_order: doc.id,
        status_from: doc.getString('status'),
        status_to: 'ASSINADO',
        user_name: 'LINK DO CLIENTE',
        user_id: '',
        notes: nota,
      })
    } else {
      doc.set('signature_client', arquivo)
      doc.set('delivered_by_name', nome)
      $app.save(doc)
      $app.collection('quote_history').create({
        quote: doc.id,
        status_from: doc.getString('status'),
        status_to: 'ASSINADO',
        user_name: 'LINK DO CLIENTE',
        user_id: '',
        notes: nota,
      })
    }

    return e.json(200, { ok: true })
  },
  /* sem autenticação */ null,
)
