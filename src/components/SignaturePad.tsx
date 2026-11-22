import React, { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, Check, PenTool } from 'lucide-react'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  initialImage?: string
  readOnly?: boolean
  /**
   * Recebe o canvas para o formulário ler o desenho na hora de salvar.
   * Sem isso, dependíamos do evento de fim de traço — e o desenho podia se
   * perder se a pessoa tocasse em "Salvar" logo depois.
   */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onSave,
  initialImage,
  readOnly = false,
  onCanvasReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  /**
   * BUG CORRIGIDO (22/11/2026) — A ASSINATURA JÁ SALVA NÃO APARECIA.
   *
   * O QUE ACONTECIA: as abas da OS só renderizam o conteúdo da aba ativa. O
   * canvas da assinatura, quando monta dentro da aba "Assinatura & GPS" ainda
   * escondida, mede 0×0 (`getBoundingClientRect()` devolve zero para elemento
   * com `display:none`). O código então fazia `canvas.width = 0 * 2`, ou seja
   * ZERO, e desenhava a imagem num canvas de tamanho nenhum. Quando a aba
   * abria, o canvas ganhava tamanho na tela mas o `useEffect` não rodava de
   * novo — a assinatura nunca era desenhada.
   *
   * Por isso: a assinatura existia no banco, o arquivo abria pela URL, o PDF
   * saía certo, mas na TELA o quadro aparecia vazio.
   *
   * A CORREÇÃO: um `ResizeObserver` que prepara o canvas toda vez que ele
   * ganha tamanho (ou seja, quando a aba abre) e redesenha a assinatura
   * salva. Como o canvas é recriado ao ser redimensionado, guardamos o
   * tamanho já aplicado para não apagar um traço que o usuário esteja fazendo.
   */
  const tamanhoAplicado = useRef('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    onCanvasReady?.(canvas)

    /** Prepara o canvas no tamanho atual e, se houver, desenha a assinatura salva. */
    const preparar = () => {
      const rect = canvas.getBoundingClientRect()
      // ainda escondido (aba fechada): não dá para medir, tenta no próximo aviso
      if (rect.width < 10 || rect.height < 10) return
      const chave = `${Math.round(rect.width)}x${Math.round(rect.height)}`
      if (tamanhoAplicado.current === chave) return // já preparado neste tamanho

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Ajustar resolução para retina
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      tamanhoAplicado.current = chave

      ctx.setTransform(1, 0, 0, 1, 0, 0) // o resize zera o contexto
      ctx.scale(2, 2)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#0B3D91'

      // Fundo branco
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, rect.width, rect.height)

      if (initialImage) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const c = canvas.getContext('2d')
          if (!c) return
          c.drawImage(img, 0, 0, rect.width, rect.height)
          setHasDrawn(true)
        }
        img.src = initialImage
      } else {
        setHasDrawn(false)
      }
    }

    preparar()

    // A aba abre -> o canvas sai de 0x0 -> o observer avisa e preparamos de novo
    const obs = new ResizeObserver(() => preparar())
    obs.observe(canvas)

    return () => obs.disconnect()
  }, [initialImage])

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasDrawn(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    exportSignature()
  }

  const clear = () => {
    if (readOnly) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
    onSave('')
  }

  /**
   * Redesenha a partir das coordenadas RELATIVAS ao canvas.
   * `getCoordinates` já devolve o ponto dentro do elemento, mas o desenho
   * acontece depois do `scale(2,2)` do contexto — por isso as medidas do
   * `getBoundingClientRect` (CSS px) valem direto aqui.
   */

  /**
   * Exporta a assinatura com FUNDO TRANSPARENTE.
   *
   * O canvas é preenchido de branco para servir de área de desenho, mas esse
   * branco não pode ir para o PDF: lá a assinatura entra sobre a linha e o
   * nome, e um retângulo branco cobria os dois (a "tarja" que aparecia).
   * Aqui o branco vira transparente, mantendo só o traço.
   */
  const exportSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { width, height } = canvas

      // imagem atual do canvas (traço verde sobre branco)
      const dados = ctx.getImageData(0, 0, width, height)
      const px = dados.data
      let temTraco = false
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i]
        const g = px[i + 1]
        const b = px[i + 2]
        // pixel claro (fundo branco) -> transparente; mantém o traço colorido
        if (r > 235 && g > 235 && b > 235) {
          px[i + 3] = 0
        } else {
          temTraco = true
        }
      }
      if (!temTraco) {
        onSave('')
        return
      }
      const tmp = document.createElement('canvas')
      tmp.width = width
      tmp.height = height
      tmp.getContext('2d')?.putImageData(dados, 0, 0)
      onSave(tmp.toDataURL('image/png'))
    } catch (_) {
      // canvas sem conteúdo: não sobrescreve o que já existia
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative border-2 border-dashed border-[#1E6FD9]/40 rounded-lg overflow-hidden bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full h-36 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasDrawn && !readOnly && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground/60 text-sm gap-2">
            <PenTool className="w-4 h-4 text-[#0B3D91]" />
            Assine aqui com o dedo ou caneta
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>Assinatura digital do responsável/cliente</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clear}
              className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            >
              <Eraser className="w-3.5 h-3.5" />
              Limpar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportSignature}
              className="h-7 text-xs gap-1 text-[#0B3D91] border-[#0B3D91]/30 hover:bg-[#0B3D91]/10"
            >
              <Check className="w-3.5 h-3.5" />
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
