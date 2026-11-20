/**
 * 0029 — Estrutura fiscal para nota de serviço (C5) e ligação pedido→OS (C6).
 *
 * C5: o Felipe já disse que nota fiscal vem depois. Aqui só se PREPARA o
 * terreno — os campos que a NFS-e vai exigir, para não ter de remexer no
 * cadastro quando for a hora. Nada é emitido, nenhum endpoint é chamado.
 *
 * C6: guarda nos dois sentidos qual pedido gerou qual OS, para o caminho
 * "aprovado → executar" ser um clique e não digitação repetida.
 */
migrate(
  (app) => {
    // ---------- C6: ligação pedido <-> OS ----------
    const wo = app.findCollectionByNameOrId('work_orders')
    if (!wo.fields.getByName('quote_ref')) {
      wo.fields.add(new TextField({ name: 'quote_ref' }))
    }
    app.save(wo)

    // ---------- C5: campos fiscais do cliente ----------
    const cli = app.findCollectionByNameOrId('clients')
    const camposFiscais = [
      { name: 'ie', type: 'text' }, // inscrição estadual
      { name: 'im', type: 'text' }, // inscrição municipal (NFS-e)
      { name: 'zip', type: 'text' },
      { name: 'ibge_city_code', type: 'text' }, // código IBGE do município
      {
        name: 'tax_regime',
        type: 'select',
        maxSelect: 1,
        values: ['SIMPLES', 'SIMPLES_EXCESSO', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'],
      },
      { name: 'nfse_email', type: 'email' },
    ]
    for (const f of camposFiscais) {
      if (!cli.fields.getByName(f.name)) cli.fields.add(new Field(f))
    }
    app.save(cli)

    // ---------- C5: dados do serviço para a nota ----------
    const wo2 = app.findCollectionByNameOrId('work_orders')
    const camposNota = [
      { name: 'nfse_number', type: 'text' },
      { name: 'nfse_issued_at', type: 'date' },
      { name: 'service_code', type: 'text' }, // código do serviço na prefeitura
      { name: 'iss_rate', type: 'number', min: 0, max: 100 },
      { name: 'iss_amount', type: 'number', min: 0 },
      {
        name: 'nfse_status',
        type: 'select',
        maxSelect: 1,
        values: ['NAO_EMITIDA', 'EMITIDA', 'CANCELADA'],
      },
    ]
    for (const f of camposNota) {
      if (!wo2.fields.getByName(f.name)) wo2.fields.add(new Field(f))
    }
    app.save(wo2)
  },
  (app) => {
    // campos novos ficam; remover apagaria dado que o Felipe pode ter digitado
  },
)
