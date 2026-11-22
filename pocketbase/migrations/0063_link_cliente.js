/**
 * Link exclusivo do cliente por documento (Pedido e OS).
 *
 * Pedido do Felipe: "Crie um link exclusivo por pedido e por OS, sem login,
 * que o cliente abre pelo WhatsApp: vê materiais/serviços com quantidades e
 * fotos SEM valores, baixa o ZIP das fotos e pode ASSINAR a confirmação de
 * recebimento na tela."
 *
 * Aqui só entra o CAMPO do token em cada coleção (o token de documentos novos
 * é gerado pelo hook linkCliente.pb.js no create; os existentes são preenchidos
 * agora). Nada é apagado e nenhum dado muda — só passa a existir o campo.
 */
migrate(
  (app) => {
    for (const nome of ['work_orders', 'quotes']) {
      const col = app.findCollectionByNameOrId(nome)
      if (!col.fields.getByName('client_link_token')) {
        col.fields.add(new Field({ name: 'client_link_token', type: 'text' }))
        app.save(col)
      }
      // preenche token nos registros que ainda não têm (nada é sobrescrito
      // quando já existe token). No update o hook linkClienteToken.pb.js
      // também preenche, mas assim o link já nasce válido no deploy.
      const faltando = app.findRecordsByFilter(nome, 'client_link_token = ""', '-created', 0, 0)
      for (const r of faltando) {
        r.set('client_link_token', $security.randomString(24))
        app.save(r)
      }
    }
  },
  (app) => {
    for (const nome of ['work_orders', 'quotes']) {
      const col = app.findCollectionByNameOrId(nome)
      const campo = col.fields.getByName('client_link_token')
      if (campo) col.fields.removeById(campo.getId())
      app.save(col)
    }
  },
)
