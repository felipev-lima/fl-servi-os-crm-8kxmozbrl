/**
 * RECEBIDO POR (nome de quem recebeu, digitado no link público do cliente).
 *
 * Bug corrigido: o hook da assinatura pública gravava o nome digitado pela
 * cliente no campo delivered_by_name ("Quem entregou") do pedido — o mesmo
 * campo que o admin usa para o entregador. Um sobrescrevia o outro: no pedido
 * nº 4, "Renata" (cliente) apagava "Luciana Lima" (entregadora).
 *
 * Solução pedida pelo Felipe: campo PRÓPRIO received_by_name em quotes e
 * work_orders. A assinatura pública passa a gravar nele; o entregador continua
 * em delivered_by_name. Na OS o nome do recebedor já tinha campo dedicado
 * (client_signer_name) e continua nele — o received_by_name fica como campo
 * padrão novo (nada é apagado; nenhum registro é alterado além do campo novo,
 * que nasce vazio).
 */
migrate(
  (app) => {
    for (const nome of ['quotes', 'work_orders']) {
      const col = app.findCollectionByNameOrId(nome)
      if (!col.fields.getByName('received_by_name')) {
        col.fields.add(new TextField({ name: 'received_by_name' }))
        app.save(col)
      }
    }
  },
  (app) => {
    for (const nome of ['quotes', 'work_orders']) {
      const col = app.findCollectionByNameOrId(nome)
      const campo = col.fields.getByName('received_by_name')
      if (campo) col.fields.removeByName('received_by_name')
      app.save(col)
    }
  },
)
