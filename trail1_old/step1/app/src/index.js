import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || "ecom-product-api";

// --- Hardcoded product data (replaced by PostgreSQL in Step 7) ---
const products = [
  { id: 1, name: "Mechanical Keyboard", price: 7999, category: "electronics", stock: 45 },
  { id: 2, name: "Wireless Mouse", price: 2499, category: "electronics", stock: 120 },
  { id: 3, name: "USB-C Hub", price: 3499, category: "electronics", stock: 30 },
  { id: 4, name: "Monitor Stand", price: 4599, category: "accessories", stock: 60 },
  { id: 5, name: "Laptop Sleeve", price: 1999, category: "accessories", stock: 200 },
];

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

// --- Start ---
app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] listening on port ${PORT}`);
});