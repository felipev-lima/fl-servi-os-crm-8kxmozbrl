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
import { TechnicianImportRow, InvalidRow, parseTechnicianSpreadsheet } from '@/lib/spreadsheet'
import pb from '@/lib/pocketbase/client'
import { Technician } from '@/types/flservicos'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

interface TechnicianImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTechnicians: Technician[]
  onImported: () => void
}

type Step = 'select' | 'preview' | 'done'

interface ImportResult {
  imported: number
  skipped: { line: number; reason: string; name: string }[]
}

export default function TechnicianImportDialog({
  open,
  onOpenChange,
  existingTechnicians,
  onImported,
}: TechnicianImportDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<TechnicianImportRow[]>([])
  const [invalid, setInvalid] = useState<InvalidRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('select')
    setFile(null)
    setRows([])
    setInvalid([])
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    setParsing(true)
    setFile(f)
    try {
      const parsed = await parseTechnicianSpreadsheet(f)
      setRows(parsed.rows)
      setInvalid(parsed.invalid)
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

  // Chave de duplicidade: nome + telefone, normalizados (sem acento, só dígitos no telefone)
  const dedupeKey = (name: string, phone: string) =>
    `${name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()}|${phone.replace(/\D/g, '')}`

  // Duplicados já existentes no sistema (nome+telefone)
  const existingKeys = new Set(
    existingTechnicians.map((t) => dedupeKey(t.name || '', t.phone || '')),
  )
  const seenInFile = new Set<string>()
  const duplicateRows: Record<number, string> = {}
  const toImport: TechnicianImportRow[] = []

  for (const row of rows) {
    const key = dedupeKey(row.name, row.phone)
    if (existingKeys.has(key)) {
      duplicateRows[row.line] = 'já existe técnico com mesmo nome e telefone'
    } else if (seenInFile.has(key)) {
      duplicateRows[row.line] = 'repetido na própria planilha'
    } else {
      seenInFile.add(key)
      toImport.push(row)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    const skipped: ImportResult['skipped'] = invalid.map((i) => ({
      line: i.line,
      reason: i.reason,
      name: i.name,
    }))
    for (const [line, reason] of Object.entries(duplicateRows)) {
      const row = rows.find((r) => r.line === Number(line))
      skipped.push({ line: Number(line), reason, name: row?.name || '(sem nome)' })
    }

    let imported = 0
    try {
      for (const row of toImport) {
        try {
          await pb.collection('technicians').create({
            name: row.name,
            phone: row.phone || '',
            email: row.email || '',
            role_title: row.roleTitle || '',
            specialties: row.specialties || '',
            active: row.active,
          })
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
      toast.success(`${imported} técnico(s) importado(s).`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0F6A3A]" />
            Importar Técnicos por Planilha
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha um arquivo Excel (.xlsx, .xls) ou CSV com os técnicos. Esta função importa
            <strong className="text-foreground"> apenas técnicos</strong> — não afeta clientes,
            materiais ou ordens. Técnicos existentes não são alterados nem apagados.
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
                Formatos aceitos: .xlsx, .xls, .csv
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg space-y-1">
              <p className="font-semibold text-foreground">
                Colunas reconhecidas na primeira linha:
              </p>
              <p>
                <strong>nome</strong> (obrigatório), <strong>telefone</strong> (ou fone/celular),{' '}
                <strong>e-mail</strong>, <strong>função</strong> (ou cargo),{' '}
                <strong>especialidades</strong>, <strong>situação</strong> (ou ativo — aceita
                Ativo/Inativo/Sim/Não/true/false). Acentos e maiúsculas são ignorados na leitura dos
                títulos.
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
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2">
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
              <div className="bg-muted/40 border rounded-lg p-3 text-center">
                <p className="text-lg font-black text-foreground">{toImport.length}</p>
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
                      <th className="px-2 py-1.5">Telefone</th>
                      <th className="px-2 py-1.5">E-mail</th>
                      <th className="px-2 py-1.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                        <td className="px-2 py-1.5 font-medium max-w-[180px] truncate">{r.name}</td>
                        <td className="px-2 py-1.5">{r.phone || '—'}</td>
                        <td className="px-2 py-1.5 max-w-[160px] truncate">{r.email || '—'}</td>
                        <td className="px-2 py-1.5">{r.active ? 'Ativo' : 'Inativo'}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                          Nenhuma linha válida.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && (
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
                  Mostrando as primeiras 50 de {rows.length} linhas válidas.
                </div>
              )}
            </div>

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
                disabled={importing || toImport.length === 0}
                className="bg-[#0F6A3A] hover:bg-[#0F6A3A]/90 text-white font-semibold text-xs"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando...
                  </>
                ) : (
                  <>
                    Importar {toImport.length} técnico(s) <ArrowRight className="w-3.5 h-3.5" />
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
                  {result.imported} técnico(s) importado(s){' '}
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
