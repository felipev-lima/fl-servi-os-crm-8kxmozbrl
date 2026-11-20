/**
 * POST /api/crm/pedido-para-os — transforma um pedido em Ordem de Serviço (C6).
 *
 * Copia o cliente e os itens do pedido para uma OS nova:
 *   - itens de PRODUTO entram como material da OS (com quantidade e preço);
 *   - o total de mão de obra vai em `service_value`;
 *   - a OS nasce ABERTA, com a descrição do pedido.
 *
 * A ligação fica gravada nos dois lados: a OS sabe de qual pedido veio
 * (`quote_ref`), o pedido sabe qual OS gerou (`work_order`).
 *
 * A numeração usa o maior `order_number` existente + 1 — a mesma regra do app.
 * Este endpoint só roda para administrador.
 */
routerAdd(
  'POST',
  '/backend/v1/crm/pedido-para-os',
  (c) => {
    const auth = c.get('authRecord')
    if (!auth || auth.getString('role') !== 'admin') {
      throw new ForbiddenError('Somente administrador')
    }

    const corpo = $apis.requestInfo(c).data || {}
    const quoteId = corpo.quote || ''
    if (!quoteId) throw new BadRequestError('Informe o pedido')

    const quote = $app.findRecordById('quotes', quoteId)
    if (quote.getString('work_order')) {
      throw new BadRequestError('Este pedido já gerou uma OS')
    }

    // ---- próximo número ----
    let proximo = 1001
    try {
      const lista = $app.findRecordsByFilter('work_orders', '', '-order_number', 1, 0)
      if (lista.length > 0) {
        proximo = Number(lista[0].getFloat('order_number') || 1000) + 1
      }
    } catch (_) {
      /* sem OS ainda: começa em 1001 */
    }

    // ---- itens do pedido ----
    let itens = []
    try {
      const bruto = quote.get('items')
      itens = Array.isArray(bruto) ? bruto : JSON.parse(bruto || '[]')
    } catch (_) {
      itens = []
    }

    const maoDeObra = itens
      .filter((i) => i.kind === 'SERVICO')
      .reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)

    const descricao =
      itens
        .filter((i) => i.kind === 'SERVICO')
        .map((i) => i.description)
        .join('; ')
        .slice(0, 250) || `Pedido ${quoteId.slice(-6)}`

    // ---- cria a OS ----
    const os = new Record($app.findCollectionByNameOrId('work_orders'))
    os.set('order_number', proximo)
    os.set('client', quote.getString('client'))
    os.set('service_type', 'Instalação')
    os.set('status', 'ABERTA')
    os.set('description', descricao)
    os.set('opened_at', new Date().toISOString())
    os.set('service_value', maoDeObra)
    os.set('quote_ref', quoteId)
    $app.save(os)

    // ---- copia os itens de produto como material da OS ----
    const colMateriais = $app.findCollectionByNameOrId('order_materials')
    for (const i of itens) {
      if (i.kind === 'SERVICO' || !i.material_id) continue
      const item = new Record(colMateriais)
      item.set('work_order', os.id)
      item.set('material', i.material_id)
      item.set('quantity', Number(i.quantity || 0))
      item.set('unit', i.unit || 'UN')
      item.set('unit_price', Number(i.unit_price || 0))
      item.set('kind', i.kind || 'CONSUMO')
      $app.save(item)
    }

    // ---- histórico inicial ----
    try {
      const hist = new Record($app.findCollectionByNameOrId('order_history'))
      hist.set('work_order', os.id)
      hist.set('status_from', '')
      hist.set('status_to', 'ABERTA')
      hist.set('user_name', auth.getString('name') || 'Sistema')
      hist.set('user_id', auth.id)
      hist.set('notes', `OS criada a partir do pedido ${quoteId.slice(-6).toUpperCase()}`)
      $app.save(hist)
    } catch (_) {
      /* histórico é opcional */
    }

    // ---- marca o pedido ----
    quote.set('work_order', os.id)
    $app.save(quote)

    return c.json(200, { ok: true, id: os.id, order_number: proximo })
  },
  $apis.requireRecordAuth(),
)
