/**
 * TEMPORÁRIO — hook vazio para isolar um 504.
 * Se a listagem de materials voltar a responder rápido, a causa é o enrich.
 */
onRecordEnrich((e) => {
  e.next()
}, 'materials')
