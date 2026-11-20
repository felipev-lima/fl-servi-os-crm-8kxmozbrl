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
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCriado: (m: Material) => void
}) {
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState<(typeof UNIDADES)[number]>('UN')
  const [defaultKind, setDefaultKind] = useState<'' | MaterialKind>('')
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
      const criado = await createMaterial({
        name: limpo,
        unit: unidade,
        price: 0,
        category: 'GERAL',
        default_kind: defaultKind || undefined,
        pending_review: true,
      })
      toast.success('Produto cadastrado! O administrador vai revisar depois.')
      onCriado(criado)
      setNome('')
      setUnidade('UN')
      setDefaultKind('')
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

          <p className="text-[11px] text-muted-foreground leading-snug bg-amber-50 border border-amber-200 rounded p-2">
            O produto entra marcado como <strong>aguardando revisão</strong>. O administrador
            completa categoria e preço depois — não precisa preencher agora.
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
