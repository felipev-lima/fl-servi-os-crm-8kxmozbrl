/**
 * Prepara a foto antes de enviar para a OS.
 *
 * Três problemas reais que isto resolve:
 *
 * 1) O navegador NÃO consegue decodificar HEIC/HEIF — o formato nativo da
 *    câmera do iPhone. Ao escolher uma foto da galeria no computador, nada
 *    acontecia (a miniatura quebrava e o envio falhava). Aqui o HEIC é
 *    CONVERTIDO para JPEG antes de qualquer coisa, com heic2any.
 *
 * 2) Foto de celular tem 12–17 MB e o servidor recusa com
 *    "413 Request Entity Too Large" (o nginx corta antes de chegar no banco).
 *    Por isso a imagem é redesenhada com o lado maior em 1920 px e JPEG 85%,
 *    ficando entre 200 e 500 KB.
 *
 * 3) O EXIF (com o GPS) é perdido no canvas — o GPS é regravado depois,
 *    em gpsFoto.ts.
 */
export interface ResultadoPreparo {
  arquivo: File
  /** true quando a imagem foi reduzida */
  reduzida: boolean
  /** true quando o HEIC foi convertido para JPEG */
  convertida: boolean
  tamanhoOriginalMB: number
  tamanhoFinalMB: number
}

const LADO_MAX = 1920
const QUALIDADE = 0.85
/** Acima disto sempre recomprime. O servidor recusa bem antes de 17 MB. */
const LIMITE_SEGURO = 900 * 1024
/** Acima disto, reduz mais o lado para caber com folga. */
const LIMITE_GRANDE = 6 * 1024 * 1024

/**
 * Detecta HEIC de verdade, olhando os BYTES do arquivo.
 *
 * O app Fotos do MacBook entrega as fotos do iPhone com nome ".JPG" e tipo
 * "image/jpeg", mas o conteúdo é HEIC — o navegador não consegue ler e o envio
 * falhava sem explicação. Pela extensão não dá para saber; é preciso ler a
 * assinatura do arquivo: bytes 4..12 trazem "ftyp" + a marca (heic/heif/mif1).
 */
async function ehHeicReal(arquivo: File): Promise<boolean> {
  // 1) pistas rápidas
  if (/heic|heif/i.test(arquivo.type || '')) return true
  if (/\.(heic|heif)$/i.test(arquivo.name || '')) return true

  // 2) o que decide: a assinatura binária
  try {
    const cabeca = new Uint8Array(await arquivo.slice(0, 16).arrayBuffer())
    // "ftyp" nos bytes 4..8
    const marca = String.fromCharCode(...cabeca.slice(4, 12))
    if (marca.startsWith('ftyp')) {
      const brand = marca.slice(4).toLowerCase()
      if (
        brand === 'heic' ||
        brand === 'heix' ||
        brand === 'hevc' ||
        brand === 'heim' ||
        brand === 'heis' ||
        brand === 'hevm' ||
        brand === 'hevs' ||
        brand === 'mif1' ||
        brand === 'msf1'
      ) {
        return true
      }
    }
  } catch (_) {
    /* não deu para ler a cabeça: segue o que a extensão diz */
  }
  return false
}

export async function prepararFoto(
  arquivo: File,
  /** Avisa cada etapa, para o app mostrar na tela onde está */
  onEtapa?: (texto: string) => void,
): Promise<ResultadoPreparo> {
  const aviso = (t: string) => onEtapa?.(t)
  const originalMB = arquivo.size / 1048576
  let atual = arquivo
  let convertida = false

  // ---- 1) HEIC/HEIF -> JPEG
  // Olha os BYTES: o app Fotos do Mac entrega HEIC com nome .JPG, e pela
  // extensão isso passava batido (era a causa da foto que "não salvava").
  aviso('Verificando o tipo do arquivo...')
  const veioHeic = await ehHeicReal(arquivo)
  if (veioHeic) {
    aviso('É HEIC do iPhone — convertendo (pode levar até 1 minuto)...')
    // 1º caminho, PREFERIDO: decodificação NATIVA do sistema.
    // No macOS o Chrome/Safari decodificam HEIC pelo próprio sistema — é
    // instantâneo e não pesa na memória, ao contrário do conversor em
    // WebAssembly (que travava com arquivos de 16 MB).
    try {
      const bmp = await criarBitmap(arquivo)
      const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
      const larg = Math.round(bmp.width * escala)
      const alt = Math.round(bmp.height * escala)
      const cv = document.createElement('canvas')
      cv.width = larg
      cv.height = alt
      const cx = cv.getContext('2d')
      if (!cx) throw new Error('sem canvas')
      cx.drawImage(bmp as any, 0, 0, larg, alt)
      if ((bmp as any).close) (bmp as any).close()
      const blobNativo: Blob | null = await new Promise((res) =>
        cv.toBlob((b) => res(b), 'image/jpeg', QUALIDADE),
      )
      if (blobNativo && blobNativo.size > 0) {
        const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
        return {
          arquivo: new File([blobNativo], nome, { type: 'image/jpeg', lastModified: Date.now() }),
          reduzida: true,
          convertida: true,
          tamanhoOriginalMB: originalMB,
          tamanhoFinalMB: blobNativo.size / 1048576,
        }
      }
    } catch (errNativo) {
      console.warn('HEIC: decodificação nativa não disponível, usando o conversor', errNativo)
    }

    // 2º caminho: conversor em WebAssembly.
    // `heic-to` usa libheif atual (1.23), muito mais rápido e estável que o
    // `heic2any` antigo, que TRAVAVA com HEIC de 16 MB do iPhone.
    aviso('Convertendo a foto do iPhone (aguarde)...')
    // 20s: se o conversor não terminar, seguimos para o próximo caminho em vez
    // de deixar a tela parada. Os conversores em WebAssembly às vezes travam
    // sem erro — e o técnico não pode ficar esperando na frente do cliente.
    try {
      const { heicTo } = (await import('heic-to')) as any
      const blob: Blob = await Promise.race([
        heicTo({ blob: arquivo, type: 'image/jpeg', quality: 0.85 }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('conversão demorou demais')), 20000),
        ),
      ])
      if (blob && blob.size > 0) {
        const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
        atual = new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() })
        convertida = true
      }
    } catch (err) {
      console.warn('Não foi possível converter o HEIC com heic-to', err)
      // 3ª tentativa: conversor antigo, caso o novo falhe
      try {
        aviso('Tentando o segundo conversor...')
        const mod = (await import('heic2any')).default as any
        const saida = await Promise.race([
          mod({ blob: arquivo, toType: 'image/jpeg', quality: 0.8, multiple: false }),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('conversão demorou demais')), 20000),
          ),
        ])
        const blob: Blob = Array.isArray(saida) ? saida[0] : (saida as Blob)
        if (blob && blob.size > 0) {
          const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
          atual = new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() })
          convertida = true
        }
      } catch (err2: any) {
        console.warn('Conversores HEIC falharam', err2)
        aviso(`Conversor indisponível aqui (${err2?.message?.slice(0, 40) || 'erro'}).`)
      }
    }

    // ÚLTIMO RECURSO: manda o HEIC ORIGINAL. O servidor aceita (campo até
    // 25 MB e o tipo image/heic foi liberado na migration 0020). Melhor a
    // evidência chegar em HEIC do que o técnico ficar sem foto no laudo —
    // e no iPhone/celular do cliente ela abre normalmente.
    if (!convertida) {
      aviso('Não deu para converter aqui — enviando a foto original do iPhone.')
      // O Mac entrega o HEIC com nome ".JPG" e tipo "image/jpeg". Se enviarmos
      // assim, o servidor confere o conteúdo, vê que é HEIC e recusa com
      // "Something went wrong". Aqui o tipo é corrigido para bater com o
      // conteúdo real e o arquivo ganha extensão .heic.
      const nomeHeic = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.heic'
      const heicCorreto = new File([arquivo], nomeHeic, {
        type: 'image/heic',
        lastModified: Date.now(),
      })
      return {
        arquivo: heicCorreto,
        reduzida: false,
        convertida: false,
        tamanhoOriginalMB: originalMB,
        tamanhoFinalMB: arquivo.size / 1048576,
      }
    }
  }

  // Já está leve e em formato que o navegador lê: não mexe na qualidade
  if (atual.size <= LIMITE_SEGURO && !convertida) {
    aviso('Foto já está no tamanho certo.')
    const mb = atual.size / 1048576
    return {
      arquivo: atual,
      reduzida: false,
      convertida,
      tamanhoOriginalMB: originalMB,
      tamanhoFinalMB: mb,
    }
  }

  // ---- 2) reduz para 1920 px (ou menos, se o arquivo for muito grande)
  try {
    aviso(`Reduzindo a foto (${originalMB.toFixed(1)} MB)...`)
    const bitmap = await criarBitmap(atual)
    aviso(`Foto aberta: ${bitmap.width}x${bitmap.height}. Redimensionando...`)
    const maiorLado = Math.max(bitmap.width, bitmap.height)
    // arquivo enorme: limita mais para caber com folga
    const alvo = atual.size > LIMITE_GRANDE ? 1600 : LADO_MAX
    const escala = Math.min(1, alvo / maiorLado)
    const larg = Math.round(bitmap.width * escala)
    const alt = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = larg
    canvas.height = alt
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sem canvas')
    ctx.drawImage(bitmap as any, 0, 0, larg, alt)
    if ((bitmap as any).close) (bitmap as any).close()

    let blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', QUALIDADE),
    )
    // segunda tentativa, mais apertada, se ainda passar de 1,5 MB
    if (blob && blob.size > 1536 * 1024) {
      const menor = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.7),
      )
      if (menor) blob = menor
    }
    if (!blob) throw new Error('toBlob falhou')

    const nome = (atual.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
    const novo = new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() })
    return {
      arquivo: novo,
      reduzida: true,
      convertida,
      tamanhoOriginalMB: originalMB,
      tamanhoFinalMB: novo.size / 1048576,
    }
  } catch (err) {
    console.warn('Não foi possível reduzir a imagem', err)
    const mb = atual.size / 1048576
    return {
      arquivo: atual,
      reduzida: false,
      convertida,
      tamanhoOriginalMB: originalMB,
      tamanhoFinalMB: mb,
    }
  }
}

/** Lê a imagem em um ImageBitmap (ou Image, em navegador antigo). */
async function criarBitmap(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(arquivo)
    } catch (_) {
      /* formato estranho: cai para o <img> */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('imagem inválida'))
    }
    img.src = url
  })
}
