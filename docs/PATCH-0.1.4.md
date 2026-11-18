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
