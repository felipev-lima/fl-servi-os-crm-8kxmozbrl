/**
 * Gera a planilha de faturamento IDÊNTICA ao modelo do Felipe
 * (TABELA_NOVA_MOSTRARIO.xlsx, aba "MODELO (2)").
 *
 * Layout:
 *   A1 "CLIENTE" + B1 nome     | F1 SUB TOTAL CAPITAL  (amarelo)  G1 =SUMIF(...)
 *   A2 CNPJ     + B2           | F2 SUB TOTAL CONSUMO  (laranja)  G2 =SUMIF(...)
 *   A3 ENDEREÇO + B3           | F3 SUB TOTAL SERVIÇO  (verde)    G3 =SUMIF(...)
 *   A4 CONTATO  + B4           | F4 SUB TOTAL DINHEIRO (vermelho) G4 =SUMIF(...)
 *   A5 E-MAIL + B5, D5 TELEFONE + E5 | F5 DÉBITO TOTAL  G5 =(G1+G2+G3+G4)
 *   A6 "⬅ VOLTAR PARA O RESUMO"
 *   Linha 7  cabeçalho azul 1F4E78, texto branco, centralizado
 *   Linha 8+ DATA | TIPO | PRODUTO / SERVIÇO | DESCRIÇÃO DETALHADA | QTD |
 *            VALOR UNIT. | VALOR TOTAL (=IF(AND(ISNUMBER(E),ISNUMBER(F)),E*F,""))
 *
 * A LINHA INTEIRA (A:G) é pintada conforme o TIPO na coluna B:
 *   CAPITAL amarelo · CONSUMO laranja · SERVICO azul · DINHEIRO vermelho
 * — aplicada direto na célula E também como formatação condicional, para
 * continuar funcionando se o Felipe trocar o TIPO na planilha dele.
 *
 * Tudo em Calibri 11.
 */
import ExcelJS from 'exceljs'
import { EMPRESA } from '@/lib/empresa'

// cores no formato ARGB com alfa OPACO (FF) — com 00 a célula fica transparente
const AZUL_CABECALHO = 'FF1F4E78'
const CINZA_CAMPO = 'FFF2F2F2'
const COR_TIPO: Record<string, string> = {
  CAPITAL: 'FFFFFF00',
  CONSUMO: 'FFF8CBAD',
  SERVICO: 'FFDDEBF7',
  DINHEIRO: 'FFFFC7CE',
}
const RESUMO: { rotulo: string; cor: string; chave: string; corTexto: string }[] = [
  { rotulo: 'SUB TOTAL CAPITAL', cor: 'FFFFFF00', chave: 'CAPITAL', corTexto: 'FF000000' },
  { rotulo: 'SUB TOTAL CONSUMO', cor: 'FFFFC000', chave: 'CONSUMO', corTexto: 'FF000000' },
  { rotulo: 'SUB TOTAL SERVIÇO', cor: 'FF92D050', chave: 'SERVICO', corTexto: 'FF0070C0' },
  { rotulo: 'SUB TOTAL DINHEIRO', cor: 'FFFF0000', chave: 'DINHEIRO', corTexto: 'FFFFFFFF' },
]

const FONTE = 'Calibri'
const TAM = 11

/** Forma mínima da validação de dados interna do exceljs (não tipada). */
interface PlanilhaValidacoes {
  add(ref: string, regra: { type: string; allowBlank: boolean; formulae: string[] }): unknown
}

const NOMES_CONSUMIVEIS = [
  'CABO',
  'CONECTOR',
  'ABRAÇADEIRA',
  'ABRACADEIRA',
  'BUCHA',
  'FITA',
  'CAIXA DE ACABAMENTO',
  'CAIXA DE PASSAGEM',
  'CANALETA',
  'ELETRODUTO',
  'TUBO',
  'CURVA',
  'LUVA',
  'ARRUELA',
  'PARAFUSO',
  'BUJÃO',
  'BUJAO',
  'TERMINAL',
  'KEYSTONE',
  'PATCH CORD',
  'PATCHCORD',
  'RABICHO',
  'ESPIRAL',
  'SILICONE',
  'COLA',
  'CONDULETE',
  'PREGO',
  'GRAMPO',
  'TAMPÃO',
  'TAMPAO',
  'FONTE DE ALIMENTAÇÃO',
  'FONTE DE ALIMENTACAO',
  'PILHA',
  'BATERIA',
]
const NOMES_CAPITAL = [
  'DVR',
  'NVR',
  'CÂMERA',
  'CAMERA',
  'CENTRAL DE ALARME',
  'SIRENE',
  'SENSOR',
  'SWITCH',
  'ROTEADOR',
  'MODEM',
  'NOBREAK',
  'ESTABILIZADOR',
  'RACK',
  'PATCH PANEL',
  'SERVIDOR',
  'MONITOR',
  'NOTEBOOK',
  'IMPRESSORA',
  'TELEFONE',
  'INTERFONE',
  'FECHADURA',
  'CANCELA',
]
const CAPITAL_CATS = [
  'CFTV',
  'ALARME',
  'RACK',
  'COMPUTADORES - NOTEBOOK',
  'IMPRESSORA',
  'ESTABILIZADOR / NOBREAK',
  'AR CONDICIONADO',
  'REFRIGERADOR',
  'FOGÃO',
  'MÓVEIS',
  'TELEFONIA / INTERFONIA',
  'AUDIO E VÍDEO',
  'ILUMINAÇÃO',
  'ACESSÓRIOS PARA COMPUTADOR',
  'ACESSÓRIOS NOTEBOOK',
  'SISTEMA OPERACIONAL',
  'ROBÓTICA',
]

export type TipoItem = 'CAPITAL' | 'CONSUMO' | 'SERVICO' | 'DINHEIRO'

const MAIUSCULA = (v: string) => String(v || '').toLocaleUpperCase('pt-BR')

/** Decide a coluna TIPO: o NOME do produto manda mais que a categoria. */
export function tipoDoItem(categoria?: string, nome?: string): 'CAPITAL' | 'CONSUMO' {
  const n = (nome || '').toUpperCase()
  const c = (categoria || '').trim()
  for (const k of NOMES_CONSUMIVEIS) if (n.includes(k)) return 'CONSUMO'
  for (const k of NOMES_CAPITAL) if (n.includes(k)) return 'CAPITAL'
  if (CAPITAL_CATS.includes(c)) return 'CAPITAL'
  return 'CONSUMO'
}

function dataBR(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('pt-BR')
}

export interface LinhaPlanilha {
  data: string
  tipo: TipoItem
  /** Coluna C: PRODUTO ou SERVIÇO */
  produtoServico: 'PRODUTO' | 'SERVIÇO'
  /** Coluna D: nome do produto / descrição do serviço, em MAIÚSCULA */
  descricao: string
  qtd: number | ''
  unit: number
}

/** Monta as linhas de uma OS (mão de obra + materiais). */
export function linhasDaOS(order: any, materiais: any[]): LinhaPlanilha[] {
  const data = dataBR(order.scheduled_date || order.completed_at || order.created)
  const num = order.order_number
  const linhas: LinhaPlanilha[] = []

  const sv = Number(order.service_value || 0)
  if (sv > 0) {
    linhas.push({
      data,
      tipo: 'SERVICO',
      produtoServico: 'SERVIÇO',
      descricao: MAIUSCULA(
        (order.description || '').trim().slice(0, 300) ||
          `SERVIÇO PRESTADO — OS ${num} ${order.service_type || ''}`,
      ),
      qtd: 1,
      unit: sv,
    })
  }

  for (const m of materiais) {
    const mat = m.expand?.material || {}
    const nome = MAIUSCULA(mat.name || 'MATERIAL')
    const cat = mat.category
    const obs = String(m.notes || '').trim()
    linhas.push({
      data,
      tipo: tipoDoItem(cat, nome),
      produtoServico: 'PRODUTO',
      // DESCRIÇÃO DETALHADA = nome do produto (+ observação do técnico)
      descricao: nome + (obs ? ` (${MAIUSCULA(obs)})` : ''),
      qtd: Number(m.quantity || 0) || '',
      unit: Number(m.unit_price || 0),
    })
  }

  return linhas
}

/** Desenha uma aba com o layout do modelo (reusada pela planilha de pedidos). */
export { montarAba }

function bordaFina(): Partial<ExcelJS.Borders> {
  const lado = { style: 'thin' as const, color: { argb: 'FF808080' } }
  return { left: lado, right: lado, top: lado, bottom: lado }
}

/** Desenha a aba com o layout do modelo. */
function montarAba(wb: ExcelJS.Workbook, titulo: string, order: any, linhas: LinhaPlanilha[]) {
  const ws = wb.addWorksheet(titulo.slice(0, 31) || 'PLANILHA')

  for (const [col, w] of [
    ['A', 15],
    ['B', 25],
    ['C', 20],
    ['D', 50],
    ['E', 15],
    ['F', 24],
    ['G', 15],
  ] as [string, number][]) {
    ws.getColumn(col).width = w
  }
  ws.getRow(1).height = 20
  ws.getRow(7).height = 32

  const cli = order.expand?.client || {}

  // ---- linha 1: CLIENTE
  ws.getCell('A1').value = 'CLIENTE'
  ws.getCell('A1').font = { name: FONTE, size: TAM, bold: true }
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
  ws.getCell('B1').value = MAIUSCULA(cli.name || '')
  ws.getCell('B1').font = { name: FONTE, size: TAM, bold: true }
  ws.getCell('B1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  // ---- linhas 2-5: dados do cliente (valor com fundo cinza e borda)
  const campos: { rot: string; celRot: string; val: string; celVal: string }[] = [
    { rot: 'CNPJ:', celRot: 'A2', val: cli.document || '', celVal: 'B2' },
    {
      rot: 'ENDEREÇO:',
      celRot: 'A3',
      val: MAIUSCULA(`${cli.address || ''} ${cli.neighborhood || ''}`.trim()),
      celVal: 'B3',
    },
    { rot: 'CONTATO:', celRot: 'A4', val: '', celVal: 'B4' },
    { rot: 'E-MAIL:', celRot: 'A5', val: cli.email || '', celVal: 'B5' },
  ]
  for (const f of campos) {
    const cr = ws.getCell(f.celRot)
    cr.value = f.rot
    cr.font = { name: FONTE, size: TAM, bold: true }
    cr.alignment = { horizontal: 'right', vertical: 'middle' }
    const cv = ws.getCell(f.celVal)
    cv.value = f.val
    cv.font = { name: FONTE, size: TAM }
    cv.alignment = { horizontal: 'left', vertical: 'middle' }
    cv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CAMPO } }
    cv.border = bordaFina()
  }

  // telefone (D5/E5)
  const dr = ws.getCell('D5')
  dr.value = 'TELEFONE:'
  dr.font = { name: FONTE, size: TAM, bold: true }
  dr.alignment = { horizontal: 'right', vertical: 'middle' }
  const ev = ws.getCell('E5')
  ev.value = cli.phone || ''
  ev.font = { name: FONTE, size: TAM }
  ev.alignment = { horizontal: 'left', vertical: 'middle' }
  ev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CAMPO } }
  ev.border = bordaFina()

  // linha 6
  ws.getCell('A6').value = '⬅ VOLTAR PARA O RESUMO'
  ws.getCell('A6').font = { name: FONTE, size: TAM, bold: true }

  // ---- resumo F1..F5 e G1..G5 (fórmulas do modelo)
  RESUMO.forEach((r, i) => {
    const linha = i + 1
    const cf = ws.getCell(`F${linha}`)
    cf.value = r.rotulo
    cf.font = { name: FONTE, size: TAM, bold: true, color: { argb: r.corTexto } }
    cf.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.cor } }
    cf.alignment = { horizontal: 'right', vertical: 'middle' }

    const cg = ws.getCell(`G${linha}`)
    cg.value = { formula: `SUMIF(B$8:B$500,"${r.chave}",G$8:G$500)` } as any
    cg.numFmt = '"R$" #,##0.00'
    cg.font = { name: FONTE, size: TAM, bold: true }
    cg.border = bordaFina()
  })

  const f5 = ws.getCell('F5')
  f5.value = 'DÉBITO TOTAL'
  f5.font = { name: FONTE, size: TAM, bold: true }
  f5.alignment = { horizontal: 'center', vertical: 'middle' }
  const g5 = ws.getCell('G5')
  g5.value = { formula: '(G1+G2+G3+G4)' } as any
  g5.numFmt = '"R$" #,##0.00'
  g5.font = { name: FONTE, size: TAM, bold: true }
  g5.border = bordaFina()

  // ---- cabeçalho da tabela (linha 7)
  const cab = [
    'DATA',
    'TIPO',
    'PRODUTO / SERVIÇO',
    'DESCRIÇÃO DETALHADA',
    'QTD',
    'VALOR UNIT. (R$)',
    'VALOR TOTAL DO ITEM (R$)',
  ]
  cab.forEach((t, j) => {
    const c = ws.getCell(7, j + 1)
    c.value = t
    c.font = { name: FONTE, size: TAM, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CABECALHO } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = bordaFina()
  })

  // ---- itens (linha 8 em diante)
  const TOTAL_LINHAS = Math.max(60, 8 + linhas.length)
  let r = 8
  for (let i = 0; i < TOTAL_LINHAS - 8; i++) {
    const li = linhas[i]
    if (li) {
      ws.getCell(r, 1).value = li.data
      ws.getCell(r, 2).value = li.tipo
      ws.getCell(r, 3).value = li.produtoServico
      ws.getCell(r, 4).value = li.descricao
      ws.getCell(r, 5).value = li.qtd === '' ? null : li.qtd
      ws.getCell(r, 6).value = li.unit
    }
    // valor total sempre como fórmula, igual ao modelo
    ws.getCell(r, 7).value = {
      formula: `IF(AND(ISNUMBER(E${r}),ISNUMBER(F${r})),E${r}*F${r},"")`,
    } as any

    const cor = li ? COR_TIPO[li.tipo] : undefined
    for (let j = 1; j <= 7; j++) {
      const c = ws.getCell(r, j)
      c.font = { name: FONTE, size: TAM }
      c.border = bordaFina()
      c.alignment = {
        horizontal: j === 4 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      }
      if (cor) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }
      }
    }
    ws.getCell(r, 6).numFmt = '"R$" #,##0.00'
    ws.getCell(r, 7).numFmt = '"R$" #,##0.00'
    ws.getRow(r).height = 16
    r++
  }

  // ---- formatação condicional: repinta a linha se o TIPO mudar na planilha
  ws.addConditionalFormatting({
    ref: 'A8:G1000',
    rules: Object.entries(COR_TIPO).map(([chave, cor]) => ({
      type: 'expression' as const,
      formulae: [`$B8="${chave}"`],
      priority: 1,
      style: {
        fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: cor } },
      },
    })),
  })

  // ---- listas suspensas (como no modelo do Felipe)
  // `dataValidations` não existe no tipo do exceljs: a validação de dados é um
  // atributo interno da planilha (mesma forma que o próprio exceljs grava no
  // xlsx). O cast mantém a checagem do resto do objeto.
  const validacoes = (ws as unknown as { dataValidations: PlanilhaValidacoes }).dataValidations
  validacoes.add('B8:B1000', {
    type: 'list',
    allowBlank: true,
    formulae: ['"CAPITAL,CONSUMO,SERVICO,DINHEIRO"'],
  })
  validacoes.add('C8:C1000', {
    type: 'list',
    allowBlank: true,
    formulae: ['"PRODUTO,SERVIÇO"'],
  })

  ws.views = [{ state: 'frozen', ySplit: 7 }]
  return ws
}

/** Gera o arquivo .xlsx e devolve como Blob. */
export async function gerarPlanilhaOrcamento(
  ordens: { order: any; materiais: any[] }[],
): Promise<{ blob: Blob; nome: string }> {
  const wb = new ExcelJS.Workbook()
  wb.creator = EMPRESA.razao_social

  for (const { order, materiais } of ordens) {
    const linhas = linhasDaOS(order, materiais)
    const cli = order.expand?.client?.name || 'CLIENTE'
    montarAba(wb, `OS ${order.order_number} - ${cli}`, order, linhas)
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  let nome: string
  if (ordens.length === 1) {
    const o = ordens[0].order
    const cli = (o.expand?.client?.name || 'CLIENTE')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    nome = `ORCAMENTO-OS-${o.order_number} - ${cli}.xlsx`
  } else {
    nome = `ORCAMENTOS-${new Date().toISOString().slice(0, 10)}.xlsx`
  }

  return { blob, nome }
}

/** Entrega o arquivo: menu do celular ou download no computador. */
export async function entregarPlanilha(blob: Blob, nome: string): Promise<void> {
  const file = new File([blob], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nav = navigator as any
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: nome })
      return
    } catch (err: any) {
      if (err?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
