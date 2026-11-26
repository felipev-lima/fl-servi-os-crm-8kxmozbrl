import React, { useMemo, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getEmpresa, urlArquivo, type Empresa } from '@/lib/empresa'
import { ROTULO_ORDEM, type OrdemDebito } from '@/lib/ordenacaoDebito'
import { brl, dataBR, type ClientSummary } from '@/types/crm'

/**
 * RELATÓRIO DE DÉBITO POR CLIENTE EM PDF (pedido do Felipe, 27/11/2026).
 *
 * A MESMA TABELA que está na tela — nome do cliente, quantidade de
 * lançamentos e valor do débito — só que imprimível, para ele cobrar
 * devedor e também para listar as escolas sem movimento (prospecção).
 *
 * REGRAS:
 *  - o débito é o MESMO número da ficha do cliente (Saldo Devedor: soma de
 *    todas as linhas, pagamento entra negativo e abate);
 *  - a ordem é EXATAMENTE a que o Felipe escolheu nos botões da tabela —
 *    o componente recebe a lista já ordenada e não mexe nela;
 *  - devedores primeiro, depois saldo zero, depois crédito (regra da tela);
 *  - html2pdf importado de forma ESTÁTICA (nunca `await import(...)`, que
 *    quebrava no celular — mesmo padrão do ExtratoClienteDialog).
 *
 * No iPhone o download direto é bloqueado: usamos o menu do sistema
 * (compartilhar), que tem "Salvar em Arquivos" e WhatsApp — igual ao
 * Demonstrativo de débito da ficha.
 */

interface Props {
  clientes: ClientSummary[]
  ordem: OrdemDebito
  onClose: () => void
}

/** Escapa texto vindo do banco antes de entrar no HTML do PDF. */
const esc = (s?: string) => (s || '').replace(/</g, '&lt;')

export const RelatorioDebitoDialog: React.FC<Props> = ({ clientes, ordem, onClose }) => {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const totalGeral = useMemo(() => clientes.reduce((s, c) => s + c.saldo, 0), [clientes])
  const devedores = useMemo(() => clientes.filter((c) => c.saldo > 0.005), [clientes])
  const totalDevedores = useMemo(() => devedores.reduce((s, c) => s + c.saldo, 0), [devedores])

  const gerar = async () => {
    if (clientes.length === 0) return
    setGerando(true)
    setErro(null)
    try {
      let empresa: Empresa | null = null
      try {
        empresa = await getEmpresa(true)
      } catch (_) {
        empresa = null
      }
      const logo = empresa ? urlArquivo(empresa, 'logo') : ''

      const agora = new Date()
      const nomeArquivo = `RELATORIO-DEBITO-POR-CLIENTE-${agora
        .toLocaleDateString('pt-BR')
        .replace(/\//g, '-')}.pdf`

      const linhas = clientes
        .map((c, i) => {
          const devedor = c.saldo > 0.005
          const credito = c.saldo < -0.005
          const cor = devedor ? '#B91C1C' : credito ? '#15803D' : '#64748B'
          const nome = c.nickname || c.name || '—'
          const razao = c.nickname ? c.name : ''
          const ultimo = c.ultimo_lancamento ? dataBR(c.ultimo_lancamento) : '—'
          return `<tr style="background:${i % 2 ? '#F7F9FD' : '#FFFFFF'}">
            <td style="border:1px solid #ddd;padding:3px 4px;text-align:right;color:#666">${i + 1}</td>
            <td style="border:1px solid #ddd;padding:3px 4px">${esc(nome)}${
              razao ? `<span style="color:#888;font-size:7.5px"> — ${esc(razao)}</span>` : ''
            }</td>
            <td style="border:1px solid #ddd;padding:3px 4px;text-align:center">${c.lancamentos}</td>
            <td style="border:1px solid #ddd;padding:3px 4px;text-align:center;white-space:nowrap">${ultimo}</td>
            <td style="border:1px solid #ddd;padding:3px 4px;text-align:right;font-weight:bold;white-space:nowrap;color:${cor}">${brl(c.saldo)}</td>
          </tr>`
        })
        .join('')

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:2px">
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <tr>
      <td style="border:none;width:64px;vertical-align:middle">${
        logo
          ? `<img src="${logo}" style="max-width:64px;max-height:40px;object-fit:contain" alt="logo" />`
          : ''
      }</td>
      <td style="border:none;vertical-align:middle">
        <div style="font-size:13px;font-weight:bold;color:#0B3D91">FL SERVIÇOS CRM</div>
        <div style="font-size:9.5px;color:#555">${esc(empresa?.razao_social || 'FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO')} • CNPJ ${esc(
          empresa?.cnpj || '44.288.125/0001-34',
        )}</div>
      </td>
      <td style="border:none;vertical-align:middle;text-align:right;font-size:9px;color:#555">
        Emitido em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
    </tr>
  </table>

  <div style="font-size:13px;font-weight:bold;margin-bottom:2px">RELATÓRIO DE DÉBITO POR CLIENTE</div>
  <div style="font-size:9px;color:#666;margin-bottom:6px">
    ${clientes.length} cliente(s) • Ordem: ${ROTULO_ORDEM[ordem]} • Devedores primeiro, depois saldo zero, depois crédito
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:8.5px">
    <thead>
      <tr style="background:#0B3D91;color:#fff">
        <th style="border:1px solid #0B3D91;padding:3px 4px;width:22px">#</th>
        <th style="border:1px solid #0B3D91;padding:3px 4px;text-align:left">Cliente</th>
        <th style="border:1px solid #0B3D91;padding:3px 4px;width:52px;text-align:center">Lanç.</th>
        <th style="border:1px solid #0B3D91;padding:3px 4px;width:62px;text-align:center">Último</th>
        <th style="border:1px solid #0B3D91;padding:3px 4px;width:78px;text-align:right">Débito</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
    <tfoot>
      <tr style="background:#EEF2FA;font-weight:bold">
        <td style="border:1px solid #ddd;padding:4px" colspan="4">TOTAL GERAL (${clientes.length} cliente(s))</td>
        <td style="border:1px solid #ddd;padding:4px;text-align:right;white-space:nowrap">${brl(totalGeral)}</td>
      </tr>
      <tr style="background:#FEF2F2;font-weight:bold;color:#B91C1C">
        <td style="border:1px solid #ddd;padding:4px" colspan="4">SOMA DOS DEVEDORES (${devedores.length} cliente(s) com débito)</td>
        <td style="border:1px solid #ddd;padding:4px;text-align:right;white-space:nowrap">${brl(totalDevedores)}</td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:8px;padding-top:5px;border-top:1px solid #ddd;color:#888;font-size:7.5px;line-height:1.5">
    Débito = mesmo Saldo Devedor da ficha do cliente (lançamentos menos pagamentos).<br>
    Em caso de divergência, fale com a FL SERVIÇOS.
  </div>
</div>`

      // gera o PDF fora da tela (mesmo mecanismo do extrato/débito da ficha)
      const alvo = document.createElement('div')
      alvo.style.position = 'fixed'
      alvo.style.left = '-10000px'
      alvo.innerHTML = html
      document.body.appendChild(alvo)

      const blob: Blob = await (html2pdf as unknown as (opts?: unknown) => any)()
        .set({
          margin: [4, 4, 4, 4],
          filename: nomeArquivo,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(alvo.firstElementChild as HTMLElement)
        .outputPdf('blob')

      document.body.removeChild(alvo)

      const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' })
      const nav = navigator as any

      // celular: menu do sistema (Salvar em Arquivos / WhatsApp)
      if (nav.canShare && nav.canShare({ files: [arquivo] })) {
        try {
          await nav.share({ files: [arquivo], title: nomeArquivo })
          toast.success('Relatório gerado.')
          onClose()
          return
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            setGerando(false)
            return
          }
        }
      }

      // computador: baixa
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('Relatório salvo nos downloads.')
      onClose()
    } catch (err: any) {
      console.error('RELATÓRIO DÉBITO ERRO:', err)
      const tecnico = String(err?.message || err || 'erro desconhecido')
      setErro(`Não foi possível gerar o relatório. Motivo: ${tecnico}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Relatório de débito por cliente em PDF"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <FileText className="h-4 w-4 text-[#0B3D91]" />
              Relatório de débito por cliente
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Mesma tabela da tela, no PDF — na ordem escolhida: {ROTULO_ORDEM[ordem]}.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-lg border bg-slate-50 p-3 text-[11px] text-muted-foreground">
          {clientes.length} cliente(s) na lista, no total de{' '}
          <span className="font-mono font-bold text-foreground">{brl(totalGeral)}</span>
          {devedores.length > 0 && (
            <>
              {' '}
              — sendo <span className="font-bold text-red-800">{devedores.length}</span> com débito
              (soma <span className="font-mono font-bold text-red-800">{brl(totalDevedores)}</span>
              ).
            </>
          )}
          Clientes sem lançamento nenhum entram no final, para prospecção de vendas.
        </div>

        {erro && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {erro && (
            <Button
              variant="outline"
              className="h-9 flex-1 text-[11px]"
              onClick={() => setErro(null)}
            >
              Voltar
            </Button>
          )}
          <Button
            onClick={gerar}
            disabled={gerando || clientes.length === 0}
            className="h-9 flex-1 gap-1.5 bg-[#0B3D91] text-[11px] text-white hover:bg-[#0B3D91]/90"
          >
            {gerando ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando PDF...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                {erro ? 'Tentar novamente' : 'Gerar PDF'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
