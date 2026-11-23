///
/// Marca e desmarca o cliente como PENDENTE de cadastro.
///
/// Regra do Felipe: cliente criado só com o nome fica pendente (vermelho na
/// lista) até alguém completar. Este hook faz a marcação cair sozinha quando
/// o cadastro fica completo, para ninguém precisar desmarcar na mão.
///
/// Critério de "completo": ter CNPJ/CPF **ou** telefone. Não exijo os dois
/// porque muita escola só passa um deles no atendimento — e obrigar os dois
/// deixaria cliente marcado em vermelho para sempre.
onRecordUpdateRequest((e) => {
  const reg = e.record
  const doc = String(reg.getString('document') || '').replace(/[^0-9]/g, '')
  const fone = String(reg.getString('phone') || '').replace(/[^0-9]/g, '')
  const nome = String(reg.getString('name') || '').trim()

  // Nome é obrigatório: sem nome não é cliente.
  if (nome.length < 2) {
    throw new BadRequestError('O cliente precisa de um nome.')
  }

  const completo = doc.length >= 11 || fone.length >= 10
  if (completo && reg.getBool('pendente')) {
    reg.set('pendente', false)
    $app.logger().info('[cliente] cadastro completo, pendencia removida', 'nome', nome)
  }
  e.next()
}, 'clients')
