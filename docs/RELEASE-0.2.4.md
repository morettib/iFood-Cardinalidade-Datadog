# Versão 0.2.4

Interface em português; histórico persistido de uso e comparação no KV; atualização incremental de dashboards por modified_at; resumo de dependências; análise de métricas no dataset Lakehouse datadog_sketches; leitura da cardinalidade Datadog e estimativas antes/depois, com validação de tipo. As políticas de APIs mantêm os mesmos caminhos, usando somente endpoints Datadog de leitura permitidos pelo adaptador Stream.

Validação no tenant: JSON text/plain confirmado no KV; os 100 dashboards da página consultada forneceram modified_at. Em 2026-11-13T22:13:34Z, a última hora de datadog_sketches apresentou 8.199 combinações, 222.429 registros e simulação de 7.887 combinações sem pod_name (-312 / 3,805%). A API Datadog informou 33.468 de cardinalidade média horária. Esses números têm métodos de contagem diferentes. O estimador retornou count_or_gauge para a distribuição, e a projeção foi rejeitada, preservando a medição válida.

Os dashboards dca-53i-pq2 e wkv-emc-q9i continuam pendentes por HTTP 403. Nenhuma tag, fonte, rota ou pipeline de produção foi alterado. As medições reais de bytes de saída e ingestão após um piloto continuam necessárias para provar redução.
