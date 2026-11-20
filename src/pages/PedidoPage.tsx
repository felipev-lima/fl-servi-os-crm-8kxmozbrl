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
import { getClients, getMaterials, updateMaterial } from '@/services/api'
import { createQuote, getQuote, updateQuote, totalDoDocumento, getClientes } from '@/services/crm'
import { getEmpresa, type Empresa } from '@/lib/empresa'
import type { Material } from '@/types/flservicos'
import type { Client } from '@/types/flservicos'
import type { QuoteItem } from '@/types/crm'
import { brl, dataBR } from '@/types/crm'
import { enderecoCompleto, linkMapa, temEndereco } from '@/lib/local'
import { prepararFoto } from '@/lib/imagem'
import { SignaturePad } from '@/components/SignaturePad'
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
  Camera,
  Search,
  ShoppingCart,
  User,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Navigation,
} from 'lucide-react'
import { toast } from 'sonner'

interface ItemLocal extends QuoteItem {
  nome: string
  unidade?: string
}

export default function PedidoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ehNovo = !id || id === 'novo'

  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [clientes, setClientes] = useState<Client[]>([])
  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [itens, setItens] = useState<ItemLocal[]>([])
  const [obs, setObs] = useState('')
  const [entregador, setEntregador] = useState('')
  const [assinouCliente, setAssinouCliente] = useState(false)
  const [assinouEntregador, setAssinouEntregador] = useState(false)
  const [fotos, setFotos] = useState<File[]>([])
  const [salvoId, setSalvoId] = useState<string>('')

  // busca de cliente
  const [buscaCliente, setBuscaCliente] = useState('')

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
  const arquivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [e, c, m] = await Promise.all([getEmpresa(), getClientes(), getMaterials()])
        setEmpresa(e)
        setClientes(c)
        setMateriais(m)
        if (!ehNovo && id) {
          const q = await getQuote(id)
          setSalvoId(q.id)
          setClienteId(q.client || '')
          setData((q.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10))
          setObs(q.notes || '')
          setEntregador(q.delivered_by_name || '')
          setItens(
            (q.items || []).map((i) => ({
              ...i,
              nome: i.name || i.description || '',
              unidade: i.unit,
            })),
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

  const resultados = useMemo(() => {
    const t = semAcento(busca)
    if (!t) return []
    return materiais.filter((m) => semAcento(m.name).includes(t)).slice(0, 8)
  }, [busca, materiais])

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
      fd.append('status', salvoId ? 'ENTREGUE' : 'PEDIDO')
      fd.append('notes', obs)
      fd.append('delivered_by_name', entregador)
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
      if (sigCliente) {
        const f = base64ParaArquivo(sigCliente, 'assinatura-cliente.png')
        if (f) fd.append('signature_client', f)
      }
      if (sigEntregador) {
        const f = base64ParaArquivo(sigEntregador, 'assinatura-entregador.png')
        if (f) fd.append('signature_deliverer', f)
      }
      for (const f of fotos) {
        const preparada = await prepararFoto(f)
        fd.append('photos', preparada)
      }

      const r = salvoId ? await updateQuote(salvoId, fd as any) : await createQuote(fd as any)

      setSalvoId((r as any).id)
      toast.success(salvoId ? 'Pedido atualizado.' : 'Pedido criado.')
      return (r as any).id
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Não foi possível salvar o pedido.'
      toast.error(msg)
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
          margin: [8, 8, 8, 8],
          filename: `PEDIDO-${cliente?.name?.slice(0, 20) || 'CLIENTE'}-${data}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        } as any)
        .from(alvo)
        .save()
      toast.success('PDF gerado.')
    } catch {
      window.print()
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">
            {ehNovo ? 'Novo pedido' : 'Pedido'}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Venda de produto com confirmação de entrega
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={imprimir} className="h-9 gap-1.5 text-xs">
            <Printer className="h-4 w-4" /> PDF
          </Button>
          <Button
            onClick={salvar}
            disabled={salvando}
            className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* -------- dados do cliente -------- */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#0B3D91]">
            <User className="h-3.5 w-3.5" /> Cliente
          </h2>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">Cliente *</Label>
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
            <div className="relative">
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
            {busca && !produtoSel && resultados.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border bg-white">
                {resultados.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => escolherProduto(m)}
                    className="block w-full border-b px-2 py-1.5 text-left text-[10px] last:border-0 hover:bg-[#0B3D91]/5"
                  >
                    <span className="font-semibold">{m.name}</span>
                    <span className="ml-1 text-muted-foreground">{brl(Number(m.price || 0))}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5">
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
                      <Input
                        inputMode="decimal"
                        value={precoBR(it.unit_price)}
                        onChange={(e) => alterarItem(idx, 'unit_price', e.target.value)}
                        className="h-6 w-20 text-[10px]"
                      />
                      <span className="ml-auto font-mono text-[10px] font-bold">
                        {brl(Number(it.quantity) * Number(it.unit_price))}
                      </span>
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
              <div className="flex items-center justify-between rounded-lg bg-[#0B3D91] px-2 py-1.5 text-white">
                <span className="text-[10px] font-bold uppercase">Total</span>
                <span className="font-mono text-sm font-black">{brl(total)}</span>
              </div>
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
            <Label className="text-[10px] font-semibold">Quem entregou</Label>
            <Input
              value={entregador}
              onChange={(e) => setEntregador(e.target.value)}
              placeholder="Nome do técnico ou responsável"
              className="h-9 text-xs"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">Assinatura de quem entregou</Label>
              <div className="rounded-lg border bg-white p-1">
                <SignaturePad
                  onSave={() => setAssinouEntregador(true)}
                  onCanvasReady={(c) => (canvasEntregadorRef.current = c)}
                />
              </div>
              {assinouEntregador && <p className="text-[9px] text-emerald-700">✓ assinado</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold">
                Assinatura do cliente (recebimento)
              </Label>
              <div className="rounded-lg border bg-white p-1">
                <SignaturePad
                  onSave={() => setAssinouCliente(true)}
                  onCanvasReady={(c) => (canvasClienteRef.current = c)}
                />
              </div>
              {assinouCliente ? (
                <p className="text-[9px] text-emerald-700">✓ assinado</p>
              ) : (
                <p className="flex items-center gap-1 text-[9px] text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5" /> pendente
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold">Fotos da entrega</Label>
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files || [])
                setFotos((prev) => [...prev, ...fs])
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => arquivoRef.current?.click()}
              className="h-8 w-full gap-1.5 text-[11px]"
            >
              <Camera className="h-3.5 w-3.5" /> Tirar / escolher foto ({fotos.length})
            </Button>
            {fotos.length > 0 && (
              <p className="text-[9px] text-muted-foreground">
                {fotos.map((f) => f.name).join(', ')}
              </p>
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
                <p className="text-sm font-black uppercase text-[#0B3D91]">Pedido</p>
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
                  <th className="border p-1 text-right" style={{ width: 60 }}>
                    UNIT.
                  </th>
                  <th className="border p-1 text-right" style={{ width: 65 }}>
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => (
                  <tr key={i}>
                    <td className="border p-1">{it.nome}</td>
                    <td className="border p-1 text-right">{it.quantity}</td>
                    <td className="border p-1 text-right">{brl(Number(it.unit_price))}</td>
                    <td className="border p-1 text-right font-semibold">
                      {brl(Number(it.quantity) * Number(it.unit_price))}
                    </td>
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
              <tfoot>
                <tr className="bg-slate-100">
                  <td className="border p-1 font-black" colSpan={3}>
                    TOTAL DO PEDIDO
                  </td>
                  <td className="border p-1 text-right font-black text-[#0B3D91]">{brl(total)}</td>
                </tr>
              </tfoot>
            </table>

            {obs && (
              <p className="mt-1.5 text-[9px] text-slate-600">
                <strong>Obs.:</strong> {obs}
              </p>
            )}

            {/* assinaturas */}
            <div className="mt-5 grid grid-cols-2 gap-6">
              <div className="text-center">
                <div className="border-t border-slate-500 pt-1">
                  <p className="text-[9px] font-bold">{entregador || 'QUEM ENTREGOU'}</p>
                  <p className="text-[7px] text-slate-500">Entregador</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-500 pt-1">
                  <p className="text-[9px] font-bold">{cliente?.name}</p>
                  <p className="text-[7px] text-slate-500">Recebi o material acima</p>
                </div>
              </div>
            </div>

            <p className="mt-3 border-t pt-1 text-center text-[7px] text-slate-500">
              {empresa?.endereco} · {empresa?.telefone} · {empresa?.email}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
