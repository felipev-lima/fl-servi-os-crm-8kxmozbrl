import PocketBase from 'pocketbase'

/**
 * Cliente do PocketBase com TEMPO LIMITE em toda requisição.
 *
 * O PROBLEMA: o backend desta instância oscila. A mesma consulta responde em
 * 0,0s numa chamada e passa de 40s na seguinte — sem erro, sem padrão. Com o
 * `autoCancellation(false)` que existia aqui, a requisição ficava pendurada
 * indefinidamente e a tela toda esperava por ela: o app ficava preso em
 * "Carregando..." mesmo com todo o resto pronto.
 *
 * A CORREÇÃO: cada chamada ganha um teto de tempo. Estourou, ela falha RÁPIDO
 * e a tela segue com o que já tem — melhor um painel com um número a menos do
 * que uma tela em branco esperando para sempre.
 *
 * 12 segundos é folgado: medido no dia a dia, cada consulta boa leva menos de
 * 1s. O teto só corta o caso patológico.
 */
const SEGUNDOS_LIMITE = 12

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
// mantém o auto-cancel desligado (o padrão do PocketBase cancela chamadas
// repetidas) e aplica o teto de tempo por baixo
pb.autoCancellation(false)

const original = pb.send.bind(pb)
;(pb as any).send = (path: string, options: any = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEGUNDOS_LIMITE * 1000)
  return original(path, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  )
}

export default pb
