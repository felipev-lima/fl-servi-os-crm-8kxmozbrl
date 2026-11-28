/**
 * 0077 — Diário: widgets de saúde do sistema movidos para o fim do Painel,
 * visíveis SÓ para administradores.
 *
 * PEDIDO DO FELIPE (28/11/2026):
 *   - "coloca no final da página, essas informações para não tomar espaço no
 *     que é prioridade para uso diário";
 *   - "só deixa esta informação aparecer para o admin, pois não tem
 *     necessidade de aparecer para todos".
 *
 * Não muda schema: apenas semeia a linha da versão no diário
 * `system_updates` (idempotente — procura por `version` antes de criar;
 * nada é apagado nunca — registros herdados).
 */
migrate(
  (app) => {
    const versao = {
      version: '0.0.212',
      titulo: 'Conexões e pendências no fim do Painel (só admin)',
      detalhe:
        'O card de Conexões Google e o widget de pendências saíram do topo e agora aparecem no final da página, apenas para administradores.',
      data: '2026-11-28 12:00:00.000Z',
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
      const antigos = app.findRecordsByFilter('system_updates', "version = '0.0.212'", '', 10, 0)
      for (const r of antigos) app.delete(r)
    } catch (_) {}
  },
)
