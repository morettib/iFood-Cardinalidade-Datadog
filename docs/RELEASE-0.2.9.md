# 0.2.9 — Explicar efeitos individuais sem redução de séries

A lista diferencia valores distintos de uma tag, redução de combinações e bytes JSON de tags removidos. Quando a remoção individual não colapsa séries, a linha mostra “Sem redução de combinações”, além do antes/depois. A seleção conjunta continua sendo recalculada para o conjunto completo; percentuais não são somados.

Auditoria real da métrica de duração em 14/11/2026, janela UTC 01:16:57–02:16:57: 125 combinações, seis hosts, 57 tags. A remoção individual não altera as combinações para 55 tags. ifood_requester_service produz 125→115; response_flags produz 125→124; ambas produzem 125→114. pod_name tem 47 valores e mantém 125 combinações, porque outras dimensões ainda distinguem as séries. A remoção de pod_name simula 721.952 bytes a menos no JSON de tags dos registros representados, sem comprovar redução real de saída ou de ingestão Datadog.

Uma verificação independente em Python confirmou o cálculo. O algoritmo de cardinalidade não foi alterado. A melhoria torna o resultado explícito em PT-BR e EN.
