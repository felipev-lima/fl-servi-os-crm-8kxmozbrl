import React from 'react'
import { WorkOrder, OrderMaterial, OrderPhoto } from '@/types/flservicos'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Printer,
  Download,
  Share2,
  CheckCircle2,
  MapPin,
  Calendar,
  User,
  Wrench,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { getFileUrl } from '@/services/api'
import { getEmpresa, type Empresa } from '@/lib/empresa'

interface ReportTemplateV3Props {
  order: WorkOrder
  materials: OrderMaterial[]
  photos: OrderPhoto[]
  onClose?: () => void
}

export const ReportTemplateV3: React.FC<ReportTemplateV3Props> = ({
  order,
  materials,
  photos,
  onClose,
}) => {
  // Valores de material (custo) so aparecem para o administrador. O PDF vai para
  // o cliente, que nao deve ver quanto a empresa pagou na peca.
  const { isAdmin } = useAuth()

  // A assinatura do administrador so entra no documento quando quem emite e o
  // admin — e ele quem fecha o valor e manda a proposta ao cliente.
  const [adminRubrica, setAdminRubrica] = React.useState('')
  const [adminNome, setAdminNome] = React.useState('')
  /** dados da empresa: o rodapé lê daqui, não de texto fixo no componente */
  const [empresa, setEmpresa] = React.useState<Empresa>({})

  React.useEffect(() => {
    getEmpresa()
      .then(setEmpresa)
      .catch(() => setEmpresa({}))
  }, [])

  React.useEffect(() => {
    if (!isAdmin) return
    let cancelado = false
    ;(async () => {
      try {
        const lista = await pb
          .collection('technicians')
          .getFullList({ filter: 'active = true', sort: 'name' })

        // O cadastro de técnico e o usuário de login podem ter e-mails
        // diferentes no mesmo nome (o do técnico veio do sistema antigo), então
        // casar por e-mail falhava. Aqui procura por e-mail; se não achar,
        // cai para o nome. Entre os candidatos, fica o que TEM rubrica.
        const usuarios = await pb.collection('users').getFullList({ filter: "role = 'admin'" })
        const emails = usuarios.map((u: any) => String(u.email || '').toLowerCase())
        const nomes = usuarios.map((u: any) => String(u.name || '').toLowerCase())

        const normal = (s: string) =>
          String(s || '')
            .toLowerCase()
            .trim()
        const porEmail = lista.filter((t: any) => emails.includes(normal(t.email)))
        const candidatos =
          porEmail.length > 0
            ? porEmail
            : lista.filter((t: any) =>
                nomes.some((n) => n && normal(t.name).includes(n.split(' ')[0])),
              )

        const comRubrica = candidatos.filter((t: any) => t.signature)
        const admin = comRubrica[0] || candidatos[0] || null

        if (cancelado) return
        setAdminNome((admin as any)?.name || 'Administrador')
        setAdminRubrica(
          admin && (admin as any).signature
            ? pb.files.getURL(admin as any, (admin as any).signature)
            : '',
        )
      } catch (_) {
        if (!cancelado) setAdminNome('Administrador')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [isAdmin])

  /**
   * A impressão no iPhone tem uma pegadinha: só o SAFARI abre a janela de
   * impressão. O Chrome (e qualquer navegador que não seja o Safari no iOS)
   * ignora a chamada `window.print()` — tocar no botão não faz nada.
   * Isso é limitação do próprio sistema, não do app.
   */
  const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const ehSafari =
    /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  const impressaoDisponivel = !ehIOS || ehSafari

  // ---- PDF pré-gerado -----------------------------------------------------
  // O menu do iPhone PRECISA abrir no instante do toque. Gerar o PDF leva 2-3
  // segundos; se a geração acontecer dentro do clique, o menu não abre e o
  // botão parece travado. Solução: gera o PDF quando a tela abre e guarda.
  const pdfRef = React.useRef<File | null>(null)
  const [preparandoPdf, setPreparandoPdf] = React.useState(true)

  const nomeArquivo = () => {
    // Nome COMPLETO do cliente no arquivo: é por ele que o Felipe acha a OS
    // depois no WhatsApp ou na pasta. Só removemos o que o sistema de arquivos
    // não aceita (barras, dois-pontos etc.) e mantemos o resto inteiro.
    const cli = (order.expand?.client?.name || 'cliente')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90)
    return `OS-${order.order_number} - ${cli}.pdf`
  }

  const gerarPdf = async (): Promise<File | null> => {
    const alvo = document.getElementById('relatorio-os-pdf')
    if (!alvo) return null
    const html2pdf = (await import('html2pdf.js')).default as any
    const nome = nomeArquivo()
    const blob: Blob = await html2pdf()
      .set({
        margin: [4, 5, 4, 5],
        filename: nome,
        // Qualidade mais leve: a impressão no iPhone fica presa quando o
        // arquivo é grande demais (o iOS demora a preparar e trava em 0%).
        // 0,9 de qualidade e escala 2: a foto sai nítida no papel sem deixar
        // o arquivo pesado a ponto de travar a impressão no iPhone.
        image: { type: 'jpeg', quality: 0.9 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(alvo)
      .outputPdf('blob')
    return new File([blob], nome, { type: 'application/pdf' })
  }

  React.useEffect(() => {
    let cancelado = false
    setPreparandoPdf(true)
    const t = setTimeout(() => {
      void (async () => {
        try {
          const f = await gerarPdf()
          if (!cancelado && f) pdfRef.current = f
        } catch (_) {
          /* sem PDF pronto: o botão avisa e o usuário tenta de novo */
        } finally {
          if (!cancelado) setPreparandoPdf(false)
        }
      })()
    }, 900)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, materials.length, photos.length])

  /** Abre o menu do sistema com o PDF em anexo — precisa ser direto no toque. */
  const compartilharPdf = () => {
    const arquivo = pdfRef.current
    const nav = navigator as any
    if (!arquivo) {
      toast.info('O PDF ainda está sendo preparado. Toque de novo em instantes.', {
        duration: 4000,
      })
      return
    }
    if (nav.canShare && nav.canShare({ files: [arquivo] })) {
      void nav
        .share({
          files: [arquivo],
          title: arquivo.name,
          text: 'No menu, toque em "Imprimir" para enviar à impressora.',
        })
        .catch(() => {})
      return
    }
    // computador: baixa o arquivo
    const url = URL.createObjectURL(arquivo)
    const a = document.createElement('a')
    a.href = url
    a.download = arquivo.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    toast.success('PDF salvo nos downloads.')
  }

  const handlePrint = () => {
    // Safari (iPhone) e computador: janela de impressão do sistema.
    if (impressaoDisponivel) {
      try {
        window.print()
      } catch (_) {
        toast.error('Não foi possível abrir a impressão neste navegador.')
      }
      return
    }
    // Chrome no iPhone: menu do sistema com o PDF pronto (tem "Imprimir").
    compartilharPdf()
  }

  const handleSalvarPdf = () => compartilharPdf()

  const podeCompartilhar = typeof navigator !== 'undefined' && !!navigator.share

  /** Compartilhar: manda a página do relatório pelo menu do celular. */
  const handleCompartilhar = async () => {
    try {
      await navigator.share({
        title: `OS ${order.order_number} — ${order.expand?.client?.name || 'Cliente'}`,
        text: `Relatório da Ordem de Serviço nº ${order.order_number} — LM SERVIÇOS`,
        url: window.location.href,
      })
    } catch (_) {
      // usuário cancelou: não é erro
    }
  }

  const client = order.expand?.client
  const technician = order.expand?.technician

  const totalMaterialsPrice = materials.reduce((acc, m) => acc + (m.total_price || 0), 0)
  // Valor da mão de obra lançado pelo admin na OS: entra no TOTAL GERAL do
  // documento (antes o PDF mostrava só o material e o serviço ficava de fora).
  const valorServico = (order as any).service_value || 0

  const formattedDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_) {
      return dateStr
    }
  }

  const signatureUrl = order.signature_image
    ? getFileUrl('work_orders', order.id, order.signature_image)
    : ''

  return (
    <div className="flex flex-col items-center bg-slate-100 min-h-screen py-6 px-2 sm:px-4 print:bg-white print:p-0">
      {/* Barra de Ações Superior (Oculta na impressão) */}
      <div className="w-full max-w-[210mm] bg-white rounded-lg shadow-sm border p-3 mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#0B3D91]" />
          <span className="font-semibold text-sm text-foreground">
            Relatório Técnico PDF — Template_OS_V3 (A4)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Voltar
            </Button>
          )}
          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-[#0B3D91] hover:bg-[#0B3D91]/90 text-white gap-1.5 shadow"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSalvarPdf}
            disabled={preparandoPdf}
            className="gap-1.5 text-[#0B3D91] border-[#0B3D91]/40 hover:bg-[#0B3D91]/10"
          >
            {preparandoPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {preparandoPdf ? 'Preparando...' : 'Salvar PDF'}
          </Button>
          {podeCompartilhar && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCompartilhar}
              className="gap-1.5 text-[#0B3D91] border-[#0B3D91]/40 hover:bg-[#0B3D91]/10"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar
            </Button>
          )}
        </div>
      </div>

      {/* Folha A4 do Relatório */}
      <div
        id="relatorio-os-pdf"
        /*
         * IMPRESSÃO: caber mais em cada folha (22/11/2026).
         * O padding de 28px em volta virava margem dupla (somada à do @page),
         * e o texto a 12px com leading-snug esticava o documento. No papel usa
         * o espaço que a folha tem; na tela continua confortável.
         */
        className="w-full max-w-[210mm] bg-white shadow-xl rounded-none border border-slate-300 print:border-none print:shadow-none print:p-0 print:max-w-none print:text-[10.5px] print:leading-[1.3] p-4 sm:p-6 lg:p-7 font-sans text-slate-800 text-[12px] leading-snug"
      >
        {/* CABEÇALHO COM IDENTIDADE VISUAL */}
        <div className="border-b-4 border-[#0B3D91] pb-1.5 mb-1.5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 bg-gradient-to-br from-[#0B3D91] to-[#1E6FD9] text-white flex items-center justify-center font-black text-base rounded shadow shrink-0">
                LM
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-black tracking-tight text-[#0B3D91] uppercase leading-none">
                  LM SERVIÇOS
                </h1>
                <p className="text-[10px] sm:text-[11px] text-slate-600 leading-tight mt-1">
                  CFTV • Alarme • Rede • Automação • Manutenção
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <div className="inline-block bg-[#0B3D91]/10 border border-[#0B3D91]/30 px-2.5 py-1 rounded text-[#0B3D91] font-bold text-[11px] sm:text-sm">
                ORDEM DE SERVIÇO Nº {order.order_number}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Data: {formattedDate(order.opened_at || order.created)}
              </div>
              <div className="mt-1">
                <span
                  className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                    order.status === 'FINALIZADA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : order.status === 'EM ANDAMENTO'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/*
          DUAS COLUNAS SEMPRE (ajuste 22/11/2026).
          No celular ficava UMA coluna, e os dois quadros empilhados somavam
          69 mm — a OS passava de uma folha (297 mm contra 287 úteis). Como o
          documento é sempre A4 retrato, duas colunas cabem em qualquer tela e
          o documento fecha em UMA folha também no telefone.
        */}
        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <div className="border border-slate-200 rounded p-2 bg-slate-50/50">
            <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Dados do Cliente
            </h2>
            <div className="space-y-0.5 text-[11px]">
              <div>
                <strong className="text-slate-700">Cliente:</strong>{' '}
                <span className="font-semibold text-slate-900">{client?.name || 'Cliente'}</span>
              </div>
              {client?.document && (
                <div>
                  <strong className="text-slate-700">CNPJ/CPF:</strong> {client.document}
                </div>
              )}
              {client?.phone && (
                <div>
                  <strong className="text-slate-700">Telefone:</strong> {client.phone}
                </div>
              )}
              <div>
                <strong className="text-slate-700">Endereço:</strong>{' '}
                {client?.address
                  ? `${client.address}, ${client.neighborhood || ''} - ${client.city || 'Macaé'}`
                  : 'Macaé / RJ'}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded p-2 bg-slate-50/50">
            <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> Informações Técnicas
            </h2>
            <div className="space-y-0.5 text-[11px]">
              <div>
                <strong className="text-slate-700">Tipo de Serviço:</strong>{' '}
                <span className="font-semibold text-[#0B3D91]">{order.service_type}</span>
              </div>
              <div>
                <strong className="text-slate-700">Técnico:</strong>{' '}
                {technician?.name || 'Equipe Técnica LM'}
              </div>
              <div>
                <strong className="text-slate-700">Abertura:</strong>{' '}
                {formattedDate(order.opened_at || order.created)}
              </div>
              {order.completed_at && (
                <div>
                  <strong className="text-slate-700">Conclusão:</strong>{' '}
                  {formattedDate(order.completed_at)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DESCRIÇÃO */}
        <div className="mb-2.5 border border-slate-200 rounded p-2">
          <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5">
            Descrição do Serviço
          </h2>
          <p className="text-slate-700 text-[11px] whitespace-pre-wrap leading-snug">
            {order.description || 'Não especificado.'}
          </p>
        </div>

        {/* LAUDO */}
        <div className="mb-2.5 border border-slate-200 rounded p-2 bg-[#0B3D91]/[0.02]">
          <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5">
            Laudo Técnico / Execução
          </h2>
          <p className="text-slate-700 text-[11px] whitespace-pre-wrap leading-snug">
            {order.technical_report || 'Serviço executado conforme normas técnicas da LM SERVIÇOS.'}
          </p>
        </div>

        {/* MATERIAIS */}
        {materials.length > 0 && (
          <div className="mb-2.5 border border-slate-200 rounded p-2">
            <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5 flex items-center justify-between">
              <span>Peças e Materiais Aplicados</span>
              <span className="text-[10px] font-normal text-slate-500">
                {materials.length} {materials.length === 1 ? 'item' : 'itens'}
              </span>
            </h2>
            <table className="w-full text-left text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 bg-slate-50">
                  <th className="py-0.5 px-1.5 font-semibold">Material</th>
                  <th className="py-0.5 px-1.5 font-semibold text-center">Qtd.</th>
                  <th className="py-0.5 px-1.5 font-semibold text-center">Unid.</th>
                  {isAdmin && (
                    <>
                      <th className="py-0.5 px-1.5 font-semibold text-right">V. Unit</th>
                      <th className="py-0.5 px-1.5 font-semibold text-right">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="py-0.5 px-1.5 font-medium text-slate-800">
                      {m.expand?.material?.name || 'Material'}
                      {m.notes && (
                        <span className="block text-[9px] text-slate-500">{m.notes}</span>
                      )}
                    </td>
                    <td className="py-0.5 px-1.5 text-center">{m.quantity ? m.quantity : '—'}</td>
                    <td className="py-0.5 px-1.5 text-center text-slate-600">{m.unit}</td>
                    {isAdmin && (
                      <>
                        <td className="py-0.5 px-1.5 text-right text-slate-600">
                          {m.unit_price ? `R$ ${m.unit_price.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-0.5 px-1.5 text-right font-semibold text-slate-800">
                          {m.total_price ? `R$ ${m.total_price.toFixed(2)}` : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {isAdmin && (totalMaterialsPrice > 0 || valorServico > 0) && (
                  <>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                      <td colSpan={4} className="py-0.5 px-1.5 text-right text-slate-700">
                        Total do material:
                      </td>
                      <td className="py-0.5 px-1.5 text-right text-slate-800">
                        R$ {totalMaterialsPrice.toFixed(2)}
                      </td>
                    </tr>
                    {valorServico > 0 && (
                      <tr className="bg-slate-50 font-bold">
                        <td colSpan={4} className="py-0.5 px-1.5 text-right text-slate-700">
                          Mão de obra / serviço:
                        </td>
                        <td className="py-0.5 px-1.5 text-right text-slate-800">
                          R$ {valorServico.toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-[#0B3D91] text-white font-bold">
                      <td colSpan={4} className="py-1 px-1.5 text-right">
                        TOTAL GERAL
                      </td>
                      <td className="py-1 px-1.5 text-right">
                        R$ {(totalMaterialsPrice + valorServico).toFixed(2)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SERVIÇO SEM MATERIAIS: a OS com só o valor da mão de obra (sem
            nenhuma peça lançada) ficava sem o valor no PDF, porque os totais
            viviam DENTRO do bloco de materiais. Bloco separado para esse caso. */}
        {isAdmin && materials.length === 0 && valorServico > 0 && (
          <div className="mb-2.5 border border-slate-200 rounded p-2 break-inside-avoid">
            <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5">
              Serviço / Mão de Obra
            </h2>
            <table className="w-full text-left text-[10px] border-collapse">
              <tbody>
                <tr className="bg-slate-50 font-bold">
                  <td className="py-0.5 px-1.5 text-right text-slate-700">
                    Mão de obra / serviço:
                  </td>
                  <td className="py-0.5 px-1.5 text-right text-slate-800 w-[95px]">
                    R$ {valorServico.toFixed(2)}
                  </td>
                </tr>
                <tr className="bg-[#0B3D91] text-white font-bold">
                  <td className="py-1 px-1.5 text-right">TOTAL GERAL</td>
                  <td className="py-1 px-1.5 text-right">R$ {valorServico.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* FOTOS */}
        {photos.length > 0 && (
          <div className="mb-2.5 border border-slate-200 rounded p-2 break-inside-avoid">
            <h2 className="text-[11px] font-bold text-[#0B3D91] uppercase border-b border-[#0B3D91]/20 pb-1 mb-1.5">
              Evidências Fotográficas
            </h2>
            {/* Fotos: caixa 4:3 com object-contain — mostra a foto INTEIRA, sem
                cortar nem esticar. Antes era object-cover numa caixa baixa, e a
                imagem saía comprida e estreita no papel. */}
            {/*
              4 COLUNAS NO PAPEL (ajuste 22/11/2026).
              Com 2 colunas a foto ficava grande e o bloco de evidências
              ocupava 142 mm — sozinho, empurrava a OS para uma segunda folha.
              No papel vão 4 por linha: a foto continua inteira (4:3 +
              object-contain) e o bloco cai para ~85 mm.
            */}
            {/*
              4 COLUNAS JÁ NA TELA (22/11/2026).
              Era 2 no celular / 3 no computador, e o bloco de evidências
              ocupava 142 mm — sozinho empurrava a OS para uma segunda folha.
              Agora são 4 por linha em qualquer largura, exatamente como sai no
              papel: o que o Felipe vê na prévia é o que ele imprime. A foto
              continua inteira (aspect 4:3 + object-contain).
            */}
            <div className="grid fotos-os grid-cols-4 gap-1.5">
              {photos.map((p, i) => {
                const url = getFileUrl('order_photos', p.id, p.image)
                return (
                  <div
                    key={p.id}
                    className="border border-slate-200 rounded p-0.5 bg-slate-50 flex flex-col items-center break-inside-avoid"
                  >
                    <div className="w-full aspect-[4/3] bg-white rounded overflow-hidden flex items-center justify-center">
                      {url ? (
                        <img
                          src={url}
                          alt={p.description || `Foto ${i + 1}`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[8px] text-slate-400">—</span>
                      )}
                    </div>
                    {(p.description || p.caption) && (
                      <p className="text-[8px] text-slate-600 mt-0.5 text-center line-clamp-1">
                        {p.description || p.caption}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TERMO E ASSINATURAS */}
        <div className="border border-slate-200 rounded p-1.5 bg-slate-50/40 break-inside-avoid">
          <p className="text-[9px] text-slate-600 text-justify mb-1 leading-[1.25]">
            Declaro para os devidos fins que os serviços acima descritos foram executados a contento
            e os materiais discriminados foram devidamente conferidos e instalados nas dependências
            indicadas.
          </p>

          <div
            /* gap menor no papel: 24px de vão entre assinaturas era altura
               desperdiçada que empurrava a OS para a 2ª folha */
            className={`grid gap-3 items-end pt-0.5 break-inside-avoid ${
              isAdmin ? 'grid-cols-3' : 'grid-cols-2'
            }`}
            style={{ pageBreakInside: 'avoid' }}
          >
            {/* Técnico */}
            <div className="text-center">
              <div className="relative">
                <div className="h-8" />
                <div className="border-b border-slate-400" />
                {technician?.signature && (
                  <img
                    src={getFileUrl('technicians', technician.id, technician.signature)}
                    alt="Rubrica"
                    className="absolute left-1/2 -translate-x-1/2 h-16 w-auto object-contain pointer-events-none"
                    style={{ top: '32px', transform: 'translate(-50%, -50%)' }}
                  />
                )}
                <p className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                  {technician?.name || 'Técnico Responsável'}
                </p>
              </div>
              <p className="text-[8px] text-slate-500 leading-tight">Técnico Responsável</p>
              <p className="text-[8px] text-slate-600 font-semibold mt-0.5">LM SERVIÇOS</p>
            </div>

            {/* Administrador (só quando o admin emite) */}
            {isAdmin && (
              <div className="text-center">
                <div className="relative">
                  <div className="h-8" />
                  <div className="border-b border-slate-400" />
                  {adminRubrica && (
                    <img
                      src={adminRubrica}
                      alt="Rubrica do Administrador"
                      className="absolute left-1/2 -translate-x-1/2 h-16 w-auto object-contain pointer-events-none"
                      style={{ top: '32px', transform: 'translate(-50%, -50%)' }}
                    />
                  )}
                  <p className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                    {adminNome}
                  </p>
                </div>
                <p className="text-[8px] text-slate-500 leading-tight">Administrador</p>
                <p className="text-[8px] text-slate-600 font-semibold mt-0.5">LM SERVIÇOS</p>
              </div>
            )}

            {/* Cliente */}
            <div className="text-center">
              <div className="relative">
                <div className="h-8" />
                <div className="border-b border-slate-400" />
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="Assinatura do Cliente"
                    className="absolute left-1/2 -translate-x-1/2 h-14 w-auto object-contain"
                    style={{ top: '32px', transform: 'translate(-50%, -50%)' }}
                  />
                )}
                <p className="text-[10px] font-semibold text-slate-800 leading-tight mt-0.5">
                  {order.client_signer_name || client?.name || 'Cliente / Responsável'}
                </p>
              </div>
              <p className="text-[8px] text-slate-500 leading-tight">Cliente / Responsável</p>
              {order.client_signer_doc && (
                <p className="text-[8px] text-slate-500 leading-tight">
                  Doc: {order.client_signer_doc}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* RODAPÉ FISCAL */}
        {/*
          RODAPÉ IGUAL AO DO PEDIDO (pedido do Felipe, 22/11/2026).

          Antes os dados estavam ESCRITOS À MÃO aqui: trocar o telefone no
          cadastro não mudava o PDF, e a OS saía sem telefone nem e-mail. Agora
          lê de Configurações, como o talão do pedido — um cadastro, os dois
          documentos. Se o campo estiver vazio, a linha simplesmente não sai.
        */}
        <div className="border-t border-slate-200 pt-1.5 mt-2 text-[8px] text-slate-500">
          <div className="flex justify-between items-start gap-3">
            <span className="leading-tight">
              <strong className="text-slate-600">
                {empresa.razao_social || 'LM SERVIÇOS E DISTRIBUIÇÃO'}
              </strong>
              {' • CNPJ '}
              {empresa.cnpj || '44.288.125/0001-34'}
              {empresa.ie ? ` • IE ${empresa.ie}` : ''}
              <br />
              {empresa.endereco || 'VILA UNIÃO, 92 — LAGOMAR — MACAÉ/RJ — CEP 27.966-507'}
              {(empresa.telefone || empresa.email) && (
                <>
                  <br />
                  {empresa.telefone}
                  {empresa.telefone && empresa.email ? ' • ' : ''}
                  {empresa.email}
                </>
              )}
            </span>
            <span className="text-right leading-tight shrink-0">
              {new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
