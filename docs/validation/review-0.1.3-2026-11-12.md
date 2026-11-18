# iFood Kubernetes POV 0.1.3 — end-to-end review

Reviewed source, existing tests, the running local app, MCP queries and native metrics REST. No application code, package version, policies, or tenant configuration was changed. Initial/final SHA256 hashes of every src file match. Review scripts and private response captures are outside the project. This report excludes credentials and unrelated payloads.

## Highest-impact findings

### F1 — High: Refresh freezes a relative window

**Impact:** An operator can click “Refresh telemetry” believing the last 15 minutes have advanced, while all panels reread an older absolute interval. This is a freshness bug, not a stale-response race.

**Reproduce:** Select Last 15 minutes at approximately 18:43 UTC, advance the clock three minutes, click Refresh telemetry. A controlled local-browser replay sent exactly the same start/end before and after refresh: `1794508086.462` / `1794508986.462` (18:28:06.462–18:43:06.462 UTC). The current time was then about 18:46 UTC; no query moved to 18:31–18:46. The label still said “historical evidence by default” after the relative selection.

**Source:** [App.tsx:56](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/App.tsx:56), relative-range construction at line 61. Refresh only increments a counter; Last 15 minutes converts Date.now into fixed ISO dates once.

**Smallest fix:** Keep explicit absolute/relative range mode. On refresh, resolve relative bounds once and share that snapshot across discovery, CPU, uptime, inventory and events. Preserve fixed historical/custom bounds. Label the actual mode. Add a clock-advance regression test; the existing tests do not cover this behavior.

### F2 — Medium: Historical discovery excludes pods that disappear before the end

**Impact:** A pod with valid telemetry inside the selected window may be impossible to find in the selector. Discovery is an instant query at range.end, while the charts are range queries.

**Reproduce/evidence:** Run the exact discovery query at 15:55 and at 16:19 UTC on November 12. REST returned 152 and 153 container series, representing 54 and 59 pods. Nine pods observed at the start were absent at the end. One is `search-merchant-worker-577559b985-9hvm4` / `search-platform` / `i-0f76dcd2de2763dcb`. It is not one of the three permanent seeds. Searching for it with the original preset will not discover it, even though its historical samples exist. Previously selected pods are retained; that does not help a first-time selection.

**Source:** [App.tsx:48](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/App.tsx:48), [api.ts:20](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/api.ts:20), [domain.ts:19](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/domain.ts:19).

**Smallest fix:** Discover over the bounded selected interval and deduplicate host/namespace/pod. Alternatively explicitly label discovery as “pods reporting CPU at the window end” and support manual resource selection. The current namespace restriction to search-platform/chat-platform-api is also a first-slice scope limitation, not tenant-wide coverage.

### F3 — Medium: CPU silently chooses the maximum of disagreeing sources

**Impact:** CPU conversion is mathematically correct, but the displayed value can look authoritative while differing source-label observations were hidden. Uptime exposes this ambiguity; CPU does not.

**Reproduce/evidence:** For the known demo pod, 15:55–16:19 UTC, raw cri_cpu_usage returned 10 unique full-label series; the app query returned 7 container-incarnation series. There were 24 container/timestamp positions with disagreeing raw values. At 15:57 UTC, search-cook-grpc incarnation `bb6625dd…` reported `48812409.744734526` nanocores with kube_service and `42336832.1454636` without it. The app displays the maximum, approximately `0.0488124097` cores, and drops the alternate `0.0423368321`. All normalized points matched max(raw)/1e9; there were zero conversion mismatches.

**Source:** [domain.ts:17](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/domain.ts:17), [App.tsx:24](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/App.tsx:24). max aggregation removes the variant labels before the UI receives them.

**Smallest fix:** Label the panel/value as “Maximum reported CPU across label variants” and disclose that it is a reporting policy, not a verified authoritative source. For stronger accuracy, expose source disagreement/coverage as uptime does. Do not sum these observations or infer pod totals, rates or percentages.

### F4 — Medium: Timeline completeness is not machine-checked

**Impact:** A high-volume pod can show an event count that is only the first 100 records, including after filtering warnings. The footer says “Up to 100 items”, which is helpful, but there is no truncation/partial-result state and no full-window warning total.

**Reproduce/evidence:** eventsQuery sorts ascending then applies limit 100. parsePoll recognizes totalEventCount only as an envelope marker and discards its value. A direct parser probe with finished=true, reported total=101 and 100 rows returned a successful 100-row result with no partial flag. This is a synthetic contract test, not a claim that the ten-event demo was truncated. Actual demo count was exactly ten.

**Source:** [domain.ts:20](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/domain.ts:20), [api.ts:25](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/api.ts:25), [App.tsx:39](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/App.tsx:39).

**Smallest fix:** Request a 101st item as an overflow sentinel, preserve result metadata, and show “first 100 / potentially truncated” or page the results. Distinguish returned warning records from a complete-window warning count. A backend total after KQL limit may itself be 100, so metadata alone does not remove the need for a sentinel.

### F5 — Low: Cross-midnight labels omit the end date

**Impact:** A valid custom interval has an ambiguous date label, and the date disappears from individual card last-observed times too.

**Reproduce/evidence:** Enter 2026-11-12 23:55 UTC through 2026-11-13 00:10 UTC and Apply range. Requests correctly use `1794527700` / `1794528600`, but the label says `2026-11-12 · 23:55–00:10 UTC`, omitting November 13. This was tested with browser timezone America/New_York; request UTC handling itself is correct.

**Source:** [App.tsx:62](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/App.tsx:62).

**Smallest fix:** Format both dates when they differ, and show exact ISO bounds in a disclosure/tooltip. Format the active mode rather than the unchanged historical-default sentence.

### F6 — Low: Null event timestamps become January 1970

**Impact:** A malformed/missing source timestamp can become a plausible-looking accepted event instead of a rejected item.

**Reproduce/evidence:** Pass a matching pod title with event_time=null to timeline(). Number(null) becomes zero; one event is accepted at epoch zero. This was a direct local input-validation probe. All ten actual demo records had non-null timestamps and tags, so the defect was not observed in those tenant records.

**Source:** [domain.ts:72](C:/Users/BrunnoMoretti/Desktop/Cribl/apps/ifood-kubernetes-pov/src/domain.ts:72).

**Smallest fix:** Reject null/empty timestamp input before numeric conversion, then validate finite positive epoch seconds. Retain the excluded-item count; do not silently substitute ingestion time.

## Dataset findings — separated from application defects

| Dataset / origin | Verified findings | Consequence / proposed action |
|---|---|---|
| metrics, ifood_logs — source-label disagreement | Demo raw CPU has 10 distinct full-label series, not duplicate copies of identical full label sets. max gives 7 incarnations; 24 raw positions disagree. Conversion /1e9 is correct. | F3 is presentation/aggregation policy; the underlying disagreement is source data. Do not assert a Graph/Agent collector failure. |
| metrics — uptime | Demo consul-template ID a1bf6e6d… has kube_service-present/absent histories with 15 disputed timestamps. At 16:19 both 23419.413457431 and 23524.46958153 seconds remain available. Merchant bssqz has seven variants for three IDs, with four disputes each. | Current 0.1.3 preserves and plots both/all source histories. No arbitrary max/running/service priority is applied. Original scrape freshness is not established by evaluation timestamps. |
| metrics — replacement/coverage | Demo CPU has seven container identities; uptime has five. Several search-cook-grpc incarnations are distinct; two CPU incarnations have no uptime series in the tested interval. Chat fixed/recent each return three CPU and three uptime series. | IDs are preserved correctly; missing uptime is not zero or healthy. Consider per-container metric-coverage badges or aligned identity rows. |
| datadog_agent_events — inventory | Historical 15:55–16:19: 43 inventory hosts, six with only missing cluster rows, no conflicting nonempty cluster names. Of 18 hosts in end-window metric discovery, two lack a usable in-window cluster mapping. Requested demo/chat/merchant hosts all match local-comm-sandbox-use1-01. Recent 18:36–18:51: 37 inventory hosts, no missing-only/conflicting maps; demo/merchant old nodes absent, chat present. Current relative chat also resolves the same cluster. | Mapping is window-scoped and can be missing. Null inventory rows are ignored; no conflict is guessed away. Do not reuse a historical mapping as fresh without TTL/evidence. An optional bounded inventory lookback needs explicit freshness handling. |
| datadog_agent_events — event identity/time | Demo: ten accepted records, five warning records, no rejected/missing-timestamp/missing-tag items. All ten distinct inner times share ONE aggregation_key. Ingestion lag is about 12.141–26.799 seconds. | Current preservation of repeated items is correct. aggregation_key alone is unsafe for deduplication. No shared metric/event pod UID join was established. |
| Event window — query semantics | Search bounds outer _time; ordering/display use inner ev.timestamp. This is stated in the footer. Inner times can precede a custom ingestion bound. Metric queries use the same requested absolute bounds but native PromQL evaluation timestamps, not original scrape times. | Not a newly found conversion error. Be explicit during the demo about ingestion-time search versus event-time display. Do not promise a pure occurrence-time filter. |
| main — new classification fallback | 18:45–18:51 contains 5225 service-check-shaped rows, 30 agent_metadata-shaped rows and 94 other rows, all with _dataset_reason=no_rules_matched. Historical 15:55–16:19 also contains 21355 check-shaped and 787 other rows. | These recent fallbacks are not merely old leftovers. Inspect Search ingestion classification/taxonomy. Do not label all records as Stream routing failures: source attribution is incomplete, __inputId is absent in the sampled records. Pods currently do not read main. |
| datadog_service_checks — supporting data | Same recent six minutes: 195454 records, with check, host_name, tags and status present in the aggregate. | Supporting dataset is active. Some check-shaped records simultaneously go to main; identify the missing classification cases before claiming complete service-check coverage. |
| datadog_sketches — supporting data | Recent duration/request-size/response-size distribution rows have sketch.metric, sketch.host, sketch.tagsList. Counts respectively 29136 / 25377 / 27051 in 18:45–18:51. A fourth Istio DNS duration distribution also appears. | Metric names must be joined exactly. These are record counts, not unique series, usage proof or billing savings. Datadog active-configurations access remains unverified. |
| ifood_datadog — VERIFIED Cribl Lake dataset | Catalog provider/type cribl_lake, JSON storage; destination dynamicDataset=false and destPath=ifood_datadog. Bounded Lake queries succeed. Observed mixed schema: flat _metric/_value/_time/host/tag fields and nested sketch.metric/host/tagsList/distributionsList/dogsketchesList. Selected duration records include .count, .sum and the base sketch metric. | The previous Lake mapping uncertainty is resolved for this dataset. Future sketch cardinality must explicitly select sketch records and canonical tags; raw metric-name substring filtering mixes count/sum metrics with sketches. This finding is separate from Pods, which reads Lakehouse metrics/events only. |

The intake remains Datadog Agent → Cribl Stream → Cribl Search. Source datadog-agent-intake has sendToRoutes=false and direct connections to Search, Lake and Datadog; therefore the generic default Stream route is not authoritative for this input. No connection, pipeline, classification or dataset configuration was changed.

## Acceptance results and evidence channels

| Check | Result |
|---|---|
| Local source/build | Version 0.1.3; 20 existing unit/SSR tests passed; production build passed. The existing large JS chunk warning remains a performance caveat, not a build failure. |
| Existing browser suite | Three headless Edge tests passed: dark UI, selected labels, search/keyboard selection, warnings/details, narrow 420px layout, empty/error states and selection changes. Uses fixture responses, not the installed proxy. |
| Additional local running-app review | UTC requests, historical presets and rejecting >1h custom ranges passed. CPU403 left five uptime container cards and ten events visible. A delayed-response switch ended on chat with zero timeline rows; old demo results did not reappear. F1/F5 reproduced with controlled clock. Source key + abort + cleanup guard works in tested races. |
| MCP historical populated | Job 1794511700849.MVTSdV, exact 15:55–16:19 UTC: 10 events, 5 warnings, correct pod/host/cluster tags. No count discrepancy. |
| REST historical metrics | Exact app CPU query HTTP200: 7 series. Raw CPU HTTP200: 10 series. Uptime HTTP200: 8 full-label series / 5 identities. Cluster mapping verified by MCP. |
| REST chat 18:28–18:43 UTC | 3 CPU / 3 uptime series retained. MCP event job 1794511744467.D2wLIK completed with zero rows. |
| Recent snapshot 18:36–18:51 UTC | 3 CPU / 3 uptime series; matching inventory; event job 1794511743819.aLqEaG completed with zero. |
| Current relative MCP | -15m / now queries around 19:35–19:36 UTC: CPU job mq-1794512123734.GmOgb2 and uptime mq-1794512124817.IN8bqS each return 48 samples. CPU evaluated sample bounds are 19:20–19:35 UTC. Event job 1794512200523.CZeYE0 completed with zero; inventory job 1794512202405.YS62pr resolves cluster. Relative calls resolve now independently; these are not one installed-app refresh transaction. |
| Historical successful empty | chat-platform-api-f55b45fdd-5pwcm / i-027d5172c875ea4c2, 15:50–16:25 UTC: MCP job 1794511701557.bIpqxL completed with zero. Browser empty message remained distinct from permission/query failures. |
| Installed 0.1.3 / host proxy | NOT completed. Native computer pipe and browser access host were unavailable. Operator-token REST/MCP success and local injected API fixtures do not prove installed-user RBAC or proxy policies. Prior installed 0.1.1 success is user-reported. |

No bounded tenant query in this review returned an execution error. Existing tests cover a failed-job fixture with `<--- Last few GCs --->`; that historical failure was not reproduced in this run. Local permission/error checks were simulated HTTP403/400 and stayed errors. A completed zero-row job was never used as evidence of a failed query.

## Exact reproduction queries

Native REST query_range on `/products/lakehouse_engine_metrics/engines/ifood_logs/datasets/metrics/prom/api/v1/query_range`, start=1794498900, end=1794500340, step=60:

```promql
max by (host,kube_namespace,pod_name,container_name,container_id) (
  cri_cpu_usage{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}
) / 1000000000

container_uptime{host="i-0aab96982e6a2bbb3",pod_name="search-cook-grpc-6cbd9c9b98-6hx4p",kube_namespace="search-platform"}
```

For raw CPU comparison remove the max wrapper and divisor. For chat use host i-027d5172c875ea4c2, pod chat-platform-api-f55b45fdd-5pwcm, namespace chat-platform-api. Fixed recent start/end: 2026-11-12T18:28:00Z–18:43:00Z; current MCP checks use earliest=-15m/latest=now.

Known timeline, earliest=2026-11-12T15:55:00Z, latest=2026-11-12T16:19:00Z (MCP accepts these ISO values; app REST posts numeric seconds):

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

Selected-host inventory in the same time window:

```kusto
dataset="datadog_agent_events"
| where internalHostname == "i-0aab96982e6a2bbb3"
| summarize observations=count(), first=min(_time), last=max(_time)
  by host=internalHostname, cluster=meta["cluster-name"]
| limit 100
```

Recent main fallback audit, 18:45–18:51 UTC:

```kusto
dataset="main"
| summarize records=count() by _dataset_reason,
  has_check=isnotnull(check), has_agent_metadata=isnotnull(agent_metadata)
| limit 20
```

For future Lake sketch records, verified ID/schema supports this starting filter (do not mix .count/.sum flat metrics):

```kusto
dataset="ifood_datadog"
| where tostring(sketch.metric) == "istio.mesh.request.duration.milliseconds"
| project _time, metric=sketch.metric, host=sketch.host, tags=sketch.tagsList
| limit 100
```

The observed Lake structure and exact-name base sketch were verified with a three-record bounded sample; a full-window Lake cardinality/usage analysis was not performed.

## Decision

**Needs a fix before demo.** The fixed ten-event historical story and source-preserving uptime are demonstrable. Fix relative refresh freshness, disclose CPU max-source policy, and address historical discovery/completeness expectations before presenting the app as an operator monitoring view. F5/F6 are small robustness fixes. Separately review current no_rules_matched classification fallbacks; do not silently treat them as collector failures.

Remaining checks: installed 0.1.3 identity/proxy/RBAC; rendering in the actual Cribl iframe; overflow timelines against a real >100-record pod; original scrape freshness/authoritative source for conflicting gauges; classification correction validation; full Lake cardinality and Datadog active-configurations permissions. No source or tenant fixes were applied during this review.
