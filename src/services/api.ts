import pb from '@/lib/pocketbase/client'
import { avisarSincronizacao } from '@/lib/onedriveSync'
import {
  Client,
  Technician,
  Material,
  WorkOrder,
  OrderMaterial,
  OrderPhoto,
  OrderHistory,
  FutureMaintenance,
  MaterialKit,
  MaterialKitItem,
  OrderStatus,
} from '@/types/flservicos'

// Helper para obter URL de arquivo do PocketBase
export function getFileUrl(collectionName: string, recordId: string, filename: string): string {
  if (!filename) return ''
  return pb.files.getURL({ id: recordId, collectionName } as any, filename)
}

// ---------------- CLIENTES ----------------
/** Clientes — 97 registros, mas sem `sort` no servidor pelo mesmo motivo. */
export async function getClients(): Promise<Client[]> {
  const records = await pb.collection('clients').getFullList()
  return (records as unknown as Client[]).sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR'),
  )
}

export async function getClientById(id: string): Promise<Client> {
  const record = await pb.collection('clients').getOne(id)
  return record as unknown as Client
}

export async function createClient(data: Partial<Client>): Promise<Client> {
  const record = await pb.collection('clients').create(data)
  return record as unknown as Client
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const record = await pb.collection('clients').update(id, data)
  return record as unknown as Client
}

export async function deleteClient(id: string): Promise<boolean> {
  return await pb.collection('clients').delete(id)
}

// ---------------- TÉCNICOS ----------------
export async function getTechnicians(): Promise<Technician[]> {
  const records = await pb.collection('technicians').getFullList({
    sort: 'name',
  })
  return records as unknown as Technician[]
}

export async function createTechnician(data: Partial<Technician>): Promise<Technician> {
  const record = await pb.collection('technicians').create(data)
  return record as unknown as Technician
}

export async function updateTechnician(id: string, data: Partial<Technician>): Promise<Technician> {
  const record = await pb.collection('technicians').update(id, data)
  return record as unknown as Technician
}

export async function deleteTechnician(id: string): Promise<boolean> {
  return await pb.collection('technicians').delete(id)
}

// ---------------- MATERIAIS ----------------
/**
 * Catálogo completo, em blocos de 500 ordenados NO NAVEGADOR.
 *
 * POR QUE NÃO `getFullList({ sort: 'name' })`: com 1.511 produtos, ordenar por
 * nome no servidor a cada página estourava o tempo e a requisição morria por
 * timeout — a tela de Custos e a de Pedido ficavam presas em "Carregando"
 * para sempre. Sem o `sort` a mesma leitura responde em menos de 1s.
 *
 * A ordenação que o usuário vê é feita aqui, no cliente: mesma lista, sem
 * custo no banco.
 */
export async function getMaterials(): Promise<Material[]> {
  const todos: Material[] = []
  let pagina = 1
  // perPage menor: cada resposta fica leve e nenhuma passa do tempo limite
  while (pagina <= 10) {
    const lote = await pb.collection('materials').getList(pagina, 200)
    todos.push(...(lote.items as unknown as Material[]))
    if (pagina >= lote.totalPages) break
    pagina += 1
  }
  return todos.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))
}

export async function createMaterial(data: Partial<Material>): Promise<Material> {
  const record = await pb.collection('materials').create(data)
  return record as unknown as Material
}

export async function updateMaterial(id: string, data: Partial<Material>): Promise<Material> {
  const record = await pb.collection('materials').update(id, data)
  return record as unknown as Material
}

export async function deleteMaterial(id: string): Promise<boolean> {
  return await pb.collection('materials').delete(id)
}

// ---------------- ORDENS DE SERVIÇO ----------------
export async function getWorkOrders(filter?: string): Promise<WorkOrder[]> {
  const records = await pb.collection('work_orders').getFullList({
    sort: '-order_number',
    expand: 'client,technician',
    filter: filter || '',
  })
  return records as unknown as WorkOrder[]
}

/**
 * LISTA PAGINADA COM FILTRO NO SERVIDOR (melhoria de 22/11/2026).
 *
 * `getWorkOrders` baixa a base INTEIRA e o navegador filtra depois. Funciona
 * com 17 OS; com algumas centenas a abertura da lista fica lenta e a busca
 * (que dispara a cada tecla) trava a tela.
 *
 * Aqui o filtro vai para o PocketBase e só a página pedida desce. A busca
 * textual usa os campos do próprio banco via `~` (contém, sem diferenciar
 * maiúscula), inclusive dentro do cliente e do técnico expandidos.
 *
 * Devolve também `totalItems` para a tela mostrar "x de y".
 */
export interface PaginaOS {
  items: WorkOrder[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export async function getWorkOrdersPage(opcoes: {
  page?: number
  perPage?: number
  busca?: string
  status?: string
  tecnico?: string
  apenasDoTecnico?: string
}): Promise<PaginaOS> {
  const {
    page = 1,
    perPage = 30,
    busca = '',
    status = 'ALL',
    tecnico = 'ALL',
    apenasDoTecnico,
  } = opcoes
  const condicoes: string[] = []

  /**
   * BUSCA. Escapa aspas para não quebrar a expressão do PocketBase — um nome
   * com `'` (raro, mas existe) derrubava a consulta com 400.
   */
  const termo = busca.trim().replace(/'/g, "\\'")
  if (termo) {
    const campos = [
      'order_number ~ {:t}',
      'description ~ {:t}',
      'technical_report ~ {:t}',
      'service_type ~ {:t}',
      'client.name ~ {:t}',
      'client.nickname ~ {:t}',
      'technician.name ~ {:t}',
    ].join(' || ')
    condicoes.push(`(${campos})`)
  }

  /**
   * STATUS. "EM ANDAMENTO" inclui o valor antigo AGUARDANDO MATERIAL, que
   * continua gravado em OS de antes da migration 0060.
   * "HOJE" não é status: é agendada/aberta para hoje.
   */
  if (status === 'HOJE') {
    const hoje = new Date().toISOString().slice(0, 10)
    condicoes.push(`(scheduled_date >= "${hoje} 00:00:00" && scheduled_date <= "${hoje} 23:59:59")`)
  } else if (status === 'EM ANDAMENTO') {
    condicoes.push(`(status = "EM ANDAMENTO" || status = "AGUARDANDO MATERIAL")`)
  } else if (status && status !== 'ALL') {
    condicoes.push(`status = "${status}"`)
  }

  // Técnico: o próprio (usuário técnico) tem prioridade sobre o dropdown
  const alvoTecnico = apenasDoTecnico || (tecnico !== 'ALL' ? tecnico : '')
  if (alvoTecnico) condicoes.push(`technician = "${alvoTecnico}"`)

  const filtro = condicoes.join(' && ')

  const resposta = await pb.collection('work_orders').getList(page, perPage, {
    sort: '-order_number',
    expand: 'client,technician',
    filter: filtro,
    // {:t} resolve para o termo já escapado, evitando injeção na expressão
    ...(termo ? { filter: pb.filter(filtro, { t: busca.trim() }) } : {}),
  })

  return {
    items: resposta.items as unknown as WorkOrder[],
    page: resposta.page,
    perPage: resposta.perPage,
    totalItems: resposta.totalItems,
    totalPages: resposta.totalPages,
  }
}

export async function getWorkOrderById(id: string): Promise<WorkOrder> {
  const record = await pb.collection('work_orders').getOne(id, {
    expand: 'client,technician',
  })
  return record as unknown as WorkOrder
}

export async function getNextOrderNumber(): Promise<number> {
  try {
    const list = await pb.collection('work_orders').getList(1, 1, {
      sort: '-order_number',
    })
    if (list.items.length > 0 && list.items[0].order_number) {
      return Number(list.items[0].order_number) + 1
    }
    return 1001
  } catch (_) {
    return 1001
  }
}

export async function createWorkOrder(
  data: Partial<WorkOrder>,
  currentUserName: string,
): Promise<WorkOrder> {
  if (!data.order_number) {
    data.order_number = await getNextOrderNumber()
  }
  if (!data.opened_at) {
    data.opened_at = new Date().toISOString()
  }
  const record = (await pb.collection('work_orders').create(data)) as unknown as WorkOrder

  // Registrar histórico inicial
  try {
    await pb.collection('order_history').create({
      work_order: record.id,
      status_from: '',
      status_to: record.status || 'ABERTA',
      user_name: currentUserName || 'Sistema',
      user_id: pb.authStore.record?.id || '',
      notes: 'Ordem de serviço criada no sistema',
    })
  } catch (err) {
    console.error('Falha ao registrar histórico inicial', err)
  }

  return record
}

/**
 * Normaliza um status antigo para um valor que o banco aceita.
 *
 * AGUARDANDO MATERIAL saiu do select na migration 0060. Se algo ainda mandar
 * esse valor (aba antiga aberta, atalho velho), gravamos EM ANDAMENTO em vez
 * de deixar a gravação falhar e o histórico se perder.
 */
function statusValido(s?: string): OrderStatus | undefined {
  if (!s) return undefined
  if (s === 'AGUARDANDO MATERIAL') return 'EM ANDAMENTO' as OrderStatus
  return s as OrderStatus
}

export async function updateWorkOrder(
  id: string,
  data: FormData | Partial<WorkOrder>,
  currentUserName?: string,
  oldStatus?: OrderStatus,
  newStatus?: OrderStatus,
  statusNotes?: string,
): Promise<WorkOrder> {
  // sanidade: nunca mandar um status que o banco não conhece
  if (newStatus) newStatus = statusValido(newStatus)
  oldStatus = statusValido(oldStatus)
  if (data instanceof FormData && data.has('status')) {
    data.set('status', String(statusValido(String(data.get('status')))))
  } else if (!(data instanceof FormData) && (data as any).status) {
    ;(data as any).status = statusValido((data as any).status)
  }
  // Se estiver finalizando, preencher completed_at se não enviado
  if (
    newStatus === 'FINALIZADA' &&
    !(data instanceof FormData ? data.has('completed_at') : (data as any).completed_at)
  ) {
    if (data instanceof FormData) {
      data.append('completed_at', new Date().toISOString())
    } else {
      ;(data as any).completed_at = new Date().toISOString()
    }
  }

  const record = (await pb.collection('work_orders').update(id, data)) as unknown as WorkOrder

  /**
   * O HISTÓRICO AGORA É DO SERVIDOR (hook `historicoOS.pb.js`).
   *
   * Antes era criado aqui, e bastava essa segunda chamada falhar — status
   * inválido, rede ruim, aba velha — para a mudança de status ficar sem
   * histórico, sem aviso. Foi o que aconteceu em 21/11: o histórico parou em
   * 20/11 23:37 porque a tela ainda mandava AGUARDANDO MATERIAL.
   *
   * Agora o registro nasce dentro do próprio salvamento, no backend. Aqui só
   * gravamos a NOTA, quando o usuário escreveu um motivo — e mesmo assim com
   * proteção contra duplicar a linha que o servidor já criou.
   */
  if (oldStatus && newStatus && oldStatus !== newStatus) {
    try {
      const jaTem = await pb.collection('order_history').getList(1, 1, {
        filter: `work_order = "${id}" && status_from = "${oldStatus}" && status_to = "${newStatus}"`,
        sort: '-created',
      })
      const recente = jaTem.items[0]
      const agora = Date.now()
      const criadoEm = recente ? new Date(String(recente.created).replace(' ', 'T')).getTime() : 0
      const ehDoServidor =
        recente &&
        agora - criadoEm < 15000 &&
        !String(recente.notes || '').startsWith('Status alterado')
      // se o servidor já registrou esta transição agora há pouco, só completa a nota
      if (ehDoServidor && statusNotes) {
        await pb.collection('order_history').update(recente.id, { notes: statusNotes })
      }
    } catch (err) {
      // A mudança de status JÁ foi gravada; o histórico é o complemento.
      // Antes isso morria no console e o Felipe não sabia de nada.
      console.error('Falha ao registrar histórico', err)
      throw new Error('A OS foi salva, mas o histórico não pôde ser registrado. Avise o suporte.')
    }
  } else if (statusNotes) {
    try {
      await pb.collection('order_history').create({
        work_order: id,
        status_from: record.status,
        status_to: record.status,
        user_name: currentUserName || 'Sistema',
        user_id: pb.authStore.record?.id || '',
        notes: statusNotes,
      })
    } catch (err) {
      console.error('Falha ao registrar nota de histórico', err)
    }
  }

  return record
}

export async function deleteWorkOrder(id: string): Promise<boolean> {
  // Antes de apagar, pega o número para o aviso ao assistente conseguir
  // localizar a pasta no OneDrive e removê-la também.
  let numero: number | undefined
  try {
    const rec = await pb.collection('work_orders').getOne(id)
    numero = (rec as any).order_number
  } catch (_) {
    /* segue sem o número */
  }
  const ok = await pb.collection('work_orders').delete(id)
  // Avisa que a OS foi EXCLUÍDA: o assistente apaga a pasta no OneDrive,
  // para o arquivo não ficar órfão lá.
  avisarSincronizacao(id, numero, 'exclusao')
  return ok
}

// ---------------- MATERIAIS DA OS ----------------
export async function getOrderMaterials(orderId: string): Promise<OrderMaterial[]> {
  const records = await pb.collection('order_materials').getFullList({
    filter: `work_order = "${orderId}"`,
    expand: 'material',
    sort: 'created',
  })
  return records as unknown as OrderMaterial[]
}

export async function addOrderMaterial(data: Partial<OrderMaterial>): Promise<OrderMaterial> {
  const record = await pb.collection('order_materials').create(data)
  return record as unknown as OrderMaterial
}

export async function updateOrderMaterial(
  id: string,
  data: Partial<OrderMaterial>,
): Promise<OrderMaterial> {
  const record = await pb.collection('order_materials').update(id, data)
  return record as unknown as OrderMaterial
}

export async function deleteOrderMaterial(id: string): Promise<boolean> {
  return await pb.collection('order_materials').delete(id)
}

// ---------------- FOTOS DA OS ----------------
export async function getOrderPhotos(orderId: string): Promise<OrderPhoto[]> {
  const records = await pb.collection('order_photos').getFullList({
    filter: `work_order = "${orderId}"`,
    sort: 'display_order,created',
  })
  return records as unknown as OrderPhoto[]
}

export async function addOrderPhoto(formData: FormData): Promise<OrderPhoto> {
  const record = await pb.collection('order_photos').create(formData)
  return record as unknown as OrderPhoto
}

export async function deleteOrderPhoto(id: string): Promise<boolean> {
  return await pb.collection('order_photos').delete(id)
}

// ---------------- HISTÓRICO DA OS ----------------
export async function getOrderHistory(orderId: string): Promise<OrderHistory[]> {
  const records = await pb.collection('order_history').getFullList({
    filter: `work_order = "${orderId}"`,
    sort: '-created',
  })
  return records as unknown as OrderHistory[]
}

// ---------------- LISTAS DE MATERIAIS PADRÃO (KITS) ----------------
export async function getMaterialKits(): Promise<MaterialKit[]> {
  const records = await pb.collection('material_kits').getFullList({
    sort: 'name',
  })
  return records as unknown as MaterialKit[]
}

export async function getMaterialKitItems(kitId: string): Promise<MaterialKitItem[]> {
  const records = await pb.collection('material_kit_items').getFullList({
    filter: `kit = "${kitId}"`,
    expand: 'material',
    sort: 'created',
  })
  return records as unknown as MaterialKitItem[]
}

export async function createMaterialKit(data: Partial<MaterialKit>): Promise<MaterialKit> {
  const record = await pb.collection('material_kits').create(data)
  return record as unknown as MaterialKit
}

export async function updateMaterialKit(
  id: string,
  data: Partial<MaterialKit>,
): Promise<MaterialKit> {
  const record = await pb.collection('material_kits').update(id, data)
  return record as unknown as MaterialKit
}

export async function deleteMaterialKit(id: string): Promise<boolean> {
  return await pb.collection('material_kits').delete(id)
}

export async function addMaterialKitItem(data: Partial<MaterialKitItem>): Promise<MaterialKitItem> {
  const record = await pb.collection('material_kit_items').create(data)
  return record as unknown as MaterialKitItem
}

export async function updateMaterialKitItem(
  id: string,
  data: Partial<MaterialKitItem>,
): Promise<MaterialKitItem> {
  const record = await pb.collection('material_kit_items').update(id, data)
  return record as unknown as MaterialKitItem
}

export async function deleteMaterialKitItem(id: string): Promise<boolean> {
  return await pb.collection('material_kit_items').delete(id)
}

// ---------------- MANUTENÇÕES FUTURAS ----------------
export async function getFutureMaintenances(): Promise<FutureMaintenance[]> {
  const records = await pb.collection('future_maintenances').getFullList({
    expand: 'client,technician',
    sort: 'scheduled_date',
  })
  return records as unknown as FutureMaintenance[]
}

export async function createFutureMaintenance(
  data: Partial<FutureMaintenance>,
): Promise<FutureMaintenance> {
  const record = await pb.collection('future_maintenances').create(data)
  return record as unknown as FutureMaintenance
}

export async function updateFutureMaintenance(
  id: string,
  data: Partial<FutureMaintenance>,
): Promise<FutureMaintenance> {
  const record = await pb.collection('future_maintenances').update(id, data)
  return record as unknown as FutureMaintenance
}

export async function deleteFutureMaintenance(id: string): Promise<boolean> {
  return await pb.collection('future_maintenances').delete(id)
}
