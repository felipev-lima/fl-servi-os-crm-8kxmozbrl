///
/// Verificação DIÁRIA da saúde dos conectores Google.
///
/// PEDIDO DO FELIPE (27/11/2026): "Criar verificação diária automática dos
/// conectores Google (Sheets, Gmail, Drive, Agenda): checar se algum expirou e
/// avisar dentro do CRM (e por e-mail) para o usuário reconectar em
/// Configurações."
///
/// COMO DECIDE O ESTADO: o Skip Cloud guarda cada conexão na coleção de
/// sistema `_externalAuths` (um registro por usuário+provedor). O estado vem
/// do ACCESS TOKEN do registro:
///   - registro existe e token decodifica com `exp` no futuro  → conectado;
///   - registro existe e `exp` já passou                       → EXPIRADO;
///   - sem registro                                            → desconectado.
/// (`$security.base64Decode` NÃO existe na JSVM — projeto já provou; a
/// decodificação do payload é feita à mão, caractere a caractere.)
///
/// O QUE FAZ QUANDO ACUSA PROBLEMA:
///   1. grava/atualiza uma linha em `system_alerts` (coleção criada na 0076) —
///      é o que alimenta a bolinha vermelha do Painel;
///   2. envia UM e-mail por usuário com a lista dos conectores com problema,
///      pelo cliente de e-mail transacional do PocketBase. Idempotente no dia:
///      o e-mail só vai se `avisado_em` ainda não for de hoje (a linha do
///      alerta é a memória do aviso — nunca se repete no mesmo dia).
///
/// A execução é registrada no log (stream hooks) para conferência.
///

cronAdd('verificarConexoesGoogle', '0 9 * * *', () => {
  const TOOLKITS = ['googlesheets', 'gmail', 'googledrive', 'googlecalendar']
  const ROTULOS = {
    googlesheets: 'Google Sheets',
    gmail: 'Gmail',
    googledrive: 'Google Drive',
    googlecalendar: 'Google Agenda',
  }

  const agora = new Date()
  const hoje = agora.toISOString().slice(0, 10)

  // decodifica o payload de um JWT SEM $security.base64Decode (não existe na
  // JSVM). Tabela base64url + máscara de bits, igual ao algoritmo clássico.
  const decodificarJwt = (token) => {
    try {
      const partes = String(token || '').split('.')
      if (partes.length < 2) return null
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
      const entrada = partes[1].replace(/=+$/, '')
      const bytes = []
      let bits = 0
      let acc = 0
      for (let i = 0; i < entrada.length; i++) {
        const idx = B64.indexOf(entrada.charAt(i))
        if (idx < 0) continue
        acc = (acc << 6) | idx
        bits += 6
        if (bits >= 8) {
          bits -= 8
          bytes.push((acc >> bits) & 0xff)
        }
      }
      let json = ''
      for (const b of bytes) json += String.fromCharCode(b)
      return JSON.parse(json)
    } catch (_) {
      return null
    }
  }

  // estado de UM conector a partir do registro de _externalAuths
  const estadoDoConector = (registro) => {
    if (!registro) return { estado: 'desconectado' }
    const token = String(registro.getString('accessToken') || '')
    if (!token) return { estado: 'desconectado' }
    const payload = decodificarJwt(token)
    if (!payload || !payload.exp) {
      // token opaco (não-JWT): não dá para saber a validade — trata como ok
      return { estado: 'conectado' }
    }
    if (payload.exp * 1000 <= agora.getTime()) {
      return { estado: 'expirado', expiraEm: new Date(payload.exp * 1000).toISOString() }
    }
    return { estado: 'conectado', expiraEm: new Date(payload.exp * 1000).toISOString() }
  }

  // todos os usuários ativos (a verificação é por conta conectada)
  const usuarios = $app.findRecordsByFilter('users', 'active = true', '', 0, 0)
  let conectadosOk = 0
  let problemas = 0
  let emailsEnviados = 0

  for (const user of usuarios) {
    const comProblema = []

    for (const tk of TOOLKITS) {
      let registro = null
      try {
        const achados = $app.findRecordsByFilter(
          '_externalAuths',
          "collectionRef = '" + user.id + "' && provider = '" + tk + "'",
          '',
          1,
          0,
        )
        if (achados.length > 0) registro = achados[0]
      } catch (_) {
        registro = null
      }

      const st = estadoDoConector(registro)
      if (st.estado === 'conectado') {
        conectadosOk++
        // reconexão feita: o alerta antigo desta chave sai da lista (a linha
        // fica marcada resolvida — nada é apagado)
        try {
          const abertos = $app.findRecordsByFilter(
            'system_alerts',
            "user = '" + user.id + "' && chave = 'conector-" + tk + "' && resolvido = false",
            '',
            1,
            0,
          )
          if (abertos.length > 0) {
            abertos[0].set('resolvido', true)
            $app.save(abertos[0])
          }
        } catch (_) {}
        continue
      }

      problemas++
      const expirou = st.estado === 'expirado'
      const chave = 'conector-' + tk
      const titulo = ROTULOS[tk] + (expirou ? ' expirado' : ' desconectado')
      const mensagem = expirou
        ? 'Sua conexão com o ' +
          ROTULOS[tk] +
          ' expirou. Reconecte em Configurações → Conexões Google (sua conta).'
        : 'O ' +
          ROTULOS[tk] +
          ' não está conectado à sua conta. Conecte em Configurações → Conexões Google (sua conta).'

      // 1) registra/atualiza o alerta dentro do CRM (bolinha vermelha)
      let alerta = null
      try {
        const achados = $app.findRecordsByFilter(
          'system_alerts',
          "user = '" + user.id + "' && chave = '" + chave + "'",
          '',
          1,
          0,
        )
        if (achados.length > 0) alerta = achados[0]
      } catch (_) {}

      let jaAvisouHoje = false
      if (alerta) {
        jaAvisouHoje = String(alerta.getString('avisado_em') || '').slice(0, 10) === hoje
        alerta.set('tipo', expirou ? 'conector_expirado' : 'conector_desconectado')
        alerta.set('titulo', titulo)
        alerta.set('mensagem', mensagem)
        alerta.set('acao', 'Reconectar em Configurações')
        alerta.set('acao_link', '/configuracoes')
        alerta.set('resolvido', false)
        alerta.set('avisado_em', new Date().toISOString())
        $app.save(alerta)
      } else {
        const col = $app.findCollectionByNameOrId('system_alerts')
        const novo = new Record(col)
        novo.set('user', user.id)
        novo.set('chave', chave)
        novo.set('tipo', expirou ? 'conector_expirado' : 'conector_desconectado')
        novo.set('titulo', titulo)
        novo.set('mensagem', mensagem)
        novo.set('acao', 'Reconectar em Configurações')
        novo.set('acao_link', '/configuracoes')
        novo.set('resolvido', false)
        novo.set('avisado_em', new Date().toISOString())
        $app.save(novo)
      }

      // 2) e-mail — só 1x por dia por conector (idempotência do aviso)
      if (jaAvisouHoje) continue
      comProblema.push({ titulo, mensagem, expirou })
    }

    if (comProblema.length > 0) {
      try {
        const linhas = comProblema.map((p) => '• ' + p.titulo + ' — ' + p.mensagem).join('\n')
        $app.newMailClient().send(
          new MailerMessage({
            from: {
              address: $app.settings().meta.senderAddress,
              name: $app.settings().meta.senderName,
            },
            to: [{ address: user.getString('email') }],
            subject:
              'FL SERVIÇOS CRM — ' +
              comProblema.length +
              (comProblema.length === 1
                ? ' conexão Google precisa de atenção'
                : ' conexões Google precisam de atenção'),
            html:
              '<p>Olá, ' +
              user.getString('name') +
              '.</p>' +
              '<p>Na verificação diária de hoje, ' +
              (comProblema.length === 1 ? 'esta conexão precisa' : 'estas conexões precisam') +
              ' da sua atenção:</p>' +
              linhas
                .split('\n')
                .map((l) => '<p style="margin:4px 0">' + l + '</p>')
                .join('') +
              '<p>Abra o CRM → <b>Configurações</b> → card "Conexões Google (sua conta)" e clique em conectar no item indicado.</p>',
            text: 'FL SERVIÇOS CRM — verificação diária das conexões Google.\n\n' + linhas,
          }),
        )
        emailsEnviados++
      } catch (err) {
        console.log(
          'verificarConexoesGoogle: falha ao enviar e-mail para ' +
            user.getString('email') +
            ': ' +
            err,
        )
      }
    }
  }

  console.log(
    'verificarConexoesGoogle: ' +
      usuarios.length +
      ' usuários · ' +
      conectadosOk +
      ' conexões ok · ' +
      problemas +
      ' com problema · ' +
      emailsEnviados +
      ' e-mails de aviso',
  )
})
