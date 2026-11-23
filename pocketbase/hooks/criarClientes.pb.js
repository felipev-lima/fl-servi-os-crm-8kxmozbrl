///
/// Cria clientes no CRM financeiro a partir do histórico da planilha.
///
/// Por que existe: a importação dos 943 lançamentos esbarrou em 16 clientes
/// que existem na planilha e não no CRM financeiro — entre eles os maiores
/// devedores (MARIA ISABEL, CARLOS WALTER, CLEIDE CANELA). Sem eles, R$ 174
/// mil de débito ficariam sem dono.
///
/// IDEMPOTENTE: confere documento e nome antes de criar. Rodar duas vezes
/// não duplica cliente.
///
/// POST /backend/v1/criar-clientes
/// header: X-Arquivador-Secret
/// body: { clientes: [{ aba, nome, documento?, endereco?, bairro?, cidade?, telefone?, apelido? }] }
routerAdd('POST', '/backend/v1/criar-clientes', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const lista = Array.isArray(body.clientes) ? body.clientes : []
  if (lista.length === 0) throw new BadRequestError('Nenhum cliente recebido.')

  const colecao = $app.findCollectionByNameOrId('clients')

  // índices do que já existe
  const porNome = {}
  const porDoc = {}
  for (const r of $app.findRecordsByFilter('clients', '', 'name', 0, 0)) {
    porNome[String(r.getString('name')).trim().toUpperCase()] = r.id
    const d = String(r.getString('document') || '').replace(/[^0-9]/g, '')
    if (d.length >= 11) porDoc[d] = r.id
  }

  const criados = []
  let existentes = 0
  let erros = 0

  for (const c of lista) {
    const nome = String(c.nome || c.aba || '')
      .trim()
      .toUpperCase()
    if (!nome) {
      erros++
      continue
    }
    const doc = String(c.documento || '').replace(/[^0-9]/g, '')

    // já existe?
    if (porNome[nome] || (doc.length >= 11 && porDoc[doc])) {
      existentes++
      continue
    }

    const reg = new Record(colecao)
    reg.set('name', nome)
    if (c.documento) reg.set('document', String(c.documento).trim())
    if (c.endereco) reg.set('address', String(c.endereco).trim())
    if (c.bairro) reg.set('neighborhood', String(c.bairro).trim())
    reg.set('city', String(c.cidade || 'MACAÉ').trim())
    if (c.telefone) reg.set('phone', String(c.telefone).trim())
    if (c.apelido) reg.set('nickname', String(c.apelido).trim())
    const obs = []
    if (c.contato) obs.push('Contato: ' + String(c.contato).trim())
    obs.push('Criado na importação do histórico financeiro (aba ' + String(c.aba) + ')')
    reg.set('notes', obs.join(' | '))
    reg.set('type', doc.length === 11 ? 'PF' : 'PJ')
    // Pendente quando só tem o nome: é a regra do Felipe (23/11/2026).
    const fone = String(c.telefone || '').replace(/[^0-9]/g, '')
    reg.set('pendente', doc.length < 11 && fone.length < 10)

    try {
      $app.save(reg)
      criados.push({ aba: String(c.aba), nome: nome, id: reg.id })
      porNome[nome] = reg.id
      if (doc.length >= 11) porDoc[doc] = reg.id
    } catch (err) {
      $app.logger().error('criar-clientes: falha', 'aba', String(c.aba), 'erro', String(err))
      erros++
    }
  }

  $app
    .logger()
    .info(
      'criar-clientes concluido',
      'criados',
      criados.length,
      'existentes',
      existentes,
      'erros',
      erros,
    )

  return e.json(200, {
    criados: criados.length,
    existentes: existentes,
    erros: erros,
    lista: criados,
  })
})
