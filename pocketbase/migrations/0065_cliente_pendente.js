///
/// 0065 — Campo `pendente` no cliente.
///
/// POR QUE EXISTE: na rua, o Felipe cadastra o cliente só com o nome para não
/// travar o atendimento. Esse cadastro fica INCOMPLETO até alguém preencher
/// CNPJ, endereço e telefone. Sem uma marca, ninguém sabe quem falta completar.
///
/// REGRA DEFINIDA PELO FELIPE (23/11/2026):
///   "Cliente cadastrado só com o nome = pendente, e aparece em vermelho na
///    lista até eu abrir e completar."
///
/// COMO FUNCIONA:
///   - o cadastro rápido na OS/Pedido/Orçamento/Lançamentos grava `pendente: true`
///     quando só o nome foi informado;
///   - a tela de Clientes mostra esse cliente em vermelho;
///   - ao salvar o cliente com CNPJ OU telefone preenchido, o campo cai para
///     false automaticamente (hook), sem o Felipe precisar desmarcar.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('clients')
    col.fields.add(
      new BoolField({
        name: 'pendente',
        required: false,
      }),
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('clients')
    col.fields.removeByName('pendente')
    app.save(col)
  },
)
