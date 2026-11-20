/**
 * 0023 — Corrige o bloqueio de cadastro e edição de usuários.
 *
 * Sintomas (2026-11-19): "cadastro e atualização de usuário está bloqueado".
 * Logs do servidor mostram PATCH /users/records/{id} = 400 repetidas vezes
 * ("Failed to update record"), sempre no mesmo registro.
 *
 * Causa: a migration 0016 removeu `superadmin` da lista de valores de `role`,
 * mas deixou registros antigos gravados com esse valor. O PocketBase recusa
 * salvar QUALQUER registro com valor fora da lista → todo PATCH naquele
 * usuário devolvia 400 sem explicar o motivo. Na tela aparecia como bloqueio.
 *
 * Correção (idempotente, sem apagar dado):
 *  - normaliza `role` fora da lista para 'admin' (mantém tecnico/consulta);
 *  - garante `active = true` em quem ficou sem valor;
 *  - reafirma as regras de gestão de usuários.
 */
migrate(
  (app) => {
    const validos = ['admin', 'tecnico', 'consulta']

    let todos = []
    try {
      todos = app.findRecordsByFilter('users', '', '', 0, 0)
    } catch (_) {
      todos = []
    }

    let corrigidos = 0
    let ativados = 0
    for (const u of todos) {
      try {
        let mexeu = false
        const bruto = String(u.getString('role') || '')
        const papel = bruto.trim().toLowerCase()
        if (validos.indexOf(papel) < 0) {
          u.set('role', 'admin')
          mexeu = true
        } else if (bruto !== papel) {
          u.set('role', papel)
          mexeu = true
        }
        // sem valor gravado (nem true nem false) -> ativo
        if (u.get('active') === undefined || u.get('active') === null) {
          u.set('active', true)
          mexeu = true
          ativados++
        }
        if (mexeu) {
          app.save(u)
          corrigidos++
        }
      } catch (err) {
        console.log('0023: falha ao normalizar usuario', u.id, String(err))
      }
    }
    console.log('0023: usuarios normalizados =', corrigidos, '| ativados =', ativados)

    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      users.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      app.save(users)
    } catch (err) {
      console.log('0023: falha ao reafirmar regras', String(err))
    }
  },
  (app) => {
    // Sem volta: normalizar papel para um valor válido não deve ser desfeito.
  },
)
