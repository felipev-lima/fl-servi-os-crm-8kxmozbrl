import React, { useState } from 'react'
import { createClient } from '@/services/api'
import { Client } from '@/types/flservicos'
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
import { Loader2, UserPlus } from 'lucide-react'
import { CAMPO_ALTO, uc } from '@/lib/texto'
import { toast } from 'sonner'

/**
 * Cadastro rápido de cliente, feito na rua.
 *
 * Só o nome é obrigatório — o resto (telefone, e-mail, CNPJ, endereço) pode
 * ser preenchido conforme a informação aparece. Serve para criar o cliente no
 * meio do atendimento e já abrir a OS em seguida.
 */
export function ClienteRapidoDialog({
  open,
  onOpenChange,
  onCriado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCriado: (c: Client) => void
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    document: '',
    address: '',
    neighborhood: '',
    city: 'MACAÉ',
  })
  const [salvando, setSalvando] = useState(false)

  // Tudo entra em MAIÚSCULA, mesmo que o teclado esteja em minúscula
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: uc(v) }))

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const nome = uc(form.name).trim()
    if (nome.length < 2) {
      toast.error('Digite o nome do cliente.')
      return
    }
    setSalvando(true)
    try {
      const docs = form.document.replace(/\D/g, '')
      const criado = await createClient({
        name: nome,
        phone: uc(form.phone).trim(),
        email: form.email.trim().toLowerCase(),
        document: uc(form.document).trim(),
        address: uc(form.address).trim(),
        neighborhood: uc(form.neighborhood).trim(),
        city: uc(form.city || 'MACAÉ').trim(),
        // 11 dígitos = CPF (pessoa física); 14 = CNPJ
        type: docs.length === 11 ? 'PF' : 'PJ',
      })
      toast.success('Cliente cadastrado!')
      onCriado(criado)
      setForm({
        name: '',
        phone: '',
        email: '',
        document: '',
        address: '',
        neighborhood: '',
        city: 'MACAÉ',
      })
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cadastrar o cliente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-[#0F6A3A]" />
            Novo cliente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-2.5 text-xs">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome / Razão social *</Label>
            <Input
              autoFocus
              placeholder="Ex: ESCOLA MUNICIPAL ..."
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={`h-10 text-sm ${CAMPO_ALTO}`}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Telefone</Label>
              <Input
                inputMode="tel"
                placeholder="(22) 99999-9999"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={`h-10 text-sm ${CAMPO_ALTO}`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">CNPJ / CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={form.document}
                onChange={(e) => set('document', e.target.value)}
                className={`h-10 text-sm ${CAMPO_ALTO}`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">E-mail</Label>
            <Input
              type="email"
              inputMode="email"
              placeholder="contato@cliente.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="h-10 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Endereço</Label>
            <Input
              placeholder="Rua, número"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={`h-10 text-sm ${CAMPO_ALTO}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Bairro</Label>
              <Input
                placeholder="Bairro"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                className={`h-10 text-sm ${CAMPO_ALTO}`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Cidade</Label>
              <Input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                className={`h-10 text-sm ${CAMPO_ALTO}`}
              />
            </div>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cadastrar cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
