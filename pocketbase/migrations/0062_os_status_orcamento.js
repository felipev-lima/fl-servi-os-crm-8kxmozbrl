/**
 * ORÇAMENTO como status da OS (pedido do Felipe).
 *
 * "Às vezes eu abro uma OS para um funcionário ir a um cliente mas é uma OS de
 * proposta de orçamento... eu não queria perder o seu orçamento."
 *
 * Entra o valor ORCAMENTO no select `status` da coleção work_orders. Nada é
 * apagado e nenhuma OS muda de status aqui — só passa a EXISTIR a opção.
 *
 * Mesmo padrão da 0060 (trocar a lista inteira de valores e salvar a coleção).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const campo = col.fields.getByName('status')
    const valores = campo.values || []
    if (valores.includes('ORCAMENTO')) return // já aplicado
    campo.values = [...valores, 'ORCAMENTO']
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('work_orders')
    const campo = col.fields.getByName('status')
    campo.values = (campo.values || []).filter((v) => v !== 'ORCAMENTO')
    app.save(col)
  },
)
