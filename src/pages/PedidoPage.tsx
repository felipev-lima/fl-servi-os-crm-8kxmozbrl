/**
 * Pedido de venda — o talão.
 *
 * O Felipe vende produto além de prestar serviço. Este é o documento da venda:
 *
 *   cliente → itens → valores → entrega
 *
 * E a entrega tem três provas, que é o que evita discussão depois:
 *   1. FOTOS do material entregue;
 *   2. ASSINATURA de quem entregou (técnico ou ele);
 *   3. ASSINATURA de quem recebeu (o cliente).
 *
 * Guarda em `quotes` (que já nasceu com esses campos) e imprime um PDF com
 * cara de talão: cabeçalho da empresa, dados do cliente, tabela de itens,
 * totais e os dois campos de assinatura.
 *
 * Usar `SignaturePad` e `html2pdf` é obrigatório aqui: o Chrome do iPhone não
 * abre `window.print()`, então o PDF é gerado no aparelho e compartilhado.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getClients,
  getMaterials,
  updateMaterial,
  getTechnicians,
  getFileUrl,
} from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  createQuote,
  getQuote,
  updateQuote,
  totalDoDocumento,
  getClientes,
  registrarHistoricoPedido,
  getHistoricoPedido,
} from '@/services/crm'
import { getEmpresa, type Empresa } from '@/lib/empresa'
import type { Material } from '@/types/flservicos'
import type { Client } from '@/types/flservicos'
import type { QuoteItem } from '@/types/crm'
import { brl, dataBR } from '@/types/crm'
import { enderecoCompleto, linkMapa, temEndereco } from '@/lib/local'
import { prepararFoto } from '@/lib/imagem'
import { SignaturePad } from '@/components/SignaturePad'
import { ProdutoRapidoDialog } from '@/components/ProdutoRapidoDialog'
import { ClienteRapidoDialog } from '@/components/ClienteRapidoDialog'
import { FLUXO_PEDIDO, configStatus } from '@/lib/pedidoStatus'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  Printer,
  BadgeDollarSign,
  Camera,
  Search,
  ShoppingCart,
  User,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Navigation,
  Images,
  X,
  ArrowLeft,
  ArrowRightLeft,
  Link2,
} from 'lucide-react'
import { migrarPedidoParaOS, importarFotosOSParaPedido } from '@/services/migracao'
import { baixarFotosZip, compartilharFotosZip, type FotoParaZip } from '@/lib/fotosZip'
import { avisarSincronizacao } from '@/lib/onedriveSync'
import { toast } from 'sonner'
import {
  urlDoLinkCliente,
  mensagemWhatsapp,
  abrirWhatsapp,
  tokenDoLinkCliente,
} from '@/lib/linkCliente'

interface ItemLocal extends QuoteItem {
  nome: string
  unidade?: string
  /** nome do produto: QuoteItem pode vir com `name` ou só `description` */
  name?: string
  material?: string
}

export default function PedidoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ehNovo = !id || id === 'novo'

  /**
   * VALORES SÓ PARA ADMINISTRADOR (regra do Felipe, 20/11/2026).
   *
   * O técnico e os demais operadores veem o produto e a quantidade — o que
   * precisam para separar e entregar. Preço, total e valor unitário não
   * aparecem para eles: o faturamento é assunto do dono.
   *
   * `podeVerValores` governa a TELA; o talão impresso é montado depois e
   * respeita a mesma flag.
   */
  const { user, isAdmin } = useAuth()
  const podeVerValores = isAdmin

  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [clientes, setClientes] = useState<Client[]>([])
  const [migrando, setMigrando] = useState(false)
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [novoCliente, setNovoCliente] = useState(false)
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [itens, setItens] = useState<ItemLocal[]>([])
  const [obs, setObs] = useState('')
  const [entregador, setEntregador] = useState('')
  const [entregadorId, setEntregadorId] = useState('')
  const [tecnicos, setTecnicos] = useState<any[]>([])
  /**
   * VÁRIAS PESSOAS NO PEDIDO (pedido do Felipe, 23/11/2026): "pode ser que eu
   * coloque mais de uma pessoa para ir executar o serviço ou entrega de
   * material". Cada id marcado vai para o campo `technicians` do pedido, e é
   * isso que faz o pedido aparecer para cada um deles quando entra no app.
   */
  const [designados, setDesignados] = useState<string[]>([])
  const [assinouCliente, setAssinouCliente] = useState(false)
  const [assinouEntregador, setAssinouEntregador] = useState(false)
  /** RECEBIDO POR: nome que a cliente digitou ao assinar pelo link público */
  const [recebidoPor, setRecebidoPor] = useState('')
  /** desenho capturado, para ESTAMPAR no talão (não só marcar "assinado") */
  const [sigCliente, setSigCliente] = useState('')
  const [sigEntregador, setSigEntregador] = useState('')
  /**
   * ASSINATURA DO CLIENTE JÁ GRAVADA (link público ou entrega anterior).
   *
   * É só leitura: aparece com status ASSINADO e a data da linha ASSINADO do
   * histórico. O canvas de nova assinatura continua VAZIO — re-assinar grava
   * por cima e a anterior permanece no histórico.
   */
  const [sigClienteGravada, setSigClienteGravada] = useState('')
  /** data (do histórico) em que o cliente assinou */
  const [assinadoEm, setAssinadoEm] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [salvoId, setSalvoId] = useState<string>('')
  /** registro do pedido tal como carregado do banco (tem o client_link_token) */
  const [quoteAtual, setQuoteAtual] = useState<any>(null)
  const [numero, setNumero] = useState<string>('')
  const [statusAtual, setStatusAtual] = useState<string>('PEDIDO')
  /** nomes dos arquivos já gravados no servidor (pedido reaberto) */
  const [fotosSalvas, setFotosSalvas] = useState<string[]>([])
  const [importandoFotos, setImportandoFotos] = useState(false)
  const [baixandoZip, setBaixandoZip] = useState(false)
  const [compartilhandoZip, setCompartilhandoZip] = useState(false)
  /**
   * LINK DO CLIENTE (sem login) — copia o link e abre o WhatsApp com a
   * mensagem pronta, usando o telefone do cadastro. O token vem do campo
   * client_link_token gravado no próprio pedido (hook no servidor).
   */
  const [copiandoLink, setCopiandoLink] = useState(false)
  const linkDoCliente = salvoId
    ? urlDoLinkCliente('pedido', salvoId, tokenDoLinkCliente(quoteAtual))
    : ''
  /** variante "Link com valores" (só admin): mesmo documento com &v=1 */
  const linkComValores = salvoId
    ? urlDoLinkCliente('pedido', salvoId, tokenDoLinkCliente(quoteAtual), true)
    : ''

  /** Copia o link e abre o WhatsApp com a mensagem pronta (telefone do cadastro). */
  const enviarLinkCliente = async () => {
    if (!linkDoCliente) {
      toast.error('Salve o pedido antes de enviar o link ao cliente.')
      return
    }
    setCopiandoLink(true)
    try {
      await navigator.clipboard.writeText(linkDoCliente)
      toast.success('Link copiado! Abrindo o WhatsApp...', { duration: 4000 })
      abrirWhatsapp({
        telefone: cliente?.phone,
        mensagem: mensagemWhatsapp({
          tipo: 'pedido',
          numero: numero || salvoId.slice(-6).toUpperCase(),
          cliente: cliente?.name,
          url: linkDoCliente,
        }),
      })
    } catch {
      toast.error('Não foi possível copiar o link.', { duration: 6000 })
    } finally {
      setCopiandoLink(false)
    }
  }

  /** Igual ao enviarLinkCliente, mas com o link que mostra preços e totais. */
  const enviarLinkComValores = async () => {
    if (!linkComValores) {
      toast.error('Salve o pedido antes de enviar o link ao cliente.')
      return
    }
    setCopiandoLink(true)
    try {
      await navigator.clipboard.writeText(linkComValores)
      toast.success('Link com valores copiado! Abrindo o WhatsApp...', { duration: 4000 })
      abrirWhatsapp({
        telefone: cliente?.phone,
        mensagem: mensagemWhatsapp({
          tipo: 'pedido',
          numero: numero || salvoId.slice(-6).toUpperCase(),
          cliente: cliente?.name,
          url: linkComValores,
          comValores: true,
        }),
      })
    } catch {
      toast.error('Não foi possível copiar o link.', { duration: 6000 })
    } finally {
      setCopiandoLink(false)
    }
  }

  /** lista de fotos do pedido pronta para o zip/compartilhar (src/lib/fotosZip) */
  const fotosParaZip: FotoParaZip[] = fotosSalvas.map((nome) => ({
    nome,
    url: getFileUrl('quotes', salvoId, nome) || '',
  }))

  const baixarZipFotos = async () => {
    if (!salvoId || fotosParaZip.length === 0) return
    setBaixandoZip(true)
    try {
      const qtde = await baixarFotosZip({
        fotos: fotosParaZip,
        nomeArquivo: `PEDIDO-${numero || 'fotos'}-FOTOS`,
        pasta: `fotos-pedido-${numero || ''}`,
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
    if (!salvoId || fotosParaZip.length === 0) return
    setCompartilhandoZip(true)
    try {
      const r = await compartilharFotosZip({
        fotos: fotosParaZip,
        nomeArquivo: `PEDIDO-${numero || 'fotos'}-FOTOS`,
        pasta: `fotos-pedido-${numero || ''}`,
        titulo: `Fotos do pedido ${numero || ''}`,
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

  // busca de cliente
  const [buscaCliente, setBuscaCliente] = useState('')

  /** cadastro rápido de produto, sem sair do pedido */
  const [novoProdutoAberto, setNovoProdutoAberto] = useState(false)

  // busca de produto
  const [busca, setBusca] = useState('')
  /** quantidade começa VAZIA: o "1" obrigava apagar antes de digitar */
  const [qtd, setQtd] = useState('')
  const [preco, setPreco] = useState('')
  const [produtoSel, setProdutoSel] = useState<Material | null>(null)

  /**
   * O SignaturePad entrega o CANVAS por `onCanvasReady`, não por ref.
   *
   * Ler o desenho na hora de salvar é o que evita perder a assinatura quando a
   * pessoa assina e toca em Salvar em seguida (o `onSave` dispara no fim do
   * traço, mas o toque em Salvar pode chegar antes).
   */
  const canvasClienteRef = useRef<HTMLCanvasElement | null>(null)
  const canvasEntregadorRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      /**
       * Carga em duas ondas, para a tela não ficar presa.
       *
       * O catálogo (1.511 itens) é o mais pesado e o backend oscila. Primeiro
       * chegam empresa, clientes e técnicos — a tela já fica utilizável —
       * e o catálogo entra em seguida, sozinho.
       */
      try {
        const [e, c, t] = await Promise.all([getEmpresa(), getClientes(), getTechnicians()])
        setEmpresa(e)
        setClientes(c)
        setTecnicos(t.filter((x: any) => x.active !== false))
      } catch {
        /* segue: o catálogo abaixo ainda pode carregar */
      }
      try {
        setMateriais(await getMaterials())
        if (!ehNovo && id) {
          const q = await getQuote(id)
          setSalvoId(q.id)
          setQuoteAtual(q)
          setClienteId(q.client || '')
          setData((q.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10))
          setObs(q.notes || '')
          setEntregador(q.delivered_by_name || '')
          // TÉCNICOS DESIGNADOS: reabrir o pedido tem de mostrar quem está
          // marcado, senão salvar de novo apagaria a designação sem aviso.
          const tec = (q as any).technicians
          setDesignados(Array.isArray(tec) ? tec.filter(Boolean) : tec ? [tec] : [])
          // RECEBIDO POR: nome digitado pela cliente no link público — campo
          // próprio (received_by_name), separado do entregador do admin
          setRecebidoPor((q as any).received_by_name || '')
          setNumero(q.number ? String(q.number) : '')
          setStatusAtual(q.status || 'PEDIDO')
          // FOTOS JÁ SALVAS: reabre o pedido e elas continuam lá, para
          // reimprimir o PDF e mandar ao cliente dias depois.
          setFotosSalvas((q.photos || []) as string[])
          /**
           * ASSINATURA DO CLIENTE NUNCA VOLTA (regra do Felipe, 21/11/2026).
           *
           * Só a rubrica de quem ENTREGA (técnico/admin) fica gravada — ela é
           * do funcionário e se repete. A do cliente é o ACEITE dele: tem de
           * estar em branco até ele assinar no recebimento. Carregar a antiga
           * fazia o documento nascer já "assinado" por alguém que não assinou
           * desta vez.
           */
          const urlSig = (campo?: string) => (campo ? getFileUrl('quotes', q.id, campo) : '')
          const se = urlSig((q as any).signature_deliverer)
          if (se) setSigEntregador(se)
          setSigCliente('')
          /**
           * ASSINATURA DO CLIENTE GRAVADA: mostra em somente-leitura.
           *
           * A regra de 21/11 continua — o canvas NUNCA nasce pré-preenchido.
           * O que mudou: se o documento já tem assinatura (ex.: o cliente
           * assinou pelo link público), ela é EXIBIDA como registro, com
           * status ASSINADO e a data vinda da linha ASSINADO do histórico —
           * em vez de aparecer "pendente" como se nada tivesse acontecido.
           */
          const sc = (q as any).signature_client
          if (sc) {
            setSigClienteGravada(urlSig(sc))
            try {
              const hist = await getHistoricoPedido(q.id)
              const linha = (hist as any[]).find((h) => h.status_to === 'ASSINADO')
              setAssinadoEm(linha ? dataBR(linha.created) : '')
            } catch {
              setAssinadoEm('') // histórico é detalhe: falha não trava a tela
            }
          } else {
            setSigClienteGravada('')
            setAssinadoEm('')
          }
          setAssinouCliente(false)
          setItens(
            (q.items || []).map((i) => ({
              ...i,
              nome: (i as any).name || i.description || '',
              unidade: i.unit,
            })) as ItemLocal[],
          )
        }
      } catch {
        toast.error('Não foi possível carregar os dados.')
      } finally {
        setCarregando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /**
   * Busca que ignora acento e maiúscula.
   *
   * "camera" precisa achar "CÂMERA" — o filtro do banco não faz isso, e digitar
   * com acento no celular é lento. Sem normalizar, o Felipe não acharia nada.
   */
  const semAcento = (s?: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()

  /**
   * BUSCA DE PRODUTO com relevância e contagem.
   *
   * Antes: corte seco em 8 resultados. Digitar "cabo" mostrava 8 de 83 e nada
   * avisava que existiam 75 escondidos — parecia que o produto não existia.
   *
   * Agora: aceita várias palavras em qualquer ordem ("cabo cat5" e "cat5 cabo"
   * dão no mesmo), ordena quem COMEÇA com o termo primeiro e informa quantos
   * ficaram de fora.
   */
  const resultadosProduto = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean)
    if (termos.length === 0) return { lista: [] as Material[], total: 0 }
    const achados = materiais.filter((m) => {
      const n = semAcento(m.name)
      return termos.every((t) => n.includes(t))
    })
    const primeiro = termos[0]
    const lista = [...achados].sort((a, b) => {
      const na = semAcento(a.name)
      const nb = semAcento(b.name)
      const ca = na.startsWith(primeiro) ? 0 : 1
      const cb = nb.startsWith(primeiro) ? 0 : 1
      if (ca !== cb) return ca - cb
      return na.localeCompare(nb)
    })
    return { lista: lista.slice(0, 30), total: achados.length }
  }, [busca, materiais])

  const resultados = resultadosProduto.lista

  /**
   * Clientes filtrados por qualquer trecho do nome ou do apelido.
   *
   * Fica ANTES do uso no JSX: declarado depois, o navegador lança
   * "clientesFiltrados is not defined" e a tela sai em branco — erro que só
   * aparece em execução, o build passa.
   */
  const clientesFiltrados = useMemo(() => {
    const t = semAcento(buscaCliente)
    if (!t) return []
    return clientes
      .filter((c) => semAcento(c.name).includes(t) || semAcento(c.nickname).includes(t))
      .slice(0, 12)
  }, [buscaCliente, clientes])

  const total = itens.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0)
  const cliente = clientes.find((c) => c.id === clienteId)

  /**
   * Rubrica do técnico que vai entregar.
   *
   * Fica cadastrada em `technicians.signature` (desenhada uma vez). Aqui só
   * montamos a URL do arquivo — nada de pedir para assinar de novo.
   */
  const rubricaEntregador = useMemo(() => {
    /**
     * Procura o técnico pelo ID e, se ele não veio, PELO NOME.
     *
     * Ao abrir um pedido salvo, o registro guarda apenas `delivered_by_name` —
     * o vínculo com o técnico não é gravado. Então `entregadorId` vinha vazio,
     * a rubrica não era encontrada e o app pedia para o Felipe DESENHAR a
     * assinatura de novo, mesmo tendo a rubrica dele cadastrada.
     */
    const porId = tecnicos.find((x) => x.id === entregadorId)
    const porNome = entregador
      ? tecnicos.find(
          (x) =>
            (x.name || '').trim().toUpperCase() === (entregador || '').trim().toUpperCase() ||
            (x.name || '')
              .trim()
              .toUpperCase()
              .startsWith((entregador || '').trim().toUpperCase() + ' '),
        )
      : undefined
    const t = porId || porNome
    if (!t?.signature) return ''
    return getFileUrl('technicians', t.id, t.signature)
  }, [entregadorId, entregador, tecnicos])

  /**
   * Preço sempre com DUAS casas.
   *
   * Antes `String(4.5)` virava "4.5" e o campo mostrava 4,5 — o Felipe via
   * "4,4" em vez de "4,40". Em dinheiro, centavo omitido parece erro de
   * digitação e ainda muda a leitura do valor.
   */
  const precoBR = (v: number): string => (Number(v) || 0).toFixed(2).replace('.', ',')

  const escolherProduto = (m: Material) => {
    setProdutoSel(m)
    setBusca(m.name)
    setPreco(precoBR(Number(m.price || 0)))
  }

  const adicionar = () => {
    if (!produtoSel) {
      toast.error('Escolha um produto da lista.')
      return
    }
    const q = Number(String(qtd).replace(',', '.')) || 0
    const p = Number(String(preco).replace(',', '.')) || 0
    if (q <= 0) {
      toast.error('Informe a quantidade.')
      return
    }
    setItens((prev) => [
      ...prev,
      {
        material: produtoSel.id,
        name: produtoSel.name,
        nome: produtoSel.name,
        description: produtoSel.name,
        unit: produtoSel.unit,
        unidade: produtoSel.unit,
        quantity: q,
        unit_price: p,
        kind: (produtoSel as any).default_kind || 'CAPITAL',
      } as ItemLocal,
    ])
    setProdutoSel(null)
    setBusca('')
    setQtd('')
    setPreco('')
  }

  const removerItem = (idx: number) => setItens((prev) => prev.filter((_, i) => i !== idx))

  const alterarItem = (idx: number, campo: 'quantity' | 'unit_price', valor: string) => {
    const n = Number(String(valor).replace(',', '.')) || 0
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: n } : it)))
  }

  /**
   * Lê o desenho do canvas com FUNDO TRANSPARENTE.
   *
   * O canvas é preenchido de branco para desenhar; esse branco não pode ir para
   * o PDF, senão vira um retângulo cobrindo a linha de assinatura.
   */
  const lerAssinatura = (canvas: HTMLCanvasElement | null): string => {
    if (!canvas) return ''
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      const { width, height } = canvas
      const dados = ctx.getImageData(0, 0, width, height)
      const px = dados.data
      let traco = false
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) px[i + 3] = 0
        else traco = true
      }
      if (!traco) return ''
      const tmp = document.createElement('canvas')
      tmp.width = width
      tmp.height = height
      tmp.getContext('2d')?.putImageData(dados, 0, 0)
      const url = tmp.toDataURL('image/png')
      return url.length > 3000 ? url : ''
    } catch {
      return ''
    }
  }

  const base64ParaArquivo = (dataUrl: string, nome: string): File | null => {
    try {
      const [meta, b64] = dataUrl.split(',')
      const tipo = meta.match(/:(.*?);/)?.[1] || 'image/png'
      const bin = atob(b64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      return new File([arr], nome, { type: tipo })
    } catch {
      return null
    }
  }

  const salvar = async (): Promise<string | null> => {
    if (!clienteId) {
      toast.error('Escolha o cliente.')
      return null
    }
    if (itens.length === 0) {
      toast.error('Inclua ao menos um produto.')
      return null
    }
    setSalvando(true)
    try {
      const fd = new FormData()
      fd.append('client', clienteId)
      fd.append('date', `${data} 12:00:00.000Z`)
      /**
       * REABERTO MANTÉM O STATUS (correção): antes re-salvar forçava 'ENTREGUE',
       * rebaixando um pedido já FATURADO de volta na esteira. Agora o status
       * atual é preservado (o financeiro não é tocado).
       */
      fd.append('status', salvoId ? statusAtual || 'ENTREGUE' : 'PEDIDO')
      fd.append('notes', obs)
      fd.append('delivered_by_name', entregador)
      // relação com vários técnicos: em FormData, a MESMA chave repetida.
      // Mandar vazio limpa a relação (senão o pedido continuaria preso ao
      // técnico antigo depois de desmarcar todo mundo).
      if (designados.length === 0) {
        fd.append('technicians', '')
      } else {
        designados.forEach((id) => fd.append('technicians', id))
      }
      fd.append(
        'items',
        JSON.stringify(
          itens.map((i) => ({
            material: i.material,
            name: i.nome,
            description: i.nome,
            unit: i.unidade,
            quantity: i.quantity,
            unit_price: i.unit_price,
            kind: i.kind,
          })),
        ),
      )

      const sigCliente = lerAssinatura(canvasClienteRef.current)
      const sigEntregador = lerAssinatura(canvasEntregadorRef.current)
      // guarda no estado para ESTAMPAR no talão impresso
      if (sigCliente) setSigCliente(sigCliente)
      if (sigEntregador) setSigEntregador(sigEntregador)
      if (sigCliente) {
        const f = base64ParaArquivo(sigCliente, 'assinatura-cliente.png')
        if (f) fd.append('signature_client', f)
      }
      if (sigEntregador) {
        const f = base64ParaArquivo(sigEntregador, 'assinatura-entregador.png')
        if (f) fd.append('signature_deliverer', f)
      }
      /**
       * BUG CORRIGIDO (20/11/2026): o envio mandava o OBJETO devolvido por
       * `prepararFoto` em vez do arquivo dentro dele. O FormData recebia algo
       * que não é Blob — o salvamento estourava com "Something went wrong" e
       * nenhuma foto chegava ao servidor. Por isso o PDF saía sem imagem.
       *
       * O certo é `preparada.arquivo`.
       */
      /**
       * FOTOS NO RE-SALVAMENTO (correção): no update o campo vai como `photos+`
       * — o PocketBase só faz APPEND com o "+". Sem ele, cada re-salvamento
       * SUBSTITUÍA o campo inteiro e apagava as fotos já gravadas do pedido
       * (regra do projeto: nada é apagado). No create não existe append.
       */
      const campoFotos = salvoId ? 'photos+' : 'photos'
      for (const f of fotos) {
        const preparada = await prepararFoto(f)
        fd.append(campoFotos, preparada.arquivo, preparada.arquivo.name || 'foto.jpg')
      }

      const r = salvoId ? await updateQuote(salvoId, fd as any) : await createQuote(fd as any)

      setSalvoId((r as any).id)
      setQuoteAtual(r as any)
      // re-assinatura gravada por cima: o registro somente-leitura já mostra a nova
      const novoSig = (r as any).signature_client
      if (novoSig) setSigClienteGravada(getFileUrl('quotes', (r as any).id, novoSig))
      // as fotos recém-anexadas viram "já salvas" na hora, sem reabrir o pedido
      setFotosSalvas(((r as any).photos || []) as string[])
      setFotos([])
      toast.success(salvoId ? 'Pedido atualizado.' : 'Pedido criado.')
      /**
       * BACKUP ONEDRIVE (pedido do Felipe, 23/11/2026): todo salvamento do
       * pedido avisa o assistente externo — com o numero do documento e o
       * motivo ('criacao' na primeira vez, 'edicao' depois). É o aviso que
       * faz a ficha E AS FOTOS subirem para a pasta de pedidos no OneDrive.
       * O aviso é leve, não espera nada e falha silenciosamente.
       */
      try {
        avisarSincronizacao(
          (r as any).id,
          Number((r as any).number) || undefined,
          salvoId ? 'edicao' : 'criacao',
          'pedido',
        )
      } catch {
        /* sincronização nunca derruba a operação */
      }
      return (r as any).id
    } catch (e: any) {
      /**
       * Mensagem de erro ÚTIL.
       *
       * Antes o PocketBase devolvia "Something went wrong while processing your
       * request" e o Felipe ficava sem saber o que corrigir. Aqui a mensagem
       * real do campo (que vem em `response.data.data`) é mostrada, junto com
       * o campo culpado.
       */
      const dados = e?.response?.data
      let msg = dados?.message || e?.message || 'Não foi possível salvar o pedido.'
      const campos = dados?.data
      if (campos && typeof campos === 'object') {
        const detalhes = Object.entries(campos)
          .map(([campo, info]: any) => `${campo}: ${info?.message || 'inválido'}`)
          .join(' · ')
        if (detalhes) msg = `${msg} (${detalhes})`
      }
      // caso clássico: foto grande demais
      if (/413|too large|exceed/i.test(msg)) {
        msg = 'A foto é grande demais para o servidor. Tente uma foto menor.'
      }
      toast.error(msg, { duration: 8000 })
      console.error('Erro ao salvar pedido:', e?.response || e)
      return null
    } finally {
      setSalvando(false)
    }
  }

  /** PDF do talão gerado no próprio aparelho */
  const imprimir = async () => {
    const alvo = document.getElementById('talao-pedido')
    if (!alvo) return
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf()
        .set({
          /*
           * MARGEM 5mm e escala 3: o talão mede 1049px de altura e a folha A4
           * útil tem ~1047 — faltavam DOIS PIXELS para caber em uma folha, e
           * um talão com 2 fotos ia para a segunda página por causa disso.
           * Com 5mm de margem sobram ~1050px e ele fecha em 1 folha.
           * `avoid-all` impede a foto de ser cortada no meio.
           */
          margin: [5, 5, 5, 5],
          filename: `PEDIDO-${cliente?.name?.slice(0, 20) || 'CLIENTE'}-${data}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['img', 'tr', '.break-inside-avoid'] },
        } as any)
        .from(alvo)
        .save()
      toast.success('PDF gerado.')
    } catch {
      window.print()
    }
  }

  /**
   * MIGRAR PARA OS (pedido do Felipe, 22/11/2026).
   *
   * Caminho inverso do botão da OS: copia cliente, itens e descrição do pedido
   * para uma ORDEM DE SERVIÇO nova, deixa este pedido CANCELADO com nota
   * apontando para a OS e registra tudo no histórico dos dois. NADA é apagado
   * e o financeiro não é tocado.
   */
  const migrarParaOS = async () => {
    if (!salvoId) {
      toast.error('Salve o pedido antes de migrar.')
      return
    }
    const ok = confirm(
      `Migrar o pedido ${numero ? `nº ${numero}` : ''} para ORDEM DE SERVIÇO?\n\n` +
        '• Cria uma OS nova com o mesmo cliente, itens (quantidade, preço e tipo), descrição e fotos\n' +
        '• Este pedido fica CANCELADO, com nota apontando para a OS nova, e MANTÉM as fotos dele\n' +
        '• Nada é apagado e o financeiro não é tocado',
    )
    if (!ok) return
    setMigrando(true)
    try {
      const r = await migrarPedidoParaOS(salvoId, user?.name || 'Sistema')
      toast.success(
        `OS #${r.destinoNumero} criada. Pedido ${numero ? `nº ${numero}` : ''} cancelado.`,
        {
          duration: 8000,
        },
      )
      navigate(`/ordens/${r.destinoId}`)
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível migrar o pedido para OS.', { duration: 8000 })
    } finally {
      setMigrando(false)
    }
  }

  /**
   * IMPORTAR FOTOS DA OS DE ORIGEM (caso real: OS #1006).
   *
   * O pedido nasceu de uma migração OS→Pedido feita ANTES de a cópia de fotos
   * existir (v0.0.124). Este botão localiza a OS de origem pela nota "Migrado
   * da OS nº X" do histórico e COPIA as fotos dela para o pedido — a OS
   * cancelada mantém as fotos dela, nada é apagado.
   */
  const importarFotosDaOS = async () => {
    if (!salvoId) {
      toast.error('Salve o pedido antes de importar as fotos.')
      return
    }
    setImportandoFotos(true)
    try {
      const r = await importarFotosOSParaPedido(salvoId, user?.name || 'Sistema')
      if (r.origemNumero === null) {
        toast.error('Não encontrei a OS de origem no histórico deste pedido.', { duration: 8000 })
      } else if (r.copiadas === 0 && r.jaNoDestino === 0) {
        toast.info(`A OS nº ${r.origemNumero} não tem fotos.`, { duration: 8000 })
      } else {
        let msg =
          r.copiadas > 0
            ? `${r.copiadas} foto(s) importada(s) da OS nº ${r.origemNumero}.`
            : 'As fotos da OS já estão neste pedido.'
        if (r.jaNoDestino > 0) msg += ` ${r.jaNoDestino} já existia(m) aqui.`
        if (r.falhas.length > 0) msg += ` Falharam: ${r.falhas.join(', ')}.`
        toast.success(msg, { duration: 10000 })
        if (salvoId === id) {
          const q = await getQuote(salvoId)
          setFotosSalvas((q.photos || []) as string[])
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível importar as fotos da OS.', { duration: 8000 })
    } finally {
      setImportandoFotos(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  const faltaAssinatura = !assinouCliente

  return (
    <div className="space-y-3">
      {/*
        BOTÃO VOLTAR (pedido do Felipe, 21/11/2026).
        Sem ele, sair do pedido exigia ir ao menu > Painel > Pedidos de novo.
        Volta um passo no histórico; se veio de link direto, cai na lista.
      */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate('/pedidos')
        }}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B3D91] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      {/*
        MOVIMENTAÇÃO NO TOPO (pedido do Felipe, 21/11/2026).
        Ficava lá embaixo, depois de tudo; ele queria abrir o pedido e já poder
        mover de etapa sem rolar a tela.
      */}
      {!ehNovo && (
        <div className="space-y-1.5 rounded-xl border border-[#0B3D91]/30 bg-[#0B3D91]/5 p-2">
          <Label className="text-[10px] font-semibold text-[#0B3D91]">Movimentar pedido</Label>
          <div className="grid grid-cols-5 gap-1">
            {FLUXO_PEDIDO.map((st) => {
              const cfg = configStatus(st)
              const ativo = statusAtual === st
              return (
                <button
                  key={st}
                  type="button"
                  onClick={async () => {
                    if (st === statusAtual) return
                    const anterior = statusAtual
                    setStatusAtual(st)
                    const r = await updateQuote(salvoId, { status: st } as any)
                    if (r) {
                      await registrarHistoricoPedido(
                        salvoId,
                        anterior,
                        st,
                        entregador || 'Sistema',
                        `Status alterado de ${anterior} para ${st}`,
                      )

                      /**
                       * O FINANCEIRO É AUTOMÁTICO AGORA (24/11/2026).
                       *
                       * Quem cria os lançamentos é o hook de servidor
                       * `lancarPedido.pb.js`, disparado pela própria gravação do
                       * status LANÇADO — igual ao que já acontece com a OS.
                       *
                       * Não precisa chamar nada daqui. E não deve: a rota antiga
                       * exigia um segredo de servidor que o navegador não tem,
                       * então a tentativa anterior simplesmente não funcionava.
                       */
                      toast.success(
                        st === 'LANCADO'
                          ? `Pedido ${numero} lançado e enviado ao financeiro.`
                          : `Pedido marcado como ${cfg.rotulo}.`,
                      )
                    }
                  }}
                  title={cfg.ajuda}
                  className={`flex flex-col items-center justify-center rounded-lg border px-0.5 py-1.5 transition-all ${cfg.cor} ${
                    ativo ? 'ring-2 ring-slate-700 shadow-sm' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className={`text-[8px] font-bold uppercase leading-tight ${cfg.texto}`}>
                    {cfg.rotulo}
                  </span>
                </button>
              )
            })}
          </div>
          <p className={`text-center text-[9px] font-bold ${configStatus(statusAtual).texto}`}>
            {configStatus(statusAtual).rotulo} — {configStatus(statusAtual).ajuda}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">
            {ehNovo ? 'Novo pedido' : `Pedido ${numero ? `nº ${numero}` : ''}`}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {ehNovo
              ? 'Venda de produto com confirmação de entrega'
              : `Status: ${configStatus(statusAtual).rotulo} · venda com confirmação de entrega`}
          </p>
        </div>
        <div className="flex gap-1.5">
          {/*
            SALVAR EM PRIMEIRO (relato do Felipe): entre seis botões do topo ele
            ficava por último e se perdia no celular; agora é o primeiro, na cor
            sólida da marca, como o salvar em destaque da OS.
          */}
          <Button
            onClick={salvar}
            disabled={salvando}
            className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button variant="outline" size="sm" onClick={imprimir} className="h-9 gap-1.5 text-xs">
            <Printer className="h-4 w-4" /> PDF
          </Button>
          {!ehNovo && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={enviarLinkComValores}
              disabled={copiandoLink || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Copia o link deste pedido COM os valores (itens, fotos e totais atualizados) e abre o WhatsApp — enviar ao cliente após a finalização; o link normal continua sem valores"
            >
              {copiandoLink ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeDollarSign className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Link com valores</span>
              <span className="sm:hidden">Valores</span>
            </Button>
          )}
          {!ehNovo && (
            <Button
              variant="outline"
              size="sm"
              onClick={enviarLinkCliente}
              disabled={copiandoLink || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Copia o link exclusivo deste pedido e abre o WhatsApp com a mensagem pronta para o cliente (sem login, sem valores)"
            >
              {copiandoLink ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Link do cliente</span>
              <span className="sm:hidden">Link</span>
            </Button>
          )}
          {!ehNovo && fotosSalvas.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={baixarZipFotos}
              disabled={baixandoZip || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Baixa todas as fotos deste pedido num único arquivo .zip"
            >
              {baixandoZip ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Images className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Baixar fotos (.zip)</span>
              <span className="sm:hidden">ZIP</span>
            </Button>
          )}
          {!ehNovo && fotosSalvas.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={compartilharZipFotos}
              disabled={compartilhandoZip || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Abre o menu de compartilhamento do aparelho com o .zip das fotos (WhatsApp, e-mail...)"
            >
              {compartilhandoZip ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Images className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Compartilhar fotos</span>
              <span className="sm:hidden">Compartilhar</span>
            </Button>
          )}
          {!ehNovo && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={importarFotosDaOS}
              disabled={importandoFotos || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Copia para este pedido as fotos da OS de origem (se ele veio de uma migração OS → Pedido); a OS mantém as fotos dela"
            >
              {importandoFotos ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Images className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Importar fotos da OS de origem</span>
              <span className="sm:hidden">Importar fotos</span>
            </Button>
          )}
          {!ehNovo && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={migrarParaOS}
              disabled={migrando || salvando}
              className="h-9 gap-1.5 text-xs border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10 font-medium"
              title="Cria uma OS com os mesmos itens e cancela este pedido (nada é apagado)"
            >
              {migrando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Migrar para OS</span>
              <span className="sm:hidden">Migrar</span>
            </Button>
          )}
        </div>
      </div>

      {/* -------- dados do cliente -------- */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#0B3D91]">
            <User className="h-3.5 w-3.5" /> Cliente
          </h2>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-semibold">Cliente *</Label>
              <Button
                type="button"
                size="sm"
                onClick={() => setNovoCliente(true)}
                className="h-7 gap-1 bg-[#0B3D91] px-2 text-[11px] font-bold text-white hover:bg-[#0B3D91]/90"
                title="Cadastrar um cliente novo agora"
              >
                <Plus className="h-3.5 w-3.5" /> Novo cliente
              </Button>
            </div>
            {/*
              BUSCA POR PALAVRA (pedido do Felipe, 20/11/2026).

              No lugar do <select> que obrigava a rolar a lista: digitar
              "leticia" mostra todas as escolas com Letícia no nome, sem
              precisar digitar "ESCOLA". Ignora acento e maiúscula.
            */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscaCliente}
                onChange={(e) => {
                  setBuscaCliente(e.target.value)
                  setClienteId('')
                }}
                placeholder="Digite parte do nome (ex.: leticia)"
                className="h-9 pl-7 text-xs"
              />
            </div>
            {cliente && (
              <p className="flex items-start gap-1 rounded bg-[#0B3D91]/5 px-2 py-1 text-[10px] font-semibold text-[#0B3D91]">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> {cliente.name}
              </p>
            )}
            {buscaCliente && !clienteId && (
              <div className="max-h-40 overflow-y-auto rounded border bg-white">
                {clientesFiltrados.length === 0 ? (
                  <p className="px-2 py-2 text-[10px] text-muted-foreground">
                    Nenhum cliente com "{buscaCliente}".
                  </p>
                ) : (
                  /*
                   * UM nome só (pedido do Felipe, 20/11/2026).
                   * A razão social embaixo do apelido deixava a lista carregada
                   * e confundia: ele identifica a escola pelo nome curto, não
                   * pelo "CONS ESC DA ESC MUN...". O CNPJ continua no talão,
                   * que é onde o documento legal importa.
                   */
                  clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteId(c.id)
                        setBuscaCliente(c.name)
                      }}
                      className="block w-full border-b px-2 py-2 text-left last:border-0 hover:bg-[#0B3D91]/5"
                    >
                      <span className="block text-[11px] font-semibold">{c.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {cliente && (
            <p className="rounded border bg-slate-50 px-2 py-1 text-[9px] text-muted-foreground">
              {cliente.document || 'sem CNPJ'} · {cliente.phone || 'sem telefone'}
            </p>
          )}
          {/*
            Endereço e localizador do cliente do pedido.
            Quem entrega precisa da rota, não do nome da rua decorado.
          */}
          {cliente && temEndereco(cliente) && (
            <div className="rounded-lg border border-[#0B3D91]/30 bg-[#0B3D91]/5 p-2">
              <p className="flex items-start gap-1 text-[10px] leading-snug text-slate-700">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#0B3D91]" />
                <span>{enderecoCompleto(cliente)}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <a
                  href={linkMapa(cliente)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-[#0B3D91] px-2 py-1 text-[10px] font-semibold text-white"
                >
                  <Navigation className="h-3 w-3" /> Rota até o local
                </a>
                <a
                  href={linkMapa(cliente, false)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-[#0B3D91]/40 bg-white px-2 py-1 text-[10px] font-semibold text-[#0B3D91]"
                >
                  Ver no mapa
                </a>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">Data</Label>
            <Input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* -------- itens -------- */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#0B3D91]">
            <ShoppingCart className="h-3.5 w-3.5" /> Produtos ({itens.length})
          </h2>

          <div className="space-y-1.5 rounded-lg border bg-slate-50 p-2">
            {/*
              Campo de busca + BOTÃO DE MAIS para cadastrar produto na hora.
              O Felipe pediu o atalho aqui dentro do pedido: quando o produto
              não existe no catálogo, ele cria sem sair da tela.
            */}
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value)
                    setProdutoSel(null)
                  }}
                  placeholder="Buscar produto..."
                  className="h-8 pl-7 text-[11px]"
                />
              </div>
              <button
                type="button"
                onClick={() => setNovoProdutoAberto(true)}
                title="Cadastrar produto novo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0B3D91] text-white transition hover:bg-[#0B3D91]/90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {busca && !produtoSel && resultados.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border bg-white">
                {resultados.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => escolherProduto(m)}
                    className="block w-full border-b px-2 py-1.5 text-left text-[10px] last:border-0 hover:bg-[#0B3D91]/5"
                  >
                    <span className="font-semibold">{m.name}</span>
                    {/* preço na lista de busca: só para administrador */}
                    {podeVerValores && (
                      <span className="ml-1 text-muted-foreground">
                        {brl(Number(m.price || 0))}
                      </span>
                    )}
                  </button>
                ))}
                {resultadosProduto.total > resultados.length && (
                  <p className="border-t bg-slate-50 px-2 py-1 text-[9px] text-muted-foreground">
                    {resultados.length} de {resultadosProduto.total} — refine a busca
                  </p>
                )}
              </div>
            )}
            <div
              className={podeVerValores ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-2 gap-1.5'}
            >
              <div>
                <Label className="text-[8px] text-muted-foreground">Qtd</Label>
                <Input
                  inputMode="decimal"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  placeholder="0"
                  className="h-8 text-[11px]"
                />
              </div>
              {podeVerValores && (
                <div>
                  <Label className="text-[8px] text-muted-foreground">Preço un.</Label>
                  <Input
                    inputMode="decimal"
                    value={preco}
                    onChange={(e) => setPreco(e.target.value)}
                    placeholder="0,00"
                    className="h-8 text-[11px]"
                  />
                </div>
              )}
              <div className="flex items-end">
                <Button
                  onClick={adicionar}
                  size="sm"
                  className="h-8 w-full gap-1 bg-[#0B3D91] text-[10px] text-white hover:bg-[#0B3D91]/90"
                >
                  <Plus className="h-3 w-3" /> Incluir
                </Button>
              </div>
            </div>
          </div>

          {itens.length > 0 && (
            <div className="space-y-1">
              {itens.map((it, idx) => (
                <div key={idx} className="flex items-center gap-1.5 rounded border p-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold">{it.nome}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        value={String(it.quantity)}
                        onChange={(e) => alterarItem(idx, 'quantity', e.target.value)}
                        className="h-6 w-14 text-[10px]"
                      />
                      <span className="text-[9px] text-muted-foreground">×</span>
                      {podeVerValores ? (
                        <>
                          <Input
                            inputMode="decimal"
                            value={precoBR(it.unit_price)}
                            onChange={(e) => alterarItem(idx, 'unit_price', e.target.value)}
                            className="h-6 w-20 text-[10px]"
                          />
                          <span className="ml-auto font-mono text-[10px] font-bold">
                            {brl(Number(it.quantity) * Number(it.unit_price))}
                          </span>
                        </>
                      ) : (
                        <span className="ml-auto text-[9px] font-semibold text-muted-foreground">
                          {it.unidade || 'UN'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removerItem(idx)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-rose-600"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {podeVerValores && (
                <div className="flex items-center justify-between rounded-lg bg-[#0B3D91] px-2 py-1.5 text-white">
                  <span className="text-[10px] font-bold uppercase">Total</span>
                  <span className="font-mono text-sm font-black">{brl(total)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------- entrega: fotos e assinaturas -------- */}
      <Card>
        <CardContent className="space-y-2.5 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#0B3D91]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmação de entrega
          </h2>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">
              Quem vai entregar / executar
              {designados.length > 1 && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({designados.length} pessoas)
                </span>
              )}
            </Label>
            {/*
              VÁRIAS PESSOAS (pedido do Felipe, 23/11/2026): "pode ser que eu
              coloque mais de uma pessoa para ir executar o serviço ou entrega
              de material". Agora é marcar e desmarcar — cada pessoa marcada
              passa a ver este pedido quando entrar no app.
            */}
            <div className="flex flex-wrap gap-1">
              {tecnicos.map((t) => {
                const marcado = designados.indexOf(t.id) >= 0
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      const proximo = marcado
                        ? designados.filter((x) => x !== t.id)
                        : [...designados, t.id]
                      setDesignados(proximo)
                      // o primeiro marcado continua sendo "quem entregou"
                      if (proximo.length > 0) {
                        setEntregadorId(proximo[0])
                        const primeiro = tecnicos.find((x) => x.id === proximo[0])
                        if (primeiro) setEntregador(primeiro.name)
                      } else {
                        setEntregadorId('')
                        setEntregador('')
                      }
                    }}
                    className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                      marcado
                        ? 'border-[#0B3D91] bg-[#0B3D91] text-white'
                        : 'bg-white hover:border-[#0B3D91]/50'
                    }`}
                  >
                    {marcado && <CheckCircle2 className="h-2.5 w-2.5" />}
                    {t.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
            <Input
              value={entregador}
              onChange={(e) => {
                setEntregador(e.target.value)
                setEntregadorId('')
              }}
              placeholder="Ou digite o nome de quem entregou"
              className="h-9 text-xs"
            />
            {/*
              RECEBIDO POR (campo próprio received_by_name): o nome que a
              cliente digitou ao assinar pelo link público. É SÓ LEITURA —
              quem preenche é o cliente no link; gravar por aqui apagaria o
              nome dela (era o bug do pedido nº 4: os dois brigavam pelo
              mesmo delivered_by_name).
            */}
            {recebidoPor && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                <p className="text-[9px] font-bold uppercase text-emerald-800">Recebido por</p>
                <p className="text-xs font-semibold text-slate-800">{recebidoPor}</p>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">Assinatura de quem entregou</Label>
              {/*
                Técnico escolhido: usa a RUBRICA já cadastrada dele.
                Ele desenhou uma vez no cadastro; repetir o desenho a cada
                pedido é trabalho à toa e sai diferente do documento oficial.
                Sem rubrica cadastrada, cai no campo de assinar.
              */}
              {entregador && rubricaEntregador ? (
                <div className="flex flex-col items-center rounded-lg border bg-white p-2">
                  <img
                    src={rubricaEntregador}
                    alt={`Rubrica de ${entregador}`}
                    className="max-h-16 object-contain"
                  />
                  <p className="mt-1 text-[9px] font-semibold">{entregador}</p>
                  <p className="text-[8px] text-muted-foreground">rubrica cadastrada</p>
                </div>
              ) : entregador ? (
                <div className="rounded-lg border bg-white p-1">
                  <SignaturePad
                    onSave={() => setAssinouEntregador(true)}
                    onCanvasReady={(c) => (canvasEntregadorRef.current = c)}
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-center text-[10px] text-muted-foreground">
                  Escolha quem entregou para carregar a rubrica.
                </p>
              )}
              {assinouEntregador && !rubricaEntregador && (
                <p className="text-[9px] text-emerald-700">✓ assinado</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">
                Assinatura do cliente (recebimento)
              </Label>
              {/*
                ASSINATURA GRAVADA (somente-leitura): vem do link público ou de
                uma entrega anterior. O canvas abaixo continua VAZIO — assinar
                aqui de novo grava por cima (a anterior fica no histórico).
              */}
              {sigClienteGravada && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
                  <img
                    src={sigClienteGravada}
                    alt="Assinatura do cliente gravada"
                    className="max-h-16 min-w-24 object-contain"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-[9px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> ASSINADO
                    </p>
                    {recebidoPor && (
                      <p className="text-[9px] font-semibold text-slate-800">
                        Recebido por {recebidoPor}
                      </p>
                    )}
                    {assinadoEm && <p className="text-[9px] text-emerald-700">em {assinadoEm}</p>}
                    <p className="text-[8px] text-muted-foreground">
                      assinatura gravada — para re-assinar, use o campo abaixo
                    </p>
                  </div>
                </div>
              )}
              <div className="rounded-lg border bg-white p-1">
                <SignaturePad
                  onSave={() => setAssinouCliente(true)}
                  onCanvasReady={(c) => (canvasClienteRef.current = c)}
                />
              </div>
              {assinouCliente ? (
                <p className="text-[9px] text-emerald-700">✓ assinado</p>
              ) : sigClienteGravada ? null : (
                <p className="flex items-center gap-1 text-[9px] text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5" /> pendente
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">Fotos da entrega</Label>
            {/*
              DOIS botões separados (pedido do Felipe, 20/11/2026).

              Antes havia um só, com `capture="environment"`: no celular isso
              abre a câmera direto e nunca a galeria. Separando os inputs, o
              primeiro abre a câmera ao vivo e o segundo a galeria de fotos.
            */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files || [])
                setFotos((prev) => [...prev, ...fs])
                e.target.value = ''
              }}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files || [])
                setFotos((prev) => [...prev, ...fs])
                e.target.value = ''
              }}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cameraRef.current?.click()}
                className="h-8 gap-1.5 text-[11px]"
              >
                <Camera className="h-3.5 w-3.5" /> Tirar foto
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => galeriaRef.current?.click()}
                className="h-8 gap-1.5 text-[11px]"
              >
                <Images className="h-3.5 w-3.5" /> Da galeria
              </Button>
            </div>
            {/*
              PRÉVIA DAS FOTOS (pedido do Felipe, 20/11/2026).
              Antes a tela só dizia "3 foto(s) anexada(s)" — ele não sabia qual
              foto estava indo, nem se estava torta ou escura. Agora cada foto
              aparece em miniatura, com botão de remover.
            */}
            {/* fotos JÁ SALVAS, quando o pedido é reaberto */}
            {fotosSalvas.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-semibold text-emerald-700">
                  {fotosSalvas.length} foto(s) já salva(s) no pedido
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {fotosSalvas.map((nome, i) => (
                    <a
                      key={nome}
                      href={getFileUrl('quotes', salvoId, nome)}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border"
                    >
                      <img
                        src={getFileUrl('quotes', salvoId, nome)}
                        alt={`Foto ${i + 1}`}
                        className="h-20 w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {fotos.length > 0 && (
              <>
                <p className="text-[9px] text-muted-foreground">
                  {fotos.length} foto(s) — toque no X para remover
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {fotos.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="relative aspect-square overflow-hidden rounded-md border bg-white"
                    >
                      {/* quadradinho 1:1, mas a foto aparece INTEIRA (sem corte) */}
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setFotos((prev) => prev.filter((_, k) => k !== i))}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white"
                        aria-label="Remover foto"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[7px] text-white">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {fotos.length > 0 && (
              <>
                <p className="text-[9px] text-muted-foreground">
                  {fotos.map((f) => f.name).join(', ')}
                </p>
                {/*
                  CONFIRMAR AS FOTOS ANEXADAS (relato do Felipe): faltava o
                  passo que GRAVA a foto na tela — este botão salva o pedido
                  com elas (append, nada é apagado) sem depender de achar o
                  "Salvar" do topo.
                */}
                <Button
                  type="button"
                  onClick={salvar}
                  disabled={salvando}
                  className="h-8 w-full gap-1.5 bg-[#0B3D91] text-[11px] font-semibold text-white hover:bg-[#0B3D91]/90"
                >
                  {salvando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Salvar {fotos.length} foto(s) no pedido
                </Button>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">Observações</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Condições, prazo, forma de pagamento..."
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* cadastro rápido de produto: no pedido, com preço se for admin */}
      <ProdutoRapidoDialog
        open={novoProdutoAberto}
        onOpenChange={setNovoProdutoAberto}
        podeVerValores={podeVerValores}
        onCriado={async (novo) => {
          // o produto criado entra na lista na hora, já selecionado
          setMateriais((prev) => [novo, ...prev])
          setProdutoSel(novo)
          setBusca(novo.name)
          setPreco(precoBR(Number((novo as any).price || 0)))
        }}
      />

      {/* -------- o talão para impressão -------- */}
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-0">
          <div id="talao-pedido" className="bg-white p-5 text-slate-900">
            {/* cabeçalho */}
            <div className="flex items-start justify-between border-b-2 border-[#0B3D91] pb-2">
              <div className="flex items-center gap-2">
                {empresa?.logo && (
                  <img
                    src={`${(empresa as any).__base || ''}/api/files/settings/${(empresa as any).id}/${empresa.logo}`}
                    alt=""
                    className="h-11 w-11 object-contain"
                  />
                )}
                <div>
                  <p className="text-base font-black uppercase text-[#0B3D91]">
                    {empresa?.nome_fantasia || 'FL SERVIÇOS'}
                  </p>
                  <p className="text-[8px] leading-tight text-slate-600">{empresa?.razao_social}</p>
                  <p className="text-[8px] leading-tight text-slate-600">
                    CNPJ {empresa?.cnpj} · IE {empresa?.ie}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black uppercase text-[#0B3D91]">
                  Pedido{numero ? ` nº ${numero}` : ''}
                </p>
                <p className="text-[9px] text-slate-600">{dataBR(data)}</p>
              </div>
            </div>

            {/* cliente */}
            <div className="mt-2 rounded border border-slate-300 bg-slate-50 p-2">
              <p className="text-[9px] font-bold uppercase text-slate-500">Cliente</p>
              {/* Um nome só: o que ele usa para identificar a escola */}
              <p className="text-[11px] font-bold">{cliente?.name || '—'}</p>
              <p className="text-[9px] text-slate-600">
                {cliente?.document || 'sem documento'}
                {cliente?.phone ? ` · ${cliente.phone}` : ''}
              </p>
              {cliente && temEndereco(cliente) && (
                <p className="text-[9px] font-semibold text-slate-700">
                  {enderecoCompleto(cliente)}
                </p>
              )}
            </div>

            {/* local de entrega em destaque: é o que quem entrega precisa achar */}
            {cliente && temEndereco(cliente) && (
              <div className="mt-1 rounded border border-slate-300 p-1.5">
                <p className="text-[8px] font-bold uppercase text-slate-500">Local de entrega</p>
                <p className="text-[9px]">{enderecoCompleto(cliente)}</p>
              </div>
            )}

            {/* itens */}
            <table className="mt-2 w-full border-collapse text-[9px]">
              <thead>
                <tr className="bg-[#0B3D91] text-white">
                  <th className="border p-1 text-left">PRODUTO</th>
                  <th className="border p-1 text-right" style={{ width: 40 }}>
                    QTD
                  </th>
                  {podeVerValores && (
                    <>
                      <th className="border p-1 text-right" style={{ width: 60 }}>
                        UNIT.
                      </th>
                      <th className="border p-1 text-right" style={{ width: 65 }}>
                        TOTAL
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i}>
                    <td className="border p-1">{it.nome}</td>
                    <td className="border p-1 text-right">{it.quantity}</td>
                    {podeVerValores && (
                      <>
                        <td className="border p-1 text-right">{brl(Number(it.unit_price))}</td>
                        <td className="border p-1 text-right font-semibold">
                          {brl(Number(it.quantity) * Number(it.unit_price))}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {itens.length === 0 && (
                  <tr>
                    <td className="border p-2 text-center text-slate-400" colSpan={4}>
                      nenhum item
                    </td>
                  </tr>
                )}
              </tbody>
              {podeVerValores && (
                <tfoot>
                  <tr className="bg-slate-100">
                    <td className="border p-1 font-black" colSpan={3}>
                      TOTAL DO PEDIDO
                    </td>
                    <td className="border p-1 text-right font-black text-[#0B3D91]">
                      {brl(total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>

            {obs && (
              <p className="mt-1.5 text-[9px] text-slate-600">
                <strong>Obs.:</strong> {obs}
              </p>
            )}

            {/*
              ASSINATURAS ESTAMPADAS no documento.
              Antes o talão mostrava só a linha em branco e a assinatura
              capturada na tela ficava sem uso no PDF. Agora a rubrica do
              entregador (ou o desenho dele) e a assinatura do cliente
              aparecem impressas acima da linha, como num documento assinado.
            */}
            <div className="mt-4 grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="flex h-14 items-end justify-center">
                  {sigEntregador ? (
                    <img src={sigEntregador} alt="" className="max-h-14 object-contain" />
                  ) : rubricaEntregador ? (
                    <img src={rubricaEntregador} alt="" className="max-h-14 object-contain" />
                  ) : null}
                </div>
                <div className="border-t border-slate-500 pt-1">
                  <p className="text-[9px] font-bold">{entregador || 'QUEM ENTREGOU'}</p>
                  <p className="text-[7px] text-slate-500">Entregador</p>
                </div>
              </div>
              <div className="text-center">
                <div className="flex h-14 items-end justify-center">
                  {sigCliente || sigClienteGravada ? (
                    <img
                      src={sigCliente || sigClienteGravada}
                      alt=""
                      className="max-h-14 object-contain"
                    />
                  ) : null}
                </div>
                <div className="border-t border-slate-500 pt-1">
                  <p className="text-[9px] font-bold">{cliente?.name}</p>
                  <p className="text-[7px] text-slate-500">Recebi o material acima</p>
                </div>
              </div>
            </div>

            {/*
              FOTOS NO PDF (pedido do Felipe, 20/11/2026).
              O talão saía só com texto; ele precisava mostrar ao cliente o que
              foi entregue. As fotos entram em miniatura, 3 por linha, antes do
              rodapé — assim cabem na mesma página do documento.
            */}
            {(fotos.length > 0 || fotosSalvas.length > 0) && (
              <div className="mt-3 border-t pt-2">
                <p className="mb-1 text-[8px] font-bold uppercase text-slate-500">
                  Fotos da entrega
                </p>
                {/*
                  FOTOS SEM DISTORÇÃO (reclamação do Felipe, 20/11/2026).

                  Estava `object-cover` numa caixa de altura fixa: a imagem era
                  CORTADA e esticada para preencher, e saía distorcida no papel.
                  Com `aspect-[4/3]` + `object-contain`, a foto mantém a
                  proporção original e aparece inteira, como na OS.
                */}
                <div className="grid grid-cols-2 gap-1">
                  {/* já salvas no servidor */}
                  {fotosSalvas.map((nome, i) => (
                    <div
                      key={`s${i}`}
                      className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border bg-white"
                    >
                      <img
                        src={getFileUrl('quotes', salvoId, nome)}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ))}
                  {/* recém-escolhidas, ainda no aparelho */}
                  {fotos.map((f, i) => (
                    <div
                      key={`n${i}`}
                      className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border bg-white"
                    >
                      <img
                        src={URL.createObjectURL(f)}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* no papel o rodapé encosta: 3mm bastam para separar do corte */}
            <p className="mt-1.5 border-t pt-0.5 text-center text-[7px] leading-tight text-slate-500">
              {empresa?.endereco} · {empresa?.telefone} · {empresa?.email}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cadastro rápido: cria o cliente sem sair do pedido. */}
      <ClienteRapidoDialog
        open={novoCliente}
        onOpenChange={setNovoCliente}
        onCriado={(c) => {
          setClientes((prev) => [c as never, ...prev])
          setClienteId(c.id)
          setBuscaCliente(c.nickname || c.name)
          setNovoCliente(false)
        }}
      />
    </div>
  )
}
