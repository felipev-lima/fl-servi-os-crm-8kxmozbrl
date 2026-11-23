///
/// 0066 — Mais de um técnico por OS e por PEDIDO, e o pedido visível para quem
///        vai executar.
///
/// PEDIDO DO FELIPE (23/11/2026):
///   "o técnico vê as OS e pedido designados a ele, coloca opção tanto em OS
///    quanto em pedido, mais de um usuário possa ver os pedidos e OS, pois pode
///    ser que eu coloque mais de uma pessoa para ir executar o serviço ou
///    entrega de material."
///
/// O QUE MUDA NESTA BASE
///   1. `work_orders.technician` passa a aceitar vários técnicos.
///   2. `quotes.technicians` é criado: um pedido também pode ser de mais de uma
///      pessoa. Antes não existia nenhum vínculo de técnico no pedido — só o
///      nome de quem entregou, em texto.
///   3. As regras de acesso do pedido deixam de ser "qualquer usuário logado"
///      e passam a ser: admin/superadmin/consulta veem tudo; o técnico vê o
///      pedido em que está designado.
///
/// `?=` no PocketBase significa "algum item desta relação casa" — é o operador
/// certo para várias pessoas na mesma OS/pedido.
migrate(
  (app) => {
    // ---------- 1) OS: vários técnicos ----------
    const os = app.findCollectionByNameOrId('work_orders')
    const campoTec = os.fields.getByName('technician')
    campoTec.maxSelect = 0 // 0 = sem limite
    campoTec.required = false
    os.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'superadmin' || @request.auth.role = 'consulta' || technician.user ?= @request.auth.id)"
    os.viewRule = os.listRule
    os.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico' || technician.user ?= @request.auth.id)"
    app.save(os)

    // ---------- 2) PEDIDO: cria o vínculo com técnicos ----------
    const tecnicosId = app.findCollectionByNameOrId('technicians').id
    const quotes = app.findCollectionByNameOrId('quotes')

    if (!quotes.fields.getByName('technicians')) {
      quotes.fields.add(
        new RelationField({
          name: 'technicians',
          collectionId: tecnicosId,
          maxSelect: 0,
          required: false,
          cascadeDelete: false,
        }),
      )
    }

    // ---------- 3) regras do pedido ----------
    quotes.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'superadmin' || @request.auth.role = 'consulta' || technicians.user ?= @request.auth.id)"
    quotes.viewRule = quotes.listRule
    // o técnico designado precisa marcar entregue, assinar e tirar foto
    quotes.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico' || technicians.user ?= @request.auth.id)"

    app.save(quotes)
  },
  (app) => {
    const os = app.findCollectionByNameOrId('work_orders')
    const campoTec = os.fields.getByName('technician')
    campoTec.maxSelect = 1
    os.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'superadmin' || @request.auth.role = 'consulta' || technician.user = @request.auth.id)"
    os.viewRule = os.listRule
    os.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico' || technician.user = @request.auth.id)"
    app.save(os)

    const quotes = app.findCollectionByNameOrId('quotes')
    quotes.fields.removeByName('technicians')
    quotes.listRule = "@request.auth.id != ''"
    quotes.viewRule = "@request.auth.id != ''"
    quotes.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(quotes)
  },
)
