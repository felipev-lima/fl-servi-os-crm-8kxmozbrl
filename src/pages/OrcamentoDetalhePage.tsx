/**
 * Documento do orçamento / pedido — o que vai para o PDF.
 *
 * Cabeçalho com a logomarca e os dados da empresa, bloco do cliente (razão
 * social, nunca o apelido), tabela de itens com a divisão de cada um, total,
 * condições e as três assinaturas.
 *
 * O sinal do item vem do valor gravado, nunca do tipo.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getQuote,
  updateQuote,
  createTransaction,
  getTransactionsByClient,
  getHistoricoPedido,
  registrarHistoricoPedido,
} from '@/services/crm'
import { getEmpresa, urlArquivo, type Empresa } from '@/lib/empresa'
import { getNextOrderNumber, createWorkOrder, addOrderMaterial } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { getFileUrl } from '@/services/api'
import { baixarFotosZip, compartilharFotosZip, type FotoParaZip } from '@/lib/fotosZip'
import type { Quote, TransactionKind } from '@/types/crm'
import { TIPOS, brl, dataBR } from '@/types/crm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/SignaturePad'
import {
  ArrowLeft,
  Loader2,
  Download,
  Printer,
  Package,
  Truck,
  Receipt,
  Camera,
  X,
  CheckCircle2,
  Wrench,
  Images,
  Link2,
  BadgeDollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  urlDoLinkCliente,
  mensagemWhatsapp,
  abrirWhatsapp,
  tokenDoLinkCliente,
} from '@/lib/linkCliente'

const ETAPAS: { valor: string; label: string }[] = [
  { valor: 'ORCAMENTO', label: 'Orçamento' },
  { valor: 'PEDIDO', label: 'Pedido' },
  { valor: 'ENTREGUE', label: 'Entrega' },
  { valor: 'FATURADO', label: 'Faturado' },
]

export default function OrcamentoDetalhePage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { user, isAdmin } = useAuth()
  const [doc, setDoc] = useState<Quote | null>(null)
  const [empresa, setEmpresa] = useState<Empresa>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [entregador, setEntregador] = useState('')
  const [cargo, setCargo] = useState('')
  /** RECEBIDO POR: nome que a cliente digitou ao assinar pelo link público */
  const [recebidoPor, setRecebidoPor] = useState('')
  const [assinaturaCliente, setAssinaturaCliente] = useState('')
  const [assinaturaEntregador, setAssinaturaEntregador] = useState('')
  /**
   * ASSINATURA DO CLIENTE JÁ GRAVADA (link público ou entrega anterior).
   * Somente-leitura, com status ASSINADO e a data da linha ASSINADO do
   * histórico (quote_history). O canvas de nova assinatura continua VAZIO.
   */
  const [assinadoEm, setAssinadoEm] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [mostrarEntrega, setMostrarEntrega] = useState(false)
  const [baixandoZip, setBaixandoZip] = useState(false)
  const [compartilhandoZip, setCompartilhandoZip] = useState(false)
  const canvasCliente = useRef<HTMLCanvasElement | null>(null)
  const canvasEntregador = useRef<HTMLCanvasElement | null>(null)
  const refDoc = useRef<HTMLDivElement | null>(null)

  /**
   * LINK DO CLIENTE (sem login) — mesmo botão do Pedido e da OS.
   * Copia o link exclusivo deste documento e abre o WhatsApp com a mensagem
   * pronta, usando o telefone do cadastro do cliente. O token vem do campo
   * client_link_token gravado no próprio orçamento (hook no servidor). Só admin.
   */
  const [copiandoLink, setCopiandoLink] = useState(false)
  const enviarLinkCliente = async () => {
    if (!doc?.id) return
    const token = tokenDoLinkCliente(doc)
    if (!token) {
      toast.error('Este documento ainda não tem link do cliente. Salve-o e reabra.', {
        duration: 8000,
      })
      return
    }
    const link = urlDoLinkCliente('pedido', doc.id, token)
    setCopiandoLink(true)
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado! Abrindo o WhatsApp...', { duration: 4000 })
      abrirWhatsapp({
        telefone: doc.expand?.client?.phone,
        mensagem: mensagemWhatsapp({
          tipo: 'pedido',
          numero: doc.number || doc.id.slice(-6).toUpperCase(),
          cliente: doc.expand?.client?.name,
          url: link,
        }),
      })
    } catch {
      toast.error('Não foi possível copiar o link.', { duration: 6000 })
    } finally {
      setCopiandoLink(false)
    }
  }

  /**
   * Variante "Link com valores" (só admin): o MESMO documento do link normal,
   * agora com &v=1 — a rota pública devolve itens, fotos e OS VALORES/totais
   * atualizados. A mensagem de WhatsApp muda o texto (é o link de CONFERÊNCIA
   * de valores, pós-finalização). O link normal (sem valores) não muda nada.
   */
  const enviarLinkComValores = async () => {
    if (!doc?.id) return
    const token = tokenDoLinkCliente(doc)
    if (!token) {
      toast.error('Este documento ainda não tem link do cliente. Salve-o e reabra.', {
        duration: 8000,
      })
      return
    }
    const link = urlDoLinkCliente('pedido', doc.id, token, true)
    setCopiandoLink(true)
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link com valores copiado! Abrindo o WhatsApp...', { duration: 4000 })
      abrirWhatsapp({
        telefone: doc.expand?.client?.phone,
        mensagem: mensagemWhatsapp({
          tipo: 'pedido',
          numero: doc.number || doc.id.slice(-6).toUpperCase(),
          cliente: doc.expand?.client?.name,
          url: link,
          comValores: true,
        }),
      })
    } catch {
      toast.error('Não foi possível copiar o link.', { duration: 6000 })
    } finally {
      setCopiandoLink(false)
    }
  }

  const carregar = async () => {
    if (!id) return
    setCarregando(true)
    try {
      const [d, e] = await Promise.all([getQuote(id), getEmpresa()])
      setDoc(d)
      setEmpresa(e)
      setEntregador(d.delivered_by_name || '')
      setCargo(d.delivered_by_role || '')
      // RECEBIDO POR: nome digitado pela cliente no link público — campo
      // próprio (received_by_name), separado do entregador do admin
      setRecebidoPor((d as any).received_by_name || '')
      /**
       * ASSINATURA DO CLIENTE GRAVADA: a data vem da linha ASSINADO do
       * histórico (status_to = 'ASSINADO'), nunca inventada. Falha ao ler o
       * histórico é detalhe — não trava a tela.
       */
      if (d.signature_client) {
        try {
          const hist = await getHistoricoPedido(id)
          const linha = (hist as any[]).find((h) => h.status_to === 'ASSINADO')
          setAssinadoEm(linha ? dataBR(linha.created) : '')
        } catch {
          setAssinadoEm('')
        }
      } else {
        setAssinadoEm('')
      }
    } catch {
      toast.error('Documento não encontrado.')
      navegar('/orcamentos')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const itens = doc?.items || []
  const total = itens.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0)
  const st = doc?.status || 'ORCAMENTO'

  const urlLogo = urlArquivo(empresa, 'logo')
  const urlAssinaturaDiretor = urlArquivo(empresa, 'assinatura_diretor')

  /**
   * FOTOS SALVAS NO DOCUMENTO (mesmo recurso do Pedido e da OS).
   * Aparecem nos botões de ZIP e compartilhar abaixo. Nada é apagado:
   * aqui só se lê os arquivos e se monta um pacote em memória.
   */
  const fotosSalvas = ((doc?.photos || []) as string[]).filter(Boolean)
  const fotosParaZip: FotoParaZip[] = fotosSalvas.map((nome) => ({
    nome,
    url: getFileUrl('quotes', doc?.id || '', nome),
  }))

  const baixarZipFotos = async () => {
    if (!doc || fotosParaZip.length === 0) return
    setBaixandoZip(true)
    try {
      const qtde = await baixarFotosZip({
        fotos: fotosParaZip,
        nomeArquivo: `ORCAMENTO-${doc.id.slice(-6)}-FOTOS`,
        pasta: `fotos-orcamento-${doc.id.slice(-6)}`,
      })
      if (qtde === 0) toast.error('Não foi possível preparar as fotos.')
      else toast.success(`ZIP com ${qtde} foto(s) baixado.`)
    } catch {
      toast.error('Erro ao montar o ZIP de fotos.')
    } finally {
      setBaixandoZip(false)
    }
  }

  const compartilharZipFotos = async () => {
    if (!doc || fotosParaZip.length === 0) return
    setCompartilhandoZip(true)
    try {
      const r = await compartilharFotosZip({
        fotos: fotosParaZip,
        nomeArquivo: `ORCAMENTO-${doc.id.slice(-6)}-FOTOS`,
        pasta: `fotos-orcamento-${doc.id.slice(-6)}`,
        titulo: 'Fotos do orçamento',
      })
      if (r === 'vazio') toast.error('Não foi possível preparar as fotos.')
      else if (r === 'baixado') toast.info('Compartilhamento indisponível — ZIP baixado.')
      else toast.success('ZIP compartilhado.')
    } catch {
      toast.error('Erro ao compartilhar as fotos.')
    } finally {
      setCompartilhandoZip(false)
    }
  }

  /**
   * Lê o canvas na hora de salvar.
   *
   * Depender só do evento de fim de traço fazia a assinatura se perder quando
   * a pessoa tocava em "Salvar" logo depois de desenhar. Aqui o desenho é lido
   * direto do canvas, e só vale se tiver traço de verdade (imagem grande).
   */
  const lerCanvas = (canvas: HTMLCanvasElement | null): string => {
    if (!canvas) return ''
    try {
      const data = canvas.toDataURL('image/png')
      return data.length > 3000 ? data : ''
    } catch {
      return ''
    }
  }

  const avancar = async () => {
    if (!doc) return
    const i = ETAPAS.findIndex((e) => e.valor === st)
    const prox = ETAPAS[i + 1]?.valor
    if (!prox) return
    setSalvando(true)
    try {
      const dados: any = { status: prox }
      if (prox === 'ENTREGUE') dados.delivered_at = new Date().toISOString()
      if (prox === 'FATURADO') dados.invoiced_at = new Date().toISOString()
      await updateQuote(doc.id, dados)
      toast.success(`Agora está como ${ETAPAS[i + 1].label}.`)
      void carregar()
    } finally {
      setSalvando(false)
    }
  }

  const registrarEntrega = async () => {
    if (!doc) return
    setSalvando(true)
    try {
      const form = new FormData()
      form.append('delivered_by_name', entregador.toUpperCase())
      form.append('delivered_by_role', cargo.toUpperCase())
      form.append('status', 'ENTREGUE')
      form.append('delivered_at', new Date().toISOString())

      const dc = lerCanvas(canvasCliente.current) || assinaturaCliente
      if (dc) {
        const blob = await (await fetch(dc)).blob()
        form.append(
          'signature_client',
          new File([blob], 'assinatura-cliente.png', { type: 'image/png' }),
        )
      }
      const de = lerCanvas(canvasEntregador.current) || assinaturaEntregador
      if (de) {
        const blob = await (await fetch(de)).blob()
        form.append(
          'signature_deliverer',
          new File([blob], 'assinatura-entregador.png', { type: 'image/png' }),
        )
      }
      for (const f of fotos) form.append('photos', f)

      await pb.collection('quotes').update(doc.id, form)
      toast.success('Entrega registrada.')
      setMostrarEntrega(false)
      setFotos([])
      setAssinaturaCliente('')
      setAssinaturaEntregador('')
      // re-assinou por cima: a data nova é a da linha ASSINADO acabada de gravar
      if (dc) setAssinadoEm(dataBR(new Date().toISOString()))
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível registrar a entrega.')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * FATURAR: cada item vira um lançamento no financeiro do cliente.
   *
   * É o pedido do Felipe — "clico em faturado e ele me gera a lista de
   * materiais, similar à planilha, de cliente para cliente". O documento
   * passa a FATURADO e não pode ser faturado duas vezes.
   */
  const faturar = async () => {
    if (!doc) return
    if (
      !confirm(
        `Faturar este documento?\n\n${itens.length} item(ns) serão lançados no financeiro do cliente.`,
      )
    )
      return
    setSalvando(true)
    try {
      const ref = `PEDIDO-${doc.id.slice(-6)}`
      const existentes = await getTransactionsByClient(doc.client)
      if (existentes.some((t) => t.work_order_ref === ref)) {
        toast.error('Este documento já foi faturado.')
        return
      }
      for (const it of itens) {
        await createTransaction({
          client: doc.client,
          date: new Date().toISOString(),
          kind: (it.kind || 'CONSUMO') as any,
          item_type: it.kind === 'SERVICO' ? 'SERVICO' : 'PRODUTO',
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          work_order_ref: ref,
          sent_to_finance: 'PENDENTE',
        })
      }
      await updateQuote(doc.id, { status: 'FATURADO', invoiced_at: new Date().toISOString() })
      toast.success(`${itens.length} item(ns) lançados no faturamento.`)
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível faturar.')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * C6 — transforma o pedido aprovado em OS, copiando cliente, itens e valores.
   *
   * É o caminho "aprovou, agora executa": em vez de redigitar tudo na OS, os
   * itens do pedido entram como materiais da ordem e o valor de mão de obra
   * vai em `service_value`. A OS sai ABERTA, pronta para o técnico.
   * Admin apenas; o pedido é mantido (nada é apagado) e fica apontando para
   * a OS via `work_order` — o botão só aparece sem OS vinculada, o que
   * também evita conversão duplicada.
   */
  const gerarOS = async () => {
    if (!doc) return
    if (!confirm(`Gerar uma OS a partir deste pedido?\n\n${itens.length} item(ns) serão copiados.`))
      return
    setSalvando(true)
    try {
      /**
       * Feito no cliente, e não por rota no servidor, por um motivo prático: a
       * rota customizada sob /backend/v1 não subiu no deploy desta instância
       * (responde 404 mesmo publicada). Fazer as gravações daqui dá o
       * mesmo resultado e não depende de hook.
       */
      const numero = await getNextOrderNumber()

      const maoDeObra = itens
        .filter((i) => i.kind === 'SERVICO')
        .reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0)

      const descricao =
        itens
          .filter((i) => i.kind === 'SERVICO')
          .map((i) => i.description)
          .join('; ')
          .slice(0, 250) || `Pedido ${doc.id.slice(-6)}`

      const os = await createWorkOrder(
        {
          order_number: numero,
          client: doc.client,
          service_type: 'Instalação',
          status: 'ABERTA',
          description: descricao,
          opened_at: new Date().toISOString(),
          service_value: maoDeObra,
          quote_ref: doc.id,
        } as any,
        user?.name || 'Sistema',
      )

      // itens de produto viram material da OS
      for (const i of itens) {
        if (i.kind === 'SERVICO' || !i.material_id) continue
        await addOrderMaterial({
          work_order: os.id,
          material: i.material_id,
          quantity: Number(i.quantity),
          unit: i.unit || 'UN',
          unit_price: Number(i.unit_price),
          kind: (i.kind as any) || 'CONSUMO',
        } as any)
      }

      /**
       * FOTOS (C6): a OS recebe CÓPIAS das fotos do pedido — o mesmo caminho
       * da migração OS⇄Pedido (migracao.ts). O pedido original MANTÉM as fotos
       * dele (nada é transferido nem apagado) e falha em uma foto não aborta
       * a conversão; a foto problemática é relançada a mão na OS.
       */
      const fotosPedido: string[] = (doc.photos as string[]) || []
      let fotosCopiadas = 0
      for (let i = 0; i < fotosPedido.length; i++) {
        try {
          const urlFoto = pb.files.getURL(
            { id: doc.id, collectionName: 'quotes' } as any,
            fotosPedido[i],
          )
          const res = await fetch(urlFoto)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          const fd = new FormData()
          fd.append('work_order', os.id)
          fd.append('image', new File([blob], fotosPedido[i], { type: blob.type || 'image/jpeg' }))
          fd.append('display_order', String(i + 1))
          await pb.collection('order_photos').create(fd)
          fotosCopiadas += 1
        } catch (e) {
          console.warn('foto do pedido não copiada para a OS', e)
        }
      }

      await updateQuote(doc.id, { work_order: os.id } as any)
      try {
        await registrarHistoricoPedido(
          doc.id,
          doc.status || 'PEDIDO',
          doc.status || 'PEDIDO',
          user?.name || 'Sistema',
          `Convertido na OS #${numero}` +
            (fotosCopiadas > 0 ? ` · ${fotosCopiadas} foto(s) copiada(s) para a OS` : ''),
        )
      } catch {
        /* a OS já existe; a nota de histórico é best-effort */
      }
      toast.success(
        `OS ${numero} criada a partir do pedido` +
          (fotosCopiadas > 0 ? ` com ${fotosCopiadas} foto(s).` : '.'),
      )
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar a OS.')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * Gera o PDF de verdade e, no celular, abre o menu do sistema (onde fica o
   * Imprimir/AirPrint) — o Chrome do iPhone ignora window.print().
   */
  const gerarPdf = async (imprimir = false) => {
    const alvo = refDoc.current
    if (!alvo) return
    try {
      toast.loading('Gerando PDF...', { id: 'pdf' })
      const { default: html2pdf } = await import('html2pdf.js')
      const nome = `PEDIDO-${(doc?.expand?.client?.nickname || 'CLIENTE')
        .replace(/[^\wÀ-ÿ ]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 30)}.pdf`

      const blob: Blob = await (html2pdf() as any)
        .set({
          margin: 8,
          filename: nome,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(alvo)
        .outputPdf('blob')

      toast.success('PDF gerado.', { id: 'pdf' })
      const arquivo = new File([blob], nome, { type: 'application/pdf' })

      const nav = navigator as any
      if (imprimir && nav.share && nav.canShare?.({ files: [arquivo] })) {
        await nav.share({ files: [arquivo], title: nome })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nome
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
    } catch (e) {
      toast.error('Não foi possível gerar o PDF.', { id: 'pdf' })
      console.error(e)
    }
  }

  if (carregando || !doc) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  const urlAssinaturaCliente = doc.signature_client
    ? `${pb.baseURL}/api/files/quotes/${doc.id}/${doc.signature_client}`
    : ''
  const urlAssinaturaEntregador = doc.signature_deliverer
    ? `${pb.baseURL}/api/files/quotes/${doc.id}/${doc.signature_deliverer}`
    : ''

  const assinaturas = [
    { nome: empresa.diretor_nome || 'FELIPE LIMA', cargo: 'DIRETOR', img: urlAssinaturaDiretor },
    ...(doc.delivered_by_name
      ? [
          {
            nome: doc.delivered_by_name,
            cargo: doc.delivered_by_role || 'ENTREGADOR',
            img: urlAssinaturaEntregador,
          },
        ]
      : []),
    {
      nome: doc.expand?.client?.name || 'CLIENTE',
      cargo: 'RECEBIDO POR',
      img: urlAssinaturaCliente,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navegar('/orcamentos')}
          className="h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-black">
            {doc.expand?.client?.nickname || 'Documento'}
          </h1>
          <p className="text-[10px] text-muted-foreground">
            {st} · {itens.length} item(ns) · {brl(total)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          onClick={() => gerarPdf(false)}
          className="h-8 flex-1 gap-1.5 bg-[#0B3D91] text-[11px] text-white hover:bg-[#0B3D91]/90"
        >
          <Download className="h-3.5 w-3.5" /> Baixar PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => gerarPdf(true)}
          className="h-8 gap-1.5 text-[11px]"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </Button>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={enviarLinkCliente}
            disabled={copiandoLink || salvando}
            className="h-8 gap-1.5 text-[11px] border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
            title="Copia o link exclusivo deste documento e abre o WhatsApp com a mensagem pronta para o cliente (sem login, sem valores)"
          >
            {copiandoLink ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            Link do cliente
          </Button>
        )}
        {fotosSalvas.length > 0 && (
          <Button
            variant="outline"
            onClick={baixarZipFotos}
            disabled={baixandoZip || salvando}
            className="h-8 gap-1.5 text-[11px] border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
            title="Baixa todas as fotos deste documento num único arquivo .zip"
          >
            {baixandoZip ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Images className="h-3.5 w-3.5" />
            )}
            Baixar fotos (.zip)
          </Button>
        )}
        {fotosSalvas.length > 0 && (
          <Button
            variant="outline"
            onClick={compartilharZipFotos}
            disabled={compartilhandoZip || salvando}
            className="h-8 gap-1.5 text-[11px] border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
            title="Abre o menu de compartilhamento do aparelho com o .zip das fotos (WhatsApp, e-mail...)"
          >
            {compartilhandoZip ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Images className="h-3.5 w-3.5" />
            )}
            Compartilhar fotos
          </Button>
        )}
        {st === 'ORCAMENTO' && (
          <Button
            variant="outline"
            onClick={avancar}
            disabled={salvando}
            className="h-8 gap-1.5 text-[11px] text-blue-800"
          >
            <Package className="h-3.5 w-3.5" /> Aprovar como pedido
          </Button>
        )}
        {st === 'PEDIDO' && (
          <Button
            variant="outline"
            onClick={() => setMostrarEntrega(true)}
            className="h-8 gap-1.5 text-[11px] text-indigo-800"
          >
            <Truck className="h-3.5 w-3.5" /> Registrar entrega
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            onClick={enviarLinkComValores}
            disabled={copiandoLink || salvando}
            className="h-8 gap-1.5 text-[11px] border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
            title="Copia o link deste documento COM os valores (itens, fotos e totais atualizados) e abre o WhatsApp — enviar ao cliente após a finalização; o link normal continua sem valores"
          >
            {copiandoLink ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BadgeDollarSign className="h-3.5 w-3.5" />
            )}
            Link com valores
          </Button>
        )}
        {(st === 'ENTREGUE' || st === 'PEDIDO') && (
          <Button
            variant="outline"
            onClick={faturar}
            disabled={salvando}
            className="h-8 gap-1.5 text-[11px] text-emerald-800"
          >
            <Receipt className="h-3.5 w-3.5" /> Faturar
          </Button>
        )}
        {isAdmin && (st === 'PEDIDO' || st === 'ENTREGUE') && !doc.work_order && (
          <Button
            variant="outline"
            onClick={gerarOS}
            disabled={salvando}
            className="h-8 gap-1.5 text-[11px] text-blue-800"
            title="Cria a OS com os itens, a mão de obra e as FOTOS deste pedido (cópias — o pedido original fica intacto). Admin."
          >
            <Wrench className="h-3.5 w-3.5" /> Gerar OS
          </Button>
        )}
        {st === 'ENTREGUE' && (
          <Button
            variant="ghost"
            onClick={avancar}
            className="h-8 gap-1.5 text-[11px]"
            title="Marcar como faturado sem lançar"
          >
            Só faturado
          </Button>
        )}
      </div>

      {/*
        ASSINATURA GRAVADA (somente-leitura), à vista o tempo todo: vem do link
        público ou de uma entrega anterior, com status ASSINADO e a data da
        linha ASSINADO do histórico. O painel de nova assinatura continua com
        o canvas VAZIO — assinar de novo grava por cima.
      */}
      {doc.signature_client && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-[11px]">
          <img
            src={`${pb.baseURL}/api/files/quotes/${doc.id}/${doc.signature_client}`}
            alt="Assinatura do cliente gravada"
            className="max-h-12 min-w-20 object-contain"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-bold text-emerald-800">
              <CheckCircle2 className="h-3 w-3" /> ASSINADO PELO CLIENTE
            </p>
            {recebidoPor && (
              <p className="text-[10px] font-semibold text-slate-800">Recebido por {recebidoPor}</p>
            )}
            {assinadoEm && <p className="text-emerald-700">em {assinadoEm}</p>}
          </div>
        </div>
      )}

      {mostrarEntrega && (
        <Card className="border-indigo-300">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Registrar entrega</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMostrarEntrega(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Quem entregou</Label>
                <Input
                  value={entregador}
                  onChange={(e) => setEntregador(e.target.value)}
                  placeholder="LUCIANA"
                  className="h-8 text-xs uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Cargo</Label>
                <Input
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="VENDEDORA"
                  className="h-8 text-xs uppercase"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Assinatura de quem entregou</Label>
              <SignaturePad
                onSave={setAssinaturaEntregador}
                onCanvasReady={(c) => (canvasEntregador.current = c)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Assinatura do cliente (recebimento)</Label>
              {/*
                ASSINATURA GRAVADA (somente-leitura): vem do link público ou de
                uma entrega anterior, com status ASSINADO e a data do histórico.
                O canvas abaixo continua VAZIO — assinar de novo grava por cima
                (a anterior fica no histórico).
              */}
              {doc.signature_client && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
                  <img
                    src={`${pb.baseURL}/api/files/quotes/${doc.id}/${doc.signature_client}`}
                    alt="Assinatura do cliente gravada"
                    className="max-h-16 min-w-24 object-contain"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> ASSINADO
                    </p>
                    {recebidoPor && (
                      <p className="text-[9px] font-semibold text-slate-800">
                        Recebido por {recebidoPor}
                      </p>
                    )}
                    {assinadoEm && <p className="text-[9px] text-emerald-700">em {assinadoEm}</p>}
                    <p className="text-[8px] text-muted-foreground">
                      assinatura gravada — para re-assinar, use o quadro abaixo
                    </p>
                  </div>
                </div>
              )}
              <SignaturePad
                onSave={setAssinaturaCliente}
                onCanvasReady={(c) => (canvasCliente.current = c)}
              />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-[10px]">
                <Camera className="h-3 w-3" /> Fotos do material entregue
              </Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => setFotos(Array.from(e.target.files || []))}
                className="h-8 text-[10px]"
              />
              {fotos.length > 0 && (
                <p className="text-[9px] text-muted-foreground">
                  {fotos.length} foto(s) selecionada(s)
                </p>
              )}
            </div>
            <Button
              onClick={registrarEntrega}
              disabled={salvando}
              className="h-9 w-full gap-1.5 bg-[#0B3D91] text-xs text-white hover:bg-[#0B3D91]/90"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Confirmar entrega
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ================= DOCUMENTO ================= */}
      <div ref={refDoc} className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex items-start gap-3 border-b-2 border-[#0B3D91] pb-2">
          {urlLogo ? (
            <img src={urlLogo} alt="Logomarca" className="h-16 w-auto object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded bg-[#0B3D91] text-xl font-black text-white">
              FL
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-[#0B3D91]">
              {empresa.nome_fantasia || 'FL SERVIÇOS'}
            </p>
            <p className="text-[8px] leading-tight text-slate-600">{empresa.razao_social}</p>
            <p className="text-[8px] leading-tight text-slate-600">
              CNPJ {empresa.cnpj}
              {empresa.ie ? ` · IE ${empresa.ie}` : ''}
            </p>
            <p className="text-[8px] leading-tight text-slate-600">{empresa.endereco}</p>
            <p className="text-[8px] leading-tight text-slate-600">
              {empresa.telefone} · {empresa.email}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-black uppercase text-[#0B3D91]">
              {ETAPAS.find((e) => e.valor === st)?.label || st}
            </p>
            <p className="text-[8px] text-slate-600">Nº {doc.id.slice(-6).toUpperCase()}</p>
            <p className="text-[8px] text-slate-600">{dataBR(doc.date || doc.created)}</p>
          </div>
        </div>

        <div className="space-y-0.5 rounded bg-slate-50 p-2">
          <p className="text-[9px] font-black uppercase text-slate-700">Cliente</p>
          <p className="text-[10px] font-bold">{doc.expand?.client?.name}</p>
          <p className="text-[8px] text-slate-600">
            {doc.expand?.client?.document ? `CNPJ/CPF ${doc.expand.client.document}` : ''}
            {doc.expand?.client?.phone ? ` · ${doc.expand.client.phone}` : ''}
          </p>
          {doc.expand?.client?.address && (
            <p className="text-[8px] text-slate-600">
              {doc.expand.client.address}
              {doc.expand.client.city ? ` — ${doc.expand.client.city}` : ''}
            </p>
          )}
        </div>

        <table className="w-full border-collapse text-[8.5px]">
          <thead>
            <tr className="bg-[#0B3D91] text-white">
              <th className="w-7 p-1 text-left">#</th>
              <th className="w-12 p-1 text-left">TIPO</th>
              <th className="p-1 text-left">DESCRIÇÃO</th>
              <th className="w-8 p-1 text-right">QTD</th>
              <th className="w-16 p-1 text-right">UNIT.</th>
              <th className="w-20 p-1 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-1 text-slate-500">{i + 1}</td>
                <td className="p-1">
                  <span
                    className={`rounded px-1 py-0.5 text-[7px] font-bold ${
                      it.kind === 'CAPITAL'
                        ? 'bg-indigo-100 text-indigo-900'
                        : it.kind === 'SERVICO'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-sky-100 text-sky-900'
                    }`}
                  >
                    {it.kind === 'CAPITAL' ? 'CAP' : it.kind === 'SERVICO' ? 'SERV' : 'CONS'}
                  </span>
                </td>
                <td className="p-1">{it.description}</td>
                <td className="p-1 text-right font-mono">{Number(it.quantity)}</td>
                <td className="p-1 text-right font-mono">{brl(Number(it.unit_price))}</td>
                <td className="p-1 text-right font-mono font-bold">
                  {brl(Number(it.quantity) * Number(it.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={5}
                className="border-t-2 border-[#0B3D91] p-1.5 text-right text-[10px] font-black"
              >
                TOTAL
              </td>
              <td className="border-t-2 border-[#0B3D91] p-1.5 text-right font-mono text-[11px] font-black text-[#0B3D91]">
                {brl(total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-2 gap-2 border-t pt-2 text-[8px] text-slate-700">
          <div>
            <p className="text-[8.5px] font-bold">CONDIÇÕES DE PAGAMENTO</p>
            <p>{doc.payment_terms || 'A combinar / Conforme contrato'}</p>
          </div>
          <div>
            <p className="text-[8.5px] font-bold">ENTREGA</p>
            <p>{doc.delivery_terms || 'Imediato / Agendado'}</p>
            <p className="mt-1">
              <span className="font-bold">VALIDADE:</span> {doc.validity_days || 15} dias
            </p>
          </div>
        </div>

        <div
          className="grid gap-3 border-t pt-4"
          style={{ gridTemplateColumns: `repeat(${assinaturas.length}, 1fr)` }}
        >
          {assinaturas.map((a) => (
            <div key={a.nome} className="break-inside-avoid text-center">
              <div className="mb-1 flex h-10 items-end justify-center">
                {a.img && <img src={a.img} alt="Assinatura" className="max-h-10 object-contain" />}
              </div>
              <div className="border-t border-slate-800 pt-0.5">
                <p className="truncate text-[7.5px] font-bold">{a.nome}</p>
                <p className="text-[6.5px] uppercase text-slate-500">{a.cargo}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
