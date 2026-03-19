# Observability Learning Plan — Food Delivery Platform

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

## The project — Food delivery platform

**One sentence:** Customer orders food from a restaurant, restaurant confirms the order, a driver is assigned, customer tracks the order status in real time until delivery.

This project was chosen because:
- Every stage of an order is a **state transition** — rich event stream for observability
- High-frequency, time-sensitive events make latency metrics meaningful and dramatic
- A single "place order" action touches the most services in sequence of all three projects
- Real-time driver location in Redis demonstrates cache as a live data store, not just a read cache
- Auto-cancel of unconfirmed orders teaches time-based alerting and scheduler observability
- Surge pricing in Go demonstrates business metric observability — not just system metrics

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

## All steps

### Phase 1 — Foundation (Steps 1–3)

**Step 1 — Node.js Express + Dozzle**
- Services: Customer service (Node.js/Express), Dozzle
- Customer service: `GET /restaurants`, `GET /restaurants/:id`, `POST /orders` — hardcoded data, no DB yet
- Every request logged to stdout via structured logger (Pino)
- Dozzle tails raw stdout from all containers in browser UI
- New concept: raw container log visibility
- Why: before instrumenting anything you must see what the service is doing

**Step 2 — Add Prometheus**
- Services: + Prometheus
- Add `prom-client` to Node.js, expose `GET /metrics`
- Metrics: `http_requests_total`, `http_request_duration_seconds`, default Node.js metrics
- Prometheus scrapes `/metrics` every 15 seconds
- New concept: metrics scrape model, time-series data

**Step 3 — Add Grafana**
- Services: + Grafana
- Connect Grafana to Prometheus as data source
- Dashboard panels: order rate, request latency p95, error rate, active connections
- PromQL: `rate()`, `histogram_quantile()`, label filters
- New concept: PromQL, visual dashboards, time-range analysis

---

### Phase 2 — OTel Pipeline (Steps 4–6)

**Step 4 — Add OTel Collector + Loki**
- Services: + OTel Collector, + Loki
- Replace stdout logs with structured JSON logger sending via OTLP to OTel Collector
- Collector routes logs to Loki with labels: `{service="customer-service", level="error"}`
- Grafana: Loki data source, LogQL queries — `{service="customer-service"} |= "order"`
- New concept: push-based structured logging, collector as central routing layer, LogQL

**Step 5 — Add Tempo**
- Services: + Tempo
- Enable tracing in OTel SDK — every HTTP request creates a root span
- Span contains: service name, HTTP method, URL, status, duration
- OTel Collector routes traces to Tempo
- Grafana: Tempo data source, trace search, span waterfall view
- New concept: distributed traces, spans, trace ID

**Step 6 — Correlate logs + traces in Grafana**
- Services: no new services
- Inject `traceId` and `spanId` into every log line via OTel SDK
- Grafana Loki derived field: `traceId` → clickable link to Tempo
- Tempo → Loki link: given trace ID, show all logs for that trace
- Navigation path: dashboard → spike → logs → click trace ID → span tree
- New concept: signal correlation — the core observability skill

---

### Phase 3 — Database Layer (Steps 7–8)

**Step 7 — Add PostgreSQL + postgres-exporter**
- Services: + PostgreSQL, + postgres-exporter
- Replace hardcoded data with real PostgreSQL
- Tables:
  - `restaurants (id, name, cuisine, address, status)`
  - `menu_items (id, restaurant_id, name, price, available)`
  - `orders (id, customer_id, restaurant_id, status, total, created_at)`
- postgres-exporter queries `pg_stat_*`, exposes Prometheus metrics
- Prometheus scrapes postgres-exporter
- DB query spans in traces: HTTP span → DB query span
- Metrics: active connections, sequential scans, DB size, lock wait time
- New concept: exporter sidecar pattern — second ingestion model

**Step 8 — Add Redis + redis-exporter**
- Services: + Redis, + redis-exporter
- **Two distinct Redis use cases in this project** (unique to food delivery):
  - `restaurant:menu:{id}` — cache menu with 5 minute TTL (standard read cache)
  - `driver:location:{driverId}` — store live driver GPS coordinates with 10 second TTL (live data store)
- redis-exporter exposes Redis `INFO` as Prometheus metrics
- Key demo: watch `driver:location:*` keys constantly refreshing — TTL expiry rate as a liveness signal
- Metrics: hit/miss ratio, key count by prefix, TTL expiry rate, memory usage
- New concept: Redis as live data store vs read cache — two different TTL and access patterns observable simultaneously

---

### Phase 4 — Messaging + State Transitions (Steps 9–11)

> **Why messaging is more central here than in other projects:**
> A food delivery order has 6+ state transitions: placed → confirmed → preparing → ready → picked_up → delivered.
> Each transition is an event. Without a message broker these events are synchronous blocking calls.
> The observability story here is: can you see the full state machine of an order in one trace?

**Step 9 — Add RabbitMQ**
- Services: + RabbitMQ
- Customer service publishes `order.placed` event to RabbitMQ when order is submitted
- Queues: `order.placed`, `order.confirmed`, `order.status_update`
- No consumers yet — queues accumulate intentionally
- RabbitMQ management plugin exposes native `/metrics` endpoint
- Prometheus scrapes RabbitMQ directly — no exporter needed
- Metrics: queue depth per queue, publish rate, consumer count, unacknowledged messages, DLQ
- Key demo: place 10 orders → watch all three queue depths grow
- New concept: native Prometheus endpoint — third ingestion model, per-queue depth monitoring

**Step 10 — Add Python worker (ETA calculator)**
- Services: + Python worker
- Python worker consumes `order.placed` queue
- Calculates estimated delivery time (stub: fixed formula based on restaurant distance)
- Updates order record in PG with `estimated_delivery_at`
- OTel SDK in Python emits traces
- Context propagation: Customer service injects `traceparent` into RabbitMQ message headers
- Python worker reads `traceparent`, creates child span in same trace
- Trace result:
  ```
  Trace abc123
  ├── customer-service: POST /orders (22ms)
  │   └── postgres: INSERT orders (9ms)
  └── python-worker: calculate ETA (35ms)
      └── postgres: UPDATE orders.eta (7ms)
  ```
- New concept: cross-service cross-language trace, async span linking across a queue

**Step 11 — Add Restaurant service (second Node.js service)**
- Services: + Restaurant service (Node.js/Express)
- Restaurant service: `GET /restaurants`, `GET /restaurants/:id/menu`, `PUT /orders/:id/confirm`, `PUT /orders/:id/ready`
- Consumes `order.placed` queue — restaurant receives new order notification
- On confirm: publishes `order.confirmed` event → triggers driver assignment downstream
- On ready: publishes `order.ready` event → triggers driver pickup notification
- Both services instrumented with OTel — Tempo service map:
  ```
  [customer-service] → [rabbitmq] → [restaurant-service]
                                  → [python-worker]
  ```
- New concept: multi-service trace, service map in Tempo, event-driven service dependencies

---

### Phase 5 — Multi-service Expansion (Steps 12–13)

**Step 12 — Add Delivery service (third Node.js service)**
- Services: + Delivery service (Node.js/Express)
- Endpoints: `POST /deliveries` — assign driver to order, `PUT /deliveries/:id/location` — update driver GPS, `GET /deliveries/:id` — get current delivery status
- Consumes `order.confirmed` queue — auto-assigns nearest available driver (stub: picks first available)
- Writes driver location to Redis: `driver:location:{driverId}` with 10s TTL
- Publishes `driver.assigned` event back to RabbitMQ
- OTel spans: order confirmation → driver assignment → Redis write
- Custom metrics: `drivers_available_total`, `delivery_assignment_duration_seconds`, `active_deliveries_total`
- Tempo service map now shows full order flow:
  ```
  customer-service → rabbitmq → restaurant-service
                             → python-worker (ETA)
                             → delivery-service → redis (driver location)
  ```
- New concept: write-path Redis observability, assignment latency as a business metric

**Step 13 — Add nginx as API gateway**
- Services: + nginx
- nginx on port 80: routes `/restaurants*`, `/orders*`, `/deliveries*` to respective services
- Structured JSON access logs: timestamp, method, URI, status, upstream response time, upstream service
- nginx logs → OTel Collector log receiver → Loki (`{service="nginx"}`)
- Grafana: nginx upstream latency by service — delivery service is typically slowest (Redis + DB)
- New concept: edge observability, per-upstream latency breakdown at the gateway level

---

### Phase 6 — Alerting (Step 14)

**Step 14 — Add Alertmanager + Prometheus rules**
- Services: + Alertmanager
- Prometheus alert rules — food delivery specific:

| Alert | Condition | Duration | Severity |
|---|---|---|---|
| OrdersNotBeingConfirmed | `rabbitmq_queue_messages_ready{queue="order.placed"} > 20` | 3m | critical |
| NoAvailableDrivers | `drivers_available_total == 0` | 2m | critical |
| DriverLocationStale | `redis_keyspace_expired_total{prefix="driver:location"}` stops incrementing | 5m | warning |
| HighOrderFailureRate | `rate(http_requests_total{service="customer-service",status=~"5.."}[5m]) > 0.05` | 2m | critical |
| DeliveryAssignmentSlow | `p95(delivery_assignment_duration_seconds) > 5` | 5m | warning |
| PostgreSQLConnectionsHigh | `pg_stat_activity_count > 80` | 2m | critical |
| ETAWorkerDown | `up{job="python-worker"} == 0` | 1m | critical |

- Key alert unique to food delivery: `NoAvailableDrivers` — a business-level alert that has no equivalent in e-commerce or job board
- Alertmanager: groups alerts, routes critical → webhook stub
- Grafana: alert annotations as vertical lines — see exactly when driver shortage started relative to order spike
- New concept: business-metric alerting — system and business alerts in same pipeline

---

### Phase 7 — Breadth Expansion (Steps 15–18)

**Step 15 — Add MinIO**
- Services: + MinIO
- Delivery service: after delivery completed, upload delivery proof JSON to MinIO bucket `delivery-proofs`
  - Proof contains: delivery timestamp, GPS coordinates at delivery, order ID
- Customer service: `GET /orders/:id/proof` fetches proof from MinIO, returns download URL
- MinIO native Prometheus endpoint: `/minio/v2/metrics/cluster`
- Prometheus scrapes MinIO directly
- OTel span wraps MinIO upload in Delivery service trace
- Metrics: PUT/GET count, error rate, bucket object count, storage used
- New concept: object storage at the end of a long trace chain — MinIO span appears last in a 4-service trace

**Step 16 — Add Meilisearch**
- Services: + Meilisearch
- Customer service: `GET /restaurants?search=pizza` routes to Meilisearch
- Restaurant service: on menu update → re-indexes restaurant in Meilisearch
- Meilisearch native Prometheus endpoint
- Metrics: search latency, index size, document count
- Alert: `meilisearch_index_docs_count < pg_restaurants_count` — search index out of sync
- Unique to food delivery: search latency is critical — hungry customers do not wait
- New concept: search-engine latency SLO — p99 search latency as an alertable metric

**Step 17 — Add Go surge pricing service**
- Services: + Surge pricing service (Go)
- Endpoints: `GET /pricing/surge?zone=&time=` — returns current surge multiplier (1.0x to 3.0x)
- Algorithm stub: `surge = base_price * (1 + active_orders / available_drivers)`
- Customer service calls Surge service before confirming order total
- OTel SDK in Go: same OTel Collector, no new config
- Custom business metrics: `surge_multiplier_current{zone="north"}` gauge, `surge_calculations_total` counter
- Grafana: surge multiplier over time vs order volume — watch them correlate
- Trace: nginx → Customer service → Surge service (two-language trace with business metric)
- New concept: business metrics observability — surge multiplier is both a business and system signal, OTel language independence

**Step 18 — Add scheduler/cron job**
- Services: + Scheduler service (Node.js with `node-cron`)
- Three jobs unique to food delivery context:

| Job | Schedule | Action |
|---|---|---|
| Auto-cancel unconfirmed orders | Every 2 min | Query PG for orders in `placed` status > 15 min → set to `cancelled` → publish `order.cancelled` event |
| Driver availability refresh | Every 1 min | Query PG for drivers with no active delivery → update `drivers_available_total` gauge |
| Daily delivery summary | Every 3 min (simulated) | Count completed deliveries, average delivery time → write JSON report to MinIO |

- Custom metrics per job: `job_last_success_timestamp_seconds`, `job_duration_seconds`, `job_runs_total{status}`
- Alert: `time() - job_last_success_timestamp_seconds{job="auto-cancel-orders"} > 300` — if this job stops, orders pile up forever
- Key insight unique to food delivery: the auto-cancel job has a direct business impact if it misses a run — observable via DLQ depth AND job_last_success timestamp together
- New concept: job absence alerting, scheduler as a system health indicator, cross-signal incident correlation

---

## Final service inventory (Step 18 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Customer service | Node.js / Express | Order placement, restaurant browsing |
| Restaurant service | Node.js / Express | Order confirmation, menu management |
| Delivery service | Node.js / Express | Driver assignment, location tracking |
| Scheduler service | Node.js / node-cron | Auto-cancel, driver refresh, daily reports |
| Python worker | Python / aio-pika | ETA calculation async processor |
| Surge pricing service | Go | Real-time surge multiplier calculation |
| PostgreSQL | postgres:16 | Primary relational store |
| Redis | redis:8.4 | Menu cache + live driver location store |
| RabbitMQ | rabbitmq:management | Order state transition event bus |
| MinIO | minio | Delivery proof file storage |
| Meilisearch | meilisearch | Restaurant and dish search |
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

## What this project teaches that others do not

| Concept | How food delivery teaches it uniquely |
|---|---|
| Redis as live data store | Driver location with 10s TTL — not a cache, a live state store. TTL expiry rate is a liveness signal |
| Business metric alerting | `drivers_available_total == 0` is a business alert, not just a system alert |
| State machine tracing | One order has 6 status transitions — each is an event, all visible in one trace chain |
| Cross-signal incident correlation | Order spike + driver shortage + queue backlog all appear simultaneously — Grafana shows the relationship |
| Surge pricing as observable signal | Business multiplier and system load correlate — visible in the same dashboard |
| Scheduler as safety net | Auto-cancel job has direct business consequence if it misses — uniquely high-stakes job observability |
| Per-queue depth alerting | Three separate queues, each with different depth thresholds and meanings |

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
