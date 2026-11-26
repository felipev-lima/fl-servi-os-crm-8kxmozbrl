import React, { useState } from 'react'
import html2pdf from 'html2pdf.js'
import type { Client } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getEmpresa, urlArquivo, type Empresa } from '@/lib/empresa'

/**
 * DEMONSTRATIVO DE DÉBITO DO CLIENTE EM PDF (pedido do Felipe, 26/11/2026).
 *
 * SEGUNDO BOTÃO da ficha do cliente, ao lado do "Extrato PDF". O extrato
 * completo (histórico data a data + pagamentos) CONFUNDE o cliente — a escola
 * não sabe distinguir o que já foi pago. Este PDF traz APENAS O DÉBITO REAL:
 *
 *   - somente os itens EM ABERTO (a mesma fonte da tela: /saldo-por-tipo,
 *     itens quitados fora — o mesmo filtro da aba "Todos" da ficha)
 *   - data, descrição, tipo (Capital/Consumo/Serviço) e o valor que falta
 *   - subtotal por tipo e o TOTAL DEVEDOR em destaque
 *   - SEM histórico de pagamentos, SEM itens quitados, SEM valor pago
 *
 * O BOTÃO NÃO ENVIA para ninguém: gera/baixa o PDF e o Felipe escolhe para
 * qual diretor mandar (WhatsApp dele mesmo).
 *
 * COMO É GERADO — MESMO MECANISMO DO EXTRATO: `html2pdf` importado de forma
 * ESTÁTICA (nunca `await import(...)`, que quebrava no celular com
 * "Failed to fetch dynamically imported module" depois de publicar versão
 * nova). No iPhone o download direto é bloqueado, então usamos o menu do
 * sistema (compartilhar), onde existe "Salvar em Arquivos" e o WhatsApp.
 */

interface LinhaDebito {
  id: string
  date: string
  kind: string
  description?: string
  /** valor que ainda falta deste item (em aberto, já descontado o pago) */
  valor: number
}

interface Props {
  client: Client
  itens: LinhaDebito[]
  onClose: () => void
}

const brl = (v: number) =>
  (v < 0 ? '- R$ ' : 'R$ ') +
  Math.abs(v)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const dataBR = (iso?: string) => {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso).slice(0, 10)
}

const rotuloTipo = (kind?: string) => {
  switch (kind) {
    case 'CAPITAL':
      return 'Capital'
    case 'CONSUMO':
      return 'Consumo'
    case 'SERVICO':
      return 'Serviço'
    default:
      return kind || '—'
  }
}

export const DebitoClienteDialog: React.FC<Props> = ({ client, itens, onClose }) => {
  const [gerando, setGerando] = useState(false)
  /** Mensagem amigável no lugar do erro cru. null = sem erro. */
  const [erro, setErro] = useState<string | null>(null)

  const gerar = async () => {
    setGerando(true)
    setErro(null)
    try {
      // só o que está em aberto, do mais antigo ao mais recente
      const emAberto = [...itens]
        .filter((i) => i.valor > 0.005)
        .sort((a, b) => {
          const da = String(a.date || '')
          const db = String(b.date || '')
          if (da !== db) return da < db ? -1 : 1
          return 0
        })

      if (emAberto.length === 0) {
        toast.info('Este cliente não tem valores em aberto — nada para demonstrar.')
        setGerando(false)
        return
      }

      // dados da empresa (cabeçalho e rodapé)
      let empresa: Empresa | null = null
      try {
        empresa = await getEmpresa(true)
      } catch (_) {
        empresa = null
      }
      const logo = empresa ? urlArquivo(empresa, 'logo') : ''

      // subtotal por tipo
      const porTipo: Record<string, number> = { CAPITAL: 0, CONSUMO: 0, SERVICO: 0 }
      for (const i of emAberto) {
        porTipo[i.kind] = (porTipo[i.kind] || 0) + i.valor
      }
      const total = emAberto.reduce((s, i) => s + i.valor, 0)

      const linhas = emAberto
        .map(
          (i) => `<tr>
            <td style="white-space:nowrap">${dataBR(i.date)}</td>
            <td>${(i.description || '').replace(/</g, '&lt;')}</td>
            <td style="white-space:nowrap">${rotuloTipo(i.kind)}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:bold;color:#111">${brl(i.valor)}</td>
          </tr>`,
        )
        .join('')

      const blocosTipo = (['CAPITAL', 'CONSUMO', 'SERVICO'] as const)
        .filter((k) => porTipo[k] > 0.005)
        .map(
          (k) => `<tr>
            <td style="border:none;padding:2px 4px">${rotuloTipo(k)}</td>
            <td style="border:none;padding:2px 4px;text-align:right;font-weight:bold">${brl(porTipo[k])}</td>
          </tr>`,
        )
        .join('')

      const nomeArquivo = `Debito - ${(client.nickname || client.name || 'cliente')
        .normalize('NFC')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)}.pdf`

      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#222;padding:6mm">
  <table style="width:100%;border-collapse:collapse;border:none;border-bottom:2.5px solid #0B3D91;margin-bottom:8px">
    <tr>
      <td style="width:48px;border:none;padding:0 8px 6px 0;vertical-align:middle">
        ${logo ? `<img src="${logo}" style="max-width:44px;max-height:44px"/>` : `<div style="width:40px;height:40px;background:#0B3D91;color:#fff;border-radius:6px;text-align:center;line-height:40px;font-weight:bold;font-size:17px">FL</div>`}
      </td>
      <td style="border:none;padding:0 0 6px 0;vertical-align:middle">
        <div style="color:#0B3D91;font-size:17px;font-weight:bold">FL SERVIÇOS CRM</div>
        <div style="color:#666;font-size:8.5px">CFTV • Alarme • Rede • Automação • Manutenção</div>
      </td>
      <td style="border:none;padding:0 0 6px 0;text-align:right;vertical-align:middle">
        <div style="font-size:12px;font-weight:bold;color:#0B3D91">DEMONSTRATIVO DE DÉBITO</div>
        <div style="color:#666;font-size:8.5px">Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:8px">
    <tr><td style="border:none;padding:2px 0;width:88px;font-weight:bold">Cliente</td><td style="border:none;padding:2px 0">${client.name || ''}</td></tr>
    ${client.document ? `<tr><td style="border:none;padding:2px 0;font-weight:bold">CNPJ/CPF</td><td style="border:none;padding:2px 0">${client.document}</td></tr>` : ''}
    ${client.address ? `<tr><td style="border:none;padding:2px 0;font-weight:bold">Endereço</td><td style="border:none;padding:2px 0">${client.address}${client.neighborhood ? ' — ' + client.neighborhood : ''}${client.city ? ' — ' + client.city : ''}</td></tr>` : ''}
  </table>

  <div style="font-size:10px;font-weight:bold;color:#0B3D91;border-bottom:1px solid #0B3D91;padding-bottom:2px;margin-bottom:4px;text-transform:uppercase">Valores em aberto</div>
  <table style="width:100%;border-collapse:collapse;font-size:8.5px">
    <thead>
      <tr style="background:#EEF2FA">
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left;width:56px">Data</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left">Descrição</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left;width:58px">Tipo</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:right;width:74px">Valor</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  <div style="background:#EEF2FA;border:1px solid #C7D5EF;border-radius:5px;padding:7px;margin-top:9px">
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      ${blocosTipo}
      <tr>
        <td style="border:none;padding:6px 4px 2px;font-weight:bold;font-size:11.5px;border-top:1.5px solid #0B3D91">TOTAL DEVEDOR</td>
        <td style="border:none;padding:6px 4px 2px;text-align:right;font-weight:bold;font-size:13px;color:${total > 0 ? '#B91C1C' : '#0B3D91'};border-top:1.5px solid #0B3D91">${brl(total)}</td>
      </tr>
    </table>
  </div>

  <div style="margin-top:9px;padding-top:6px;border-top:1px solid #ddd;color:#888;font-size:7.5px;line-height:1.5">
    ${empresa?.razao_social || 'FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO'} • CNPJ ${empresa?.cnpj || '44.288.125/0001-34'}${empresa?.ie ? ' • IE ' + empresa.ie : ''}<br>
    ${empresa?.endereco || 'VILA UNIÃO, 92 — LAGOMAR — MACAÉ/RJ — CEP 27.966-507'}${empresa?.telefone ? ' • ' + empresa.telefone : ''}<br>
    Este demonstrativo lista apenas os valores que permanecem em aberto. Em caso de divergência, fale com a FL SERVIÇOS.
  </div>
</div>`

      // gera o PDF no navegador (mesmo mecanismo do extrato)
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
          toast.success('Demonstrativo de débito gerado.')
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
      toast.success('Demonstrativo salvo nos downloads.')
      onClose()
    } catch (err: any) {
      console.error('DÉBITO ERRO:', err)
      // erro AMIGÁVEL dentro do diálogo, com "Tentar novamente"
      const tecnico = String(err?.message || err || 'erro desconhecido')
      setErro(`Não foi possível gerar o demonstrativo. Motivo: ${tecnico}`)
    } finally {
      setGerando(false)
    }
  }

  const nome = client.nickname || client.name || 'cliente'
  const totalAberto = itens.reduce((s, i) => s + i.valor, 0)

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
        aria-label="Demonstrativo de débito do cliente"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <FileText className="h-4 w-4 text-[#0B3D91]" />
              Débito do cliente
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{nome}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 shrink-0 p-0"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
          O PDF traz <strong>somente o que ainda falta pagar</strong> ({itens.length}{' '}
          {itens.length === 1 ? 'item' : 'itens'}, <strong>{brl(totalAberto)}</strong>) — sem
          pagamentos, sem itens quitados, sem histórico. Limpo para enviar à escola.
        </p>

        {erro && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-900"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{erro}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1.5 h-7 border-rose-300 text-[10px] font-bold text-rose-900 hover:bg-rose-100"
                onClick={() => void gerar()}
              >
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 flex-1 text-xs"
            disabled={gerando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="h-9 flex-[2] gap-1.5 bg-[#0B3D91] text-xs font-bold text-white hover:bg-[#0B3D91]/90"
          >
            {gerando ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" /> Gerar PDF
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
