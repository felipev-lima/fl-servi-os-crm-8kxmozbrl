///
/// 0067 — Corrige a quantidade de técnicos no PEDIDO.
///
/// A 0066 criou `quotes.technicians` com `maxSelect: 0`, acreditando que isso
/// significava "sem limite". Nesta versão do PocketBase não significa: o campo
/// aceita UM valor e, ao receber uma lista, guarda apenas o último id.
///
/// Medido em 23/11/2026 na OS (que usou o mesmo valor por engano): mandar
/// ["A","B"] gravava só "B", apagando o A sem aviso. Aqui vale a mesma
/// correção: um número real maior que 1.
migrate(
  (app) => {
    const quotes = app.findCollectionByNameOrId('quotes')
    const campo = quotes.fields.getByName('technicians')
    if (campo) {
      campo.maxSelect = 20
      campo.required = false
      app.save(quotes)
    }
  },
  (app) => {
    const quotes = app.findCollectionByNameOrId('quotes')
    const campo = quotes.fields.getByName('technicians')
    if (campo) {
      campo.maxSelect = 1
      app.save(quotes)
    }
  },
)
