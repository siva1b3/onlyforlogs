# Observability Learning Plan v3 — Context Prompt

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
- Steps 8–9: updated for DB-backed and cache-backed responses
- Steps 10–11: triggers message publishing and async processing
- Steps 12–13: exercises order flow through API gateway
- Steps 15–18: covers new services (MinIO, search, inventory, cron)

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

## Step-by-step audit trail

Every step documents:
- **New concept** — the one thing you learn
- **Services** — what's added
- **k6 changes** — what traffic exercises the new concept
- **What to test** — concrete verification procedure
- **What you CANNOT do yet** — sets up motivation for the next step

---

## All 18 steps

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

- In-memory data store (no DB until Step 8)
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
5. Try to find all 404s from the last 5 minutes — you can't. Scroll-based, no search, no filter. That limitation motivates everything that follows.

**What you CANNOT do yet:**
- Search/filter logs (Step 4 — structured logging, Step 5 — Loki)
- See request rate as a number (Step 2 — Prometheus)
- Graph error rate over time (Step 3 — Grafana)
- Trace a request lifecycle (Step 6 — Tempo)

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

**What you CANNOT do yet:**
- Visualize metrics as time-series graphs (Step 3 — Grafana)
- Prometheus UI shows raw tables and instant vectors, not dashboards

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

**k6 changes:** None. But this is where k6 becomes visually powerful.

**What to test:**
1. Open dashboard, set time range to "Last 15 minutes"
2. Run `baseline` → watch all panels update with steady traffic
3. Run `read_spike` → watch request rate spike, latency stays flat
4. Enable `FAULT_LATENCY_ENABLED=true`, run `mixed_realistic` → watch p95 climb while p50 stays normal
5. Enable `FAULT_ERROR_ENABLED=true`, run `mixed_realistic` → error rate panel lights up, error ratio gauge climbs
6. Stop k6 → watch all rates drop to zero — understand `rate()` (per-second change) vs cumulative counter
7. Run `write_storm` → see endpoint breakdown show `/products/:id/reserve` dominating

**Key PromQL concepts learned here:**
- `rate()` — per-second increase over a window
- `histogram_quantile()` — percentile from histogram buckets
- `sum() by (label)` — aggregation and grouping
- Label filters: `{status=~"5.."}`, `{method="POST"}`

**What you CANNOT do yet:**
- Search logs by content or level (Step 4 — structured logging, Step 5 — Loki)
- Trace a single request end-to-end (Step 6 — Tempo)
- Jump from error spike on dashboard to the specific log that caused it (Step 7 — correlation)

---

### Phase 2 — Structured Logging (Step 4)

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
1. Run `baseline` → open Dozzle → see JSON lines instead of plain text
2. Compare with Step 1 output — same information, now machine-parseable
3. Run `error_gen` → spot error logs by `"level":"error"` — easier to scan visually
4. Run `write_storm` → see `"status":409` and `"error":"insufficient stock"` with full context (product ID, requested quantity, available stock)
5. Notice: you can now eyeball-parse these in Dozzle, but you still cannot search, filter, or aggregate them programmatically. That's Step 5.

**Why this is its own step:**
- The shift from `console.log("reserve failed for product 42")` to `{"level":"error","productId":42,"availableStock":0}` is foundational
- Every observability tool downstream (Loki, OTel Collector) depends on structured input
- If you skip this and jump to Loki, you'd be querying unstructured text — defeating the purpose
- Pino's log levels (`info`, `warn`, `error`, `fatal`) become Loki label values in Step 5

**What you CANNOT do yet:**
- Query logs: "show me all errors in the last 5 minutes" (Step 5 — Loki + LogQL)
- Aggregate logs: "how many 409s per minute?" (Step 5 — Loki)
- Correlate a log to a trace (Step 7 — correlation)

---

### Phase 3 — OTel Pipeline (Steps 5–7)

---

#### Step 5 — Add OTel Collector + Loki

**New concept:** Push-based log ingestion pipeline — app pushes logs to a central collector, collector routes to storage, storage is queryable.

**Services:** + OTel Collector, + Loki

**Changes to product service:**
- Add OTel SDK for logs (`@opentelemetry/sdk-logs`, `@opentelemetry/exporter-logs-otlp-grpc`)
- Pino logs are bridged to OTel SDK → SDK sends log records via OTLP to OTel Collector
- No change to Pino configuration — same structured JSON output, now also pushed to collector

**OTel Collector config:**
- Receiver: OTLP (gRPC on 4317, HTTP on 4318)
- Exporter: Loki (HTTP push)
- Pipeline: `logs: receivers: [otlp] → exporters: [loki]`
- Labels extracted: `service_name`, `level`

**Grafana config update:**
- Add Loki as data source (provisioned via YAML)

**k6 changes:** None. Existing traffic generates logs.

**What to test:**
1. Run `baseline` → open Grafana Explore → select Loki data source
2. Query `{service_name="product-service"}` → see structured logs streaming in
3. Run `error_gen` → query `{service_name="product-service", level="error"}` → see only error logs — first time you can filter by level
4. Query `{service_name="product-service"} |= "409"` → line filter for specific text
5. Query `{service_name="product-service"} | json | status >= 400` → parse JSON fields, filter by value
6. Query `sum(count_over_time({service_name="product-service"}[1m])) by (level)` → log volume by level over time — this is impossible in Dozzle
7. Compare: Dozzle = raw stdout, scrollable. Loki = queryable, filterable, aggregatable. Same logs, fundamentally different capability.

**Key LogQL concepts learned here:**
- Label matchers: `{service_name="...", level="..."}`
- Line filter: `|= "text"`, `!= "health"`
- JSON parser: `| json` then field filters
- Aggregation: `count_over_time`, `rate`, `sum by`

**What you CANNOT do yet:**
- See how long a request took end-to-end (Step 6 — Tempo traces)
- Jump from a log line to the full request lifecycle (Step 7 — correlation)

---

#### Step 6 — Add Tempo

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

**k6 changes:** None. Every k6 request now automatically generates a trace.

**What to test:**
1. Run `baseline` → open Grafana Explore → select Tempo → search traces for `product-service`
2. Click any trace → see span tree: single root span with method, route, status, duration
3. Run `error_gen` → search traces with status = error → find failed request spans
4. Enable `FAULT_LATENCY_ENABLED=true`, run `mixed_realistic` → search traces with duration > 500ms → find injected slow requests
5. Compare two traces side by side: a normal 5ms GET vs a fault-injected 1500ms GET
6. Note: right now each trace has exactly ONE span (single service, no DB yet). After Step 8 (PostgreSQL), traces show HTTP span → DB query span. After Step 11 (Python worker), traces span services.

**What you CANNOT do yet:**
- Jump from a dashboard error spike to the log that caused it to the trace that shows the full picture (Step 7 — correlation)

---

#### Step 7 — Correlate logs + traces + metrics in Grafana

**New concept:** Signal correlation — navigating between metrics, logs, and traces using shared identifiers. This is the core observability skill.

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
- Loki data source: add derived field — regex extracts `trace_id`, creates clickable link to Tempo
- Tempo data source: add "Logs" link — given a trace ID, query Loki for matching logs
- Dashboard update: add "Errors" log panel below metrics panels, filtered to `{level="error"}`

**k6 changes:** None.

**What to test — the full correlation workflow:**
1. Enable `FAULT_ERROR_ENABLED=true`
2. Run `mixed_realistic` for 2 minutes
3. Open Grafana dashboard → see error rate spike in metrics panel (metrics)
4. Click on the spike time range → switch to Loki Explore
5. Query `{service_name="product-service", level="error"}` → see error logs (logs)
6. Find a log line → click the `trace_id` link → Grafana opens Tempo with that trace (traces)
7. See the span tree — HTTP span showing 500 status with timing
8. From the trace view → click "Logs for this trace" → see all log lines emitted during that request
9. Full loop: **metrics** told you something is wrong → **logs** told you what went wrong → **trace** told you how it went wrong

**Why this is a standalone step:**
- No new infrastructure. No new code logic. But this is the most important step in the entire plan.
- Before this step, you have three separate tools showing three separate views.
- After this step, you have one unified observability system where every signal links to every other signal.
- If you can do this workflow fluently, you understand observability. Everything after this is adding more services and more signals into the same pattern.

---

### Phase 4 — Database Layer (Steps 8–9)

---

#### Step 8 — Add PostgreSQL + postgres-exporter

**New concept:** Exporter sidecar pattern — a dedicated container that queries an infrastructure component and exposes metrics for Prometheus. Second ingestion model.

**Services:** + PostgreSQL, + postgres-exporter

**Changes to product service:**
- Replace in-memory data store with PostgreSQL (`products` table)
- Use `pg` library with connection pool
- OTel auto-instruments `pg` via `@opentelemetry/instrumentation-pg` — every SQL query becomes a child span in traces

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

**k6 changes:** None. Same CRUD scenarios now hit PostgreSQL instead of in-memory. Same traffic, richer signals.

**What to test:**
1. Run `baseline` → Grafana shows PG active connections stabilize at pool size
2. Run `read_spike` → watch sequential scan count climb
3. Run `write_storm` → watch transaction commit rate spike, stock depletes, 409s appear
4. Open Tempo → find any trace → now see TWO spans: `GET /products/:id` (HTTP) → `pg.query SELECT * FROM products WHERE id = $1` (DB)
5. Compare: HTTP span = 15ms, DB span = 8ms — the gap is Express overhead + serialization
6. Run `error_gen` → find a 404 trace → DB span shows query returned 0 rows
7. Use the correlation workflow from Step 7: dashboard spike → Loki error log → click trace_id → see both HTTP and DB spans

---

#### Step 9 — Add Redis + redis-exporter

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

**k6 changes:** None. Same CRUD traffic now exercises cache layer.

**What to test:**
1. Run `baseline` → first minute: cache misses (cold cache), then hits stabilize
2. Watch cache hit ratio: starts at 0%, climbs to ~90% as TTL fills
3. Open Tempo → cache-hit request: HTTP → Redis GET (2ms), no PG span
4. Cache-miss request: HTTP → Redis GET (miss) → PG query → Redis SET
5. **Key demo:** `docker compose restart redis` → watch in Grafana:
   - Cache hit ratio drops to 0% instantly
   - PG query rate spikes (all requests fall through to database)
   - PG active connections increase
   - Over 60 seconds, cache refills, hit ratio recovers, PG rate drops
6. First time you see two infrastructure signals causally relate in real time

---

### Phase 5 — Messaging (Steps 10–11)

---

#### Step 10 — Add RabbitMQ

**New concept:** Native Prometheus endpoint — third ingestion model. Queue depth as a leading indicator signal.

**Services:** + RabbitMQ (with management plugin)

**Changes to product service:**
- On every `GET /products/:id`, publish `product.viewed` event to RabbitMQ
- Message payload: `{"productId": 42, "timestamp": "...", "source": "product-service"}`
- No consumer yet — messages accumulate in queue (consumer arrives in Step 11)

**RabbitMQ setup:**
- Management plugin enabled (UI + `/metrics` endpoint)
- Queue: `product.viewed`
- Exchange: `ecommerce.events` (topic exchange)
- Native Prometheus metrics at `http://rabbitmq:15692/metrics` — no exporter sidecar

**Prometheus config update:**
- Add scrape target: `rabbitmq:15692` (direct — no exporter needed)

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Queue depth | `rabbitmq_queue_messages` | Messages waiting — grows until Step 11 |
| Publish rate | `rabbitmq_queue_messages_published_total` | Production rate |
| Consumer count | `rabbitmq_queue_consumers` | 0 until Step 11 |
| Unacked messages | `rabbitmq_queue_messages_unacked` | Consumer lag (after Step 11) |

**k6 changes:** None. `GET /products/:id` already in all scenarios. Each call now also publishes a message.

**What to test:**
1. Run `baseline` → watch queue depth grow continuously (no consumer)
2. Run `read_spike` → publish rate spikes, queue depth grows faster
3. Open RabbitMQ management UI (port 15672) → see queue filling
4. Open Tempo → find `GET /products/:id` trace → now includes RabbitMQ publish span
5. Stop k6 → publish rate drops to zero, queue depth plateaus
6. Queue depth only goes up — intentional. Step 11 adds the consumer.

**Why queue depth matters:**
- It's a **leading indicator** — tells you about a future problem before it causes failures
- A growing queue with no consumer means work is piling up
- After Step 11, a growing queue despite an active consumer means the consumer can't keep up

---

#### Step 11 — Add Python worker

**New concept:** Cross-service, cross-language distributed trace via W3C TraceContext propagation.

**Services:** + Python worker (asyncio + aio-pika)

**Python worker behavior:**
- Consumes `product.viewed` queue
- Updates `product_views` counter column in PostgreSQL
- OTel SDK for Python: `opentelemetry-sdk`, `opentelemetry-instrumentation-aio-pika`, `opentelemetry-instrumentation-psycopg2`
- Sends traces and logs to OTel Collector via OTLP

**Trace context propagation:**
- Product service injects `traceparent` header into RabbitMQ message headers when publishing
- Python worker reads `traceparent`, creates child span linked to same trace
- Single trace now spans: Node.js HTTP → RabbitMQ → Python consumer → PostgreSQL

**OTel Collector config:** No change — Python pushes to same OTLP endpoint.

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| Consumer processing rate | `rate(rabbitmq_queue_messages_delivered_total[1m])` | Drain speed |
| Queue depth (should stabilize) | `rabbitmq_queue_messages` | Consumer keeping up? |
| Worker processing duration | `worker_message_duration_seconds` (custom Python metric) | Processing speed |
| Worker errors | `worker_errors_total` (custom) | Consumer reliability |

**k6 changes:** None. Product views generate messages, Python worker consumes automatically.

**What to test:**
1. Run `baseline` → queue depth stabilizes (publish rate ≈ consume rate)
2. Run `read_spike` → queue temporarily grows, then drains as consumer catches up
3. Open Tempo → find `GET /products/:id` trace → now see cross-service span tree:
   - `product-service: GET /products/42` (Node.js, root span)
   - `product-service: redis GET` (cache lookup)
   - `product-service: rabbitmq publish product.viewed`
   - `python-worker: process product.viewed` (Python, child span — different service, different language, same trace)
   - `python-worker: pg.query UPDATE products SET views = views + 1`
4. Open Loki → query `{service_name="python-worker"}` → see worker logs with trace_id
5. Click trace_id from Python worker log → see the full cross-service trace
6. Open Tempo service map → `[product-service] → [rabbitmq] → [python-worker] → [postgresql]`

**Milestone:** First trace crossing service boundaries, languages, and transport protocols (HTTP → AMQP → SQL). W3C TraceContext (`traceparent`) is the standard making this work.

---

### Phase 6 — Multi-service (Steps 12–13)

---

#### Step 12 — Add Order service

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
- Order service → Product service: `GET /products/:id` (check product exists), `POST /products/:id/reserve` (reserve stock)
- OTel auto-instruments outgoing HTTP — child spans created automatically

**Python worker update:**
- Also consumes `order.placed` queue → updates order status to `confirmed`

**Prometheus + Grafana:**
- Scrape order-service `/metrics`
- Dashboard: order rate, order error rate, order latency panels

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `order_flow` | Create order every 2s (random product + user) | Full pipeline: Order → Product → RabbitMQ → Python worker |
| `order_burst` | 10 orders/sec for 20s | Stress the multi-service chain |
| `order_errors` | Order nonexistent products, out-of-stock products | 404 and 409 propagation across services |

Existing product scenarios unchanged.

**What to test:**
1. Run `order_flow` → open Tempo → find order trace:
   - `order-service: POST /orders` (root)
   - `order-service → product-service: GET /products/42` (sync HTTP)
   - `order-service → product-service: POST /products/42/reserve` (stock reservation)
   - `order-service: pg.query INSERT INTO orders` (DB write)
   - `order-service: rabbitmq publish order.placed` (async message)
   - `python-worker: process order.placed` (consumer)
   - `python-worker: pg.query UPDATE orders SET status = 'confirmed'`
2. Run `order_errors` → find failed order trace → identify which span failed
3. Open Tempo service map → `[order-service] → [product-service]`, `[order-service] → [rabbitmq] → [python-worker]`
4. Compare order-service p95 latency vs product-service p95 latency — order includes product call time
5. Run `order_burst` → watch: order rate spike → product-service rate spike (sync dependency) → queue depth spike (async) → worker catches up

---

#### Step 13 — Add nginx as API gateway

**New concept:** Edge observability — client-facing metrics independent of service self-reporting.

**Services:** + nginx, + nginx-prometheus-exporter

**nginx config:**
- Port 80 — single entry point for all traffic
- Route `/products*` → product-service:3000
- Route `/orders*` → order-service:3001
- Structured JSON access logs to stdout: timestamp, method, URI, status, upstream_response_time, request_id, bytes_sent

**nginx log pipeline:**
- nginx writes JSON to stdout → OTel Collector filelog receiver → Loki
- Loki label: `{service_name="nginx"}`

**nginx-prometheus-exporter:**
- nginx exposes `stub_status` endpoint
- Exporter translates to Prometheus metrics

**Prometheus config update:**
- Add scrape target: `nginx-prometheus-exporter:9113`

**Grafana dashboard additions:**

| Panel | Metric | Why it matters |
|---|---|---|
| nginx request rate | `rate(nginx_http_requests_total[1m])` | Client-facing throughput |
| nginx vs upstream rate | Overlay nginx rate with service rates | Dropped requests? |
| Upstream response time | From nginx access log (Loki) | Client-experienced latency |
| Active connections | `nginx_connections_active` | Connection pressure |

**k6 changes:** All scenarios now hit `http://nginx:80` instead of service ports directly. No script logic changes — base URL changes.

**What to test:**
1. Run `mixed_realistic` → compare nginx request rate vs product-service rate — should match
2. Open Loki → `{service_name="nginx"}` → see access logs with upstream_response_time
3. Enable `FAULT_LATENCY_ENABLED=true` on product-service → compare nginx upstream time vs product-service self-reported latency — difference is container network overhead
4. **Why edge matters:** services can report success while nginx sees timeouts. The gap between edge and service metrics reveals infrastructure problems.

---

### Phase 7 — Alerting (Steps 14–15)

---

#### Step 14 — Add Prometheus alert rules

**New concept:** Prometheus rule evaluation — defining conditions that Prometheus continuously checks against time-series data.

**Services:** No new services. Prometheus configuration only.

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
1. Open Prometheus UI → Status → Rules → see all rules listed with current state (inactive/pending/firing)
2. Enable `FAULT_ERROR_ENABLED=true`, run heavy traffic → watch HighErrorRate go from inactive → pending → firing (after 2m `for` duration)
3. Stop k6 → error rate drops → rule goes from firing → pending → inactive
4. `docker compose stop python-worker` → WorkerDown fires after 1 minute
5. Understand rule lifecycle: **inactive** (condition false) → **pending** (condition true, waiting for `for` duration) → **firing** (condition true for full `for` duration)

**What you CANNOT do yet:**
- Rules fire, but nothing happens — no notifications, no routing. That's Step 15.
- Prometheus evaluates rules but has no concept of grouping, deduplication, or notification routing.

---

#### Step 15 — Add Alertmanager

**New concept:** Alert routing, grouping, inhibition, silencing — turning rule evaluations into actionable notifications.

**Services:** + Alertmanager

**Alertmanager config:**
- Receives firing alerts from Prometheus
- Group by: `alertname`, `severity`
- Routes:
  - `severity: critical` → webhook receiver (stub that logs to stdout — simulates PagerDuty/Slack)
  - `severity: warning` → log only
- Inhibition rule: if `WorkerDown` is firing, suppress `RabbitMQQueueBacklog` (queue grows because worker is down — not a separate problem)

**Grafana changes:**
- Alert annotations: firing alerts appear as vertical red lines on dashboard panels
- Alert state panel: shows current firing/pending/resolved alerts

**k6 additions:**

| Scenario | Purpose |
|---|---|
| `trigger_high_error_rate` | Enable `FAULT_ERROR_ENABLED=true` + heavy traffic → fires HighErrorRate |
| `trigger_queue_backlog` | Stop Python worker + run `order_flow` → queue piles up → fires RabbitMQQueueBacklog |
| `trigger_slow_orders` | Enable `FAULT_LATENCY_ENABLED=true` + run `order_flow` → fires SlowOrderService |

**What to test:**
1. Run `trigger_high_error_rate` → wait 2m → Prometheus rule fires → Alertmanager receives → webhook logs alert → Grafana shows red annotation
2. `docker compose stop python-worker` + run `order_flow` for 3m → queue backlog alert fires → restart worker → alert resolves as queue drains
3. **Inhibition:** stop python-worker AND run heavy traffic → WorkerDown fires → RabbitMQQueueBacklog is suppressed (root cause is worker down)
4. **Silence:** use Alertmanager UI to silence an alert → it evaluates as firing but no notification sent
5. **Key insight:** Step 14 = the system knows something is wrong. Step 15 = the system tells the right person in the right way.

---

### Phase 8 — Breadth Expansion (Steps 16–18)

---

#### Step 16 — Add MinIO

**New concept:** Object storage observability + another native Prometheus endpoint example.

**Services:** + MinIO

**Changes to order service:**
- After `order.placed` is processed and status = `confirmed`, generate JSON invoice → upload to MinIO bucket `ecommerce-invoices`

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

**k6 changes:** None. `order_flow` and `order_burst` create orders → invoices generated automatically.

**What to test:**
1. Run `order_flow` → MinIO console shows invoices appearing
2. Grafana: S3 PUT rate correlates 1:1 with order confirmation rate
3. Tempo: order trace now includes MinIO upload span
4. Run `order_burst` → S3 request rate spikes with order rate

---

#### Step 17 — Add Meilisearch

**New concept:** Search engine observability — search latency, indexing latency, index drift detection.

**Services:** + Meilisearch

**Changes to product service:**
- `GET /products?search=keyword` routes to Meilisearch instead of PostgreSQL
- OTel SDK instruments the HTTP call to Meilisearch automatically

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
- `MeilisearchIndexDrift`: index doc count < PG product count — search index missing products

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `search_traffic` | `GET /products?search=<random>` at 5/sec | Search endpoint load |
| `search_spike` | Ramp search to 30/sec for 20s | Search under pressure |

**What to test:**
1. Run `search_traffic` → Meilisearch search latency should be sub-10ms
2. Run `search_spike` → check if latency degrades under load
3. Create product via POST → watch Meilisearch index count increase (via worker re-indexing)
4. Tempo: search trace shows HTTP → Meilisearch HTTP call span
5. Delete product from PG directly (manual SQL) → index drift alert fires

---

#### Step 18 — Add Go inventory service

**New concept:** OTel language independence — Node.js, Python, Go all in one pipeline.

**Services:** + Inventory service (Go)

**Inventory service endpoints:**

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/inventory/:productId` | Current stock level |
| `PUT` | `/inventory/:productId` | Set stock level |
| `POST` | `/inventory/:productId/reserve` | Atomic reserve (decrement with check) |

**Changes to order service:**
- Order creation calls `POST http://inventory-service:3002/inventory/:productId/reserve` instead of product-service reserve
- Separation: product-service owns product data, inventory-service owns stock levels

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
- `LowInventoryStock`: `inventory_stock_level < 10` — warning

**k6 additions:**

| Scenario | Pattern | What it exercises |
|---|---|---|
| `inventory_check` | Direct `GET /inventory/:id` calls | Inventory read path |
| `stock_depletion` | Rapid orders on single product until stock = 0 | 409 propagation: inventory → order → client |

**What to test:**
1. Run `order_flow` → Tempo trace shows spans across THREE languages:
   - `order-service (Node.js): POST /orders`
   - `inventory-service (Go): POST /inventory/42/reserve`
   - `python-worker (Python): process order.placed`
   - All in one trace, one Tempo, one Grafana
2. Run `stock_depletion` → `inventory_stock_level` drops → hits zero → failures spike → alert fires
3. Tempo service map: full dependency graph across all services
4. Compare Go/Node.js/Python spans — identical format. That's OTel's value.

---

#### Step 19 — Add scheduler/cron jobs

**New concept:** Job-based observability — absence of success as the alert signal. Fundamentally different from request/response observability.

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
| `job_duration_seconds` | Histogram (per job) | How long does each run take? |
| `job_runs_total` | Counter (labels: job, status) | Run count and failure rate |

**OTel traces:** Each job run creates a root span with child spans for PG query, MinIO upload, RabbitMQ check.

**Prometheus config update:**
- Add scrape target: `scheduler-service:3003/metrics`

**Alert additions:**

| Alert | Condition | Why |
|---|---|---|
| `JobMissedRun` | `time() - job_last_success_timestamp_seconds{job="daily-order-summary"} > 120` | Should run every 60s — gap > 120s means failure |
| `JobHighFailureRate` | `rate(job_runs_total{status="failure"}[10m]) > 0.5` | Majority of runs failing |

**k6 changes:** None. Scheduler runs on cron. k6 traffic ensures orders and products exist for jobs to process.

**What to test:**
1. Start system → scheduler begins running automatically
2. Grafana: `job_last_success_timestamp_seconds` updates every 60s
3. MinIO: order summary JSONs accumulate
4. Tempo: scheduler trace → PG query span → MinIO upload span
5. **Key test:** stop PostgreSQL → job fails → `job_runs_total{status="failure"}` increments → timestamp stops updating → `JobMissedRun` fires after 2m → restart PG → alert resolves
6. **Why different:** request/response observability detects "too many errors." Job observability detects "nothing happened." The signal is the absence of success.

---

## Final service inventory (Step 19 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Product service | Node.js / Express | Products CRUD, search via Meilisearch |
| Order service | Node.js / Express | Order creation, inventory reservation, invoice upload |
| Inventory service | Go | Stock levels, reservation management |
| Scheduler service | Node.js / node-cron | Background jobs — summary, sync, DLQ requeue |
| Python worker | Python / aio-pika | Async order/product event processor |
| k6 | grafana/k6 | Traffic simulator — grows with the system |
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

## Summary: what each step adds that you could not see before

| Step | What you can see after this step |
|---|---|
| 1 | Raw container output scrolling in a browser (Dozzle) |
| 2 | Numerical counters and histograms queried via Prometheus UI |
| 3 | Visual dashboards with request rate, error rate, latency percentiles (Grafana) |
| 4 | Structured JSON logs with levels, fields, context (Pino in Dozzle) |
| 5 | Queryable, filterable, aggregatable logs (Loki + LogQL) |
| 6 | Request traces with span trees showing timing (Tempo) |
| 7 | Click from dashboard spike → error log → trace → full picture (correlation) |
| 8 | Database metrics + SQL query spans inside request traces |
| 9 | Cache hit/miss metrics + two signals relating in real time (Redis restart demo) |
| 10 | Queue depth as leading indicator, native `/metrics` scraping |
| 11 | Cross-service, cross-language trace spanning Node.js → RabbitMQ → Python → PG |
| 12 | Multi-service sync traces + service dependency map |
| 13 | Edge metrics vs service metrics — find infrastructure gaps |
| 14 | Prometheus alert rules evaluating conditions continuously |
| 15 | Alert routing, grouping, inhibition, silencing (Alertmanager) |
| 16 | Object storage metrics + invoice upload spans in traces |
| 17 | Search engine metrics + index drift detection |
| 18 | Three-language trace (Node.js + Go + Python) in one pipeline |
| 19 | Job-based observability — absence of success as signal |

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
   - A test procedure: which k6 scenario to run and what to observe
5. After completing a step, tell me exactly what to update in **Current Status**
6. One step at a time — do not combine steps unless I explicitly ask

---

## Current status

**Current step:** NOT STARTED — ready to begin Step 1

**Completed steps:** None

**Last session summary:** Plan v3 finalized. 19 steps. Structured logging split into own step. Alerting split into rules + Alertmanager. k6 + fault injection from Step 1.

**Notes from last session:** None

---

## How to resume

Paste this entire file into a new conversation and say:

> "Resume from current status. Execute the next step."

Or to jump to a specific step:

> "Resume from current status. Execute Step N."

Or to re-explain a completed step:

> "Explain Step N again before we continue."
