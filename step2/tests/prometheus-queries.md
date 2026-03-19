# Prometheus Queries — ecom-product-api

## Counter Queries

Counters only go up. Always use `rate()` or `increase()` to query them.

```promql
rate(http_requests_total[5m])
```
Requests per second across all routes.

```promql
rate(http_requests_total{status_code="404"}[5m])
```
Rate of 404 errors per second.

```promql
increase(http_requests_total[1h])
```
Total request count in the last 1 hour.

```promql
sum(rate(http_requests_total[5m])) by (route)
```
Requests per second grouped by route.

```promql
rate(ecom_process_cpu_seconds_total[5m])
```
CPU usage rate (fraction of one core).

---

## Gauge Queries

Gauges go up and down. Query them directly — no `rate()` needed.

```promql
products_available_total
```
Current number of products in the store.

```promql
ecom_process_resident_memory_bytes / 1024 / 1024
```
Current memory usage in MB.

```promql
ecom_nodejs_eventloop_lag_seconds
```
Current event loop lag in seconds.

```promql
ecom_nodejs_heap_size_used_bytes / ecom_nodejs_heap_size_total_bytes
```
Heap usage ratio (0 to 1).

```promql
ecom_process_open_fds
```
Current number of open file descriptors.

---

## Histogram Queries

Histograms track value distributions. Use `histogram_quantile()` on `_bucket`, or `rate()` on `_sum` / `_count`.

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```
95th percentile request latency.

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```
99th percentile request latency.

```promql
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])
```
Average request latency.

```promql
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))
```
Median (50th percentile) request latency.

```promql
rate(http_request_duration_seconds_count[5m])
```
Request throughput (requests per second, derived from histogram).
