# 0.3.0 — Inventário de métricas e apps separados

O app de cardinalidade abre em um inventário pesquisável do tenant. Métricas nativas vêm do catálogo/metadata do Metrics Store; distribuições vêm de `datadog_sketches`. A análise de distribuições consulta uma métrica exata, incluindo nomes descobertos fora das três métricas Istio iniciais.

Kubernetes é entregue no pacote independente `ifood-kubernetes-telemetry` 1.0.0. O app de cardinalidade mantém o ID `ifood-kubernetes-pov`, preservando seu KV de análises e comparações. Os apps oferecem links recíprocos e permissões independentes. Pods não precisa de jobs Stream nem de acesso às credenciais Datadog.

## Diagnóstico nativo

As labels são carregadas como resumos de valores distintos. A expansão consulta apenas os valores principais daquela label. A simulação executa `count(count_over_time(metric[window]))` e a projeção conjunta com `count without (...)` no servidor; não transfere centenas de milhares de séries ao navegador. Contagem zero exige resposta de sucesso; erros e avisos mantêm a análise não confirmada.

Host, nome da métrica e limites `le`/`upper_bound` são preservados. A simulação mede combinações, não valida a fusão dos valores. Histogramas devem manter count/sum/limites e ter taxas e quantis validados antes de qualquer transformação.

A verificação Datadog permite nomes dinâmicos em endpoints estritos de leitura. O usuário confirma o nome original, porque o Metrics Store pode substituir pontos por underscores. Consultas ativas, monitores, dashboards, notebooks, SLOs e configuração de indexação permanecem separados do uso registrado no Search. O rascunho exportado inclui evidências, contagens, escopo e critérios de revisão; não aplica alterações.

## Performance

- Catálogo com paginação local de 50 linhas e busca por nome/serviço/equipe.
- Resumos de labels e contagens agregadas no servidor; valores carregados por clique.
- Diagnóstico nativo e análise de distribuições carregados sob demanda.
- Saved search `ifood_cardinality_v3_sketch_inventory`: janela de uma hora, a cada 15 minutos, três resultados retidos e jitter de 10%.
- Cache aceito somente para a janela atual de uma hora, com versão correta e idade de até 20 minutos. Ausência/expiração/falha usa consulta direta. Contagem de registros de sketches não é apresentada como séries.
- Preferência de idioma no KV do app, sem browser storage.

## Evidência real

O adapter novo encontrou 3.262 entradas (nomes nativos e distribuições), incluindo 18 distribuições e `argo_rollouts_notification_send_bucket`.

A telemetria original confirmou `_metric=argo_rollouts.notification.send.bucket`. O app inclui uma busca dos nomes originais no Lake, validando a correspondência após normalização e exigindo escolha manual em caso de ambiguidade.

Na janela UTC 14/11/2026 00:00–01:00, a métrica Argo apresentou 182.400 combinações. A simulação preservando host e limites, removendo apenas `argo_rollouts_name`, contou 106.050 combinações. A janela apresentou 1.209 nomes, 707 namespaces, 30 hosts e cinco limites. É simulação de combinações observadas no Search, não redução aplicada nem economia Datadog.

## Próximas entregas

Inventário compartilhado de definições Datadog entre métricas, histórico de crescimento/rotatividade, normalização e agregação específicas por tipo, simulador de Metrics without Limits com preços contratuais, execução acompanhada de pilotos, aprovação e rollback, medição de séries/custo após piloto e alertas de regressão. Cada entrega deve ampliar `tests/test-catalog.yaml` e os testes relevantes.
