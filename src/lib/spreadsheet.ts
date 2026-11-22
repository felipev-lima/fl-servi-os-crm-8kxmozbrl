import * as XLSX from 'xlsx'

// Tipos
export interface ImportRow {
  line: number // linha real na planilha (2 = primeira linha de dados)
  name: string
  phone: string
  email: string
  document: string
  type: string
  address: string
  neighborhood: string
  city: string
  zipCode: string
  addressNumber: string
  state: string
  ie: string
  notes: string
}

export interface InvalidRow {
  line: number
  reason: string
  name: string // para exibir na prévia
}

export interface ParsedSpreadsheet {
  rows: ImportRow[]
  invalid: InvalidRow[]
  headersFound: string[]
  headersMissing: string[]
  headerLine: number // linha (1-based) onde o cabeçalho foi detectado
  headerCell: string // título exato da coluna "Nome" detectado
}

// Normaliza texto de célula: trim, colapsa espaços
function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

// Normaliza texto sem acento, minúsculas — para comparações
function normalizeText(value: unknown): string {
  return cleanCell(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Verifica se a cidade/UF da linha corresponde a Macaé - RJ.
// Aceita a UF escrita junto da cidade ("Macaé/RJ", "Macaé - RJ", "Macaé RJ")
// e exige o nome da cidade exato: "Macaé dos Gatos" NÃO é Macaé.
export function isMacaeRJ(city: string, state: string): boolean {
  const c = normalizeText(city)
    .replace(/\s*[-/]\s*[a-z]{2}$/, '') // "macae/rj", "macae - rj"
    .replace(/\s+[a-z]{2}$/, '') // "macae rj"
    .trim()
  const s = normalizeText(state)
  const cityOk = c === 'macae'
  const stateOk = s === '' || s === 'rj'
  return cityOk && stateOk
}

// True quando a linha não traz cidade nenhuma (não dá para afirmar que é de Macaé)
export function isCityMissing(city: string): boolean {
  return normalizeText(city) === ''
}

// Normaliza cabeçalho: minúsculas, sem acentos, sem espaços/pontuação
function normalizeHeader(value: unknown): string {
  return cleanCell(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Aliases aceitos para cada coluna (normalizados automaticamente)
const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    'nome',
    'nomeourazao',
    'razaosocial',
    'clientenome',
    'cliente',
    'nomedecliente',
    'nomerazaosocial',
    'nomedocliente',
    'nomefantasia',
    'razao',
  ],
  phone: ['telefone', 'fone', 'celular', 'whatsapp', 'tel', 'telefonecontato'],
  email: ['email', 'emai', 'emaildocliente', 'emailcontato', 'correioeletronico'],
  document: ['cnpj', 'cpf', 'cnpjcpf', 'cpfj', 'documento', 'cpfcnpj', 'doccpfcnpj'],
  type: [
    'tipo',
    'tipocliente',
    'tipopessoa',
    'pfpj',
    'pessoafisicajuridica',
    'tipopjpf',
    'pjpj',
    'tipopessoa',
  ],
  address: ['endereco', 'rua', 'logradouro', 'enderecoCompleto'.toLowerCase()],
  neighborhood: ['bairro'],
  city: ['cidade', 'municipio', 'cid'],
  zipCode: ['cep'],
  addressNumber: ['num', 'numero', 'número', 'numendereço', 'numeroendereco'],
  state: ['uf', 'estado'],
  ie: ['ie', 'inscricaoestadual', 'inscricaostadual', 'ieinscricao'],
  notes: ['observacoes', 'obs', 'observacao', 'notas', 'complemento'],
}

const FIELD_BY_HEADER: Record<string, string> = {}
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) {
    FIELD_BY_HEADER[normalizeHeader(alias)] = field
  }
}

// Reconhecimento por aproximação: cobre títulos livres como "Nome / Razão Social",
// "Tipo (PJ/PF)", "E-mail do contato", "CNPJ ou CPF".
function guessFieldFromHeader(raw: string): string | null {
  const h = normalizeHeader(raw)
  if (!h) return null
  if (/cnpj|cpf|documento/.test(h)) return 'document'
  if (/nome|razao|cliente|fantasia/.test(h)) return 'name'
  if (/email|correio/.test(h)) return 'email'
  if (/telefone|fone|celular|whatsapp|tel\b/.test(h)) return 'phone'
  if (/tipo|pessoa|pfpj/.test(h)) return 'type'
  if (/inscricao|[^a-z]ie$|^ie$/.test(h)) return 'ie'
  if (/cep/.test(h)) return 'zipCode'
  if (/^num|^numero$/.test(h)) return 'addressNumber'
  if (/^uf$|^estado$/.test(h)) return 'state'
  if (/bairro/.test(h)) return 'neighborhood'
  if (/cidade|municipio/.test(h)) return 'city'
  if (/endereco|rua|logradouro/.test(h)) return 'address'
  if (/observacao|obs|nota|complemento|acesso/.test(h)) return 'notes'
  return null
}

const REQUIRED_FIELDS = ['name']
const ALL_FIELDS = [
  'name',
  'phone',
  'email',
  'document',
  'type',
  'address',
  'neighborhood',
  'city',
  'zipCode',
  'addressNumber',
  'state',
  'ie',
  'notes',
]
export const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  document: 'CNPJ/CPF',
  type: 'Tipo',
  address: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
  zipCode: 'CEP',
  addressNumber: 'Num',
  state: 'UF',
  ie: 'IE',
  notes: 'Observações',
}

// Aceita PJ/PF e variantes escritas por extenso
export function normalizeClientType(raw: string): 'PJ' | 'PF' {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (['pf', 'pessoa fisica', 'fisica', 'cpf'].includes(v)) return 'PF'
  return 'PJ'
}

// Lê o arquivo (xlsx/xls/csv) e devolve a matriz de linhas
async function readFileMatrix(file: File): Promise<unknown[][]> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('A planilha está vazia.')
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })
}

// Valida uma linha. Retorna lista de motivos de erro (vazio = válida).
function validateRow(row: ImportRow): string[] {
  const reasons: string[] = []
  if (!row.name) reasons.push('nome vazio')
  if (row.name.length > 200) reasons.push('nome muito longo (máx. 200 caracteres)')
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) reasons.push('e-mail inválido')
  return reasons
}

// Procura a linha de cabeçalho: a primeira que tem ao menos 3 colunas reconhecidas,
// incluindo a de nome. Relatórios exportados de outros sistemas trazem endereço,
// telefone e título ("Relação de Clientes") ANTES do cabeçalho real.
function findHeaderRow(matrix: unknown[][]): number {
  let fallback = -1 // primeira linha com >= 2 reconhecidas (sem nome)
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    let mapped = 0
    let hasName = false
    let seen: string[] = []
    const cells = matrix[i] || []
    for (const cell of cells) {
      const field = FIELD_BY_HEADER[normalizeHeader(cell)] || guessFieldFromHeader(cleanCell(cell))
      if (field && !seen.includes(field)) {
        seen.push(field)
        mapped++
        if (field === 'name') hasName = true
      }
    }
    if (hasName && mapped >= 3) return i
    if (fallback === -1 && mapped >= 2) fallback = i
  }
  return fallback
}

// Mapeia a matriz de linhas para objetos, valida e separa válidas/inválidas
export async function parseClientSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const matrix = await readFileMatrix(file)

  if (matrix.length === 0) throw new Error('A planilha está vazia.')

  // Cabeçalho: detectado em qualquer linha (relatórios trazem linhas institucionais antes)
  const headerIdx = findHeaderRow(matrix)
  if (headerIdx === -1) {
    throw new Error(
      'Não foi possível identificar a linha de cabeçalho. Verifique se a planilha tem os títulos (nome, telefone, endereço, bairro, cidade, UF, CEP) em alguma linha.',
    )
  }
  const headerRow = matrix[headerIdx]
  const headerMap: Record<number, string> = {} // índice da coluna -> campo
  const headersFound: string[] = []
  const headersMissing: string[] = []
  let headerCell = ''

  headerRow.forEach((cell, idx) => {
    const field = FIELD_BY_HEADER[normalizeHeader(cell)] || guessFieldFromHeader(cleanCell(cell))
    if (field && !Object.values(headerMap).includes(field)) {
      headerMap[idx] = field
      headersFound.push(FIELD_LABELS[field])
      if (field === 'name' && !headerCell) headerCell = cleanCell(cell)
    }
  })

  for (const field of ALL_FIELDS) {
    if (!Object.values(headerMap).includes(field)) {
      headersMissing.push(FIELD_LABELS[field])
    }
  }

  if (!REQUIRED_FIELDS.every((f) => Object.values(headerMap).includes(f))) {
    throw new Error(
      'A coluna "Nome" é obrigatória na planilha (aceita: nome, razão social, nome ou razão).',
    )
  }

  const rows: ImportRow[] = []
  const invalid: InvalidRow[] = []

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const excelLine = i + 1
    const raw = matrix[i]
    const row: ImportRow = {
      line: excelLine,
      name: '',
      phone: '',
      email: '',
      document: '',
      type: 'PJ',
      address: '',
      neighborhood: '',
      city: '',
      zipCode: '',
      addressNumber: '',
      state: '',
      ie: '',
      notes: '',
    }

    const mutable = row as unknown as Record<string, string>
    for (const [colIdxStr, field] of Object.entries(headerMap)) {
      mutable[field] = cleanCell(raw[Number(colIdxStr)])
    }

    // Padrão do cadastro LM SERVIÇOS: nome, endereço, bairro e cidade em MAIÚSCULAS
    for (const campo of ['name', 'address', 'neighborhood', 'city']) {
      if (mutable[campo]) mutable[campo] = mutable[campo].toUpperCase()
    }

    // Linha totalmente vazia -> ignora silenciosamente
    if (ALL_FIELDS.every((f) => !mutable[f])) continue

    row.type = normalizeClientType(row.type)

    const reasons = validateRow(row)
    if (reasons.length > 0) {
      invalid.push({ line: excelLine, reason: reasons.join('; '), name: row.name || '(sem nome)' })
    } else {
      rows.push(row)
    }
  }

  return { rows, invalid, headersFound, headersMissing, headerLine: headerIdx + 1, headerCell }
}

// ==============================
// Técnicos
// ==============================

export interface TechnicianImportRow {
  line: number // linha real na planilha (2 = primeira linha de dados)
  name: string
  phone: string
  email: string
  roleTitle: string
  specialties: string
  active: boolean
  activeRaw: string // valor original da coluna de situação, para exibir na prévia
}

export interface ParsedTechnicianSpreadsheet {
  rows: TechnicianImportRow[]
  invalid: InvalidRow[]
  headersFound: string[]
  headersMissing: string[]
}

// Aliases aceitos para colunas de técnicos
const TECHNICIAN_COLUMN_ALIASES: Record<string, string[]> = {
  name: ['nome', 'tecnico', 'nomedotecnico', 'nomecompleto', 'nomedoequipe'],
  phone: ['telefone', 'fone', 'celular', 'whatsapp', 'tel'],
  email: ['email', 'emailcorporativo', 'emaildotecnico'],
  roleTitle: ['funcao', 'funcaocargo', 'cargo'],
  specialties: ['especialidades', 'especialidade', 'certificacoes'],
  active: ['situacao', 'ativo', 'status'],
}

const TECH_FIELD_BY_HEADER: Record<string, string> = {}
for (const [field, aliases] of Object.entries(TECHNICIAN_COLUMN_ALIASES)) {
  for (const alias of aliases) {
    TECH_FIELD_BY_HEADER[normalizeHeader(alias)] = field
  }
}

const TECH_ALL_FIELDS = ['name', 'phone', 'email', 'roleTitle', 'specialties', 'active']

export const TECHNICIAN_FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  roleTitle: 'Função',
  specialties: 'Especialidades',
  active: 'Situação',
}

// Interpreta a coluna de situação/ativo (case-insensitive). Vazio = ativo.
export function parseActiveFlag(raw: string): boolean {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!v) return true
  if (['inativo', 'nao', 'n', 'false', 'f', '0', 'afastado', 'desligado', 'suspenso'].includes(v))
    return false
  return true
}

// Valida uma linha de técnico. Retorna lista de motivos de erro (vazio = válida).
function validateTechnicianRow(row: TechnicianImportRow): string[] {
  const reasons: string[] = []
  if (!row.name) reasons.push('nome vazio')
  if (row.name.length > 200) reasons.push('nome muito longo (máx. 200 caracteres)')
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) reasons.push('e-mail inválido')
  return reasons
}

// Lê e valida a planilha de técnicos
export async function parseTechnicianSpreadsheet(file: File): Promise<ParsedTechnicianSpreadsheet> {
  const matrix = await readFileMatrix(file)

  if (matrix.length === 0) throw new Error('A planilha está vazia.')

  const headerRow = matrix[0]
  const headerMap: Record<number, string> = {}
  const headersFound: string[] = []
  const headersMissing: string[] = []

  headerRow.forEach((cell, idx) => {
    const field = TECH_FIELD_BY_HEADER[normalizeHeader(cell)]
    if (field && !Object.values(headerMap).includes(field)) {
      headerMap[idx] = field
      headersFound.push(TECHNICIAN_FIELD_LABELS[field])
    }
  })

  for (const field of TECH_ALL_FIELDS) {
    if (!Object.values(headerMap).includes(field)) {
      headersMissing.push(TECHNICIAN_FIELD_LABELS[field])
    }
  }

  if (Object.keys(headerMap).length === 0) {
    throw new Error(
      'Não foi possível identificar as colunas. Verifique se a primeira linha tem os títulos (nome, telefone, e-mail, função, especialidades, situação).',
    )
  }

  if (!Object.values(headerMap).includes('name')) {
    throw new Error('A coluna "Nome" é obrigatória na planilha (aceita: nome, técnico).')
  }

  const rows: TechnicianImportRow[] = []
  const invalid: InvalidRow[] = []

  for (let i = 1; i < matrix.length; i++) {
    const excelLine = i + 1
    const raw = matrix[i]
    const row: TechnicianImportRow = {
      line: excelLine,
      name: '',
      phone: '',
      email: '',
      roleTitle: '',
      specialties: '',
      active: true,
      activeRaw: '',
    }

    const mutable = row as unknown as Record<string, string>
    for (const [colIdxStr, field] of Object.entries(headerMap)) {
      mutable[field] = cleanCell(raw[Number(colIdxStr)])
    }

    // Linha totalmente vazia -> ignora silenciosamente
    if (TECH_ALL_FIELDS.every((f) => !mutable[f])) continue

    row.active = parseActiveFlag(row.activeRaw)

    const reasons = validateTechnicianRow(row)
    if (reasons.length > 0) {
      invalid.push({ line: excelLine, reason: reasons.join('; '), name: row.name || '(sem nome)' })
    } else {
      rows.push(row)
    }
  }

  return { rows, invalid, headersFound, headersMissing }
}
