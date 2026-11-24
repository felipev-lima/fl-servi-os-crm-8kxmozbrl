/**
 * LANÇAMENTO AUTOMÁTICO DO PEDIDO NO FINANCEIRO (hook de servidor).
 *
 * PROBLEMA (24/11/2026): o Felipe marcou o pedido da Esméria como LANÇADO e o
 * débito de R$ 1.599,20 (4 cartuchos de toner) NÃO apareceu no financeiro
 * dela. Os pedidos da Tarcísio também não.
 *
 * CAUSA: existia uma rota `POST /backend/v1/lancar-pedido` que fazia o serviço,
 * mas NADA no sistema a chamava. A tela só mudava o status e pronto. A rota
 * ainda exigia um segredo de servidor que o navegador não tem — ou seja, era
 * impossível funcionar pela tela.
 *
 * SOLUÇÃO: este hook roda NO SERVIDOR, no mesmo instante da gravação, igual ao
 * `lancarOSFinanceiro.pb.js` que já funciona para as OS.
 *
 * ⚠️ TUDO DENTRO DO CALLBACK. O JSVM do PocketBase executa cada callback numa
 * VM separada e NÃO enxerga funções declaradas no topo do arquivo — declarar
 * `function lerItens()` fora dava "Hook scoping error". Por isso a leitura dos
 * itens é feita inline, dentro do próprio `onRecordUpdate`.
 *
 * SEGURANÇA (dinheiro não admite teste):
 *  1. Só age quando o status VIRA 'LANCADO' nesta gravação.
 *  2. Não duplica: se já existe lançamento com `quote_ref = PEDIDO-<n>`,
 *     não cria nada. Marcar duas vezes não cobra dobrado.
 *  3. Erro nunca derruba o salvamento — vai para o log.
 */
onRecordUpdate((e) => {
  e.next()

  try {
    const orig = e.record.original()
    const antes = orig ? String(orig.getString('status') || '') : ''
    const agora = String(e.record.getString('status') || '')

    // 1) só quando VIRA lançado nesta gravação
    if (agora !== 'LANCADO' || antes === 'LANCADO') return

    const numero = Number(e.record.getFloat('number')) || 0
    if (!numero) {
      console.log('[lancar-pedido] pedido sem número — ignorado')
      return
    }
    const ref = 'PEDIDO-' + String(numero)

    // 2) já lançado antes? não duplica
    const jaTem = $app.findRecordsByFilter('transactions', 'quote_ref = "' + ref + '"', '', 1, 0)
    if (jaTem.length > 0) {
      console.log('[lancar-pedido] ' + ref + ' já tem lançamento — nada criado')
      return
    }

    const cliente = String(e.record.getString('client') || '')
    if (!cliente) {
      console.log('[lancar-pedido] ' + ref + ' sem cliente — nada criado')
      return
    }

    // ---- leitura dos itens, inline (o JSVM não herda funções do topo) ----
    const bruto = e.record.get('items')
    let itens = []

    // a) já é lista de objetos (o caso normal)
    if (Array.isArray(bruto) && bruto.length > 0 && typeof bruto[0] === 'object') {
      itens = bruto
    } else if (Array.isArray(bruto) && bruto.length > 1) {
      // b) array de bytes UTF-8
      try {
        const bytes = bruto.map((n) => Number(n) & 0xff)
        const texto = String.fromCharCode.apply(null, bytes)
        const v = JSON.parse(decodeURIComponent(escape(texto)))
        if (Array.isArray(v)) itens = v
      } catch (_) {
        /* tenta o próximo formato */
      }
    } else if (typeof bruto === 'string') {
      // c) string JSON
      try {
        const v = JSON.parse(bruto)
        if (Array.isArray(v)) itens = v
      } catch (_) {
        /* desiste */
      }
    }

    if (itens.length === 0) {
      console.log('[lancar-pedido] ' + ref + ' sem itens legíveis — nada criado')
      return
    }

    const data = String(e.record.getString('date') || new Date().toISOString()).slice(0, 10)
    const colTx = $app.findCollectionByNameOrId('transactions')
    let criados = 0
    let total = 0

    for (const i of itens) {
      if (!i || typeof i !== 'object') continue
      const qtd = Number(i.quantity || 0)
      const preco = Number(i.unit_price || 0)
      // 3) quantidade e preço precisam existir para virar cobrança
      if (qtd <= 0 || preco <= 0) continue

      const k = String(i.kind || 'CONSUMO').toUpperCase()
      const kind = k === 'CAPITAL' || k === 'SERVICO' || k === 'CONSUMO' ? k : 'CONSUMO'

      const t = new Record(colTx)
      t.set('client', cliente)
      t.set('date', data + ' 12:00:00.000Z')
      t.set('kind', kind)
      t.set('item_type', kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO')
      t.set('description', String(i.name || i.description || 'Item do pedido').slice(0, 300))
      t.set('quantity', qtd)
      t.set('unit_price', preco)
      t.set('quote_ref', ref)
      t.set('sent_to_finance', 'PENDENTE')
      t.set('notes', 'Lançado do pedido ' + numero)
      $app.save(t)

      criados += 1
      total += qtd * preco
    }

    console.log(
      '[lancar-pedido] ' +
        ref +
        ' lançado — ' +
        criados +
        ' item(ns), total ' +
        Math.round(total * 100) / 100,
    )
  } catch (err) {
    // 4) nunca derruba o salvamento do pedido
    console.log('[lancar-pedido] falhou: ' + err)
  }
}, 'quotes')
