# iFood — Cardinalidade Datadog

Versão publicada: **0.3.1**. Identificador do app: `ifood-kubernetes-pov`.

- [Pacote instalável 0.3.1](releases/ifood-kubernetes-pov-0.3.1.tgz)
- [Instalação e desenvolvimento](docs/INSTALLATION.md)
- [Notas da versão atual](docs/RELEASE-0.3.1.md)
- [Histórico de versões](docs/)
- [Notas de implementação](IMPLEMENTATION-NOTES.md)
- [Planos e validações técnicas](docs/validation/)
- [Capturas de tela](docs/screenshots/)

Descubra métricas com alta cardinalidade, identifique as dimensões responsáveis e compare cenários de redução antes de alterar o envio ou a indexação no Datadog.

## Como usar

1. Em **Inventário de métricas**, escolha a janela UTC, carregue o inventário e busque pelo nome da métrica, serviço ou equipe.
2. Clique em **Investigar**. Métricas nativas mostram valores distintos por label e simulação de combinações no servidor. Distribuições abrem a análise dos sketches originais.
3. Selecione uma ou mais labels e um escopo restrito. Host e limites de histogramas permanecem preservados.
4. Confirme o nome exato no Datadog e verifique dependências em consultas ativas, monitores, dashboards, notebooks e SLOs. A configuração de indexação complementa o diagnóstico.
5. Exporte a análise e revise a estratégia com os responsáveis. O app não aplica alterações automaticamente.

## Interpretar os resultados

Valores distintos de uma label, combinações de séries, pontos coletados e séries faturáveis são medidas diferentes. Remover uma label pode não reduzir séries se outras dimensões ainda distinguirem todas as combinações. Os efeitos conjuntos são recalculados; percentuais individuais não são somados.

O catálogo Search não comprova ausência de dependências no Datadog. Cobertura incompleta ou histórica mantém o uso pendente. A redução simulada deve ser validada em um piloto e medida no destino antes de ser apresentada como economia.

Histograma: os limites podem aparecer como `upper_bound` ou `le`; não remova essa dimensão indiscriminadamente. Agregação deve preservar taxas, count/sum e quantis conforme o tipo da métrica.

## Acesso e desempenho

O app usa o Metrics Store `ifood_logs/metrics` e o dataset `datadog_sketches`. A saved search `ifood_cardinality_v3_sketch_inventory` atualiza o inventário de distribuições a cada 15 minutos. Resultados expirados ou indisponíveis usam uma consulta direta.

As leituras Datadog usam previews limitados do Stream, com credenciais resolvidas nos Workers a partir de `secrets-datadog/DD_API_KEY` e `secrets-datadog/dd-application-key`. A identidade precisa de `metrics_read`, `monitors_read`, `dashboards_read`, `notebooks_read` e `slos_read`, além do acesso aos objetos. Credenciais não são expostas no navegador.

## Kubernetes

CPU, uptime e eventos dos pods estão no app independente **iFood — Kubernetes: Telemetria preservada**. O histórico de cardinalidade permanece no identificador original deste app.
