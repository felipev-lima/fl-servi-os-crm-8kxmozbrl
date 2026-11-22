/**
 * Escritor de ZIP mínimo (método "store", sem compressão).
 *
 * Por que sem biblioteca: as fotos já são JPEG (comprimidas), então guardar
 * como estão gera um .zip válido, do mesmo tamanho, que abre em qualquer
 * aparelho e no OneDrive/Google Drive.
 *
 * Formato: cabeçalho local + dados por arquivo, diretório central e EOCD.
 * Nomes em UTF-8 (flag 0x0800) para os acentos não quebrarem.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Data/hora no formato MS-DOS usado pelo ZIP. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f)
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f)
  return { time, date }
}

/**
 * Deixa o nome seguro para arquivo/pasta: sem acento, sem caractere proibido.
 * Mantém maiúsculas — o padrão da LM SERVIÇOS.
 */
export function safeName(input: string, fallback = 'ARQUIVO'): string {
  const limpo = (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo.length > 0 ? limpo : fallback
}

export interface ZipEntry {
  /** Caminho dentro do zip, com barras. Ex: "2026-11/OS 1002/foto-1.jpeg" */
  name: string
  data: Blob | Uint8Array
}

const enc = new TextEncoder()

async function toBytes(data: Blob | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  const buf = await data.arrayBuffer()
  return new Uint8Array(buf)
}

/** Monta o .zip e devolve como Blob para download. */
export async function createZip(entries: ZipEntry[], when = new Date()): Promise<Blob> {
  const { time, date } = dosDateTime(when)
  const locais: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nome = enc.encode(entry.name)
    const dados = await toBytes(entry.data)
    const crc = crc32(dados)

    // Cabeçalho local (30 bytes + nome)
    const local = new Uint8Array(30 + nome.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // assinatura
    lv.setUint16(4, 20, true) // versão necessária
    lv.setUint16(6, 0x0800, true) // flag: nome em UTF-8
    lv.setUint16(8, 0, true) // método: store
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, dados.length, true) // comprimido
    lv.setUint32(22, dados.length, true) // original
    lv.setUint16(26, nome.length, true)
    lv.setUint16(28, 0, true) // extra
    local.set(nome, 30)

    locais.push(local, dados)

    // Entrada do diretório central (46 bytes + nome)
    const central = new Uint8Array(46 + nome.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // versão que criou
    cv.setUint16(6, 20, true) // versão necessária
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, dados.length, true)
    cv.setUint32(24, dados.length, true)
    cv.setUint16(28, nome.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comentário
    cv.setUint16(34, 0, true) // disco
    cv.setUint16(36, 0, true) // atributos internos
    cv.setUint32(38, 0, true) // atributos externos
    cv.setUint32(42, offset, true) // posição do cabeçalho local
    central.set(nome, 46)

    centrais.push(central)
    offset += local.length + dados.length
  }

  const cdSize = centrais.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  // TS 5.7+: Uint8Array passou a ser genérico (ArrayBufferLike) e o BlobPart
  // só aceita buffer "puro" (ArrayBuffer). A cópia para um ArrayBuffer novo
  // garante o tipo sem mudar nada do conteúdo.
  const partes: ArrayBuffer[] = []
  for (const parte of [...locais, ...centrais, eocd]) {
    const copia = new ArrayBuffer(parte.length)
    new Uint8Array(copia).set(parte)
    partes.push(copia)
  }
  return new Blob(partes, { type: 'application/zip' })
}

/** Dispara o download de um Blob com o nome indicado. */
export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
