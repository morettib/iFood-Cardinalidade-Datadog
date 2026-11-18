# iFood Kubernetes POV — verified implementation plan

Investigation date: 2026-11-12. All tenant operations were read-only queries or configuration reads. No sources, routes, pipelines, datasets, monitors, notebooks or app installations were changed. Credentials and unrelated event contents are excluded from this report.

## Verdict

Build a focused Cribl App using the existing Datadog Agent telemetry. A real pod can already be selected and queried for CPU, uptime, restarts, memory and Kubernetes events. Both the current MCP and the documented native metrics REST endpoint work. The former metrics-job failure is not reproduced by a literal metric query with the current MCP.

The remaining blockers are app-host permission/visual validation, incomplete event identity coverage and resource-sensitive event expansion, current pod phase/readiness signals, and reconciliation of duplicate/disagreeing Argo reporters. Datadog tag usage remains unverified: there is no `datadog_tag_usage` dataset or connected Datadog tool in the inspected catalog. The tag simulation is independently demonstrable, without claiming removal is safe or predicting billing.

## Query paths and existing routing

| Path | Verified result |
|---|---|
| MCP `cribl_getSearchContext` | `metrics`, `main`, `datadog_agent_events`, `datadog_sketches`, `datadog_service_checks` are Lakehouse datasets on `ifood_logs`. `metrics` is managed by `lhe_metrics`. |
| MCP `cribl_runSearchQuery` / `cribl_getSearchJobResults` | Log query creation, bounded execution, pagination and failed-job retrieval work. |
| MCP `cribl_queryMetrics` | Literal PromQL, range queries, `.metrics` and `.metadata` work. Catalog reported 2,877 metric names. |
| Native REST | `GET /api/v1/products/lakehouse_engine_metrics/engines/ifood_logs/datasets/metrics/prom/api/v1/query_range` returned HTTP 200 / success / matrix for the known CPU query. The matching `/query` endpoint returned HTTP 200 for restarts. |
| App integration | Use `window.CRIBL_API_URL` and the platform authentication proxy. Declare GET policies for those metrics paths and dataset discovery; declare the Search job/result paths used by the adapter. Installed app-user permission has not been tested; successful operator-token REST requests do not prove app-role permission. |
| Existing collection | Source `datadog-agent-intake` is `datadog_agent`, `sendToRoutes=false`, `extractMetrics=false`. Its direct connections include `ifood_search`, `ifood_datadog` and the existing Datadog destination. Consequently the generic default route/default output does not describe this input's actual path. |
| Log copy of metrics | `datadog_metric_events` is absent. A bounded sample of `main` is a service check (`check`, `host_name`, `status`, `message`, `tags`); no generic metric copy was established. Use native metrics, not `main`, for CPU and uptime. |

Native metrics query parameters are `query`, Unix-second `start`, `end`, and `step` for `/query_range`; use `query` and `time` for `/query`. Search endpoints remain under `/m/default_search/search/...`.

## Time windows and known-good example

- Metrics and broad event investigation: **2026-11-12 15:50–16:25 UTC**, equivalent to **10:50–11:25 EST**; range step 60 seconds.
- Tight event reproduction: **15:55–16:19 UTC / 10:55–11:19 EST**. Both title-based and narrow tag-based queries returned **10 events**.
- Literal instant signal samples: **16:18 UTC / 11:18 EST**, epoch `1794500280`.
- Tag simulation: **15:02–15:10 UTC / 10:02–10:10 EST**, fully paginated.

Known-good resource: cluster `local-comm-sandbox-use1-01`, namespace `search-platform`, pod `search-cook-grpc-6cbd9c9b98-6hx4p`, host `i-0aab96982e6a2bbb3`. Inventory maps that host to the same cluster. CPU and uptime carry host, namespace, pod and container labels. The broad timeline contains 12 items: all 12 match those identity tags, and all carry event cluster ID `19e283e1-7a70-4816-ae7f-b612479b17de`.

## Panel and signal mapping

All metric samples below use dataset `metrics`, engine `ifood_logs`, and the 16:18 UTC sample unless stated otherwise. Native metadata reports the observed resource metrics as **gauges**, with empty unit/help strings. Units shown below come from Datadog's primary documentation, not from populated tenant metadata.

| Panel / signal | Dataset and exact fields/name | Identity / unit | Verification |
|---|---|---|---|
| Cluster and node navigation | `datadog_agent_events`: `internalHostname`, `meta["cluster-name"]`; `metrics`: `host` | Metric host = inventory hostname; use only nonempty, time-bounded cluster evidence | 49 hosts have nonempty cluster evidence; no conflicting cluster assignment observed in this window. This is observed coverage, not proof of complete inventory. |
| Namespace → workload → pod | `metrics`: `kube_namespace`, `kube_deployment`, `kube_ownerref_kind`, `kube_ownerref_name`, `pod_name`, `host` | Preserve owner kind/name; do not derive deployment solely by stripping pod suffixes | Verified CPU discovery across search-platform and chat-platform-api; 139 container-labelled discovery rows. |
| Container CPU | `cri_cpu_usage` | `host`, `kube_namespace`, `pod_name`, `container_name`, `container_id`; gauge / nanocores | Verified 110 MCP raw range points; normalized query returned 86 points. Native raw REST returned 12 label series across three container names and multiple container incarnations. |
| Container uptime | `container_uptime` | Same container keys; gauge / seconds | Verified 106 range points; instant sample `23419.413457431` for consul-template. Uptime is time since container start, not pod/node availability. |
| Container restarts | `kubernetes_containers_restarts` | Host, namespace, pod, `kube_container_name`; `container_name` and `container_id` are absent in the checked restart rows | Verified five instant rows: search-cook-grpc reports 77; the other four report 0. Join container names explicitly across the metric families. Treat as a gauge reporting restart count; do not assume a Prometheus counter. |
| Memory usage | `container_memory_usage`; `kubernetes_memory_usage` | Container keys; gauge / bytes | Verified four / three instant rows. Example values: 5,820,416 and 75,218,944 bytes. Do not add the two metric families together. |
| CPU requests / limits | `kubernetes_cpu_requests`; `kubernetes_cpu_limits` | Container keys; gauge / cores | Verified three rows each. Example request 0.05 cores; limit 0.16 cores. |
| Memory requests / limits | `kubernetes_memory_requests`; `kubernetes_memory_limits` | Container keys; gauge / bytes | Verified three rows each. Examples 26,214,400 and 2,147,483,648 bytes. |
| Alternative CPU family | `container_cpu_usage`; `container_cpu_limit` | Container keys; gauge / nanocores | Verified five rows each. Limit 160,000,000 nanocores agrees with Kubernetes limit 0.16 cores for the sampled container. Keep families separate. |
| Node capacity | Inventory `gohai` JSON string → `cpu.cpu_logical_processors` and `cpu.cpu_cores` | Host; capacities are snapshot properties | Known host sample at epoch 1794499453.284: 16 logical processors / 8 physical cores. Do not use 8 as the logical CPU denominator. |
| Current pod phase | `kubernetes_state_pod_status_phase` | Would require identity plus phase labels | **Not observed**: absent from retrieved name catalog; both scoped and global literal checks returned zero. Event/metric tag `pod_phase:running` is observed metadata, not authoritative current state. |
| Current readiness | `kubernetes_state_container_ready` | Pod/container identity | **Not observed** in scoped/global literal checks. This investigation does not establish a current pod-ready gauge. |
| Kubernetes deployment desired / available | `kubernetes_state_deployment_replicas`; `kubernetes_state_deployment_replicas_available` | Namespace/deployment | **Not observed** in scoped/global literal checks. |
| Argo workload replica alternative | `argo_rollouts_rollout_info_replicas_desired`; `argo_rollouts_rollout_info_replicas_available` | `argo_rollouts_namespace`, `argo_rollouts_name`, reporter `host`, `endpoint`; gauge counts | Verified for search-cook-grpc. Desired: 27 reporter rows, all value 3. Available: 29 reporters, values 0 and 1. Do not sum reporters or present an unexplained single current available count. |
| Argo rollout phase | `argo_rollouts_rollout_phase` | Rollout keys, reporter, `phase`, `strategy`; one-hot values | Verified 174 rows for target; phase labels include Progressing, Timeout, Completed, Abort, Error, Paused with values 0/1. It is rollout phase, not pod phase. |
| Kubernetes timeline | `datadog_agent_events`: `events.kubernetes[]` → `timestamp`, `msg_title`, `msg_text`, `alert_type`, `tags`, `aggregation_key`, `event_type` | Prefer cluster ID only when present on both sides; otherwise inventory-derived cluster + namespace + pod, with host corroboration | 10 events in tight window; info/warning. Exact known title query and prefiltered tag query work. |
| Tag simulation | `datadog_sketches`: `sketch.metric`, `sketch.host`, `sketch.tagsList` | Exact dotted Datadog metric name + host + sorted distinct full tag set | Three Istio distributions verified; results below. Arrays may be serialized as JSON strings in Search results. |
| Tag usage safety | Future `datadog_tag_usage`: metric name, tag key, active usage, lookback, fetched time and response status | Exact dotted metric name + exact tag key | **Usage unverified**. No configured usage dataset/Datadog read-only tool was observed. Generic REST collector implementation exists; that is not an authenticated active-configurations integration. |

## Correlation sample

All successful inventory matches below resolve to `local-comm-sandbox-use1-01`. Event counts refer to the broad 35-minute window.

| Namespace | Pod | Metric host | Event result | Correlation |
|---|---|---|---|---|
| search-platform | search-cook-grpc-6cbd9c9b98-6hx4p | i-0aab96982e6a2bbb3 | 12 | 12/12 strict cluster+namespace+pod+host matches |
| search-platform | search-ds-worker-59c8c94b5f-zpxjg | i-051a55c1fd81b7efe | 23 | 21 strict matches; two lack host_provider_id but retain matching cluster+namespace+pod and can be shown with reduced host-correlation confidence |
| search-platform | search-cook-5f4f56d846-544qd | i-0aab96982e6a2bbb3 | 10 | 10/10 strict matches |
| search-platform | discovery-search-service-grpc-b9f98cb79-zqdbw | i-003802fac30975f5f | 0, completed | CPU/inventory matched; no events observed in tested window |
| search-platform | search-autocomplete-6f9d985667-88x9g | i-0d1a1e64f23ec6169 | 0, completed | CPU/inventory matched; no events observed in tested window |
| chat-platform-api | chat-platform-api-f55b45fdd-5pwcm | i-027d5172c875ea4c2 | 0, completed | CPU/inventory matched; no events observed in tested window |
| search-platform | search-fallback-engine-57db5b94df-fglr4 | i-08466cbcb9c84c19d | failed | Event join **blocked**, not zero-data evidence |
| search-platform | cardstack-maitre-search-localcomm-9c9447c74-bzdxt | i-087bbe58abc2f74b9 | failed | Event join **blocked**, not zero-data evidence |

No shared pod UID was found in the checked CPU labels and matching event items/tags. Do not silently substitute container ID for pod UID. All seven sampled hosts have valid inventory cluster evidence. A host without such evidence must appear under **cluster unresolved**; do not assign the default cluster. If event host is missing, attach a cluster+namespace+pod match only when cluster evidence and identity are unambiguous, and display reduced confidence. Title-only matching cannot safely disambiguate identical namespace/pod names across unknown clusters.

The known pod's inner timestamps range 1794498674–1794500254; outer `_time` ranges 1794498695.085–1794500276.365. Observed ingestion lag is 11.858–26.799 seconds. Use `ev.timestamp` on the timeline; retain outer `_time` as ingestion evidence. The other matched sample has lag up to 54.511 seconds. No exact repeated items were found in these matched samples. This is bounded evidence, not a global duplicate-rate guarantee.

All 12 known-pod events share **one** `aggregation_key`; therefore that key alone would wrongly collapse distinct warnings/information. A conservative deduplication signature is the hash of resolved identity, `event_type`, `aggregation_key`, inner timestamp, title, message, alert type and sorted distinct full tags. Exclude outer `_time` so a redelivered batch can collapse; retain occurrence count and min/max ingestion times. Label it exact-item deduplication, not semantic Kubernetes Event-UID deduplication.

## Exact verified queries

KQL, broad event window 15:50–16:25 UTC (tight reproduction 15:55–16:19 UTC):

```kusto
dataset="datadog_agent_events"
| where _raw contains "search-cook-grpc-6cbd9c9b98-6hx4p"
| mv-expand ev=events.kubernetes
| where tostring(ev.msg_title) contains "search-platform/search-cook-grpc-6cbd9c9b98-6hx4p"
| project _time, event_time=ev.timestamp, title=ev.msg_title,
          message=ev.msg_text, level=ev.alert_type, tags=ev.tags
| order by event_time asc
| limit 100
```

Inventory query actually executed over 15:50–16:25 UTC; discard blank-cluster groups in the app:

```kusto
dataset="datadog_agent_events"
| where isnotnull(internalHostname)
| summarize observations=count(), first=min(_time), last=max(_time)
  by host=internalHostname, cluster=meta["cluster-name"]
| limit 100
```

Exact narrow tag query also returned 10 items in the tight window:

```kusto
dataset="datadog_agent_events"
| where _raw contains "search-cook-grpc-6cbd9c9b98-6hx4p"
| mv-expand ev=events.kubernetes
| where tostring(ev.tags) contains "pod_name:search-cook-grpc-6cbd9c9b98-6hx4p"
    and tostring(ev.tags) contains "kube_namespace:search-platform"
    and tostring(ev.tags) contains "host_provider_id:i-0aab96982e6a2bbb3"
| project _time, event_time=ev.timestamp, title=ev.msg_title, level=ev.alert_type
| limit 100
```

The app should parse tag arrays and apply exact key/value equality after this coarse bounded filter; substring matching alone is not a final identity test.

PromQL, dataset `metrics`, engine `ifood_logs`, 15:50–16:25 UTC, step 60:

```promql
cri_cpu_usage{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}
```

```promql
max by (host,kube_namespace,pod_name,container_name,container_id) (
  cri_cpu_usage{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}
) / 1000000000
```

```promql
container_uptime{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}
```

The normalized CPU query preserves container incarnation and removes incidental tag dimensions. It does not produce a verified pod total. Multiple label versions/incarnations were observed; do not blindly sum raw series or add `cri_cpu_usage` to `container_cpu_usage`. Display CPU cores first. CPU percentages require a positive matching request/limit/capacity denominator and explicit policy for incarnations, scrape duplicates and missing data. Do not apply `rate()` merely because the metric name says usage; metadata says gauge and the observed series decrease as well as increase.

Workload checks at 16:18 UTC:

```promql
argo_rollouts_rollout_info_replicas_desired{argo_rollouts_namespace="search-platform",argo_rollouts_name="search-cook-grpc"}
```

```promql
argo_rollouts_rollout_info_replicas_available{argo_rollouts_namespace="search-platform",argo_rollouts_name="search-cook-grpc"}
```

## Tag optimization deliverable

Bounded KQL actually executed separately for the three exact names over 15:02–15:10 UTC:

```kusto
dataset="datadog_sketches"
| where sketch.metric == "istio.mesh.request.duration.milliseconds"
| summarize observations=count()
  by metric=sketch.metric, host=sketch.host, tags=sketch.tagsList
| limit 10000
```

All pages were retrieved: duration 1,000+1,000+1,000+296; request size 1,000+602; response size 1,000+649. No invalid tag arrays were encountered. Canonicalize locally: parse JSON array if serialized; unique/sort complete tag strings; key = JSON `[metric, host, canonicalTags]`. Remove every exact `pod_name:` tag, retain host and all other tags, and count distinct keys again.

| Datadog distribution metric | Before | After removing pod_name | Reduction |
|---|---:|---:|---:|
| istio.mesh.request.duration.milliseconds | 3,296 | 3,169 | 127 / 3.85% |
| istio.mesh.request.size | 1,602 | 1,525 | 77 / 4.81% |
| istio.mesh.response.size | 1,649 | 1,568 | 81 / 4.91% |

The previous **1,974 → 1,917** result was not reproduced from an identical identified input. Its exact window/export was not available in this investigation. The complete new bounded sample is reported separately; supply the original window/export to make an exact regression fixture. These are observed metric+host+tag combinations, not Datadog billable series, percentile-preserving aggregations or billing predictions.

Proposed future collector/integration: read `GET /api/v2/metrics/{exact_dotted_name}/active-configurations` on the tenant's correct Datadog site with `metrics_read` access. Its `window[seconds]` minimum is 14,400 (four hours); default is one week. Do not request an eight-minute usage lookback just because the sketch simulation uses eight minutes. Response fields are `data.id`, `data.attributes.active_tags`, and `active_aggregations`.

Store a read-only snapshot in `datadog_tag_usage` with exact metric name, tag key, active-use membership, API status, lookback seconds, fetched timestamp, Datadog site and permission/freshness status. Preserve successful empty arrays explicitly; absence of a flattened row must not stand in for a failed/empty API response. Join on **exact metric name + tag key**, never the Prometheus underscore-renamed metric. No site/token/application-key value belongs in the frontend or report.

Only a fresh successful response with no observed use makes a tag a **candidate for review**. API failures, insufficient permissions, unavailable integration and stale snapshots remain **usage unverified**. Active use stays **retain/review dependency**. Preserve drill-down identity tags in the app's telemetry source, even if a separate Datadog destination experiment is later approved. No tag-removal configuration was changed here.

## Failed and blocked checks

| Check | Exact result | Consequence / minimum resolution |
|---|---|---|
| Combined metric-name selector through MCP | `Error: Query failed: metrics query job failed (jobId: mq-1794503281366.dz8JQ7, searchGroupName: default_search). To see the available metrics datasets and engine IDs, call cribl_listMetricsDatasets, then retry with a valid dataset.` | The suggested list tool is not in the 18-tool server inventory. Catalog + literal CPU query already verify the dataset. |
| Equivalent native selector planner | HTTP 422: `Unsupported PromQL construct: label-only selectors are not supported by the Metrics Store planner: {__name__=~"kubernetes_state_.*|kube_pod_.*|kube_deployment_.*"}` | Use literal metric names; those succeeded. Do not classify the selector failure as metric absence. |
| Two 35-minute prefiltered event expansions | Jobs `1794503284025.3L58B6` and `1794503283040.w8hzEi`: status `failed`, error `<--- Last few GCs --->` | Full coordinator logs were readable but did not establish a more precise worker/root cause. Need worker failure/heap diagnostic or Cribl support investigation for those IDs. Splitting one query to 16:10–16:15 UTC completed with zero, which does not settle the failed 35-minute window. |
| Earlier broad tag expansion with red Details | Original job ID/query/error was not supplied | Its exact cause remains unverified. The prefiltered narrow tag equivalent succeeded with 10 rows. Obtain the original Details/job ID before attributing the earlier failure. |
| Datadog active-configurations | Not invoked: no verified Datadog read-only integration or usage snapshot was available | Minimum: correct Datadog site plus approved server-side read credential with metrics_read, or an authenticated fresh snapshot dataset. No invented HTTP permission error. |
| Installed Cribl App access and UI | Not tested in this read-only investigation | Need app install/share permission validation and the same panel tests as a shared app user. Working Metrics Explorer is retained as user-supplied UI evidence, separate from current successful MCP/REST evidence. |

The legacy metrics failure is therefore no longer a general blocker: simple metrics queries work today. The actual blockers are specific planner constructs, event expansion failures and app-user permission not yet tested.

## Build comparison

| Option | Evidence-based assessment |
|---|---|
| Adapt k8smon | Good visual/navigation reference. The local 1.1.0 README confirms Edge Fleets and configured Edge sources are requirements. User-inspected queries expect different field/metric shapes. Replacing setup, metric adapter, topology identities and event adapter is substantial; do not run its setup against this tenant or change collection to satisfy it. |
| Focused Cribl App | Recommended. Two small adapters can use the verified native Prometheus API and bounded Search timeline, with inventory correlation and explicit confidence/error states. Datadog Agent remains the collector. |
| Search dashboard / notebook demo | Useful first rehearsal: pin the known pod with CPU/uptime panels and bounded timeline. It demonstrates query viability quickly, but cluster→node→workload navigation and coordinated filtering must be implemented or verified separately. No dashboard/notebook was created during this investigation. |

## Prioritized implementation and acceptance tests

| Priority / deliverable | Implementation | Acceptance test |
|---|---|---|
| P0 — query adapter and permissions | Native metrics GET query/query_range adapter, Search log jobs/results adapter, catalog/engine validation; platform proxy only; separate error/empty states | As a shared app user, run known CPU and uptime range plus tight timeline. Expect successful metrics with container identity and 10 event items in the fixed window. Verify 401/403 is an access error, HTTP 422 is a query error, and failed log jobs do not render as no events. |
| P1 — pod-first demo | Cluster from inventory; node, namespace, workload and pod selectors from observed metric labels; container CPU in cores, uptime in seconds, exact event identity checks; one synchronized time window | Select cluster → i-0aab96982e6a2bbb3 → search-platform → search-cook-grpc → known pod. Show its containers and info/warning timeline. Repeat search-ds-worker and chat-platform-api cases; preserve unresolved identity and legitimate zero-event states. Changing selection cancels stale requests and cannot retain another pod's data. |
| P1 — bounded timeline and dedup | Filter raw batches before expansion; short windows, controlled limits/pagination, UTC inner event time, ingestion evidence, conservative exact-item hash | Replay a batch with a different outer _time: one exact item plus occurrence count. Keep all 12 known-pod items despite shared aggregation_key. Reproduce failed jobs as errors; retry smaller windows without asserting the larger window was empty. |
| P2 — resource and workload depth | Restarts, memory, requests/limits; preserve metric-family distinctions. Time-bounded host-cluster inventory with conflict detection. Replica reporter diagnostics; current phase/readiness only when valid signals exist | Match resource values at epoch1794500280, CPU unit conversion, and no double counting across container IDs/tag versions. Desired replicas 3 is consistent; available reporters 0/1 trigger disagreement. Missing readiness/phase show not observed, not healthy. An artificial conflicting inventory map prevents automatic cluster assignment. |
| P3 — tag simulation tab | Exact dotted metric names, canonical full-tag sets, paginated completeness gate, before/after counts; no automatic tag removal | For the fixed 15:02–15:10 UTC input, duration 3296→3169, request size1602→1525, response size1649→1568. Reordering tags changes no count; repeated key values remain preserved; incomplete pages block a complete-result claim. Import original1974→1917 input as a separate regression fixture if supplied. |
| P4 — Datadog usage validation | Separately authorized REST collector/server integration and datadog_tag_usage dataset; snapshot freshness/lookback and active-tag membership | Fresh200 with pod_name active → retain/review. Fresh200 with no active pod_name → review candidate.403,429, unavailable integration, missing metric snapshot or stale response → usage unverified. Reject API lookbacks below4h. No credentials reach app code and no billing savings are inferred. |

Add these cases to the implementation repository's `tests/test-catalog.yaml`: `ifood-native-metrics-and-timeline`, `ifood-cluster-pod-correlation`, `ifood-exact-event-dedup`, `ifood-container-incarnation-and-replica-reporters`, `ifood-istio-tag-simulation`, `ifood-tag-usage-failure-and-freshness`. No feature implementation or tenant changes are part of this investigation.

## Evidence and primary references

Key jobs: CPU `mq-1794503150815.7w8NsQ`; normalized CPU `mq-1794503599927.e7DcFj`; uptime `mq-1794503220018.W5NUVH`; tight timeline `1794503279623.893esX`; tag-filter timeline `1794504146561.5DOY8M`; inventory grouped `1794503496701.fPGkW6`; event identifiers `1794503740222.1CcnHI`; Istio duration `1794503603796.MXrgD1`, request size `1794503603163.1q6wYt`, response size `1794503603051.5PZkW2`.

Local request/response evidence is under `C:/Users/BrunnoMoretti/tmp/ifood-audit`. Those raw local files are not shareable report artifacts; this document contains only the selected evidence required for implementation. Tool scripts read the local credential without displaying or embedding it in the report.

- [Datadog CRI units](https://docs.datadoghq.com/integrations/cri/): cri.cpu.usage nanocores.
- [Datadog container metrics](https://docs.datadoghq.com/integrations/container/): uptime seconds; CPU nanocores; memory bytes.
- [Datadog Kubernetes collected metrics](https://docs.datadoghq.com/containers/kubernetes/data_collected/): requests/limits cores/bytes.
- [Datadog active tags and aggregations API](https://docs.datadoghq.com/api/latest/metrics/list-active-tags-and-aggregations/): metrics_read, active_tags, API lookback minimum/default.
- Native Cribl API paths were checked against the local scaffold `openapi.json` and exercised against the tenant; their successful REST results are recorded above.
