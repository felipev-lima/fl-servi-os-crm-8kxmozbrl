// Ícone do atalho (apple-touch-icon) da LM SERVIÇOS — azul da marca.
//
// O iPhone exige PNG no atalho (não aceita SVG). O quadradinho desenha
// "LM" branco sobre o azul da LM (#0B3D91) com o traço branco embaixo,
// mesma arte do /icon.svg. É desenhado num <canvas> e convertido para
// PNG 180x180 na hora do carregamento — nenhum arquivo verde antigo
// sobra no app.
export const AZUL_LM = '#0B3D91'

const TAMANHO = 180

/** Desenha o ícone LM (azul + "LM" branco) e devolve um data-URI PNG. */
export function iconLMDataUri(): string {
  const canvas = document.createElement('canvas')
  canvas.width = TAMANHO
  canvas.height = TAMANHO
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // fundo azul
  ctx.fillStyle = AZUL_LM
  ctx.fillRect(0, 0, TAMANHO, TAMANHO)

  // "LM" branco, centralizado
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `bold ${Math.round(TAMANHO * 0.42)}px Helvetica, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('LM', TAMANHO / 2, TAMANHO / 2 - TAMANHO * 0.04)

  // traço branco embaixo, como no icon.svg
  const barraH = Math.max(2, Math.round(TAMANHO * 0.033))
  const barraW = Math.round(TAMANHO * 0.29)
  ctx.fillRect(TAMANHO / 2 - barraW / 2, Math.round(TAMANHO * 0.7), barraW, barraH)

  return canvas.toDataURL('image/png')
}
