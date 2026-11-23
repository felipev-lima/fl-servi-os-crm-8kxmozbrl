import pb from '@/lib/pocketbase/client'
import { User, UserRole } from '@/types/flservicos'
import { getErrorMessage } from '@/lib/pocketbase/errors'

// O PocketBase não devolve `password` — apenas grava. Usamos um tipo de escrita.
export interface UserWrite {
  name: string
  email: string
  role: UserRole
  active?: boolean
  phone?: string
  password?: string
  passwordConfirm?: string
}

function toUser(record: any): User & { active: boolean } {
  return {
    id: record.id,
    email: record.email || '',
    name: record.name || record.email?.split('@')[0] || 'Usuário',
    role: (record.role as UserRole) || 'consulta',
    phone: record.phone,
    avatar: record.avatar,
    active: record.active !== false,
    created: record.created,
    updated: record.updated,
  }
}

export type ManagedUser = User & { active: boolean }

/**
 * Mensagem de erro útil.
 *
 * O PocketBase devolve "Failed to update record." sem dizer o campo culpado, e
 * era isso que aparecia na tela como "bloqueado". Aqui traduzimos os campos
 * do `response.data` para uma frase que o Felipe entende.
 */
function erroAmigavel(err: any, padrao: string): string {
  const dados = err?.response?.data || err?.data || {}
  const mapa: Record<string, string> = {
    email: 'E-mail inválido ou já usado por outra conta.',
    password: 'Senha inválida (mínimo 8 caracteres).',
    passwordConfirm: 'As senhas não conferem.',
    role: 'Perfil de acesso inválido.',
    name: 'Nome inválido.',
    active: 'Situação inválida.',
  }
  const partes: string[] = []
  for (const campo of Object.keys(dados)) {
    const info = dados[campo]
    if (campo === 'message' || campo === 'data' || campo === 'status') continue
    const msg = mapa[campo] || (info && info.message) || ''
    if (msg) partes.push(msg)
  }
  if (partes.length > 0) return partes.join(' ')
  const generico = getErrorMessage(err)
  return generico && generico !== 'Failed to update record.' ? generico : padrao
}

export async function getUsers(): Promise<ManagedUser[]> {
  try {
    const records = await pb.collection('users').getFullList({
      sort: '-created',
      fields: 'id,email,name,role,active,phone,created,updated',
    })
    return records.map(toUser)
  } catch (err) {
    throw new Error(getErrorMessage(err) || 'Erro ao carregar usuários.')
  }
}

/**
 * Cria o usuário pela rota do administrador.
 *
 * A criação direta pela API padrão devolvia 400 sem detalhe quando o papel ou
 * a situação vinham em formato inesperado. A rota `admin-upsert-user` valida
 * no servidor e responde com a razão exata.
 */
export async function createUser(data: UserWrite): Promise<ManagedUser> {
  try {
    const resp = await pb.send('/backend/v1/admin-upsert-user', {
      method: 'POST',
      body: {
        name: data.name,
        email: data.email,
        role: data.role,
        active: data.active !== false,
        password: data.password,
      },
    })
    const id = resp?.user?.id
    if (id) {
      const record = await pb.collection('users').getOne(id)
      return toUser(record)
    }
    return toUser(resp?.user || {})
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao criar usuário.'))
  }
}

/** Altera perfil e/ou situação (ativo/inativo) de um usuário. */
export async function updateUser(
  id: string,
  data: { role?: UserRole; active?: boolean; name?: string; phone?: string },
): Promise<ManagedUser> {
  try {
    const record = await pb.collection('users').update(id, data)
    return toUser(record)
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao atualizar usuário.'))
  }
}

/**
 * Redefine a senha de um usuário (administrador).
 *
 * A API padrão do PocketBase exige a senha antiga (`oldPassword: Cannot be blank`),
 * então o update direto na coleção falha. A rota `admin-set-password` grava a
 * senha no servidor, sem a senha antiga, e só para administradores.
 */
export async function resetUserPassword(id: string, password: string): Promise<ManagedUser> {
  try {
    await pb.send('/backend/v1/admin-set-password', {
      method: 'POST',
      body: { userId: id, newPassword: password },
    })
    const record = await pb.collection('users').getOne(id)
    return toUser(record)
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao redefinir senha.'))
  }
}

/**
 * Salva nome, e-mail, perfil e situação de uma vez, pela rota do administrador.
 *
 * O e-mail é o login da pessoa: a API padrão exige a senha antiga para mudá-lo
 * e a regra da coleção veta o self-change. A rota `admin-upsert-user` resolve
 * no servidor — é o caminho usado pelo botão "Salvar" da tela de usuários.
 */
export async function adminUpsertUser(payload: {
  userId?: string
  name: string
  email: string
  role: UserRole
  active?: boolean
}): Promise<ManagedUser> {
  try {
    const resp = await pb.send('/backend/v1/admin-upsert-user', {
      method: 'POST',
      body: { ...payload, active: payload.active !== false },
    })
    const id = resp?.user?.id || payload.userId
    if (id) {
      const record = await pb.collection('users').getOne(id)
      return toUser(record)
    }
    return toUser(resp?.user || {})
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao salvar o usuário.'))
  }
}

/**
 * Troca só o e-mail (que é o login) de um usuário pelo administrador.
 * Mantida para compatibilidade — internamente usa a rota única.
 */
export async function adminSetEmail(userId: string, email: string): Promise<ManagedUser> {
  try {
    const record = await pb.collection('users').getOne(userId)
    return await adminUpsertUser({
      userId,
      name: record.name || '',
      email,
      role: (record.role as UserRole) || 'tecnico',
      active: record.active !== false,
    })
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao alterar o e-mail.'))
  }
}

/**
 * Exclui um usuário. Normalmente evitamos excluir (protegido no servidor);
 * a desativação é o caminho recomendado — exposto aqui apenas para completude.
 */
export async function deleteUser(id: string): Promise<boolean> {
  try {
    return await pb.collection('users').delete(id)
  } catch (err) {
    throw new Error(erroAmigavel(err, 'Erro ao excluir usuário.'))
  }
}
