/**
 * Histórico da OS gravado NO SERVIDOR.
 *
 * Por que existe: até 21/11/2026 o histórico era criado pelo NAVEGADOR, depois
 * de salvar a OS. Se aquele segundo pedido falhasse — status inválido, rede
 * ruim, aba com código antigo — a mudança de status era gravada e o histórico
 * se perdia, sem aviso. Foi o que travou todas as OS: a lista de botões ainda
 * oferecia AGUARDANDO MATERIAL, que não existe mais no banco.
 *
 * Agora o registro nasce dentro do próprio salvamento da OS: se a mudança de
 * status entrar, o histórico entra junto. O navegador não é mais parte do
 * caminho crítico.
 *
 * - Só age quando `status` muda de fato.
 * - Usa os campos de data do próprio registro (created) para não duplicar.
 * - Nunca derruba o salvamento: qualquer erro é registrado e a OS fica salva.
 */
onRecordUpdate((e) => {
  e.next()

  try {
    const original = e.record.original()
    const anterior = original.status
    const novo = e.record.get('status')
    if (!anterior || !novo || anterior === novo) return

    const nome = e.record.get('status_updated_by_name') || 'Sistema'
    const hid = e.record.get('status_updated_by_id') || ''

    const hist = new Record($app.findCollectionByNameOrId('order_history'))
    hist.set('work_order', e.record.id)
    hist.set('status_from', String(anterior))
    hist.set('status_to', String(novo))
    hist.set('user_name', String(nome))
    hist.set('user_id', String(hid))
    hist.set('notes', 'Mudança de status registrada pelo servidor')
    $app.save(hist)
  } catch (err) {
    // nunca derrubar o salvamento da OS por causa do histórico
    console.log('[historico-os] falhou: ' + err)
  }
}, 'work_orders')
