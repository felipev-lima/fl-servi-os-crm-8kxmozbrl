/**
 * 0024 — Troca o e-mail de acesso do Júlio (pedido do Felipe, 2026-11-19).
 *
 * O e-mail é o login do PocketBase. A troca pela API padrão exige a senha
 * antiga da pessoa, por isso falhava na tela. Aqui é feita direto no banco,
 * de forma idempotente e sem tocar na senha (ele continua entrando com a
 * mesma senha, só muda o login).
 *
 * Alvo: qualquer conta cujo nome contenha "julio"/"júlio" ou cujo e-mail
 * atual comece por "julio". De "julio..." para julioag48@gmail.com.
 */
migrate(
  (app) => {
    const NOVO = 'julioag48@gmail.com'

    // Já existe outra conta com esse e-mail? Então não mexe (o índice é único).
    let ocupado = null
    try {
      ocupado = app.findAuthRecordByEmail('users', NOVO)
    } catch (_) {
      ocupado = null
    }

    const todos = app.findRecordsByFilter('users', '', '', 0, 0)
    const alvos = []
    for (const u of todos) {
      const nome = String(u.getString('name') || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const email = String(u.email() || '').toLowerCase()
      if (nome.indexOf('julio') >= 0 || email.indexOf('julio') === 0) {
        alvos.push({ user: u, email: email })
      }
    }

    if (alvos.length === 0) {
      console.log('0024: nenhuma conta de Julio encontrada — nada a fazer')
      return
    }

    for (const a of alvos) {
      if (a.email === NOVO) {
        console.log('0024: conta ja usa o novo e-mail:', a.user.id)
        continue
      }
      if (ocupado && ocupado.id !== a.user.id) {
        console.log('0024: e-mail novo ja pertence a outra conta — troca cancelada')
        continue
      }
      a.user.setEmail(NOVO)
      a.user.setVerified(true)
      a.user.set('emailVisibility', true)
      app.save(a.user)
      console.log('0024: e-mail do Julio alterado de', a.email, 'para', NOVO, '| id', a.user.id)
    }
  },
  (app) => {
    // Sem volta: o e-mail antigo não é mais usado pelo Felipe.
  },
)
