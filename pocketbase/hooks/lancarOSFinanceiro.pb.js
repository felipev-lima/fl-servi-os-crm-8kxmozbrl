/**
 * LANÇAMENTO AUTOMÁTICO DA OS NO FINANCEIRO (hook de servidor).
 *
 * Pedido do Felipe (22/11/2026): ao marcar a OS como LANÇADA, ela tem de
 * entrar sozinha no contas a receber daquele cliente. Antes era manual e
 * dava divergência — OS fechada sem aparecer no relatório.
 *
 * O QUE GERA:
 *  - uma linha SERVICO com o valor de mão de obra (`service_value`);
 *  - uma linha por material da OS, como PRODUTO, separando CAPITAL de CONSUMO
 *    pelo tipo do produto;
 *  - se houve pagamento (`payment_received`), uma linha DINHEIRO NEGATIVA,
 *    que abate do saldo — é como a planilha dele sempre funcionou.
 *
 * REGRAS DE SEGURANÇA (importantes — dinheiro não admite teste):
 *  1. Só age quando o status VIRA 'LANCADA' nesta gravação.
 *  2. Não duplica: se a OS já tem lançamento com `work_order_ref = OS-<n>`,
 *     não cria nada. Assim, desmarcar e remarcar não gera cobrança dobrada.
 *  3. Ignora material com quantidade zero ou preço zero (não cobra nada).
 *  4. Nunca derruba o salvamento da OS: erro vai para o log.
 */
onRecordUpdate((e) => {
  e.next()

  try {
    const orig = e.record.original()
    const antes = orig ? String(orig.getString('status') || '') : ''
    const agora = String(e.record.getString('status') || '')
    if (agora !== 'LANCADA' || antes === 'LANCADA') return

    const numero = 'OS-' + String(e.record.getInt('order_number') || '')
    if (!numero || numero === 'OS-0') return

    // 2) já lançada antes? não duplica
    const jaTem = $app.findRecordsByFilter(
      'transactions',
      "work_order_ref = '" + numero + "'",
      '',
      1,
      0,
    )
    if (jaTem.length > 0) {
      console.log('[lancar-os] ' + numero + ' já tem lançamento — nada criado')
      return
    }

    const colTx = $app.findCollectionByNameOrId('transactions')
    const cliente = String(e.record.getString('client') || '')
    const dataOS = String(
      e.record.getString('completed_at') ||
        e.record.getString('scheduled_date') ||
        e.record.getString('opened_at') ||
        new Date().toISOString(),
    )

    // ---- 1) SERVICO (mão de obra) ----
    const servico = Number(e.record.getFloat('service_value') || 0)
    if (servico > 0) {
      const t = new Record(colTx)
      t.set('kind', 'SERVICO')
      t.set('item_type', 'SERVICO')
      t.set(
        'description',
        String(e.record.getString('description') || 'Serviço executado').slice(0, 300),
      )
      t.set('quantity', 1)
      t.set('unit_price', servico)
      t.set('date', dataOS)
      t.set('work_order_ref', numero)
      t.set('sent_to_finance', 'PENDENTE')
      t.set('quote_ref', String(e.record.getString('quote_ref') || ''))
      if (cliente) t.set('client', cliente)
      $app.save(t)
    }

    // ---- 2) MATERIAIS (produto) ----
    const materiais = $app.findRecordsByFilter(
      'order_materials',
      "work_order = '" + e.record.id + "'",
      '',
      500,
      0,
    )
    for (const m of materiais) {
      const qtd = Number(m.getFloat('quantity') || 0)
      const preco = Number(m.getFloat('unit_price') || 0)
      if (qtd <= 0 || preco <= 0) continue

      // tipo do produto decide CAPITAL x CONSUMO
      let tipo = 'CONSUMO'
      let nome = 'Material'
      try {
        const matId = String(m.getString('material') || '')
        if (matId) {
          const mat = $app.findRecordById('materials', matId)
          nome = String(mat.getString('name') || 'Material')
          const dk = String(mat.getString('default_kind') || '')
          if (dk === 'CAPITAL' || dk === 'SERVICO') tipo = dk
        }
      } catch (_) {
        /* sem o cadastro do produto: fica como CONSUMO */
      }

      const t = new Record(colTx)
      t.set('kind', tipo)
      t.set('item_type', 'PRODUTO')
      t.set('description', nome.slice(0, 300))
      t.set('quantity', qtd)
      t.set('unit_price', preco)
      t.set('date', dataOS)
      t.set('work_order_ref', numero)
      t.set('sent_to_finance', 'PENDENTE')
      if (cliente) t.set('client', cliente)
      $app.save(t)
    }

    // ---- 3) DINHEIRO recebido (abate do saldo) ----
    const pago = Number(e.record.getFloat('payment_received') || 0)
    if (pago > 0) {
      const t = new Record(colTx)
      t.set('kind', 'DINHEIRO')
      t.set('item_type', 'SERVICO')
      t.set('description', 'Pagamento recebido na OS ' + numero)
      t.set('quantity', 1)
      t.set('unit_price', -pago) // negativo: abate do débito
      t.set('date', dataOS)
      t.set('work_order_ref', numero)
      t.set('sent_to_finance', 'PENDENTE')
      if (cliente) t.set('client', cliente)
      $app.save(t)
    }

    console.log('[lancar-os] ' + numero + ' lançada no financeiro')
  } catch (err) {
    console.log('[lancar-os] falhou: ' + err)
  }
}, 'work_orders')
