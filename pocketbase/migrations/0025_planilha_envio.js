/**
 * 0025 — Controle de envio da planilha ao sistema financeiro externo.
 *
 * O Felipe gera a planilha de orçamento no app e transmite os dados para a
 * planilha dele, fora do sistema. Ele precisa saber, olhando a lista, quais OS
 * já foram transmitidas e quais ainda estão pendentes — sem ter de conferir
 * uma por uma na planilha externa.
 *
 * `planilha_envio` guarda a situação:
 *   - 'PENDENTE' (padrão) — ainda não foi para o financeiro
 *   - 'ENVIADA'            — já transmitida
 *
 * `planilha_enviada_em` registra QUANDO foi marcada como enviada.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')

    if (!col.fields.getByName('planilha_envio')) {
      col.fields.add(
        new SelectField({
          name: 'planilha_envio',
          required: false,
          maxSelect: 1,
          values: ['PENDENTE', 'ENVIADA'],
        }),
      )
    }

    if (!col.fields.getByName('planilha_enviada_em')) {
      col.fields.add(
        new DateField({
          name: 'planilha_enviada_em',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const a = col.fields.getByName('planilha_envio')
    if (a) col.fields.removeById(a.id)
    const b = col.fields.getByName('planilha_enviada_em')
    if (b) col.fields.removeById(b.id)
    app.save(col)
  },
)
