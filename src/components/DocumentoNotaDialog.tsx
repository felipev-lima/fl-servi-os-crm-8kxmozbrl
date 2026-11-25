/**
 * NF de serviço — dados de UMA OS/pedido prontos para o contador.
 *
 * Não emite nota: monta o "dossiê" do documento (empresa emissora, cliente,
 * discriminação, valores e itens) a partir da OS ou do pedido escolhido, com
 * botão de copiar texto — o Felipe cola no e-mail/WhatsApp do contador.
 *
 * Itens: na OS vêm de order_materials (kind por linha, só SERVICO entra na
 * discriminação); no pedido vêm do JSON `items` do quote.
 */
import { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { brl } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Copy, User, Building2 } from 'lucide-react'
import { toast } from 'sonner'

export interface DocDe {
  id: string
  origem: 'OS' | 'PEDIDO'
  numero: number | string
  clienteNome: string
  clienteDoc: string
  clienteEndereco: string
  descricao: string
  data: string
  valorServico: number
  /** itens do documento (OS: order_materials; pedido: JSON) */
  itens: { nome: string; qtd: number; unidade: string; kind: string; total: number }[]
}

/** Nome amigável do tipo do lançamento (igual ao resto do app) */
const rotuloKind = (k: string) =>
  k === 'CAPITAL' ? 'Capital' : k === 'CONSUMO' ? 'Consumo' : k === 'SERVICO' ? 'Serviço' : k || '—'

export function DocumentoDialog({ doc, onClose }: { doc: DocDe | null; onClose: () => void }) {
  const [empresas, setEmpresas] = useState<
    { id: string; nome_curto: string; razao_social: string; cnpj: string }[]
  >([])
  const [empresaId, setEmpresaId] = useState('')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!doc) return
    void (async () => {
      setCarregando(true)
      try {
        const lista = (await pb.collection('empresas_nota').getFullList({
          filter: 'ativa = true',
          sort: 'nome_curto',
        })) as any[]
        const mapeadas = lista.map((e) => ({
          id: e.id,
          nome_curto: String(e.nome_curto || ''),
          razao_social: String(e.razao_social || ''),
          cnpj: String(e.cnpj || ''),
        }))
        setEmpresas(mapeadas)
        if (mapeadas.length === 1) setEmpresaId(mapeadas[0].id)
      } catch {
        setEmpresas([])
      } finally {
        setCarregando(false)
      }
    })()
  }, [doc])

  const empresa = empresas.find((e) => e.id === empresaId) || null

  /** Valor da nota: serviço + itens de capital/consumo lançados no documento */
  const valorItensNaoServico = useMemo(
    () => (doc?.itens || []).filter((i) => i.kind !== 'SERVICO').reduce((s, i) => s + i.total, 0),
    [doc],
  )
  const totalNota = Number(doc?.valorServico || 0) + valorItensNaoServico
  const issPercent = 5 // estimativa informada ao contador; ele aplica a alíquota real do município

  const texto = useMemo(() => {
    if (!doc) return ''
    const linhasItens = doc.itens.length
      ? doc.itens
          .map(
            (i) => `  - ${i.nome}: ${i.qtd} ${i.unidade} — ${rotuloKind(i.kind)} — ${brl(i.total)}`,
          )
          .join('\n')
      : '  (sem itens lançados)'
    return [
      `SOLICITAÇÃO DE NFS-e — FL SERVIÇOS CRM`,
      ``,
      `EMPRESA EMISSORA: ${empresa ? `${empresa.razao_social} (CNPJ ${empresa.cnpj || 'não informado'})` : '(escolha acima)'}`,
      ``,
      `TOMADOR: ${doc.clienteNome}`,
      `CNPJ/CPF: ${doc.clienteDoc || 'não informado'}`,
      doc.clienteEndereco ? `ENDEREÇO: ${doc.clienteEndereco}` : '',
      ``,
      `DOCUMENTO DE ORIGEM: ${doc.origem} nº ${doc.numero}`,
      `DATA: ${doc.data}`,
      `DISCRIMINAÇÃO: ${doc.descricao || 'serviço prestado'}`,
      ``,
      `ITENS:`,
      linhasItens,
      ``,
      `VALOR DOS SERVIÇOS: ${brl(doc.valorServico)}`,
      valorItensNaoServico > 0
        ? `VALOR DE MATERIAIS (capital/consumo): ${brl(valorItensNaoServico)}`
        : '',
      `VALOR TOTAL DA NOTA: ${brl(totalNota)}`,
      `ISS (estimativa ${issPercent}%): ${brl((totalNota * issPercent) / 100)}`,
      ``,
      `— mensagem gerada pelo FL SERVIÇOS CRM`,
    ]
      .filter((l) => l !== '')
      .join('\n')
  }, [doc, empresa, totalNota, valorItensNaoServico])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Dados copiados — cole no e-mail do contador.')
    } catch {
      toast.error('Não foi possível copiar automaticamente.')
    }
  }

  if (!doc) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl border bg-white p-4 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Dados para a nota fiscal"
      >
        <h2 className="text-sm font-bold">
          Dados para a nota — {doc.origem} nº {doc.numero}
        </h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Copie e envie ao contador. Não emite nota pelo sistema.
        </p>

        {carregando ? (
          <p className="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando empresas emissoras...
          </p>
        ) : empresas.length > 0 ? (
          <div className="mt-3 space-y-1">
            <Label className="text-[10px] font-semibold">Empresa emissora</Label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="h-9 w-full rounded-md border bg-white px-2 text-xs"
              aria-label="Empresa emissora da nota"
            >
              <option value="">— escolha —</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_curto} — {e.razao_social}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900">
            Nenhuma empresa emissora cadastrada. Cadastre em <strong>Empresas emissoras</strong>{' '}
            para identificar quem emite.
          </p>
        )}

        <div className="mt-3 space-y-1.5 rounded-lg border p-2.5 text-[11px]">
          <p className="flex items-center gap-1.5 font-semibold">
            <User className="h-3 w-3 text-[#0B3D91]" /> {doc.clienteNome}
            <span className="font-normal text-muted-foreground">
              · {doc.clienteDoc || 'sem CNPJ/CPF'}
            </span>
          </p>
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <Building2 className="mt-0.5 h-3 w-3 shrink-0 text-[#0B3D91]" />
            <span>
              {doc.origem} nº {doc.numero} · {doc.data}
              <br />
              {doc.descricao || '—'}
            </span>
          </p>
          <div className="border-t pt-1.5">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Itens</p>
            {doc.itens.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">Nenhum item lançado.</p>
            ) : (
              doc.itens.map((i, ix) => (
                <p key={ix} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="truncate">
                    {i.nome} ({i.qtd} {i.unidade}) · {rotuloKind(i.kind)}
                  </span>
                  <span className="shrink-0 font-mono">{brl(i.total)}</span>
                </p>
              ))
            )}
          </div>
          <div className="flex items-baseline justify-between border-t pt-1.5">
            <span className="font-semibold">Serviços</span>
            <span className="font-mono font-bold text-[#0B3D91]">{brl(doc.valorServico)}</span>
          </div>
          {valorItensNaoServico > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">Materiais</span>
              <span className="font-mono font-bold text-[#0B3D91]">
                {brl(valorItensNaoServico)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t pt-1.5">
            <span className="text-xs font-black">TOTAL DA NOTA</span>
            <span className="font-mono text-xs font-black text-[#0B3D91]">{brl(totalNota)}</span>
          </div>
          <p className="text-[9px] text-muted-foreground">
            ISS estimado em {issPercent}% ({brl((totalNota * issPercent) / 100)}) — o contador
            aplica a alíquota real.
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="h-9 flex-1 text-xs">
            Fechar
          </Button>
          <Button
            size="sm"
            onClick={copiar}
            className="h-9 flex-1 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar dados
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Busca no servidor os dados completos da OS escolhida */
export async function montarDocDaOS(o: any): Promise<DocDe> {
  let itens: DocDe['itens'] = []
  try {
    const mats = (await pb.collection('order_materials').getFullList({
      filter: `work_order = "${o.id}"`,
      expand: 'material',
      sort: 'created',
    })) as any[]
    itens = mats.map((m) => ({
      nome: String(m?.expand?.material?.name || 'item'),
      qtd: Number(m.quantity || 0),
      unidade: String(m.unit || 'UN'),
      kind: String(m.kind || m?.expand?.material?.default_kind || ''),
      total: Number(m.total_price || 0),
    }))
  } catch {
    /* segue sem itens */
  }
  const c = o?.expand?.client
  return {
    id: o.id,
    origem: 'OS',
    numero: o.order_number,
    clienteNome: String(c?.name || '—'),
    clienteDoc: String(c?.document || ''),
    clienteEndereco: [c?.address, c?.city].filter(Boolean).join(', '),
    descricao: String(o.description || ''),
    data: o.completed_at || o.scheduled_date || o.created || '',
    valorServico: Number(o.service_value || 0),
    itens,
  }
}

/** Busca no servidor os dados completos do pedido (quote) escolhido */
export async function montarDocDoPedido(q: any): Promise<DocDe> {
  const bruto = Array.isArray(q.items) ? q.items : []
  const itens = bruto.map((i: any) => ({
    nome: String(i.description || i.nome || 'item'),
    qtd: Number(i.quantity ?? 1),
    unidade: String(i.unit || 'UN'),
    kind: String(i.kind || ''),
    total: Number(i.total ?? i.total_price ?? Number(i.quantity || 1) * Number(i.unit_price || 0)),
  }))
  const c = q?.expand?.client
  return {
    id: q.id,
    origem: 'PEDIDO',
    numero: q.number,
    clienteNome: String(c?.name || '—'),
    clienteDoc: String(c?.document || ''),
    clienteEndereco: [c?.address, c?.city].filter(Boolean).join(', '),
    descricao: String(q.notes || q.description || ''),
    data: q.date || q.created || '',
    valorServico: itens.filter((i) => i.kind === 'SERVICO').reduce((s, i) => s + i.total, 0),
    itens,
  }
}
