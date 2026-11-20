/**
 * 0026 — Restabelece os usuários na cópia da LM SERVIÇOS CRM.
 *
 * Sintoma: depois de duplicar o projeto da FL, o login falhou para todas as
 * contas. O banco foi copiado (coleções e registros presentes), mas o hash da
 * senha não autentica na instância nova, e o e-mail/verificação precisa ser
 * reafirmado.
 *
 * O que esta migration faz:
 *   1. Garante que a coleção `users` tenha o campo `role` — a autenticação e as
 *      regras de permissão do app dependem dele.
 *   2. Reafirma, para cada conta que já existe, o e-mail, o nome, o perfil, o
 *      estado ativo e a senha padrão `Fel161181`.
 *   3. Reafirma `emailVisibility` e `verified`, que o login e a listagem exigem.
 *
 * A senha padrão é a mesma que o Felipe já usa nos outros sistemas, para não
 * haver dúvida de qual é. Ele troca depois, dentro do app.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    // 1. campo `role` — base das regras de permissão do app
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          maxSelect: 1,
          values: ['admin', 'tecnico', 'consulta'],
        }),
      )
    }
    if (!users.fields.getByName('active')) {
      users.fields.add(new BoolField({ name: 'active' }))
    }
    app.save(users)

    // 2. contas que precisam existir neste projeto
    const contas = [
      { email: 'felipev.lima1981@gmail.com', name: 'Felipe Lima', role: 'admin' },
      { email: 'lujunger8@gmail.com', name: 'Luciana Lima', role: 'admin' },
      { email: 'fp52172@gmail.com', name: 'Filipe Pinheiro', role: 'tecnico' },
      { email: 'will-narciso@hotmail.com', name: 'William Inácio', role: 'tecnico' },
      {
        email: 'yasminthomazlima@gmail.com',
        name: 'Yasmin Thomaz de Lima Vieira',
        role: 'tecnico',
      },
      { email: 'julioag48@gmail.com', name: 'Julio Symplicio', role: 'tecnico' },
    ]

    const SENHA = 'Fel161181'

    for (const c of contas) {
      let rec
      try {
        rec = app.findAuthRecordByEmail('users', c.email)
      } catch (_) {
        rec = new Record(users)
        rec.set('email', c.email)
        rec.set('password', SENHA)
        rec.set('passwordConfirm', SENHA)
      }
      // reafirma os campos que o login e a listagem precisam
      rec.set('name', c.name)
      rec.set('role', c.role)
      rec.set('active', true)
      rec.set('emailVisibility', true)
      rec.set('verified', true)
      // redefine a senha também nas contas que já existiam (hash não vale aqui)
      rec.set('password', SENHA)
      rec.set('passwordConfirm', SENHA)
      app.save(rec)
    }
  },
  (app) => {
    // reverter senha de todo mundo não faz sentido; nada a fazer
  },
)
