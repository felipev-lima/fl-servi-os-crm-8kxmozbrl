import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MapPin, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

interface GeoLocationPickerProps {
  latitude?: number
  longitude?: number
  address?: string
  onChange: (coords: { lat: number; lng: number; address?: string }) => void
  readOnly?: boolean
}

export const GeoLocationPicker: React.FC<GeoLocationPickerProps> = ({
  latitude,
  longitude,
  address,
  onChange,
  readOnly = false,
}) => {
  const [loading, setLoading] = useState(false)

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não é suportada neste navegador/dispositivo.')
      return
    }

    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        let detectedAddress = ''
        try {
          // Tentativa de geocodificação reversa amigável via OpenStreetMap Nominatim
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR' } },
          )
          if (res.ok) {
            const data = await res.json()
            detectedAddress = data.display_name || ''
          }
        } catch (_) {
          // Silencioso se offline
        }

        onChange({
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          address: detectedAddress || address || 'Coordenadas capturadas em campo',
        })

        setLoading(false)
        toast.success('Localização GPS capturada com sucesso!')
      },
      (error) => {
        setLoading(false)
        let msg = 'Erro ao obter localização.'
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Permissão de GPS negada. Ative o GPS no aparelho.'
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Sinal de GPS indisponível no momento.'
        } else if (error.code === error.TIMEOUT) {
          msg = 'Tempo limite excedido ao buscar GPS.'
        }
        toast.error(msg)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  }

  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number' && latitude !== 0

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border border-border/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="w-4 h-4 text-[#0B3D91]" />
          <span>Localização do Atendimento (GPS)</span>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={captureLocation}
            disabled={loading}
            className="h-8 text-xs gap-1.5 border-[#0B3D91]/40 text-[#0B3D91] hover:bg-[#0B3D91]/10"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <MapPin className="w-3.5 h-3.5" />
            )}
            {hasCoords ? 'Atualizar GPS' : 'Capturar GPS Agora'}
          </Button>
        )}
      </div>

      {hasCoords ? (
        <div className="text-xs space-y-1 text-muted-foreground bg-background p-2 rounded border">
          <div className="flex items-center justify-between">
            <span className="font-mono text-foreground font-medium">
              Lat: {latitude} | Lng: {longitude}
            </span>
            <a
              href={`https://www.google.com/maps?q=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0B3D91] hover:underline flex items-center gap-1 font-sans text-xs"
            >
              Abrir no Maps <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {address && <div className="text-foreground/80 line-clamp-2">{address}</div>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma coordenada registrada. Toque no botão acima para registrar a localização exata do
          técnico em Macaé/região.
        </p>
      )}
    </div>
  )
}
