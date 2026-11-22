/**
 * ZIP + compartilhar as fotos de um documento (Pedido e Orçamento).
 *
 * É o MESMO recurso já existente na OS (WorkOrderDetail): baixar todas as
 * fotos num único .zip e compartilhar (WhatsApp/e-mail) quando o aparelho
 * permite. Reunido aqui para Pedido e Orçamento usarem o mesmo código, sem
 * duplicar ~150 linhas.
 *
 * Regras do projeto: nada é apagado — aqui só se LÊ as fotos e se monta um
 * arquivo novo em memória. O PDF do documento não muda.
 */
import { createZip, baixarBlob, safeName, type ZipEntry } from './zip'

export interface FotoParaZip {
  /** Nome do arquivo gravado no servidor (para a extensão do zip) */
  nome: string
  /** URL completa do arquivo (getFileUrl) */
  url: string
}

/** Nome do arquivo dentro do zip: foto-01.jpg, foto-02.jpeg... */
export function nomeArquivoFoto(prefixo: string, indice: number, nome?: string): string {
  const ext = nome && nome.includes('.') && nome.split('.').pop() ? nome.split('.').pop() : 'jpg'
  return `${prefixo}-${String(indice).padStart(2, '0')}.${ext}`
}

/**
 * Baixa cada foto do servidor e monta as entradas do zip.
 * Uma foto com problema (rede, 404) NÃO aborta o pacote: segue com as outras.
 */
async function montarEntradas(fotos: FotoParaZip[], pasta: string): Promise<ZipEntry[]> {
  const entradas: ZipEntry[] = []
  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i]
    if (!foto.url) continue
    try {
      const res = await fetch(foto.url)
      if (!res.ok) continue
      const blob = await res.blob()
      entradas.push({
        name: `${safeName(pasta, 'FOTOS')}/${nomeArquivoFoto('foto', i + 1, foto.nome)}`,
        data: blob,
      })
    } catch {
      /* foto com problema: segue com as outras */
    }
  }
  return entradas
}

/**
 * Baixa as fotos num .zip único. Devolve quantas fotos entraram no pacote
 * (0 = nada para baixar).
 */
export async function baixarFotosZip(opts: {
  fotos: FotoParaZip[]
  /** nome do arquivo .zip, sem a extensão */
  nomeArquivo: string
  /** pasta dentro do zip */
  pasta: string
}): Promise<number> {
  const entradas = await montarEntradas(opts.fotos, opts.pasta)
  if (entradas.length === 0) return 0
  const blob = await createZip(entradas)
  baixarBlob(blob, `${safeName(opts.nomeArquivo, 'fotos')}.zip`)
  return entradas.length
}

export type ResultadoCompartilho = 'compartilhado' | 'baixado' | 'vazio'

/**
 * Compartilha o .zip das fotos pelo compartilhador do aparelho
 * (WhatsApp, e-mail...). Onde não há compartilhamento de arquivos
 * (desktop sem suporte), cai no download normal.
 */
export async function compartilharFotosZip(opts: {
  fotos: FotoParaZip[]
  nomeArquivo: string
  pasta: string
  titulo: string
  texto?: string
}): Promise<ResultadoCompartilho> {
  const entradas = await montarEntradas(opts.fotos, opts.pasta)
  if (entradas.length === 0) return 'vazio'
  const blob = await createZip(entradas)
  const nome = `${safeName(opts.nomeArquivo, 'fotos')}.zip`
  try {
    const arquivo = new File([blob], nome, { type: 'application/zip' })
    const pode = (navigator as any).canShare?.({ files: [arquivo] })
    if (navigator.share && pode) {
      await navigator.share({
        files: [arquivo],
        title: opts.titulo,
        text: opts.texto || '',
      })
      return 'compartilhado'
    }
  } catch (e: any) {
    // usuário fechou a janela de compartilhamento: não é erro
    if (e?.name === 'AbortError') return 'compartilhado'
  }
  baixarBlob(blob, nome)
  return 'baixado'
}
