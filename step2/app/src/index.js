import express from "express";
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";

const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || "ecom-product-api";
collectDefaultMetrics({ prefix: "ecom_" });

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

const productsAvailable = new Gauge({
  name: "products_available_total",
  help: "Number of products currently in the store",
});

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// --- Hardcoded product data (replaced by PostgreSQL in Step 7) ---
const products = [
  { id: 1, name: "Mechanical Keyboard", price: 7999, category: "electronics", stock: 45 },
  { id: 2, name: "Wireless Mouse", price: 2499, category: "electronics", stock: 120 },
  { id: 3, name: "USB-C Hub", price: 3499, category: "electronics", stock: 30 },
  { id: 4, name: "Monitor Stand", price: 4599, category: "accessories", stock: 60 },
  { id: 5, name: "Laptop Sleeve", price: 1999, category: "accessories", stock: 200 },
];

productsAvailable.set(products.length);

app.use((req, res, next) => {
  if (req.path === "/metrics" || req.path === "/health") {
    return next();
  }

  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const route = normalizeRoute(req.path);
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
});

// --- Routes ---

app.get("/products", (req, res) => {
  console.log(`[${SERVICE_NAME}] GET /products — returning ${products.length} products`);
  res.json(products);
});

app.get("/products/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find((p) => p.id === id);

  if (!product) {
    console.log(`[${SERVICE_NAME}] GET /products/${id} — not found`);
    return res.status(404).json({ error: "Product not found" });
  }

  console.log(`[${SERVICE_NAME}] GET /products/${id} — ${product.name}`);
  res.json(product);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

function normalizeRoute(path) {
  if (path === "/products") return "/products";
  if (path.startsWith("/products/")) return "/products/:id";
  return path;
}

// --- Start ---
app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] listening on port ${PORT}`);
});