import React, { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import * as XLSX from 'xlsx'
import {
  ImportRow,
  InvalidRow,
  parseClientSpreadsheet,
  isMacaeRJ,
  isCityMissing,
} from '@/lib/spreadsheet'
import pb from '@/lib/pocketbase/client'
import { Client } from '@/types/flservicos'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
  MapPinOff,
} from 'lucide-react'

interface ClientImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingClients: Client[]
  onImported: () => void
}

type Step = 'select' | 'preview' | 'done'

interface ImportResult {
  imported: number
  skipped: { line: number; reason: string; name: string }[]
}

// Rotula o tipo do cliente a partir do documento (CPF = PF, senão PJ)
function clientTypeOf(document: string): 'PF' | 'PJ' {
  const digits = document.replace(/\D/g, '')
  if (digits.length === 11) return 'PF'
  return 'PJ'
}

export default function ClientImportDialog({
  open,
  onOpenChange,
  existingClients,
  onImported,
}: ClientImportDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [invalid, setInvalid] = useState<InvalidRow[]>([])
  const [headerInfo, setHeaderInfo] = useState<string>('')
  const [onlyMacae, setOnlyMacae] = useState(true)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('select')
    setFile(null)
    setRows([])
    setInvalid([])
    setHeaderInfo('')
    setResult(null)
    setOnlyMacae(true)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'Nome / Razão Social',
        'Tipo (PJ/PF)',
        'CNPJ / CPF',
        'Telefone',
        'E-mail',
        'Endereço',
        'Bairro',
        'Cidade',
        'UF',
        'CEP',
        'Observações',
      ],
      [
        'PetroMacaé Engenharia e Serviços',
        'PJ',
        '12.345.678/0001-90',
        '(22) 99999-9999',
        'contato@petromacae.com.br',
        'Av. Nossa Senhora da Glória',
        'Imbetiba',
        'Macaé',
        'RJ',
        '27.912-000',
        'Exige EPI completo e crachá na portaria',
      ],
      [
        'João da Silva (condomínio)',
        'PF',
        '123.456.789-00',
        '(22) 98888-8888',
        '',
        'Rua X',
        'Centro',
        'Macaé',
        'RJ',
        '',
        '',
      ],
    ])
    ws['!cols'] = [
      { wch: 38 },
      { wch: 12 },
      { wch: 22 },
      { wch: 18 },
      { wch: 28 },
      { wch: 36 },
      { wch: 20 },
      { wch: 16 },
      { wch: 6 },
      { wch: 12 },
      { wch: 38 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'modelo-clientes-fl-servicos.xlsx')
    toast.success('Modelo baixado. Preencha e importe de volta aqui.')
  }

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    setParsing(true)
    setFile(f)
    try {
      const parsed = await parseClientSpreadsheet(f)
      setRows(parsed.rows)
      setInvalid(parsed.invalid)
      setHeaderInfo(parsed.headerLine > 1 ? `linha ${parsed.headerLine} da planilha` : '')
      setStep('preview')
      if (parsed.rows.length === 0 && parsed.invalid.length === 0) {
        toast.error('Nenhuma linha de dados encontrada na planilha.')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao ler a planilha.')
      reset()
    } finally {
      setParsing(false)
    }
  }

  // Chave de duplicidade: nome + telefone, normalizados
  const dedupeKey = (name: string, phone: string) =>
    `${name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()}|${phone.replace(/\D/g, '')}`

  // Duplicados já existentes no sistema (nome+telefone)
  const existingKeys = new Set(existingClients.map((c) => dedupeKey(c.name || '', c.phone || '')))
  const seenInFile = new Set<string>()
  const duplicateRows: Record<number, string> = {}
  const toImport: ImportRow[] = []
  const outOfMacae: ImportRow[] = []

  // Linhas sem cidade: não dá para provar que são de Macaé
  const semCidade = rows.filter((row) => isCityMissing(row.city))

  // 1º passe: separa fora de Macaé-RJ (quando o filtro está ligado)
  for (const row of rows) {
    if (onlyMacae && !isMacaeRJ(row.city, row.state)) {
      outOfMacae.push(row)
    } else {
      toImport.push(row)
    }
  }

  // 2º passe: dedupe por nome+telefone dentro do que vai entrar
  // (linhas sem nome nenhum não participam do dedupe — já são inválidas de qualquer forma)
  const dedupedToImport: ImportRow[] = []
  for (const row of toImport) {
    const key = dedupeKey(row.name, row.phone)
    if (key === '|') {
      dedupedToImport.push(row)
      continue
    }
    if (existingKeys.has(key)) {
      duplicateRows[row.line] = 'já existe cliente com mesmo nome e telefone'
    } else if (seenInFile.has(key)) {
      duplicateRows[row.line] = 'repetido na própria planilha'
    } else {
      seenInFile.add(key)
      dedupedToImport.push(row)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    const skipped: ImportResult['skipped'] = [
      ...invalid.map((i) => ({ line: i.line, reason: i.reason, name: i.name })),
      ...outOfMacae.map((r) => ({
        line: r.line,
        reason: 'fora de Macaé - RJ (filtro ativo)',
        name: r.name,
      })),
    ]
    for (const [line, reason] of Object.entries(duplicateRows)) {
      const row = rows.find((r) => r.line === Number(line))
      skipped.push({ line: Number(line), reason, name: row?.name || '(sem nome)' })
    }

    let imported = 0
    try {
      for (const row of dedupedToImport) {
        try {
          // Monta payload com os campos que a coleção clients aceita
          const payload: Record<string, string> = {
            name: row.name,
            type: clientTypeOf(row.document),
            document: row.document || '',
            phone: row.phone || '',
            email: row.email || '',
            address: [row.address, row.addressNumber].filter(Boolean).join(', ').trim(),
            neighborhood: row.neighborhood || '',
            city: row.city || '',
            notes: row.notes || '',
          }
          // IE não tem campo próprio — vai para observações quando existir
          if (row.ie) {
            payload.notes = payload.notes ? `${payload.notes} — IE: ${row.ie}` : `IE: ${row.ie}`
          }
          await pb.collection('clients').create(payload)
          imported++
        } catch (err) {
          skipped.push({
            line: row.line,
            reason: 'erro ao gravar no servidor',
            name: row.name,
          })
        }
      }
      setResult({ imported, skipped })
      setStep('done')
      onImported()
      toast.success(`${imported} cliente(s) importado(s).`)
    } finally {
      setImporting(false)
    }
  }

  const previewRow = (r: ImportRow, key: React.Key) => (
    <tr key={key} className="border-t">
      <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
      <td className="px-2 py-1.5 font-medium max-w-[160px] truncate">{r.name}</td>
      <td className="px-2 py-1.5">{clientTypeOf(r.document)}</td>
      <td className="px-2 py-1.5">{r.document || '—'}</td>
      <td className="px-2 py-1.5">{r.phone || '—'}</td>
      <td className="px-2 py-1.5 max-w-[140px] truncate">{r.email || '—'}</td>
      <td className="px-2 py-1.5">{r.city || '—'}</td>
      <td className="px-2 py-1.5">{r.state || '—'}</td>
    </tr>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0F6A3A]" />
            Importar Clientes por Planilha
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha um arquivo Excel (.xlsx, .xls) ou CSV com os clientes. Esta função importa
            <strong className="text-foreground"> apenas clientes</strong> — não afeta técnicos,
            materiais ou ordens. Clientes existentes não são alterados nem apagados.
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-3">
            <div
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-[#0F6A3A]/50 hover:bg-[#0F6A3A]/5 transition"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                handleFile(e.dataTransfer.files?.[0])
              }}
            >
              <Upload className="w-8 h-8 text-[#0F6A3A] mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">
                {parsing ? 'Lendo planilha...' : 'Clique para escolher o arquivo'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Formatos aceitos: .xlsx, .xls, .csv — funciona também com relatórios exportados de
                outros sistemas (cabeçalho em qualquer linha da planilha).
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="w-full h-9 text-xs font-semibold gap-1.5 text-[#0F6A3A] border-[#0F6A3A]/40 hover:bg-[#0F6A3A]/10"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Baixar modelo em branco (.xlsx) para preencher
            </Button>

            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg space-y-1">
              <p className="font-semibold text-foreground">Colunas reconhecidas (por título):</p>
              <p>
                <strong>nome</strong> (obrigatório — aceita também “razão social”),{' '}
                <strong>telefone</strong>, <strong>CNPJ/CPF</strong>, <strong>IE</strong>,{' '}
                <strong>endereço</strong>, <strong>num</strong>, <strong>bairro</strong>,{' '}
                <strong>CEP</strong>, <strong>cidade</strong>, <strong>UF</strong>,{' '}
                <strong>e-mail</strong> e <strong>observações</strong>. A linha de cabeçalho pode
                estar em qualquer posição (linhas antes dela são ignoradas) e as colunas são
                mapeadas pelo título, não pela posição.
              </p>
            </div>

            {parsing && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando arquivo...
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            {headerInfo && (
              <p className="text-[11px] text-muted-foreground">
                Cabeçalho detectado na {headerInfo}. Colunas mapeadas pelos títulos.
              </p>
            )}

            {/* Filtro Somente Macaé - RJ */}
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[#0F6A3A]/20 bg-[#0F6A3A]/5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMacae}
                onChange={(e) => setOnlyMacae(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#0F6A3A]"
              />
              <span className="text-xs">
                <span className="font-semibold text-foreground">Somente Macaé - RJ</span>
                <span className="block text-muted-foreground">
                  {onlyMacae
                    ? `${outOfMacae.length} linha(s) de outras cidades ficarão de fora desta importação.`
                    : 'Filtro desligado: clientes de todas as cidades serão importados.'}
                </span>
                {onlyMacae && semCidade.length > 0 && (
                  <span className="block mt-1 font-semibold text-amber-700">
                    Atenção: {semCidade.length} linha(s) estão sem cidade preenchida e por isso
                    também ficarão de fora (
                    {semCidade
                      .slice(0, 3)
                      .map((r) => r.name)
                      .join(', ')}
                    {semCidade.length > 3 ? '…' : ''}). Preencha a cidade na planilha.
                  </span>
                )}
              </span>
            </label>

            {/* Resumo */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#0F6A3A]/10 border border-[#0F6A3A]/20 rounded-lg p-3 text-center">
                <p className="text-lg font-black text-[#0F6A3A]">{rows.length}</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Linhas válidas
                </p>
              </div>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                <p className="text-lg font-black text-destructive">{invalid.length}</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Com problema
                </p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                <p className="text-lg font-black text-amber-600">
                  {outOfMacae.length + Object.keys(duplicateRows).length}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Fora de Macaé / repetidos
                </p>
              </div>
              <div className="bg-muted/40 border rounded-lg p-3 text-center">
                <p className="text-lg font-black text-foreground">{dedupedToImport.length}</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Serão importados
                </p>
              </div>
            </div>

            {/* Prévia das linhas válidas */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-[11px] font-bold text-foreground uppercase">
                Prévia das linhas a importar
              </div>
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr className="text-left text-[10px] uppercase text-muted-foreground">
                      <th className="px-2 py-1.5">Linha</th>
                      <th className="px-2 py-1.5">Nome</th>
                      <th className="px-2 py-1.5">Tipo</th>
                      <th className="px-2 py-1.5">CNPJ/CPF</th>
                      <th className="px-2 py-1.5">Telefone</th>
                      <th className="px-2 py-1.5">E-mail</th>
                      <th className="px-2 py-1.5">Cidade</th>
                      <th className="px-2 py-1.5">UF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dedupedToImport.slice(0, 50).map((r) => previewRow(r, r.line))}
                    {dedupedToImport.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                          Nenhuma linha a importar com os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {dedupedToImport.length > 50 && (
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
                  Mostrando as primeiras 50 de {dedupedToImport.length} linhas.
                </div>
              )}
            </div>

            {/* Fora de Macaé - RJ (filtro ativo) */}
            {onlyMacae && outOfMacae.length > 0 && (
              <div className="border border-sky-500/30 rounded-lg overflow-hidden">
                <div className="bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-700 uppercase flex items-center gap-1.5">
                  <MapPinOff className="w-3.5 h-3.5" /> Fora de Macaé - RJ ({outOfMacae.length} —
                  não serão importadas)
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {outOfMacae.slice(0, 100).map((r) => (
                    <div
                      key={r.line}
                      className="flex items-start gap-2 px-3 py-1.5 text-xs border-t border-sky-500/10 bg-sky-500/5"
                    >
                      <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-sky-500 hover:bg-sky-500 text-white">
                        Linha {r.line}
                      </Badge>
                      <span className="text-foreground font-medium max-w-[220px] truncate">
                        {r.name}
                      </span>
                      <span className="text-sky-700 ml-auto shrink-0">
                        {r.city || '(sem cidade)'}
                        {r.state ? ` / ${r.state}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                {outOfMacae.length > 100 && (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-sky-500/10">
                    Mostrando as primeiras 100 de {outOfMacae.length} linhas.
                  </div>
                )}
              </div>
            )}

            {/* Linhas inválidas */}
            {invalid.length > 0 && (
              <div className="border border-destructive/30 rounded-lg overflow-hidden">
                <div className="bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive uppercase flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Linhas com problema (não serão importadas)
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {invalid.map((i) => (
                    <div
                      key={i.line}
                      className="flex items-start gap-2 px-3 py-1.5 text-xs border-t border-destructive/10 bg-destructive/5"
                    >
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        Linha {i.line}
                      </Badge>
                      <span className="text-foreground font-medium">{i.name}</span>
                      <span className="text-destructive">— {i.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicados */}
            {Object.keys(duplicateRows).length > 0 && (
              <div className="border border-amber-500/30 rounded-lg overflow-hidden">
                <div className="bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-600 uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Serão pulados (duplicados)
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {Object.entries(duplicateRows).map(([line, reason]) => {
                    const row = rows.find((r) => r.line === Number(line))
                    return (
                      <div
                        key={line}
                        className="flex items-start gap-2 px-3 py-1.5 text-xs border-t border-amber-500/10 bg-amber-500/5"
                      >
                        <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-amber-500 hover:bg-amber-500 text-white">
                          Linha {line}
                        </Badge>
                        <span className="text-foreground font-medium">{row?.name}</span>
                        <span className="text-amber-600">— {reason}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button variant="outline" size="sm" onClick={reset} disabled={importing}>
                Escolher outro arquivo
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing || dedupedToImport.length === 0}
                className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    Importar {dedupedToImport.length} cliente(s){' '}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-[#0F6A3A]/10 border border-[#0F6A3A]/20 rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-[#0F6A3A] shrink-0" />
              <div>
                <p className="text-sm font-bold text-foreground">Importação concluída</p>
                <p className="text-xs text-muted-foreground">
                  {result.imported} cliente(s) importado(s){' '}
                  {result.skipped.length > 0 && `• ${result.skipped.length} pulado(s)`}
                </p>
              </div>
            </div>

            {result.skipped.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-[11px] font-bold uppercase text-foreground">
                  Linhas não importadas
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {result.skipped.map((s, idx) => (
                    <div
                      key={`${s.line}-${idx}`}
                      className="flex items-start gap-2 px-3 py-1.5 text-xs border-t"
                    >
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        Linha {s.line}
                      </Badge>
                      <span className="text-foreground font-medium">{s.name}</span>
                      <span className="text-muted-foreground">— {s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
              >
                Concluir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
