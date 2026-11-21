import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  updateMaterial,
  getClients,
  getTechnicians,
  getMaterials,
  getOrderMaterials,
  addOrderMaterial,
  updateOrderMaterial,
  deleteOrderMaterial,
  getOrderPhotos,
  addOrderPhoto,
  deleteOrderPhoto,
  getOrderHistory,
  getNextOrderNumber,
  getFileUrl,
  getMaterialKits,
  getMaterialKitItems,
} from '@/services/api'
import {
  WorkOrder,
  Client,
  Technician,
  Material,
  OrderMaterial,
  OrderPhoto,
  OrderHistory,
  OrderStatus,
  ServiceType,
  MaterialKit,
  MaterialKind,
} from '@/types/flservicos'
import { ChecklistItem } from '@/types/checklist'
import { baixarPorUsoNaOS, devolverPorRemocaoDaOS } from '@/lib/estoque'
import { custoPorMarcacao } from '@/lib/precos'
import { enderecoCompleto, linkMapa, temEndereco } from '@/lib/local'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SignaturePad } from '@/components/SignaturePad'
import { GeoLocationPicker } from '@/components/GeoLocationPicker'
import { ReportTemplateV3 } from '@/components/ReportTemplateV3'
import { SearchCombobox } from '@/components/SearchCombobox'
import { ProdutoRapidoDialog } from '@/components/ProdutoRapidoDialog'
import { ClienteRapidoDialog } from '@/components/ClienteRapidoDialog'
import { createZip, baixarBlob, safeName, type ZipEntry } from '@/lib/zip'
import { avisarSincronizacao } from '@/lib/onedriveSync'
import { gravarGpsNaFoto, pegarPosicao } from '@/lib/gpsFoto'
import { prepararFoto } from '@/lib/imagem'
import {
  Save,
  Printer,
  FileText,
  Clock,
  MapPin,
  Camera,
  Trash2,
  Plus,
  CheckCircle2,
  User,
  History,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Upload,
  Download,
  Share2,
  Images,
  X,
  Layers,
  Navigation,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * Converte a data que vem do banco para o formato que o campo `type="date"`
 * entende (AAAA-MM-DD).
 *
 * O PocketBase devolve "2026-11-14 00:00:00.000Z" — com ESPAÇO entre a data e a
 * hora, não com "T". Por isso o antigo `split('T')[0]` não cortava nada e o
 * campo aparecia VAZIO: o usuário escolhia a data, salvava, e ela "sumia".
 */
function dataParaInput(valor?: string): string {
  if (!valor) return ''
  const s = String(valor).trim()
  // já está no formato certo
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // "2026-11-14 00:00:00.000Z" ou "2026-11-14T00:00:00.000Z"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return ''
}

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isTechnician, isConsultant, isAdmin } = useAuth()
  const isNew = id === 'nova'

  const [order, setOrder] = useState<Partial<WorkOrder>>({
    // Sem número fixo: deixamos vazio para o createWorkOrder buscar o próximo
    // disponível. Um valor fixo aqui já causou colisão de numeração.
    order_number: 0,
    status: 'ABERTA',
    service_type: 'Manutenção Preventiva',
    description: '',
    technical_report: '',
    scheduled_date: new Date().toISOString().split('T')[0],
  })

  const [clients, setClients] = useState<Client[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [materialsCatalog, setMaterialsCatalog] = useState<Material[]>([])

  const [orderMaterials, setOrderMaterials] = useState<OrderMaterial[]>([])
  const [orderPhotos, setOrderPhotos] = useState<OrderPhoto[]>([])
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPdfView, setShowPdfView] = useState(false)

  // Form states auxiliares
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const [materialQty, setMaterialQty] = useState('')
  const [materialNotes, setMaterialNotes] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)

  // Listas de materiais padrão (kits de serviço)
  const [kits, setKits] = useState<MaterialKit[]>([])
  const [selectedKitId, setSelectedKitId] = useState('')
  const [applyingKit, setApplyingKit] = useState(false)
  const [baixandoZip, setBaixandoZip] = useState(false)

  // Cadastro rápido em campo: produto novo e cliente novo sem sair da OS
  const [novoProdutoAberto, setNovoProdutoAberto] = useState(false)
  const [novoClienteAberto, setNovoClienteAberto] = useState(false)

  const [photoDescription, setPhotoDescription] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<
    { file: File; preview: string; nome: string; tipo: string; podeVer: boolean }[]
  >([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [baixandoTodas, setBaixandoTodas] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  // Último motivo de falha ao enviar foto: fica visível até o próximo envio
  const [ultimoErroFoto, setUltimoErroFoto] = useState('')
  /**
   * Status como está GRAVADO no banco.
   *
   * O `order.status` muda quando o usuário escolhe outro status no seletor, mas
   * até salvar o banco ainda tem o antigo. Antes o save passava
   * `order.status` como "de" e como "para" — iguais, então o histórico não
   * registrava a mudança (era o bug relatado).
   */
  const statusOriginalRef = useRef<string>('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('')
  const [statusChangeNotes, setStatusChangeNotes] = useState('')

  // Checklist de itens pendentes da OS (campo JSON `checklist`): o técnico
  // lança o que falta fazer, marca como concluído e salva junto com a OS.
  const [novoItemChecklist, setNovoItemChecklist] = useState('')
  const itensChecklist: ChecklistItem[] = Array.isArray(order.checklist) ? order.checklist : []

  const adicionarItemChecklist = () => {
    const texto = novoItemChecklist.trim()
    if (!texto) return
    setOrder((prev) => ({
      ...prev,
      checklist: [
        ...(Array.isArray(prev.checklist) ? prev.checklist : []),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: texto,
          done: false,
        },
      ],
    }))
    setNovoItemChecklist('')
  }

  const alternarItemChecklist = (itemId: string) => {
    setOrder((prev) => ({
      ...prev,
      checklist: (Array.isArray(prev.checklist) ? prev.checklist : []).map((it) =>
        it.id === itemId ? { ...it, done: !it.done } : it,
      ),
    }))
  }

  const removerItemChecklist = (itemId: string) => {
    setOrder((prev) => ({
      ...prev,
      checklist: (Array.isArray(prev.checklist) ? prev.checklist : []).filter(
        (it) => it.id !== itemId,
      ),
    }))
  }

  useEffect(() => {
    loadAuxData()
    if (!isNew && id) {
      loadOrderData(id)
    } else {
      getNextOrderNumber().then((num) => {
        setOrder((prev) => ({ ...prev, order_number: num }))
      })
      setLoading(false)
    }
  }, [id, isNew])

  const loadAuxData = async () => {
    try {
      const [c, t, m, k] = await Promise.all([
        getClients(),
        getTechnicians(),
        getMaterials(),
        getMaterialKits(),
      ])
      setClients(c)
      setTechnicians(t)
      setMaterialsCatalog(m)
      setKits(k.filter((x) => x.active !== false))
    } catch (err) {
      console.error(err)
    }
  }

  /**
   * Altera o valor unitário de um material JÁ LANÇADO na OS.
   *
   * Serve para dois casos que o Felipe vive:
   *  1. produto sem preço no catálogo — ele digita aqui o valor de venda;
   *  2. negociação — o produto custa R$ 10, mas fechou por R$ 9.
   *
   * Depois de gravar na OS, pergunta se o valor também deve ir para o
   * catálogo. Se ele recusar (negociação), a OS fica com o valor combinado e
   * a tabela de preço continua intacta.
   */
  const handleAlterarPrecoMaterial = async (mat: OrderMaterial, valor: string) => {
    const limpo = valor.replace(/[^0-9.,]/g, '').replace(',', '.')
    const preco = limpo === '' ? 0 : parseFloat(limpo)
    if (isNaN(preco) || preco < 0) {
      toast.error('Valor inválido.')
      return
    }
    if (Math.abs((mat.unit_price || 0) - preco) < 0.001) return

    const anterior = mat.unit_price || 0
    const qtd = mat.quantity || 0

    // responde antes de gravar: a pergunta é sobre a intenção dele
    const atualizarCatalogo =
      preco > 0 &&
      confirm(
        `Valor alterado de R$ ${anterior.toFixed(2)} para R$ ${preco.toFixed(2)}.\n\n` +
          'Deseja atualizar também o preço no CADASTRO do produto?\n\n' +
          'OK = atualiza o catálogo (novo preço de tabela)\n' +
          'Cancelar = só nesta OS (preço negociado)',
      )

    setOrderMaterials((prev) =>
      prev.map((m) => (m.id === mat.id ? { ...m, unit_price: preco } : m)),
    )

    try {
      await updateOrderMaterial(mat.id, {
        unit_price: preco,
        total_price: Number((qtd * preco).toFixed(2)),
      })

      if (atualizarCatalogo && mat.material) {
        /**
         * Ao gravar o preço no catálogo, o CUSTO acompanha pela marcação.
         *
         * Mesma regra da tela de custos: o preço é a âncora. Manter o custo
         * antigo faria um produto de R$ 5,00 vendido a R$ 690 aparecer com
         * 99% de margem. Se o custo dele era confirmado, a pergunta já foi
         * feita acima; aqui o padrão é recalcular.
         */
        const prod = materialsCatalog.find((mm) => mm.id === mat.material)
        const custoNovo = custoPorMarcacao(preco)
        const dados: any = { price: preco, cost_estimated: true }
        if (custoNovo > 0) dados.cost = custoNovo

        await updateMaterial(mat.material, dados)
        setMaterialsCatalog((prev) =>
          prev.map((mm) => (mm.id === mat.material ? ({ ...mm, ...dados } as any) : mm)),
        )
        // marca o produto do catálogo para não ser sobrescrito pela
        // sincronização automática de preço ao reabrir a OS
        const novos = orderMaterials.map((m) =>
          m.material === mat.material ? { ...m, unit_price: preco } : m,
        )
        setOrderMaterials(novos)
        toast.success(
          custoNovo > 0 && prod
            ? `Preço e custo atualizados no cadastro (custo R$ ${custoNovo.toFixed(2)}).`
            : 'Valor atualizado na OS e no cadastro do produto.',
        )
      } else {
        toast.success('Valor atualizado só nesta OS.')
      }

      if (id) {
        const atualizadas = await getOrderMaterials(id)
        setOrderMaterials(atualizadas)
      }
    } catch (err) {
      setOrderMaterials((prev) =>
        prev.map((m) => (m.id === mat.id ? { ...m, unit_price: anterior } : m)),
      )
      toast.error('Erro ao salvar o valor.')
    }
  }

  /**
   * Corrige o tipo (CAPITAL/CONSUMO/SERVICO) de uma linha JÁ LANÇADA na OS.
   *
   * O tipo vem preenchido do cadastro do produto (default_kind) — este ajuste
   * é pontual: vale só para este lançamento, não mexe no cadastro.
   */
  const handleAlterarKindMaterial = async (mat: OrderMaterial, novoKind: string) => {
    const kind = (novoKind || '') as MaterialKind
    setOrderMaterials((prev) => prev.map((m) => (m.id === mat.id ? { ...m, kind } : m)))
    try {
      await updateOrderMaterial(mat.id, { kind } as any)
      if (kind) toast.success(`Tipo alterado para ${kind}.`)
    } catch (err) {
      setOrderMaterials((prev) => prev.map((m) => (m.id === mat.id ? { ...m, kind: mat.kind } : m)))
      toast.error('Erro ao alterar o tipo do lançamento.')
    }
  }

  /**
   * Alinha o preço das linhas da OS com o preço atual do catálogo.
   *
   * Quando o material entra na OS, o preço é copiado do produto naquele
   * instante. Se depois o admin preenche o preço de um produto que estava
   * zerado (caso comum: o técnico cadastrou em campo e já lançou), a OS
   * ficaria mostrando R$ 0,00 para sempre. Esta rotina corrige ao abrir a OS.
   */
  const sincronizarPrecosDaOS = async (orderId: string, linha: OrderMaterial[]) => {
    try {
      let mudou = false
      for (const item of linha) {
        const precoProduto = item.expand?.material?.price
        if (precoProduto == null || precoProduto <= 0) continue
        const precoNaOs = item.unit_price || 0

        // Só preenche quando a OS está SEM preço (produto que foi lançado
        // zerado porque o preço ainda não existia no catálogo). Se a OS tem um
        // valor diferente do catálogo, é preço negociado — não mexe.
        if (precoNaOs > 0) continue

        const qtd = item.quantity || 0
        await updateOrderMaterial(item.id, {
          unit_price: precoProduto,
          total_price: Number((qtd * precoProduto).toFixed(2)),
        })
        mudou = true
      }
      if (mudou) {
        const atualizadas = await getOrderMaterials(orderId)
        setOrderMaterials(atualizadas)
      }
    } catch (_) {
      // falha aqui não pode impedir a OS de abrir
    }
  }

  const loadOrderData = async (orderId: string) => {
    setLoading(true)
    try {
      const [o, mats, photos, hist] = await Promise.all([
        getWorkOrderById(orderId),
        getOrderMaterials(orderId),
        getOrderPhotos(orderId),
        getOrderHistory(orderId),
      ])
      setOrder(o)
      // guarda o status que veio do banco, para comparar no momento de salvar
      statusOriginalRef.current = String((o as any).status || '')
      setOrderMaterials(mats)
      setOrderPhotos(photos)
      setOrderHistory(hist)

      // O preco e gravado no material da OS no momento em que ele e lancado.
      // Se o preco do produto mudar depois (o admin preencheu o preco de um
      // produto que estava zerado), a OS ficaria com o valor velho. Aqui a
      // linha da OS se atualiza com o preco atual do catalogo.
      await sincronizarPrecosDaOS(orderId, mats)
    } catch (err) {
      toast.error('Erro ao carregar detalhes da OS.')
      navigate('/ordens')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveOrder = async () => {
    if (!order.client) {
      toast.error('Selecione o cliente.')
      return
    }
    if (!order.description) {
      toast.error('Preencha a descrição do serviço.')
      return
    }

    setSaving(true)
    try {
      const currentUserName = user?.name || 'Técnico FL'

      if (isNew) {
        const created = await createWorkOrder(order, currentUserName)
        toast.success(`Ordem de Serviço #${created.order_number} criada com sucesso!`)
        avisarSincronizacao(created.id, created.order_number, 'criacao')
        navigate(`/ordens/${created.id}`)
      } else if (id) {
        // Se houver nova assinatura desenhada em base64, converter para arquivo Blob
        const formData = new FormData()
        Object.entries(order).forEach(([key, val]) => {
          if (
            key !== 'expand' &&
            key !== 'signature_image' &&
            key !== 'checklist' &&
            val !== undefined &&
            val !== null
          ) {
            // A data do campo vem como AAAA-MM-DD; gravamos como data+hora para
            // o PocketBase não descartar o valor nem voltar vazio depois.
            if (key === 'scheduled_date' && /^\d{4}-\d{2}-\d{2}$/.test(String(val))) {
              formData.append(key, `${val} 00:00:00.000Z`)
            } else {
              formData.append(key, String(val))
            }
          }
        })

        if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
          const res = await fetch(signatureDataUrl)
          const blob = await res.blob()
          formData.append('signature_image', blob, 'assinatura.png')
        }

        // O checklist é um ARRAY de objetos: dentro do loop acima ele viraria a
        // string "[object Object]" e o banco guardaria lixo. Vai como JSON no
        // campo JSON `checklist` da coleção.
        formData.append('checklist', JSON.stringify(itensChecklist))

        // "de" = status gravado no banco; "para" = o que está na tela agora.
        // Era aqui que o histórico se perdia: os dois eram o mesmo valor.
        const statusAnterior = (statusOriginalRef.current ||
          (order.status as string)) as OrderStatus
        const statusNovo = order.status as OrderStatus
        const mudouStatus = statusAnterior !== statusNovo

        const updated = await updateWorkOrder(
          id,
          formData,
          currentUserName,
          statusAnterior,
          statusNovo,
          mudouStatus
            ? statusChangeNotes || `Status alterado de ${statusAnterior} para ${statusNovo}`
            : statusChangeNotes || undefined,
        )

        toast.success(
          mudouStatus
            ? `Ordem salva. Status: ${statusAnterior} → ${statusNovo}`
            : 'Ordem de serviço salva com sucesso!',
        )
        if (mudouStatus) statusOriginalRef.current = statusNovo
        avisarSincronizacao(id, updated.order_number, 'edicao')
        setStatusChangeNotes('')
        loadOrderData(id)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar ordem de serviço.')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!id || isNew) {
      setOrder((prev) => ({ ...prev, status: newStatus }))
      return
    }

    const oldStatus = order.status as OrderStatus
    const note = prompt(`Motivo da mudança para ${newStatus} (opcional):`) || ''

    try {
      const updated = await updateWorkOrder(
        id,
        { status: newStatus },
        user?.name || 'Técnico FL',
        oldStatus,
        newStatus,
        note,
      )
      setOrder((prev) => ({ ...prev, status: newStatus }))
      toast.success(`Status alterado para ${newStatus}`)
      loadOrderData(id)
    } catch (err) {
      toast.error('Erro ao atualizar status.')
    }
  }

  // Adicionar Material na OS
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || isNew) {
      toast.error('Salve a OS primeiro antes de vincular materiais.')
      return
    }
    const mat = materialsCatalog.find((m) => m.id === selectedMaterialId)
    if (!mat) {
      toast.error('Selecione um material válido.')
      return
    }

    // Quantidade e opcional: em branco entra zerada (campo vazio na OS) e o
    // tecnico digita o numero real na tabela.
    const qty = materialQty.trim() === '' ? 0 : parseFloat(materialQty)
    if (isNaN(qty) || qty < 0) {
      toast.error('Quantidade inválida.')
      return
    }

    setAddingMaterial(true)
    try {
      const unitPrice = mat.price || 0
      const totalPrice = Number((qty * unitPrice).toFixed(2))

      // CLASSIFICACAO AUTOMATICA: o tipo do lancamento vem do cadastro do
      // produto (default_kind) e pode ser corrigido ponto a ponto na tabela.
      await addOrderMaterial({
        work_order: id,
        material: mat.id,
        quantity: qty,
        unit: mat.unit,
        kind: mat.default_kind || undefined,
        unit_price: unitPrice,
        total_price: totalPrice,
        notes: materialNotes,
      })

      /**
       * Baixa de estoque ao usar o material.
       *
       * Só age em produto com `control_stock` ligado e quantidade > 0 — a
       * lista padrão entra zerada de propósito e não pode virar baixa.
       * Falhar aqui NÃO desfaz o lançamento: o serviço aconteceu de verdade,
       * e o aviso aparece para o Felipe corrigir o saldo depois.
       */
      if ((mat as any).control_stock && qty > 0) {
        try {
          const r = await baixarPorUsoNaOS({
            materialId: mat.id,
            quantity: qty,
            saldoAtual: Number(mat.current_stock || 0),
            orderNumber: order?.order_number,
            userName: user?.name,
          })
          if (r.ficouNegativo) {
            toast.warning(
              `Estoque de ${mat.name} ficou negativo (${r.saldo}). Confira a contagem.`,
              { duration: 6000 },
            )
          }
        } catch {
          /* o lançamento na OS vale mais que o estoque; segue */
        }
      }

      toast.success('Material adicionado ao atendimento!')
      setSelectedMaterialId('')
      setMaterialQty('')
      setMaterialNotes('')
      const updated = await getOrderMaterials(id)
      setOrderMaterials(updated)
    } catch (err) {
      toast.error('Erro ao adicionar material.')
    } finally {
      setAddingMaterial(false)
    }
  }

  // Aplica uma lista pronta (kit): lança de uma vez os produtos daquele tipo de
  // serviço. Produto que já está na OS é pulado para não duplicar sem querer.
  const handleApplyKit = async () => {
    if (!id || isNew) {
      toast.error('Salve a OS primeiro antes de aplicar uma lista.')
      return
    }
    if (!selectedKitId) {
      toast.error('Escolha uma lista.')
      return
    }

    setApplyingKit(true)
    try {
      const itens = await getMaterialKitItems(selectedKitId)
      if (itens.length === 0) {
        toast.error('Esta lista não tem produtos cadastrados.')
        return
      }

      const jaLancados = new Set(orderMaterials.map((om) => om.material))
      let adicionados = 0
      let pulados = 0

      for (const item of itens) {
        const mat = item.expand?.material || materialsCatalog.find((mm) => mm.id === item.material)
        if (!mat) continue
        if (jaLancados.has(mat.id)) {
          pulados++
          continue
        }
        // Sem quantidade definida na lista, entra ZERADO: o campo fica vazio na OS
        // e o tecnico digita o numero real. Assim ninguem confunde "nao preenchido"
        // com "usou 1 unidade".
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 0
        const unitPrice = mat.price || 0
        await addOrderMaterial({
          work_order: id,
          material: mat.id,
          quantity: qty,
          unit: mat.unit,
          kind: mat.default_kind || undefined,
          unit_price: unitPrice,
          total_price: Number((qty * unitPrice).toFixed(2)),
          notes: item.notes || '',
        })
        adicionados++
      }

      const updated = await getOrderMaterials(id)
      setOrderMaterials(updated)
      setSelectedKitId('')

      if (adicionados > 0) {
        toast.success(
          `Lista aplicada: ${adicionados} ${adicionados === 1 ? 'produto' : 'produtos'}` +
            (pulados > 0 ? ` (${pulados} já estavam na OS)` : ''),
        )
      } else {
        toast.info('Todos os produtos desta lista já estavam na OS.')
      }
    } catch (err) {
      toast.error('Erro ao aplicar a lista de materiais.')
    } finally {
      setApplyingKit(false)
    }
  }

  // Quantidade do material ja lancado na OS: o tecnico digita quanto usou.
  const handleAlterarQtdMaterial = async (mat: OrderMaterial, valor: string) => {
    const qtd = valor.trim() === '' ? 0 : parseFloat(valor)
    if (isNaN(qtd) || qtd < 0) {
      toast.error('Quantidade inválida.')
      return
    }
    const anterior = mat.quantity
    if (qtd === anterior) return

    setOrderMaterials((prev) => prev.map((m) => (m.id === mat.id ? { ...m, quantity: qtd } : m)))
    try {
      const preco = mat.unit_price || 0
      await updateOrderMaterial(mat.id, {
        quantity: qtd,
        total_price: Number((qtd * preco).toFixed(2)),
      })
      if (id) {
        const updated = await getOrderMaterials(id)
        setOrderMaterials(updated)
      }
    } catch (err) {
      setOrderMaterials((prev) =>
        prev.map((m) => (m.id === mat.id ? { ...m, quantity: anterior } : m)),
      )
      toast.error('Erro ao salvar a quantidade.')
    }
  }

  const handleDeleteMaterial = async (matId: string) => {
    if (!confirm('Deseja remover este material da OS?')) return
    try {
      // antes de apagar, guarda os dados para devolver ao estoque
      const itemRemovido = orderMaterials.find((m) => m.id === matId)
      const produtoRemovido =
        itemRemovido?.expand?.material ||
        materialsCatalog.find((mm) => mm.id === itemRemovido?.material)

      await deleteOrderMaterial(matId)

      // devolve ao estoque se o produto é controlado
      if (
        produtoRemovido &&
        (produtoRemovido as any).control_stock &&
        Number(itemRemovido?.quantity || 0) > 0
      ) {
        try {
          await devolverPorRemocaoDaOS({
            materialId: produtoRemovido.id,
            quantity: Number(itemRemovido!.quantity),
            saldoAtual: Number((produtoRemovido as any).current_stock || 0),
            orderNumber: order?.order_number,
            userName: user?.name,
          })
        } catch {
          /* a remoção já aconteceu; o saldo é corrigível */
        }
      }

      toast.success('Material removido.')
      if (id) {
        const updated = await getOrderMaterials(id)
        setOrderMaterials(updated)
      }
    } catch (err: any) {
      // mostra o motivo real: antes só dizia "Erro", sem pista do que corrigir
      const msg =
        err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        'erro desconhecido'
      console.error('Erro ao remover material', err)
      toast.error(`Não foi possível remover o material: ${msg}`, { duration: 9000 })
    }
  }

  // Seleção de fotos (câmera tira uma por vez; galeria aceita várias de uma vez)
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const novos = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      nome: file.name,
      tipo: file.type || '',
      podeVer: podeVisualizarNoNavegador(file),
    }))
    setPendingPhotos((prev) => [...prev, ...novos])
    e.target.value = ''
  }

  /**
   * O navegador NÃO consegue mostrar HEIC/HEIF (formato nativo do iPhone).
   * Nessas fotos a pré-visualização saía quebrada; aqui marcamos para exibir um
   * cartão com o nome do arquivo no lugar da imagem.
   */
  const podeVisualizarNoNavegador = (file: File): boolean => {
    const t = (file.type || '').toLowerCase()
    if (/heic|heif/.test(t)) return false
    if (/^image\/(jpeg|jpg|png|webp|gif|bmp)$/.test(t)) return true
    // tipo vazio ou desconhecido: deixa o <img> tentar
    return true
  }

  const removePendingPhoto = (index: number) => {
    setPendingPhotos((prev) => {
      const item = prev[index]
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const clearPhotoSelection = () => {
    pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview))
    setPendingPhotos([])
    setPhotoDescription('')
  }

  // Upload das fotos selecionadas para a OS
  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || isNew) {
      toast.error('Salve a OS antes de enviar fotos.')
      return
    }
    if (pendingPhotos.length === 0) {
      toast.error('Selecione pelo menos uma foto.')
      return
    }

    setUploadingPhoto(true)
    setUltimoErroFoto('')
    let enviadas = 0
    let falhas = 0
    // guarda o motivo da última falha para exibir ao final
    let ultimoMotivo = ''

    try {
      // Pega a posição UMA vez e grava nas fotos deste envio. O navegador do
      // celular entrega a foto SEM GPS, então escrevemos nas coordenadas EXIF.
      setUploadProgress('Obtendo a localização...')
      const pos = await pegarPosicao()

      // Avisa quando a localização não veio: antes a foto subia sem GPS e o
      // técnico não ficava sabendo (o que dava a impressão de "não funcionou").
      if (!pos.ok) {
        // O TS não estreita a união ResultadoPosicao aqui dentro; o cast é
        // seguro: este ramo só roda quando ok === false (é a variante motivo).
        const falha = pos as { ok: false; motivo: 'sem_suporte' | 'negada' | 'tempo' | 'erro' }
        const motivo =
          falha.motivo === 'negada'
            ? 'A localização foi BLOQUEADA. Libere o acesso à localização para este site.'
            : falha.motivo === 'tempo'
              ? 'Não foi possível obter o GPS a tempo. Vá para um lugar aberto e tente de novo.'
              : falha.motivo === 'sem_suporte'
                ? 'Este aparelho/bavegador não fornece localização.'
                : 'Não foi possível obter a localização.'
        toast.warning(`${motivo} As fotos serão salvas SEM a localização.`, { duration: 9000 })
      }

      for (let i = 0; i < pendingPhotos.length; i++) {
        setUploadProgress(`Preparando ${i + 1} de ${pendingPhotos.length}...`)
        try {
          // 1) CONVERTE HEIC -> JPEG e reduz. O navegador não lê HEIC (foto de
          //    iPhone vinda do computador) e o servidor recusa acima de ~10 MB
          //    com 413. Depois disso a foto fica em ~400 KB.
          let preparada
          try {
            // mostra na tela cada etapa (verificando, convertendo, reduzindo)
            preparada = await prepararFoto(pendingPhotos[i].file, (etapa) =>
              setUploadProgress(`Foto ${i + 1}: ${etapa}`),
            )
          } catch (errPrep: any) {
            falhas++
            ultimoMotivo = errPrep?.message || 'não foi possível preparar a imagem'
            setUploadProgress(`Falha na foto ${i + 1}: ${ultimoMotivo}`)
            continue
          }
          setUploadProgress(`Enviando ${i + 1} de ${pendingPhotos.length}...`)

          // 2) grava o GPS no arquivo já reduzido (o EXIF é perdido no canvas,
          //    então tem de ser depois de prepararFoto)
          const arquivoFoto = pos.ok
            ? await gravarGpsNaFoto(preparada.arquivo, pos.lat, pos.lng)
            : preparada.arquivo

          const formData = new FormData()
          formData.append('work_order', id)
          formData.append('image', arquivoFoto)
          formData.append('description', photoDescription)
          formData.append('captured_at', new Date().toISOString())
          formData.append('display_order', String(orderPhotos.length + enviadas + 1))

          await addOrderPhoto(formData)
          enviadas++
        } catch (err: any) {
          falhas++
          // mostra o motivo real em vez de só "falhou": antes o erro do
          // servidor era engolido e o técnico não sabia o que corrigir
          // Diagnóstico: mostra tamanho e tipo do arquivo que o navegador
          // entregou. Se vier 0 MB, a foto está só na nuvem (iCloud) e o Mac
          // não baixou o arquivo real — é o caso mais comum.
          const arq = pendingPhotos[i]?.file
          const info = arq
            ? ` [arquivo: ${(arq.size / 1048576).toFixed(2)} MB, ${arq.type || 'tipo vazio'}, ${arq.name}]`
            : ''
          const status = err?.status || err?.response?.status || err?.code
          const msg =
            status === 413
              ? 'a foto é grande demais para o servidor. Reduza ou tire a foto pelo app.'
              : err?.response?.data?.message ||
                err?.response?.message ||
                err?.message ||
                'falha desconhecida'
          console.error('Erro ao enviar foto', err)
          ultimoMotivo = msg + info
          setUploadProgress(`Falha na foto ${i + 1}: ${msg}${info}`)
        }
      }

      if (enviadas > 0 && falhas === 0) {
        toast.success(
          enviadas === 1 ? 'Foto registrada no laudo técnico!' : `${enviadas} fotos registradas!`,
        )
      } else if (enviadas > 0) {
        toast.warning(`${enviadas} foto(s) enviada(s), ${falhas} falharam.`, { duration: 8000 })
      } else {
        // guarda o último motivo para mostrar em vermelho, fixo na tela
        setUltimoErroFoto(ultimoMotivo || 'motivo não identificado')
        toast.error(`Nenhuma foto foi enviada: ${ultimoMotivo || 'motivo não identificado'}`, {
          duration: 12000,
        })
      }

      clearPhotoSelection()
      const updated = await getOrderPhotos(id)
      setOrderPhotos(updated)
      if (enviadas > 0) avisarSincronizacao(id, order.order_number, 'fotos')
    } catch (err: any) {
      // erro fora do laço (GPS, recarregar lista): mostra o motivo real
      const msg =
        err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        'erro desconhecido'
      console.error('Erro no envio de fotos', err)
      toast.error(`Erro ao enviar fotos: ${msg}`, { duration: 10000 })
    } finally {
      setUploadingPhoto(false)
      // NÃO limpa a mensagem quando houve falha: antes o "finally" apagava o
      // motivo e o Felipe só via "Nenhuma foto foi enviada", sem saber por quê.
      setUploadProgress((atual) => (atual.startsWith('Falha') ? atual : ''))
    }
  }

  // Nome do arquivo da foto para download/compartilhamento
  const photoFileName = (photo: OrderPhoto, idx: number) => {
    const ext = photo.image?.includes('.') ? photo.image.split('.').pop() : 'jpg'
    return `OS-${order.order_number || ''}-foto-${idx + 1}.${ext}`
  }

  /**
   * Salvar a foto no celular.
   *
   * O Chrome do iPhone IGNORA o download de arquivo gerado pelo app — o
   * clique não salva nada e a imagem só abre numa aba. Por isso aqui usamos o
   * menu de compartilhamento do sistema, que tem "Salvar Imagem" (vai para a
   * galeria), "Salvar em Arquivos" e o envio por WhatsApp.
   * No computador, onde o download funciona normal, baixamos o arquivo.
   */
  const handleDownloadPhoto = async (photo: OrderPhoto, idx: number) => {
    const url = getFileUrl('order_photos', photo.id, photo.image)
    if (!url) {
      toast.error('Arquivo da foto não encontrado.')
      return
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch falhou')
      const blob = await res.blob()
      const file = new File(
        [blob],
        `${photoFileName(photo, idx)}.${blob.type.includes('png') ? 'png' : 'jpg'}`,
        {
          type: blob.type || 'image/jpeg',
        },
      )
      const nav = navigator as any

      // Celular: menu do sistema com "Salvar Imagem"
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: file.name })
          return
        } catch (err: any) {
          if (err?.name === 'AbortError') return // usuário fechou o menu
          // se o aparelho recusar o compartilhamento, cai para o download
        }
      }

      // Computador: baixa o arquivo direto
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
      toast.success('Foto salva nos downloads.')
    } catch (err) {
      window.open(url, '_blank')
      toast.info('Foto aberta em outra aba — toque e segure para salvar.')
    }
  }

  // Compartilhar a foto (abre o menu do celular: WhatsApp, Salvar em Fotos etc.)
  const handleSharePhoto = async (photo: OrderPhoto, idx: number) => {
    const url = getFileUrl('order_photos', photo.id, photo.image)
    if (!url) {
      toast.error('Arquivo da foto não encontrado.')
      return
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('fetch falhou')
      const blob = await res.blob()
      const file = new File([blob], photoFileName(photo, idx), {
        type: blob.type || 'image/jpeg',
      })
      const nav = navigator as any
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `OS #${order.order_number || ''}`,
          text: photo.description || `Foto da OS #${order.order_number || ''}`,
        })
      } else {
        await handleDownloadPhoto(photo, idx)
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Não foi possível compartilhar. Tente baixar a foto.')
      }
    }
  }

  // Baixa a OS inteira como um .zip já organizado por mes e por OS:
  //   2026-11/PETROMACAE - OS 1002 - 2026-11-12/OS-1002-fotos/...
  // Essa e a pasta que o Felipe sobe para o OneDrive.
  /**
   * Baixa a OS em pacote .zip.
   *
   * Antes de montar, pergunta se o pacote deve ir COM valores ou SÓ com a
   * descrição dos produtos e as fotos. Serve para dois momentos:
   *  - orçamento para o cliente fechar: vai COM preço (permite cobrar direto);
   *  - comprovação do serviço: vai SEM preço, mostrando só o que foi feito.
   */
  const handleBaixarOSZip = async () => {
    if (!id || isNew) return

    const comPreco = window.confirm(
      'Enviar este pacote COM os valores?\n\n' +
        'OK = com preço (o cliente vê o valor de cada item e o total)\n' +
        'Cancelar = sem preço (só a descrição dos produtos e as fotos)',
    )

    setBaixandoZip(true)
    try {
      const entradas: ZipEntry[] = []

      // Pasta: AAAA-MM / CLIENTE - OS nnnn - AAAA-MM-DD
      const dataBase = new Date(
        order.completed_at || order.scheduled_date || order.created || Date.now(),
      )
      const ano = dataBase.getFullYear()
      const mes = String(dataBase.getMonth() + 1).padStart(2, '0')
      const dia = String(dataBase.getDate()).padStart(2, '0')
      const pastaMes = `${ano}-${mes}`
      const nomeCliente = safeName(order.expand?.client?.name || 'CLIENTE', 'CLIENTE')
      const pastaOS = safeName(
        `${nomeCliente} - OS ${order.order_number || ''} - ${ano}-${mes}-${dia}`,
        `OS ${order.order_number || ''}`,
      )

      // 1) Fotos
      for (let i = 0; i < orderPhotos.length; i++) {
        const foto = orderPhotos[i]
        const url = getFileUrl('order_photos', foto.id, foto.image)
        if (!url) continue
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const blob = await res.blob()
          const ext = foto.image?.includes('.') ? foto.image.split('.').pop() : 'jpg'
          entradas.push({
            name: `${pastaMes}/${pastaOS}/fotos/foto-${String(i + 1).padStart(2, '0')}${
              foto.description ? ' - ' + safeName(foto.description) : ''
            }.${ext}`,
            data: blob,
          })
        } catch {
          /* foto com problema: segue com as outras */
        }
      }

      // 2) Ficha da OS em HTML (abre no celular e imprime como PDF)
      // Com preço: mostra valor unitário, total e o resumo. Sem preço: só o
      // material e a quantidade — para comprovar o serviço, não para cobrar.
      const fmt = (v: number) =>
        'R$ ' +
        v
          .toFixed(2)
          .replace('.', ',')
          .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

      const linhasMateriais = orderMaterials
        .map((m) => {
          const cols = `<td>${m.expand?.material?.name || 'Material'}</td>
            <td style="text-align:center">${m.quantity ? m.quantity : '—'}</td>
            <td style="text-align:center">${m.unit || ''}</td>`
          if (!comPreco) return `<tr>${cols}</tr>`
          return `<tr>${cols}
            <td style="text-align:right">${m.unit_price ? fmt(m.unit_price) : '-'}</td>
            <td style="text-align:right;font-weight:bold">${
              m.total_price ? fmt(m.total_price) : '-'
            }</td></tr>`
        })
        .join('')

      const totalMateriais = orderMaterials.reduce((s, m) => s + (m.total_price || 0), 0)
      const valorServico = order.service_value || 0
      const totalGeral = totalMateriais + valorServico

      const cabecalhoTabela = comPreco
        ? `<tr><th>Material</th><th style="width:50px">Qtd</th><th style="width:50px">Unid</th>
           <th style="width:90px;text-align:right">V. Unit.</th>
           <th style="width:95px;text-align:right">Total</th></tr>`
        : `<tr><th>Material</th><th style="width:60px">Qtd</th><th style="width:60px">Unid</th></tr>`

      const rodapeValores = comPreco
        ? `<tr style="background:#f4f4f4;font-weight:bold">
             <td colspan="4" style="text-align:right">Total do material</td>
             <td style="text-align:right">${fmt(totalMateriais)}</td></tr>
           ${
             valorServico > 0
               ? `<tr style="background:#f4f4f4;font-weight:bold">
                    <td colspan="4" style="text-align:right">Mão de obra / serviço</td>
                    <td style="text-align:right">${fmt(valorServico)}</td></tr>`
               : ''
           }
           <tr style="background:#0F6A3A;color:#fff;font-weight:bold">
             <td colspan="4" style="text-align:right">TOTAL GERAL</td>
             <td style="text-align:right">${fmt(totalGeral)}</td></tr>`
        : ''

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OS ${order.order_number} - ${nomeCliente}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;margin:24px;line-height:1.5}
  h1{color:#0F6A3A;font-size:20px;margin:0}
  h2{color:#0F6A3A;font-size:13px;text-transform:uppercase;border-bottom:1px solid #0F6A3A;
     padding-bottom:3px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}
  th{background:#f4f4f4}
  .rot{font-weight:bold}
  /* a tabela do cabeçalho (logo FL) não leva as bordas das tabelas de dados */
  .cabecalho, .cabecalho td {border:none !important}
  .cabecalho h1{color:#0F6A3A;font-size:20px;margin:0}
  @media print{body{margin:0}}
</style></head><body>
<!-- Cabeçalho com a logo FL. Usa TABELA (nao flexbox) porque o arquivo abre
     no navegador do celular e em clientes de e-mail, que ignoram flex. -->
<table class="cabecalho" style="width:100%;border-collapse:collapse;border:none;
              border-bottom:3px solid #0F6A3A;margin-bottom:14px">
  <tr>
    <td style="width:52px;border:none;padding:0 10px 10px 0;vertical-align:middle">
      <div style="width:44px;height:44px;background:#0F6A3A;color:#fff;border-radius:8px;
                  text-align:center;line-height:44px;font-family:Arial,Helvetica,sans-serif;
                  font-weight:bold;font-size:19px;letter-spacing:0.5px">FL</div>
    </td>
    <td style="border:none;padding:0 0 10px 0;vertical-align:middle">
      <h1 style="margin:0">F. L. SERVIÇOS</h1>
      <div style="color:#666;font-size:11px">CFTV • Alarme • Rede • Automação • Manutenção</div>
    </td>
  </tr>
</table>
<h2>Ordem de Serviço ${order.order_number}</h2>
<table>
  <tr><td class="rot" style="width:30%">Cliente</td><td>${nomeCliente}</td></tr>
  <tr><td class="rot">CNPJ/CPF</td><td>${order.expand?.client?.document || '-'}</td></tr>
  <tr><td class="rot">Endereço</td><td>${
    order.expand?.client?.address || '-'
  } ${order.expand?.client?.neighborhood || ''} - ${order.expand?.client?.city || 'MACAÉ'}</td></tr>
  <tr><td class="rot">Tipo de serviço</td><td>${order.service_type || '-'}</td></tr>
  <tr><td class="rot">Técnico</td><td>${order.expand?.technician?.name || '-'}</td></tr>
  <tr><td class="rot">Status</td><td>${order.status || '-'}</td></tr>
  <tr><td class="rot">Data agendada</td><td>${order.scheduled_date || '-'}</td></tr>
  <tr><td class="rot">Concluída em</td><td>${order.completed_at || '-'}</td></tr>
</table>
<h2>Descrição do serviço</h2>
<p>${order.description || '-'}</p>
<h2>Laudo técnico</h2>
<p>${order.technical_report || '-'}</p>
<h2>Materiais aplicados</h2>
${
  orderMaterials.length > 0
    ? `<table>${cabecalhoTabela}${linhasMateriais}${rodapeValores}</table>`
    : '<p>Nenhum material registrado.</p>'
}
${
  comPreco && valorServico > 0
    ? `<table>${
        orderMaterials.length === 0
          ? `<tr style="background:#f4f4f4;font-weight:bold">
               <td style="text-align:right">Mão de obra / serviço</td>
               <td style="text-align:right;width:95px">${fmt(valorServico)}</td></tr>`
          : ''
      }
        <tr style="background:#0F6A3A;color:#fff;font-weight:bold">
          <td style="text-align:right">TOTAL GERAL</td>
          <td style="text-align:right;width:95px">${fmt(totalGeral)}</td></tr></table>`
    : ''
}
<h2>Fotos</h2>
<p>${orderPhotos.length} foto(s) na pasta <strong>fotos</strong> deste arquivo.</p>
<div style="margin-top:18px;padding-top:8px;border-top:1px solid #ddd;color:#888;font-size:9px">
  FL THOMAZ SERVIÇOS E DISTRIBUIÇÃO • CNPJ 44.288.125/0001-34 • IE 12.290.12-8<br>
  VILA UNIÃO, 92 — LAGOMAR — MACAÉ/RJ — CEP 27.966-507
</div>
</body></html>`

      const sufixo = comPreco ? 'orcamento' : 'comprovante'
      entradas.push({
        name: `${pastaMes}/${pastaOS}/OS-${order.order_number}-${sufixo}.html`,
        data: new Blob([html], { type: 'text/html;charset=utf-8' }),
      })

      const zip = await createZip(entradas)
      const totalMB = (zip.size / 1048576).toFixed(1)
      baixarBlob(zip, safeName(`${pastaOS} (${sufixo})`, 'OS') + '.zip')
      toast.success(
        comPreco
          ? `Orçamento pronto (${totalMB} MB) — com valores.`
          : `Comprovante pronto (${totalMB} MB) — sem valores.`,
      )
    } catch (err) {
      toast.error('Erro ao montar o pacote da OS.')
    } finally {
      setBaixandoZip(false)
    }
  }

  // Enviar todas as fotos de uma vez pelo menu do celular (WhatsApp etc.).
  // Cada aparelho limita quantos arquivos aceita por vez; se o sistema recusar
  // o lote, manda em partes em vez de falhar tudo.
  const handleShareAllPhotos = async () => {
    if (orderPhotos.length === 0) return
    const nav = navigator as any
    if (!nav.share) {
      toast.info('Este navegador não compartilha direto. Use "Baixar todas".')
      return
    }

    toast.info(`Preparando ${orderPhotos.length} foto(s)...`)

    const arquivos: File[] = []
    for (let i = 0; i < orderPhotos.length; i++) {
      const url = getFileUrl('order_photos', orderPhotos[i].id, orderPhotos[i].image)
      if (!url) continue
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        arquivos.push(
          new File([blob], photoFileName(orderPhotos[i], i), {
            type: blob.type || 'image/jpeg',
          }),
        )
      } catch {
        /* foto com problema: segue com as outras */
      }
    }

    if (arquivos.length === 0) {
      toast.error('Não foi possível preparar as fotos.')
      return
    }

    const titulo = `OS #${order.order_number || ''} — Evidências`
    const compartilhar = async (lote: File[]) => {
      await nav.share({ files: lote, title: titulo })
    }

    // Tenta o lote inteiro; se o aparelho recusar, divide pela metade.
    const tentar = async (lote: File[]): Promise<boolean> => {
      try {
        if (nav.canShare && !nav.canShare({ files: lote })) return false
        await compartilhar(lote)
        return true
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err // usuário cancelou: para tudo
        return false
      }
    }

    try {
      if (await tentar(arquivos)) return
      if (arquivos.length === 1) {
        await handleDownloadPhoto(orderPhotos[0], 0)
        return
      }

      // Divide em partes menores (5 por vez costuma funcionar em qualquer aparelho)
      const partes: File[][] = []
      for (let i = 0; i < arquivos.length; i += 5) partes.push(arquivos.slice(i, i + 5))
      toast.info(`Enviando em ${partes.length} partes de até 5 fotos...`)
      for (const parte of partes) {
        const ok = await tentar(parte)
        if (!ok) {
          toast.info('Algumas fotos não puderam ser enviadas juntas. Use "Baixar todas".')
          return
        }
      }
      toast.success(`${arquivos.length} foto(s) enviadas.`)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      toast.error('Não foi possível enviar as fotos. Tente "Baixar todas".')
    }
  }

  /**
   * Salvar TODAS as fotos de uma vez.
   *
   * No celular, abrir o menu uma vez por foto seria insuportável (3 fotos = 3
   * menus). Aqui montamos todos os arquivos e abrimos o menu UMA vez: o
   * iPhone mostra "Salvar N Imagens" e joga todas na galeria de uma vez.
   * Se o aparelho recusar o lote, divide em partes de 5.
   */
  const handleDownloadAllPhotos = async () => {
    if (orderPhotos.length === 0) return
    setBaixandoTodas(true)
    toast.info(`Preparando ${orderPhotos.length} foto(s)...`)

    try {
      const arquivos: File[] = []
      for (let i = 0; i < orderPhotos.length; i++) {
        const p = orderPhotos[i]
        const url = getFileUrl('order_photos', p.id, p.image)
        if (!url) continue
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const blob = await res.blob()
          const ext = blob.type.includes('png') ? 'png' : 'jpg'
          arquivos.push(
            new File([blob], `${photoFileName(p, i)}.${ext}`, { type: blob.type || 'image/jpeg' }),
          )
        } catch (_) {
          /* foto com problema: segue com as outras */
        }
      }

      if (arquivos.length === 0) {
        toast.error('Não foi possível preparar as fotos.')
        return
      }

      const nav = navigator as any

      // Celular: um único menu com todas as fotos
      if (nav.canShare && nav.canShare({ files: arquivos })) {
        try {
          await nav.share({
            files: arquivos,
            title: `Fotos da OS ${order.order_number || ''}`,
          })
          return
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          // lote recusado: divide em partes
        }
      }

      // Divide em partes de 5 (limite prático de alguns aparelhos)
      if (arquivos.length > 1) {
        const partes: File[][] = []
        for (let i = 0; i < arquivos.length; i += 5) partes.push(arquivos.slice(i, i + 5))
        for (let k = 0; k < partes.length; k++) {
          try {
            await nav.share({
              files: partes[k],
              title: `Fotos da OS ${order.order_number || ''} (${k + 1}/${partes.length})`,
            })
          } catch (err: any) {
            if (err?.name === 'AbortError') return
          }
        }
        return
      }

      // Último recurso (computador ou sem compartilhamento): baixa uma a uma
      for (let i = 0; i < arquivos.length; i++) {
        const u = URL.createObjectURL(arquivos[i])
        const a = document.createElement('a')
        a.href = u
        a.download = arquivos[i].name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(u), 5000)
      }
      toast.success(`${arquivos.length} foto(s) salvas.`)
    } finally {
      setBaixandoTodas(false)
    }
  }

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Deseja excluir esta foto?')) return
    try {
      await deleteOrderPhoto(photoId)
      toast.success('Foto removida.')
      if (id) {
        const updated = await getOrderPhotos(id)
        setOrderPhotos(updated)
        avisarSincronizacao(id, order.order_number, 'foto removida')
      }
    } catch (err) {
      toast.error('Erro ao remover foto.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F6A3A]" />
        <span className="text-xs text-muted-foreground">
          Carregando dados da Ordem de Serviço...
        </span>
      </div>
    )
  }

  // Visualização de Impressão / PDF Template V3
  if (showPdfView && !isNew) {
    return (
      <ReportTemplateV3
        order={order as WorkOrder}
        materials={orderMaterials}
        photos={orderPhotos}
        onClose={() => setShowPdfView(false)}
      />
    )
  }

  const isFinalizada = order.status === 'FINALIZADA'
  const canEdit = !isConsultant // Administrador e Técnico podem editar, inclusive OS finalizada (registrado no histórico)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/ordens')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-black text-[#0F6A3A]">
                {isNew ? 'Nova Ordem de Serviço' : `OS #${order.order_number}`}
              </span>
              {!isNew && (
                <Badge
                  className={`text-xs font-bold uppercase ${
                    order.status === 'FINALIZADA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : order.status === 'EM ANDAMENTO'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {order.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isNew
                ? 'Preencha os dados abaixo para registrar o chamado'
                : 'Atendimento técnico FL SERVIÇOS • Macaé/RJ'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPdfView(true)}
              className="flex-1 sm:flex-none gap-1.5 text-xs border-[#0F6A3A]/40 text-[#0F6A3A] hover:bg-[#0F6A3A]/10 font-medium"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Gerar Relatório PDF (V3)</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          )}

          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBaixarOSZip}
              disabled={baixandoZip}
              className="flex-1 sm:flex-none gap-1.5 text-xs border-[#0F6A3A]/40 text-[#0F6A3A] hover:bg-[#0F6A3A]/10 font-medium"
              title="Baixa a OS inteira em pasta organizada, para subir no OneDrive"
            >
              {baixandoZip ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              ) : (
                <Download className="w-4 h-4 shrink-0" />
              )}
              <span className="hidden sm:inline">Baixar OS completa (zip)</span>
              <span className="sm:hidden">Zip</span>
            </Button>
          )}

          {canEdit && (
            <Button
              size="sm"
              onClick={handleSaveOrder}
              disabled={saving}
              className="flex-1 sm:flex-none bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs gap-1.5 shadow"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isNew ? 'Criar Ordem' : 'Salvar Alterações'}
            </Button>
          )}
        </div>
      </div>

      {/* Aviso se OS estiver FINALIZADA (técnico tem permissão expressa na especificação para editar com registro no histórico) */}
      {isFinalizada && canEdit && !isNew && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-900 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            Esta OS está <strong>FINALIZADA</strong>. Você tem permissão para editar os dados do
            atendimento; qualquer alteração será gravada no histórico de auditoria.
          </span>
        </div>
      )}

      {/* Seletor Rápido de Status */}
      {!isNew && canEdit && (
        <Card className="bg-card border-border/80">
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#0F6A3A]" /> Alterar Status do Atendimento:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {
                /*
                 * ESTA LISTA JÁ QUEBROU O HISTÓRICO (21/11/2026).
                 *
                 * Ela continuava oferecendo AGUARDANDO MATERIAL depois que a
                 * migration 0060 removeu esse status do banco. Clicar nele
                 * mandava um valor inválido, o PocketBase recusava a gravação e
                 * o histórico não era criado — a OS parecia "não registrar
                 * nada". Toda mudança de status falhava em silêncio, porque o
                 * erro só aparecia no console.
                 *
                 * A lista abaixo tem de espelhar EXATAMENTE os valores do
                 * select `status` da coleção work_orders.
                 */
                (
                  [
                    'ABERTA',
                    'AGENDADA',
                    'EM ANDAMENTO',
                    'FINALIZADA',
                    'LANCADA',
                    'CANCELADA',
                  ] as OrderStatus[]
                ).map((st) => (
                  <Button
                    key={st}
                    type="button"
                    variant={order.status === st ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleStatusChange(st)}
                    className={`h-7 text-[11px] ${
                      order.status === st ? 'bg-[#0F6A3A] text-white' : ''
                    }`}
                  >
                    {st}
                  </Button>
                ))
              }
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abas Principais: Dados da OS, Materiais, Fotos, Assinatura e Histórico */}
      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList className="bg-muted/60 p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="dados" className="text-xs">
            Dados Gerais
          </TabsTrigger>
          <TabsTrigger value="materiais" className="text-xs" disabled={isNew}>
            Materiais ({orderMaterials.length})
          </TabsTrigger>
          <TabsTrigger value="fotos" className="text-xs" disabled={isNew}>
            Fotos / Evidências ({orderPhotos.length})
          </TabsTrigger>
          <TabsTrigger value="assinatura" className="text-xs" disabled={isNew}>
            Assinatura & GPS
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs" disabled={isNew}>
            Histórico ({orderHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: DADOS GERAIS */}
        <TabsContent value="dados" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Informações da Ordem de Serviço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Cliente */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">Cliente *</Label>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNovoClienteAberto(true)}
                        className="h-6 px-1.5 text-[11px] font-semibold text-[#0F6A3A] hover:bg-[#0F6A3A]/10 gap-0.5"
                        title="Cadastrar um cliente novo agora"
                      >
                        <Plus className="w-3 h-3" /> Novo
                      </Button>
                    )}
                  </div>
                  {/*
                    NOME OFICIAL na busca da OS (esclarecido em 20/11/2026).
                    O Felipe explicou que o nome principal é o oficial completo
                    — "CONSELHO ESCOLAR DA ESCOLA MUNICIPAL PROFESSORA MARIA
                    LETICIA..." — e o curto é só fantasia de digitação. Então a
                    lista mostra o oficial e o apelido fica como palavra-chave:
                    digitar "leticia" ainda acha.
                  */}
                  <SearchCombobox
                    options={clients.map((c) => ({
                      value: c.id,
                      label: c.name,
                      hint: c.nickname || c.city || 'Macaé',
                      keywords: `${c.document || ''} ${c.nickname || ''}`,
                    }))}
                    value={order.client || ''}
                    onChange={(val) => setOrder((prev) => ({ ...prev, client: val }))}
                    placeholder="Selecione o cliente"
                    searchPlaceholder="Digite o nome do cliente..."
                    emptyText="Nenhum cliente com esse nome."
                    disabled={!canEdit}
                  />

                  {/*
                    ENDEREÇO + LOCALIZADOR do cliente escolhido.

                    O técnico não deve precisar sair da OS e ir em Clientes para
                    saber o endereço. Aqui aparece o endereço completo e o botão
                    que abre a rota no Google Maps.
                  */}
                  {(() => {
                    const cli = clients.find((c) => c.id === order.client)
                    if (!cli || !temEndereco(cli)) return null
                    return (
                      <div className="rounded-lg border border-[#0B3D91]/30 bg-[#0B3D91]/5 p-2">
                        <p className="flex items-start gap-1 text-[10px] leading-snug text-slate-700">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#0B3D91]" />
                          <span>{enderecoCompleto(cli)}</span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <a
                            href={linkMapa(cli)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-[#0B3D91] px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            <Navigation className="h-3 w-3" /> Rota até o local
                          </a>
                          <a
                            href={linkMapa(cli, false)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-[#0B3D91]/40 bg-white px-2 py-1 text-[10px] font-semibold text-[#0B3D91]"
                          >
                            Ver no mapa
                          </a>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Técnico */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Técnico Responsável</Label>
                  <Select
                    value={order.technician || ''}
                    onValueChange={(val) => setOrder((prev) => ({ ...prev, technician: val }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione o técnico" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name} {t.role_title ? `(${t.role_title})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tipo de Serviço */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo de Serviço *</Label>
                  <Select
                    value={order.service_type || 'Instalação'}
                    onValueChange={(val) =>
                      setOrder((prev) => ({ ...prev, service_type: val as ServiceType }))
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Tipo de serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Instalação',
                        'Manutenção Preventiva',
                        'Manutenção Corretiva',
                        'Vistoria Técnica',
                        'CFTV / Alarme',
                        'Rede / Telecom',
                        'Outro',
                      ].map((st) => (
                        <SelectItem key={st} value={st} className="text-xs">
                          {st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Data Prevista / Agendada */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Data Agendada</Label>
                  <Input
                    type="date"
                    value={dataParaInput(order.scheduled_date)}
                    onChange={(e) =>
                      setOrder((prev) => ({ ...prev, scheduled_date: e.target.value }))
                    }
                    disabled={!canEdit}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Status Inicial</Label>
                  <Select
                    value={order.status || 'ABERTA'}
                    onValueChange={(val) =>
                      setOrder((prev) => ({ ...prev, status: val as OrderStatus }))
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* espelha o select do banco: sem AGUARDANDO MATERIAL */}
                      {[
                        'ABERTA',
                        'AGENDADA',
                        'EM ANDAMENTO',
                        'FINALIZADA',
                        'LANCADA',
                        'CANCELADA',
                      ].map((st) => (
                        <SelectItem key={st} value={st} className="text-xs">
                          {st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Descrição do Chamado */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Descrição do Serviço / Solicitação *
                </Label>
                <Textarea
                  rows={3}
                  placeholder="Detalhe o que o cliente solicitou ou o problema relatado..."
                  value={order.description || ''}
                  onChange={(e) => setOrder((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={!canEdit}
                  className="text-xs"
                />
              </div>

              {/* Parecer / Laudo Técnico */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Laudo Técnico / Ações Realizadas</Label>
                <Textarea
                  rows={3}
                  placeholder="Relato do técnico sobre a execução, testes efetuados e condição final..."
                  value={order.technical_report || ''}
                  onChange={(e) =>
                    setOrder((prev) => ({ ...prev, technical_report: e.target.value }))
                  }
                  disabled={!canEdit}
                  className="text-xs"
                />
              </div>

              {/* Observações Gerais */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Observações Internas</Label>
                <Input
                  placeholder="Anotações para a equipe FL SERVIÇOS..."
                  value={order.notes || ''}
                  onChange={(e) => setOrder((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={!canEdit}
                  className="h-9 text-xs"
                />
              </div>

              {/* Checklist de itens pendentes */}
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6A3A]" />
                  Itens pendentes / checklist
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Ex.: trocar cabo, instalar câmera..."
                    value={novoItemChecklist}
                    onChange={(e) => setNovoItemChecklist(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        adicionarItemChecklist()
                      }
                    }}
                    disabled={!canEdit}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={adicionarItemChecklist}
                    disabled={!canEdit || !novoItemChecklist.trim()}
                    className="h-8 px-2.5 bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
                {itensChecklist.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {itensChecklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded border border-slate-200 bg-background px-2 py-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => alternarItemChecklist(item.id)}
                          disabled={!canEdit}
                          className="h-4 w-4 accent-[#0F6A3A] shrink-0 cursor-pointer"
                          aria-label={`Marcar "${item.text}" como concluído`}
                        />
                        <span
                          className={`flex-1 text-xs leading-snug ${
                            item.done ? 'line-through text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {item.text}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removerItemChecklist(item.id)}
                            className="text-slate-400 hover:text-rose-600 shrink-0"
                            aria-label={`Remover "${item.text}"`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Marque o item quando concluir: ele fica riscado e é salvo junto com a OS.
                </p>
              </div>

              {/* Valor de mao de obra: entra na nota, so o admin ve e edita */}
              {isAdmin && (
                <div className="space-y-1.5 rounded-lg border border-[#0F6A3A]/25 bg-[#0F6A3A]/5 p-2.5">
                  <Label className="text-xs font-semibold text-[#0F6A3A]">
                    Valor do serviço / mão de obra (R$)
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={order.service_value ? order.service_value : ''}
                    onChange={(e) =>
                      setOrder((prev) => ({
                        ...prev,
                        // campo vazio = ZERO, nunca undefined: undefined fazia o
                        // valor nem ser enviado no save, e o banco mantinha o
                        // valor antigo (o Felipe tinha de digitar 1 centavo).
                        service_value: e.target.value === '' ? 0 : parseFloat(e.target.value),
                      }))
                    }
                    className="h-9 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Somado ao material no relatório de faturamento. Só o administrador vê este
                    campo.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: MATERIAIS */}
        <TabsContent value="materiais" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Materiais e Peças Utilizados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Listas prontas: aplica um conjunto de produtos de uma vez */}
              {canEdit && kits.length > 0 && (
                <div className="p-3 rounded-lg border border-[#0F6A3A]/25 bg-[#0F6A3A]/5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F6A3A]">
                      <Layers className="w-3.5 h-3.5" />
                      Listas prontas de material
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      asChild
                      className="h-6 px-1.5 text-[11px] font-semibold text-[#0F6A3A] hover:bg-[#0F6A3A]/10 gap-0.5"
                    >
                      <Link to="/listas-material">
                        <Plus className="w-3 h-3" /> Nova lista
                      </Link>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Escolha a lista do tipo de serviço: os produtos entram de uma vez. Depois ajuste
                    a quantidade, remova o que não usou e acrescente o que faltar.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div className="sm:col-span-2">
                      <Select value={selectedKitId} onValueChange={setSelectedKitId}>
                        <SelectTrigger className="h-10 sm:h-9 text-xs bg-background">
                          <SelectValue placeholder="Escolha a lista do serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          {kits.map((k) => (
                            <SelectItem key={k.id} value={k.id} className="text-xs">
                              {k.name}
                              {k.service_type ? ` — ${k.service_type}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={handleApplyKit}
                      disabled={applyingKit || !selectedKitId}
                      className="h-10 sm:h-9 w-full text-xs font-semibold bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white gap-1"
                    >
                      {applyingKit ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Layers className="w-3.5 h-3.5" />
                      )}
                      Aplicar lista
                    </Button>
                  </div>
                </div>
              )}

              {canEdit && (
                <form
                  onSubmit={handleAddMaterial}
                  className="p-3 bg-muted/40 rounded-lg border grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 items-end text-xs"
                >
                  <div className="col-span-3 sm:col-span-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Produto</Label>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setNovoProdutoAberto(true)}
                          className="h-6 px-1.5 text-[11px] font-semibold text-[#0F6A3A] hover:bg-[#0F6A3A]/10 gap-0.5"
                          title="Cadastrar um produto que não está no catálogo"
                        >
                          <Plus className="w-3 h-3" /> Novo
                        </Button>
                      )}
                    </div>
                    <SearchCombobox
                      options={materialsCatalog.map((m) => ({
                        value: m.id,
                        label: (m as any).pending_review ? `● ${m.name}` : m.name,
                        hint: `${
                          m.default_kind ? m.default_kind + ' · ' : ''
                        }${m.unit}${m.category ? ' · ' + m.category : ''}${
                          isAdmin && m.price ? ' · R$ ' + m.price.toFixed(2) : ''
                        }${(m as any).pending_review ? ' · AGUARDA REVISÃO' : ''}`,
                        keywords: [m.category || '', m.default_kind || ''].join(' '),
                      }))}
                      value={selectedMaterialId}
                      onChange={setSelectedMaterialId}
                      placeholder="Selecione o material..."
                      searchPlaceholder="Digite o nome do produto..."
                      emptyText="Nenhum produto com esse nome."
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Qtd (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={materialQty}
                      onChange={(e) => setMaterialQty(e.target.value)}
                      className="h-9 text-xs bg-background"
                      title="Deixe em branco e preencha na tabela depois"
                    />
                  </div>

                  <div>
                    <Button
                      type="submit"
                      disabled={addingMaterial}
                      className="w-full bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white h-9 text-xs font-semibold gap-1"
                    >
                      {addingMaterial ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Adicionar
                    </Button>
                  </div>
                </form>
              )}

              {/* Materiais — cartões no celular (sem rolagem lateral) */}
              <div className="md:hidden space-y-2">
                {orderMaterials.map((mat) => (
                  <div key={mat.id} className="border rounded-lg p-2.5 bg-card space-y-2">
                    <div className="flex items-start gap-2">
                      <p
                        className={`flex-1 text-xs font-semibold leading-snug ${
                          (mat.expand?.material as any)?.pending_review
                            ? 'text-red-600'
                            : 'text-foreground'
                        }`}
                      >
                        {mat.expand?.material?.name || 'Material'}
                        {(mat.expand?.material as any)?.pending_review && (
                          <span className="ml-1 text-[9px] font-bold uppercase bg-red-100 text-red-700 px-1 py-0.5 rounded">
                            novo
                          </span>
                        )}
                      </p>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMaterial(mat.id)}
                          className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                          title="Remover da OS"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    {mat.notes && (
                      <p className="text-[10px] text-muted-foreground leading-snug">{mat.notes}</p>
                    )}

                    {canEdit ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Tipo
                        </span>
                        <Select
                          value={mat.kind || ''}
                          onValueChange={(val) => handleAlterarKindMaterial(mat, val)}
                        >
                          <SelectTrigger className="h-8 w-[8.5rem] text-[10px] font-bold">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {['CAPITAL', 'CONSUMO', 'SERVICO'].map((k) => (
                              <SelectItem key={k} value={k} className="text-xs font-semibold">
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      mat.kind && (
                        <span className="inline-block text-[9px] font-bold uppercase bg-muted px-1.5 py-0.5 rounded">
                          {mat.kind}
                        </span>
                      )
                    )}

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                          Qtd
                        </span>
                        {canEdit ? (
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="—"
                            defaultValue={mat.quantity ? mat.quantity : ''}
                            onBlur={(e) => handleAlterarQtdMaterial(mat, e.target.value)}
                            className="h-9 w-24 text-sm text-center font-mono"
                            title="Digite a quantidade utilizada"
                          />
                        ) : (
                          <span className="text-sm font-mono">{mat.quantity || '—'}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{mat.unit}</span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-end gap-2 pt-1 border-t border-dashed">
                        <div className="flex-1">
                          <span className="text-[9px] font-semibold uppercase text-muted-foreground block mb-0.5">
                            Valor unitário (R$)
                          </span>
                          {canEdit ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              defaultValue={
                                mat.unit_price ? mat.unit_price.toFixed(2).replace('.', ',') : ''
                              }
                              onBlur={(e) => handleAlterarPrecoMaterial(mat, e.target.value)}
                              placeholder="0,00"
                              className="h-9 w-full text-sm text-right font-mono"
                              title="Pode alterar aqui — o app pergunta se atualiza o cadastro"
                            />
                          ) : (
                            <span className="text-sm font-mono">
                              {mat.unit_price ? `R$ ${mat.unit_price.toFixed(2)}` : '—'}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[9px] font-semibold uppercase text-muted-foreground block mb-0.5">
                            Total
                          </span>
                          <span className="text-sm font-mono font-bold text-[#0F6A3A] leading-9 block">
                            {mat.total_price ? `R$ ${mat.total_price.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {orderMaterials.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground border-2 border-dashed rounded-lg">
                    Nenhum material adicionado a esta OS ainda.
                  </div>
                )}
              </div>

              {/* Tabela de Materiais (telas maiores) */}
              <div className="hidden md:block overflow-x-auto border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Material</th>
                      <th className="p-2.5 text-center">Tipo</th>
                      <th className="p-2.5 text-center">Quantidade</th>
                      <th className="p-2.5 text-center">Unidade</th>
                      {isAdmin && (
                        <>
                          <th className="p-2.5 text-right">V. Unitário</th>
                          <th className="p-2.5 text-right">Total</th>
                        </>
                      )}
                      {canEdit && <th className="p-2.5 text-center">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orderMaterials.map((mat) => (
                      <tr key={mat.id} className="hover:bg-muted/30">
                        <td
                          className={`p-2.5 font-medium ${
                            (mat.expand?.material as any)?.pending_review
                              ? 'text-red-600'
                              : 'text-foreground'
                          }`}
                        >
                          {mat.expand?.material?.name || 'Material'}
                          {(mat.expand?.material as any)?.pending_review && (
                            <span className="ml-1.5 inline-block text-[9px] font-bold uppercase bg-red-100 text-red-700 px-1 py-0.5 rounded align-middle">
                              novo — revisar
                            </span>
                          )}
                          {mat.notes && (
                            <span className="block text-[11px] text-muted-foreground">
                              {mat.notes}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {canEdit ? (
                            <Select
                              value={mat.kind || ''}
                              onValueChange={(val) => handleAlterarKindMaterial(mat, val)}
                            >
                              <SelectTrigger className="h-7 w-[7.5rem] text-[10px] font-bold mx-auto">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {['CAPITAL', 'CONSUMO', 'SERVICO'].map((k) => (
                                  <SelectItem key={k} value={k} className="text-xs font-semibold">
                                    {k}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : mat.kind ? (
                            <span className="text-[10px] font-bold uppercase">{mat.kind}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono">
                          {canEdit ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="—"
                              defaultValue={mat.quantity ? mat.quantity : ''}
                              onBlur={(e) => handleAlterarQtdMaterial(mat, e.target.value)}
                              className="h-7 w-16 text-xs text-center mx-auto font-mono"
                              title="Digite a quantidade utilizada"
                            />
                          ) : (
                            mat.quantity
                          )}
                        </td>
                        <td className="p-2.5 text-center">{mat.unit}</td>
                        {isAdmin && (
                          <>
                            <td className="p-2.5 text-right font-mono">
                              {canEdit ? (
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={
                                    mat.unit_price
                                      ? mat.unit_price.toFixed(2).replace('.', ',')
                                      : ''
                                  }
                                  onBlur={(e) => handleAlterarPrecoMaterial(mat, e.target.value)}
                                  placeholder="0,00"
                                  className="h-7 w-20 text-xs text-right font-mono ml-auto"
                                  title="Valor unitário — pode alterar aqui (pergunta se atualiza o cadastro)"
                                />
                              ) : mat.unit_price ? (
                                `R$ ${mat.unit_price.toFixed(2)}`
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-[#0F6A3A]">
                              {mat.total_price ? `R$ ${mat.total_price.toFixed(2)}` : '-'}
                            </td>
                          </>
                        )}
                        {canEdit && (
                          <td className="p-2.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteMaterial(mat.id)}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}

                    {orderMaterials.length === 0 && (
                      <tr>
                        <td
                          colSpan={(canEdit ? 1 : 0) + (isAdmin ? 5 : 4)}
                          className="p-6 text-center text-muted-foreground"
                        >
                          Nenhum material adicionado a esta OS ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3: FOTOS / EVIDÊNCIAS */}
        <TabsContent value="fotos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">
                Fotos e Evidências do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEdit && (
                <form
                  onSubmit={handleUploadPhoto}
                  className="p-3 bg-muted/40 rounded-lg border space-y-3 text-xs"
                >
                  {/* Inputs escondidos: um abre a câmera do celular, o outro a galeria */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelected}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoSelected}
                  />

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white h-10 text-xs font-semibold gap-2 flex-1"
                    >
                      <Camera className="w-4 h-4" />
                      Tirar foto agora
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => galleryInputRef.current?.click()}
                      className="h-10 text-xs font-semibold gap-2 flex-1"
                    >
                      <Images className="w-4 h-4" />
                      Escolher da galeria (várias)
                    </Button>
                  </div>

                  {pendingPhotos.length > 0 ? (
                    <div className="space-y-3 bg-background rounded-lg border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground">
                          {pendingPhotos.length}{' '}
                          {pendingPhotos.length === 1 ? 'foto selecionada' : 'fotos selecionadas'}
                        </span>
                        <button
                          type="button"
                          onClick={clearPhotoSelection}
                          className="text-[11px] text-muted-foreground hover:text-destructive font-medium"
                        >
                          Limpar tudo
                        </button>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {pendingPhotos.map((item, i) => (
                          <div key={i} className="relative">
                            {item.podeVer === false ? (
                              // HEIC/HEIF: o navegador não mostra, então exibimos
                              // o nome do arquivo para o técnico saber o que escolheu
                              <div className="w-full h-20 rounded-md border bg-slate-100 flex flex-col items-center justify-center gap-1 px-1">
                                <span className="text-[9px] font-bold text-slate-500 uppercase">
                                  HEIC
                                </span>
                                <span className="text-[8px] text-slate-500 text-center leading-tight line-clamp-2 break-all">
                                  {item.nome}
                                </span>
                              </div>
                            ) : (
                              <img
                                src={item.preview}
                                alt={`Pré-visualização ${i + 1}`}
                                className="w-full h-20 object-cover rounded-md border"
                                onError={(ev) => {
                                  // se ainda assim não carregar, esconde a imagem
                                  ;(ev.currentTarget as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => removePendingPhoto(i)}
                              className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-destructive text-white rounded-full p-0.5"
                              title="Remover esta foto"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">
                          Legenda (opcional, vale para todas)
                        </Label>
                        <Input
                          placeholder="Ex: Rack antes da organização / Ponto final testado"
                          value={photoDescription}
                          onChange={(e) => setPhotoDescription(e.target.value)}
                          className="h-9 text-xs bg-background"
                        />
                        <Button
                          type="submit"
                          disabled={uploadingPhoto}
                          className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white h-9 text-xs font-semibold gap-1.5 w-full sm:w-auto"
                        >
                          {uploadingPhoto ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5" />
                          )}
                          {uploadingPhoto
                            ? uploadProgress || 'Enviando...'
                            : pendingPhotos.length === 1
                              ? 'Salvar Foto na OS'
                              : `Salvar ${pendingPhotos.length} Fotos na OS`}
                        </Button>
                      </div>

                      {/* Motivo da falha: fica em vermelho até o próximo envio,
                          para o técnico conseguir ler e me reportar */}
                      {ultimoErroFoto && (
                        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-destructive">
                            A foto não foi enviada
                          </p>
                          <p className="text-[11px] text-destructive/90 leading-snug break-words">
                            {ultimoErroFoto}
                          </p>
                          <button
                            type="button"
                            onClick={() => setUltimoErroFoto('')}
                            className="text-[10px] underline text-muted-foreground"
                          >
                            Fechar aviso
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Toque em <strong>Tirar foto agora</strong> para abrir a câmera do celular, ou
                      em <strong>Escolher da galeria</strong> para selecionar várias fotos de uma
                      vez. Elas ficam vinculadas a esta ordem de serviço.
                    </p>
                  )}
                </form>
              )}

              {/* Grid de Fotos */}
              {orderPhotos.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {orderPhotos.length} foto(s) na OS
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadAllPhotos}
                    disabled={baixandoTodas}
                    className="h-8 text-[11px] gap-1.5"
                    title="Salvar todas as fotos de uma vez na galeria"
                  >
                    {baixandoTodas ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {baixandoTodas ? 'Preparando...' : 'Salvar todas'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShareAllPhotos}
                    className="h-8 text-[11px] gap-1.5 border-[#0F6A3A]/40 text-[#0F6A3A] hover:bg-[#0F6A3A]/10"
                    title="Enviar todas as fotos de uma vez pelo WhatsApp"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Enviar todas
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {orderPhotos.map((photo, idx) => {
                  const url = getFileUrl('order_photos', photo.id, photo.image)
                  return (
                    <div
                      key={photo.id}
                      className="border rounded-lg overflow-hidden bg-card shadow-sm flex flex-col group relative"
                    >
                      <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                        {url ? (
                          <img
                            src={url}
                            alt={photo.description || `Foto ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="p-2 text-xs flex-1 flex flex-col justify-between">
                        <span className="font-semibold text-foreground line-clamp-1">
                          {photo.description || `Evidência #${idx + 1}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-1">
                          {photo.captured_at
                            ? new Date(photo.captured_at).toLocaleDateString('pt-BR')
                            : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 border-t px-1.5 py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSharePhoto(photo, idx)}
                          className="h-7 flex-1 text-[10px] gap-1 px-1"
                          title="Compartilhar no WhatsApp ou salvar em Fotos"
                        >
                          <Share2 className="w-3 h-3" />
                          Enviar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadPhoto(photo, idx)}
                          className="h-7 flex-1 text-[10px] gap-1 px-1"
                          title="Salvar esta foto no celular (galeria ou arquivos)"
                        >
                          <Download className="w-3 h-3" />
                          Salvar
                        </Button>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-destructive text-white rounded-full p-1 opacity-80 hover:opacity-100 transition"
                          title="Excluir foto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}

                {orderPhotos.length === 0 && (
                  <div className="col-span-full p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                    <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-xs">Nenhuma foto registrada nesta ordem de serviço.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 4: ASSINATURA & GPS */}
        <TabsContent value="assinatura" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Box GPS */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Localização do Atendimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <GeoLocationPicker
                  latitude={order.location_lat}
                  longitude={order.location_lng}
                  address={order.location_address}
                  onChange={({ lat, lng, address }) => {
                    setOrder((prev) => ({
                      ...prev,
                      location_lat: lat,
                      location_lng: lng,
                      location_address: address,
                    }))
                  }}
                  readOnly={!canEdit}
                />
              </CardContent>
            </Card>

            {/* Box Assinatura Digital */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold">Assinatura Digital do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome do Responsável</Label>
                    <Input
                      placeholder="Ex: Roberto da Costa"
                      value={order.client_signer_name || ''}
                      onChange={(e) =>
                        setOrder((prev) => ({ ...prev, client_signer_name: e.target.value }))
                      }
                      disabled={!canEdit}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Documento (CPF/RG)</Label>
                    <Input
                      placeholder="Ex: 123.456.789-00"
                      value={order.client_signer_doc || ''}
                      onChange={(e) =>
                        setOrder((prev) => ({ ...prev, client_signer_doc: e.target.value }))
                      }
                      disabled={!canEdit}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <SignaturePad
                  initialImage={
                    order.signature_image
                      ? getFileUrl('work_orders', order.id || '', order.signature_image)
                      : undefined
                  }
                  onSave={(dataUrl) => {
                    setSignatureDataUrl(dataUrl)
                  }}
                  readOnly={!canEdit}
                />

                {signatureDataUrl && (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    ✓ Assinatura capturada. Clique em &quot;Salvar Alterações&quot; no topo para
                    persistir.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA 5: HISTÓRICO DE MUDANÇAS */}
        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold">Histórico e Auditoria da OS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orderHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border bg-muted/20 flex items-start gap-3 text-xs"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#0F6A3A] mt-1.5 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          {item.status_from
                            ? `${item.status_from} ➔ ${item.status_to}`
                            : `Criada como ${item.status_to}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.created).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-600">{item.notes}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Registrado por: {item.user_name}
                      </p>
                    </div>
                  </div>
                ))}

                {orderHistory.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Nenhum histórico registrado para esta OS.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cadastro rápido em campo: produto novo e cliente novo sem sair da OS.
          O produto nasce marcado como "aguardando revisão" para o admin. */}
      <ProdutoRapidoDialog
        open={novoProdutoAberto}
        onOpenChange={setNovoProdutoAberto}
        onCriado={(m) => {
          setMaterialsCatalog((prev) => [m, ...prev])
          setSelectedMaterialId(m.id)
          setMaterialQty('1')
        }}
      />

      <ClienteRapidoDialog
        open={novoClienteAberto}
        onOpenChange={setNovoClienteAberto}
        onCriado={(c) => {
          setClients((prev) => [c, ...prev])
          setOrder((prev) => ({ ...prev, client: c.id }))
        }}
      />
    </div>
  )
}
