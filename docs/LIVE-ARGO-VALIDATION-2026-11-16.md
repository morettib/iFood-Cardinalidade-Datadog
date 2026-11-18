# Validação Argo Rollouts — 16/11/2026

O adapter do app consultou o Metrics Store e o Datadog usando previews limitados do Stream. Não houve alteração de tags, indexação, pipelines ou rotas.

| Fonte | Resultado |
| --- | --- |
| Nome no Metrics Store | `argo_rollouts_notification_send_bucket` |
| `_metric` na telemetria original do Lake | `argo_rollouts.notification.send.bucket` |
| Datadog `/volumes`, janela móvel de uma hora | `distinct_metric_volumes`, `distinct_volume=17310` |
| Datadog `/active-configurations`, sete dias | `active_tags=[]`, `active_aggregations=[]` |
| Datadog `/tags` | `metric_type=count`, `exclude_tags_mode=false`, `tags=[]`, agregação `time=sum`, `space=sum` |

Os endpoints responderam para o nome original exato. Tags ativas vazias não comprovam ausência de dependências em monitores, dashboards, notebooks ou SLOs. Configuração de indexação é contexto, não evidência de uso.

A simulação histórica no Search (14/11 00:00–01:00 UTC) contou 182.400 combinações originais e 106.050 após excluir `argo_rollouts_name`, preservando host e limites. Essa janela e esse método são diferentes da cardinalidade atual do Datadog. Os valores não são comparados para deduzir economia.

As evidências completas ficam em `C:/Users/BrunnoMoretti/tmp/ifood-audit/v3/`. Os arquivos de auditoria não contêm valores das credenciais.
