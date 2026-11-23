///
/// Entrega a lista de clientes para a sincronização entre bancos.
///
/// Por que existe: o CRM financeiro (projeto 80465) tem os dados de cadastro
/// corrigidos pelo Felipe — apelido, CNPJ, endereço, CEP, telefone, e-mail.
/// O app de OS (projeto 75641) ficou com os dados incompletos. Esta rota
/// permite LER o banco bom para preencher o outro, sem pedir senha a ninguém.
///
/// Somente leitura. Exige o segredo de serviço.
///
/// GET /backend/v1/clientes?lista=1
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/clientes', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const itens = []
  const registros = $app.findRecordsByFilter('clients', '', 'name', 0, 0)
  for (const r of registros) {
    itens.push({
      id: r.id,
      nome: r.getString('name'),
      apelido: r.getString('nickname'),
      documento: r.getString('document'),
      endereco: r.getString('address'),
      bairro: r.getString('neighborhood'),
      cidade: r.getString('city'),
      cep: r.getString('zip'),
      telefone: r.getString('phone'),
      email: r.getString('email'),
      ie: r.getString('ie'),
      im: r.getString('im'),
      observacoes: r.getString('notes'),
      pendente: r.getBool('pendente'),
      atualizado_em: r.getString('updated'),
    })
  }
  return e.json(200, { total: itens.length, clientes: itens })
})
