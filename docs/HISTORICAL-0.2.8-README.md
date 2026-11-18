# iFood — Decisões de telemetria

A versão **0.2.8** consulta a cardinalidade do Datadog, compara com a telemetria preservada no Lakehouse Engine e verifica onde as tags são usadas antes de propor uma redução. A interface alterna entre PT-BR e EN sem refazer consultas. As consultas são acionadas por clique; o app não habilita pipelines nem remove tags automaticamente.

## Como usar

1. Escolha uma das três distribuições Istio e uma janela UTC de até uma hora. Clique em **Analisar cardinalidade** para consultar `datadog_sketches` no Lakehouse Engine via Cribl Search. Selecione um ambiente, namespace ou serviço para avaliar um piloto restrito.
2. Use **Comparar última hora** para consultar os dados recebidos no Lakehouse e a API de cardinalidade Datadog da mesma métrica. A comparação usa o escopo global da métrica. O painel mostra as combinações recebidas, a cardinalidade média horária informada pelo Datadog e a simulação após remover as tags selecionadas. Os métodos de contagem são diferentes; não se deduz economia diretamente pela diferença entre plataformas.
3. Consulte as evidências de uso: tags de consultas ativas, monitores, dashboards, notebooks/templates e SLOs de métricas/time-slice. A configuração de indexação é contexto, sem comprovar uso. O cartão superior resume as dependências por categoria e as definições pendentes. Links e IDs dos objetos aparecem nos detalhes.
4. Ao repetir a análise, o resultado salvo é carregado do KV do app. **Atualizar alterações** consulta os inventários e relê dashboards e notebooks novos, alterados, sem data de edição confiável ou com falha anterior. **Refazer análise completa** força todas as leituras.
5. Selecione tags de forma acumulada na lista. O ranking principal inclui apenas cenários com ausência de uso observada na cobertura completa e atual; dependências e pendências ficam separadas. Revise o ranking e baixe um plano de piloto com função Eval desabilitada, escopo exato, critérios de aceitação e reversão. Dependências, cobertura incompleta e resultados históricos impedem concluir ausência de uso. A habilitação exige revisão e validação em Preview.

## Fontes e abrangência

- `datadog_sketches`: métricas, sketches, host e tags para medição de cardinalidade.
- `datadog_agent_events`: investigação histórica de Pods e eventos Kubernetes.
- `datadog_service_checks`: fonte disponível no tenant; esta versão não usa service checks para inferir cardinalidade de métricas.
- Datadog: consultas ativas nos últimos sete dias, todos os monitores acessíveis e dashboards personalizados/clonados retornados pela API, notebooks/templates e SLOs. Scripts externos e consultas fora da janela não têm inventário completo nesta API. Dashboards predefinidos não são retornados por essa API.

As distribuições implementadas são `istio.mesh.request.duration.milliseconds`, `istio.mesh.request.size` e `istio.mesh.response.size`. Logs e traces exigem inventários e analisadores próprios; não são declarados como cobertos nesta versão.

## Histórico e atualização incremental

O KV guarda resultados, dependências, datas de leitura, `modified_at` dos dashboards e `modified` dos notebooks e os dez resumos mais recentes por métrica/conjunto de tags. Credenciais permanecem exclusivamente nos Secret Folders. As chaves usam SHA-256 da métrica e das tags normalizadas; os documentos JSON são gravados com `text/plain` para preservar o conteúdo no KV Cribl.

O manifesto é publicado após gravar os blocos de definições. Uma gravação parcial não substitui o resultado publicado. Dashboards excluídos saem do inventário atualizado; falhas não são tratadas como ausência de dependência. Definições reutilizadas há mais de sete dias são relidas na próxima atualização para reconciliar permissões. Nenhum agendamento é criado. Resultados históricos exibem sua data e precisam de atualização antes da aprovação de um piloto.

A atualização de monitores ainda consulta todas as páginas: a API já retorna as definições completas, e o app não presume suporte a filtro incremental confiável. O cache evita a varredura ao abrir uma análise salva; a atualização continua verificando o inventário completo de monitores.

## Cardinalidade e ingestão

A API Datadog `/volumes` informa cardinalidade média horária. O app consulta também `/estimate` para a mesma configuração de tags antes/depois, quando há dados completos no Lakehouse. Uma resposta de tipo incompatível com uma distribuição é rejeitada e exibida como projeção não validada.

A simulação do Cribl preserva host, dimensões restantes, registros e pontos dos sketches. A estimativa de bytes mede apenas o fragmento JSON das tags; não mede compressão, payload completo, volume de saída, indexação ou cobrança. A redução real de ingestão deve ser medida no destino Datadog durante um piloto controlado. Não se deve enviar duas vezes a mesma métrica de produção nem calcular médias de percentis de sketches.

## Configuração

O Worker Group `default` deve ter acesso às secrets globais de texto `secrets-datadog/DD_API_KEY` e `secrets-datadog/dd-application-key`, com commit e deploy concluídos. Os valores são resolvidos apenas nos Workers via `C.Secret`. A Application Key precisa das permissões de leitura Datadog correspondentes, incluindo notebooks_read, slos_read e metrics_read. A sondagem atual retornou 403 para notebooks/SLOs; o cliente precisa conceder acesso antes de obter cobertura completa nessas fontes.

O breaker customizado `ifood_datadog_api_json` deve estar implantado no grupo, com regra JSON NDJSON e `maxEventBytes: 16777216`. Apenas os jobs ad hoc do app usam esse breaker. Os jobs de Preview têm duração limitada, não seguem rotas de produção e capturam somente suas próprias respostas.

## Validação

Testes unitários cobrem persistência, isolamento de escopo, gravações parciais, histórico inválido, atualização incremental, cardinalidade e segurança da proposta. Testes de interface cobrem português, recarga sem nova varredura, releitura de dashboards alterados, comparação, erros, cobertura incompleta, Pods e janelas UTC. O arquivo `tests/test-catalog.yaml` registra os critérios de aceitação.
