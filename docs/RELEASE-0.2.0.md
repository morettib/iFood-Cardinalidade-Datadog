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

Final delivery checks: 34 unit/SSR tests and 11 browser checks passed; production build and package verification passed. Retained Pods live REST returned ten events/five warnings, expected cluster and successful zero chat events; native CPU returned ten source series and uptime eight. Original-detail query for kube_namespace:istio-system completed (MCP job 1794517039965.40A2kD), capped at 101 rows; three inspected rows matched the scope and contained dogsketch points. Preview must also prove fan-out isolation and merging of colliding tag sets without last-write sample loss. Installed access remained unavailable.
