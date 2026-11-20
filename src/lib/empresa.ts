/**
 * Dados da empresa para o PDF e a assinatura do diretor.
 *
 * Uma linha em `settings`. O PDF lê daqui, então o Felipe troca a logomarca
 * sem depender de programador.
 */
import pb from '@/lib/pocketbase/client'

export interface Empresa {
  id?: string
  razao_social?: string
  nome_fantasia?: string
  cnpj?: string
  ie?: string
  endereco?: string
  telefone?: string
  email?: string
  diretor_nome?: string
  logo?: string
  assinatura_diretor?: string
}

export function urlArquivo(e: Empresa, campo: 'logo' | 'assinatura_diretor'): string {
  const nome = e[campo]
  if (!nome || !e.id) return ''
  return `${pb.baseURL}/api/files/settings/${e.id}/${nome}`
}

let cache: Empresa | null = null

export async function getEmpresa(forcar = false): Promise<Empresa> {
  if (cache && !forcar) return cache
  try {
    const lista = await pb.collection('settings').getFullList({ perPage: 1 })
    cache = (lista[0] as unknown as Empresa) || {}
  } catch {
    cache = {}
  }
  return cache
}

export function limparCacheEmpresa() {
  cache = null
}

export async function salvarEmpresa(dados: Partial<Empresa>): Promise<Empresa> {
  const atual = await getEmpresa(true)
  const salvo = atual.id
    ? await pb.collection('settings').update(atual.id, dados as any)
    : await pb.collection('settings').create(dados as any)
  cache = salvo as unknown as Empresa
  return cache
}

export async function enviarArquivoEmpresa(
  campo: 'logo' | 'assinatura_diretor',
  arquivo: File,
): Promise<Empresa> {
  const atual = await getEmpresa(true)
  const form = new FormData()
  form.append(campo, arquivo)
  const salvo = atual.id
    ? await pb.collection('settings').update(atual.id, form)
    : await pb.collection('settings').create(form)
  cache = salvo as unknown as Empresa
  return cache
}
