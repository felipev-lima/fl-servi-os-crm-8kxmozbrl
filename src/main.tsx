import { ICONE_FL } from './lib/icone'

/**
 * ÍCONE DO ATALHO — USA A ARTE OFICIAL, SEM ALTERAÇÃO.
 *
 * O Felipe mandou a arte nova da F. L. SERVIÇOS (engrenagens + "F.L.SERVIÇOS")
 * e pediu SEM MODIFICAÇÕES. Então o ícone não é mais um PNG redesenhado e
 * embutido no código: ele aponta para o arquivo ORIGINAL que está em
 * Configurações → Logomarca.
 *
 * Vantagens:
 *  - a arte do atalho nunca mais fica diferente da arte do app/PDF;
 *  - se ele trocar a logo em Configurações, o atalho acompanha;
 *  - nada é recortado, redimensionado ou re-exportado.
 *
 * O iPhone exige PNG no `apple-touch-icon` (não aceita SVG) e redimensiona a
 * imagem sozinho ao criar o atalho, por isso mandar o arquivo grande funciona.
 *
 * Se a leitura das configurações falhar, cai no ícone embutido para o atalho
 * nunca ficar sem imagem.
 */
const BASE = import.meta.env.VITE_POCKETBASE_URL as string

async function aplicarIconeOficial() {
  // remove os placeholders do index.html
  document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"]').forEach((el) => {
    if (el.getAttribute('href') === 'ICONE_FL_180') el.parentNode?.removeChild(el)
  })

  let href = ICONE_FL

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
    /* mantém o ícone embutido */
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
