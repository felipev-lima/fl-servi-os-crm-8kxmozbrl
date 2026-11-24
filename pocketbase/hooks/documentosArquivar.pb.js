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
    /**
     * ITENS DO PEDIDO — CAUSA RAIZ DESCOBERTA EM 24/11/2026.
     *
     * O campo `items` é JSON, mas o conteúdo foi gravado como uma LISTA DE
     * BYTES UTF-8, não como objetos. Exemplo do que está no banco:
     *   [91, 123, 34, 109, 97, 116, 101, 114, 105, 97, 108, 34, ...]
     * que em UTF-8 é a string:
     *   [{"material":"ba09bu3zugtk06c","name":"GABINETE ...","quantity":1,
     *     "unit_price":7890,"kind":"CAPITAL"}, ...]
     *
     * Ou seja: NADA SE PERDEU. Os produtos, quantidades e preços estão
     * intactos — só precisam ser decodificados. As leituras anteriores
     * (minha rota e a tela) tratavam cada número como se fosse um id de
     * material, e por isso apareciam 379 "itens" sem nome e valor zero.
     *
     * Esta função tenta, nesta ordem:
     *   1. array de objetos  → o formato que a tela grava na memória;
     *   2. array de bytes    → o formato que está no banco;
     *   3. string JSON       → formato alternativo.
     */
    const bruto = q.get('items')
    let listaItens = []
    let formato = 'desconhecido'

    const tentarJson = (texto) => {
      try {
        const v = JSON.parse(texto)
        return Array.isArray(v) ? v : null
      } catch (_) {
        return null
      }
    }

    if (Array.isArray(bruto) && bruto.length > 0 && typeof bruto[0] === 'object') {
      listaItens = bruto
      formato = 'objetos'
    } else if (Array.isArray(bruto) && bruto.length > 1) {
      // tenta decodificar como bytes UTF-8
      try {
        const bytes = bruto.map((n) => Number(n) & 0xff)
        const texto = String.fromCharCode.apply(null, bytes)
        // recompor acentos: os bytes são UTF-8 crus
        const decodificado = decodeURIComponent(escape(texto))
        const v = tentarJson(decodificado)
        if (v) {
          listaItens = v
          formato = 'bytes-utf8'
        }
      } catch (_) {
        /* segue para a proxima tentativa */
      }
      if (listaItens.length === 0) {
        // pode ser array de ids de material (pedido antigo)
        formato = 'ids-de-material'
      }
    } else if (typeof bruto === 'string') {
      const v = tentarJson(bruto)
      if (v) {
        listaItens = v
        formato = 'string-json'
      }
    }

    const ids = listaItens.length === 0 && Array.isArray(bruto) ? bruto : []
    const itens = []
    // 1) itens completos (objetos já decodificados)
    for (const i of listaItens) {
      if (!i || typeof i !== 'object') continue
      itens.push({
        descricao: i.name || i.description || '(sem nome)',
        unidade: i.unit || i.unidade || '',
        quantidade: Number(i.quantity || i.qtd || 1),
        valor: Number(i.unit_price || i.valor || 0),
        tipo: i.kind || i.tipo || '',
      })
    }
    // 2) fallback: lista de ids de material (pedidos antigos)
    for (const itemId of ids) {
      const sid = String(itemId)
      let mat = null
      try {
        mat = $app.findRecordById('materials', sid)
      } catch (_) {
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
      formato: formato,
      tamanho: itens.length,
      com_valor: itens.filter((i) => i.valor > 0).length,
      total: Math.round(itens.reduce((s, i) => s + i.quantidade * i.valor, 0) * 100) / 100,
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
