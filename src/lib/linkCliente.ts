/**
 * Link exclusivo do cliente por documento (Pedido e OS).
 *
 * É o pedido do Felipe: "Crie um link exclusivo por pedido e por OS, sem login,
 * que o cliente abre pelo WhatsApp: vê materiais/serviços com quantidades e
 * fotos SEM valores, baixa o ZIP das fotos e pode ASSINAR a confirmação de
 * recebimento na tela."
 *
 * Este módulo concentra:
 *  - a MONTAGEM do link (token vem do campo client_link_token do documento);
 *  - a mensagem pronta de WhatsApp (wa.me com o telefone do cadastro);
 *  - a leitura do documento pela rota pública (sem login, sempre a versão viva);
 *  - o envio da assinatura do cliente para a rota pública.
 *
 * Nada é apagado: assinar grava por cima do campo de assinatura, o restante do
 * documento e as fotos ficam intactos (quem grava é o hook no servidor).
 */
import pb from '@/lib/pocketbase/client'

/** Token de 24 caracteres gerado no servidor e gravado no documento. */
export function tokenDoLinkCliente(doc: any): string {
  return String(doc?.client_link_token || '')
}

/**
 * URL pública do documento: /cliente/:tipo/:id?t=TOKEN
 *
 * `comValores` (variante "Link com valores", só admin): acrescenta &v=1 —
 * o hook devolve os mesmos itens/fotos MAS com preços e total. O link normal
 * (sem a flag) continua sem valor nenhum.
 */
export function urlDoLinkCliente(
  tipo: 'os' | 'pedido',
  id: string,
  token: string,
  comValores?: boolean,
): string {
  const origem = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origem}/cliente/${tipo}/${id}?t=${encodeURIComponent(token)}`
  return comValores ? `${url}&v=1` : url
}

/** Números só ficam usáveis no wa.me se saírem com dígitos, DDI incluído. */
export function digitsTelefone(fone?: string): string {
  return String(fone || '').replace(/\D/g, '')
}

/**
 * Telefone pronto para o wa.me: 55 + DDD + número. Assumimos Brasil quando o
 * cadastro não veio com DDI (o CRM cadastra 10-11 dígitos).
 */
export function telefoneWhatsapp(fone?: string): string {
  const d = digitsTelefone(fone)
  if (!d) return ''
  if (d.length <= 11) return `55${d}`
  return d
}

/** Mensagem pronta que vai no wa.me junto do link.
 * `comValores` muda o texto: é o link de CONFERÊNCIA de valores, enviado
 * depois da finalização para o cliente lançar na planilha de custo dele.
 */
export function mensagemWhatsapp(opts: {
  tipo: 'os' | 'pedido'
  numero: string | number
  cliente?: string
  url: string
  comValores?: boolean
}): string {
  const doc = opts.tipo === 'os' ? 'OS' : 'Pedido'
  const quem = opts.cliente ? ` de ${opts.cliente}` : ''
  if (opts.comValores) {
    return (
      `*${doc} nº ${opts.numero}*${quem} — link com valores\n\n` +
      'Segue o link para conferir os materiais/serviços, as fotos e OS VALORES ' +
      'deste documento (para lançar na sua planilha de custo):\n' +
      opts.url
    )
  }
  return (
    `*${doc} nº ${opts.numero}*${quem}\n\n` +
    'Confira os materiais/serviços e as fotos, baixe as fotos se precisar e ' +
    'ASSINE a confirmação de recebimento direto no link (não precisa de senha):\n' +
    opts.url
  )
}

/**
 * Abre o WhatsApp (app no celular, web no desktop) com a mensagem pronta.
 * Sem telefone cadastrado cai na tela de escolher contato — o texto e o link
 * vão de qualquer forma.
 */
export function abrirWhatsapp(opts: { telefone?: string; mensagem: string }): void {
  const tel = telefoneWhatsapp(opts.telefone)
  const base = tel ? `https://wa.me/${tel}` : 'https://wa.me/'
  window.open(`${base}?text=${encodeURIComponent(opts.mensagem)}`, '_blank')
}

// ---------------- Leitura pública (sem login) ----------------

export interface ItemPublico {
  descricao: string
  quantidade: number
  unidade: string
  tipo: string // rótulo PRODUTO/SERVIÇO — SEM valor nenhum
  /** presentes SÓ na variante com valores (?v=1) */
  preco_unitario?: number
  total?: number
}

export interface FotoPublica {
  nome: string
  caption: string
  url: string
}

export interface DocumentoPublico {
  tipo: 'os' | 'pedido'
  id: string
  numero: number
  status: string
  atualizado_em: string
  cliente: { name: string; document: string; phone: string }
  /** true quando o link é a variante com valores (?v=1) */
  com_valores?: boolean
  itens: ItemPublico[]
  fotos: FotoPublica[]
  /** rótulo do CPF/CNPJ de quem recebeu (só na OS — quote não grava) */
  assinado_doc: string
  assinatura_url: string
  assinado_em: string
  /** RECEBIDO POR — nome digitado pela cliente no link (campo próprio) */
  assinado_por: string
  /** QUEM ENTREGOU — campo do admin, separado do recebedor */
  entregador?: string
  /** total geral — só na variante com valores (?v=1) */
  total?: number
}

function basePublica(): string {
  // a rota pública mora no MESMO PocketBase do app (pb.baseURL)
  return pb.baseURL.replace(/\/$/, '')
}

/** Lê o documento pela rota pública — chamada toda vez que o link abre.
 *
 * `comValores` repassa a variante "Link com valores" (&v=1): sem isso o
 * servidor responde como link normal e a tela abre SEM preço nenhum, mesmo
 * quando o cliente abriu o link com valores.
 */
export async function lerDocumentoPublico(
  tipo: 'os' | 'pedido',
  id: string,
  token: string,
  comValores?: boolean,
): Promise<DocumentoPublico> {
  let url = `${basePublica()}/backend/v1/cliente/${tipo}/${id}?t=${encodeURIComponent(token)}`
  if (comValores) url += '&v=1'
  const res = await fetch(url)
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error((corpo as any)?.error || 'Documento não encontrado.')
  }
  return (await res.json()) as DocumentoPublico
}

/** Envia a assinatura desenhada na tela para gravar no documento. */
export async function assinarDocumentoPublico(opts: {
  tipo: 'os' | 'pedido'
  id: string
  token: string
  nome: string
  documento?: string
  assinaturaDataUrl: string
}): Promise<void> {
  const url = `${basePublica()}/backend/v1/cliente/${opts.tipo}/${opts.id}/assinar`

  // Decodificação AQUI, no navegador: o dataURL do canvas vira arquivo real e
  // vai como multipart/form-data. A JSVM do PocketBase não tem decodificador
  // base64 (o hook quebrava com "Object has no member 'base64Decode'") — o
  // servidor passa a receber o arquivo pronto e só grava.
  //
  // O arquivo TEM que ter nome: um Blob anônimo chega ao hook sem filename no
  // multipart e o PocketBase não consegue gravá-lo ("open : no such file or
  // directory" em produção). Por isso new File(...) com nome fixo em vez de
  // Blob puro.
  const blob = await (await fetch(opts.assinaturaDataUrl)).blob()
  const arquivo = new File([blob], 'assinatura.png', { type: 'image/png' })
  const fd = new FormData()
  fd.append('t', opts.token)
  fd.append('nome', opts.nome)
  fd.append('documento', opts.documento || '')
  fd.append('assinatura', arquivo, 'assinatura.png')

  const res = await fetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error((corpo as any)?.error || 'Não foi possível gravar a assinatura.')
  }
}
