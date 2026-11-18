# 0.2.5 — Clareza e validação do fluxo

A análise distingue a simulação no Cribl, a verificação das tags no Datadog e a revisão de um piloto. A comparação global da última hora é apresentada como referência atual. Referências extensas, credenciais e critérios técnicos podem ser expandidos quando necessários. O botão Usar última hora atualiza o intervalo da análise.

Uma análise sem escopo restrito não recebe mais o status de candidato. A revisão exige uma comparação antes/depois na mesma janela e no mesmo escopo; a presença de cardinalidade global não satisfaz esse requisito.

Validação real em 13/11/2026 às 22:32 UTC: Datadog retornou cardinalidade média horária de 35.917. O Lakehouse retornou 9.218 combinações para a métrica de duração; a simulação sem pod_name produziu 8.920 (3,23%), preservando 221.787 registros. São métodos de contagem diferentes. Não representam economia real de ingestão.

O estimador Datadog continua retornando count_or_gauge para a distribuição e é rejeitado. Dois dashboards da auditoria anterior continuam sem cobertura por HTTP 403. Não houve alteração nas rotas ou pipelines de produção.
