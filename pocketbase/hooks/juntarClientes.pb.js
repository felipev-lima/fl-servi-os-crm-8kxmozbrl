///
/// Junta dois cadastros do mesmo cliente (nome fantasia x razão social).
///
/// O PROBLEMA: a planilha identifica o cliente pelo nome curto da aba
/// ("ESCOLA MARIA ISABEL"); o CRM pela razão social ("CONSELHO ESCOLAR DO
/// COLEGIO MUNICIPAL PROFESSORA MARIA ISABEL DAMASCENO SIMÃO"). Quando a aba
/// não trazia CNPJ, o cruzamento falhou e nasceram dois cadastros: um com os
/// lançamentos e outro vazio.
///
/// O QUE ESTA ROTA FAZ, NA ORDEM:
///   1. copia apelido, telefone e endereço que faltam no cadastro que fica;
///   2. move TODOS os lançamentos do cadastro que sai para o que fica;
///   3. confere que nenhum lançamento ficou apontando para o que sai;
///   4. só então apaga o cadastro que sai.
/// Se o passo 3 encontrar sobra, NADA é apagado e a rota devolve o erro.
///
/// POST /backend/v1/juntar-clientes
/// header: X-Arquivador-Secret
/// body: { manter_id, apagar_id, apelido?, telefone?, endereco? }
routerAdd('POST', '/backend/v1/juntar-clientes', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const body = e.requestInfo().body || {}
  const manterId = String(body.manter_id || '').trim()
  const apagarId = String(body.apagar_id || '').trim()
  if (!manterId || !apagarId) throw new BadRequestError('Informe manter_id e apagar_id.')
  if (manterId === apagarId) throw new BadRequestError('Os dois ids são iguais.')

  let manter = null
  let apagar = null
  try {
    manter = $app.findRecordById('clients', manterId)
    apagar = $app.findRecordById('clients', apagarId)
  } catch (_) {
    throw new NotFoundError('Cliente não encontrado.')
  }

  const resumo = { manter: manter.getString('name'), apagar: apagar.getString('name') }

  // ---------- 1) completa o cadastro que fica ----------
  const apelido = String(body.apelido || '').trim()
  if (apelido && !String(manter.getString('nickname') || '').trim()) {
    manter.set('nickname', apelido)
  }
  const tel = String(body.telefone || '').trim()
  if (tel && !String(manter.getString('phone') || '').trim()) {
    manter.set('phone', tel)
  }
  const end = String(body.endereco || '').trim()
  if (end && !String(manter.getString('address') || '').trim()) {
    manter.set('address', end)
  }
  // guarda de onde veio a junção
  const notas = String(manter.getString('notes') || '').trim()
  const marca =
    'Unificado em ' +
    new Date().toISOString().slice(0, 10) +
    ' (cadastro antigo: ' +
    apagar.getString('name') +
    ')'
  if (notas.indexOf('Unificado em') < 0) {
    manter.set('notes', notas ? notas + ' | ' + marca : marca)
  }
  $app.save(manter)

  // ---------- 2) move os lançamentos ----------
  const doApagar = $app.findRecordsByFilter(
    'transactions',
    'client = "' + apagarId + '"',
    'date',
    0,
    0,
  )
  let movidos = 0
  for (const t of doApagar) {
    t.set('client', manterId)
    try {
      $app.save(t)
      movidos++
    } catch (err) {
      $app.logger().error('juntar-clientes: falha ao mover', 'id', t.id, 'erro', String(err))
    }
  }

  // ---------- 3) confere que nada sobrou ----------
  const sobra = $app.findRecordsByFilter(
    'transactions',
    'client = "' + apagarId + '"',
    'date',
    0,
    0,
  )
  if (sobra.length > 0) {
    $app
      .logger()
      .error(
        'juntar-clientes: sobrou lancamento, NAO apaguei',
        'apagar',
        apagarId,
        'sobra',
        sobra.length,
      )
    return e.json(409, {
      ok: false,
      movidos: movidos,
      sobra: sobra.length,
      mensagem: 'Sobraram lançamentos no cadastro a apagar. Nada foi apagado.',
    })
  }

  // ---------- 4) apaga o cadastro vazio ----------
  const nomeApagado = apagar.getString('name')
  $app.delete(apagar)

  // saldo do cadastro que ficou
  let saldo = 0
  for (const t of $app.findRecordsByFilter(
    'transactions',
    'client = "' + manterId + '"',
    'date',
    0,
    0,
  )) {
    saldo += t.getFloat('quantity') * t.getFloat('unit_price')
  }

  $app
    .logger()
    .info(
      'juntar-clientes concluido',
      'manteve',
      manterId,
      'apagou',
      nomeApagado,
      'movidos',
      movidos,
      'saldo',
      Math.round(saldo * 100) / 100,
    )

  return e.json(200, {
    ok: true,
    manteve: resumo.manter,
    apagou: resumo.apagar,
    movidos: movidos,
    saldo: Math.round(saldo * 100) / 100,
  })
})
