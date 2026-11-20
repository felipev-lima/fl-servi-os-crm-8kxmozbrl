import * as React from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface ComboOption {
  value: string
  label: string
  hint?: string
  keywords?: string
}

interface SearchComboboxProps {
  options: ComboOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  /** Quantos itens renderizar por vez (a lista tem centenas de produtos). */
  limit?: number
}

/**
 * Caixa de seleção com digitação. Diferente do Select comum, aqui o usuário
 * digita parte do nome e a lista filtra na hora — essencial com 96 clientes e
 * 1.508 produtos, onde rolar até achar não é viável.
 */
export function SearchCombobox({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Digite para buscar...',
  emptyText = 'Nada encontrado.',
  disabled = false,
  className,
  limit = 40,
}: SearchComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState('')

  const selecionado = options.find((o) => o.value === value)

  const normalizar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const filtrados = React.useMemo(() => {
    const t = normalizar(term.trim())
    if (!t) return options.slice(0, limit)

    // Busca por QUALQUER parte do nome, não só pelo começo. Digitar "hilook"
    // acha "CÂMERA BULLET HILOOK"; digitar "parafuso" acha "CAIXA DE PARAFUSO".
    // Várias palavras funcionam em qualquer ordem.
    const palavras = t.split(/\s+/).filter(Boolean)

    const achados: { o: ComboOption; pontos: number }[] = []
    for (const o of options) {
      const nome = normalizar(o.label)
      const alvo = normalizar(`${o.label} ${o.hint || ''} ${o.keywords || ''}`)

      // todas as palavras precisam aparecer em algum lugar
      if (!palavras.every((p) => alvo.includes(p))) continue

      // pontuação só para ordenar: nome que COMEÇA com o termo vem primeiro,
      // depois o que contém o termo, depois o que casou só no hint/categoria
      let pontos = 0
      if (nome.startsWith(t)) pontos = 3
      else if (palavras.every((p) => nome.includes(p))) pontos = 2
      else pontos = 1

      achados.push({ o, pontos })
    }

    achados.sort((a, b) => b.pontos - a.pontos)
    return achados.slice(0, limit).map((x) => x.o)
  }, [options, term, limit])

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setTerm('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-9 text-xs px-3',
            !selecionado && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-left">
            {selecionado ? selecionado.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[min(92vw,26rem)] p-0" align="start" sideOffset={4}>
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {filtrados.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
          )}
          {filtrados.map((o) => {
            const ativo = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  setTerm('')
                }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted',
                  ativo && 'bg-muted/60',
                )}
              >
                <Check
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    ativo ? 'opacity-100 text-[#0F6A3A]' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {o.hint}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
          {filtrados.length === limit && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Mostrando os primeiros {limit}. Digite mais para refinar.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
