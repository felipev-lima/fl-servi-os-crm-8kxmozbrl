import React, { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, Pencil, Trash2, Loader2, Check, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { CAMPO_ALTO, uc } from '@/lib/texto'

/**
 * EMPRESAS QUE EMITEM NOTA FISCAL (pedido do Felipe, 25/11/2026).
 *
 * "como eu tenho algumas empresas no total sete empresas, para cada OS fechada
 *  cada pedido fechado emitido nota fiscal eu consigo informar qual foi o
 *  fornecedor daquele pedido de faturamento"
 *
 * Esta tela cadastra essa lista. O nome curto é o que aparece no seletor do
 * recebimento — por isso ele é curto e obrigatório.
 *
 * O CNPJ NÃO É VALIDADO como obrigatório: o Felipe pode querer cadastrar uma
 * empresa antes de ter o cartão CNPJ em mãos. Mas quando o CNPJ digitado tem 14
 * dígitos e o verificador não confere, a tela AVISA (não bloqueia) — foi assim
 * que descobrimos o CNPJ errado da Cleide Canela.
 */

interface EmpresaNota {
  id: string
  razao_social: string
  nome_curto: string
  cnpj?: string
  ie?: string
  observacoes?: string
  ativa?: boolean
}

const vazio = {
  razao_social: '',
  nome_curto: '',
  cnpj: '',
  ie: '',
  observacoes: '',
  ativa: true,
}

/** Validação de dígito verificador do CNPJ. Só informa — nunca impede salvar. */
function cnpjPareceValido(cnpj: string): boolean | null {
  const n = String(cnpj || '').replace(/\D/g, '')
  if (n.length !== 14) return null // não dá para julgar
  const dv = (nums: number[], pesos: number[]) => {
    const r = nums.reduce((s, a, i) => s + a * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const nums = n.split('').map(Number)
  return nums[12] === dv(nums.slice(0, 12), p1) && nums[13] === dv(nums.slice(0, 13), p2)
}

export default function EmpresasNotaPage() {
  const { isAdmin } = useAuth()
  const [lista, setLista] = useState<EmpresaNota[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<EmpresaNota | null>(null)
  const [form, setForm] = useState<Partial<EmpresaNota>>(vazio)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      const r = await pb.collection('empresas_nota').getFullList({ sort: 'nome_curto' })
      setLista(r as unknown as EmpresaNota[])
    } catch (e: any) {
      // coleção pode não existir ainda (migration pendente)
      if (String(e?.status) === 404) setLista([])
      else toast.error('Não foi possível carregar as empresas.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const abrirNovo = () => {
    setEditando(null)
    setForm(vazio)
    setAberto(true)
  }

  const abrirEdicao = (e: EmpresaNota) => {
    setEditando(e)
    setForm({
      razao_social: e.razao_social || '',
      nome_curto: e.nome_curto || '',
      cnpj: e.cnpj || '',
      ie: e.ie || '',
      observacoes: e.observacoes || '',
      ativa: e.ativa !== false,
    })
    setAberto(true)
  }

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!String(form.razao_social || '').trim()) return toast.error('Informe a razão social.')
    if (!String(form.nome_curto || '').trim()) return toast.error('Informe o nome curto.')

    setSalvando(true)
    try {
      const dados = {
        razao_social: uc(form.razao_social || '').trim(),
        nome_curto: uc(form.nome_curto || '').trim(),
        cnpj: String(form.cnpj || '').trim(),
        ie: String(form.ie || '').trim(),
        observacoes: uc(form.observacoes || ''),
        ativa: form.ativa !== false,
      }
      if (editando) await pb.collection('empresas_nota').update(editando.id, dados)
      else await pb.collection('empresas_nota').create(dados)
      toast.success(editando ? 'Empresa atualizada.' : 'Empresa cadastrada.')
      setAberto(false)
      await carregar()
    } catch (e: any) {
      const msg = String(e?.message || '')
      toast.error(
        msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('index')
          ? 'Já existe uma empresa com esse nome curto. Use outro.'
          : msg || 'Não foi possível salvar.',
      )
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (e: EmpresaNota) => {
    if (!confirm(`Remover "${e.nome_curto}" do cadastro de empresas emissoras?`)) return
    try {
      await pb.collection('empresas_nota').delete(e.id)
      toast.success('Empresa removida.')
      await carregar()
    } catch (err: any) {
      toast.error('Não foi possível remover. Se já existe nota emitida por ela, apenas desative.')
    }
  }

  const alternarAtiva = async (e: EmpresaNota) => {
    try {
      await pb.collection('empresas_nota').update(e.id, { ativa: e.ativa === false })
      await carregar()
    } catch (_) {
      toast.error('Não foi possível alterar.')
    }
  }

  const alertaCnpj = (cnpj?: string) => {
    const ok = cnpjPareceValido(cnpj || '')
    return ok === false
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground">Empresas emissoras</h1>
          <p className="text-[11px] text-muted-foreground">
            Quem pode emitir nota fiscal. Aparece no seletor do recebimento.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={abrirNovo}
            className="h-8 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhuma empresa cadastrada</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cadastre as empresas que emitem nota fiscal pela F. L. SERVIÇOS.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {lista.map((e) => (
            <Card key={e.id} className={e.ativa === false ? 'opacity-60' : ''}>
              <CardContent className="flex items-start gap-2 p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0B3D91]/10 text-[#0B3D91]">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-black text-foreground">
                      {e.nome_curto}
                    </span>
                    {e.ativa === false && (
                      <Badge variant="outline" className="text-[8px] uppercase">
                        inativa
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">{e.razao_social}</p>
                  {e.cnpj && (
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {e.cnpj}
                      {alertaCnpj(e.cnpj) && (
                        <span className="inline-flex items-center gap-0.5 font-bold text-rose-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> dígito não confere
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarAtiva(e)}
                      className="h-7 w-7 p-0"
                      title={e.ativa === false ? 'Ativar' : 'Desativar'}
                    >
                      {e.ativa === false ? (
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => abrirEdicao(e)}
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => excluir(e)}
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* formulário */}
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setAberto(false)}
        >
          <form
            onSubmit={salvar}
            className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-xl bg-white p-3 shadow-2xl sm:rounded-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-black">
              {editando ? 'Editar empresa' : 'Nova empresa emissora'}
            </h3>

            <div className="space-y-2">
              <div>
                <Label className="text-[10px] font-bold">Nome curto *</Label>
                <Input
                  value={form.nome_curto || ''}
                  onChange={(ev) => setForm({ ...form, nome_curto: ev.target.value })}
                  placeholder="ex.: FL THOMAZ"
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                  maxLength={60}
                />
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  É o que aparece no seletor do recebimento. Curto, para caber.
                </p>
              </div>

              <div>
                <Label className="text-[10px] font-bold">Razão social *</Label>
                <Input
                  value={form.razao_social || ''}
                  onChange={(ev) => setForm({ ...form, razao_social: ev.target.value })}
                  placeholder="ex.: FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO"
                  className={`h-9 text-xs ${CAMPO_ALTO}`}
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-bold">CNPJ</Label>
                  <Input
                    value={form.cnpj || ''}
                    onChange={(ev) => setForm({ ...form, cnpj: ev.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="h-9 text-xs"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-bold">Inscrição estadual</Label>
                  <Input
                    value={form.ie || ''}
                    onChange={(ev) => setForm({ ...form, ie: ev.target.value })}
                    placeholder="opcional"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {alertaCnpj(form.cnpj) && (
                <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  O dígito verificador deste CNPJ não confere. Dá para salvar, mas vale conferir no
                  cartão CNPJ.
                </p>
              )}

              <div>
                <Label className="text-[10px] font-bold">Observações</Label>
                <Input
                  value={form.observacoes || ''}
                  onChange={(ev) => setForm({ ...form, observacoes: ev.target.value })}
                  placeholder="ex.: emite só serviço, não produto"
                  className="h-9 text-xs"
                  maxLength={500}
                />
              </div>

              <label className="flex items-center gap-2 text-[11px] font-semibold">
                <input
                  type="checkbox"
                  checked={form.ativa !== false}
                  onChange={(ev) => setForm({ ...form, ativa: ev.target.checked })}
                  className="h-4 w-4"
                />
                Ativa (aparece no seletor)
              </label>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAberto(false)}
                className="h-9 flex-1 text-xs"
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvando}
                className="h-9 flex-[2] gap-1.5 bg-[#0F6A3A] text-xs font-bold text-white hover:bg-[#0F6A3A]/90"
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
