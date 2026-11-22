/**
 * Seletor de modo de visualização das listagens (pedido do Felipe).
 *
 * Todas as telas de listagem ganham um atalho com 3 modos:
 *   LISTA    — linhas completas, com subtítulo e detalhe;
 *   COMPACTA — linhas densas, só o essencial (mais registros por tela no celular);
 *   CARTÕES  — o formato que cada tela já tinha.
 *
 * A escolha fica gravada por tela no localStorage (`lm-visao:<chave>`), então
 * ao voltar a tela abre no modo que o usuário deixou.
 *
 * A troca de modo é só RENDERIZAÇÃO: nenhum registro é lido, alterado ou
 * apagado por causa dela.
 */
import { Fragment, useCallback, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlignJustify, LayoutGrid, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'lista' | 'compacta' | 'cartoes'

const PREFIXO = 'lm-visao:'

/** Preferência de visualização por tela, persistida no localStorage. */
export function useViewMode(chave: string): [ViewMode, (m: ViewMode) => void] {
  const [modo, setModo] = useState<ViewMode>(() => {
    try {
      const salvo = localStorage.getItem(PREFIXO + chave)
      return salvo === 'lista' || salvo === 'compacta' ? salvo : 'cartoes'
    } catch {
      return 'cartoes'
    }
  })

  const escolher = useCallback(
    (m: ViewMode) => {
      setModo(m)
      try {
        localStorage.setItem(PREFIXO + chave, m)
      } catch {
        /* sem storage (modo privado): segue só na memória */
      }
    },
    [chave],
  )

  return [modo, escolher]
}

const MODOS: { valor: ViewMode; rotulo: string; Icone: typeof AlignJustify }[] = [
  { valor: 'lista', rotulo: 'Lista', Icone: AlignJustify },
  { valor: 'compacta', rotulo: 'Compacta', Icone: Rows3 },
  { valor: 'cartoes', rotulo: 'Cartões', Icone: LayoutGrid },
]

/**
 * O atalho em si: grupo segmentado com ícones.
 * Botões de 36px de altura (área de toque confortável no celular); no desktop
 * o nome do modo aparece ao lado do ícone, no celular só o ícone.
 */
export function ViewModeSelector({
  valor,
  onChange,
  className,
}: {
  valor: ViewMode
  onChange: (m: ViewMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Modo de visualização"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm',
        className,
      )}
    >
      {MODOS.map(({ valor: m, rotulo, Icone }) => (
        <button
          key={m}
          type="button"
          aria-pressed={valor === m}
          title={`Visualizar em ${rotulo.toLowerCase()}`}
          onClick={() => onChange(m)}
          className={cn(
            'flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors',
            valor === m
              ? 'bg-[#0B3D91] text-white'
              : 'text-muted-foreground hover:bg-[#0B3D91]/10 hover:text-[#0B3D91]',
          )}
        >
          <Icone className="h-4 w-4" />
          <span className="hidden sm:inline">{rotulo}</span>
        </button>
      ))}
    </div>
  )
}

/** Os dados de uma linha, extraídos do registro por cada tela. */
export interface LinhaVisao {
  titulo: string
  subtitulo?: string
  detalhe?: string
  badge?: string
  badgeClasse?: string
  valor?: string
  /** verde é exclusivo do DINHEIRO (pagamento recebido) */
  valorVerde?: boolean
  /** link interno da tela — a linha inteira abre o registro */
  href?: string
  /** ações da linha (editar/apagar) — ficam à direita, fora do link */
  extras?: ReactNode
}

/**
 * Renderiza a lista no modo escolhido.
 *
 * `cartoes` é o JSX que a tela já tinha (um nó por item); `linhaDe` descreve
 * cada registro para os modos LISTA e COMPACTA. O vazio é compartilhado.
 */
export function ListagemModos<T>({
  modo,
  itens,
  chaveItem,
  cartoes,
  linhaDe,
  vazio,
}: {
  modo: ViewMode
  itens: T[]
  chaveItem: (item: T, indice: number) => string
  cartoes: (item: T) => ReactNode
  linhaDe: (item: T) => LinhaVisao
  vazio?: ReactNode
}) {
  if (itens.length === 0) return <>{vazio ?? null}</>
  if (modo === 'cartoes') {
    return (
      <>
        {itens.map((item, i) => (
          <Fragment key={chaveItem(item, i)}>{cartoes(item)}</Fragment>
        ))}
      </>
    )
  }

  const compacta = modo === 'compacta'

  const badge = (l: LinhaVisao) =>
    l.badge ? (
      <span
        className={cn(
          'shrink-0 whitespace-nowrap rounded border px-1 py-0 font-bold uppercase',
          compacta ? 'text-[7px]' : 'text-[8px]',
          l.badgeClasse,
        )}
      >
        {l.badge}
      </span>
    ) : null

  const valor = (l: LinhaVisao) =>
    l.valor ? (
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-right font-mono font-bold',
          compacta ? 'text-[10px]' : 'text-xs',
          l.valorVerde ? 'text-emerald-700' : 'text-[#0B3D91]',
        )}
      >
        {l.valor}
      </span>
    ) : null

  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {itens.map((item, i) => {
        const l = linhaDe(item)
        const conteudo = compacta ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold leading-tight">{l.titulo}</p>
              {l.subtitulo && (
                <p className="truncate text-[9px] leading-tight text-muted-foreground">
                  {l.subtitulo}
                </p>
              )}
            </div>
            {badge(l)}
            {valor(l)}
            {l.extras}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{l.titulo}</p>
              {l.subtitulo && (
                <p className="truncate text-[10px] text-muted-foreground">{l.subtitulo}</p>
              )}
              {l.detalhe && (
                <p className="truncate text-[9px] text-muted-foreground">{l.detalhe}</p>
              )}
            </div>
            {badge(l)}
            {valor(l)}
            {l.extras}
          </div>
        )

        return l.href ? (
          <Link
            key={chaveItem(item, i)}
            to={l.href}
            className="block transition-colors hover:bg-[#0B3D91]/5"
          >
            {conteudo}
          </Link>
        ) : (
          <div key={chaveItem(item, i)}>{conteudo}</div>
        )
      })}
    </div>
  )
}
