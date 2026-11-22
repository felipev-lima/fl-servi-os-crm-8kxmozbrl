/**
 * Configurações da empresa — o que sai no PDF.
 *
 * Aqui o Felipe troca logomarca, dados fiscais e a assinatura do diretor sem
 * depender de programador. Tudo grava em `settings`, e o PDF lê de lá.
 */
import { useEffect, useRef, useState } from 'react'
import {
  getEmpresa,
  salvarEmpresa,
  enviarArquivoEmpresa,
  urlArquivo,
  limparCacheEmpresa,
  type Empresa,
} from '@/lib/empresa'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/SignaturePad'
import { Building2, Upload, Loader2, Save, ImageIcon, PenLine, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ConfiguracoesPage() {
  const [empresa, setEmpresa] = useState<Empresa>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [mostrarPad, setMostrarPad] = useState(false)
  const [assinaturaNova, setAssinaturaNova] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const inputLogo = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    getEmpresa(true)
      .then(setEmpresa)
      .finally(() => setCarregando(false))
  }, [])

  const set = (campo: keyof Empresa, valor: string) => setEmpresa((e) => ({ ...e, [campo]: valor }))

  const salvar = async () => {
    setSalvando(true)
    try {
      const salvo = await salvarEmpresa(empresa)
      setEmpresa(salvo)
      limparCacheEmpresa()
      toast.success('Dados salvos.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const enviarLogo = async (arquivo: File) => {
    setEnviando('logo')
    try {
      setEmpresa(await enviarArquivoEmpresa('logo', arquivo))
      toast.success('Logomarca atualizada.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível enviar a logo.')
    } finally {
      setEnviando(null)
    }
  }

  /**
   * A assinatura é lida DIRETO do canvas na hora de salvar.
   *
   * Depender do evento de fim de traço fazia a assinatura se perder quando a
   * pessoa tocava em "Salvar" logo depois de desenhar — o mesmo defeito que
   * apareceu no sistema antigo.
   */
  const salvarAssinatura = async () => {
    let dataUrl = ''
    try {
      dataUrl = canvasRef.current?.toDataURL('image/png') || ''
    } catch {
      dataUrl = ''
    }
    if (dataUrl.length < 3000) dataUrl = assinaturaNova
    if (dataUrl.length < 3000) {
      toast.error('Desenhe a assinatura antes de salvar.')
      return
    }
    setEnviando('assinatura')
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const arquivo = new File([blob], 'assinatura-diretor.png', { type: 'image/png' })
      setEmpresa(await enviarArquivoEmpresa('assinatura_diretor', arquivo))
      setMostrarPad(false)
      toast.success('Assinatura do diretor salva.')
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar a assinatura.')
    } finally {
      setEnviando(null)
    }
  }

  const urlLogo = urlArquivo(empresa, 'logo')
  const urlAssinatura = urlArquivo(empresa, 'assinatura_diretor')

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <h1 className="text-xl font-black tracking-tight">Configurações</h1>
        <p className="text-[11px] text-muted-foreground">
          Estes dados aparecem no PDF dos orçamentos e pedidos.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <Label className="flex items-center gap-1.5 text-xs font-bold">
            <ImageIcon className="h-3.5 w-3.5" /> Logomarca
          </Label>
          <div className="flex items-center gap-3">
            <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
              {urlLogo ? (
                <img
                  src={urlLogo}
                  alt="Logomarca"
                  className="max-h-full max-w-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <input
                ref={inputLogo}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void enviarLogo(f)
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputLogo.current?.click()}
                disabled={enviando === 'logo'}
                className="h-8 w-full gap-1.5 text-[11px]"
              >
                {enviando === 'logo' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Trocar logomarca
              </Button>
              <p className="text-[9px] text-muted-foreground">
                PNG com fundo transparente fica melhor no PDF.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2.5 p-3">
          <Label className="flex items-center gap-1.5 text-xs font-bold">
            <Building2 className="h-3.5 w-3.5" /> Dados da empresa
          </Label>
          {[
            ['nome_fantasia', 'Nome fantasia'],
            ['razao_social', 'Razão social'],
          ].map(([campo, rot]) => (
            <div key={campo} className="space-y-1">
              <Label className="text-[11px]">{rot}</Label>
              <Input
                value={(empresa as any)[campo] || ''}
                onChange={(e) => set(campo as keyof Empresa, e.target.value)}
                className="h-9 text-xs uppercase"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">CNPJ</Label>
              <Input
                value={empresa.cnpj || ''}
                onChange={(e) => set('cnpj', e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Inscrição estadual</Label>
              <Input
                value={empresa.ie || ''}
                onChange={(e) => set('ie', e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Endereço completo</Label>
            <Input
              value={empresa.endereco || ''}
              onChange={(e) => set('endereco', e.target.value)}
              className="h-9 text-xs uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Telefone</Label>
              <Input
                value={empresa.telefone || ''}
                onChange={(e) => set('telefone', e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">E-mail</Label>
              <Input
                value={empresa.email || ''}
                onChange={(e) => set('email', e.target.value.toLowerCase())}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-3">
          <Label className="flex items-center gap-1.5 text-xs font-bold">
            <PenLine className="h-3.5 w-3.5" /> Assinatura do diretor
          </Label>
          <div className="space-y-1">
            <Label className="text-[11px]">Nome que aparece abaixo da assinatura</Label>
            <Input
              value={empresa.diretor_nome || ''}
              onChange={(e) => set('diretor_nome', e.target.value)}
              placeholder="FELIPE LIMA"
              className="h-9 text-xs uppercase"
            />
          </div>

          {urlAssinatura && !mostrarPad && (
            <div className="flex items-center gap-2 rounded-md border bg-slate-50 p-2">
              <img src={urlAssinatura} alt="Assinatura" className="h-12 object-contain" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMostrarPad(true)}
                className="ml-auto h-7 text-[10px]"
              >
                Trocar
              </Button>
            </div>
          )}

          {(!urlAssinatura || mostrarPad) && (
            <>
              <SignaturePad
                onSave={setAssinaturaNova}
                onCanvasReady={(c) => (canvasRef.current = c)}
              />
              <Button
                size="sm"
                onClick={salvarAssinatura}
                disabled={enviando === 'assinatura'}
                className="h-8 w-full gap-1.5 bg-[#0B3D91] text-[11px] text-white hover:bg-[#0B3D91]/90"
              >
                {enviando === 'assinatura' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Salvar assinatura
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={salvar}
        disabled={salvando}
        className="h-10 w-full gap-2 bg-[#0B3D91] font-semibold text-white hover:bg-[#0B3D91]/90"
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {salvando ? 'Salvando...' : 'Salvar dados'}
      </Button>
    </div>
  )
}
