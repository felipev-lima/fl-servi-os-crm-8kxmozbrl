/**
 * 0026 — Cliente com apelido e classificação automática do produto.
 *
 * ETAPA 1 do projeto LM SERVIÇOS. Nada é apagado: só campos novos e um
 * preenchimento por regra (o valor que já existia é preservado).
 *
 * 1. clients.nickname — apelido curto para BUSCA no CRM (ex.: "ESCOLA PARQUE").
 *    A razão social (`name`) continua sendo a única impressa em PDF/documento.
 *    Não é obrigatório: cliente sem apelido fica em branco.
 *
 * 2. materials.default_kind — classificação do produto:
 *    CAPITAL (equipamento) / CONSUMO (cabo, conector...) / SERVICO (mão de obra).
 *    Regra: a categoria manda; em categoria mista (CFTV, REDE, ALARME e afins),
 *    o nome decide — DVR, câmera, switch, HD, rack, impressora é CAPITAL;
 *    cabo, conector, toner, bobina, fita é CONSUMO; instalação/manutenção é
 *    SERVICO. Nunca sobrescreve um default_kind já gravado.
 *
 * 3. order_materials.kind — cópia do tipo no momento do lançamento, em
 *    branco nos lançamentos antigos (nunca inventamos dado).
 */
migrate(
  (app) => {
    // ---------- clients.nickname ----------
    const clients = app.findCollectionByNameOrId('clients')
    if (!clients.fields.getByName('nickname')) {
      clients.fields.add(new TextField({ name: 'nickname', max: 120 }))
      app.save(clients)
    }

    // ---------- materials.default_kind ----------
    const materials = app.findCollectionByNameOrId('materials')
    // select já existente não é alterado por fields.add — remove e recria
    const kindAntigo = materials.fields.getByName('default_kind')
    if (kindAntigo) {
      materials.fields.removeById(kindAntigo.id)
    }
    materials.fields.add(
      new SelectField({
        name: 'default_kind',
        values: ['CAPITAL', 'CONSUMO', 'SERVICO'],
        maxSelect: 1,
      }),
    )
    app.save(materials)

    // ---------- order_materials.kind ----------
    const orderMaterials = app.findCollectionByNameOrId('order_materials')
    if (!orderMaterials.fields.getByName('kind')) {
      orderMaterials.fields.add(
        new SelectField({
          name: 'kind',
          values: ['CAPITAL', 'CONSUMO', 'SERVICO'],
          maxSelect: 1,
        }),
      )
      app.save(orderMaterials)
    }

    // ---------- backfill por regra (nunca apaga, nunca sobrescreve) ----------
    const EQUIPAMENTO = [
      'DVR',
      'NVR',
      'CAMERA',
      'CÂMERA',
      'MONITOR',
      'SWITCH',
      'ROTEADOR',
      'ROUTER',
      'ACCESS POINT',
      'AP WIFI',
      'ONU',
      'ONT',
      'MODEM',
      'NOBREAK',
      'UPS',
      'SSD',
      'HD ',
      'HD-',
      'HDD',
      'GRAVADOR',
      'RACK',
      'IMPRESSORA',
      'COMPUTADOR',
      'CPU',
      'NOTEBOOK',
      'IMPRESS',
      'LEITOR',
      'CATRACA',
      'CENTRAL DE ALARME',
      'SENSOR',
      'DISPOSITIVO',
      'TECLADO',
      'CONTROLE',
      'FONTE',
      'BATERIA',
      'PLACA',
      'KIT',
      'INVERSOR',
      'ANTENA',
      'INTERFONE',
      'TELEFONE',
      'DISPLAY',
      'PROJETOR',
      'MICROFONE',
      'CAIXA DE SOM',
      'SIRENE',
      'SIRENE',
      'MINIPC',
      'MINI PC',
    ]
    const CONSUMO = [
      'CABO',
      'CÁBO',
      'FIO',
      'CONECTOR',
      'TONER',
      'BOBINA',
      'FITA',
      'PARAFUSO',
      'BUCHA',
      'ABRAÇADEIRA',
      'ABRACADEIRA',
      'ARRUELA',
      'PRENDE',
      'CABO',
      'LUVA',
      'TERMINAL',
      'ETIQUETA',
      'COLA',
      'TINTA',
      'SELANTE',
      'ABRAÇADEIRA',
      'CANALETA',
      'ELETRODUTO',
      'DUTOS',
      'KEYSTONE',
      'TOMADA',
      'DISJUNTOR',
      'LÂMPADA',
      'LAMPADA',
      'PILHA',
      'ISOLAÇÃO',
      'ISOLACAO',
      'SNAP',
      'RJ45',
      'RJ11',
      'BNC',
      'CAPACITOR',
      'FUSIVEL',
      'FUSÍVEL',
      'PORCA',
      'GANCHO',
      'SUPORTE',
      'BASE',
      'MANGUEIRA',
      'VEDA',
      'LUBRIFICANTE',
      'GRAFITE',
      'ÁLCOOL',
      'ALCOOL',
      'PAPEL',
      'CARTUCHO',
      'REPARO',
      'SUCATA',
    ]
    const SERVICO = [
      'INSTALACAO',
      'INSTALAÇÃO',
      'MANUTENCAO',
      'MANUTENÇÃO',
      'VISTORIA',
      'MAO DE OBRA',
      'MÃO DE OBRA',
      'SERVICO',
      'SERVIÇO',
      'CONFIGURACAO',
      'CONFIGURAÇÃO',
      'PROJETO',
      'LOCACAO',
      'LOCAÇÃO',
      'FRETE',
      'DESLOCAMENTO',
      'HORA TECNICA',
      'HORA TÉCNICA',
      'REPARO EM',
    ]
    // categorias "neutras": nelas, o nome decide
    const MISTAS = [
      'CFTV',
      'REDE',
      'ALARME',
      'GERAL',
      'DIVERSOS',
      'CONECTIVIDADE',
      'CABEAMENTO',
      'ELETRICA',
      'ELÉTRICA',
      'ACESSORIOS',
      'ACESSÓRIOS',
      'OUTROS',
    ]

    const norm = (s) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()

    const casa = (texto, lista) => lista.some((p) => texto.includes(norm(p)))

    const kindPorCategoria = {
      // categoria fala por si
      EQUIPAMENTO: 'CAPITAL',
      EQUIPAMENTOS: 'CAPITAL',
      CONSUMIVEL: 'CONSUMO',
      CONSUMIVEIS: 'CONSUMO',
      CONSUMO: 'CONSUMO',
      SERVICO: 'SERVICO',
      SERVIÇO: 'SERVICO',
      'MAO DE OBRA': 'SERVICO',
    }

    const registros = app.findRecordsByFilter('materials', 'default_kind = ""', 'name', 0, 0)

    let capital = 0
    let consumo = 0
    let servico = 0
    for (const r of registros) {
      const categoria = norm(r.getString('category'))
      const nome = norm(r.getString('name'))

      let kind = kindPorCategoria[categoria] || ''

      if (!kind) {
        // categoria mista/sem regra: o nome decide (serviço > consumo > capital,
        // porque "serviço de instalação de câmera" é serviço, não capital)
        if (casa(nome, SERVICO)) kind = 'SERVICO'
        else if (casa(nome, CONSUMO)) kind = 'CONSUMO'
        else if (casa(nome, EQUIPAMENTO)) kind = 'CAPITAL'
      }

      if (!kind) continue // sem informação suficiente: fica em branco, não inventamos

      r.set('default_kind', kind)
      app.save(r)
      if (kind === 'CAPITAL') capital++
      else if (kind === 'CONSUMO') consumo++
      else servico++
    }
    console.log(
      `[0026] default_kind preenchido: ${capital} CAPITAL / ${consumo} CONSUMO / ${servico} SERVICO`,
    )
  },
  (app) => {
    // rollback: remove SOMENTE os campos criados aqui — nenhum registro é apagado
    try {
      const c = app.findCollectionByNameOrId('clients')
      const f1 = c.fields.getByName('nickname')
      if (f1) {
        c.fields.removeById(f1.id)
        app.save(c)
      }
    } catch (_) {}
    try {
      const m = app.findCollectionByNameOrId('materials')
      const f2 = m.fields.getByName('default_kind')
      if (f2) {
        m.fields.removeById(f2.id)
        app.save(m)
      }
    } catch (_) {}
    try {
      const o = app.findCollectionByNameOrId('order_materials')
      const f3 = o.fields.getByName('kind')
      if (f3) {
        o.fields.removeById(f3.id)
        app.save(o)
      }
    } catch (_) {}
  },
)
