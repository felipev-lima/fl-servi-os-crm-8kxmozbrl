/**
 * Contatos dos clientes — o furo que trava a cobrança.
 *
 * A base veio da migração do sistema antigo sem telefone: 96 de 100 clientes
 * sem telefone e 98 sem e-mail. Um CRM de faturamento sem contato não cobra
 * ninguém.
 *
 * Esta tela ataca isso de três jeitos:
 *   1. edição direta na linha (digita, sai do campo, salvou);
 *   2. importação de planilha (preenche 100 de uma vez);
 *   3. modelo para baixar, preencher no Excel e devolver.
 *
 * O telefone é formatado ao salvar ((22) 99999-9999), porque número solto
 * não serve nem para ligar nem para montar link de WhatsApp.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { getClients, updateClient } from '@/services/api'
import type { Client } from '@/types/flservicos'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Loader2,
  Search,
  Phone,
  Mail,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

const POR_PAGINA = 25

/**
 * Formata telefone brasileiro.
 *
 * Aceita o que vier: "2299220470", "22 99220470", "(22) 9922-0470".
 * 10 dígitos = fixo, 11 = celular. O que não encaixa fica como está — melhor
 * guardar estranho do que apagar o dado de alguém.
 */
function formatarTelefone(bruto: string): string {
  const d = (bruto || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 13 && d.startsWith('55'))
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  return bruto
}

/** Só os dígitos, para montar link de WhatsApp */
function digitos(tel?: string): string {
  const d = (tel || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d
}

const norm = (s?: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export default function ContatosPage() {
  const [clientes, setClientes] = useState<Client[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'FALTANDO' | 'TODOS' | 'COMPLETO'>('FALTANDO')
  const [pagina, setPagina] = useState(1)
  const [rascunho, setRascunho] = useState<Record<string, { phone?: string; email?: string }>>({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  // importação
  const [openImport, setOpenImport] = useState(false)
  const [linhas, setLinhas] = useState<
    { nome: string; telefone: string; email: string; contato: string }[]
  >([])
  const [importando, setImportando] = useState(false)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const inputArquivo = useRef<HTMLInputElement | null>(null)

  const carregar = async () => {
    setCarregando(true)
    try {
      setClientes(await getClients())
    } catch {
      toast.error('Não foi possível carregar os clientes.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  const semTelefone = clientes.filter((c) => !(c.phone || '').trim())
  const semEmail = clientes.filter((c) => !(c.email || '').trim())
  const completos = clientes.filter((c) => (c.phone || '').trim() && (c.email || '').trim())

  const filtrados = useMemo(() => {
    const t = norm(busca)
    return clientes
      .filter((c) => {
        const tel = (c.phone || '').trim()
        const mail = (c.email || '').trim()
        if (filtro === 'FALTANDO' && tel && mail) return false
        if (filtro === 'COMPLETO' && (!tel || !mail)) return false
        if (!t) return true
        return (
          norm(c.name).includes(t) ||
          norm(c.nickname).includes(t) ||
          (c.document || '').includes(busca.trim())
        )
      })
      .sort((a, b) => {
        // quem falta contato primeiro
        const fa = (a.phone || '').trim() ? 1 : 0
        const fb = (b.phone || '').trim() ? 1 : 0
        if (fa !== fb) return fa - fb
        return a.name.localeCompare(b.name)
      })
  }, [clientes, busca, filtro])

  const listados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))

  const valorDe = (c: Client, campo: 'phone' | 'email'): string => {
    const r = rascunho[c.id]
    if (r && r[campo] !== undefined) return r[campo] as string
    return (c as any)[campo] || ''
  }

  const digitar = (id: string, campo: 'phone' | 'email', valor: string) =>
    setRascunho((r) => ({ ...r, [id]: { ...(r[id] || {}), [campo]: valor } }))

  /** Salva ao sair do campo — é o que torna a conferência rápida */
  const salvarLinha = async (c: Client) => {
    const r = rascunho[c.id]
    if (!r) return
    const tel = r.phone !== undefined ? formatarTelefone(r.phone) : c.phone || ''
    const mail = r.email !== undefined ? r.email.trim().toLowerCase() : c.email || ''
    if (tel === (c.phone || '') && mail === (c.email || '')) {
      setRascunho((x) => {
        const n = { ...x }
        delete n[c.id]
        return n
      })
      return
    }
    setSalvandoId(c.id)
    try {
      await updateClient(c.id, { phone: tel, email: mail })
      setClientes((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, phone: tel, email: mail } : x)),
      )
      setRascunho((x) => {
        const n = { ...x }
        delete n[c.id]
        return n
      })
      toast.success('Salvo.', { duration: 1200 })
    } catch {
      toast.error('Não foi possível salvar este contato.')
    } finally {
      setSalvandoId(null)
    }
  }

  /** Modelo para preencher no Excel: uma linha por cliente, já com o nome */
  const baixarModelo = () => {
    const dados = clientes.map((c) => ({
      CLIENTE: c.name,
      APELIDO: c.nickname || '',
      'CNPJ/CPF': c.document || '',
      TELEFONE: c.phone || '',
      'E-MAIL': c.email || '',
      'NOME DO CONTATO': '',
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    ws['!cols'] = [{ wch: 50 }, { wch: 25 }, { wch: 22 }, { wch: 18 }, { wch: 30 }, { wch: 24 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CONTATOS')
    XLSX.writeFile(wb, `CONTATOS-CLIENTES-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Modelo baixado — preencha e importe de volta.')
  }

  /**
   * Lê a planilha.
   *
   * Aceita cabeçalho com ou sem acento e em qualquer ordem: procura a coluna
   * que contém "TELEFONE" e a que contém "EMAIL"/"E-MAIL". O que identifica o
   * cliente é o CNPJ/CPF quando existe; senão, o nome.
   */
  const lerPlanilha = async (arquivo: File) => {
    setNomeArquivo(arquivo.name)
    try {
      const buf = await arquivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      /**
       * Lido SEM `defval`.
       *
       * Com `defval: ''` o SheetJS cria uma chave para cada coluna vazia do
       * intervalo — e o objeto vinha com nomes em branco, o que quebrava a
       * procura das colunas por nome.
       */
      const bruto = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { raw: false })
      if (bruto.length === 0) {
        toast.error('A planilha está vazia.')
        return
      }

      const chaves = Object.keys(bruto[0] || {})
      const achar = (palavras: string[]) =>
        chaves.find((k) => palavras.some((p) => norm(k).includes(p))) || ''

      const cNome = achar(['cliente', 'nome', 'razao'])
      const cDoc = achar(['cnpj', 'cpf', 'documento'])
      const cTel = achar(['telefone', 'fone', 'celular', 'whats'])
      const cMail = achar(['email', 'e-mail'])
      const cContato = achar(['contato'])

      if (!cTel && !cMail) {
        toast.error('Não achei coluna de TELEFONE nem de E-MAIL na planilha.')
        return
      }

      /**
       * As linhas são aceitas quando têm contato E uma forma de identificar o
       * cliente. Números de telefone em célula numérica chegam como number —
       * `String(...)` cobre os dois casos.
       */
      const lidas = bruto
        .map((l: Record<string, any>) => ({
          nome: String(l[cNome] ?? '').trim(),
          documento: String(l[cDoc] ?? '').trim(),
          telefone: String(l[cTel] ?? '').trim(),
          email: String(l[cMail] ?? '').trim(),
          contato: String(l[cContato] ?? '').trim(),
        }))
        .filter((l) => (l.telefone || l.email) && (l.nome || l.documento))

      setLinhas(lidas)
      if (lidas.length === 0) {
        // diagnóstico na tela: sem isso só aparece "0" e não se sabe o motivo
        toast.error(
          `Nenhuma linha válida. Colunas achadas: ${chaves.join(' | ')}` +
            (chaves.length ? '' : ' (nenhuma coluna lida)'),
          { duration: 12000 },
        )
      }
    } catch (e) {
      toast.error('Não foi possível ler a planilha.')
    }
  }

  /**
   * Aplica a planilha nos cadastros.
   *
   * Casa primeiro por documento (mais seguro) e depois por nome. Não cria
   * cliente novo: esta tela COMPLETA contato, não cadastra. Cliente
   * desconhecido fica listado como "não encontrado" para ele decidir.
   */
  const importar = async () => {
    setImportando(true)
    let ok = 0
    const naoAchados: string[] = []
    try {
      for (const l of linhas) {
        const doc = (l.documento || '').replace(/\D/g, '')
        let alvo = doc
          ? clientes.find((c) => (c.document || '').replace(/\D/g, '') === doc)
          : undefined
        if (!alvo && l.nome) {
          const n = norm(l.nome)
          alvo =
            clientes.find((c) => norm(c.name) === n) || clientes.find((c) => norm(c.nickname) === n)
        }
        if (!alvo) {
          naoAchados.push(l.nome || l.documento)
          continue
        }
        const dados: any = {}
        if (l.telefone) dados.phone = formatarTelefone(l.telefone)
        if (l.email) dados.email = l.email.toLowerCase()
        if (Object.keys(dados).length === 0) continue
        await updateClient(alvo.id, dados)
        ok++
      }
      toast.success(`${ok} contato(s) atualizado(s).`)
      if (naoAchados.length > 0) {
        toast.warning(
          `${naoAchados.length} não encontrado(s): ${naoAchados.slice(0, 3).join(', ')}`,
          {
            duration: 8000,
          },
        )
      }
      setOpenImport(false)
      setLinhas([])
      void carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Falhou em parte da importação.')
      void carregar()
    } finally {
      setImportando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">Contatos</h1>
          <p className="text-[11px] text-muted-foreground">
            {semTelefone.length} sem telefone · {semEmail.length} sem e-mail
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpenImport(true)}
          className="h-8 shrink-0 gap-1 text-[10px]"
        >
          <Upload className="h-3 w-3" /> Importar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-2.5">
            <span className="block text-[9px] font-bold uppercase text-rose-700">Sem telefone</span>
            <span className="font-mono text-sm font-black text-rose-700">{semTelefone.length}</span>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-2.5">
            <span className="block text-[9px] font-bold uppercase text-amber-700">Sem e-mail</span>
            <span className="font-mono text-sm font-black text-amber-700">{semEmail.length}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-2.5">
            <span className="block text-[9px] font-bold uppercase text-emerald-700">Completos</span>
            <span className="font-mono text-sm font-black text-emerald-700">
              {completos.length}
            </span>
          </CardContent>
        </Card>
      </div>

      {clientes.length > 0 && completos.length === 0 && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-900">
          <strong>Nenhum cliente está com contato completo.</strong> Sem telefone não há como cobrar
          nem avisar. Use <strong>Importar</strong> com uma planilha ou preencha na linha.
        </p>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
          placeholder="Buscar cliente, apelido ou CNPJ..."
          className="h-9 pl-9 text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {[
          ['FALTANDO', `Faltando contato (${clientes.length - completos.length})`],
          ['COMPLETO', `Completos (${completos.length})`],
          ['TODOS', `Todos (${clientes.length})`],
        ].map(([v, rot]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? 'default' : 'outline'}
            onClick={() => {
              setFiltro(v as any)
              setPagina(1)
            }}
            className={`h-7 text-[10px] ${filtro === v ? 'bg-slate-900 text-white' : ''}`}
          >
            {rot}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        {listados.map((c) => {
          const tel = (c.phone || '').trim()
          const mail = (c.email || '').trim()
          const salvando = salvandoId === c.id
          return (
            <Card
              key={c.id}
              className={salvando ? 'border-[#0B3D91]' : !tel ? 'border-rose-200' : ''}
            >
              <CardContent className="space-y-1.5 p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold">{c.nickname || c.name}</p>
                    <p className="truncate text-[9px] text-muted-foreground">
                      {c.name} · {c.document || 'sem documento'}
                    </p>
                  </div>
                  {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B3D91]" />}
                  {!tel && !salvando && (
                    <Badge className="shrink-0 border-rose-300 bg-rose-100 px-1 py-0 text-[7px] text-rose-800">
                      sem tel
                    </Badge>
                  )}
                  {tel && (
                    <a
                      href={`https://wa.me/${digitos(tel)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-1 text-emerald-700"
                      title="Abrir no WhatsApp"
                    >
                      <MessageCircle className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[8px] text-muted-foreground">Telefone</Label>
                    <Input
                      value={valorDe(c, 'phone')}
                      onChange={(e) => digitar(c.id, 'phone', e.target.value)}
                      onBlur={() => salvarLinha(c)}
                      placeholder="(22) 99999-9999"
                      inputMode="tel"
                      className="h-7 text-[10px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[8px] text-muted-foreground">E-mail</Label>
                    <Input
                      value={valorDe(c, 'email')}
                      onChange={(e) => digitar(c.id, 'email', e.target.value)}
                      onBlur={() => salvarLinha(c)}
                      placeholder="email@cliente.com"
                      inputMode="email"
                      className="h-7 text-[10px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {listados.length === 0 && (
          <div className="rounded-xl border-2 border-dashed p-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
            <p className="text-sm font-semibold">Nada pendente neste filtro</p>
          </div>
        )}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-between px-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="h-7 text-[10px]"
          >
            Anterior
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {pagina} de {paginas} · {filtrados.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
            className="h-7 text-[10px]"
          >
            Próxima
          </Button>
        </div>
      )}

      {/* ---- importar ---- */}
      <Dialog open={openImport} onOpenChange={setOpenImport}>
        <DialogContent className="max-h-[88dvh] w-[94vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Importar contatos</DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5">
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[10px] text-sky-900">
              A planilha precisa ter uma coluna de <strong>TELEFONE</strong> e/ou{' '}
              <strong>E-MAIL</strong>, mais o <strong>CNPJ/CPF</strong> ou o nome do cliente. Não
              cria cliente novo — só completa o contato dos que já existem.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={baixarModelo}
              className="h-8 w-full gap-1.5 text-[11px]"
            >
              <Download className="h-3.5 w-3.5" /> Baixar modelo com os 100 clientes
            </Button>

            <input
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void lerPlanilha(f)
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputArquivo.current?.click()}
              className="h-8 w-full gap-1.5 text-[11px]"
            >
              <Upload className="h-3.5 w-3.5" /> Escolher planilha
            </Button>

            {nomeArquivo && (
              <p className="text-[9px] text-muted-foreground">Arquivo: {nomeArquivo}</p>
            )}

            {linhas.length > 0 && (
              <div className="rounded-lg border bg-slate-50 p-2">
                <p className="mb-1 text-[10px] font-bold">{linhas.length} linha(s) com contato</p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto">
                  {linhas.slice(0, 8).map((l, i) => (
                    <p key={i} className="truncate text-[9px] text-muted-foreground">
                      {l.nome || l.documento} — {l.telefone || l.email}
                    </p>
                  ))}
                  {linhas.length > 8 && (
                    <p className="text-[9px] text-muted-foreground">+ {linhas.length - 8}...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenImport(false)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={importar}
              disabled={importando || linhas.length === 0}
              className="h-9 gap-1.5 bg-[#0B3D91] text-xs font-semibold text-white hover:bg-[#0B3D91]/90"
            >
              {importando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {importando ? 'Importando...' : `Importar ${linhas.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
