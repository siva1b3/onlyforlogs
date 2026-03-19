# Observability Learning Plan — Context Prompt

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

## All 17 steps

### Phase 1 — Foundation (Steps 1–3)

**Step 1 — Node.js Express + Dozzle**
- Services: Product service (Node.js/Express), Dozzle
- Product service: `GET /products`, `GET /products/:id` — hardcoded data, no DB yet
- Dozzle tails raw stdout from all containers in browser
- New concept: raw container log visibility
- Why: before instrumenting anything, you must see what the service is doing

**Step 2 — Add Prometheus**
- Services: + Prometheus
- Add `prom-client` to Node.js, expose `GET /metrics`
- Metrics: `http_requests_total`, `http_request_duration_seconds`, default Node.js metrics
- Prometheus scrapes `/metrics` every 15 seconds
- New concept: metrics scrape model, time-series data

**Step 3 — Add Grafana**
- Services: + Grafana
- Connect Grafana to Prometheus as data source
- Dashboard panels: request rate, error rate, p95 latency, memory usage
- PromQL: `rate()`, `histogram_quantile()`, label filters
- New concept: PromQL, visual dashboards, time-range analysis

---

### Phase 2 — OTel Pipeline (Steps 4–6)

**Step 4 — Add OTel Collector + Loki**
- Services: + OTel Collector, + Loki
- Replace `console.log` with structured JSON logger (Winston or Pino)
- OTel SDK emits logs via OTLP to OTel Collector
- Collector routes logs to Loki with labels: `{service="product-service", level="error"}`
- Grafana: add Loki data source, LogQL queries
- New concept: push-based structured logging, collector as routing layer, LogQL

**Step 5 — Add Tempo**
- Services: + Tempo
- Enable tracing in OTel SDK — every HTTP request creates a root span
- Spans contain: service name, HTTP method, URL, status, duration
- OTel Collector routes traces to Tempo
- Grafana: add Tempo data source, trace search, span tree view
- New concept: distributed traces, spans, trace ID, trace search

**Step 6 — Correlate logs + traces in Grafana**
- Services: no new services
- Inject `traceId` and `spanId` into every log line via OTel SDK
- Configure Grafana Loki derived field: `traceId` → clickable link to Tempo
- Configure Tempo → Loki link: given trace ID, show all logs for that trace
- Navigation: dashboard → error spike → logs → click trace ID → span tree
- New concept: signal correlation — the core observability skill

---

### Phase 3 — Database Layer (Steps 7–8)

**Step 7 — Add PostgreSQL + postgres-exporter**
- Services: + PostgreSQL, + postgres-exporter
- Replace hardcoded data with real PostgreSQL (`products` table)
- postgres-exporter connects to PG, queries `pg_stat_*` tables, exposes `/metrics`
- Prometheus scrapes postgres-exporter (not PostgreSQL directly)
- DB query spans appear in traces: HTTP span → DB query span
- Metrics: active connections, sequential scans, DB size, checkpoint write time
- New concept: exporter sidecar pattern — second ingestion model

**Step 8 — Add Redis + redis-exporter**
- Services: + Redis, + redis-exporter
- Cache `GET /products` in Redis with 60s TTL — check Redis first, fallback to PG
- redis-exporter exposes Redis `INFO` as Prometheus metrics
- Custom app metrics: `cache_hit_total`, `cache_miss_total`
- Redis and PG query spans both appear in traces
- Key demo: restart Redis → watch cache miss spike AND PG query rate spike simultaneously in Grafana
- New concept: cache-layer observability, two signals relating to each other in real time

---

### Phase 4 — Messaging (Steps 9–10)

**Step 9 — Add RabbitMQ**
- Services: + RabbitMQ
- Product service publishes `product.viewed` event to RabbitMQ queue on every product fetch
- RabbitMQ management plugin exposes native `/metrics` endpoint
- Prometheus scrapes RabbitMQ directly — no exporter needed
- Metrics: queue depth, publish rate, consumer count, unacknowledged messages, DLQ depth
- New concept: native Prometheus endpoint — third ingestion model, queue-depth as a signal

**Step 10 — Add Python worker**
- Services: + Python worker
- Python worker consumes `product.viewed` queue using `aio-pika`
- Updates `product_views` counter in PostgreSQL per product
- OTel SDK in Python (`opentelemetry-sdk`) emits traces to OTel Collector
- Context propagation: Node.js injects `traceparent` header into RabbitMQ message
- Python worker reads `traceparent`, creates child span linked to same trace
- Trace result: `product-service: GET /products/42` → `python-worker: process product.viewed`
- New concept: cross-service cross-language trace, W3C TraceContext propagation

---

### Phase 5 — Multi-service (Steps 11–12)

**Step 11 — Add Order service (second Node.js service)**
- Services: + Order service (Node.js/Express)
- Order service: `POST /orders`, `GET /orders/:id`, `GET /orders`
- Flow: validate → call Product service (check product exists) → insert to PG → publish `order.placed`
- Python worker now also consumes `order.placed` → updates order status to confirmed
- New PG table: `orders (id, user_id, product_id, quantity, status, created_at)`
- Tempo service map: `[order-service] → [product-service]`, `[order-service] → [rabbitmq] → [python-worker]`
- New concept: multi-service trace, service dependency map in Tempo

**Step 12 — Add nginx as API gateway**
- Services: + nginx
- nginx on port 80: routes `/products*` → Product service, `/orders*` → Order service
- Structured JSON access logs: timestamp, method, URI, status, upstream response time, request ID header
- nginx logs → OTel Collector log receiver → Loki (`{service="nginx"}`)
- nginx-prometheus-exporter → Prometheus scrape
- Metrics: request rate, upstream response time by service, active connections
- Grafana: nginx request rate vs upstream service rate — find dropped requests
- New concept: edge observability — client-facing view independent of service self-reporting

---

### Phase 6 — Alerting (Step 13)

**Step 13 — Add Alertmanager + Prometheus rules**
- Services: + Alertmanager
- Prometheus alert rules:

| Alert | Condition | Duration | Severity |
|---|---|---|---|
| HighErrorRate | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | 2m | critical |
| SlowOrderService | `p95 latency > 1s` | 5m | warning |
| RabbitMQQueueBacklog | `queue_messages_ready > 1000` | 5m | warning |
| PostgreSQLConnectionsHigh | `pg_stat_activity_count > 80` | 2m | critical |
| WorkerDown | `up{job="python-worker"} == 0` | 1m | critical |
| RedisMemoryHigh | `redis_memory_used_bytes / max > 0.9` | 5m | warning |

- Alertmanager: groups related alerts, routes critical → webhook stub
- Grafana: alert annotations appear as vertical red lines on dashboards
- New concept: active alerting vs passive dashboards, alert grouping, inhibition, silence

---

### Phase 7 — Breadth Expansion (Steps 14–17)

**Step 14 — Add MinIO**
- Services: + MinIO
- Order service: after order confirmed, generate JSON invoice → upload to MinIO bucket `ecommerce-invoices`
- Python worker: after processing order, verify invoice exists in MinIO
- MinIO native Prometheus endpoint: `/minio/v2/metrics/cluster`
- Metrics: S3 request count by type, error rate, bucket object count, disk usage
- OTel span added for MinIO SDK call in Order service trace
- New concept: object storage observability, fourth native Prometheus endpoint example

**Step 15 — Add Meilisearch**
- Services: + Meilisearch
- Product service: `GET /products?search=` routes to Meilisearch instead of PostgreSQL
- Python worker: consumes `product.updated` event, re-indexes product in Meilisearch
- Meilisearch native Prometheus endpoint
- Metrics: search request rate, search latency histogram, index size, document count
- Alert: `index_docs_count < expected_product_count` — index out of sync
- New concept: search engine metrics — indexing latency, result latency, index drift detection

**Step 16 — Add Go inventory service**
- Services: + Inventory service (Go)
- Endpoints: `GET /inventory/:productId`, `PUT /inventory/:productId`, `POST /inventory/:productId/reserve`
- Order service calls `POST /inventory/:productId/reserve` before confirming order
- OTel SDK in Go: `go.opentelemetry.io/otel`, `otelhttp` middleware for auto-instrumentation
- Same OTel Collector receives Go traces — no new collector config
- Custom metrics: `inventory_stock_level` gauge per product, `inventory_reservation_total` counter
- Alert: stock level drops below 10 units
- Trace: nginx → Order service → Inventory service → PostgreSQL (spans across three languages)
- New concept: OTel language independence — Node.js, Python, Go all in one pipeline

**Step 17 — Add scheduler/cron job**
- Services: + Scheduler service (Node.js with `node-cron`)
- Three jobs:

| Job | Schedule | Action |
|---|---|---|
| Daily order summary | Every 1 min (simulated) | Query PG order counts → write JSON to MinIO |
| Inventory sync | Every 2 min | Compare PG inventory vs Meilisearch doc count, republish mismatches |
| Dead-letter requeue | Every 5 min | Check RabbitMQ DLQ, requeue failed messages (max 3 retries) |

- Custom metrics per job: `job_last_success_timestamp_seconds`, `job_duration_seconds`, `job_runs_total{status="success|failure"}`
- Alert: `time() - job_last_success_timestamp_seconds > 300` — missed run detection
- New concept: job-based observability — absence of success as the alert signal, fundamentally different from request/response observability

---

## Final service inventory (Step 17 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Product service | Node.js / Express | Products CRUD, search via Meilisearch |
| Order service | Node.js / Express | Order creation, inventory reservation, invoice upload |
| Inventory service | Go | Stock levels, reservation management |
| Scheduler service | Node.js / node-cron | Background jobs — summary, sync, DLQ requeue |
| Python worker | Python / aio-pika | Async order/product event processor |
| PostgreSQL | postgres:16 | Primary relational store |
| Redis | redis:8.4 | Product listing cache |
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
   - A simple test command to verify the step is working
5. After completing a step, tell me exactly what to update in **Current Status**
6. One step at a time — do not combine steps unless I explicitly ask

---

## Current status

**Current step:** NOT STARTED — ready to begin Step 1

**Completed steps:** None

**Last session summary:** Plan finalized. Ready to execute.

**Notes from last session:** None

---

## How to resume

Paste this entire file into a new conversation and say:

> "Resume from current status. Execute the next step."

Or to jump to a specific step:

> "Resume from current status. Execute Step N."

Or to re-explain a completed step:

> "Explain Step N again before we continue."
