/**
 * Migração entre documentos: OS ⇄ Pedido.
 *
 * Caso de uso (exemplo real, OS #1006 — "Entregar produtos de limpeza", que era
 * uma entrega de produto e deveria ser pedido): o documento foi lançado no
 * lugar errado. A migração COPIA cliente, itens (quantidade, preço e tipo
 * CAPITAL/CONSUMO/SERVICO), descrição e FOTOS para o outro tipo de documento e
 * deixa o original CANCELADO com nota apontando para o número do novo.
 *
 * REGRA ABSOLUTA: NADA é apagado — o original só muda de status, com o motivo
 * no histórico dos dois lados, e mantém as fotos dele: o destino recebe
 * CÓPIAS (o arquivo é baixado e reenviado), nunca transferência. O financeiro
 * não é tocado: nenhum lançamento (transaction) é criado ou alterado aqui.
 */
import {
  getWorkOrderById,
  getOrderMaterials,
  getNextOrderNumber,
  createWorkOrder,
  updateWorkOrder,
  addOrderMaterial,
  getMaterials,
  getOrderPhotos,
} from '@/services/api'
import { getQuote, createQuote, updateQuote, registrarHistoricoPedido } from '@/services/crm'
import pb from '@/lib/pocketbase/client'

export interface ResultadoMigracao {
  destinoId: string
  destinoNumero: number | string
}

const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * FOTOS NA MIGRAÇÃO (reclamação real do Felipe, OS #1006: "as fotos não
 * migraram").
 *
 * A migração de documento não pode tocar nas fotos da ORIGEM — regra absoluta
 * do projeto: NADA é apagado, e a OS cancelada mantém suas evidências. O
 * DESTINO recebe CÓPIAS: aqui baixamos o arquivo de cada foto da coleção
 * `order_photos` e reenviamos como campo multi-arquivo `photos` do pedido.
 *
 * Falhas ficam no console e avisam na mensagem de sucesso — a migração do
 * documento continua valendo; a foto é relançada a mão se algum arquivo
 * estiver corrompido.
 */
async function copiarFotosOSParaPedido(
  orderId: string,
  pedidoId: string,
): Promise<{ ok: number; falhas: string[] }> {
  const falhas: string[] = []
  let ok = 0
  try {
    const fotos = await getOrderPhotos(orderId)
    if (fotos.length === 0) return { ok, falhas }
    const fd = new FormData()
    for (const foto of fotos) {
      try {
        const url = pb.files.getURL(
          { id: foto.id, collectionName: 'order_photos' } as any,
          foto.image,
        )
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const nome = foto.image || `foto-${foto.display_order || ok + 1}.jpg`
        fd.append('photos', new File([blob], nome, { type: blob.type || 'image/jpeg' }))
        ok += 1
      } catch (e) {
        console.warn('foto da OS não copiada para o pedido', e)
        falhas.push(foto.description || foto.image || 'foto')
      }
    }
    if (ok > 0) await updateQuote(pedidoId, fd as any)
  } catch (e) {
    console.warn('fotos da OS não puderam ser lidas para a migração', e)
    falhas.push('fotos da OS (não foi possível ler a lista)')
  }
  return { ok, falhas }
}

/**
 * OS → PEDIDO: cria o pedido com o mesmo cliente, materiais e descrição,
 * registra o histórico dos dois lados e deixa a OS original CANCELADA.
 */
export async function migrarOSParaPedido(
  orderId: string,
  usuario: string,
): Promise<ResultadoMigracao> {
  const os: any = await getWorkOrderById(orderId)
  const materiais = await getOrderMaterials(orderId)
  if (!os.client) throw new Error('A OS não tem cliente definido — corrija antes de migrar.')
  if (materiais.length === 0) throw new Error('A OS não tem materiais lançados — nada para migrar.')

  // nome/unidade do produto vem do catálogo quando o lançamento não traz expandido
  const catalogo: Record<string, { name?: string; unit?: string }> = {}
  try {
    for (const m of await getMaterials()) catalogo[m.id] = m
  } catch {
    /* sem catálogo, usa o que está no lançamento */
  }

  const itens = materiais.map((m: any) => {
    const prod = m.material ? catalogo[m.material] : undefined
    const nome = prod?.name || (m.expand?.material?.name as string) || m.notes || 'Item da OS'
    return {
      material: m.material || '',
      name: nome,
      description: nome,
      unit: m.unit || prod?.unit || '',
      quantity: Number(m.quantity || 0),
      unit_price: Number(m.unit_price || 0),
      kind: m.kind || '',
    }
  })

  const dataOS = String(os.scheduled_date || '').slice(0, 10) || hoje()
  const notaOrigem = `Migrado da OS #${os.order_number}`

  const pedido: any = await createQuote({
    client: os.client,
    date: `${dataOS} 12:00:00.000Z`,
    status: 'PEDIDO',
    notes: [String(os.description || ''), notaOrigem].filter(Boolean).join('\n'),
    items: itens,
  })

  // FOTOS: o destino recebe CÓPIAS — as fotos da OS cancelada continuam nela
  const fotos = await copiarFotosOSParaPedido(orderId, pedido.id)
  if (fotos.falhas.length > 0) console.warn('fotos da OS não copiadas para o pedido', fotos.falhas)

  await registrarHistoricoPedido(
    pedido.id,
    '',
    'PEDIDO',
    usuario,
    `${notaOrigem} — documento original mantido como CANCELADA (nada foi apagado)` +
      (fotos.ok > 0 ? ` · ${fotos.ok} foto(s) copiada(s) da OS` : ''),
  )

  // cancela a OS original APÓS o pedido existir; se falhar, avisa sem apagar nada
  try {
    await updateWorkOrder(
      orderId,
      { status: 'CANCELADA' } as any,
      usuario,
      os.status,
      'CANCELADA',
      `Migrado para o Pedido nº ${pedido.number} — os mesmos itens viraram pedido`,
    )
  } catch (e) {
    console.warn('OS não pôde ser cancelada após migração', e)
    throw new Error(
      `Pedido nº ${pedido.number} criado, mas a OS não pôde ser cancelada. Avise a administração.`,
    )
  }

  return { destinoId: pedido.id, destinoNumero: pedido.number }
}

/**
 * PEDIDO → OS: caminho inverso. Cria a OS com o mesmo cliente e itens,
 * registra o histórico dos dois lados e deixa o pedido original CANCELADO.
 */
export async function migrarPedidoParaOS(
  quoteId: string,
  usuario: string,
): Promise<ResultadoMigracao> {
  const pedido: any = await getQuote(quoteId)
  const itensPedido = pedido.items || []
  if (itensPedido.length === 0) throw new Error('O pedido não tem itens para migrar.')
  if (!pedido.client)
    throw new Error('O pedido não tem cliente definido — corrija antes de migrar.')

  const notaOrigem = `Migrado do Pedido nº ${pedido.number ?? ''}`.trim()

  const novaOS: any = await createWorkOrder(
    {
      client: pedido.client,
      status: 'ABERTA',
      service_type: 'Outro',
      scheduled_date: hoje(),
      description:
        [String(pedido.notes || ''), notaOrigem].filter(Boolean).join('\n') ||
        `Atendimento migrado do pedido nº ${pedido.number}`,
      technical_report: '',
    } as any,
    usuario,
  )

  /**
   * FOTOS (caminho inverso): o pedido guarda o campo multi-arquivo `photos`;
   * a OS é um registro por foto na coleção `order_photos`. Aqui baixamos CADA
   * arquivo do pedido e criamos um registro de foto na OS nova, com o mesmo
   * índice de exibição. O pedido cancelado MANTÉM as fotos dele — nada é
   * transferido, tudo é cópia.
   */
  const fotosPedido: string[] = (pedido.photos as string[]) || []
  const falhasFotos: string[] = []
  let fotosCopiadas = 0
  for (let i = 0; i < fotosPedido.length; i++) {
    try {
      const url = pb.files.getURL(
        { id: pedido.id, collectionName: 'quotes' } as any,
        fotosPedido[i],
      )
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const fd = new FormData()
      fd.append('work_order', novaOS.id)
      fd.append('image', new File([blob], fotosPedido[i], { type: blob.type || 'image/jpeg' }))
      fd.append('display_order', String(i + 1))
      await pb.collection('order_photos').create(fd)
      fotosCopiadas += 1
    } catch (e) {
      console.warn('foto do pedido não copiada para a OS', e)
      falhasFotos.push(fotosPedido[i] || 'foto')
    }
  }
  if (falhasFotos.length > 0) console.warn('fotos do pedido não copiadas para a OS', falhasFotos)

  // lança os materiais na OS nova: só linhas COM produto vinculado (a relação
  // material é obrigatória na OS); linhas soltas vão na descrição, sem sumir
  const soltos: string[] = []
  for (const i of itensPedido) {
    const qtd = Number(i.quantity || 0)
    const preco = Number(i.unit_price || 0)
    if (i.material) {
      try {
        await addOrderMaterial({
          work_order: novaOS.id,
          material: i.material,
          quantity: qtd,
          unit: i.unit || '',
          kind: (i.kind || undefined) as any,
          unit_price: preco,
          total_price: Number((qtd * preco).toFixed(2)),
        })
        continue
      } catch (e) {
        console.warn('item do pedido não lançado na OS', e)
      }
    }
    soltos.push(`• ${i.name || i.description || 'Item'} — qtd ${qtd}`)
  }
  if (soltos.length > 0) {
    const texto = `Itens do pedido sem produto vinculado (lançar manualmente):\n${soltos.join('\n')}`
    try {
      await updateWorkOrder(novaOS.id, { description: `${novaOS.description}\n\n${texto}` } as any)
    } catch {
      /* segue: os itens continuam no pedido original */
    }
  }

  // histórico da OS nova apontando para o pedido de origem
  try {
    await updateWorkOrder(
      novaOS.id,
      {} as any,
      usuario,
      'ABERTA',
      'ABERTA',
      `${notaOrigem} — documento original mantido como CANCELADO (nada foi apagado)` +
        (fotosCopiadas > 0 ? ` · ${fotosCopiadas} foto(s) copiada(s) do pedido` : ''),
    )
  } catch {
    /* a origem segue registrada na descrição da OS */
  }

  const statusAntes = pedido.status || 'PEDIDO'
  try {
    await updateQuote(quoteId, { status: 'CANCELADO' } as any)
    await registrarHistoricoPedido(
      quoteId,
      statusAntes,
      'CANCELADO',
      usuario,
      `Migrado para a OS #${novaOS.order_number} — nada foi apagado`,
    )
  } catch (e) {
    console.warn('pedido não pôde ser cancelado após migração', e)
    throw new Error(
      `OS #${novaOS.order_number} criada, mas o pedido não pôde ser cancelado. Avise a administração.`,
    )
  }

  return { destinoId: novaOS.id, destinoNumero: novaOS.order_number }
}
