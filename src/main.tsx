import './print.css'

import { iconLMDataUri } from './lib/icone'

/**
 * ÍCONE DO ATALHO — AZUL DA LM.
 *
 * O ícone do app na tela do celular/computador usa a ARTE AZUL da
 * LM SERVIÇOS ("LM" branco sobre o azul #0B3D91, mesma arte do
 * /icon.svg). Se as Configurações tiverem uma logomarca enviada,
 * ela é usada no lugar — para a arte do atalho nunca ficar
 * diferente da arte do app/PDF.
 *
 * O iPhone exige PNG no `apple-touch-icon` (não aceita SVG) e
 * redimensiona a imagem sozinho ao criar o atalho, por isso o
 * fallback é gerado como PNG 180x180 no próprio navegador.
 *
 * Se a leitura das configurações falhar, cai no ícone azul embutido
 * para o atalho nunca ficar sem imagem.
 */
const BASE = import.meta.env.VITE_POCKETBASE_URL as string

async function aplicarIconeOficial() {
  // remove os placeholders do index.html
  document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"]').forEach((el) => {
    if (el.getAttribute('href') === 'ICONE_FL_180') el.parentNode?.removeChild(el)
  })

  let href = iconLMDataUri()

  try {
    const r = await fetch(`${BASE}/api/collections/settings/records?perPage=1&fields=id,logo`)
    if (r.ok) {
      const d = await r.json()
      const rec = d?.items?.[0]
      if (rec?.logo && rec?.id) {
        href = `${BASE}/api/files/settings/${rec.id}/${rec.logo}`
      }
    }
  } catch (_) {
    /* mantém o ícone azul embutido */
  }

  const link = document.createElement('link')
  link.rel = 'apple-touch-icon'
  link.setAttribute('sizes', '180x180')
  link.href = href
  document.head.appendChild(link)

  const ico = document.createElement('link')
  ico.rel = 'icon'
  ico.type = 'image/png'
  ico.href = href
  document.head.appendChild(ico)
}

void aplicarIconeOficial()

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(<App />)
