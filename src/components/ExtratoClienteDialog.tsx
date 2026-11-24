import React, { useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { Client } from '@/types/flservicos'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { getEmpresa, urlArquivo, type Empresa } from '@/lib/empresa'

/**
 * EXTRATO DE DÉBITO DO CLIENTE EM PDF (pedido do Felipe, 24/11/2026).
 *
 * O QUE O DOCUMENTO MOSTRA
 *   - resumo por tipo: capital, consumo, serviço, pagamentos e DÉBITO TOTAL
 *   - o histórico completo, data a data, do mais antigo ao mais recente
 *   - os dados da empresa no cabeçalho e no rodapé
 *
 * O QUE ELE NÃO MOSTRA
 *   - custo do produto e margem. Este PDF VAI PARA O CLIENTE: quanto a FL pagou
 *     na peça é informação interna.
 *
 * COMO É GERADO
 *   `html2pdf` monta o arquivo no próprio navegador. No iPhone o download direto
 *   é bloqueado pelo Chrome, então usamos o menu do sistema (o mesmo caminho do
 *   PDF da OS), onde existe "Salvar em Arquivos" e o envio por WhatsApp.
 */

interface Lancamento {
  id: string
  date: string
  kind: string
  item_type?: string
  description?: string
  details?: string
  quantity?: number
  unit_price?: number
  work_order_ref?: string
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

/** Rótulo amigável de cada tipo de lançamento. */
const rotuloTipo = (kind?: string) => {
  switch (kind) {
    case 'CAPITAL':
      return 'Capital'
    case 'CONSUMO':
      return 'Consumo'
    case 'SERVICO':
      return 'Serviço'
    case 'DINHEIRO':
      return 'Pagamento'
    default:
      return kind || '—'
  }
}

interface Props {
  client: Client
  onClose: () => void
}

export const ExtratoClienteDialog: React.FC<Props> = ({ client, onClose }) => {
  const [gerando, setGerando] = useState(false)

  const gerar = async () => {
    setGerando(true)
    try {
      // 1) lançamentos do cliente, do mais antigo para o mais recente
      const lancamentos = (await pb.collection('transactions').getFullList({
        filter: `client = "${client.id}"`,
        sort: 'date,created',
      })) as unknown as Lancamento[]

      if (lancamentos.length === 0) {
        toast.info('Este cliente não tem lançamentos no histórico.')
        setGerando(false)
        return
      }

      // 2) dados da empresa (cabeçalho e rodapé)
      let empresa: Empresa | null = null
      try {
        empresa = await getEmpresa(true)
      } catch (_) {
        empresa = null
      }
      const logo = empresa ? urlArquivo(empresa, 'logo') : ''

      // 3) somas por tipo
      let capital = 0
      let consumo = 0
      let servico = 0
      let pagamentos = 0
      for (const l of lancamentos) {
        const v = Number(l.quantity || 0) * Number(l.unit_price || 0)
        if (l.kind === 'DINHEIRO') pagamentos += v
        else if (l.item_type === 'SERVICO' || l.kind === 'SERVICO') servico += v
        else if (l.kind === 'CAPITAL') capital += v
        else consumo += v
      }
      const debito = capital + consumo + servico + pagamentos

      const linhas = lancamentos
        .map((l) => {
          const v = Number(l.quantity || 0) * Number(l.unit_price || 0)
          const qtd =
            Number(l.quantity || 0) > 0 && Number(l.unit_price || 0) > 0
              ? `${l.quantity} × ${brl(Number(l.unit_price || 0))}`
              : ''
          return `<tr>
            <td style="white-space:nowrap">${dataBR(l.date)}</td>
            <td>${(l.description || '').replace(/</g, '&lt;')}</td>
            <td style="white-space:nowrap">${rotuloTipo(l.kind)}</td>
            <td style="text-align:right;white-space:nowrap">${qtd}</td>
            <td style="text-align:right;white-space:nowrap;font-weight:bold;color:${
              v < 0 ? '#0F6A3A' : '#111'
            }">${brl(v)}</td>
          </tr>`
        })
        .join('')

      const nomeArquivo = `Extrato - ${(client.nickname || client.name || 'cliente')
        .normalize('NFC')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)}.pdf`

      const html = `
<div id="extrato-pdf" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#222;padding:6mm">
  <table style="width:100%;border-collapse:collapse;border:none;border-bottom:2.5px solid #0F6A3A;margin-bottom:8px">
    <tr>
      <td style="width:48px;border:none;padding:0 8px 6px 0;vertical-align:middle">
        ${logo ? `<img src="${logo}" style="max-width:44px;max-height:44px"/>` : `<div style="width:40px;height:40px;background:#0F6A3A;color:#fff;border-radius:6px;text-align:center;line-height:40px;font-weight:bold;font-size:17px">FL</div>`}
      </td>
      <td style="border:none;padding:0 0 6px 0;vertical-align:middle">
        <div style="color:#0F6A3A;font-size:17px;font-weight:bold">F. L. SERVIÇOS</div>
        <div style="color:#666;font-size:8.5px">CFTV • Alarme • Rede • Automação • Manutenção</div>
      </td>
      <td style="border:none;padding:0 0 6px 0;text-align:right;vertical-align:middle">
        <div style="font-size:12px;font-weight:bold;color:#0B3D91">EXTRATO DE DÉBITO</div>
        <div style="color:#666;font-size:8.5px">Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
      </td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:8px">
    <tr><td style="border:none;padding:2px 0;width:88px;font-weight:bold">Cliente</td><td style="border:none;padding:2px 0">${client.name || ''}</td></tr>
    ${client.nickname ? `<tr><td style="border:none;padding:2px 0;font-weight:bold">Referência</td><td style="border:none;padding:2px 0">${client.nickname}</td></tr>` : ''}
    ${client.document ? `<tr><td style="border:none;padding:2px 0;font-weight:bold">CNPJ/CPF</td><td style="border:none;padding:2px 0">${client.document}</td></tr>` : ''}
    ${client.address ? `<tr><td style="border:none;padding:2px 0;font-weight:bold">Endereço</td><td style="border:none;padding:2px 0">${client.address}${client.neighborhood ? ' — ' + client.neighborhood : ''}${client.city ? ' — ' + client.city : ''}</td></tr>` : ''}
  </table>

  <div style="background:#F1F8F4;border:1px solid #CFE6D8;border-radius:5px;padding:7px;margin-bottom:9px">
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <tr>
        <td style="border:none;padding:2px 4px">Capital</td><td style="border:none;padding:2px 4px;text-align:right;font-weight:bold">${brl(capital)}</td>
        <td style="border:none;padding:2px 4px">Consumo</td><td style="border:none;padding:2px 4px;text-align:right;font-weight:bold">${brl(consumo)}</td>
      </tr>
      <tr>
        <td style="border:none;padding:2px 4px">Serviço</td><td style="border:none;padding:2px 4px;text-align:right;font-weight:bold">${brl(servico)}</td>
        <td style="border:none;padding:2px 4px">Pagamentos</td><td style="border:none;padding:2px 4px;text-align:right;font-weight:bold;color:#0F6A3A">${brl(pagamentos)}</td>
      </tr>
      <tr>
        <td colspan="3" style="border:none;padding:5px 4px 2px;font-weight:bold;font-size:11px;border-top:1px solid #CFE6D8">DÉBITO TOTAL</td>
        <td style="border:none;padding:5px 4px 2px;text-align:right;font-weight:bold;font-size:12px;color:${debito > 0 ? '#B91C1C' : '#0F6A3A'};border-top:1px solid #CFE6D8">${brl(debito)}</td>
      </tr>
    </table>
  </div>

  <div style="font-size:10px;font-weight:bold;color:#0F6A3A;border-bottom:1px solid #0F6A3A;padding-bottom:2px;margin-bottom:4px;text-transform:uppercase">Histórico de lançamentos</div>
  <table style="width:100%;border-collapse:collapse;font-size:8.5px">
    <thead>
      <tr style="background:#F4F4F4">
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left;width:56px">Data</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left">Descrição</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:left;width:58px">Tipo</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:right;width:82px">Qtd × Unit.</th>
        <th style="border:1px solid #ddd;padding:3px 4px;text-align:right;width:74px">Valor</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  <div style="margin-top:9px;padding-top:6px;border-top:1px solid #ddd;color:#888;font-size:7.5px;line-height:1.5">
    ${empresa?.razao_social || 'FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO'} • CNPJ ${empresa?.cnpj || '44.288.125/0001-34'}${empresa?.ie ? ' • IE ' + empresa.ie : ''}<br>
    ${empresa?.endereco || 'VILA UNIÃO, 92 — LAGOMAR — MACAÉ/RJ — CEP 27.966-507'}${empresa?.telefone ? ' • ' + empresa.telefone : ''}<br>
    Este extrato é um resumo dos serviços prestados e dos pagamentos recebidos. Em caso de divergência, fale com a F. L. SERVIÇOS.
  </div>
</div>`

      // 4) gera o PDF no navegador
      const alvo = document.createElement('div')
      alvo.style.position = 'fixed'
      alvo.style.left = '-10000px'
      alvo.innerHTML = html
      document.body.appendChild(alvo)

      const html2pdf = (await import('html2pdf.js')).default as any
      const blob: Blob = await html2pdf()
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
          toast.success('Extrato gerado.')
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
      toast.success('Extrato salvo nos downloads.')
      onClose()
    } catch (err: any) {
      console.error('EXTRATO ERRO:', err)
      // Mostra o motivo real: um "tente novamente" genérico esconde a causa e
      // não permite ao Felipe nem a mim saber o que consertar.
      toast.error(`Não foi possível gerar o extrato: ${err?.message || err || 'erro desconhecido'}`)
    } finally {
      setGerando(false)
    }
  }

  const nome = client.nickname || client.name || 'cliente'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <FileText className="h-4 w-4 text-[#0F6A3A]" />
              Extrato de débito
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{nome}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 shrink-0 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
          O PDF traz o resumo por tipo (capital, consumo, serviço e pagamentos), o histórico
          completo data a data e o débito total. Vai pronto para enviar ao cliente — sem custo nem
          margem.
        </p>

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
            className="h-9 flex-[2] gap-1.5 bg-[#0F6A3A] text-xs font-bold text-white hover:bg-[#0F6A3A]/90"
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
