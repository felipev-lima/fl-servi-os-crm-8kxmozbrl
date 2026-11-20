/**
 * 0015 — Limpeza do registro de teste da validação multiempresa.
 *
 * Durante o teste de isolamento foi criado um cliente na empresa de teste
 * ("CLIENTE DA EMPRESA 2"), que ficou órfão quando a empresa de teste foi
 * removida: sem `company`, ele aparece na listagem do superadmin mas não pode
 * ser excluído pela API (a regra de exclusão exige a empresa do usuário).
 *
 * Aqui a remoção é feita direto no banco, por nome exato. Se o registro não
 * existir, a migration não faz nada — roda igual em banco novo.
 */
migrate(
  (app) => {
    app.db().newQuery("DELETE FROM clients WHERE name = 'CLIENTE DA EMPRESA 2'").execute()
  },
  () => {
    // Sem volta: era dado de teste.
  },
)
