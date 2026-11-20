/**
 * Hook vazio — a conversão pedido→OS é feita no cliente.
 *
 * Existiu aqui uma rota POST /backend/v1/crm/pedido-para-os que respondia 404
 * mesmo depois de publicada (o hook não subia nesta instância). A conversão foi
 * movida para `OrcamentoDetalhePage.gerarOS`, que faz as três gravações direto
 * pela API — mesmo resultado, sem depender de hook.
 *
 * O arquivo é mantido para não deixar o registro de hooks inconsistente no
 * deploy; não registra rota nenhuma.
 */
