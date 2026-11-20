/**
 * Alíquota de imposto por mês.
 *
 * O Felipe apura a carga com o contador todo mês. Aqui cada mês guarda a sua
 * alíquota, para o resultado de novembro não mudar quando dezembro mudar.
 *
 * Regra de busca: usa a linha do mês; se não existir, usa a mais recente
 * ANTERIOR a ele (a alíquota só muda quando muda). Se não houver nenhuma,
 * cai no padrão 8 / 11 / 3.
 */
import pb from '@/lib/pocketbase/client'

export interface AliquotaMes {
  id?: string
  /** "2026-11" */
  periodo: string
  product_percent?: number
  service_percent?: number
  operational_percent?: number
  /** alíquota efetiva informada pelo contador, só para referência */
  aliq_efetiva?: number
  note?: string
}

export const PADRAO: Required<
  Pick<AliquotaMes, 'product_percent' | 'service_percent' | 'operational_percent'>
> = {
  product_percent: 8,
  service_percent: 11,
  operational_percent: 3,
}

export async function listarAliquotas(): Promise<AliquotaMes[]> {
  try {
    const lista = await pb.collection('tax_rates').getFullList({ sort: '-periodo' })
    return lista as unknown as AliquotaMes[]
  } catch {
    return []
  }
}

/**
 * Alíquota vigente no mês pedido.
 *
 * `periodo` no formato "AAAA-MM". Devolve sempre os três percentuais
 * preenchidos — o padrão cobre o caso de não haver nada cadastrado.
 */
export async function aliquotaDoMes(periodo: string): Promise<{
  product_percent: number
  service_percent: number
  operational_percent: number
  origem: 'MES' | 'ANTERIOR' | 'PADRAO'
  periodoUsado?: string
}> {
  const todas = (await listarAliquotas()).filter((a) => (a.periodo || '').match(/^\d{4}-\d{2}$/))
  if (todas.length === 0) return { ...PADRAO, origem: 'PADRAO' }

  const exata = todas.find((a) => a.periodo === periodo)
  if (exata) {
    return {
      product_percent: Number(exata.product_percent ?? PADRAO.product_percent),
      service_percent: Number(exata.service_percent ?? PADRAO.service_percent),
      operational_percent: Number(exata.operational_percent ?? PADRAO.operational_percent),
      origem: 'MES',
      periodoUsado: exata.periodo,
    }
  }

  const anterior = todas
    .filter((a) => a.periodo < periodo)
    .sort((a, b) => b.periodo.localeCompare(a.periodo))[0]

  if (anterior) {
    return {
      product_percent: Number(anterior.product_percent ?? PADRAO.product_percent),
      service_percent: Number(anterior.service_percent ?? PADRAO.service_percent),
      operational_percent: Number(anterior.operational_percent ?? PADRAO.operational_percent),
      origem: 'ANTERIOR',
      periodoUsado: anterior.periodo,
    }
  }

  return { ...PADRAO, origem: 'PADRAO' }
}

/** Grava (cria ou atualiza) a alíquota de um mês. */
export async function salvarAliquota(a: AliquotaMes): Promise<AliquotaMes> {
  const existentes = await listarAliquotas()
  const atual = existentes.find((x) => x.periodo === a.periodo)
  const dados = {
    periodo: a.periodo,
    product_percent: Number(a.product_percent ?? PADRAO.product_percent),
    service_percent: Number(a.service_percent ?? PADRAO.service_percent),
    operational_percent: Number(a.operational_percent ?? PADRAO.operational_percent),
    aliq_efetiva: a.aliq_efetiva !== undefined ? Number(a.aliq_efetiva) : undefined,
    note: a.note || '',
  }
  if (atual?.id) {
    return (await pb
      .collection('tax_rates')
      .update(atual.id, dados as any)) as unknown as AliquotaMes
  }
  return (await pb.collection('tax_rates').create(dados as any)) as unknown as AliquotaMes
}

export async function apagarAliquota(id: string) {
  return pb.collection('tax_rates').delete(id)
}

/** "2026-11" -> "Nov/2026" */
export function rotuloPeriodo(periodo: string): string {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const [ano, mes] = (periodo || '').split('-')
  const i = Number(mes) - 1
  return meses[i] ? `${meses[i]}/${ano}` : periodo
}
