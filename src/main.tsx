import { ICONE_FL } from './lib/icone'

/**
 * Icone do atalho na tela inicial do iPhone.
 *
 * O iOS NAO aceita SVG como `apple-touch-icon` — so PNG. O icone FL vai
 * embutido em base64 (src/lib/icone.ts) e e injetado no <head> aqui, antes da
 * renderizacao. O iPhone le esse icone no momento em que o usuario toca em
 * "Adicionar a Tela de Inicio".
 */
try {
  document
    .querySelectorAll('link[rel="apple-touch-icon"]')
    .forEach((el) => el.parentNode?.removeChild(el))

  const link = document.createElement('link')
  link.rel = 'apple-touch-icon'
  link.setAttribute('sizes', '180x180')
  link.href = ICONE_FL
  document.head.appendChild(link)
} catch (_) {
  // sem icone o app continua funcionando normalmente
}

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(<App />)
