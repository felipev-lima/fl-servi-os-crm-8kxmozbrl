/**
 * Grava a localização (GPS) dentro do arquivo da foto.
 *
 * As fotos tiradas pelo navegador do celular chegam SEM GPS — o iOS e o
 * Android removem os metadados por privacidade. Então, quando o técnico está
 * no local do atendimento, capturamos a posição pelo GPS do aparelho e
 * escrevemos nas coordenadas EXIF da imagem, do mesmo jeito que a câmera
 * nativa faria.
 *
 * Resultado: a foto baixada (galeria, Arquivos, WhatsApp como documento) leva
 * a localização junto e abre no mapa em qualquer aparelho.
 */

/** Converte grau decimal para o formato EXIF (graus, minutos, segundos). */
function paraGrauMinutoSegundo(valor: number): [number[], number[], number[]] {
  const abs = Math.abs(valor)
  const graus = Math.floor(abs)
  const minutosDec = (abs - graus) * 60
  const minutos = Math.floor(minutosDec)
  const segundos = (minutosDec - minutos) * 60
  return [
    [graus, 1],
    [minutos, 1],
    [Math.round(segundos * 100), 100],
  ]
}

/**
 * Devolve uma nova imagem (File) com latitude e longitude gravadas no EXIF.
 * Se algo falhar, devolve o arquivo original — nunca impede o envio.
 */
export async function gravarGpsNaFoto(arquivo: File, lat: number, lng: number): Promise<File> {
  if (!arquivo || !isFinite(lat) || !isFinite(lng)) return arquivo
  try {
    const piexif = (await import('piexifjs')).default as any
    const buffer = await arquivo.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // O piexifjs trabalha com STRING BINÁRIA (um caractere por byte), NÃO com
    // base64. Passar base64 aqui fazia ele responder "Given data is not jpeg"
    // e o GPS nunca era gravado.
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])

    const gps: Record<number, unknown> = {
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
      [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? 'S' : 'N',
      [piexif.GPSIFD.GPSLatitude]: paraGrauMinutoSegundo(lat),
      [piexif.GPSIFD.GPSLongitudeRef]: lng < 0 ? 'W' : 'E',
      [piexif.GPSIFD.GPSLongitude]: paraGrauMinutoSegundo(lng),
    }

    // preserva o que já existir (data, câmera) e só acrescenta o GPS
    let existente: any = {}
    try {
      existente = piexif.load(bin) || {}
    } catch (_) {
      existente = { '0th': {}, Exif: {}, GPS: {} }
    }
    const novoExif = {
      '0th': existente['0th'] || {},
      Exif: existente['Exif'] || {},
      GPS: gps,
      '1st': existente['1st'] || {},
      thumbnail: existente.thumbnail || null,
    }

    const bytesExif = piexif.dump(novoExif)
    // insert devolve string binária; só no fim viramos bytes
    const comGps = piexif.insert(bytesExif, bin)
    const novoArray = new Uint8Array(comGps.length)
    for (let i = 0; i < comGps.length; i++) novoArray[i] = comGps.charCodeAt(i)

    return new File([novoArray], arquivo.name, {
      type: arquivo.type || 'image/jpeg',
      lastModified: arquivo.lastModified,
    })
  } catch (err) {
    console.warn('Não foi possível gravar o GPS na foto', err)
    return arquivo
  }
}

export type ResultadoPosicao =
  | { ok: true; lat: number; lng: number }
  | { ok: false; motivo: 'sem_suporte' | 'negada' | 'tempo' | 'erro' }

/**
 * Pega a posição atual do aparelho.
 *
 * Devolve o MOTIVO quando falha, para o app poder avisar o técnico em vez de
 * simplesmente salvar a foto sem localização e ninguém ficar sabendo.
 */
export function pegarPosicao(): Promise<ResultadoPosicao> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, motivo: 'sem_suporte' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err && err.code === 1) resolve({ ok: false, motivo: 'negada' })
        else if (err && err.code === 3) resolve({ ok: false, motivo: 'tempo' })
        else resolve({ ok: false, motivo: 'erro' })
      },
      // 8s: se o GPS não responder rápido, seguimos sem ele em vez de deixar
      // o técnico esperando na frente do cliente
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  })
}
