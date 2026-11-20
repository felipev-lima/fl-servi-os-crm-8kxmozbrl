/**
 * 0022 — restrição de visualização de OS por técnico.
 *
 * O usuário pediu: técnico comum logado só vê as PRÓPRIAS OS; Administrador e
 * Consulta podem ver/filtrar tudo. Até aqui a regra da coleção work_orders era
 * `@request.auth.id != ''` (qualquer autenticado listava tudo).
 *
 * A coleção `technicians` tem um link `user` para a conta de login (o ID do
 * técnico no formulário de OS é o ID dessa coleção). Então a regra do técnico
 * é: a OS aponta para um technician cujo `user` é o próprio logado.
 *
 * Parte 1 — VÍNCULO: contas de técnico (Julio, Marco, Yasmin) existem em
 * `users`, mas os registros em `technicians` estão com `user` vazio. Casamos
 * pelo E-MAIL (technicians.email = users.email) e, quando o e-mail não casa,
 * pelo NOME. Idempotente: só preenche quem está vazio.
 *
 * ATENÇÃO: técnicos SEM conta de login vinculada continuam sendo escolhíveis
 * no formulário, mas ninguém "vê" a OS por essa regra — a OS deles fica visível
 * apenas para Admin/Consulta.
 */
migrate(
  (app) => {
    // ---------- 1. vincular technicians.user ----------
    const soltos = app.findRecordsByFilter('technicians', "user = '' && email != ''", '', 0, 0)
    let vinculados = 0
    for (const tec of soltos) {
      let conta = null
      // 1a. casar pelo e-mail (exato, minúsculo)
      const email = String(tec.getString('email') || '')
        .trim()
        .toLowerCase()
      if (email) {
        try {
          conta = app.findFirstRecordByFilter(
            'users',
            `email = "${email.replace(/"/g, '\\"')}" && role != ''`,
          )
        } catch (_) {
          conta = null
        }
      }
      // 1b. fallback: casar pelo nome (exato)
      if (!conta) {
        const nome = String(tec.getString('name') || '').trim()
        if (nome) {
          try {
            conta = app.findFirstRecordByFilter('users', `name = "${nome.replace(/"/g, '\\"')}"`)
          } catch (_) {
            conta = null
          }
        }
      }
      if (conta) {
        // evita vincular a mesma conta a dois técnicos
        let ocupado = false
        try {
          app.findFirstRecordByFilter('technicians', `user = "${conta.id}"`)
          ocupado = true
        } catch (_) {}
        if (!ocupado) {
          tec.set('user', conta.id)
          app.save(tec)
          vinculados++
          console.log('0022: technicians.user vinculado', tec.getString('name'), '->', email)
        }
      }
    }
    console.log('0022: tecnicos vinculados =', vinculados)

    // ---------- 2. regra do servidor na coleção work_orders ----------
    // Técnico: só OS cujo technician está vinculado à própria conta.
    // Admin/Consulta: continuam vendo tudo.
    const LE = `@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'superadmin' || @request.auth.role = 'consulta' || technician.user = @request.auth.id)`
    const col = app.findCollectionByNameOrId('work_orders')
    col.listRule = LE
    col.viewRule = LE
    col.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')"
    col.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico' || technician.user = @request.auth.id)"
    col.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(col)
  },
  (app) => {
    // volta ao estado anterior às regras (a parte 1 do vínculo fica — é dado)
    const col = app.findCollectionByNameOrId('work_orders')
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')"
    col.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'tecnico')"
    col.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(col)
  },
)
