/**
 * PLANILHA DO GOOGLE — gravação dos lançamentos no Sheets do Felipe.
 *
 * PEDIDO (27/11/2026): "crie uma planilha no Drive do Felipe com as abas de
 * Lançamentos e Contas a Receber, grave os dados e mantenha sincronizado."
 *
 * COMO FUNCIONA: usa o conector `googlesheets` do próprio CRM, através do
 * helper `execute()` de `@/lib/skipConnectors`. Quem executa é o navegador de
 * um usuário ADMIN — não o servidor — porque o conector é por usuário.
 *
 * DECISÕES QUE CUSTARAM CARO E NÃO DEVEM SER DESFEITAS:
 *
 * 1. ESCREVE EM BLOCO, NÃO LINHA A LINHA. Com 1.000+ lançamentos, uma chamada
 *    por linha seriam 1.000 requisições e o navegador travaria. Usa
 *    GOOGLESHEETS_BATCH_UPDATE com todas as linhas de uma vez.
 *
 * 2. APAGA A ABA E RECRIA O CONTEÚDO. Sincronizar "por diferença" numa
 *    planilha que o usuário pode editar à mão é armadilha: a linha muda de
 *    posição e a comparação erra. Aqui o conteúdo da aba é reescrito inteiro,
 *    sempre — a planilha é ESPELHO do CRM, não fonte.
 *
 * 3. NOMES DAS ABAS SÃO FIXOS ('Lancamentos' e 'Contas a Receber'). Renomear
 *    a aba no Google quebra a gravação e a mensagem de erro não seria óbvia.
 *
 * 4. O VALOR VAI COMO NÚMERO (value_input_option USER_ENTERED), senão o Sheets
 *    guarda texto e as SOMAS da planilha não funcionam — que é justamente para
 *    o que o Felipe usa a planilha.
 */
import { execute } from '@/lib/skipConnectors'
import pb from '@/lib/pocketbase/client'

export const ABA_LANCAMENTOS = 'Lancamentos'
export const ABA_CONTAS = 'Contas a Receber'

/** Linhas por requisição: o Sheets aceita lotes grandes, mas o conector tem
 *  limite de tamanho de payload. 400 linhas × 10 colunas cabe com folga. */
const BLOCO = 400

export interface ConfigPlanilha {
  id: string
  url: string
  status: string
  sincronizadoEm: string
  linhas: string
  erro: string
  registroId: string
}

/** Lê a configuração da planilha no registro único de `settings`. */
export async function lerConfigPlanilha(): Promise<ConfigPlanilha | null> {
  try {
    const lista = await pb.collection('settings').getList(1, 1)
    const r = lista.items[0] as Record<string, unknown> | undefined
    if (!r) return null
    return {
      id: String(r.gsheets_id || ''),
      url: String(r.gsheets_url || ''),
      status: String(r.gsheets_status || 'PENDENTE'),
      sincronizadoEm: String(r.gsheets_sincronizado_em || ''),
      linhas: String(r.gsheets_linhas || ''),
      erro: String(r.gsheets_erro || ''),
      registroId: String(r.id),
    }
  } catch {
    return null
  }
}

/** Salva o resultado da sincronização (ou o erro) na configuração. */
async function salvarEstado(
  registroId: string,
  dados: {
    id?: string
    url?: string
    status?: string
    linhas?: string
    erro?: string
  },
) {
  const corpo: Record<string, unknown> = {}
  if (dados.id !== undefined) corpo.gsheets_id = dados.id
  if (dados.url !== undefined) corpo.gsheets_url = dados.url
  if (dados.status !== undefined) corpo.gsheets_status = dados.status
  if (dados.linhas !== undefined) corpo.gsheets_linhas = dados.linhas
  if (dados.erro !== undefined) corpo.gsheets_erro = dados.erro
  corpo.gsheets_sincronizado_em = new Date().toISOString()
  try {
    await pb.collection('settings').update(registroId, corpo)
  } catch {
    /* configuração não pode derrubar a sincronização */
  }
}

/** Cria uma planilha nova no Drive do usuário e devolve id e link. */
export async function criarPlanilha(): Promise<{ id: string; url: string }> {
  const r = await execute('GOOGLESHEETS_CREATE_GOOGLE_SHEET1', {
    title: 'FL SERVICOS CRM - FINANCEIRO',
  })
  if (!r.successful) {
    throw new Error(r.error || 'Não foi possível criar a planilha no Google.')
  }
  const dados = r.data as { spreadsheetId?: string; spreadsheetUrl?: string } | null
  if (!dados?.spreadsheetId) {
    throw new Error('O Google não devolveu o id da planilha criada.')
  }
  return {
    id: dados.spreadsheetId,
    url:
      dados.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${dados.spreadsheetId}/edit`,
  }
}

/** Quais abas a planilha tem hoje. */
export async function abasDaPlanilha(spreadsheetId: string): Promise<string[]> {
  const r = await execute('GOOGLESHEETS_GET_SPREADSHEET_INFO', {
    spreadsheet_id: spreadsheetId,
  })
  if (!r.successful) {
    throw new Error(r.error || 'Não consegui ler a planilha. Confira o link e a permissão.')
  }
  const dados = r.data as { sheets?: { properties?: { title?: string } }[] } | null
  return (dados?.sheets || []).map((s) => s?.properties?.title || '').filter(Boolean)
}

/** Cria a aba se ela ainda não existir. */
async function garantirAba(spreadsheetId: string, nome: string): Promise<void> {
  const existentes = await abasDaPlanilha(spreadsheetId)
  if (existentes.includes(nome)) return
  const r = await execute('GOOGLESHEETS_ADD_SHEET', {
    spreadsheet_id: spreadsheetId,
    sheet_name: nome,
  })
  if (!r.successful) {
    throw new Error(r.error || `Não consegui criar a aba "${nome}".`)
  }
}

/**
 * Escreve uma matriz de linhas numa aba, em blocos.
 * Devolve quantas linhas foram escritas.
 */
async function escrever(
  spreadsheetId: string,
  aba: string,
  linhas: (string | number)[][],
): Promise<number> {
  if (linhas.length === 0) return 0

  // limpa o que existia (a planilha é espelho: não pode sobrar linha velha)
  await execute('GOOGLESHEETS_BATCH_UPDATE', {
    spreadsheet_id: spreadsheetId,
    sheet_name: aba,
    values: [['']],
    range: `${aba}!A1:Z10000`,
    value_input_option: 'USER_ENTERED',
  })

  let escritas = 0
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const fatia = linhas.slice(i, i + BLOCO)
    const r = await execute('GOOGLESHEETS_BATCH_UPDATE', {
      spreadsheet_id: spreadsheetId,
      sheet_name: aba,
      values: fatia,
      // USER_ENTERED faz o Sheets interpretar número como número, e não texto
      value_input_option: 'USER_ENTERED',
    })
    if (!r.successful) {
      throw new Error(r.error || `Falha ao gravar na aba "${aba}" (linha ${i + 1}).`)
    }
    escritas += fatia.length
  }
  return escritas
}

export interface ResultadoSincronizacao {
  ok: boolean
  mensagem: string
  linhasLancamentos?: number
  linhasContas?: number
}

/**
 * Sincroniza o financeiro inteiro na planilha do Google.
 *
 * Lê os dados pela rota `/backend/v1/planilha-financeira` (a mesma que alimenta
 * o backup no OneDrive) — assim o número da planilha do Google é SEMPRE igual
 * ao do backup, sem duas lógicas de cálculo para divergir.
 */
export async function sincronizarPlanilha(): Promise<ResultadoSincronizacao> {
  const cfg = await lerConfigPlanilha()
  if (!cfg) throw new Error('Não consegui ler a configuração da planilha.')
  if (!cfg.id) throw new Error('Nenhuma planilha configurada. Crie uma primeiro.')

  try {
    const dados = (await pb.send('/backend/v1/planilha-financeira', {
      method: 'GET',
    })) as {
      lancamentos: {
        data: string
        cliente: string
        apelido: string
        kind: string
        item_type: string
        descricao: string
        qtd: number
        unitario: number
        legacy_row: string
      }[]
      clientes: {
        nome: string
        apelido: string
        documento: string
        servico: number
        consumo: number
        capital: number
        saldo: number
        lancamentos: number
      }[]
      historicos_quantidade: number
      total_geral: number
    }

    // ---------- aba Lançamentos ----------
    const cabLanc: (string | number)[][] = [
      [
        'Data',
        'Cliente',
        'Apelido',
        'Tipo',
        'Classificação',
        'Descrição',
        'Qtd',
        'Valor Unitário',
        'Total',
        'Origem',
      ],
    ]
    let soma = 0
    for (const l of dados.lancamentos) {
      const q = Number(l.qtd || 0)
      const u = Number(l.unitario || 0)
      const total = Math.round(q * u * 100) / 100
      soma += total
      cabLanc.push([
        l.data,
        l.cliente,
        l.apelido || '',
        l.kind,
        l.item_type || '',
        l.descricao,
        q,
        u,
        total,
        l.legacy_row || '',
      ])
    }
    // linha de total, igual à planilha original do Felipe
    cabLanc.push(['', '', '', '', '', 'TOTAL', '', '', Math.round(soma * 100) / 100, ''])

    await garantirAba(cfg.id, ABA_LANCAMENTOS)
    const nLanc = await escrever(cfg.id, ABA_LANCAMENTOS, cabLanc)

    // ---------- aba Contas a Receber ----------
    const cabContas: (string | number)[][] = [
      [
        'Cliente',
        'Apelido',
        'Documento',
        'Serviço',
        'Consumo',
        'Capital',
        'Saldo Devedor',
        'Lançamentos',
      ],
    ]
    const devedores = dados.clientes
      .filter((c) => Number(c.saldo || 0) > 0.005)
      .sort((a, b) => Number(b.saldo) - Number(a.saldo))
    let totalDevido = 0
    for (const c of devedores) {
      const s = Number(c.saldo || 0)
      totalDevido += s
      cabContas.push([
        c.nome,
        c.apelido || '',
        c.documento || '',
        Number(c.servico || 0),
        Number(c.consumo || 0),
        Number(c.capital || 0),
        Math.round(s * 100) / 100,
        Number(c.lancamentos || 0),
      ])
    }
    cabContas.push(['TOTAL', '', '', '', '', '', Math.round(totalDevido * 100) / 100, ''])

    await garantirAba(cfg.id, ABA_CONTAS)
    const nContas = await escrever(cfg.id, ABA_CONTAS, cabContas)

    await salvarEstado(cfg.registroId, {
      status: 'SINCRONIZADO',
      linhas: `${nLanc - 2} lançamentos · ${nContas - 2} devedores`,
      erro: '',
    })

    return {
      ok: true,
      mensagem: `${nLanc - 2} lançamentos e ${nContas - 2} devedores gravados na planilha.`,
      linhasLancamentos: nLanc - 2,
      linhasContas: nContas - 2,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await salvarEstado(cfg.registroId, { status: 'ERRO', erro: msg.slice(0, 500) })
    throw e
  }
}

/** Aponta o CRM para uma planilha que já existe (id ou link completo). */
export async function apontarPlanilha(idOuLink: string): Promise<{ id: string; url: string }> {
  const cfg = await lerConfigPlanilha()
  if (!cfg) throw new Error('Não consegui ler a configuração.')

  // aceita o link inteiro: o Id vive entre /d/ e /
  const m = idOuLink.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
  const id = m ? m[1] : idOuLink.trim()
  if (!id) throw new Error('Informe o link ou o id da planilha.')

  // confere se a planilha existe e é acessível ANTES de gravar a configuração
  await abasDaPlanilha(id)

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`
  await salvarEstado(cfg.registroId, { id, url, status: 'CONFIGURADA', erro: '' })
  return { id, url }
}

/** Grava id e link depois de criar a planilha. */
export async function registrarPlanilhaCriada(id: string, url: string): Promise<void> {
  const cfg = await lerConfigPlanilha()
  if (!cfg) throw new Error('Não consegui ler a configuração.')
  await salvarEstado(cfg.registroId, { id, url, status: 'CONFIGURADA', erro: '' })
}
