# Implementation notes — 2026-11-12

## 0.1.3 — uptime source preservation and dark Pods UI

Reproduced the installed-app selection from available metric series: pod `search-merchant-worker-577559b985-bssqz`, namespace `search-platform`, host `i-08ff4f240df07fcc9`, historical 2026-11-12 15:55–16:19 UTC. The native `container_uptime` query returned seven full-label series for three container IDs. The old grouping key ignored kube_service and pod_phase; it grouped incompatible source variants into one timestamp/value set and discarded all four timestamps in every container.

Full labels were compared locally: consul-template and search-merchant-worker differ by presence/absence of kube_service; istio-proxy also differs by pod_phase (pending/running). IDs are identical within each of those groups. The four evaluation timestamps are 16:16, 16:17, 16:18 and 16:19 UTC. At 16:19, competing values were:

| Container | Seconds returned at the same evaluation timestamp |
|---|---|
| consul-template | 16.256918778 / 153.224503277 |
| istio-proxy | 13.072679549 / 28.110264959 / 165.156605047 |
| search-merchant-worker | 22.929483712 / 160.17440092 |

This is not timestamp misalignment or rounding. The observed API data contains distinct source-label values on the same evaluation grid. `timestamp(container_uptime{...})` also returned HTTP200 with identical evaluation timestamps across variants, so it cannot establish original scrape freshness or choose an authoritative source. There is no supported justification for preferring max, a running tag, a service tag, or the first response row. The underlying cause of the source disagreement is not established as a collector defect.

Normalization now preserves a canonical full-label history under each container incarnation. Identical samples collapse; agreeing timestamps retain consensus history; differing source histories stay separately charted on a shared scale. Same-label conflicting observations remain explicit gaps, with all competing values accessible in details. Source order cannot change the result. The UI shows a disputed last-value range labeled “competing values”, not an invented uptime. All seven merchant source histories (four points each) survive. The known demo also retains its valid histories and separate container incarnations.

The Apple Design skill was read from `.agents/skills/apple-design/SKILL.md`. The actual local Smart Fit source was inspected: `smartfit-finops-intelligence/src/App.css`, `sffi.css` and `App.tsx`. Reused its #0a0e14 page, #161d28 panels, subtle borders, compact typography, status badges and chart treatment; iFood red is reserved for identity. Added explicit dark html class (including Capra portals), system type, immediate press/focus feedback, reduced-motion handling, selected resource context, readable axes, short incarnation IDs with full details, and severity filtering. The selector uses documented Capra `items` with `label`, replacing the old static custom items without textValue; search/selected text was verified locally.

Timeline summaries are plain escaped text: %%%, bold markers and footer clutter are removed from the default view, with original message retained in details. FailedScheduling is a prominent reason heading and warning badge; no unsafe HTML or Markdown execution is used.

Rechecks: native demo CPU HTTP200/7 series, uptime HTTP200/8 label series; MCP demo timeline job `1794506182487.TD1cA8` completed with 10 events; chat job `1794506182501.li7Q13` completed with zero; merchant timeline job `1794506189962.E6PARh` completed with 12 events, four FailedScheduling. Demo inventory job `1794506189319.IPglHG` and merchant inventory `1794506442680.rHiKBD` resolve `local-comm-sandbox-use1-01` alongside rows with no cluster, which are ignored. Merchant CPU HTTP200/2 series; seven uptime series reproduced the conflict. Other sampled merchant pods rqsqc/9hvm4 were also inspected and preserved different incarnations and valid partial history.

Verification: 20 local unit/SSR tests and three headless Edge UI tests passed. UI tests use selected historical API fixtures and cover dark mode, displayed labels, search and keyboard selection, dropdown focus, warnings/details, narrow layout, fast pod/range changes and distinct successful-empty/permission/query failures. Screenshots are marked LOCAL TEST REPLAY. Minimal selected-pod fixtures redact endpoints and exclude unrelated labels; neither fixtures nor screenshots are shipped in the app bundle. Live Cribl UI access was attempted but the native pipe and browser access host were unavailable. Installed 0.1.3 checks are in README and remain pending; 0.1.1 installed success was reported by the user.

No tenant configuration or deployment changed. Version 0.1.2 already existed, so this review package is the next patch 0.1.3. Datadog tag optimization stays deferred with the access and Lake mapping limitations below and in README.

## 0.1.2 — Search HTTP400 correction

Reproduced with a direct REST POST of the app's selected-host inventory query. ISO `earliest`/`latest` returned HTTP400: `Invalid relative time expression` (`absoluteRelativeTime`, paths `/earliest` and `/latest`). The identical query using numeric Unix seconds returned HTTP200, job `1794505392763.Mxo0z1`; the test job was cancelled with HTTP200. Search job creation now converts the UI's UTC ISO dates to numeric seconds and validates them before submission. Native metrics already used numeric seconds. Added a regression assertion on the actual serialized Search request and a test preventing invalid dates from submitting. HTTP messages now identify Search jobs, metrics range or discovery to distinguish failing paths. No tenant configuration changes were made.

Replace the review package 0.1.1 with 0.1.2. Installed app-user acceptance remains pending; direct REST reproduces the time-format defect but is not an installed-user proxy test.

Source plan: `Documents/Cribl/iFood-Kubernetes-POV/verified-implementation-plan-2026-11-12.md`.

The new local project is a focused Cribl App. Selected TypeScript/PostCSS and packaging scaffold files were reused from the local Logicalis project; its branding, queries, persistence and data were not copied. All query builders are in `src/domain.ts`; host-only API calls in `src/api.ts`; abort/stale-result handling in `src/useResource.ts`. There is no tenant deployment or configuration mutation.

Read-only rechecks in this implementation pass:

| Check | Evidence |
|---|---|
| MCP CPU cores, 15:50–16:25 UTC | mq-1794504947429.lNqVMt; completed, 86 samples |
| MCP uptime, same range | mq-1794504955459.XL0s4B; completed, 106 samples |
| MCP known timeline, 15:55–16:19 UTC | 1794504955465.lPAs8z; completed, 10 events |
| MCP chat timeline, 15:50–16:25 UTC | 1794504955547.AwVzob; completed, zero events |
| REST normalized CPU, 15:55–16:19 UTC | HTTP200, status success, matrix, 7 series |
| REST literal uptime, same range | HTTP200, status success, matrix, 8 series |
| REST known Search job status/results-poll | HTTP200; status in items[0], completed; NDJSON envelope plus 10 row lines |

Exact literal query builders are displayed in the app's Queries disclosure. All metrics paths use engine `ifood_logs`, dataset `metrics`; all log paths use `default_search`, dataset `datadog_agent_events`. No log-copy fallback is used.

Important adapter correction verified against REST: the `/status` response is a counted envelope (`items[0].status`), not necessarily a top-level status. Tests use this observed shape. Failed execution in NDJSON, a non-completed final status, parse failures, warnings or deadlines cannot become a successful empty result. Error messages avoid exposing raw server payloads; the job ID permits inspection in Search.

Known earlier event expansion failure: `<--- Last few GCs --->`. Broad expansion is not used; exact pod batches are filtered before mv-expand. This prefilter reduces workload but does not guarantee all pod queries succeed. Missing data and query failure remain separate.

Tests include minimal sanitized selected-pod event fixtures, not raw exports. The fixture replaces event message content; production queries display relevant selected-pod messages. Fixtures are outside `dist` and are not shipped as live data. No API keys, bearer credentials or unrelated payload data are bundled.

Limitations: first-slice discovery covers two namespaces; no full cluster/node/workload explorer, current pod phase, readiness, replica capacity or tag tab. No shared pod UID was established. Inventory resolution is time-bound and may be absent after retention. Repeated event items are deliberately retained; there is no unsupported aggregation-key-only deduplication. Search limits bound ingestion time, while the timeline uses inner event time.

Installed-user acceptance, Datadog read-access prerequisites, verified Istio simulation results and unresolved Cribl Lake dataset mapping are recorded in README.md. Local headless browser checks are described above; installed-host acceptance is not established by those checks, SSR or operator-token HTTP success.


# 0.1.4 review fixes

Collection remains Datadog Agent → Cribl Stream → Cribl Search. No tenant configuration or deployment changed.

Relative windows retain their mode: Refresh resolves the current clock once and shares the resulting UTC bounds with discovery, CPU, uptime, inventory and events. Historical/custom ranges remain fixed. The label names the mode and both dates across midnight. Request keys and abort guards continue to prevent older responses from replacing a newer selection.

Discovery now uses query_range at 60-second evaluations over the selected interval (maximum one hour), rather than one instant at the end. Its scope remains search-platform and chat-platform-api. Very short-lived pods between evaluations or pods without CPU observations may still be absent.

CPU reads full source-label series with nanocores / 1000000000. It groups by host/namespace/pod/container name/container ID, plots the maximum at each evaluation timestamp, and exposes disputed timestamps, full labels and competing values in details. Uptime continues to preserve separate source histories, with gaps. Neither panel infers pod totals or scrape freshness.

Events prefilter batches before expansion and request 101 items. The extra item marks truncation; at most 100 are displayed and warning counts explicitly cover displayed rows. A raw response cap remains visible even if correlation or timestamp validation excludes items. Shared aggregation keys are not deduplicated. Null, empty, non-finite and nonpositive inner timestamps are excluded with a separate invalid-time count. Search bounds ingestion time; the timeline displays inner event time.

## Validation

- Unit/SSR regressions cover the relative snapshot, 24 original CPU disputes / seven identities, disappeared historical pod, 101-event overflow, five demo warnings, invalid timestamps and cross-midnight label.
- Browser tests cover shared bounds at 18:31–18:46 UTC after advancing from 18:43 to 18:46, unchanged historical/custom refresh, delayed response selection changes, overflow counts, dark layout, keyboard navigation and empty/permission/query states.
- MCP fixed demo, November 12 15:55–16:19 UTC: completed job 1794513179544.xIVw2M, ten events and five warnings. Chat 15:50–16:25: completed job 1794513189491.Ntqkkb, zero events.
- REST exact CPU evidence query: HTTP200, ten source series. Interval discovery: HTTP200, 210 series / 73 pods, including search-merchant-worker-577559b985-9hvm4, absent at the old end-only discovery instant.
- Installed operator UI/proxy/RBAC not checked: computer-use returned “The browser access host is unavailable” and a missing native pipe. Local fixtures and operator-token API access are separate evidence.

## Future tag deliverable

Cribl Lake dataset ID ifood_datadog is verified, with mixed flat _metric/_value rows and nested sketch.metric/sketch.host/sketch.tagsList distributions. Future cardinality must select exact base sketches, excluding count/sum rows. Prior observed Istio duration pod_name simulation: 1,974 → 1,917 metric + host + canonical-tag combinations, not billing savings. Datadog active-configurations read permissions and usage remain unverified.

## Installation for review

Run npm ci, npm test, npm run test:ui, then npm run package -- --version 0.1.4 and node scripts/verify-package.mjs. Import build/ifood-kubernetes-pov-0.1.4.tgz into Cribl Apps using an authorized installer. Review declared policies and share with the existing operator. No installation is performed in this pass.

Installed acceptance pending: shared advancing refresh bounds through host proxy; historical ten events/five warnings and inventory cluster; CPU evidence disclosure and competing uptime histories; successful empty chat; keyboard/narrow iframe layout; operator RBAC for query_range and Search jobs. Supporting routing gaps do not change the Pods read path.


# 0.2.0 — Analyze Cardinality

Analyze Cardinality is the default view. Pods remains available for retained telemetry investigation. No tenant configuration, deployment, collectors, routes or tag-removal policies changed.

## Verified Lake measurement

Read through Cribl Search dataset **ifood_datadog** (Cribl Lake), November 12, 2026, **15:02–15:10 UTC**. All 6,547 output groups were retrieved after execution completed, with no invalid or duplicate groups and no sentinel. Source groups represent 107,849 sketch records across three metrics. Full tag strings are canonicalized; multiple values of one key remain distinct. Host is always preserved.

| Exact base distribution | Records represented | pod_name control | Reduction |
|---|---:|---:|---:|
| istio.mesh.request.duration.milliseconds | 38,242 | 3,296 → 3,169 | 127 / 3.85% |
| istio.mesh.request.size | 33,950 | 1,602 → 1,525 | 77 / 4.81% |
| istio.mesh.response.size | 35,657 | 1,649 → 1,568 | 81 / 4.91% |

The duration result independently reproduces the previous Search reference using Cribl Lake. It is not a billing estimate. The strongest **tested** global change is duration minus ifood_requester_service + pod_name: **3,296 → 2,743**, 553 fewer combinations / **16.78%**. The strongest tested single tag is ifood_requester_service: 3,296 → 2,848, 448 fewer / 13.59%. This business dimension may support investigations; dependency evidence is unverified, so neither is approved for removal.

The ranked search evaluates every observed single tag and pairs of the six strongest single tags. Arbitrary multi-tag combinations can also be simulated. It does not claim a global optimum over every possible tag subset.

For a narrow **control draft**, pod_name on duration in kube_namespace:istio-system yields **153 → 104**, 49 fewer / 32.03%, over 972 sketch records. This is the largest pod_name-only reduction among observed namespaces. It remains blocked by Datadog usage access and encoder/preview validation. In search-platform, the tested business-tag pair yields 199 → 127 (72 / 36.18%), versus pod_name alone 199 → 188 (11 / 5.53%). No validated first pilot can be selected while usage is unverified. The UI offers the highest-impact review candidate only after narrow-scope, complete Lake and successful no-use checks.

## Schema and exact query

Base records have sketch.metric, sketch.host and sketch.tagsList. Observed scope keys include env, kube_namespace and service, with 1,300 distinct scope key/value pairs across the three metrics in this window. Distribution payload paths are sketch.distributionsList and sketch.dogsketchesList. Sampled dogsketch points contain ts, cnt, min, max, avg, sum, kList and nList. The sampled distributionsList is empty and dogsketchesList has one item.

Flat _metric/_value records coexist in Lake, including count/sum metric variants. Exact sketch.metric filtering excludes these; no flattened metric-name substring is used.

```kusto
dataset="ifood_datadog"
| where tostring(sketch.metric) in ("istio.mesh.request.duration.milliseconds","istio.mesh.request.size","istio.mesh.response.size")
| project _time, metric=tostring(sketch.metric), host=tostring(sketch.host), tags_json=tostring(sketch.tagsList)
| summarize records=count(), first=min(_time), last=max(_time) by metric,host,tags_json
| order by metric asc, host asc, tags_json asc
| limit 10001
```

One hour is the maximum query window. The 10,001st group is a sentinel; results are bounded to 10,000 groups and explicitly sampled/truncated if hit. Scope filtering applies to returned groups; an incomplete global sample never becomes a complete scope estimate. The calculation/query/parser accept an explicit metric list for reuse after another metric's schema is verified; the UI exposes the three verified names.

Two corrections were verified:

1. Grouping an array directly caused Search to omit tags from output and collapse to metric/host groups. The JSON-string grouping above preserves the complete tag key. Missing tags are rejected.
2. Reading a sorted aggregate while workers are still producing rows reproduced a 3,096 duration baseline instead of 3,296, despite 6,547 returned rows. The analyzer now waits for completed status before paging, validates reported totals, and marks repeated exact groups partial. The corrected production REST adapter completed in **15.465 seconds**, returning the reference counts with zero duplicates.

## Datadog access and evidence

The existing native Datadog destination is configured for **site us**, so the backend domain is **api.datadoghq.com**. Read-only secret metadata GET returned HTTP200 and confirmed its referenced Stream secret exists. No secret value was logged or copied.

**Live Datadog read access remains unverified.** The existing Stream textSecret is an ingestion credential reference, not a supported app proxy-expression lookup. App Platform instructions support encrypted app-scoped KV header injection; they do not establish direct reuse of a Stream secret. No application-key mapping was provisioned and the new release is not installed. There was no authenticated Datadog read call in this pass; HTTP403 screenshots are explicitly mocked tests, not a tenant permission diagnosis.

Minimum setup after review: an authorized administrator must securely provision encrypted app-scoped KV values **datadogApiKey** and **datadogAppKey**, using the US Datadog API key and a scoped application key with **metrics_read**, **monitors_read**, **dashboards_read**. The package's default/proxies.yml injects these server-side. No secret entry/readback UI exists; browser requests contain only Accept, never credentials. Do not decrypt/copy the existing Stream secret through the browser. If additional API/RBAC errors occur, preserve Usage unverified and inspect only sanitized status/path information.

Read paths:

- GET /api/v2/metrics/{exact dotted metric}/active-configurations?window[seconds]=604800. Seven-day rolling lookback from now; minimum supported value is 14,400 seconds. This is separate from the historical Lake window. Datadog returns active tag keys/aggregations, not individual query IDs.
- GET /api/v1/monitor?page_size=100&page=N, up to 300 readable definitions. Direct syntactic metric/tag references include filters and group-bys; referenced IDs and links are shown.
- GET /api/v1/dashboard?count=21&start=0; at most 20 readable definitions fetched via GET /api/v1/dashboard/{id}. Template-variable prefixes are included. This API returns custom/cloned dashboards, **not preset dashboards**. Caps, malformed definitions and failed reads remain unverified.

Configuration scans are current readable-identity snapshots, not historic or organization-wide proofs. The scanner is conservative and syntactic; indirect composite-monitor dependencies, formula lineage and dynamic metric substitutions still require owner review. The three evidence states remain distinct: Dependency found; No usage observed in the checked scope; Usage unverified. Positive references survive an incomplete scan, but incomplete absence never establishes no-use. Each evidence card shows snapshot time, checked counts and coverage.

## Reviewable Stream pilot — no executable deployment

The current source has sendToRoutes=false and direct output connections. Its Lake connection has no transformation pipeline; the Datadog connection has an existing health-prune pipeline. Preserve those connections and existing functions. Do not install a common input transform or route-based policy that would also erase the retained Lake detail.

The exported review contains an **explicitly disabled** Eval function, matching one exact metric and an original scope tag. It edits only sketch.tagsList and includes retention, rollback, evidence gates and before/after acceptance. Local tests cover quotes, commas and slash-containing tag keys, exact metric/scope boundaries and unchanged sketch points.

Primary Cribl documentation confirms native Datadog output supports distribution metrics; actual source/Lake records and existing pipeline config confirm nested sketch fields can be addressed. **The exact outbound dogsketch serializer after transformation has not been previewed or accepted by Datadog in this pass.** Therefore the function is a review draft, not an approved executable policy. Mandatory gate: test the native Eval and encoder with a retained capture; compare complete dogsketchesList/distributionsList and delivery success before enabling.

Validation: compare metric+host+remaining canonical tags, actual compressed/uncompressed outbound bytes, Datadog ingested/indexed volumes and iFood billing terms. The byte number in the UI is only a weighted tag-array JSON-fragment simulation (duration pod_name control: **2,001,554 bytes** over represented records), excluding transport, compression, points, batching and other fields.

For distributions, use original and transformed copies of the **same** capture in isolated baseline/pilot canary metrics or a test org after serialization is verified. Compare point counts, sum(cnt), p95/p99 over identical timestamps and retained dimensions. Do not double-send the same production metric and do not average sketch percentiles. Rollback disables/removes only the new Eval and restores the saved Datadog-only revision; original Lake detail stays queryable.

## Evidence and acceptance

- MCP base sample: 1794514580220.OWFbUc. Complete JSON-group job: 1794514709747.STP3DE, all seven pages retrieved. Exact production query job: 1794515504466.XOYh5C, completed, 6,547 rows.
- Exact production REST client: authenticated operator-token run passed, 15.465 seconds, no duplicate groups; this is not installed-host proxy/RBAC evidence.
- Local: 34 unit/SSR tests; browser tests cover real MCP Lake replay with mocked Datadog success/403/incomplete scans, partial Lake results, failures, narrow/mobile review and existing Pods interactions. Screenshots carry replay labels. Production build/package checks are recorded with delivery.
- No live Datadog definitions/query usage, Stream preview/pilot bytes, volume/billing, p95/p99 acceptance, installed 0.2.0 identity/proxy/RBAC or preset-dashboard/indirect dependency audit was completed.

## Installation for review

Build with npm run package -- --version 0.2.0; verify with node scripts/verify-package.mjs. An authorized installer can upload build/ifood-kubernetes-pov-0.2.0.tgz. Review policies and the US Datadog proxy. Provision server-side encrypted credentials separately, share with the intended operator, then validate Lake access and live Datadog read paths. No install or secret provisioning was performed here.

Primary references: https://docs.cribl.io/stream/destinations-datadog/ ; https://docs.cribl.io/stream/sources-datadog-agent/ ; https://docs.datadoghq.com/api/latest/metrics/list-active-tags-and-aggregations/ ; https://docs.datadoghq.com/api/latest/monitors/get-all-monitors/ ; https://docs.datadoghq.com/api/latest/dashboards/get-all-dashboards/ . Proxy/KV behavior is documented in the project's AGENTS.md.

Final 0.2.0 validation: 34 unit/SSR tests and 11 browser tests passed. The common Search adapter waits for completion before reading sorted result pages. Retained Pods through the production REST adapter returned 10 events, 5 warnings, zero rejected, the expected sandbox cluster, and successful zero chat events. Native REST CPU returned 10 source series and uptime 8. Installed app access remained unavailable (browser host/native pipe).

Final delivery checks: 34 unit/SSR tests and 11 browser checks passed; production build and package verification passed. Retained Pods live REST returned ten events/five warnings, expected cluster and successful zero chat events; native CPU returned ten source series and uptime eight. Original-detail query for kube_namespace:istio-system completed (MCP job 1794517039965.40A2kD), capped at 101 rows; three inspected rows matched the scope and contained dogsketch points. Preview must also prove fan-out isolation and merging of colliding tag sets without last-write sample loss. Installed access remained unavailable.
# 0.2.1 credential diagnostics and secret reuse status

Tenant read-only checks found installed 0.2.0 on Stream 4.20.4-9651be2b; the proposed Apps GSM discovered/mappings/combined endpoints all returned 404. Direct runtime support is unverified. No secret values were read or copied. The KV-compatible proxy remains unchanged; metadata-only preflight lists names and reports missing datadogApiKey/datadogAppKey separately for all three checks. It does not establish encryption or value validity.

The documented Stream REST Collector expression for reusing the Global Secret is C.Secret('DD_API_KEY', 'text', 'secrets-datadog').value. Collector authentication has not been executed. A separate Worker-accessible Application Key secret, result dataset, sanitized scan contract and an asynchronous app/job bridge still require reviewed tenant setup. Apps KV cannot be assumed to resolve inside the Collector. The package does not enable GSM or a Collector. Destination and disabled Stream pilot remain unchanged.

Configuration, exact proposals, endpoint evidence and acceptance gates are in the local docs/RELEASE-0.2.1.md and the accompanying secret-reuse-validation report. API Key source is shown explicitly in the UI. Both encrypted KV entries remain required in this build. Never use C.Secret in Apps proxy expressions.



# 0.2.2 — Datadog reads through Stream Global Secrets

Replaced App KV proxy reads with bounded Stream REST Preview collection and job-specific response capture. The app never reads credential values or sends direct browser requests to Datadog. Both Global Text secrets are resolved by the default Worker Group. No persistent Collector or schedule is created. Production routing is disabled, unfinished jobs are cancelled and artifacts have a one-hour TTL.

The Stream source field omits URL query parameters; correlation validates the exact job ID plus the Datadog endpoint. Responses must be valid JSON and the job must finish with exactly one collected event. Missing/duplicate/foreign responses, execution failures and timeouts never become successful empty evidence.

Live code validation: 17 active tags; 300 monitors capped; 20 dashboards capped. The Istio Inbound Requests by Service dashboard references pod_name and ifood_requester_service. Coverage remains incomplete at scan caps. Existing Pods and cardinality calculation behavior is retained.

Validation: unit/transport tests, browser replay checks, build, package inspection, then app-scoped live validation. Rollback: reinstall the retained 0.2.1 package; its KV proxy path requires its own encrypted credentials. No tag policy, Stream destination or secret is changed by upgrading the app.


# 0.2.3 — Complete readable Datadog inventories

Removed the 300-monitor and 20-dashboard scan caps. Page monitor and dashboard inventories in groups of 100 until a short terminal page, including an empty last page for exact multiples. Detect duplicate IDs, changing totals and missing definitions rather than claiming complete coverage. Read every listed dashboard in bounded batches of up to 25 on Stream; failed batches fall back to individual reads.

Close the NDJSON capture as soon as every requested endpoint response arrives, avoiding the full multi-Worker capture duration. Require a finished job with the expected event count and one valid response per exact job/endpoint. No credential values, production routing or schedules are introduced.

Retry transient HTTP 429/500/502/503/504 on Stream with bounded exponential backoff and Retry-After support; retry transport and capture failures at the caller. Show live scan progress and preserve dependencies found in completed pages. Stop on cancellation or a 30-minute run deadline. All readable means the configured keys' accessible inventory during the scan; preset dashboards and inaccessible definitions remain outside API coverage.

Validation includes pagination beyond both former caps, dependencies on the last page, terminal empty pages, duplicate detection, unreadable definitions, transient failures, multi-response capture completion and browser progress. Rollback is the retained 0.2.2 archive. Secret folders, Stream destinations, schedules and Datadog definitions are unchanged by this release.


## 0.2.4 — histórico, português e cardinalidade Lakehouse × Datadog

JSON KV uses text/plain, hashed exact metric/tag identity, immutable definition shards and last-published manifest. Dashboard reuse requires an identical valid modified_at and a successful read less than seven days old; missing revisions and failed reads are retried. Monitor inventory is always paged during explicit refresh. Cached negative results remain stale for pilot gating. Current comparisons use datadog_sketches and one-hour /volumes plus bounded /estimate reads; distribution estimator type is validated. No automatic policy deployment or telemetry mutation.
