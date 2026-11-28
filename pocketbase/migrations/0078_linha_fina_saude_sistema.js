/**
 * 0078 — Diário: widgets de saúde do sistema viram LINHA FINA compacta.
 *
 * PEDIDO DO FELIPE (28/11/2026): "deixar essas informações MAIS COMPACTAS —
 * ...não precisa de um ícone tão grande pode ser bem pequeno e só para
 * consulta e possível ativação... fica mais clean e bonito".
 *
 * Não muda schema: apenas semeia a linha da versão no diário
 * `system_updates` (idempotente — procura por `version` antes de criar;
 * nada é apagado nunca — registros herdados).
 */
migrate(
  (app) => {
    const versao = {
      version: '0.0.213',
      titulo: 'Linha fina de saúde do sistema no Painel',
      detalhe:
        'Conexões Google, pendências e diário viraram uma linha fina e discreta no fim do Painel (só admin): ícones pequenos com bolinha de estado, painel só ao clicar.',
      data: '2026-11-28 18:00:00.000Z',
    }

    const jaTem = app.findRecordsByFilter(
      'system_updates',
      "version = '" + versao.version + "'",
      '',
      1,
      0,
    )
    if (jaTem.length > 0) return

    const updates = app.findCollectionByNameOrId('system_updates')
    const reg = new Record(updates)
    reg.set('version', versao.version)
    reg.set('titulo', versao.titulo)
    reg.set('detalhe', versao.detalhe)
    reg.set('data', versao.data)
    app.save(reg)
  },
  (app) => {
    // volta atrás apenas da linha desta versão (nunca apaga os dados herdados)
    try {
      const antigos = app.findRecordsByFilter('system_updates', "version = '0.0.213'", '', 10, 0)
      for (const r of antigos) app.delete(r)
    } catch (_) {}
  },
)
