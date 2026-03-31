# Observability Learning Plan v4 — Context Prompt

> Paste this entire file at the start of any new conversation to resume exactly where you left off.
> Update the **Current Status** section after every session.

---

## Who I am

- Full stack developer — Node.js / JavaScript ecosystem
- Load balancer engineer with networking background
- Works across system architecture, cloud architecture, DevOps, SRE
- Based in Andhra Pradesh, India
- Learning phase — not building production systems

---

## My primary goal

Learn **microservices observability** by building a real, incremental system.

**Observability is the primary objective. The app is the vehicle, not the destination.**

The three pillars I want to master:
- **Logs** — Loki, Dozzle
- **Traces** — Tempo, OTel SDK
- **Metrics** — Prometheus, exporters, native endpoints

Plus:
- **Ingestion pipeline** — OTel Collector (central routing layer)
- **Dashboards** — Grafana (unified view of all three signals)
- **Alerting** — Alertmanager (active vs passive observability)

---

## The project — E-commerce order platform

**One sentence:** Customer browses products, places an order, inventory is checked, warehouse is notified, customer gets confirmation.

This project was chosen because:
- Domain is instantly understandable — zero time spent on business logic
- Every service added has a natural, inevitable business reason
- Generates high-frequency events that make all three signal types meaningful
- A single user action (place order) touches multiple services — rich tracing story

---

## Core learning principles

1. **Incremental only** — one service, one new concept per step
2. **Always working** — every step produces a runnable, observable system before moving to the next
3. **Each step answers one question** — *what does this add that I could not see before?*
4. **No two new concepts in one step**
5. **Small steps, not leaps** — understanding compounds, never overwhelms
6. **Every observability tool must have traffic to observe** — k6 simulator grows with the system
7. **Learn from failures at every step** — break something, diagnose it with only the tools you have, feel the limitation

---

## Traffic simulator — k6

k6 runs as a Docker container from Step 1 onward. It is not a separate step — it is infrastructure that evolves alongside the system.

**Why k6:**
- Scripts are plain JavaScript — no new language
- Runs as a Docker container in docker-compose
- Built-in scenario support: ramp-up, spike, soak, stress
- Industry standard for load testing in SRE teams

**How k6 evolves:**
- Step 1: exercises product service CRUD + reserve + error paths
- Steps 9–10: updated for DB-backed and cache-backed responses
- Steps 11–12: triggers message publishing and async processing
- Steps 14–15: exercises order flow through API gateway
- Steps 18–21: covers new services (MinIO, search, inventory, cron)

Each step that adds new endpoints or services specifies what k6 scenarios are added or updated.

---

## Fault injection

Built into the product service from Step 1. Controlled via environment variables, off by default.

| Env var | Effect | Default |
|---|---|---|
| `FAULT_LATENCY_ENABLED` | 10% of requests get 200–2000ms random delay | `false` |
| `FAULT_ERROR_ENABLED` | 5% of requests return 500 with error log | `false` |

Not a learning step — a utility. Flip the switch whenever you need observable variance.

---

## Observability stack (final state — built incrementally)

| Tool | Role |
|---|---|
| Dozzle | Raw container stdout tailing during development |
| Prometheus | Metrics storage — scrape-based pull model |
| Grafana | Unified dashboards — logs + traces + metrics |
| OTel Collector | Central ingestion pipeline — receives from all services, routes to backends |
| Loki | Log aggregation and storage — queryable via LogQL |
| Tempo | Distributed trace storage — queryable via TraceQL |
| Alertmanager | Active alert routing from Prometheus rules |

---

## Three ingestion models covered

| Model | Example in this plan |
|---|---|
| OTel push (SDK in app) | Node.js, Python, Go services push via OTLP to OTel Collector |
| Prometheus scrape via exporter sidecar | postgres-exporter, redis-exporter |
| Native Prometheus endpoint | RabbitMQ, MinIO, Meilisearch expose `/metrics` directly |

---

## Step structure

Every step contains:
- **New concept** — the one thing you learn
- **Services** — what's added or changed
- **k6 changes** — what traffic exercises the new concept
- **What to test** — concrete verification procedure
- **Break and debug** — break something, diagnose with current tools, feel the limitation
- **What you CANNOT do yet** — motivation for next step

Three dedicated **Practice Steps** appear at milestones where your toolset reaches a new capability level. These produce no new infrastructure — only debugging exercises.

---

## All 22 steps

---

### Phase 1 — Foundation (Steps 1–3)

---

#### Step 1 — Product service + k6 + Dozzle

**New concept:** Raw container log visibility — before instrumenting anything, see what the service outputs.

**Services:** Product service (Node.js/Express), k6, Dozzle

**Product service endpoints:**

| Method | Route | Behavior | Signal it produces |
|---|---|---|---|
| `GET` | `/products` | List all, supports `?category=` filter | Varying response sizes |
| `GET` | `/products/:id` | Single product by ID | 404 on invalid ID |
| `POST` | `/products` | Create product with validation | 400 on bad payload, 201 on success |
| `PUT` | `/products/:id` | Update product fields | 404, 400, 200 |
| `DELETE` | `/products/:id` | Remove product | 404, 204 |
| `POST` | `/products/:id/reserve` | Decrement stock quantity | 409 on insufficient stock |
| `GET` | `/health` | Liveness check | Baseline signal |

- In-memory data store (no DB until Step 9)
- Seeded with ~25 products across 4 categories on startup
- `console.log` for every request: method, path, status, duration
- Fault injection env vars available but off by default

**k6 scenarios:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `baseline` | 2–3 req/sec, all endpoints mixed | Steady-state across CRUD |
| `read_spike` | Ramp GET /products to 20/sec for 30s | Browsing surge |
| `write_storm` | Rapid POST + PUT + reserve calls | Stock depletion, validation errors |
| `error_gen` | Nonexistent IDs, invalid payloads, depleted stock | 400, 404, 409 errors |
| `mixed_realistic` | 70% reads, 20% writes, 10% bad requests | Closest to real user behavior |

**What to test in Dozzle:**
1. Open Dozzle → see live stdout from product-service and k6 containers
2. Run `baseline` → watch request logs flow
3. Run `error_gen` → spot 4xx errors in the stream
4. Run `write_storm` → watch reserve calls deplete stock, 409s appear

**Break and debug:**
1. Run `mixed_realistic`. While traffic is flowing, `docker compose restart product-service`. Open Dozzle. Can you tell from the logs exactly when the service went down and when it came back? Can you see the k6 errors during the restart window?
2. Run `error_gen`. Try to answer: which endpoint produces the most errors? You'll have to eyeball-scroll through Dozzle. Notice how painful this is — no search, no filter, no count. Remember this feeling. It's the exact problem Step 5 (Loki) solves.

**What you CANNOT do yet:**
- Search/filter logs (Step 5 — structured logging, Step 6 — Loki)
- See request rate as a number (Step 2 — Prometheus)
- Graph error rate over time (Step 3 — Grafana)
- Trace a request lifecycle (Step 7 — Tempo)

---

#### Step 2 — Add Prometheus

**New concept:** Metrics scrape model — time-series numerical data, pulled by Prometheus on a schedule.

**Services:** + Prometheus

**Changes to product service:**
- Add `prom-client` library
- Expose `GET /metrics` endpoint (Prometheus-format text)
- Instrument:
  - `http_requests_total` counter — labels: `method`, `route`, `status`
  - `http_request_duration_seconds` histogram — labels: `method`, `route`
  - Default Node.js metrics: event loop lag, heap size, GC duration, active handles

**Prometheus config:**
- Scrape product-service `/metrics` every 15s
- Scrape itself for self-monitoring

**k6 changes:** None. Existing traffic generates metrics immediately.

**What to test:**
1. Run `baseline` → open Prometheus UI (port 9090) → query `http_requests_total` → see counters climbing
2. Run `read_spike` → query `rate(http_requests_total[1m])` → see rate increase
3. Run `error_gen` → query `http_requests_total{status=~"4.."}` → see error counters
4. Enable `FAULT_ERROR_ENABLED=true`, run `mixed_realistic` → query `rate(http_requests_total{status=~"5.."}[1m])` → see 500 rate
5. Enable `FAULT_LATENCY_ENABLED=true` → query `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` → see p95 spike

**Break and debug:**
1. Enable EITHER `FAULT_LATENCY_ENABLED=true` OR `FAULT_ERROR_ENABLED=true` (pick one without looking — flip a coin). Run `mixed_realistic`. Using ONLY Prometheus queries, determine which fault you enabled. If error injection: `rate(http_requests_total{status="500"}[1m])` will be nonzero. If latency injection: `histogram_quantile(0.95, ...)` will spike above 200ms while error rate stays normal.
2. Stop k6. Watch `rate(http_requests_total[1m])` drop to zero. Understand: the counter `http_requests_total` keeps its value, but `rate()` shows zero because the counter stopped increasing. This is the difference between a counter and a rate — fundamental to every Prometheus query you'll write.

**What you CANNOT do yet:**
- Visualize metrics as time-series graphs (Step 3 — Grafana)
- Prometheus UI shows raw tables, not dashboards

---

#### Step 3 — Add Grafana

**New concept:** PromQL + visual dashboards + time-range analysis.

**Services:** + Grafana

**Grafana config:**
- Prometheus as data source (provisioned via YAML — no manual UI clicks)
- Pre-built dashboard with panels:

| Panel | PromQL | Type |
|---|---|---|
| Request rate by method | `sum(rate(http_requests_total[1m])) by (method)` | Time series |
| Error rate by status | `sum(rate(http_requests_total{status=~"[45].."}[1m])) by (status)` | Time series |
| Error ratio | `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))` | Gauge |
| p50 / p95 / p99 latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | Time series |
| Requests by endpoint | `sum(rate(http_requests_total[1m])) by (route)` | Bar chart |
| Node.js heap usage | `nodejs_heap_size_used_bytes` | Time series |
| Event loop lag | `nodejs_eventloop_lag_seconds` | Time series |

**k6 changes:** None. k6 scenarios become visually powerful here.

**What to test:**
1. Open dashboard, set time range to "Last 15 minutes"
2. Run `baseline` → watch all panels update with steady traffic
3. Run `read_spike` → request rate spikes, latency stays flat
4. Enable `FAULT_LATENCY_ENABLED=true`, run `mixed_realistic` → p95 climbs while p50 stays normal
5. Enable `FAULT_ERROR_ENABLED=true`, run `mixed_realistic` → error rate panel lights up
6. Stop k6 → all rates drop to zero — understand `rate()` vs cumulative counter visually
7. Run `write_storm` → endpoint breakdown shows `/products/:id/reserve` dominating

**Key PromQL concepts learned here:**
- `rate()` — per-second increase over a window
- `histogram_quantile()` — percentile from histogram buckets
- `sum() by (label)` — aggregation and grouping
- Label filters: `{status=~"5.."}`, `{method="POST"}`

**Break and debug:**
1. Enable `FAULT_LATENCY_ENABLED=true` AND `FAULT_ERROR_ENABLED=true` simultaneously. Run `mixed_realistic` for 3 minutes. Now answer using ONLY the Grafana dashboard:
   - What percentage of requests are failing?
   - What is the p95 latency?
   - Which HTTP method is most affected by errors?
   - At what time did the problems start?
   You can answer all of these from the dashboard. Try to answer: "what specific error message are the failing requests returning?" You can't — that's in the logs, and you have no log search yet.
2. Run `baseline` for 2 minutes, then switch to `read_spike` for 30 seconds, then back to `baseline`. Can you see the spike on the dashboard? Can you identify the exact 30-second window? Set the Grafana time range to zoom into that window. This teaches time-range navigation.

**What you CANNOT do yet:**
- Search logs by content or level (Step 5 — structured logging, Step 6 — Loki)
- Trace a single request end-to-end (Step 7 — Tempo)
- Jump from dashboard error spike to the specific log that caused it (Step 8 — correlation)

---

### Phase 2 — Structured Logging (Steps 4–5)

---

#### Step 4 — Replace console.log with Pino structured logging

**New concept:** Structured JSON logging — machine-parseable log output vs unstructured text.

**Services:** No new services. Changes to product service only.

**Changes to product service:**
- Remove all `console.log` calls
- Add Pino logger
- Every request logs structured JSON:
  ```json
  {
    "level": "info",
    "time": 1711900800000,
    "method": "GET",
    "path": "/products/42",
    "status": 200,
    "duration": 12,
    "category": "request",
    "msg": "request completed"
  }
  ```
- Error logs include additional context:
  ```json
  {
    "level": "error",
    "time": 1711900800000,
    "method": "POST",
    "path": "/products/999/reserve",
    "status": 409,
    "duration": 3,
    "error": "insufficient stock",
    "productId": 999,
    "requestedQuantity": 5,
    "availableStock": 0,
    "category": "request",
    "msg": "reserve failed"
  }
  ```
- Application lifecycle logs: startup, shutdown, seed data loaded
- Log levels used meaningfully: `info` for normal requests, `warn` for validation failures (400), `error` for business errors (409) and server errors (500), `fatal` for unrecoverable startup failures

**k6 changes:** None. Same traffic, different log format.

**What to test in Dozzle:**
1. Run `baseline` → see JSON lines instead of plain text
2. Compare with Step 1 output — same information, now machine-parseable
3. Run `error_gen` → spot error logs by `"level":"error"` — easier to scan visually
4. Run `write_storm` → see `"status":409` and `"error":"insufficient stock"` with full context

**Break and debug:**
1. Run `mixed_realistic` with `FAULT_ERROR_ENABLED=true`. In Dozzle, try to answer: "How many 500 errors happened in the last minute?" You still can't count — Dozzle is still scroll-only. But now each error has `"level":"error"` and `"status":500` as distinct fields. If you had a tool that could parse JSON and filter by field... that's exactly what Loki does in Step 6.
2. Run `write_storm` until stock depletes on some products. Find a 409 error in Dozzle. Notice it tells you `productId`, `requestedQuantity`, and `availableStock`. Compare this to Step 1 where the same error would have been `console.log("reserve failed")`. The structured log gives you the debugging context without having to reproduce the issue.

**Why this is its own step:**
- The shift from `console.log("reserve failed for product 42")` to `{"level":"error","productId":42,"availableStock":0}` is foundational
- Every observability tool downstream (Loki, OTel Collector) depends on structured input
- Pino's log levels become Loki label values in Step 6

**What you CANNOT do yet:**
- Query logs: "show me all errors in the last 5 minutes" (Step 6 — Loki + LogQL)
- Aggregate logs: "how many 409s per minute?" (Step 6 — Loki)
- Correlate a log to a trace (Step 8 — correlation)

---

#### Step 5 — Add OTel Collector

**New concept:** Central ingestion pipeline — a routing layer that receives telemetry from services and forwards it to backends. Decouples apps from storage.

**Services:** + OTel Collector

**Changes to product service:**
- Add OTel SDK for logs (`@opentelemetry/sdk-logs`, `@opentelemetry/exporter-logs-otlp-grpc`)
- Pino logs are bridged to OTel SDK → SDK sends log records via OTLP to OTel Collector
- Pino still writes to stdout (Dozzle still works)

**OTel Collector config:**
- Receiver: OTLP (gRPC on 4317, HTTP on 4318)
- Exporter: logging (writes received telemetry to collector's own stdout — temporary, until Loki in Step 6)
- Pipeline: `logs: receivers: [otlp] → exporters: [logging]`

**k6 changes:** None.

**What to test:**
1. Run `baseline` → check OTel Collector container logs in Dozzle → see log records arriving from product-service
2. Confirm: product-service pushes logs to collector, collector receives them and writes them to its own stdout
3. The collector is currently a pass-through that proves the pipeline works. In Step 6, we replace the `logging` exporter with `loki` exporter, and the logs become queryable.

**Break and debug:**
1. Stop the OTel Collector: `docker compose stop otel-collector`. Run `mixed_realistic`. Does the product service crash? It should not — the OTel SDK is designed to fail silently if the collector is unavailable. Logs still appear in Dozzle (stdout). This is an important resilience property: observability infrastructure failure must never take down the application.
2. Restart the collector. Check if it catches up — it won't, because OTLP is push-based with no persistent buffer by default. Logs generated while the collector was down are lost from the pipeline. They still exist in Dozzle (stdout) but won't reach Loki (after Step 6). Understand the tradeoff: push-based systems can lose data during collector outages unless you add queuing.

**What you CANNOT do yet:**
- Query or search the logs the collector receives — it's just dumping them to stdout (Step 6 — Loki)

---

#### Step 6 — Add Loki

**New concept:** Log aggregation and querying — structured logs become searchable, filterable, and aggregatable via LogQL.

**Services:** + Loki

**OTel Collector config update:**
- Replace `logging` exporter with `loki` exporter (HTTP push to Loki)
- Pipeline: `logs: receivers: [otlp] → exporters: [loki]`
- Labels extracted: `service_name`, `level`

**Grafana config update:**
- Add Loki as data source (provisioned via YAML)

**k6 changes:** None. Existing traffic generates logs.

**What to test:**
1. Run `baseline` → open Grafana Explore → select Loki → query `{service_name="product-service"}` → see structured logs streaming
2. Run `error_gen` → query `{service_name="product-service", level="error"}` → first time you can filter by level
3. Query `{service_name="product-service"} |= "409"` → line filter for specific text
4. Query `{service_name="product-service"} | json | status >= 400` → parse JSON, filter by field value
5. Query `sum(count_over_time({service_name="product-service"}[1m])) by (level)` → log volume by level over time
6. Compare: Dozzle = raw stdout, scrollable. Loki = queryable, filterable, aggregatable. Same logs, fundamentally different capability.

**Key LogQL concepts learned here:**
- Label matchers: `{service_name="...", level="..."}`
- Line filter: `|= "text"`, `!= "health"`
- JSON parser: `| json` then field filters
- Aggregation: `count_over_time`, `rate`, `sum by`

**Break and debug:**
1. Run `mixed_realistic` with `FAULT_ERROR_ENABLED=true` for 3 minutes. Now answer these questions using ONLY LogQL:
   - How many error logs in the last 3 minutes? → `count_over_time({service_name="product-service", level="error"}[3m])`
   - Which endpoint produces the most errors? → `| json | line_format "{{.path}}"` then visually scan, or use `sum by` with parsed fields
   - What is the most common error message? → `| json | error != ""` then scan
   - At what time did error rate peak? → `sum(count_over_time({service_name="product-service", level="error"}[30s])) by (level)` as a graph
2. Remember Step 1's break-and-debug: "try to find all 404s in the last 5 minutes" was impossible in Dozzle. Do it now in Loki: `{service_name="product-service"} | json | status = 404`. Instant. Feel the difference.

**What you CANNOT do yet:**
- See how long a request took end-to-end (Step 7 — Tempo traces)
- Jump from a log line to the full request lifecycle (Step 8 — correlation)

---

### Phase 3 — Traces and Correlation (Steps 7–8)

---

#### Step 7 — Add Tempo

**New concept:** Distributed traces — spans, trace ID, span tree view.

**Services:** + Tempo

**Changes to product service:**
- Add OTel tracing SDK (`@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-grpc`)
- Auto-instrumentation: `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`
- Every incoming HTTP request creates a root span
- Span attributes: `http.method`, `http.route`, `http.status_code`, `http.url`
- Span name: `GET /products/:id`

**OTel Collector config update:**
- Add traces pipeline: `traces: receivers: [otlp] → exporters: [otlp/tempo]`
- Collector now routes logs to Loki AND traces to Tempo

**Grafana config update:**
- Add Tempo as data source (provisioned)

**k6 changes:** None. Every k6 request automatically generates a trace.

**What to test:**
1. Run `baseline` → Grafana Explore → Tempo → search traces for `product-service`
2. Click any trace → see span tree: single root span with method, route, status, duration
3. Run `error_gen` → search traces with status = error → find failed requests
4. Enable `FAULT_LATENCY_ENABLED=true`, run `mixed_realistic` → search traces with duration > 500ms
5. Compare two traces: normal 5ms GET vs fault-injected 1500ms GET

**Break and debug:**
1. Enable `FAULT_LATENCY_ENABLED=true`. Run `mixed_realistic`. Open Tempo. Search for traces longer than 1 second. How many did you find? Now search for traces shorter than 10ms. Compare the two. The slow ones are fault-injected. The fast ones are normal. You can now identify slow requests individually, not just as a statistical aggregate (which is what Prometheus p95 shows).
2. Run `error_gen`. Find a 409 (insufficient stock) trace in Tempo. Look at the span attributes — it shows the HTTP status code and route. Now find the same request's log in Loki by matching the timestamp. You'll have to eyeball-match timestamps because there's no link between them yet. That manual matching is exactly what Step 8 automates.

**What you CANNOT do yet:**
- Click from a log line directly to its trace (Step 8 — correlation)
- Click from a dashboard spike to the relevant logs and traces (Step 8)

---

#### Step 8 — Correlate logs + traces + metrics in Grafana

**New concept:** Signal correlation — navigating between metrics, logs, and traces using shared identifiers. The core observability skill.

**Services:** No new services. Configuration changes only.

**Changes to product service:**
- OTel SDK injects `trace_id` and `span_id` into every Pino log line automatically
- Log output now includes:
  ```json
  {
    "level": "error",
    "time": 1711900800000,
    "method": "POST",
    "path": "/products/999/reserve",
    "status": 409,
    "duration": 3,
    "trace_id": "abc123def456...",
    "span_id": "789xyz...",
    "error": "insufficient stock",
    "msg": "reserve failed"
  }
  ```

**Grafana config changes:**
- Loki data source: derived field — regex extracts `trace_id`, clickable link to Tempo
- Tempo data source: "Logs" link — given trace ID, query Loki for matching logs
- Dashboard update: "Errors" log panel below metrics panels, filtered to `{level="error"}`

**k6 changes:** None.

**What to test — the full correlation workflow:**
1. Enable `FAULT_ERROR_ENABLED=true`
2. Run `mixed_realistic` for 2 minutes
3. Grafana dashboard → error rate spike in metrics panel (metrics)
4. Click spike time range → switch to Loki Explore
5. Query `{service_name="product-service", level="error"}` → error logs (logs)
6. Find a log line → click `trace_id` link → Grafana opens Tempo with that trace (traces)
7. See span tree — HTTP span showing 500 status with timing
8. From trace view → click "Logs for this trace" → see all logs for that request
9. Full loop: **metrics** = something is wrong → **logs** = what went wrong → **trace** = how it went wrong

**Break and debug:**
1. Enable `FAULT_ERROR_ENABLED=true` AND `FAULT_LATENCY_ENABLED=true`. Run `mixed_realistic` for 3 minutes. Pretend you just got paged: "error rate is elevated." Starting from the Grafana dashboard ONLY:
   - Identify the error rate from the dashboard
   - Navigate to error logs in Loki
   - Pick one error log, click through to its trace
   - From the trace, determine the total request duration
   - Write down: error type, affected endpoint, request duration, timestamp
   - Time yourself. This is your baseline correlation speed. It should get faster with practice.
2. Run `write_storm` until stock depletes on several products. Then run `error_gen`. You now have two types of errors: 409 (insufficient stock, caused by depletion) and 500 (fault injection). Using correlation, answer: are the 409s and 500s happening on the same endpoints? Same products? Same time window? This exercises distinguishing root causes through observability.

**Why this is a standalone step:**
- No new infrastructure. No new code logic. But this is the most important step in the entire plan.
- Before this step: three separate tools, three separate views.
- After this step: one unified observability system where every signal links to every other.

---

### ★ Practice Step A — Correlation Workflow Drills

**No new services. No new tools. Pure debugging practice.**

**Prerequisite:** Steps 1–8 complete. You have: Prometheus, Grafana, Loki, Tempo, OTel Collector, Pino structured logs, trace-log correlation.

**Goal:** Build muscle memory for the dashboard → logs → trace workflow. In these exercises, you know what you broke. The goal is tool fluency, not detective work.

**Exercise A1 — Error injection diagnosis:**
1. Enable `FAULT_ERROR_ENABLED=true`. Run `mixed_realistic` for 5 minutes.
2. Starting from Grafana dashboard: find the error rate, navigate to logs, find a specific 500 error, click through to its trace.
3. Verify: the trace shows the HTTP span with status 500, duration is normal (error injection doesn't add latency).
4. Goal: complete this workflow in under 2 minutes.

**Exercise A2 — Latency injection diagnosis:**
1. Enable `FAULT_LATENCY_ENABLED=true` (error injection OFF). Run `mixed_realistic` for 5 minutes.
2. Open Grafana dashboard. Observe: error rate is normal, but p95 latency is elevated.
3. Open Tempo. Search for traces with duration > 1 second. Pick one.
4. Click "Logs for this trace" — find the request log. Confirm the `duration` field in the log matches the trace span duration.
5. Now answer: what percentage of requests are slow? Use Prometheus: `histogram_quantile(0.99, ...)` vs `histogram_quantile(0.5, ...)`. The gap tells you the slow fraction.

**Exercise A3 — Stock depletion timeline:**
1. All fault injection OFF. Run `write_storm` until multiple products hit zero stock.
2. Using Loki, find the exact timestamp when the first 409 appeared: `{service_name="product-service", level="error"} | json | status = 409 | line_format "{{.time}} {{.productId}} {{.availableStock}}"`.
3. Using Grafana dashboard, find the corresponding inflection point where error rate started climbing.
4. Using Tempo, find a 409 trace. Compare it to a 200 trace for the same endpoint. What's different?

**Exercise A4 — Blind fault (first attempt):**
1. Ask someone else to set EITHER `FAULT_ERROR_ENABLED=true` or `FAULT_LATENCY_ENABLED=true` (or both, or neither) without telling you which.
2. Alternatively: write a small script that randomly picks a configuration and applies it.
3. Run `mixed_realistic` for 3 minutes.
4. Using only Grafana, Loki, and Tempo, determine: which fault(s) are active?
5. Check the env vars to verify your diagnosis.

**Completion criteria:** You can complete the dashboard → logs → trace workflow in under 2 minutes without hesitation. You can distinguish error injection from latency injection using only observability tools.

---

### Phase 4 — Database Layer (Steps 9–10)

---

#### Step 9 — Add PostgreSQL + postgres-exporter

**New concept:** Exporter sidecar pattern — a dedicated container that queries an infrastructure component and exposes metrics for Prometheus. Second ingestion model.

**Services:** + PostgreSQL, + postgres-exporter

**Changes to product service:**
- Replace in-memory data store with PostgreSQL (`products` table)
- Use `pg` library with connection pool
- OTel auto-instruments `pg` via `@opentelemetry/instrumentation-pg` — SQL queries become child spans

**Database schema:**
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```
- Seed script inserts ~25 products on first startup

**postgres-exporter:**
- Connects to PostgreSQL, queries `pg_stat_*` system catalog tables
- Exposes `/metrics` on port 9187
- Prometheus scrapes postgres-exporter (not PostgreSQL — PG has no native `/metrics`)

**Prometheus config update:**
- Add scrape target: `postgres-exporter:9187`

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Active connections | `pg_stat_activity_count` | Connection pool saturation |
| Sequential scans | `pg_stat_user_tables_seq_scan` | Missing indexes |
| Rows returned | `pg_stat_user_tables_n_tup_fetched` | Query efficiency |
| Database size | `pg_database_size_bytes` | Growth tracking |
| Transactions committed | `pg_stat_database_xact_commit` | Transaction health |

**k6 changes:** None. Same CRUD scenarios, now hitting PostgreSQL.

**What to test:**
1. Run `baseline` → Grafana shows PG active connections stabilize at pool size
2. Run `read_spike` → sequential scan count climbs
3. Run `write_storm` → transaction commit rate spikes
4. Tempo → find any trace → now see TWO spans: `GET /products/:id` (HTTP) → `pg.query SELECT * FROM products WHERE id = $1` (DB)
5. Compare: HTTP span = 15ms, DB span = 8ms — gap is Express overhead

**Break and debug:**
1. Run `mixed_realistic`. While traffic is flowing, `docker compose restart postgresql`. Watch Grafana: PG active connections drops to zero, app error rate spikes (connection refused), then both recover. Open Loki: find the connection error logs. Open Tempo: find a trace that spans the restart — the DB span will show an error. How long was the outage visible in metrics?
2. Find a 404 request trace. The DB span shows `pg.query SELECT * FROM products WHERE id = $1` returning 0 rows. The HTTP span shows 404. The correlation: empty DB result → application-level 404. This is the first time you see infrastructure behavior (query result) linked to application behavior (HTTP status) inside a single trace.

**What you CANNOT do yet:**
- See cache hit/miss impact on DB load (Step 10 — Redis)

---

#### Step 10 — Add Redis + redis-exporter

**New concept:** Cache-layer observability — watching two signals (cache hit/miss and DB query rate) relate to each other in real time.

**Services:** + Redis, + redis-exporter

**Changes to product service:**
- `GET /products` and `GET /products/:id` check Redis first (60s TTL), fallback to PostgreSQL
- Custom app metrics:
  - `cache_hit_total` counter (label: `endpoint`)
  - `cache_miss_total` counter (label: `endpoint`)
- OTel auto-instruments `ioredis` via `@opentelemetry/instrumentation-ioredis` — Redis commands become spans

**redis-exporter:**
- Connects to Redis, translates `INFO` output to Prometheus metrics
- Exposes `/metrics` on port 9121

**Prometheus config update:**
- Add scrape target: `redis-exporter:9121`

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Cache hit ratio | `cache_hit_total / (cache_hit_total + cache_miss_total)` | Cache effectiveness |
| Redis memory used | `redis_memory_used_bytes` | Memory pressure |
| Redis connected clients | `redis_connected_clients` | Connection count |
| Redis commands/sec | `rate(redis_commands_processed_total[1m])` | Throughput |
| Cache hit vs DB query overlay | Hit rate + PG query rate on same panel | The key relationship |

**k6 changes:** None. Same CRUD traffic exercises cache layer.

**What to test:**
1. Run `baseline` → first minute: cache misses (cold), then hits stabilize
2. Cache hit ratio: starts at 0%, climbs to ~90%
3. Tempo → cache-hit trace: HTTP → Redis GET (2ms), no PG span
4. Cache-miss trace: HTTP → Redis GET (miss) → PG query → Redis SET

**Break and debug:**
1. **The Redis restart demo:** Run `baseline` for 2 minutes (cache warms up). Now `docker compose restart redis`. Don't look at the terminal. Pretend you got paged with "increased database load." Using only Grafana:
   - Cache hit ratio: dropped to 0% at a specific timestamp
   - PG query rate: spiked at the same timestamp
   - PG active connections: increased
   - Over 60 seconds: cache recovers, PG rate drops, connections decrease
   - Root cause conclusion: cache failure caused DB load spike. Recovery was automatic via TTL refill.
   This is the first time you see two infrastructure signals causally relating in real time.
2. Run `write_storm`. Products get created and updated, but cache entries for the old data still exist (stale reads for 60s). Can you observe this? Check: a GET after a PUT returns old data if cache TTL hasn't expired. Look in Loki for the sequence: PUT → 200 (writes to PG) → GET → 200 (served from Redis, stale data). This is a real cache invalidation bug, visible through observability.

---

### Phase 5 — Messaging (Steps 11–12)

---

#### Step 11 — Add RabbitMQ

**New concept:** Native Prometheus endpoint — third ingestion model. Queue depth as a leading indicator signal.

**Services:** + RabbitMQ (with management plugin)

**Changes to product service:**
- On every `GET /products/:id`, publish `product.viewed` event to RabbitMQ
- Message payload: `{"productId": 42, "timestamp": "...", "source": "product-service"}`
- No consumer yet — messages accumulate in queue (consumer in Step 12)

**RabbitMQ setup:**
- Management plugin enabled (UI + `/metrics` endpoint)
- Queue: `product.viewed`
- Exchange: `ecommerce.events` (topic exchange)
- Native Prometheus metrics at `http://rabbitmq:15692/metrics` — no exporter sidecar

**Prometheus config update:**
- Add scrape target: `rabbitmq:15692` (direct — no exporter)

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Queue depth | `rabbitmq_queue_messages` | Messages waiting — grows until Step 12 |
| Publish rate | `rabbitmq_queue_messages_published_total` | Production rate |
| Consumer count | `rabbitmq_queue_consumers` | 0 until Step 12 |
| Unacked messages | `rabbitmq_queue_messages_unacked` | Consumer lag (after Step 12) |

**k6 changes:** None. `GET /products/:id` already in all scenarios.

**What to test:**
1. Run `baseline` → queue depth grows continuously (no consumer)
2. Run `read_spike` → publish rate spikes, queue grows faster
3. Tempo → `GET /products/:id` trace now includes RabbitMQ publish span
4. Stop k6 → queue depth plateaus

**Break and debug:**
1. Run `read_spike` for 1 minute. Stop k6. Check queue depth in Grafana — note the number. Run `read_spike` again for 1 minute. Queue depth doubles. This is a **leading indicator**: the queue tells you work is accumulating. In production, a growing queue without a consumer means something is broken downstream. You can see the problem building before it causes user-visible failures.
2. Stop RabbitMQ: `docker compose stop rabbitmq`. Run `baseline`. What happens to the product service? Check logs in Loki — you should see connection errors when the service tries to publish. But does the GET request itself still succeed? It should — publishing is async, the product data is still returned. The message is lost. Observe: infrastructure failure in async path doesn't break the synchronous user experience, but data (the view event) is silently lost. Both behaviors are visible through observability.

---

#### Step 12 — Add Python worker

**New concept:** Cross-service, cross-language distributed trace via W3C TraceContext propagation.

**Services:** + Python worker (asyncio + aio-pika)

**Python worker behavior:**
- Consumes `product.viewed` queue
- Updates `product_views` counter column in PostgreSQL
- OTel SDK for Python: `opentelemetry-sdk`, `opentelemetry-instrumentation-aio-pika`, `opentelemetry-instrumentation-psycopg2`
- Sends traces and logs to OTel Collector via OTLP

**Trace context propagation:**
- Product service injects `traceparent` header into RabbitMQ message headers
- Python worker reads `traceparent`, creates child span linked to same trace
- Single trace now spans: Node.js HTTP → RabbitMQ → Python consumer → PostgreSQL

**OTel Collector config:** No change — Python pushes to same OTLP endpoint.

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Consumer processing rate | `rate(rabbitmq_queue_messages_delivered_total[1m])` | Drain speed |
| Queue depth (should stabilize) | `rabbitmq_queue_messages` | Consumer keeping up? |
| Worker processing duration | `worker_message_duration_seconds` (custom) | Processing speed |
| Worker errors | `worker_errors_total` (custom) | Consumer reliability |

**k6 changes:** None. Product views generate messages, worker consumes automatically.

**What to test:**
1. Run `baseline` → queue depth stabilizes (publish ≈ consume rate)
2. Run `read_spike` → queue temporarily grows, then drains
3. Tempo → `GET /products/:id` trace → cross-service span tree:
   - `product-service: GET /products/42` (Node.js root)
   - `product-service: redis GET`
   - `product-service: rabbitmq publish product.viewed`
   - `python-worker: process product.viewed` (Python child span — different service, different language, same trace)
   - `python-worker: pg.query UPDATE products SET views = views + 1`
4. Loki → `{service_name="python-worker"}` → worker logs with trace_id
5. Tempo service map → `[product-service] → [rabbitmq] → [python-worker] → [postgresql]`

**Break and debug:**
1. `docker compose stop python-worker`. Run `order_flow` for 2 minutes. Watch queue depth grow in Grafana. Check consumer count: 0. Now restart the worker. Watch queue drain. How long did it take to process the backlog? Is the drain rate the same as the steady-state rate, or is the worker processing faster (batch effect)? Answer using only Grafana metrics.
2. Run `baseline`. Find a cross-service trace in Tempo. Look at the time gap between the product-service publish span and the python-worker consume span. This gap is the queue latency — time the message sat in RabbitMQ waiting. Run `read_spike` and check again — is the gap larger? It should be, because the worker can't keep up with the publish rate.

**Milestone:** First trace crossing service boundaries, languages, and transport protocols.

---

### Phase 6 — Multi-service (Steps 13–15)

---

#### Step 13 — Practice Step B (skipped — renumbered, see below)

---

#### Step 13 — Add Order service

**New concept:** Multi-service synchronous trace + service dependency map.

**Services:** + Order service (Node.js/Express)

**Order service endpoints:**

| Method | Route | Behavior |
|---|---|---|
| `POST` | `/orders` | Validate → call Product service (check exists + reserve stock) → insert to PG → publish `order.placed` |
| `GET` | `/orders/:id` | Get order by ID |
| `GET` | `/orders` | List orders, supports `?status=` filter |

**Database addition:**
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Service-to-service calls:**
- Order service → Product service: `GET /products/:id`, `POST /products/:id/reserve`
- OTel auto-instruments outgoing HTTP — child spans automatic

**Python worker update:**
- Also consumes `order.placed` → updates order status to `confirmed`

**Prometheus + Grafana:**
- Scrape order-service `/metrics`
- Dashboard: order rate, order error rate, order latency panels

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `order_flow` | Create order every 2s (random product + user) | Full pipeline |
| `order_burst` | 10 orders/sec for 20s | Stress multi-service chain |
| `order_errors` | Order nonexistent products, out-of-stock | Error propagation across services |

**What to test:**
1. Run `order_flow` → Tempo → order trace:
   - `order-service: POST /orders` (root)
   - `order-service → product-service: GET /products/42`
   - `order-service → product-service: POST /products/42/reserve`
   - `order-service: pg.query INSERT INTO orders`
   - `order-service: rabbitmq publish order.placed`
   - `python-worker: process order.placed`
   - `python-worker: pg.query UPDATE orders SET status = 'confirmed'`
2. Tempo service map → full dependency graph

**Break and debug:**
1. `docker compose stop product-service`. Run `order_flow`. What happens? Order service tries to call product-service, gets connection refused. Check the order trace in Tempo — the outgoing HTTP span to product-service shows an error. The order-service root span shows a 500 or 502. From one trace, you see exactly which dependency failed and how it affected the parent service. Restart product-service. Orders resume.
2. Run `order_burst`. Watch order-service p95 latency. Now compare it to product-service p95 latency. Order-service latency INCLUDES product-service latency (synchronous dependency). If product-service is slow, order-service is slower. Enable `FAULT_LATENCY_ENABLED=true` on product-service. Run `order_burst` again. Order-service p95 jumps because it's waiting on product-service. The trace shows exactly which child span is consuming the time.

---

#### Step 14 — Add nginx as API gateway

**New concept:** Edge observability — client-facing metrics independent of service self-reporting.

**Services:** + nginx, + nginx-prometheus-exporter

**nginx config:**
- Port 80 — single entry point
- Route `/products*` → product-service:3000
- Route `/orders*` → order-service:3001
- Structured JSON access logs to stdout

**nginx log pipeline:**
- nginx writes JSON to stdout → OTel Collector filelog receiver → Loki
- Loki label: `{service_name="nginx"}`

**nginx-prometheus-exporter:**
- nginx exposes `stub_status`
- Exporter translates to Prometheus metrics

**Prometheus config update:**
- Add scrape target: `nginx-prometheus-exporter:9113`

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| nginx request rate | `rate(nginx_http_requests_total[1m])` | Client-facing throughput |
| nginx vs upstream rate | Overlay nginx with service rates | Dropped requests? |
| Upstream response time | From nginx access log (Loki) | Client-experienced latency |
| Active connections | `nginx_connections_active` | Connection pressure |

**k6 changes:** All scenarios now hit `http://nginx:80` instead of service ports. Base URL change only.

**What to test:**
1. Run `mixed_realistic` → compare nginx rate vs product-service rate — should match
2. Loki → `{service_name="nginx"}` → access logs with upstream_response_time

**Break and debug:**
1. Enable `FAULT_LATENCY_ENABLED=true` on product-service. Run `mixed_realistic`. Compare two metrics:
   - Product-service self-reported p95 (from its own `/metrics`)
   - nginx upstream_response_time for `/products*` routes (from nginx access logs in Loki)
   They should be similar. The difference is container network latency. If they differ significantly, there's a network problem between nginx and the service.
2. `docker compose stop order-service`. Run traffic that includes order requests. nginx returns 502 Bad Gateway. Check: does the product-service error rate change? It shouldn't — product-service is fine. But nginx metrics show elevated error rate. This is why edge metrics matter: a downstream failure is invisible to unaffected services but visible at the edge.

---

### ★ Practice Step B — Multi-service Dependency Failure Drills

**No new services. No new tools. Pure debugging practice across the full service mesh.**

**Prerequisite:** Steps 1–14 complete. You have: two Node.js services, Python worker, PostgreSQL, Redis, RabbitMQ, nginx, and the full observability stack.

**Goal:** Practice diagnosing failures that cascade across services. You know what you broke. The goal is multi-service debugging fluency.

**Exercise B1 — Consumer failure cascade:**
1. `docker compose stop python-worker`. Run `order_flow` for 3 minutes.
2. Starting from Grafana, diagnose:
   - Queue depth: growing (no consumer)
   - Orders: all stuck in `pending` status (worker not processing `order.placed`)
   - Product service: unaffected (product views pile up in queue but GET requests still work)
   - nginx: no errors (orders are created successfully — they just don't get confirmed)
3. Identify: which users are affected? Orders are created but never confirmed. The user sees "pending" forever.
4. Restart worker. How long does it take to clear the backlog? When does the last `pending` order become `confirmed`?

**Exercise B2 — Database connection exhaustion:**
1. Set PostgreSQL `max_connections=5` (very low) in docker-compose. Restart PG.
2. Run `order_burst` (10 orders/sec).
3. Diagnose from observability:
   - PG active connections: maxed at 5
   - Product-service and order-service: connection pool errors in logs
   - Traces: DB spans show errors or extreme latency (waiting for connection)
   - nginx: upstream timeouts increase
4. Identify: both services share the same PG. Which is more affected? The one with more DB operations per request.
5. Restore `max_connections` to default. Restart PG. Watch recovery.

**Exercise B3 — Cache failure impact chain:**
1. Run `order_flow` + `baseline` simultaneously (orders and product browsing). Wait 2 minutes for cache to warm.
2. `docker compose restart redis`.
3. Trace the cascade in Grafana:
   - Cache hit ratio → 0%
   - PG query rate → spikes
   - Product-service latency → increases (DB is slower than cache)
   - Order-service latency → increases (calls product-service which is now slower)
   - nginx upstream_response_time → increases for both routes
4. How long until the system fully recovers? Measure from each signal.

**Exercise B4 — Upstream dependency failure (cross-service):**
1. Enable `FAULT_LATENCY_ENABLED=true` on product-service (200–2000ms delay on 10% of requests).
2. Run `order_flow`.
3. Diagnose from order-service perspective:
   - Order-service p95 latency: elevated
   - But order-service's OWN code is fast — the slow span in the trace is the outgoing HTTP call to product-service
   - nginx sees slow responses for `/orders*` but not for `/products*` (products are still fast for non-delayed requests)
4. Key lesson: when a service is slow, look at its dependency traces to find if the slowness is internal or inherited.

**Completion criteria:** Given any single infrastructure failure (service down, DB restart, cache failure, injected latency), you can identify the root cause and trace its impact across all affected services within 5 minutes using only Grafana, Loki, and Tempo.

---

### Phase 7 — Alerting (Steps 15–16)

---

#### Step 15 — Add Prometheus alert rules

**New concept:** Prometheus rule evaluation — defining conditions that Prometheus continuously checks.

**Services:** No new services. Prometheus config only.

**Prometheus alert rules:**

| Alert | Condition | For | Severity |
|---|---|---|---|
| HighErrorRate | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05` | 2m | critical |
| SlowOrderService | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="order-service"}[5m])) by (le)) > 1` | 5m | warning |
| RabbitMQQueueBacklog | `rabbitmq_queue_messages > 1000` | 5m | warning |
| PostgreSQLConnectionsHigh | `pg_stat_activity_count > 80` | 2m | critical |
| WorkerDown | `up{job="python-worker"} == 0` | 1m | critical |
| RedisMemoryHigh | `redis_memory_used_bytes / redis_memory_max_bytes > 0.9` | 5m | warning |
| HighCacheMissRate | `rate(cache_miss_total[5m]) / (rate(cache_hit_total[5m]) + rate(cache_miss_total[5m])) > 0.5` | 5m | warning |

**What to test:**
1. Prometheus UI → Status → Rules → see all rules with current state (inactive/pending/firing)
2. Enable `FAULT_ERROR_ENABLED=true`, run heavy traffic → HighErrorRate: inactive → pending → firing (after 2m)
3. Stop k6 → rule: firing → pending → inactive
4. `docker compose stop python-worker` → WorkerDown fires after 1m

**Break and debug:**
1. Understand the rule lifecycle by testing each transition:
   - **Inactive → Pending:** enable fault injection, start traffic. Rule condition becomes true. Prometheus shows "pending" state. Alert has NOT fired yet — the `for` duration hasn't elapsed.
   - **Pending → Firing:** wait for the `for` duration (2m for HighErrorRate). Now it fires.
   - **Firing → Inactive:** disable fault injection, stop traffic. Error rate drops. Rule transitions back.
   - Why `for` exists: it prevents alerting on brief spikes. A 30-second error spike that self-resolves should not page someone at 3 AM.
2. Try to trigger multiple rules simultaneously. `docker compose stop python-worker` AND enable `FAULT_ERROR_ENABLED=true` AND run heavy traffic. Watch: WorkerDown fires (1m), HighErrorRate fires (2m), RabbitMQQueueBacklog fires (5m). Three alerts, one root cause. This is exactly why Alertmanager (Step 16) exists — to group and deduplicate.

**What you CANNOT do yet:**
- Rules fire but nothing happens — no notifications, no routing (Step 16)
- Multiple alerts fire independently for what's actually one incident (Step 16 — grouping)

---

#### Step 16 — Add Alertmanager

**New concept:** Alert routing, grouping, inhibition, silencing — turning evaluations into actionable notifications.

**Services:** + Alertmanager

**Alertmanager config:**
- Receives firing alerts from Prometheus
- Group by: `alertname`, `severity`
- Routes:
  - `severity: critical` → webhook receiver (stub that logs to stdout — simulates PagerDuty/Slack)
  - `severity: warning` → log only
- Inhibition: if `WorkerDown` fires, suppress `RabbitMQQueueBacklog`

**Grafana changes:**
- Alert annotations: firing alerts appear as vertical red lines on dashboard
- Alert state panel: current firing/pending/resolved alerts

**k6 additions:**

| Scenario | Purpose |
|---|---|
| `trigger_high_error_rate` | Enable `FAULT_ERROR_ENABLED=true` + heavy traffic |
| `trigger_queue_backlog` | Stop Python worker + run `order_flow` |
| `trigger_slow_orders` | Enable `FAULT_LATENCY_ENABLED=true` + run `order_flow` |

**What to test:**
1. Run `trigger_high_error_rate` → 2m → Prometheus fires → Alertmanager receives → webhook logs → Grafana red line
2. `docker compose stop python-worker` + `order_flow` for 3m → queue alert → restart worker → alert resolves
3. Inhibition: stop worker AND heavy traffic → WorkerDown fires → RabbitMQQueueBacklog suppressed

**Break and debug:**
1. Stop python-worker. Run `order_flow` AND `trigger_high_error_rate`. Multiple alerts fire. Open Alertmanager UI. Observe:
   - WorkerDown and HighErrorRate fire as separate alerts
   - RabbitMQQueueBacklog is inhibited (suppressed) because WorkerDown is firing
   - Without inhibition, you'd get three alerts for one root cause (worker is down)
2. Use Alertmanager UI to create a silence for HighErrorRate (simulate: "we know about this, we're deploying a fix"). Verify: the alert still evaluates as firing in Prometheus, but Alertmanager no longer sends notifications. This is how teams prevent alert fatigue during known incidents.

---

### ★ Practice Step C — Blind Chaos Debugging

**No new services. No new tools. Blind failure diagnosis from alerts.**

**Prerequisite:** Steps 1–16 complete. Full observability stack + alerting.

**Goal:** Simulate real production debugging. You do NOT know what broke. Start from an alert. Work backward to root cause.

**Setup — Chaos script:**
Create a small shell script (`chaos.sh`) that randomly picks ONE action from this menu:

```bash
ACTIONS=(
  "docker compose stop python-worker"
  "docker compose restart redis"
  "docker compose restart postgresql"
  "docker compose exec product-service sh -c 'export FAULT_ERROR_ENABLED=true'"
  "docker compose exec product-service sh -c 'export FAULT_LATENCY_ENABLED=true'"
  "docker compose stop order-service"
)
# Pick random action, execute it, log which one to /tmp/chaos-action.log
```

**Exercise C1 — Single unknown failure:**
1. Start all services. Run `order_flow` + `baseline` + `mixed_realistic` simultaneously.
2. Run `chaos.sh`. Don't look at which action it picked.
3. Wait for an alert to fire (or observe a dashboard change).
4. Starting from the alert or dashboard anomaly, diagnose:
   - What symptom did you observe first?
   - Which service is affected?
   - Is it a direct failure or a cascade from a dependency?
   - What is the root cause?
5. Write down your diagnosis. Check `/tmp/chaos-action.log`. Were you right?

**Exercise C2 — Timed diagnosis:**
1. Same as C1, but time yourself from first alert to root cause identification.
2. Target: under 5 minutes for any single failure.
3. Repeat 3–5 times with different random actions.

**Exercise C3 — Two simultaneous failures:**
1. Modify `chaos.sh` to pick TWO random actions.
2. This is harder: two failures may produce overlapping symptoms.
3. Diagnose both root causes.
4. This simulates production reality: multiple things go wrong at once.

**Exercise C4 — Recovery verification:**
1. After identifying the root cause in C1, fix it (restart the stopped service, disable fault injection).
2. Verify recovery using observability:
   - Alert resolves in Alertmanager
   - Metrics return to baseline in Grafana
   - Error logs stop appearing in Loki
   - New traces show normal behavior in Tempo
3. How long does full recovery take? Measure from fix action to all signals normal.

**Completion criteria:** You can identify an unknown single failure within 5 minutes starting from an alert. You can verify full recovery using all three signal types.

---

### Phase 8 — Breadth Expansion (Steps 17–22)

---

#### Step 17 — Add MinIO

**New concept:** Object storage observability + another native Prometheus endpoint.

**Services:** + MinIO

**Changes to order service:**
- After `order.placed` processed and status = `confirmed`, generate JSON invoice → upload to MinIO bucket `ecommerce-invoices`

**Python worker update:**
- After processing `order.placed`, verify invoice exists in MinIO

**MinIO setup:**
- S3-compatible object storage
- Native Prometheus endpoint: `/minio/v2/metrics/cluster`
- Bucket: `ecommerce-invoices` (created on startup)

**Prometheus config update:**
- Add scrape target: MinIO metrics endpoint

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| S3 request rate by type | `minio_s3_requests_total` by API | PUT vs GET breakdown |
| S3 error rate | `minio_s3_requests_errors_total` | Storage failures |
| Bucket object count | `minio_bucket_objects_count` | Invoice accumulation |
| Disk usage | `minio_disk_storage_used_bytes` | Capacity tracking |

**k6 changes:** None. `order_flow` creates orders → invoices generated automatically.

**What to test:**
1. Run `order_flow` → MinIO console shows invoices appearing
2. Grafana: S3 PUT rate correlates 1:1 with order confirmation rate
3. Tempo: order trace now includes MinIO upload span

**Break and debug:**
1. `docker compose stop minio`. Run `order_flow`. Orders are created and confirmed (status update works), but invoice upload fails. Check Loki: order-service logs show MinIO connection error. Check Tempo: the MinIO upload span shows an error within an otherwise successful order trace. The order isn't broken — just the invoice. This is partial failure visibility: trace shows which step in a multi-step process failed.
2. Restart MinIO. Run `order_flow`. Are the invoices for orders created during the outage ever generated? They're not (unless you have a retry mechanism). The gap is visible: Grafana shows order count > invoice count. This motivates retry/reconciliation logic.

---

#### Step 18 — Add Meilisearch

**New concept:** Search engine observability — search latency, indexing latency, index drift detection.

**Services:** + Meilisearch

**Changes to product service:**
- `GET /products?search=keyword` routes to Meilisearch instead of PostgreSQL

**Python worker update:**
- Consumes `product.updated` event → re-indexes product in Meilisearch
- Initial index: on startup, indexes all products from PostgreSQL

**Meilisearch setup:**
- Native Prometheus endpoint (`--experimental-enable-metrics`)
- Index: `products`

**Prometheus config update:**
- Add scrape target: Meilisearch metrics endpoint

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Search request rate | Meilisearch HTTP request metrics | Search traffic |
| Search latency | Meilisearch response time | User-experienced search speed |
| Index document count | `meilisearch_index_docs_count` | Should match PG count |
| Indexing time | Meilisearch task metrics | Re-index speed |

**Alert addition:**
- `MeilisearchIndexDrift`: index doc count < PG product count

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `search_traffic` | `GET /products?search=<random>` at 5/sec | Search load |
| `search_spike` | Ramp search to 30/sec for 20s | Search under pressure |

**What to test:**
1. Run `search_traffic` → Meilisearch latency sub-10ms
2. Create product via POST → index count increases via worker re-indexing
3. Tempo: search trace shows HTTP → Meilisearch HTTP call span

**Break and debug:**
1. `docker compose stop python-worker`. Create 5 new products via k6 `write_storm`. Worker is down → products exist in PG but not in Meilisearch. Index drift alert fires. Search for the new products → not found. Restart worker → it re-indexes → alert resolves → search finds them. The observability tells you: data exists in source-of-truth (PG) but not in search index. Without the drift alert, users would silently get incomplete search results.
2. Run `search_spike` (30 searches/sec). Watch Meilisearch latency. Does it degrade? At what point? Compare to product-service latency for the same requests — product-service includes network round-trip to Meilisearch. The overhead is visible in the trace.

---

#### Step 19 — Add Go inventory service

**New concept:** OTel language independence — Node.js, Python, Go all in one pipeline.

**Services:** + Inventory service (Go)

**Inventory service endpoints:**

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/inventory/:productId` | Current stock level |
| `PUT` | `/inventory/:productId` | Set stock level |
| `POST` | `/inventory/:productId/reserve` | Atomic reserve (decrement with check) |

**Changes to order service:**
- Order creation calls `POST http://inventory-service:3002/inventory/:productId/reserve`
- Separation: product-service owns product data, inventory-service owns stock

**Go OTel setup:**
- `go.opentelemetry.io/otel` SDK + `otelhttp` middleware
- Traces and logs to OTel Collector via OTLP (same endpoint)

**Custom metrics (Go Prometheus client):**

| Metric | Type | Purpose |
|---|---|---|
| `inventory_stock_level` | Gauge (per product) | Current stock |
| `inventory_reservations_total` | Counter | Reservation volume |
| `inventory_reservation_failures_total` | Counter | Failed reservations |

**Prometheus config update:**
- Add scrape target: `inventory-service:3002/metrics`

**Alert addition:**
- `LowInventoryStock`: `inventory_stock_level < 10`

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `inventory_check` | Direct `GET /inventory/:id` | Inventory read path |
| `stock_depletion` | Rapid orders on single product | 409 propagation |

**What to test:**
1. Run `order_flow` → Tempo trace across THREE languages:
   - `order-service (Node.js): POST /orders`
   - `inventory-service (Go): POST /inventory/42/reserve`
   - `python-worker (Python): process order.placed`
2. Tempo service map: full dependency graph
3. Compare Go/Node.js/Python spans — identical format

**Break and debug:**
1. `docker compose stop inventory-service`. Run `order_flow`. Order-service traces show: outgoing HTTP call to inventory-service fails with connection refused. Orders fail. But product-service is fine — product browsing still works. The trace shows exactly which dependency broke the order flow.
2. Run `stock_depletion` targeting one product. Watch `inventory_stock_level` gauge drop to zero in Grafana. Subsequent orders for that product fail with 409 from inventory-service. The trace shows: order-service → inventory-service (409) → order-service returns error to client. Compare with Step 1's 409: same business error (insufficient stock), but now visible across service boundaries with full trace context.

---

#### Step 20 — Add scheduler/cron jobs

**New concept:** Job-based observability — absence of success as the alert signal.

**Services:** + Scheduler service (Node.js / `node-cron`)

**Three jobs:**

| Job | Schedule | Action |
|---|---|---|
| `daily-order-summary` | Every 1 min (simulated) | Query PG order counts → write JSON to MinIO |
| `inventory-sync` | Every 2 min | Compare PG vs Meilisearch count → republish mismatches |
| `dlq-requeue` | Every 5 min | Check RabbitMQ DLQ → requeue failed messages (max 3 retries) |

**Custom metrics per job:**

| Metric | Type | Purpose |
|---|---|---|
| `job_last_success_timestamp_seconds` | Gauge (per job) | When did this job last succeed? |
| `job_duration_seconds` | Histogram (per job) | How long each run takes |
| `job_runs_total` | Counter (labels: job, status) | Run count and failure rate |

**OTel traces:** Each job run creates a root span with child spans for PG, MinIO, RabbitMQ operations.

**Prometheus config update:**
- Add scrape target: `scheduler-service:3003/metrics`

**Alert additions:**

| Alert | Condition | Why |
|---|---|---|
| `JobMissedRun` | `time() - job_last_success_timestamp_seconds{job="daily-order-summary"} > 120` | Gap > 120s means missed run |
| `JobHighFailureRate` | `rate(job_runs_total{status="failure"}[10m]) > 0.5` | Majority failing |

**k6 changes:** None. Scheduler runs on cron. k6 traffic ensures data exists for jobs to process.

**What to test:**
1. Grafana: `job_last_success_timestamp_seconds` updates every 60s
2. MinIO: order summary JSONs accumulate
3. Tempo: scheduler trace → PG query → MinIO upload

**Break and debug:**
1. `docker compose stop postgresql`. Scheduler's daily-order-summary job fails (can't query PG). `job_runs_total{status="failure"}` increments. `job_last_success_timestamp_seconds` stops updating. After 2 minutes: `JobMissedRun` alert fires. Restart PG. Job succeeds. Timestamp updates. Alert resolves.
2. **Key insight:** Request/response observability (Steps 1–19) detects "too many errors." Job observability detects "nothing happened." Watch `job_last_success_timestamp_seconds` — it's a gauge that should update regularly. When it STOPS updating, that's the alert signal. The absence of success, not the presence of failure.

---

#### Step 21 — Add Dead Letter Queue observability

**New concept:** Failed message lifecycle — tracking messages that couldn't be processed and their retry behavior.

**Services:** No new services. RabbitMQ DLQ configuration + scheduler dlq-requeue job (from Step 20).

**Changes:**
- Configure RabbitMQ DLQ: failed messages from `product.viewed` and `order.placed` queues route to `dead-letter` queue
- Python worker: on processing failure, message is nacked → goes to DLQ
- Scheduler `dlq-requeue` job: reads DLQ, requeues with retry count header (max 3)

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| DLQ depth | `rabbitmq_queue_messages{queue="dead-letter"}` | Failed messages accumulating |
| DLQ inflow rate | `rate(rabbitmq_queue_messages_published_total{queue="dead-letter"}[1m])` | Failure rate |
| Requeue count | `job_requeued_messages_total` (custom scheduler metric) | Retry volume |
| Poison message count | Messages that failed 3 retries (logged by scheduler) | Permanently failed |

**k6 changes:** None.

**What to test:**
1. Introduce a deliberate failure in Python worker (e.g., reject messages for a specific product ID). Run `baseline`. Watch DLQ accumulate messages for that product.
2. Scheduler requeues them. They fail again. After 3 retries, scheduler logs them as poison messages and stops retrying.
3. Grafana: DLQ depth rises, then falls as scheduler processes them, then rises again (requeue → fail → DLQ again), until poison message count grows.

**Break and debug:**
1. Run `order_flow`. Stop PostgreSQL. Python worker can't write to DB → messages nacked → DLQ fills. Watch DLQ depth in Grafana. Restart PG. Scheduler requeues DLQ messages. Worker processes them successfully. DLQ drains. Orders finally get confirmed (late but not lost). The full lifecycle: message → processing failure → DLQ → retry → success, visible end-to-end in metrics, logs, and traces.

---

#### Step 22 — Final integration test

**New concept:** No new concept. Full-system validation.

**Services:** All 22 containers running.

**What to do:**
1. Start all services.
2. Run ALL k6 scenarios sequentially: `baseline`, `read_spike`, `write_storm`, `error_gen`, `mixed_realistic`, `order_flow`, `order_burst`, `order_errors`, `search_traffic`, `search_spike`, `stock_depletion`.
3. Enable both fault injection flags during some scenarios.
4. While traffic is running, verify every observability capability:

| Capability | How to verify |
|---|---|
| Raw logs | Dozzle shows stdout from all containers |
| Structured logs | Loki: `{service_name="product-service"} \| json \| status >= 400` returns results |
| Metrics | Grafana dashboard: all panels populated, no gaps |
| Traces | Tempo: find a `POST /orders` trace spanning all services |
| Correlation | Click from dashboard error spike → Loki error log → trace_id → Tempo span tree |
| Exporter pattern | postgres-exporter and redis-exporter metrics appear in Grafana |
| Native endpoint | RabbitMQ, MinIO, Meilisearch metrics appear in Grafana |
| Cross-service trace | Single trace: nginx → order-service → inventory-service(Go) + product-service → rabbitmq → python-worker |
| Edge observability | nginx metrics match service metrics, upstream_response_time visible |
| Alert rules | Prometheus rules page shows all rules evaluating |
| Alert routing | Trigger a rule → Alertmanager receives → webhook logs → Grafana annotation |
| Inhibition | Stop worker → WorkerDown fires → QueueBacklog suppressed |
| Job observability | Scheduler metrics updating, traces visible |
| DLQ lifecycle | Failed messages → DLQ → requeue → retry → success or poison |

5. Run the blind chaos script (Practice Step C). Diagnose within 5 minutes.

**This is the graduation exercise.** If you can operate this system — diagnose failures, trace requests, correlate signals, understand alerts — you have the observability skillset.

---

## Final service inventory (Step 22 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Product service | Node.js / Express | Products CRUD, search via Meilisearch |
| Order service | Node.js / Express | Order creation, inventory reservation, invoice upload |
| Inventory service | Go | Stock levels, reservation management |
| Scheduler service | Node.js / node-cron | Background jobs — summary, sync, DLQ requeue |
| Python worker | Python / aio-pika | Async order/product event processor |
| k6 | grafana/k6 | Traffic simulator |
| PostgreSQL | postgres:16 | Primary relational store |
| Redis | redis:8 | Product listing cache |
| RabbitMQ | rabbitmq:management | AMQP message broker |
| MinIO | minio | S3-compatible invoice storage |
| Meilisearch | meilisearch | Full-text product search |
| nginx | nginx:alpine | API gateway, reverse proxy |
| Prometheus | prom/prometheus | Metrics storage and alert evaluation |
| Alertmanager | prom/alertmanager | Alert routing and grouping |
| Grafana | grafana/grafana | Unified dashboards |
| OTel Collector | otel/opentelemetry-collector | Central signal ingestion and routing |
| Loki | grafana/loki | Log storage |
| Tempo | grafana/tempo | Trace storage |
| Dozzle | amir20/dozzle | Raw stdout tailing (dev only) |
| postgres-exporter | — | PG metrics for Prometheus |
| redis-exporter | — | Redis metrics for Prometheus |
| nginx-prometheus-exporter | — | nginx metrics for Prometheus |

---

## Summary: what each step adds

| Step | What you can do after this step |
|---|---|
| 1 | See raw container output in browser (Dozzle) |
| 2 | Query numerical counters and histograms (Prometheus) |
| 3 | Visual dashboards with rate, error rate, latency percentiles (Grafana) |
| 4 | Structured JSON logs with levels, fields, context (Pino) |
| 5 | Central log routing pipeline (OTel Collector) |
| 6 | Search, filter, aggregate logs (Loki + LogQL) |
| 7 | Request traces with span trees (Tempo) |
| 8 | Click from dashboard → log → trace → root cause (correlation) |
| ★A | Fluent correlation workflow under 2 minutes |
| 9 | Database metrics + SQL spans in traces (postgres-exporter) |
| 10 | Cache metrics + two signals relating in real time (Redis restart demo) |
| 11 | Queue depth as leading indicator, native `/metrics` (RabbitMQ) |
| 12 | Cross-service cross-language trace (Python worker) |
| 13 | Multi-service sync trace + service dependency map (Order service) |
| 14 | Edge metrics independent of service self-reporting (nginx) |
| ★B | Multi-service dependency failure diagnosis under 5 minutes |
| 15 | Alert rules continuously evaluating conditions (Prometheus rules) |
| 16 | Alert routing, grouping, inhibition, silencing (Alertmanager) |
| ★C | Blind chaos diagnosis from alert to root cause |
| 17 | Object storage metrics + invoice spans (MinIO) |
| 18 | Search metrics + index drift detection (Meilisearch) |
| 19 | Three-language trace in one pipeline (Go inventory) |
| 20 | Job observability — absence of success as signal (Scheduler) |
| 21 | Failed message lifecycle — DLQ, retry, poison messages |
| 22 | Full-system validation — graduation exercise |

---

## Execution rules for Claude

When I start a new session with this file:

1. Read the **Current Status** section below — that is where we are
2. Do not re-explain completed steps unless I ask
3. Do not jump ahead of the current step
4. Each step produces:
   - `docker-compose.yml` (full file, all services to that point)
   - All application source files needed for that step
   - Any config files (prometheus.yml, otel-collector.yml, etc.)
   - k6 test scripts (new or updated if the step requires it)
   - Break-and-debug instructions for that step
   - A test procedure: which k6 scenario to run and what to observe
5. Practice steps (★A, ★B, ★C) produce: exercise instructions, expected observations, chaos scripts where applicable
6. After completing a step, tell me exactly what to update in **Current Status**
7. One step at a time — do not combine steps unless I explicitly ask

---

## Current status

**Current step:** NOT STARTED — ready to begin Step 1

**Completed steps:** None

**Last session summary:** Plan v4 finalized. 22 steps. Break-and-debug in every step. Three practice steps (★A, ★B, ★C). OTel Collector split into own step. DLQ observability added. Final integration test added.

**Notes from last session:** None

---

## How to resume

Paste this entire file into a new conversation and say:

> "Resume from current status. Execute the next step."

Or to jump to a specific step:

> "Resume from current status. Execute Step N."

Or to re-explain a completed step:

> "Explain Step N again before we continue."
