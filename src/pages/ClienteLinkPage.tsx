/**
 * PÁGINA PÚBLICA DO CLIENTE (sem login) — /cliente/:tipo/:id?t=TOKEN
 *
 * É o que o técnico/entregador manda pelo WhatsApp: o cliente abre e vê
 * materiais/serviços com quantidades e as fotos, SEM NENHUM VALOR. Pode baixar
 * o ZIP das fotos e ASSINAR a confirmação de recebimento na tela.
 *
 * O link é VIVO: a leitura vai pela rota pública do backend (toda abertura
 * relê no banco), então item/foto novo lançado no CRM já aparece no mesmo link.
 *
 * Regras respeitadas: a rota devolve recorte SEM valor; o nome do cliente é a
 * RAZÃO SOCIAL (nunca o apelido); nada é apagado — assinar grava por cima do
 * campo de assinatura e registra no histórico, o documento fica intacto.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Loader2,
  Package,
  Images,
  Download,
  PenTool,
  BadgeCheck,
  RefreshCw,
  Wrench,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SignaturePad } from '@/components/SignaturePad'
import {
  lerDocumentoPublico,
  assinarDocumentoPublico,
  type DocumentoPublico,
} from '@/lib/linkCliente'
import pb from '@/lib/pocketbase/client'
import { baixarFotosZip, type FotoParaZip as FotoZip } from '@/lib/fotosZip'

export default function PaginaPublicaCliente() {
  const { tipo, id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') || ''

  const [doc, setDoc] = useState<DocumentoPublico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // assinatura
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [enviandoZip, setEnviandoZip] = useState(false)

  const carregar = useCallback(async () => {
    if (!tipo || !id || !token) {
      setErro('Link inválido.')
      setCarregando(false)
      return
    }
    try {
      const d = await lerDocumentoPublico(tipo as 'os' | 'pedido', id, token)
      // as URLs de arquivo do hook podem vir relativas: o prefixo do
      // PocketBase é conhecido aqui no cliente (pb.baseURL)
      const pbBase = pb.baseURL.replace(/\/$/, '')
      for (const f of d.fotos) {
        if (f.url && f.url.charAt(0) === '/') f.url = pbBase + f.url
      }
      if (d.assinatura_url && d.assinatura_url.charAt(0) === '/') {
        d.assinatura_url = pbBase + d.assinatura_url
      }
      setDoc(d)
      setErro('')
      if (d.assinado_em) setSalvo(true)
    } catch (e: any) {
      setErro(e?.message || 'Documento não encontrado.')
    } finally {
      setCarregando(false)
    }
  }, [tipo, id, token])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const baixarZip = async () => {
    if (!doc) return
    setEnviandoZip(true)
    try {
      const fotos: FotoZip[] = doc.fotos.map((f) => ({ nome: f.nome, url: f.url }))
      const qtde = await baixarFotosZip({
        fotos,
        nomeArquivo: doc.tipo === 'os' ? `OS-${doc.numero}-FOTOS` : `PEDIDO-${doc.numero}-FOTOS`,
        pasta: doc.tipo === 'os' ? `os-${doc.numero}` : `pedido-${doc.numero}`,
      })
      alert(qtde === 0 ? 'Não foi possível preparar as fotos.' : `ZIP com ${qtde} foto(s) baixado.`)
    } finally {
      setEnviandoZip(false)
    }
  }

  const confirmar = async () => {
    if (!doc || !assinatura || !nome.trim()) {
      alert('Assine na tela e informe quem está recebendo.')
      return
    }
    setSalvando(true)
    try {
      await assinarDocumentoPublico({
        tipo: doc.tipo,
        id: doc.id,
        token,
        nome,
        documento,
        assinaturaDataUrl: assinatura,
      })
      alert('Assinatura gravada! O documento ficou marcado como recebido.')
      setSalvo(true)
      await carregar()
    } catch (e: any) {
      alert(e?.message || 'Não foi possível gravar a assinatura.')
    } finally {
      setSalvando(false)
    }
  }

  // ---------------- estados de tela ----------------
  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#0B3D91]" /> Carregando documento...
      </div>
    )
  }

  if (erro || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm rounded-xl border bg-white p-6 text-center shadow-sm">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-800">Link não encontrado</p>
          <p className="mt-1 text-xs text-slate-500">{erro || 'Confira o link recebido.'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 text-[#0B3D91]"
            onClick={() => void carregar()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      </div>
    )
  }

  const jaAssinado = Boolean(doc.assinado_em || doc.assinatura_url)
  const etiquetaDoc = doc.tipo === 'os' ? 'Ordem de Serviço' : 'Pedido'

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* cabeçalho azul */}
      <header className="bg-gradient-to-r from-[#0B3D91] to-[#1E6FD9] px-4 py-5 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
            {doc.tipo === 'os' ? <Wrench className="h-6 w-6" /> : <Package className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
              FL SERVIÇOS CRM
            </p>
            <h1 className="truncate text-lg font-black leading-tight">
              {etiquetaDoc} nº {doc.numero || doc.id.slice(-6).toUpperCase()}
            </h1>
            <p className="truncate text-xs text-white/80">{doc.cliente.name || 'Cliente'}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {/* faixa de confirmado */}
        {jaAssinado && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <BadgeCheck className="h-5 w-5 shrink-0" />
            <p>
              Recebimento <strong>confirmado</strong>
              {doc.assinado_por ? ` por ${doc.assinado_por}` : ''}
              {doc.assinado_em ? ` em ${new Date(doc.assinado_em).toLocaleString('pt-BR')}` : ''}.
            </p>
          </div>
        )}

        {/* itens — SEM valor nenhum */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-[#0B3D91]">
            <ClipboardList className="h-4 w-4" /> Materiais e serviços
          </h2>
          {doc.itens.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Nenhum item lançado ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {doc.itens.map((it, i) => (
                <li key={i} className="flex items-start gap-2 py-2">
                  <span className="mt-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-900">
                    {it.tipo === 'SERVICO' ? 'SERVIÇO' : 'PRODUTO'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug text-slate-800">
                      {it.descricao}
                    </p>
                    {it.unidade && it.unidade !== 'UN' && (
                      <p className="text-[10px] text-slate-400">unidade: {it.unidade}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-[#0B3D91]">
                    {Number(it.quantidade || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* fotos + ZIP */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-[#0B3D91]">
            <Images className="h-4 w-4" /> Fotos ({doc.fotos.length})
          </h2>
          {doc.fotos.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Nenhuma foto ainda.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {doc.fotos.map((f, i) => (
                  <a
                    key={f.nome + i}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={f.url}
                      alt={f.caption || `Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
              <Button
                onClick={baixarZip}
                disabled={enviandoZip}
                className="mt-3 h-9 w-full gap-1.5 bg-[#0B3D91] text-xs text-white hover:bg-[#0B3D91]/90"
              >
                {enviandoZip ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Baixar todas as fotos (.zip)
              </Button>
            </>
          )}
        </section>

        {/* assinatura */}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-[#0B3D91]">
            <PenTool className="h-4 w-4" /> Confirmação de recebimento
          </h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Assine abaixo para confirmar que recebeu os materiais/serviços deste documento.
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-bold text-slate-600">Quem está recebendo</label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo de quem recebeu"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600">CPF/CNPJ (opcional)</label>
              <Input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="000.000.000-00"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600">Assinatura</label>
              <SignaturePad onSave={setAssinatura} />
            </div>
            {salvo && (
              <p className="text-[11px] text-emerald-700">
                Este documento já está assinado. Assinar de novo grava uma nova assinatura por cima
                (a anterior continua no histórico).
              </p>
            )}
            <Button
              onClick={confirmar}
              disabled={salvando}
              className="h-10 w-full gap-1.5 bg-[#0B3D91] text-sm font-bold text-white hover:bg-[#0B3D91]/90"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              Confirmar recebimento
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
