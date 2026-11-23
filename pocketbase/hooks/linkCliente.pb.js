/**
 * Link exclusivo do cliente por documento (Pedido, OS e Orçamento) — rotas públicas.
 *
 * Pedido do Felipe: "Crie um link exclusivo por pedido e por OS, sem login,
 * que o cliente abre pelo WhatsApp: vê materiais/serviços com quantidades e
 * fotos SEM valores, baixa o ZIP das fotos e pode ASSINAR a confirmação de
 * recebimento na tela."
 *
 * VARIANTE "LINK COM VALORES" (pedido do Felipe): o mesmo documento tem um
 * SEGUNDO link, com ?v=1 na URL, que mostra os MESMOS itens, fotos e assinatura
 * MAS com os preços e o total — para o cliente conferir quanto deu o pedido
 * depois da finalização e lançar na planilha de custo dele. O link normal
 * (sem ?v=1) continua SEM valor nenhum: se a flag não vier, o recorte de
 * preço é aplicado como sempre.
 *
 * O QUE AS ROTAS FAZEM:
 *  - GET  /backend/v1/cliente/{tipo}/{id}?t=TOKEN[&v=1] → documento "enxuto":
 *    itens, fotos e assinatura, SEM nenhum campo de valor (com ?v=1, itens
 *    ganham preço/total e o documento ganha o total geral). É a leitura viva:
 *    chamada toda vez que o cliente abre o link, devolve sempre a versão
 *    atualizada (item/foto novo lançado no CRM já aparece no mesmo link).
 *  - POST /backend/v1/cliente/{tipo}/{id}/assinar → recebe multipart/form-data
 *    com { t, nome, documento, assinatura(arquivo png) }, grava a assinatura no
 *    documento (signature_client no quote / signature_image na work_order) e
 *    registra no histórico (quote_history / order_history). NUNCA APAGA: o
 *    restante do documento e as fotos originais ficam intactos.
 *
 * O token é validado contra o campo client_link_token do próprio documento —
 * sem ele a rota responde 404 (não 403, para não confirmar existência).
 *
 * RECEBIDO POR (campo próprio received_by_name): a assinatura pública grava o
 * nome digitado pela cliente NELE — nunca mais em delivered_by_name ("Quem
 * entregou"), que é do admin (bug do pedido nº 4: "Renata" apagava "Luciana
 * Lima"). Na OS o recebedor continua em client_signer_name (campo histórico
 * dela); o received_by_name fica como padrão novo nas duas coleções.
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
 *    (decodificada no navegador) e o hook só lê e.findUploadedFiles('assinatura');
 *  - o findUploadedFiles já devolve *filesystem.File* com .name/.originalName —
 *    NÃO passar por $filesystem.fileFromMultipart (construtor interno que a
 *    JSVM não preenche direito: deu "open : no such file or directory" na
 *    gravação em produção); usar o File devolvido e, se o multipart vier sem
 *    filename (Blob anônimo do iOS/Safari), o hook completa o nome para o
 *    normalizeName do PocketBase gerar "assinatura_XXX.png" em vez de vazio.
 */

// ---------------- GET: leitura pública enxuta ----------------

routerAdd('GET', '/backend/v1/cliente/{tipo}/{id}', (e) => {
  e.next()

  const tipo = e.request.pathValue('tipo')
  const id = e.request.pathValue('id')

  // ?t=TOKEN e ?v=1 (variante com valores) — pela requestInfo: rawQuery()
  // lança na JSVM e o try/catch engole, virando token vazio (era a causa do
  // 404 mesmo com token correto)
  let token = ''
  let mostraValores = false
  try {
    const q = e.requestInfo().query || {}
    token = String(q.t || '')
    mostraValores = String(q.v || '') === '1'
  } catch (_) {}

  if (tipo !== 'os' && tipo !== 'pedido' && tipo !== 'orcamento') {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  // carrega o documento e valida o token contra o próprio registro
  let colecaoDoc = 'quotes'
  if (tipo === 'os') colecaoDoc = 'work_orders'
  let doc = null
  try {
    doc = $app.findRecordById(colecaoDoc, id)
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

  // ---- itens (recorte campo a campo; com valores só se ?v=1) ----
  const itens = []
  let total = 0
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
      const quantidade = m.getFloat('quantity')
      const unitario = m.getFloat('unit_price')
      const subtotal = quantidade * unitario
      total += subtotal
      const item = {
        descricao,
        quantidade,
        unidade: m.getString('unit') || 'UN',
        tipo: m.getString('kind') === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
      }
      if (mostraValores) {
        item.preco_unitario = unitario
        item.total = subtotal
      }
      itens.push(item)
    }
    // o texto da OS entra como a linha do serviço
    const desc = doc.getString('description')
    if (desc) {
      const maoDeObra = doc.getFloat('service_value')
      total += maoDeObra
      const linha = {
        descricao: desc,
        quantidade: 1,
        unidade: 'serviço',
        tipo: 'SERVICO',
      }
      if (mostraValores) {
        linha.preco_unitario = maoDeObra
        linha.total = maoDeObra
      }
      itens.unshift(linha)
    }
  } else {
    let brutos = null
    try {
      brutos = JSON.parse(doc.getString('items') || 'null')
    } catch (_) {}
    if (Array.isArray(brutos)) {
      for (const it of brutos) {
        if (!it || typeof it !== 'object') continue
        const quantidade = Number(it.quantity || 0)
        const unitario = Number(it.unit_price || 0)
        const subtotal = quantidade * unitario
        total += subtotal
        const item = {
          descricao: String(it.description || it.name || ''),
          quantidade,
          unidade: String(it.unit || 'UN'),
          // tipo entra só como rótulo PRODUTO/SERVIÇO — sem valor nenhum
          tipo: it.kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
        }
        if (mostraValores) {
          item.preco_unitario = unitario
          item.total = subtotal
        }
        itens.push(item)
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
    const colecaoHist = tipo === 'os' ? 'order_history' : 'quote_history'
    const campoHist = tipo === 'os' ? 'work_order' : 'quote'
    const filtro = campoHist + " = '" + doc.id + "' && status_to = 'ASSINADO'"
    const linhas = $app.findRecordsByFilter(colecaoHist, filtro, '-created', 1, 0)
    if (linhas.length > 0) assinadoEm = linhas[0].getString('created')
  } catch (_) {}

  // nome de quem recebeu: na OS fica em client_signer_name; no Pedido tem
  // campo PRÓPRIO (received_by_name) gravado pela assinatura pública — separado
  // do entregador (delivered_by_name). Retrocompatível: se o campo novo ainda
  // não existir numa coleção, devolve vazio sem quebrar a rota.
  let recebidoPor = ''
  try {
    recebidoPor =
      tipo === 'os'
        ? doc.getString('client_signer_name') || doc.getString('received_by_name') || ''
        : doc.getString('received_by_name') || ''
  } catch (_) {
    recebidoPor = ''
  }

  return e.json(200, {
    tipo,
    id: doc.id,
    numero: tipo === 'os' ? doc.getInt('order_number') : doc.getInt('number'),
    status: doc.getString('status'),
    atualizado_em: doc.getString('updated'),
    cliente,
    com_valores: mostraValores,
    itens,
    fotos,
    assinatura_url: assinaturaUrl,
    assinado_em: assinadoEm,
    // CPF/CNPJ de quem recebeu (só a OS guarda no documento)
    assinado_doc: tipo === 'os' ? doc.getString('client_signer_doc') || '' : '',
    // RECEBIDO POR — nome digitado no link público, campo próprio do recebedor
    assinado_por: recebidoPor,
    // QUEM ENTREGOU (campo do admin) — a assinatura pública nunca mexe nele
    entregador: (() => {
      try {
        return doc.getString('delivered_by_name') || ''
      } catch (_) {
        return ''
      }
    })(),
    // total geral — só na variante com valores (?v=1); no link normal é 0
    total: mostraValores ? total : 0,
  })
})

// ---------------- POST: assinar confirmação de recebimento ----------------

routerAdd('POST', '/backend/v1/cliente/{tipo}/{id}/assinar', (e) => {
  e.next()

  const tipo = e.request.pathValue('tipo')
  const id = e.request.pathValue('id')
  const corpo = e.requestInfo().body || {}

  // multipart/form-data: o arquivo da assinatura já vem decodificado do
  // navegador ($security.base64Decode não existe na JSVM — bug em produção).
  // O findUploadedFiles já devolve filesystem.File pronto para o doc.set —
  // o caminho antigo ($filesystem.fileFromMultipart) criava um File com nome
  // vazio e a gravação falhava com "open : no such file or directory".
  let arquivos = []
  try {
    arquivos = e.findUploadedFiles('assinatura')
  } catch (_) {
    arquivos = []
  }
  if (!arquivos || arquivos.length === 0) {
    return e.json(400, { error: 'Assine na tela antes de confirmar.' })
  }
  const arquivo = arquivos[0]
  if (!arquivo || !arquivo.reader) {
    return e.json(400, { error: 'Arquivo da assinatura inválido.' })
  }
  // nome OBRIGATÓRIO para o PocketBase conseguir gravar o arquivo: se o
  // multipart chegou sem filename (Blob anônimo — iOS/Safari), completa o nome;
  // o próprio PocketBase acrescenta o sufixo aleatório e a extensão final
  // (assinatura_XXXXXXXX.png)
  if (!String(arquivo.name || '').trim()) {
    try {
      arquivo.name = 'assinatura.png'
      arquivo.originalName = 'assinatura-cliente.png'
    } catch (_) {}
    if (!String(arquivo.name || '').trim()) {
      return e.json(400, { error: 'Arquivo da assinatura sem nome.' })
    }
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

  if (tipo !== 'os' && tipo !== 'pedido' && tipo !== 'orcamento') {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

  let colecaoDoc = 'quotes'
  if (tipo === 'os') colecaoDoc = 'work_orders'
  let doc = null
  try {
    doc = $app.findRecordById(colecaoDoc, id)
  } catch (_) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }
  const salvo = String(doc.getString('client_link_token') || '')
  if (!token || !salvo || token !== salvo) {
    return e.json(404, { error: 'Documento não encontrado.' })
  }

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

  // grava POR CIMA apenas o campo da assinatura e o RECEBIDO POR — nada no
  // documento é apagado. O delivered_by_name ("Quem entregou") NUNCA é tocado
  // aqui: é campo do admin, a assinatura pública grava em received_by_name.
  if (tipo === 'os') {
    doc.set('signature_image', arquivo)
    doc.set('client_signer_name', nome)
    if (documento) doc.set('client_signer_doc', documento)
    try {
      doc.set('received_by_name', nome)
    } catch (_) {}
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
    try {
      doc.set('received_by_name', nome)
    } catch (_) {}
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
