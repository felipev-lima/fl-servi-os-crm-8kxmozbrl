migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['admin', 'tecnico', 'consulta'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('phone')) {
      users.fields.add(
        new TextField({
          name: 'phone',
        }),
      )
    }

    app.save(users)

    // Criar ou atualizar usuário admin inicial
    try {
      const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'felipev.lima1981@gmail.com')
      adminUser.set('role', 'admin')
      adminUser.set('name', 'Felipe Lima (Admin)')
      app.save(adminUser)
    } catch (_) {
      const newAdmin = new Record(users)
      newAdmin.setEmail('felipev.lima1981@gmail.com')
      newAdmin.setPassword('Skip@Pass')
      newAdmin.setVerified(true)
      newAdmin.set('name', 'Felipe Lima (Admin)')
      newAdmin.set('role', 'admin')
      app.save(newAdmin)
    }

    // Criar usuário técnico de exemplo
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'tecnico@flservicos.com')
    } catch (_) {
      const techUser = new Record(users)
      techUser.setEmail('tecnico@flservicos.com')
      techUser.setPassword('Skip@Pass')
      techUser.setVerified(true)
      techUser.set('name', 'Carlos Silva (Técnico)')
      techUser.set('role', 'tecnico')
      app.save(techUser)
    }

    // Criar usuário consulta de exemplo
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'consulta@flservicos.com')
    } catch (_) {
      const consultaUser = new Record(users)
      consultaUser.setEmail('consulta@flservicos.com')
      consultaUser.setPassword('Skip@Pass')
      consultaUser.setVerified(true)
      consultaUser.set('name', 'Auditoria FL (Consulta)')
      consultaUser.set('role', 'consulta')
      app.save(consultaUser)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const roleField = users.fields.getByName('role')
    if (roleField) users.fields.removeByName('role')
    const phoneField = users.fields.getByName('phone')
    if (phoneField) users.fields.removeByName('phone')
    app.save(users)
  },
)
