/**
 * Localização do cliente — endereço e botão que abre o mapa.
 *
 * O problema que resolve: o entregador/técnico chega na OS sabendo o nome da
 * escola, mas não o endereço. Ou tem o endereço e não sabe onde é. Este módulo
 * monta uma linha de endereço completa e um link que abre o Google Maps já
 * apontando para o destino (ou para a rota, saindo de onde a pessoa está).
 *
 * Ordem de precisão, do melhor para o pior:
 *   1. coordenadas GPS salvas no cadastro  -> abre no ponto exato
 *   2. endereço + cidade + CEP             -> abre na busca do Maps
 *   3. só o CEP                            -> abre pelo CEP
 *
 * Nunca inventa dado: campo vazio simplesmente não entra na string.
 */

export interface EnderecoCliente {
  address?: string
  neighborhood?: string
  city?: string
  zip?: string
  /** preenchidos se algum dia o cadastro tiver coordenada */
  lat?: number | null
  lng?: number | null
}

/** CEP no formato 00000-000, quando dá para reconhecer */
export function formatarCep(cep?: string): string {
  const d = (cep || '').replace(/\D/g, '')
  if (d.length !== 8) return (cep || '').trim()
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/**
 * Uma linha legível com o endereço completo, sem repetir informação.
 * Ex.: "RUA X, 123 — CENTRO — MACAÉ/RJ — 27900-000"
 */
export function enderecoCompleto(c?: EnderecoCliente | null): string {
  if (!c) return ''
  const partes: string[] = []
  const rua = (c.address || '').trim()
  if (rua) partes.push(rua)
  const bairro = (c.neighborhood || '').trim()
  if (bairro) partes.push(bairro)
  const cidade = (c.city || '').trim()
  if (cidade) partes.push(cidade.toUpperCase().includes('/') ? cidade : `${cidade}/RJ`)
  const cep = formatarCep(c.zip)
  if (cep) partes.push(`CEP ${cep}`)
  return partes.join(' — ')
}

/** true quando há alguma coisa útil para localizar */
export function temEndereco(c?: EnderecoCliente | null): boolean {
  if (!c) return false
  return !!(c.address?.trim() || c.zip?.replace(/\D/g, '') || (c.lat && c.lng))
}

/** Linha única para a URL, sem acento e sem pontuação que quebra a busca */
function paraBusca(c: EnderecoCliente): string {
  const partes = [
    c.address,
    c.neighborhood,
    c.city,
    c.zip ? formatarCep(c.zip) : '',
    c.city ? 'Brasil' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return partes
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Link do Google Maps apontando para o endereço.
 *
 * `rota = true` pede o trajeto a partir de onde a pessoa está — é o que o
 * entregador precisa. `rota = false` só mostra o ponto no mapa.
 */
export function linkMapa(c?: EnderecoCliente | null, rota = true): string {
  if (!c) return ''
  if (c.lat && c.lng) {
    return rota
      ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
  }
  const q = paraBusca(c)
  if (!q) return ''
  const alvo = encodeURIComponent(q)
  return rota
    ? `https://www.google.com/maps/dir/?api=1&destination=${alvo}`
    : `https://www.google.com/maps/search/?api=1&query=${alvo}`
}
