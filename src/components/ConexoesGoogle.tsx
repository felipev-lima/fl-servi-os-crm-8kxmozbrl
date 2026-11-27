/**
 * Cartões de conexão Google — modo CONTA DE CADA USUÁRIO.
 *
 * Cada usuário logado conecta a SUA PRÓPRIA conta (Sheets, Gmail, Drive,
 * Agenda); a conexão nunca é compartilhada entre usuários do app. O estado
 * (conectado/desconectado) aparece por toolkit e o ConnectorButton cuida do
 * consentimento do Google.
 */
import { ConnectorButton } from '@/components/skip/ConnectorButton'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Link2 } from 'lucide-react'

const TOOLKITS: { toolkit: string; name: string; descricao: string }[] = [
  {
    toolkit: 'googlesheets',
    name: 'Google Sheets',
    descricao: 'Grava os lançamentos financeiros na sua planilha',
  },
  { toolkit: 'gmail', name: 'Gmail', descricao: 'Envia e-mails pela sua conta' },
  { toolkit: 'googledrive', name: 'Google Drive', descricao: 'Acessa os arquivos da sua conta' },
  { toolkit: 'googlecalendar', name: 'Google Agenda', descricao: 'Cria eventos na sua agenda' },
]

/** Lista de conexões Google do próprio usuário (Configurações). */
export function ConexoesGoogle() {
  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <Label className="flex items-center gap-1.5 text-xs font-bold">
          <Link2 className="h-3.5 w-3.5" /> Conexões Google (sua conta)
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Cada usuário conecta a própria conta — nada é compartilhado entre usuários do app.
        </p>
        <div className="space-y-2">
          {TOOLKITS.map((t) => (
            <div key={t.toolkit} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{t.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{t.descricao}</p>
              </div>
              <ConnectorButton toolkit={t.toolkit} name={t.name} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
