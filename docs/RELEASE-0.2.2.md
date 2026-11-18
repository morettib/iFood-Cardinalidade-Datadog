# 0.2.2 — Datadog reads through Stream Global Secrets

Replaced App KV proxy reads with bounded Stream REST Preview collection and job-specific response capture. The app never reads credential values or sends direct browser requests to Datadog. Both Global Text secrets are resolved by the default Worker Group. No persistent Collector or schedule is created. Production routing is disabled, unfinished jobs are cancelled and artifacts have a one-hour TTL.

The Stream source field omits URL query parameters; correlation validates the exact job ID plus the Datadog endpoint. Responses must be valid JSON and the job must finish with exactly one collected event. Missing/duplicate/foreign responses, execution failures and timeouts never become successful empty evidence.

Live code validation: 17 active tags; 300 monitors capped; 20 dashboards capped. The Istio Inbound Requests by Service dashboard references pod_name and ifood_requester_service. Coverage remains incomplete at scan caps. Existing Pods and cardinality calculation behavior is retained.

Validation: unit/transport tests, browser replay checks, build, package inspection, then app-scoped live validation. Rollback: reinstall the retained 0.2.1 package; its KV proxy path requires its own encrypted credentials. No tag policy, Stream destination or secret is changed by upgrading the app.
