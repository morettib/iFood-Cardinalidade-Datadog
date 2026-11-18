# Read-only classification diagnosis

No rule or tenant configuration changed. Evidence window: November 12, 2026, 18:45–18:51 UTC. This is a recent historical window, not a current-now claim.

## Verified payload differences

All 5,225 check-shaped fallback records have status and no tags. Of those, 5,193 have host_name and 32 do not. Representative misses are Kubernetes kubelet checks. Five matched datadog_service_checks records have check, status, host_name and tags. Both matched and missed records can have datatype=Uncategorized, so that value alone does not distinguish them.

Sanitized structural examples (no host/tag values):

```json
{"check":"kubernetes.kubelet.check.ping","status":0,"host_name":"<present>","tags":"<absent>","_dataset_reason":"no_rules_matched"}
{"check":"istio.mesh.openmetrics.health","status":0,"host_name":"<present>","tags":"<present>"}
```

The metadata misses contain an agent_metadata configuration object, not the inventory shape internalHostname/meta. Three sampled misses have neither top-level internalHostname nor agent_metadata.internalHostname. Their configuration values were not inspected or exported. Representative matched agent-event records include internalHostname, while other matched batches do not. A metadata routing extension must not treat configuration metadata as a host-to-cluster inventory observation.

## What remains unverified

The current MCP tools expose context, queries, sources and pipelines, but no ingestion-classification rule reader. GET /m/default_search/search/datasets succeeded; its dataset filter=true values are read filters, not classifier expressions. Attempts to locate rule resources returned HTTP404 (not permission-denied or successful empty rules): /products/lakehouse_engine/engines/ifood_logs/rules, /products/lakehouse_engine_logs/engines/ifood_logs/rules and /m/default_search/search/ingest-rules. Rule expressions, order and exact classifier endpoint remain unavailable. The 404 responses had no JSON error message.

Therefore missing tags is a verified difference, but a tags-required classifier is a hypothesis. A narrow rule requiring host_name would also leave 32 check records unmatched. Minimum additional evidence: a read-only export of the actual ifood_logs ingestion rules with order, enabled state, predicate and destination, or its documented GET endpoint. No configuration write permission is needed.

## Smallest conditional proposals

If the service-check classifier currently requires tags/host_name, retain its other verified source restrictions and remove those optional-field requirements. Candidate KQL predicate:

```kusto
isnotnull(check) and isnotnull(status)
```

Expected destination: datadog_service_checks, including tagless checks and the 32 hostless records. Hostless rows remain explicitly uncorrelated. Do not use truthiness for status: zero is valid. Validate check/status types against representative intake records before promoting this predicate.

If the agent-events classifier omits configuration metadata, add this narrowly scoped branch while retaining its existing source restrictions:

```kusto
isnotnull(agent_metadata)
```

Expected destination: datadog_agent_events, with configuration metadata kept distinct from host inventory/events. Alternatively use a dedicated configuration dataset if operators prefer separation. Place any approved narrow classification before the catch-all main fallback, preserving the existing specific-rule order. These are proposed predicates, not verified replacements for unseen rules.

Acceptance before any change: replay sanitized tagless/status-zero checks, hostless checks, existing tagged checks, inventory, event batches and metadata through the exported rules. Confirm expected destinations and no regressions; then compare bounded fallback counts. Source sendToRoutes=false and direct Search/Lake outputs mean generic Stream default routes are not authoritative for these misses.

## Reproduction

```kusto
dataset="main"
| where _dataset_reason == "no_rules_matched" and isnotnull(check)
| summarize records=count() by has_tags=isnotnull(tags),
  has_host=isnotnull(host_name), has_status=isnotnull(status)
| limit 10
```

MCP jobs: 1794513358537.k8zkxt (check shapes), 1794513356034.o0whUM (three metadata shapes), 1794513188826.A9EVYa (five misses), 1794513188120.MRV66s (five matched checks). All completed successfully.

Cribl Lake dataset ifood_datadog remains verified and documented for future cardinality analysis. It mixes flat metrics and nested sketches; exact base sketch.metric selection is required. It is not a Pods source. Datadog active-configurations usage access remains unverified.
