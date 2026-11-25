/**
 * 0072 — EMPRESAS EMISSORAS DE NOTA FISCAL + vínculo da nota ao lançamento.
 *
 * PEDIDO DO FELIPE (25/11/2026):
 * "como eu tenho algumas empresas no total sete empresas, para cada OS fechada,
 *  cada pedido fechado, emitido nota fiscal, eu consigo informar qual foi o
 *  fornecedor daquele pedido de faturamento"
 *
 * O QUE ENTRA:
 *  1. coleção `empresas_nota` — o cadastro das empresas que emitem nota. Cada
 *     uma tem razão social, nome curto, CNPJ e fica ativa/inativa.
 *  2. campos nos lançamentos para registrar, no momento do recebimento:
 *       - `nf_numero`     número da nota (texto: existem séries com letra)
 *       - `nf_data`       data de emissão
 *       - `empresa_nota`  QUAL empresa emitiu (a FL THOMAZ, a FL SERVIÇOS, ...)
 *       - `nf_lote`       identificador que amarra os itens da MESMA nota
 *
 * POR QUE SEPARAR `nf_lote`: uma nota cobre vários itens. Sem o lote, não há
 * como somar o que aquela nota recebeu nem saber quais itens pertencem a ela.
 *
 * IMPORTANTE — NADA É PROIBIDO: o Felipe avisou que pode emitir nota por
 * empresas diferentes e que o número pode repetir entre elas. Por isso o campo
 * de número NÃO é único: quem identifica a nota é a combinação
 * empresa + número. O sistema avisa em caso de repetição, mas nunca bloqueia.
 *
 * REGRA DO CLIENTE RESPEITADA: nada existente é alterado ou apagado. As colunas
 * novas nascem vazias e os 1.000+ lançamentos herdados ficam intactos.
 */
migrate(
  (app) => {
    // ---------- 1. cadastro das empresas emissoras ----------
    let colEmpresa
    try {
      colEmpresa = app.findCollectionByNameOrId('empresas_nota')
    } catch (_) {
      colEmpresa = null
    }

    if (!colEmpresa) {
      colEmpresa = new Collection({
        name: 'empresas_nota',
        type: 'base',
        // dono vê e edita; o técnico não precisa mexer nisso
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          {
            name: 'razao_social',
            type: 'text',
            required: true,
            max: 200,
          },
          {
            name: 'nome_curto',
            type: 'text',
            required: true,
            max: 60,
          },
          { name: 'cnpj', type: 'text', max: 20 },
          { name: 'ie', type: 'text', max: 30 },
          { name: 'observacoes', type: 'text', max: 500 },
          { name: 'ativa', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_empresas_nota_nome ON empresas_nota (nome_curto)'],
      })
      app.save(colEmpresa)
    }

    // ---------- 2. campos de nota fiscal nos lançamentos ----------
    const colTx = app.findCollectionByNameOrId('transactions')

    if (!colTx.fields.getByName('nf_numero')) {
      colTx.fields.add(new TextField({ name: 'nf_numero', max: 60 }))
    }
    if (!colTx.fields.getByName('nf_data')) {
      colTx.fields.add(new DateField({ name: 'nf_data' }))
    }
    if (!colTx.fields.getByName('nf_lote')) {
      colTx.fields.add(new TextField({ name: 'nf_lote', max: 60 }))
    }
    if (!colTx.fields.getByName('empresa_nota')) {
      colTx.fields.add(
        new RelationField({
          name: 'empresa_nota',
          collectionId: colEmpresa.id,
          maxSelect: 1,
          required: false,
          // apagar a empresa não pode apagar o lançamento financeiro
          cascadeDelete: false,
        }),
      )
    }

    // índices para as consultas do dia a dia
    for (const idx of [
      'CREATE INDEX idx_tx_nf_numero ON transactions (nf_numero)',
      'CREATE INDEX idx_tx_nf_lote ON transactions (nf_lote)',
      'CREATE INDEX idx_tx_empresa_nota ON transactions (empresa_nota)',
    ]) {
      if (colTx.indexes.indexOf(idx) < 0) {
        colTx.indexes = [...colTx.indexes, idx]
      }
    }

    app.save(colTx)

    // ---------- 3. cadastro inicial das empresas do Felipe ----------
    /**
     * Nascem as duas que já existem oficialmente. O Felipe completa as outras
     * cinco pela tela — não invento razão social nem CNPJ de empresa que não
     * está documentada.
     */
    const iniciais = [
      {
        razao_social: 'FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO',
        nome_curto: 'FL THOMAZ',
        cnpj: '44.288.125/0001-34',
        ie: '12.290.12-8',
        observacoes: 'Empresa principal, a mesma do cadastro em Configurações.',
      },
      {
        razao_social: 'F. L. SERVIÇOS',
        nome_curto: 'FL SERVIÇOS',
        cnpj: '',
        ie: '',
        observacoes: 'Nome fantasia usado nos documentos. Completar CNPJ se emitir nota por ela.',
      },
    ]

    const jaTem = app.findRecordsByFilter('empresas_nota', '', '', 5, 0)
    if (jaTem.length === 0) {
      for (const e of iniciais) {
        const r = new Record(colEmpresa)
        r.set('razao_social', e.razao_social)
        r.set('nome_curto', e.nome_curto)
        r.set('cnpj', e.cnpj)
        r.set('ie', e.ie)
        r.set('observacoes', e.observacoes)
        r.set('ativa', true)
        app.save(r)
      }
    }
  },
  (app) => {
    // desfazer: tira os campos e a coleção (os dados da nota se perdem, por
    // isso esta reversão é só para ambiente de teste)
    const colTx = app.findCollectionByNameOrId('transactions')
    for (const campo of ['nf_numero', 'nf_data', 'nf_lote', 'empresa_nota']) {
      if (colTx.fields.getByName(campo)) colTx.fields.removeByName(campo)
    }
    colTx.indexes = colTx.indexes.filter(
      (i) =>
        i.indexOf('idx_tx_nf_numero') < 0 &&
        i.indexOf('idx_tx_nf_lote') < 0 &&
        i.indexOf('idx_tx_empresa_nota') < 0,
    )
    app.save(colTx)

    try {
      app.delete(app.findCollectionByNameOrId('empresas_nota'))
    } catch (_) {
      /* já não existe */
    }
  },
)
