/**
 * Texto em caixa alta — padrão da FL SERVIÇOS.
 *
 * Todo cadastro entra em MAIÚSCULA, independente de como foi digitado (o
 * teclado do celular pode estar em minúscula ou com corretor). Aqui ficam as
 * duas pontas:
 *  - `uc()` para gravar o valor em maiúscula;
 *  - `CAMPO_ALTO` a classe que já mostra a caixa alta enquanto digita.
 */

/** Converte para MAIÚSCULA preservando acentos. */
export function uc(valor: string | null | undefined): string {
  return (valor || '').toLocaleUpperCase('pt-BR')
}

/** Classe dos inputs que devem aparecer em caixa alta. */
export const CAMPO_ALTO = 'uppercase placeholder:normal-case'

/** Números de documento: mantém pontuação, sem letras. */
export function ucDoc(valor: string | null | undefined): string {
  return uc(valor).replace(/[^0-9A-Z.\-/ ]/g, '')
}
