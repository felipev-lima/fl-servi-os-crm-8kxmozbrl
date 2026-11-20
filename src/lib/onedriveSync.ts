/**
 * Aviso de sincronizacao com o OneDrive.
 *
 * Como funciona hoje: o app nao fala com o OneDrive direto (os conectores do
 * Skip nao estao habilitados neste projeto). Quando uma OS muda, o app dispara
 * um sinal HTTP para o assistente do Dono, que busca os dados e atualiza a
 * pasta no OneDrive.
 *
 * BUG CORRIGIDO (2026-11-19): a geracao de PLANILHA/ORCAMENTO nao avisava
 * sincronizacao nenhuma — so a edicao de OS, a foto e a criacao avisavam. Por
 * isso "os novos orcamentos nao estavam subindo" para o OneDrive. Agora a
 * planilha tambem avisa.
 *
 * Segundo problema: a falha era 100% silenciosa, entao nao havia como saber se
 * o sinal chegou. Agora cada envio grava o resultado em localStorage e a tela
 * consegue mostrar "ultima sincronizacao: ok/falhou".
 *
 * Regra de ouro mantida: isto NUNCA pode atrapalhar o trabalho do tecnico.
 * Qualquer falha continua nao bloqueando a tela — mas deixa de ser invisivel.
 */

const WEBHOOK_PADRAO =
  'https://maestro.adapta.one/webhooks/generic/4265094db30bb24eaee83800d3d6a909ae51b006758b7106b512921dec45d4d5'

const WEBHOOK_SECRET = '923120933f620adca609c0e98677c63fb856aa9566fa05dea41eae8a115453bb'

/** Permite trocar o destino sem recompilar quando o webhook mudar de host. */
function urlWebhook(): string {
  const env = (import.meta as any)?.env?.VITE_ONEDRIVE_SYNC_URL
  return typeof env === 'string' && env.length > 0 ? env : WEBHOOK_PADRAO
}

const CHAVE_ESTADO = 'fl.onedriveSync.ultimo'

export interface EstadoSincronizacao {
  quando: string
  ok: boolean
  motivo: string
  os?: number | null
}

function registrar(estado: EstadoSincronizacao): void {
  try {
    localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estado))
  } catch (_) {
    /* modo privado: so nao persiste */
  }
}

/** Le o resultado do ultimo aviso de sincronizacao. */
export function ultimaSincronizacao(): EstadoSincronizacao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTADO)
    return bruto ? (JSON.parse(bruto) as EstadoSincronizacao) : null
  } catch (_) {
    return null
  }
}

/**
 * Avisa que algo mudou e precisa ser sincronizado com o OneDrive.
 * Dispara e segue: nao espera resposta para liberar a tela, mas grava o
 * resultado para consulta.
 */
export function avisarSincronizacao(osId: string, numero?: number, motivo = 'alteracao'): void {
  if (!osId) return
  const quando = new Date().toISOString()
  try {
    void fetch(urlWebhook(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({ os_id: osId, numero: numero ?? null, motivo }),
      // keepalive deixa a requisicao terminar mesmo se a pagina mudar
      keepalive: true,
    })
      .then((r) => {
        registrar({
          quando,
          ok: r.ok,
          motivo: r.ok ? motivo : `${motivo} — servidor respondeu ${r.status}`,
          os: numero ?? null,
        })
      })
      .catch((e) => {
        registrar({
          quando,
          ok: false,
          motivo: `${motivo} — ${String(e?.message || 'falha de rede')}`,
          os: numero ?? null,
        })
      })
  } catch (_) {
    registrar({ quando, ok: false, motivo: `${motivo} — erro local`, os: numero ?? null })
  }
}

/**
 * Aviso em lote, usado depois de gerar planilha/orcamento de varias OS de uma
 * vez. Manda uma unica requisicao (o assistente entende `os_ids`).
 */
export function avisarSincronizacaoLote(ids: string[], motivo = 'planilha gerada'): void {
  const limpos = ids.filter(Boolean)
  if (limpos.length === 0) return
  const quando = new Date().toISOString()
  try {
    void fetch(urlWebhook(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        os_id: limpos[0],
        os_ids: limpos,
        total: limpos.length,
        motivo,
      }),
      keepalive: true,
    })
      .then((r) => {
        registrar({
          quando,
          ok: r.ok,
          motivo: `${motivo} (${limpos.length} OS)` + (r.ok ? '' : ` — HTTP ${r.status}`),
        })
      })
      .catch((e) => {
        registrar({
          quando,
          ok: false,
          motivo: `${motivo} — ${String(e?.message || 'falha de rede')}`,
        })
      })
  } catch (_) {
    registrar({ quando, ok: false, motivo: `${motivo} — erro local` })
  }
}
