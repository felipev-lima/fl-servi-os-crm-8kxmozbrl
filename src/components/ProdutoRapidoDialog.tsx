import React, { useState } from 'react'
import { createMaterial } from '@/services/api'
import { Material, MaterialKind } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, PackagePlus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CAMPO_ALTO, uc } from '@/lib/texto'
import { toast } from 'sonner'

const UNIDADES = ['UN', 'M', 'KG', 'L', 'CX', 'PC', 'PAR', 'ROLO'] as const

/**
 * Cadastro rápido de produto, feito na rua pelo técnico.
 *
 * Só o nome é obrigatório: é o que ele sabe na hora. O produto entra marcado
 * como "aguardando revisão" e aparece destacado em vermelho para o
 * administrador completar categoria, unidade e preço depois.
 */
export function ProdutoRapidoDialog({
  open,
  onOpenChange,
  onCriado,
  podeVerValores = false,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCriado: (m: Material) => void
  /** Administrador informa o preço de venda; o custo é calculado pela marcação */
  podeVerValores?: boolean
}) {
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState<(typeof UNIDADES)[number]>('UN')
  const [defaultKind, setDefaultKind] = useState<'' | MaterialKind>('')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const limpo = uc(nome).trim()
    if (limpo.length < 2) {
      toast.error('Digite o nome do produto.')
      return
    }
    setSalvando(true)
    try {
      /**
       * Preço informado pelo ADMIN: o custo é derivado na hora pela marcação
       * de 60% (preço ÷ 1,6) e o produto já entra pronto, sem pendência.
       *
       * Técnico não informa preço: entra zerado e MARCADO para revisão.
       */
      const precoNum = Number(String(preco).replace(',', '.')) || 0
      const comPreco = podeVerValores && precoNum > 0
      const criado = await createMaterial({
        name: limpo,
        unit: unidade,
        price: comPreco ? precoNum : 0,
        cost: comPreco ? Math.round((precoNum / 1.6) * 100) / 100 : 0,
        cost_estimated: comPreco,
        category: 'GERAL',
        default_kind: defaultKind || undefined,
        pending_review: !comPreco,
      })
      toast.success(
        comPreco
          ? 'Produto cadastrado com preço.'
          : 'Produto cadastrado! Vai aparecer em vermelho para revisão.',
      )
      onCriado(criado)
      setNome('')
      setUnidade('UN')
      setDefaultKind('')
      setPreco('')
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cadastrar o produto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-[#0F6A3A]" />
            Cadastrar produto do campo
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome do produto *</Label>
            <Input
              autoFocus
              placeholder="Ex: CONECTOR BNC 4 VIAS"
              value={nome}
              onChange={(e) => setNome(uc(e.target.value))}
              className={`h-10 text-sm ${CAMPO_ALTO}`}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Tipo</Label>
            <Select value={defaultKind} onValueChange={(v) => setDefaultKind(v as any)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="— (revisão decide)" />
              </SelectTrigger>
              <SelectContent>
                {(['CAPITAL', 'CONSUMO', 'SERVICO'] as MaterialKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Unidade</Label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as any)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {podeVerValores && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Preço de venda (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="h-10 text-sm"
              />
              {Number(String(preco).replace(',', '.')) > 0 && (
                <p className="text-[10px] text-emerald-700">
                  Custo calculado pela marcação de 60%:{' '}
                  <strong>
                    R${' '}
                    {(Number(String(preco).replace(',', '.')) / 1.6).toFixed(2).replace('.', ',')}
                  </strong>
                </p>
              )}
            </div>
          )}

          <p
            className={`text-[11px] leading-snug rounded p-2 ${
              podeVerValores
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border border-amber-200 text-muted-foreground'
            }`}
          >
            {podeVerValores ? (
              <>
                Com preço preenchido, o produto já entra pronto no catálogo. Deixando zerado, ele
                fica <strong>em vermelho para revisão</strong>.
              </>
            ) : (
              <>
                O produto entra marcado como <strong>aguardando revisão</strong> (em vermelho). O
                administrador completa categoria e preço depois.
              </>
            )}
          </p>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
