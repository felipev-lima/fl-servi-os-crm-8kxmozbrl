///
/// Documentos (pedidos e orçamentos) para arquivamento no OneDrive.
///
/// POR QUE EXISTE: o Felipe quer que pedidos e orçamentos também fiquem no
/// OneDrive, em pasta própria, sem depender do Maestro. A rota devolve o que o
/// script de backup precisa:
///   ?lista=1        → todos os documentos, com id, numero, tipo, atualizado
///   ?id=<quote_id>  → o documento completo + itens normalizados
///
/// O `tipo` sai do status: ORCAMENTO continua orçamento; qualquer outro é
/// pedido. É o que define a subpasta no OneDrive.
///
/// GET /backend/v1/documentos-arquivar
/// header: X-Arquivador-Secret
routerAdd('GET', '/backend/v1/documentos-arquivar', (e) => {
  const esperado = $secrets.get('ARQUIVADOR_SECRET') || ''
  const enviado = String(e.request.header.get('X-Arquivador-Secret') || '')
  if (esperado === '' || enviado !== esperado) {
    throw new ForbiddenError('Acesso não autorizado.')
  }

  const id = String(e.request.url.query().get('id') || '').trim()

  // ---------- um documento completo ----------
  if (id) {
    let q = null
    try {
      q = $app.findRecordById('quotes', id)
    } catch (_) {
      throw new NotFoundError('Documento não encontrado.')
    }

    let cliente = null
    try {
      cliente = $app.findRecordById('clients', q.getString('client'))
    } catch (_) {}

    // técnicos designados (campo criado na 0066)
    const nomesTecnicos = []
    const tecIds = q.get('technicians')
    const arr = Array.isArray(tecIds) ? tecIds : tecIds ? [tecIds] : []
    for (const tid of arr) {
      try {
        nomesTecnicos.push($app.findRecordById('technicians', tid).getString('name'))
      } catch (_) {}
    }

    /**
     * ITENS DO PEDIDO — estrutura descoberta em 23/11/2026.
     *
     * O campo `items` NÃO guarda objetos com descrição e valor: guarda um
     * ARRAY DE IDS ("91", "92"...). A primeira versão desta rota tentou ler
     * `i.description` de uma string e devolveu 707 itens sem nome e com valor
     * zero — o que deixaria a ficha do pedido vazia no OneDrive.
     *
     * Cada id aponta para um registro de `materials` (o item da carteira).
     * Os dados que importam (nome, unidade, preço) vêm de lá. A quantidade,
     * porém, NÃO está no id — o campo é só a lista. Por isso a ficha mostra o
     * item e o preço de tabela, e a quantidade quando ela puder ser lida do
     * próprio registro.
     */
    const bruto = q.get('items')
    // diagnóstico cru: o que exatamente está no campo
    let cruTipo = typeof bruto
    let cruAmostra = ''
    try {
      cruAmostra = JSON.stringify(bruto).slice(0, 400)
    } catch (_) {
      cruAmostra = String(bruto).slice(0, 400)
    }
    const ids = Array.isArray(bruto) ? bruto : []
    const itens = []
    for (const itemId of ids) {
      const sid = String(itemId)
      let mat = null
      try {
        mat = $app.findRecordById('materials', sid)
      } catch (_) {
        // pode ser um item antigo que não existe mais no catálogo
        itens.push({ descricao: '(item ' + sid + ')', quantidade: 1, valor: 0, tipo: '' })
        continue
      }
      itens.push({
        descricao: mat.getString('name'),
        unidade: mat.getString('unit'),
        quantidade: 1,
        valor: mat.getFloat('price'),
        tipo: mat.getString('default_kind') || '',
      })
    }
    const debugItens = {
      tipo: Array.isArray(bruto) ? 'array-de-ids' : cruTipo,
      tamanho: ids.length,
      primeiro_id: ids.length > 0 ? String(ids[0]) : '',
      resolvidos: itens.filter((i) => i.valor > 0).length,
      cru: cruAmostra,
    }

    const status = q.getString('status')
    return e.json(200, {
      documento: {
        id: q.id,
        numero: Number(q.getFloat('number')) || 0,
        titulo:
          (status === 'ORCAMENTO' ? 'Orçamento ' : 'Pedido ') +
          (Number(q.getFloat('number')) || q.id.slice(-4)),
        status: status,
        data: String(q.getString('date') || '').slice(0, 10),
        cliente: cliente ? cliente.getString('name') : '(sem cliente)',
        documento: cliente ? cliente.getString('document') : '',
        tecnicos: nomesTecnicos.join(' / '),
        atualizado: String(q.getString('updated') || ''),
      },
      itens: itens,
      debug_itens: debugItens,
    })
  }

  // ---------- lista ----------
  const docs = []
  for (const q of $app.findRecordsByFilter('quotes', '', '-number', 0, 0)) {
    const status = q.getString('status')
    if (status === 'CANCELADO') continue
    docs.push({
      id: q.id,
      numero: Number(q.getFloat('number')) || 0,
      tipo: status === 'ORCAMENTO' ? 'orcamento' : 'pedido',
      status: status,
      atualizado: String(q.getString('updated') || ''),
      data: String(q.getString('date') || '').slice(0, 10),
    })
  }

  return e.json(200, { total: docs.length, documentos: docs })
})
