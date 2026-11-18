# 0.2.8 — Oportunidades, cobertura ampliada e PT-BR / EN

O ranking principal mostra apenas cenários com ausência de referências nas cinco fontes de uso verificadas e atuais. Cenários com dependências e cobertura pendente aparecem em grupos separados. A lista abre nas tags sem uso observado; seleção acumulada e impacto conjunto são preservados. A seleção recebe aviso quando inclui dependências ou pendências.

O seletor PT-BR / EN muda a interface e salva a preferência localmente. Alternar o idioma não refaz consultas nem perde a seleção ou os resultados. Identificadores de métricas, tags, objetos Datadog, consultas originais e código permanecem literais.

Fontes de uso: consultas ativas (7 dias), monitores, dashboards personalizados/clonados, notebooks/templates e SLOs de métricas/time-slice. SLOs baseados em monitores dependem da verificação dos monitores. A configuração de indexação mostra inclusão/exclusão de tags como contexto, sem ser considerada prova de uso por consultas.

Notebooks reutilizam definições com a mesma data de edição e idade inferior a sete dias. Novos, alterados, sem versão, expirados ou falhados são relidos; definições usam lotes limitados com fallback individual. Dashboard e notebook snapshots são publicados em blocos antes do manifesto. O histórico antigo continua legível, mas três fontes não confirmam ausência de uso sob a cobertura ampliada.

Não há inventário completo de scripts externos, dashboards predefinidos e consultas fora da janela. Ausência de referências na cobertura acessível não garante ausência de uso em todo o Datadog. Revisão dos responsáveis e piloto controlado continuam necessários.

Sondagem real no tenant: notebooks/templates e SLOs retornaram HTTP 403. A application key precisa de acesso notebooks_read e slos_read. A configuração de tags da métrica de duração retornou 404; isso não prova ausência de uso nem distingue, por si só, métrica inexistente de configuração ausente. A interface mantém cobertura pendente e mostra o código HTTP extraído sem revelar logs ou credenciais.

Não foram alterados pipelines de produção, rotas, secrets ou permissões Datadog.
