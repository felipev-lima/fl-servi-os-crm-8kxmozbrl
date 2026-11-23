/**
 * Link exclusivo do cliente por documento (Pedido e OS) — rotas públicas.
 *
 * Pedido do Felipe: "Crie um link exclusivo por pedido e por OS, sem login,
 * que o cliente abre pelo WhatsApp: vê materiais/serviços com quantidades e
 * fotos SEM valores, baixa o ZIP das fotos e pode ASSINAR a confirmação de
 * recebimento na tela."
 *
 * O QUE AS ROTAS FAZEM:
 *  - GET  /backend/v1/cliente/{tipo}/{id}?t=TOKEN → documento "enxuto": itens,
 *    fotos e assinatura, SEM nenhum campo de valor. É a leitura viva: chamada
 *    toda vez que o cliente abre o link, devolve sempre a versão atualizada
 *    (item/foto novo lançado no CRM já aparece no mesmo link).
 *  - POST /backend/v1/cliente/{tipo}/{id}/assinar → recebe multipart/form-data
 *    com { t, nome, documento, assinatura(arquivo png) }, grava a assinatura no
 *    documento (signature_client no quote / signature_image na work_order) e
 *    registra no histórico (quote_history / order_history). NUNCA APAGA: o
 *    restante do documento e as fotos originais ficam intactos.
 *
 * O token é validado contra o campo client_link_token do próprio documento —
 * sem ele a rota responde 404 (não 403, para não confirmar existência).
 *
 * NENHUM VALOR sai por aqui: os itens são recortados campo a campo, e o JSON
 * bruto do documento nunca é devolvido.
 *
 * DETALHES DA JSVM (todos comprovados por hooks que já rodam em produção):
 *  - callbacks rodam fora do escopo do módulo: TODA a lógica vive DENTRO de
 *    cada callback, nada de funções/constantes de nível superior;
 *  - sem middleware extra (o `null` de middleware derruba a rota para 404 estático);
 *  - e.requestInfo() é MÉTODO, e o corpo só chega nele com `e.next()` antes;
 *  - query params SÓ por e.requestInfo().query — e.request.url().rawQuery()
 *    lança na JSVM e, engolido pelo try/catch, devolve token vazio (404);
 *  - o sort de findRecordsByFilter usa só colunas nativas (quotes não tem `created`);
 *  - findRecordsByFilter recebe o filtro pronto (sem binds `{:id}`);
 *  - o horário gravado é o do servidor (UTC);
 *  - NÃO EXISTE decodificação base64 na JSVM ($security.base64Decode lança
 *    "Object has no member"): a assinatura chega pronta como ARQUIVO multipart
 *    (decodificada no navegador) e o hook só lê e.findUploadedFiles('assinatura')
 *    + $filesystem.fileFromMultipart.
 */

// ---------------- GET: leitura pública enxuta ----------------

routerAdd('GET', '/backend/v1/cliente/{tipo}/{id}', (e) => {
  e.next()

  const tipo = e.request.pathValue('tipo')
  const id = e.request.pathValue('id')

  // ?t=TOKEN — pela requestInfo: rawQuery() lança na JSVM e o try/catch engole,
  // virando token vazio (era a causa do 404 mesmo com token correto)
  let token = ''
  try {
    token = String((e.requestInfo().query || {}).t || '')
  } catch (_) {}

  if (tipo !== 'os' && tipo !== 'pedido') {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  // carrega o documento e valida o token contra o próprio registro
  let doc = null
  try {
    doc = $app.findRecordById(tipo === 'os' ? 'work_orders' : 'quotes', id)
  } catch (_) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }
  const salvo = String(doc.getString('client_link_token') || '')
  if (!token || !salvo || token !== salvo) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  // base para as URLs de arquivo (mesmo PocketBase do app):
  // host via header — e.request.host()/url() falham na JSVM
  let base = ''
  try {
    const host = String(e.requestInfo().headers['host'] || '')
    if (host) base = 'https://' + host
  } catch (_) {}

  // cliente: RAZÃO SOCIAL (name) — o nickname/apelido nunca sai por este link
  const cliente = { name: '', document: '', phone: '' }
  const clienteId = String(doc.getString('client') || '')
  if (clienteId) {
    try {
      const c = $app.findRecordById('clients', clienteId)
      cliente.name = c.getString('name')
      cliente.document = c.getString('document')
      cliente.phone = c.getString('phone')
    } catch (_) {}
  }

  // ---- itens SEM valor nenhum (recorte campo a campo) ----
  const itens = []
  if (tipo === 'os') {
    const materiais = $app.findRecordsByFilter(
      'order_materials',
      "work_order = '" + doc.id + "'",
      '',
      0,
      0,
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
    // o texto da OS entra como a linha do serviço
    const desc = doc.getString('description')
    if (desc) {
      itens.unshift({ descricao: desc, quantidade: 1, unidade: 'serviço', tipo: 'SERVICO' })
    }
  } else {
    let brutos = null
    try {
      brutos = JSON.parse(doc.getString('items') || 'null')
    } catch (_) {}
    if (Array.isArray(brutos)) {
      for (const it of brutos) {
        if (!it || typeof it !== 'object') continue
        itens.push({
          descricao: String(it.description || it.name || ''),
          quantidade: Number(it.quantity || 0),
          unidade: String(it.unit || 'UN'),
          // tipo entra só como rótulo PRODUTO/SERVIÇO — sem valor nenhum
          tipo: it.kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
        })
      }
    }
  }

  // ---- fotos (URL pública de arquivo, sem expor o registro) ----
  const fotos = []
  if (tipo === 'os') {
    const registros = $app.findRecordsByFilter(
      'order_photos',
      "work_order = '" + doc.id + "'",
      '',
      0,
      0,
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
  } else {
    // multi-arquivo: getStringSlice; se a coleção não expuser, cai no JSON cru
    let nomes = []
    try {
      nomes = doc.getStringSlice('photos')
    } catch (_) {
      try {
        const brutos = JSON.parse(doc.getString('photos') || 'null')
        if (Array.isArray(brutos)) nomes = brutos
      } catch (_) {}
    }
    for (const nome of nomes) {
      if (!nome) continue
      fotos.push({
        nome,
        caption: '',
        url: `${base}/api/files/quotes/${doc.id}/${nome}`,
      })
    }
  }

  // assinatura já gravada no documento (se houver)
  let assinaturaUrl = ''
  if (tipo === 'os') {
    const n = doc.getString('signature_image')
    if (n) assinaturaUrl = `${base}/api/files/work_orders/${doc.id}/${n}`
  } else {
    const n = doc.getString('signature_client')
    if (n) assinaturaUrl = `${base}/api/files/quotes/${doc.id}/${n}`
  }

  // data da assinatura: vem do histórico (status_to = ASSINADO)
  let assinadoEm = ''
  try {
    const colecao = tipo === 'os' ? 'order_history' : 'quote_history'
    const campo = tipo === 'os' ? 'work_order' : 'quote'
    const filtro = campo + " = '" + doc.id + "' && status_to = 'ASSINADO'"
    const linhas = $app.findRecordsByFilter(colecao, filtro, '-created', 1, 0)
    if (linhas.length > 0) assinadoEm = linhas[0].getString('created')
  } catch (_) {}

  return e.json(200, {
    tipo,
    id: doc.id,
    numero: tipo === 'os' ? doc.getInt('order_number') : doc.getInt('number'),
    status: doc.getString('status'),
    atualizado_em: doc.getString('updated'),
    cliente,
    itens,
    fotos,
    assinatura_url: assinaturaUrl,
    assinado_em: assinadoEm,
    assinado_por: doc.getString('client_signer_name') || '',
  })
})

// ---------------- POST: assinar confirmação de recebimento ----------------

routerAdd('POST', '/backend/v1/cliente/{tipo}/{id}/assinar', (e) => {
  e.next()

  const tipo = e.request.pathValue('tipo')
  const id = e.request.pathValue('id')
  const corpo = e.requestInfo().body || {}

  // multipart/form-data: o arquivo da assinatura já vem decodificado do
  // navegador ($security.base64Decode não existe na JSVM — bug em produção)
  let arquivos = []
  try {
    arquivos = e.findUploadedFiles('assinatura')
  } catch (_) {
    arquivos = []
  }
  if (!arquivos || arquivos.length === 0) {
    return e.json(400, { error: 'Assine na tela antes de confirmar.' })
  }
  let arquivo = null
  try {
    arquivo = $filesystem.fileFromMultipart(arquivos[0])
  } catch (err) {
    return e.json(400, { error: 'Arquivo da assinatura inválido.' })
  }

  // campos de texto do multipart: requestInfo().body traz os valores do form;
  // se algum faltar, cai em e.request.formValue (mesma requisição)
  const campo = (chave) => {
    let v = String(corpo[chave] || '')
    if (v) return v
    try {
      v = String(e.request.formValue(chave) || '')
    } catch (_) {}
    return v
  }
  const token = campo('t')
  const nome = campo('nome').trim().slice(0, 120)
  const documento = campo('documento').trim().slice(0, 40)

  if (!nome) {
    return e.json(400, { error: 'Informe quem está recebendo.' })
  }

  if (tipo !== 'os' && tipo !== 'pedido') {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  let doc = null
  try {
    doc = $app.findRecordById(tipo === 'os' ? 'work_orders' : 'quotes', id)
  } catch (_) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }
  const salvo = String(doc.getString('client_link_token') || '')
  if (!token || !salvo || token !== salvo) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  // (a conversão do desenho em arquivo acontece no navegador — ver linkCliente.ts)

  // data legível sem depender de toLocaleString (ausente na JSVM);
  // o servidor grava em UTC — a tela de CRM ajusta o fuso ao exibir
  const agora = new Date()
  const quando =
    ('0' + agora.getDate()).slice(-2) +
    '/' +
    ('0' + (agora.getMonth() + 1)).slice(-2) +
    '/' +
    agora.getFullYear() +
    ' ' +
    ('0' + agora.getHours()).slice(-2) +
    ':' +
    ('0' + agora.getMinutes()).slice(-2)
  const nota = `Cliente confirmou o recebimento pelo link em ${quando} — assinado por ${nome.toUpperCase()}${documento ? ` (doc. ${documento})` : ''}.`

  // grava POR CIMA apenas o campo da assinatura — nada no documento é apagado
  if (tipo === 'os') {
    doc.set('signature_image', arquivo)
    doc.set('client_signer_name', nome)
    if (documento) doc.set('client_signer_doc', documento)
    $app.save(doc)

    const hist = new Record($app.findCollectionByNameOrId('order_history'))
    hist.set('work_order', doc.id)
    hist.set('status_from', doc.getString('status'))
    hist.set('status_to', 'ASSINADO')
    hist.set('user_name', 'LINK DO CLIENTE')
    hist.set('user_id', '')
    hist.set('notes', nota)
    $app.save(hist)
  } else {
    doc.set('signature_client', arquivo)
    doc.set('delivered_by_name', nome)
    $app.save(doc)

    const hist = new Record($app.findCollectionByNameOrId('quote_history'))
    hist.set('quote', doc.id)
    hist.set('status_from', doc.getString('status'))
    hist.set('status_to', 'ASSINADO')
    hist.set('user_name', 'LINK DO CLIENTE')
    hist.set('user_id', '')
    hist.set('notes', nota)
    $app.save(hist)
  }

  return e.json(200, { ok: true })
})
