/**
 * 0031 — Parâmetros do faturamento: imposto e custo operacional.
 *
 * O Felipe quer ver o LUCRO LÍQUIDO mensal, não só a margem bruta. Para isso o
 * sistema precisa saber quanto descontar:
 *
 *   imposto em PRODUTO:  8%  (padrão dele)
 *   imposto em SERVIÇO: 11%  (padrão dele)
 *   custo operacional:   3%  sobre a venda
 *
 * Os três ficam em `settings` e são EDITÁVEIS na tela de Configurações — o
 * percentual de imposto muda com o regime e com o município, então nada fica
 * preso no código.
 */
migrate(
  (app) => {
    const cfg = app.findCollectionByNameOrId('settings')
    const campos = [
      // percentuais padrão, como o Felipe informou
      { name: 'tax_product_percent', type: 'number', min: 0, max: 100 },
      { name: 'tax_service_percent', type: 'number', min: 0, max: 100 },
      { name: 'operational_percent', type: 'number', min: 0, max: 100 },
    ]
    for (const f of campos) {
      if (!cfg.fields.getByName(f.name)) cfg.fields.add(new Field(f))
    }
    app.save(cfg)
  },
  (app) => {
    // os percentuais ficam: apagar perderia o ajuste feito pelo Felipe
  },
)
