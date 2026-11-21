/**
 * Histórico da OS gravado NO SERVIDOR.
 *
 * Por que existe: até 21/11/2026 o histórico era criado pelo NAVEGADOR, depois
 * de salvar a OS. Se aquele segundo pedido falhasse — status inválido, rede
 * ruim, aba aberta com código antigo — a mudança de status era gravada e o
 * histórico se perdia, CALADO. Foi o que travou tudo: a tela da OS ainda
 * oferecia AGUARDANDO MATERIAL, valor que a migration 0060 removeu do banco.
 * Toda mudança de status falhava e o histórico parou em 20/11 23:37.
 *
 * Agora o registro nasce dentro do próprio salvamento, no servidor. O navegador
 * deixa de ser parte do caminho crítico.
 *
 * Detalhes que importam nesta JSVM:
 *  - `e.next()` por ÚLTIMO, como nos outros hooks do projeto (usersManage);
 *  - compara contra `record.original()` para só agir quando o status muda;
 *  - `new Record(...)` recebe a COLEÇÃO, não um objeto;
 *  - nada de função de nível superior: lógica toda inline.
 */
onRecordUpdate((e) => {
  try {
    const orig = e.record.original()
    const anterior = orig ? String(orig.getString('status') || '') : ''
    const novo = String(e.record.getString('status') || '')

    if (anterior && novo && anterior !== novo) {
      const nome = String(e.record.getString('status_updated_by_name') || 'Sistema')
      const quemId = String(e.record.getString('status_updated_by_id') || '')

      const hist = new Record($app.findCollectionByNameOrId('order_history'))
      hist.set('work_order', e.record.id)
      hist.set('status_from', anterior)
      hist.set('status_to', novo)
      hist.set('user_name', nome)
      hist.set('user_id', quemId)
      hist.set('notes', 'Status alterado de ' + anterior + ' para ' + novo)
      $app.save(hist)
    }
  } catch (err) {
    // Nunca derrubar o salvamento da OS por causa do histórico, mas deixar
    // rastro no log em vez de sumir.
    console.log('[historico-os] falhou: ' + err)
  }

  e.next()
}, 'work_orders')
