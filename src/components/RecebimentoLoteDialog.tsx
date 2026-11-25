import React, { useEffect, useMemo, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { brl, dataBR } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Loader2, Receipt, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * RECEBIMENTO EM LOTE COM NOTA FISCAL (pedido do Felipe, 25/11/2026).
 *
 * O PROBLEMA: o Dar Baixa quitava UM item por vez. Mas um pedido de
 * R$ 9.999,18 (a Cleide Canela) tem vários itens e vira UMA nota fiscal só.
 * Na prática ele recebia um pagamento único e tinha de repetir o lançamento
 * item por item, sem nada que amarrasse os itens à mesma nota.
 *
 * O QUE ESTA TELA FAZ:
 *  - lista TODOS os itens em aberto do cliente, com caixa de seleção;
 *  - ele marca os que estão sendo pagos e digita quanto recebeu;
 *  - grava um lançamento DINHEIRO por item marcado (negativo, abate o saldo),
 *    cada um vinculado ao item pelo campo `settles`;
 *  - a NOTA FISCAL vai em todas as linhas do lote, no campo `notes` — é o que
 *    amarra os itens à mesma nota;
 *  - pagamento parcial deixa o restante em aberto; excedente vira crédito.
 *
 * POR QUE UM LANÇAMENTO POR ITEM E NÃO UM COM O TOTAL: a soma das linhas já é
 * o valor recebido, por construção. Criar um "pai" com o total e apagar depois
 * seria um passo a mais para dar errado — e daria saldo dobrado se o apagar
 * falhasse.
 *
 * REGRA DO SALDO (a mesma que já custou caro): o pagamento entra NEGATIVO e o
 * total de cada item é sempre quantidade × unitário. Nada é digitado por cima,
 * e o valor original do item nunca é alterado.
 */

export interface ItemParaBaixa {
  id: string
  data: string
  kind: string
  descricao: string
  total: number
  pago: number
  em_aberto: number
  quitado: boolean
  tem_vinculo: boolean
}

interface Props {
  clientId: string
  clienteNome: string
  itens: ItemParaBaixa[]
  /** chamado depois de gravar, para a tela recarregar os saldos */
  onConcluir: () => void
  onFechar: () => void
}

const ROTULO: Record<string, string> = {
  SERVICO: 'Serviço',
  CONSUMO: 'Consumo',
  CAPITAL: 'Capital',
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const RecebimentoLoteDialog: React.FC<Props> = ({
  clientId,
  clienteNome,
  itens,
  onConcluir,
  onFechar,
}) => {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [nota, setNota] = useState('')
  const [dataNota, setDataNota] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  /**
   * EMPRESA EMISSORA + AVISO DE NOTA REPETIDA (pedido do Felipe, 25/11/2026).
   *
   * Ele tem sete empresas e pode emitir a nota por qualquer uma delas. O número
   * pode se repetir entre empresas diferentes, então quem identifica a nota é a
   * combinação EMPRESA + NÚMERO.
   *
   * Aqui só AVISAMOS quando a combinação já existe — nunca bloqueamos. Ele disse
   * claramente: "pode gravar como informação mas não proibir".
   */
  const [empresas, setEmpresas] = useState<
    { id: string; nome_curto: string; razao_social: string }[]
  >([])
  const [empresaId, setEmpresaId] = useState('')
  const [avisoRepetida, setAvisoRepetida] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const lista = await pb.collection('empresas_nota').getFullList({
          filter: 'ativa = true',
          sort: 'nome_curto',
        })
        const mapeadas = lista.map((e: any) => ({
          id: e.id,
          nome_curto: String(e.nome_curto || ''),
          razao_social: String(e.razao_social || ''),
        }))
        setEmpresas(mapeadas)
        // se só existe uma, já vem escolhida
        if (mapeadas.length === 1) setEmpresaId(mapeadas[0].id)
      } catch (_) {
        /* sem cadastro de empresas ainda: o campo fica vazio e não trava */
      }
    })()
  }, [])

  /** Confere se a combinação empresa + número já foi usada em outro recebimento. */
  useEffect(() => {
    let cancelado = false
    const numero = nota.trim()
    if (!numero || !empresaId) {
      setAvisoRepetida('')
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const filtro = `nf_numero = "${numero.replace(/"/g, '')}" && empresa_nota = "${empresaId}"`
          const achou = await pb.collection('transactions').getList(1, 1, { filter: filtro })
          if (cancelado) return
          if (achou.totalItems > 0) {
            const nome = empresas.find((e) => e.id === empresaId)?.nome_curto || 'esta empresa'
            setAvisoRepetida(
              `A nota ${numero} já foi registrada por ${nome}. Pode continuar — o sistema só está avisando.`,
            )
          } else {
            setAvisoRepetida('')
          }
        } catch (_) {
          if (!cancelado) setAvisoRepetida('')
        }
      })()
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [nota, empresaId, empresas])

  const abertos = useMemo(() => itens.filter((i) => !i.quitado && i.em_aberto > 0.005), [itens])

  const marcadosLista = useMemo(
    () => abertos.filter((i) => marcados.has(i.id)),
    [abertos, marcados],
  )

  const totalMarcado = useMemo(
    () => marcadosLista.reduce((s, i) => s + i.em_aberto, 0),
    [marcadosLista],
  )

  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.')) || 0
  const falta = Math.max(0, totalMarcado - valorNum)
  const sobra = Math.max(0, valorNum - totalMarcado)
  const parcial = falta > 0.005

  const marcarTodos = () => {
    const novo =
      marcados.size === abertos.length ? new Set<string>() : new Set(abertos.map((i) => i.id))
    setMarcados(novo)
    const soma = abertos.filter((i) => novo.has(i.id)).reduce((s, i) => s + i.em_aberto, 0)
    setValor(soma > 0 ? soma.toFixed(2).replace('.', ',') : '')
  }

  const alternarComValor = (id: string) => {
    const novo = new Set(marcados)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setMarcados(novo)
    const soma = abertos.filter((i) => novo.has(i.id)).reduce((s, i) => s + i.em_aberto, 0)
    if (soma > 0) setValor(soma.toFixed(2).replace('.', ','))
  }

  const registrar = async () => {
    if (marcados.size === 0) return toast.error('Marque ao menos um item para receber.')
    if (!(valorNum > 0)) return toast.error('Informe o valor recebido.')

    if (parcial) {
      const seguir = confirm(
        `Você marcou ${brl(totalMarcado)} em itens mas informou ${brl(valorNum)} de recebimento.\n\n` +
          `O pagamento será registrado como PARCIAL: ${brl(falta)} continuam em aberto nos itens marcados.\n\n` +
          'OK = registrar parcial\nCancelar = voltar e ajustar o valor',
      )
      if (!seguir) return
    }

    setSalvando(true)
    try {
      const marcaNF = nota.trim() ? `nf=${nota.trim()}` : ''
      const lote = `lote=${Date.now()}`
      const rodape = [marcaNF, dataNota ? `nf_data=${dataNota}` : '', obs.trim(), lote]
        .filter(Boolean)
        .join(' ')

      let restante = valorNum
      let linhas = 0

      for (const item of marcadosLista) {
        if (restante <= 0.005) break
        const aplicar = Math.min(item.em_aberto, restante)
        restante -= aplicar
        linhas += 1

        await pb.collection('transactions').create({
          client: clientId,
          date: `${data} 12:00:00.000Z`,
          kind: 'DINHEIRO',
          item_type: 'SERVICO',
          description: nfNumero
            ? `RECEBIMENTO NF ${nfNumero} - ${item.descricao.slice(0, 50)}`
            : `RECEBIMENTO - ${item.descricao.slice(0, 60)}`,
          details: rodape.slice(0, 500),
          quantity: 1,
          unit_price: -Math.abs(aplicar),
          sent_to_finance: 'ENVIADA',
          settles: item.id,
          notes: rodape.slice(0, 300),
          ...dadosNota,
        } as never)
      }

      // pedaço que sobrou vira crédito a favor (não fica preso em item)
      if (restante > 0.005) {
        linhas += 1
        await pb.collection('transactions').create({
          client: clientId,
          date: `${data} 12:00:00.000Z`,
          kind: 'DINHEIRO',
          item_type: 'SERVICO',
          description: nfNumero
            ? `CRÉDITO A FAVOR - NF ${nfNumero} (excedente)`
            : 'CRÉDITO A FAVOR - excedente do recebimento em lote',
          details: rodape.slice(0, 500),
          quantity: 1,
          unit_price: -Math.abs(restante),
          sent_to_finance: 'ENVIADA',
          notes: rodape.slice(0, 300),
          ...dadosNota,
        } as never)
      }

      toast.success(
        `Recebimento registrado: ${brl(valorNum)} em ${linhas} lançamento(s)` +
          (nota.trim() ? ` — NF ${nota.trim()}` : '') +
          (parcial ? `. ${brl(falta)} seguem em aberto.` : '. Itens quitados.'),
      )
      onConcluir()
      onFechar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível registrar o recebimento.')
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
              <Receipt className="h-4 w-4 text-[#0F6A3A]" />
              Receber em lote
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{clienteNome}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onFechar} className="h-7 w-7 shrink-0 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-[11px] font-bold">
                Itens a receber ({marcados.size} de {abertos.length})
              </Label>
              <button
                type="button"
                onClick={marcarTodos}
                className="text-[10px] font-bold text-[#0B3D91] underline"
              >
                {marcados.size === abertos.length && abertos.length > 0
                  ? 'desmarcar todos'
                  : 'marcar todos'}
              </button>
            </div>

            {abertos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                Este cliente não tem itens em aberto.
              </p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-1">
                {abertos.map((i) => {
                  const on = marcados.has(i.id)
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => alternarComValor(i.id)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition ${
                        on ? 'bg-[#0F6A3A]/10 ring-1 ring-[#0F6A3A]/30' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? 'border-[#0F6A3A] bg-[#0F6A3A] text-white' : 'border-slate-300'
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-slate-800">
                          {i.descricao}
                        </span>
                        <span className="block text-[9px] text-muted-foreground">
                          {dataBR(i.data)} · {ROTULO[i.kind] || i.kind}
                          {i.pago > 0.005 ? ` · já pago ${brl(i.pago)}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] font-bold text-slate-900">
                        {brl(i.em_aberto)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {marcados.size > 0 && (
            <div className="rounded-lg bg-[#0F6A3A]/5 p-2 text-[11px]">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Total marcado</span>
                <span className="font-black text-[#0F6A3A]">{brl(totalMarcado)}</span>
              </div>
              {parcial && valorNum > 0 && (
                <div className="mt-0.5 flex justify-between text-amber-700">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Fica em aberto
                  </span>
                  <span className="font-bold">{brl(falta)}</span>
                </div>
              )}
              {sobra > 0.005 && (
                <div className="mt-0.5 flex justify-between text-emerald-700">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Vira crédito
                  </span>
                  <span className="font-bold">{brl(sobra)}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-[10px] font-bold text-slate-600">
              Empresa que emitiu a nota
            </Label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">— não informar —</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_curto}
                </option>
              ))}
            </select>
            {empresas.length === 0 && (
              <p className="mt-0.5 text-[9px] text-amber-700">
                Nenhuma empresa cadastrada. Cadastre em Empresas → Nota fiscal.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-bold text-slate-600">Nº da nota fiscal</Label>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="ex.: 000123"
                className="h-9 text-xs"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-slate-600">Data da nota</Label>
              <Input
                type="date"
                value={dataNota}
                onChange={(e) => setDataNota(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {avisoRepetida && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {avisoRepetida}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-bold text-slate-600">Valor recebido (R$)</Label>
              <Input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="h-9 text-xs font-bold"
              />
            </div>
            <div>
              <Label className="text-[10px] font-bold text-slate-600">Data do recebimento</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-bold text-slate-600">Observação (opcional)</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="ex.: PIX, cheque 123, pagamento parcial combinado"
              className="h-9 text-xs"
            />
          </div>
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
            onClick={registrar}
            disabled={salvando || marcados.size === 0 || !(valorNum > 0)}
            className="h-10 flex-[2] gap-1.5 bg-[#0F6A3A] text-xs font-bold text-white hover:bg-[#0F6A3A]/90"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Receber {valorNum > 0 ? brl(valorNum) : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
