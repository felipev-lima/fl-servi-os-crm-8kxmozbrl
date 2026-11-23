///
/// Lista clientes com o saldo devedor de cada um.
///
/// Por que existe: o Felipe descobriu que o mesmo cliente pode estar em DOIS
/// cadastros — um pelo nome fantasia (com o débito) e outro pela razão social
/// (zerado). Exemplo: "ESCOLA MARIA ISABEL" com R$ 81.967,82 e "CONSELHO
/// ESCOLAR DO COLEGIO MUNICIPAL PROF MARIA ISABEL" com R$ 0.
///
/// Isso aconteceu porque a planilha usa o nome curto nas abas e o CRM usa a
/// razão social. Na hora de ligar os lançamentos ao cliente, a aba sem CNPJ
/// não casou com ninguém e um cadastro novo foi criado.
///
/// Esta rota devolve cliente + documento + apelido + saldo, para cruzar e
/// achar os pares.
///
/// GET /backend/v1/clientes-saldo
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/clientes-saldo', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  // soma por cliente
  const soma = {}
  const qtd = {}
  const trans = $app.findRecordsByFilter('transactions', '', 'date', 0, 0)
  for (const t of trans) {
    const c = String(t.getString('client') || '')
    if (!c) continue
    const v = t.getFloat('quantity') * t.getFloat('unit_price')
    soma[c] = (soma[c] || 0) + v
    qtd[c] = (qtd[c] || 0) + 1
  }

  const lista = []
  for (const r of $app.findRecordsByFilter('clients', '', 'name', 0, 0)) {
    const s = soma[r.id] || 0
    lista.push({
      id: r.id,
      nome: r.getString('name'),
      apelido: r.getString('nickname'),
      documento: r.getString('document'),
      endereco: r.getString('address'),
      telefone: r.getString('phone'),
      observacoes: r.getString('notes'),
      saldo: Math.round(s * 100) / 100,
      lancamentos: qtd[r.id] || 0,
    })
  }

  return e.json(200, { total: lista.length, clientes: lista })
})
