/**
 * 0076 — Saúde dos conectores Google + diário de atualizações do sistema.
 *
 * PEDIDO DO FELIPE (27/11/2026): "Criar verificação diária automática dos
 * conectores Google (Sheets, Gmail, Drive, Agenda): checar se algum expirou e
 * avisar dentro do CRM (e por e-mail) para o usuário reconectar em
 * Configurações." E também o "diário de atualizações" — as bem-feitorias do
 * sistema que os colaboradores veem ao logar.
 *
 * COLEÇÃO `system_alerts` — pendências que o próprio CRM registra:
 *   - o conector Google de um usuário expirou / foi desconectado;
 *   - falha de sistema detectada (ex.: sincronização da planilha).
 * O cron diário (verificarConexoesGoogle.pb.js) cria/atualiza estas linhas.
 * A bolinha vermelha do Painel e o e-mail de aviso saem daqui.
 *
 * COLEÇÃO `system_updates` — diário de bem-feitorias (SÓ ADMIN lê):
 *   - "v0.0.211 — Conectores Google habilitados" etc., semeado abaixo com as
 *     versões 0.0.203 a 0.0.211 (nada é apagado nunca — registros herdados).
 *
 * IDEMPOTENTE: `system_alerts` tem índice único (user+chave) e a criação usa
 * try/findRecordsByFilter antes de criar; `system_updates` só semeia o que
 * ainda não existe (procura por `version`).
 */
migrate(
  (app) => {
    // ---------------- coleção system_alerts ----------------
    let alertas
    try {
      alertas = app.findCollectionByNameOrId('system_alerts')
    } catch (_) {
      alertas = new Collection({
        name: 'system_alerts',
        type: 'base',
        listRule: "@request.auth.id != '' && @collection.system_alerts.user ?= @request.auth.id",
        viewRule: "@request.auth.id != '' && @collection.system_alerts.user ?= @request.auth.id",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: null,
        deleteRule: null,
      })

      for (const f of [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'chave', type: 'text', options: { max: 80, required: true } },
        { name: 'tipo', type: 'text', options: { max: 40 } },
        { name: 'titulo', type: 'text', options: { max: 200, required: true } },
        { name: 'mensagem', type: 'text', options: { max: 1000 } },
        { name: 'acao', type: 'text', options: { max: 60 } },
        { name: 'acao_link', type: 'text', options: { max: 200 } },
        { name: 'resolvido', type: 'bool', options: {} },
        { name: 'avisado_em', type: 'date', options: {} },
      ]) {
        alertas.fields.add(new Field(f))
      }

      alertas.indexes = [
        'CREATE UNIQUE INDEX idx_system_alerts_user_chave ON system_alerts (user, chave)',
        'CREATE INDEX idx_system_alerts_user ON system_alerts (user)',
      ]

      app.save(alertas)
    }

    // ---------------- coleção system_updates ----------------
    let updates
    try {
      updates = app.findCollectionByNameOrId('system_updates')
    } catch (_) {
      updates = new Collection({
        name: 'system_updates',
        type: 'base',
        // diário de sistema: só administrador lê e ninguém escreve pela API
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: null,
        updateRule: null,
        deleteRule: null,
      })

      for (const f of [
        { name: 'version', type: 'text', options: { max: 20, required: true } },
        { name: 'titulo', type: 'text', options: { max: 200, required: true } },
        { name: 'detalhe', type: 'text', options: { max: 1000 } },
        { name: 'data', type: 'date', options: {} },
      ]) {
        updates.fields.add(new Field(f))
      }

      updates.indexes = [
        'CREATE UNIQUE INDEX idx_system_updates_version ON system_updates (version)',
      ]

      app.save(updates)
    }

    // ---------------- semeando as versões recentes ----------------
    const versoes = [
      {
        version: '0.0.203',
        titulo: 'Correção de recebimento na ficha do cliente',
        detalhe:
          'Itens marcados errado em uma baixa podem ser corrigidos sem apagar histórico (CorrigirRecebimentoDialog).',
        data: '2026-11-26',
      },
      {
        version: '0.0.204',
        titulo: 'Débito por cliente na tela Relatórios',
        detalhe:
          'Tabela com nome, lançamentos e saldo devedor por cliente, com ordenação por nome, data e valor.',
        data: '2026-11-26',
      },
      {
        version: '0.0.205',
        titulo: 'Relatório em PDF do débito por cliente',
        detalhe:
          'Geração de PDF para imprimir ou compartilhar no WhatsApp, com a mesma ordenação da tela.',
        data: '2026-11-26',
      },
      {
        version: '0.0.206',
        titulo: 'Correção do compartilhamento do PDF no celular',
        detalhe:
          'O compartilhar no WhatsApp trava no computador de preview; agora o compartilhamento só no celular e o download direto no desktop.',
        data: '2026-11-26',
      },
      {
        version: '0.0.207',
        titulo: 'Extrato do cliente em PDF',
        detalhe: 'Mesma correção de compartilhamento aplicada ao extrato por cliente.',
        data: '2026-11-26',
      },
      {
        version: '0.0.208',
        titulo: 'Conectores Google habilitados',
        detalhe:
          'Cada usuário conecta a própria conta de Google Sheets, Gmail, Drive e Agenda em Configurações.',
        data: '2026-11-27',
      },
      {
        version: '0.0.209',
        titulo: 'Planilha do Google do financeiro',
        detalhe:
          'Criação e sincronização da planilha com Lançamentos e Contas a Receber no Drive do usuário.',
        data: '2026-11-27',
      },
      {
        version: '0.0.210',
        titulo: 'Correção da sincronização da planilha',
        detalhe:
          'Gravação em blocos e limpeza correta da aba antes de gravar (antes duplicava cabeçalho).',
        data: '2026-11-27',
      },
      {
        version: '0.0.211',
        titulo: 'Backup dos documentos no OneDrive',
        detalhe:
          'Pedidos e orçamentos arquivados em pasta própria no OneDrive, com nome no padrão do Felipe.',
        data: '2026-11-27',
      },
    ]

    for (const v of versoes) {
      const jaTem = app.findRecordsByFilter(
        'system_updates',
        "version = '" + v.version + "'",
        '',
        1,
        0,
      )
      if (jaTem.length > 0) continue
      const reg = new Record(updates)
      reg.set('version', v.version)
      reg.set('titulo', v.titulo)
      reg.set('detalhe', v.detalhe)
      reg.set('data', v.data + ' 12:00:00.000Z')
      app.save(reg)
    }
  },
  (app) => {
    // volta atrás apenas do que esta migration criou (nunca apaga os dados herdados)
    try {
      const col = app.findCollectionByNameOrId('system_alerts')
      app.delete(col)
    } catch (_) {}
    // system_updates fica: é diário do sistema, os registros semeados valem
  },
)
