import React, { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { brl, dataBR } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2, Receipt, X, AlertTriangle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { ItemParaBaixa } from '@/components/RecebimentoLoteDialog'

/**
 * CORRIGIR RECEBIMENTO (pedido do Felipe, 26/11/2026).
 *
 * O PROBLEMA: ele baixou um pagamento de R$ 5.900 (NF do Natálio) e marcou os
 * itens ERRADOS — deu desconto maior nas bolas e deixou as tintas de impressora
 * em aberto, quando eram as tintas que a nota pagava. Não existia NENHUMA
 * opção de ajuste: o único caminho era apagar o lançamento e refazer, o que
 * destrói o histórico (regra absoluta: nada é apagado).
 *
 * O QUE ESTA TELA FAZ: ajusta os VÍNCULOS do recebimento que JÁ EXISTE.
 *  - tira um item e coloca outro (o `settles` de cada linha é reescrito);
 *  - ajusta o valor aplicado a cada item (parcial, total, desconto);
 *  - permite corrigir data, descrição e deixar observação do motivo;
 *  - valor que sobra das linhas vira "CRÉDITO A FAVOR", nunca some.
 *
 * O QUE NUNCA ACONTECE: nenhuma linha de pagamento é apagada. Se a correção
 * precisa de menos linhas do que existiam, as que sobram são ZERADAS com a
 * marcação "CORRIGIDO — valor movido" (continuam no histórico para auditoria,
 * mas não afetam mais o saldo). Tudo que a baixa por NF gravou — nf_numero,
 * nf_lote, empresa_nota, nf_data — é PRESERVADO, inclusive a idempotência
 * bills.payment_transaction, porque nenhuma bill é tocada.
 *
 * FUNCIONA PARA OS DOIS CASOS: pagamento por emissão de nota fiscal (lote
 * com nf_lote) e recebimento avulso/acerto (linha única). Quando alguma linha
 * tem nf_lote, o lote INTEIRO é carregado e corrigido junto.
 */

interface LinhaPagamento {
  id: string
  created?: string
  date: string
  description: string
  quantity?: number
  unit_price?: number
  settles?: string
  nf_numero?: string
  nf_lote?: string
  nf_data?: string
  empresa_nota?: string
  details?: string
}

interface Props {
  clienteId: string
  /** ids das linhas DINHEIRO a corrigir (uma linha ou o lote inteiro) */
  pagamentoIds: string[]
  /** itens do cliente, do mesmo cálculo da Dar baixa (/saldo-por-tipo) */
  itens: ItemParaBaixa[]
  onConcluir: () => void
  onFechar: () => void
}

const ROTULO: Record<string, string> = {
  SERVICO: 'Serviço',
  CONSUMO: 'Consumo',
  CAPITAL: 'Capital',
}

const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0

/** Descrição do item sem perder o prefixo "RECEBIMENTO NF 123 - ..." */
function montarDescricao(base: string, itemDesc?: string): string {
  const b = (base || '').trim()
  if (!itemDesc) return b
  const m = b.match(/^(RECEBIMENTO[^-]*|CR[EÉ]DITO[^-]*)\s*-\s*/)
  if (m) return `${m[1]} - ${itemDesc}`
  return `${b} - ${itemDesc}`
}

export const CorrigirRecebimentoDialog: React.FC<Props> = ({
  clienteId,
  pagamentoIds,
  itens,
  onConcluir,
  onFechar,
}) => {
  const [linhas, setLinhas] = useState<LinhaPagamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  /** itemId -> valor aplicado (o item está no pagamento quando existe a chave) */
  const [alvos, setAlvos] = useState<Record<string, string>>({})
  const [data, setData] = useState('')
  const [descricaoBase, setDescricaoBase] = useState('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    void (async () => {
      setCarregando(true)
      try {
        const res = (await pb.collection('transactions').getFullList({
          filter: `client = "${clienteId}" && kind = "DINHEIRO"`,
          // ⚠ A coleção transactions NÃO TEM campo `created` — sort por ele
          // responde 400 no servidor (era o bug do "0 linha(s) · R$ 0,00").
          // Mesmo padrão das outras telas: ordena por `date`.
          sort: '-date',
        })) as unknown as LinhaPagamento[]

        const escolhidas = res.filter((r) => pagamentoIds.includes(r.id))
        // lote de nota fiscal: corrige o lote INTEIRO, não uma linha solta
        const lote = escolhidas.find((r) => r.nf_lote)?.nf_lote || ''
        const finais = lote ? res.filter((r) => r.nf_lote === lote) : escolhidas
        // ordena as linhas do lote pela data (a mais antiga primeiro) — a
        // ordem de gravação da correção segue a ordem dos destinos
        finais.sort((a, b) => String(a.date).localeCompare(String(b.date)))

        setLinhas(finais)
        if (finais[0]) {
          setData(String(finais[0].date || '').slice(0, 10))
          setDescricaoBase(finais[0].description || '')
        }

        // já marcados: os itens que estas linhas quitam HOJE, com o valor delas
        const iniciais: Record<string, string> = {}
        for (const l of finais) {
          if (!l.settles) continue
          const v = Math.abs(Number(l.quantity ?? 1) * Number(l.unit_price ?? 0))
          iniciais[l.settles] = v > 0 ? v.toFixed(2).replace('.', ',') : ''
        }
        setAlvos(iniciais)
      } catch (e: any) {
        toast.error(e?.message || 'Não foi possível carregar o pagamento.')
      } finally {
        setCarregando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  /** lista de itens: em aberto HOJE + os já vinculados a este pagamento */
  const itensVisiveis = useMemo(() => {
    const ids = new Set(linhas.map((l) => l.settles).filter(Boolean) as string[])
    return itens.filter((i) => !i.quitado || i.em_aberto > 0.005 || ids.has(i.id))
  }, [itens, linhas])

  const nf = linhas.find((l) => l.nf_numero)?.nf_numero || ''

  const totalPagoOriginal = useMemo(
    () =>
      linhas.reduce((s, l) => s + Math.abs(Number(l.quantity ?? 1) * Number(l.unit_price ?? 0)), 0),
    [linhas],
  )

  const totalNovo = useMemo(() => Object.values(alvos).reduce((s, v) => s + num(v), 0), [alvos])
  const diferenca = Math.round((totalNovo - totalPagoOriginal) * 100) / 100

  const alternar = (id: string) => {
    setAlvos((p) => {
      const novo = { ...p }
      if (id in novo) {
        delete novo[id]
      } else {
        const it = itens.find((i) => i.id === id)
        const valor = it && it.em_aberto > 0.005 ? it.em_aberto : 0
        novo[id] = valor > 0 ? valor.toFixed(2).replace('.', ',') : ''
      }
      return novo
    })
  }

  const salvar = async () => {
    if (!linhas.length) return
    const entradas = Object.entries(alvos)
      .filter(([, v]) => num(v) > 0.005)
      .map(([itemId, v]) => ({ itemId, valor: num(v) }))

    if (entradas.length === 0) {
      return toast.error('Marque ao menos um item que o pagamento quita.')
    }
    if (!data) return toast.error('Informe a data do recebimento.')
    if (!descricaoBase.trim()) return toast.error('Informe a descrição do recebimento.')

    const ok = window.confirm(
      `Corrigir este recebimento?\n\n` +
        `Pago hoje: ${brl(totalPagoOriginal)}\n` +
        `Ficará: ${brl(totalNovo)}` +
        (Math.abs(diferenca) > 0.005 ? ` (${diferenca > 0 ? 'a mais' : 'a menos'})` : '') +
        `\n\nNada é apagado — os vínculos e valores são reescritos.`,
    )
    if (!ok) return

    /** excedente: o que pagou a mais do que os itens marcados devem — vira crédito */
    const excedente = Math.max(0, totalNovo - entradas.reduce((s, e) => s + e.valor, 0))

    setSalvando(true)
    try {
      const agora = new Date()
      const marca = `CORRIGIDO em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString(
        'pt-BR',
        { hour: '2-digit', minute: '2-digit' },
      )}${observacao.trim() ? ` — ${observacao.trim()}` : ''}`

      const primeira = linhas[0]
      const nfCampos: Record<string, unknown> = {}
      if (primeira.nf_lote) nfCampos.nf_lote = primeira.nf_lote
      if (primeira.nf_numero) nfCampos.nf_numero = primeira.nf_numero
      if (primeira.empresa_nota) nfCampos.empresa_nota = primeira.empresa_nota
      if (primeira.nf_data) nfCampos.nf_data = primeira.nf_data

      /** destinos: cada item marcado (+ crédito quando pagou a mais que os itens) */
      const destinos: { itemId: string; valor: number; credito: boolean }[] = entradas.map((e) => ({
        itemId: e.itemId,
        valor: e.valor,
        credito: false,
      }))
      if (excedente > 0.005) {
        destinos.push({ itemId: '', valor: excedente, credito: true })
      }

      const ordenadas = [...linhas].sort((a, b) =>
        String(a.date || a.id).localeCompare(String(b.date || b.id)),
      )

      const detalheNovo = [primeira.details ? String(primeira.details).trim() : '', marca]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500)

      let i = 0
      for (; i < Math.min(ordenadas.length, destinos.length); i++) {
        const linha = ordenadas[i]
        const d = destinos[i]
        const itemDesc = d.credito ? '' : itens.find((x) => x.id === d.itemId)?.descricao
        await pb.collection('transactions').update(linha.id, {
          settles: d.credito ? '' : d.itemId,
          // a linha continua quitando um item de nota: continua ENVIADA (a
          // correção parcial de 26/11 deixou uma linha do lote como PENDENTE)
          sent_to_finance: 'ENVIADA',
          date: `${data} 12:00:00.000Z`,
          quantity: 1,
          unit_price: -Math.abs(d.valor),
          description: d.credito
            ? `CRÉDITO A FAVOR - correção do recebimento${nf ? ` NF ${nf}` : ''}`
            : montarDescricao(descricaoBase.trim(), itemDesc),
          details: detalheNovo,
          ...nfCampos,
        } as never)
      }

      // linhas que sobraram (a correção usa menos): ZERADAS com marcação —
      // continuam no histórico, mas não afetam mais o saldo
      for (; i < ordenadas.length; i++) {
        await pb.collection('transactions').update(ordenadas[i].id, {
          settles: '',
          quantity: 0,
          unit_price: 0,
          description: `CORRIGIDO - valor movido para outro item (era: ${String(
            ordenadas[i].description || '',
          ).slice(0, 60)})`,
          details: detalheNovo,
        } as never)
      }

      // a correção precisa de mais linhas do que existiam: cria novas, com os
      // mesmos dados de nota (nf_lote amarra tudo à mesma NF)
      for (; i < destinos.length; i++) {
        const d = destinos[i]
        const itemDesc = d.credito ? '' : itens.find((x) => x.id === d.itemId)?.descricao
        await pb.collection('transactions').create({
          client: clienteId,
          date: `${data} 12:00:00.000Z`,
          kind: 'DINHEIRO',
          item_type: 'SERVICO',
          description: d.credito
            ? `CRÉDITO A FAVOR - correção do recebimento${nf ? ` NF ${nf}` : ''}`
            : montarDescricao(descricaoBase.trim(), itemDesc),
          quantity: 1,
          unit_price: -Math.abs(d.valor),
          sent_to_finance: 'ENVIADA',
          settles: d.credito ? '' : d.itemId,
          details: detalheNovo,
          ...nfCampos,
        } as never)
      }

      toast.success(
        `Recebimento corrigido: ${brl(totalNovo)} em ${destinos.length} linha(s)` +
          (Math.abs(diferenca) > 0.005
            ? ` — diferença de ${brl(diferenca)} ${diferenca > 0 ? 'a mais' : 'a menos'}`
            : '') +
          '.',
      )
      onConcluir()
      onFechar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a correção.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b p-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-black">
              <Pencil className="h-4 w-4 text-[#0B3D91]" />
              Corrigir recebimento
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {carregando
                ? 'carregando...'
                : `${linhas.length} linha(s) · pago ${brl(totalPagoOriginal)}` +
                  (nf ? ` · NF ${nf}` : ' · recebimento avulso')}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onFechar} className="h-7 w-7 shrink-0 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o pagamento...
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              <p className="rounded-md bg-[#0B3D91]/5 px-2.5 py-2 text-[10px] leading-relaxed text-slate-700">
                <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />
                Nada é apagado: a correção reescreve <strong>quais itens</strong> este pagamento
                quita e <strong>quanto</strong> aplica em cada um. O histórico fica com a marcação
                da correção.
              </p>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-[11px] font-bold">
                    Itens que o pagamento quita ({Object.keys(alvos).length})
                  </Label>
                </div>
                {itensVisiveis.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                    Nenhum item disponível.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
                    {itensVisiveis.map((i) => {
                      const on = i.id in alvos
                      return (
                        <div
                          key={i.id}
                          className={`rounded-md px-2 py-1.5 ${
                            on ? 'bg-[#0B3D91]/5 ring-1 ring-[#0B3D91]/30' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => alternar(i.id)}
                              aria-pressed={on}
                              aria-label={`${on ? 'Remover' : 'Incluir'} ${i.descricao}`}
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                on ? 'border-[#0B3D91] bg-[#0B3D91] text-white' : 'border-slate-300'
                              }`}
                            >
                              {on && <Check className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => alternar(i.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block truncate text-[11px] font-semibold text-slate-800">
                                {i.descricao}
                              </span>
                              <span className="block text-[9px] text-muted-foreground">
                                {dataBR(i.data)} · {ROTULO[i.kind] || i.kind} · em aberto{' '}
                                {brl(i.em_aberto)}
                                {i.pago > 0.005 ? ` · já pago ${brl(i.pago)}` : ''}
                              </span>
                            </button>
                            {on && (
                              <div className="shrink-0">
                                <Input
                                  value={alvos[i.id] ?? ''}
                                  onChange={(e) =>
                                    setAlvos((p) => ({ ...p, [i.id]: e.target.value }))
                                  }
                                  placeholder="0,00"
                                  inputMode="decimal"
                                  aria-label={`Valor aplicado em ${i.descricao}`}
                                  className="h-7 w-[88px] text-right text-[11px] font-bold"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {Object.keys(alvos).length > 0 && (
                <div className="rounded-lg bg-[#0B3D91]/5 p-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-600">Total corrigido</span>
                    <span className="font-black text-[#0B3D91]">{brl(totalNovo)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Pago originalmente</span>
                    <span>{brl(totalPagoOriginal)}</span>
                  </div>
                  {Math.abs(diferenca) > 0.005 && (
                    <div
                      className={`mt-0.5 flex justify-between ${
                        diferenca > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      <span>{diferenca > 0 ? 'A mais (vira crédito)' : 'A menos'}</span>
                      <span className="font-bold">{brl(diferenca)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-bold text-slate-600">
                    Data do recebimento
                  </Label>
                  <Input
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-600">
                    Observação (motivo)
                  </Label>
                  <Input
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="ex.: itens marcados errados na NF"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-600">Descrição</Label>
                <Input
                  value={descricaoBase}
                  onChange={(e) => setDescricaoBase(e.target.value)}
                  className="h-9 text-xs"
                />
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  Com vários itens, a descrição de cada um é acrescentada automaticamente.
                </p>
              </div>

              <p className="text-[9px] text-muted-foreground">
                Linhas de lote com NF (nf_lote) são corrigidas juntas; os dados da nota (número,
                empresa, data) são preservados.
              </p>
            </div>

            <div className="flex gap-2 border-t p-3">
              <Button
                variant="outline"
                onClick={onFechar}
                className="h-10 flex-1 text-xs"
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                onClick={salvar}
                disabled={salvando || Object.keys(alvos).length === 0}
                className="h-10 flex-[2] gap-1.5 bg-[#0B3D91] text-xs font-bold text-white hover:bg-[#0B3D91]/90"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Receipt className="h-4 w-4" /> Salvar correção
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
