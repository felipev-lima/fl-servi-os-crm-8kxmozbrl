/**
 * Busca sem acento e sem diferenciar maiúscula.
 *
 * O filtro do PocketBase não ignora acento (buscar "camera" não acha
 * "CÂMERA"), então a normalização é feita aqui, no navegador. Toda busca
 * do CRM passa por `semAcento` dos dois lados (termo e alvo).
 */
export function semAcento(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Todas as palavras do termo precisam aparecer em algum campo do alvo.
 * Digitar "escola parque" acha "ESCOLA PARQUE"; "muzzi" acha "ESCOLA LUCIANA"
 * se o apelido/razão social tiver Muzzi em outro campo.
 */
export function casaTermo(termo: string, ...campos: (string | null | undefined)[]): boolean {
  const palavras = semAcento(termo.trim()).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return true
  const alvo = semAcento(campos.filter(Boolean).join(' '))
  return palavras.every((p) => alvo.includes(p))
}
