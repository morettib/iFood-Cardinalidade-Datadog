# 0.2.1 — Secret reuse investigation and credential diagnostics

This release does **not** enable Global Secret reuse. It ships the verified KV-compatible path and a read-only credential-name preflight. It never reads KV credential values or Global Secret values into frontend code. No tenant changes, deployment, Collector, secret mapping or Stream pilot were applied.

## Verified versus proposed

The installed app remains 0.2.0 (GET /api/v1/apps, HTTP 200). The local 0.2.0 archive contains default/proxies.yml with DD-API-KEY: kv.datadogApiKey and DD-APPLICATION-KEY: kv.datadogAppKey. Installed app metadata does not return its effective proxy configuration, so the installed override was not verified.

GET /api/v1/system/info returned HTTP 200: BUILD.VERSION is 4.20.4-9651be2b, branch v4.20.4, build timestamp 2026-10-26T22:40:12.260Z. Do not infer tenant feature availability from current documentation or a later design document. Metadata GET /api/v1/m/default/system/secrets returned HTTP 200 and confirmed secrets-datadog/DD_API_KEY exists. This does not prove authenticated runtime resolution. App KV key-name listing returned HTTP 200 and [] for prefix datadog.

The internal Apps GSM Migration requirements (updated November 2, 2026) describe secret.<slot> expressions, admin secret-mapping.yml and folder sharing.apps. They explicitly block C.Secret() in Apps proxy expressions. The document proposes multiple API alternatives; it is not proof of release availability. Read-only checks against the installed tenant returned:

| Path | HTTP |
|---|---:|
| /api/v1/a/ifood-kubernetes-pov/secrets/discovered | 404 |
| /api/v1/a/ifood-kubernetes-pov/secrets/mappings | 404 |
| /api/v1/a/ifood-kubernetes-pov/secrets | 404 |

404 does not establish whether the cause is rollout, routing or permissions. Do not install an unverified secret expression. No secret mapping was written and no live Datadog call was authenticated. Current Builder Guide documents encrypted KV as the supported credential path. No verified direct server-side Global Secret runtime API is available to this release.

## Working configuration (compatible with 0.2.0)

Apps → Installed → ifood-kubernetes-pov → Settings → Key-Value Stores:

| Key | Value format | Encrypted |
|---|---|---|
| datadogApiKey | <DATADOG_US_API_KEY> | true |
| datadogAppKey | <DATADOG_US_APPLICATION_KEY> | true |

Two raw text values, no JSON, Bearer prefix or wrapping quotes. Do not insert placeholders. Existing entries remain usable. Site is https://api.datadoghq.com. Application Key needs metrics_read, monitors_read, dashboards_read. No settings mutation is performed by the app. The screen identifies the currently packaged API-key source as encrypted app KV; it does not guess from secret metadata.

Preflight lists key names only. Missing entries produce three Usage unverified cards with zero checked definitions and the exact missing names. A successful list proves presence only, not encryption, value validity or Datadog permissions. HTTP/transport/malformed-list failures also stay unverified. Only successful authenticated read responses can establish credential resolution. Check the actual Encrypted switches in Installed App Settings.

## Direct Apps GSM proposal — not installed or bundled as active config

After the platform owner confirms rollout and supported mapping API, a future admin-reviewed proxy can use:

```yaml
api.datadoghq.com:
  headers:
    inject:
      DD-API-KEY: secret.datadogApiKey
      DD-APPLICATION-KEY: kv.datadogAppKey
```

Admin mapping (logical reference, not credential data): datadogApiKey → secrets-datadog/DD_API_KEY. Folder must permit Apps access. Do not add C.Secret() or a folder path as a string-valued API header. Keep the KV proxy configuration as the rollback profile; this proposal does not verify a mixed-expression automatic fallback. Do not change only the manifest without updating the preflight source mode. Live acceptance requires a real installed proxy call, both source names visible without values, three checked evidence cards, and explicit old-KV compatibility checks. Mapping API payload and path must be confirmed against the tenant's shipped OpenAPI, not selected from the two design alternatives.

## REST Collector alternative — exact review proposal

REST Collector documentation permits C.Secret in Collect header expression fields. Global Secrets documentation requires the folder as the third argument:

```js
C.Secret('DD_API_KEY', 'text', 'secrets-datadog').value
```

This is the **documented reuse path**, not a successful tenant runtime test. Global Secret folders must be available to the chosen Worker Group. Do not use C.Secret('secrets-datadog/DD_API_KEY','text') without the folder argument.

For the first control Collector, an administrator can review these exact UI settings (create separately; no existing Collector or Destination overwritten):

- Collector ID: ifood_datadog_active_configurations_review
- Authentication: None (authentication comes from Collect headers)
- Collect method: GET
- Collect URL expression: 'https://api.datadoghq.com/api/v2/metrics/istio.mesh.request.duration.milliseconds/active-configurations'
- Collect parameter name: window[seconds]; value expression: 604800
- Collect header DD-API-KEY value expression: C.Secret('DD_API_KEY', 'text', 'secrets-datadog').value
- Collect header DD-APPLICATION-KEY: requires a separately provisioned Worker Group-accessible Text secret, e.g. C.Secret('DD_APP_KEY', 'text', 'secrets-datadog').value. This is a proposal, not an existing secret. There is no verified bridge from Apps encrypted KV datadogAppKey into Stream's expression runtime. Do not silently copy its value.
- Run ad hoc only after review, using Stream's documented Run Collector workflow; no recurring schedule in this pass.
- Keep the response JSON intact. Use a dedicated sanitizing pipeline and a dedicated Search dataset proposed as datadog_tag_usage (not provisioned/verified). Never emit request headers, auth material or Collector diagnostics into the dataset.

Further Collectors/requests need GET /api/v1/monitor?page_size=100&page=N (up to three pages) and GET /api/v1/dashboard?count=21&start=0 followed by GET /api/v1/dashboard/{id} for up to 20 readable definitions. Current dashboard API excludes presets. Preserve scan caps and failures, even when other requests succeed.

Review result contract: run_id, exact metric, checked_at, lookback_seconds, kind (queries/monitors/dashboards), checked, total, complete, sanitized http_status/error_origin and references [{id,label,url,tags}]. Failures must produce incomplete coverage, never an empty successful snapshot. Reject stale snapshots. Do not put credentials into this contract.

REST collection supports ad-hoc execution. It is asynchronous collection, not an immediate Apps fetch response. Preserving the exact one-click flow requires a verified App/backend-to-job invocation API, job polling, correlation by run_id, result dataset mapping and RBAC. None is configured or implemented here; the app continues using its working direct KV proxy. A scheduled snapshot alone must not be represented as an on-demand check.

## Acceptance remaining

- Direct GSM: platform capability/mapping API, Apps folder sharing, successful secret resolution, KV compatibility and installed proxy/RBAC.
- Collector: separate Application Key secret/access, exact header expression runtime, response sanitation, result dataset and asynchronous on-demand bridge.
- Current KV path: both encrypted entries absent at inspection; no Datadog authenticated read. queries, monitors and dashboards all unverified. Evidence for pod_name and ifood_requester_service is unverified.
- All paths: source identity visible without values; successful endpoint responses or sanitized errors; scan scope clearly reported. No pilot enabled.

References: project AGENTS.md header expressions; https://docs.cribl.io/apps/builder-guide/ ; https://docs.cribl.io/stream/collectors-rest/ ; https://docs.cribl.io/stream/expressions-other/ ; https://docs.cribl.io/stream/global-secrets-add-use/ . Internal investigation: Apps GSM Migration - Expectations!, https://taktak.atlassian.net/wiki/spaces/TPM/pages/6427443211 (design evidence, not tenant runtime proof).

## Local delivery checks
37 unit/SSR tests and 12 Playwright browser tests passed. Production build passed (inherited large-chunk warning). Tests use mocked KV name lists and Datadog responses; they are not proof of live secret resolution. No deployment or tenant configuration writes occurred. Package: build/ifood-kubernetes-pov-0.2.1.tgz.

