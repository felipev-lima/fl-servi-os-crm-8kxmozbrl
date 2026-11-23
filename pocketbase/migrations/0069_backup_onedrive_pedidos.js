///
/// 0069 — Backup de PEDIDOS e ORÇAMENTOS no OneDrive (pedido do Felipe).
///
/// Até hoje só as OS avisavam sincronizacao (src/lib/onedriveSync.ts), entao a
/// pasta do OneDrive ficava sem os pedidos e orcamentos. A partir de agora as
/// telas de Pedido e Orcamento avisam tambem — e o payload do sinal carrega
/// `tipo` ('os' | 'pedido' | 'orcamento') alem de {os_id, numero, motivo}.
///
/// O que esta migration faz (e o que NAO faz):
/// - NAO cria e NAO apaga registro nenhum (regra absoluta do projeto: nunca
///   apagar; e nao existe colecao de "instrucoes do agente" no banco — as
///   instrucoes do assistente externo vivem no painel do Maestro);
/// - registra em `settings` (unico registro) o campo de texto
///   `backup_onedrive_instrucoes` com as instrucoes ATUALIZADAS de arquivamento
///   — quem programa o assistente externo (Maestro) le daqui:
///       * OS continua na pasta de OS de sempre (nada muda para o que ja esta
///         arquivado — nunca apagar nada);
///       * PEDIDOS e ORCAMENTOS vao para pasta PROPRIA "Pedidos e Orcamentos"
///         (uma subpasta por documento, com numero e id no nome), NUNCA na
///         pasta das OS;
///       * o assistente baixa as FOTOS anexadas (quotes.photos quando tipo for
///         pedido/orcamento; order_photos quando for os) e arquiva junto com a
///         ficha do documento;
///       * sinais sem `tipo` (antigos) continuam tratados como OS, como sempre.
/// - idempotente: roda de novo e so reescreve o mesmo texto no mesmo campo.
///
/// Se a migration rodar num banco onde o campo nao exista (banco novo), ela
/// cria o campo primeiro — e no down nada e desfeito (nunca apagar dados).
///
migrate(
  (app) => {
    const INSTRU = [
      'BACKUP ONEDRIVE — INSTRUCOES DO ASSISTENTE EXTERNO (LM/FL SERVICOS CRM)',
      'O app envia um POST {os_id, numero, motivo, tipo} para o webhook.',
      '- tipo = "os": OS. Arquivar na pasta de OS de sempre (a que ja existe).',
      '- tipo = "pedido" ou "orcamento": documento da colecao quotes. Arquivar',
      '  na pasta PROPRIA "Pedidos e Orcamentos", FORA da pasta das OS. Uma',
      '  subpasta por documento: "Pedido NNNN (id)" ou "Orcamento NNNN (id)".',
      '  NUNCA apagar o que ja esta arquivado — so atualizar/ acrescentar.',
      '- motivo: "criacao", "edicao", "anexo_fotos", "exclusao" ou',
      '  "planilha gerada". Em "exclusao" de pedido/orcamento, marcar a subpasta',
      '  como excluida (nao apagar historicamente — renomear com sufixo EXCLUIDO).',
      '- FOTOS: sempre enviar as fotos junto com a ficha. Para tipo',
      '  pedido/orcamento, baixar cada arquivo de quotes.photos',
      '  (/api/files/quotes/{os_id}/{arquivo}); para tipo os, usar order_photos.',
      '- Sem o campo tipo (sinais antigos), tratar como OS, como sempre.',
    ].join('\n')

    const colecao = app.findCollectionByNameOrId('settings')
    if (colecao.fields.getByName('backup_onedrive_instrucoes') === null) {
      colecao.fields.add(new TextField({ name: 'backup_onedrive_instrucoes', max: 4000 }))
      app.save(colecao)
    }
    const registros = app.findRecordsByFilter('settings', '', '', 1, 0)
    if (registros.length > 0) {
      registros[0].set('backup_onedrive_instrucoes', INSTRU)
      app.save(registros[0])
    }
  },
  (app) => {
    // Sem reversao de conteudo: o texto das instrucoes fica (nunca apagar).
  },
)
