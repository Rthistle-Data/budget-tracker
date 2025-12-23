// web/src/api.js
// Single, consistent API layer using cookie sessions.
// Works locally (Vite proxy) AND in production (Vercel -> Render) via VITE_API_BASE.

const API_BASE = import.meta.env.VITE_API_BASE || ""; 
// Local dev: "" lets Vite proxy /api -> http://localhost:4000
// Prod: set VITE_API_BASE = "https://budget-tracker-ntji.onrender.com"

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { error: text } : {};
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || "Request failed");
  }

  return data;
}

/* ---------------------------
   Auth / Session
---------------------------- */

export function me() {
  return apiFetch("/api/auth/me", { method: "GET" });
}



export function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export function register(email, password) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function forgotPassword(email) {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(email, token, newPassword) {
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, token, newPassword }),
  });
}

/* ---------------------------
   Profile
---------------------------- */

export function changePassword(currentPassword, newPassword) {
  return apiFetch("/api/profile/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/* ---------------------------
   Transactions
---------------------------- */

export function getTransactions(month) {
  const url = month
    ? `/api/transactions?month=${encodeURIComponent(month)}`
    : `/api/transactions`;
  return apiFetch(url, { method: "GET", headers: {} });
}

export function addTransaction(txn) {
  return apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify(txn),
  });
}

export function updateTransaction(id, patch) {
  return apiFetch(`/api/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function deleteTransaction(id) {
  return apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
}

/* ---------------------------
   Budgets
---------------------------- */

export function getBudgets(month) {
  if (!month) throw new Error("month is required for getBudgets()");
  return apiFetch(`/api/budgets?month=${encodeURIComponent(month)}`, {
    method: "GET",
    headers: {},
  });
}

export function saveBudget({ month, category, amount }) {
  return apiFetch("/api/budgets", {
    method: "POST",
    body: JSON.stringify({ month, category, amount }),
  });
}

/* ---------------------------
   Categories
---------------------------- */

export function getCategories() {
  return apiFetch("/api/categories", { method: "GET", headers: {} });
}

export async function addCategory(name) {
  const res = await fetch(`${API_BASE}/api/categories`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { error: text } : {};
  }

  if (res.status === 409) throw new Error("Category already exists");
  if (!res.ok) throw new Error(data?.error || "Failed to add category");
  return data;
}

export function deleteCategory(id) {
  return apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}

/* ---------------------------
   Rules
---------------------------- */

export function getRules() {
  return apiFetch("/api/rules", { method: "GET", headers: {} });
}

export function addRule(contains, categoryId, name = "") {
  return apiFetch("/api/rules", {
    method: "POST",
    body: JSON.stringify({ contains, categoryId, name }),
  });
}


export function deleteRule(id) {
  return apiFetch(`/api/rules/${id}`, { method: "DELETE" });
}

/* ---------------------------
   AI: Rule Suggestion
---------------------------- */

export function suggestRule(transactionId) {
  return apiFetch(
    `/api/ai/suggest-rule?transactionId=${encodeURIComponent(transactionId)}`
  );
}

/* ---------------------------
   Recurring
---------------------------- */

export function getRecurring() {
  return apiFetch("/api/recurring", { method: "GET", headers: {} });
}

export function addRecurring(payload) {
  return apiFetch("/api/recurring", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function toggleRecurring(id, isActive) {
  return apiFetch(`/api/recurring/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function deleteRecurring(id) {
  return apiFetch(`/api/recurring/${id}`, { method: "DELETE" });
}

export function generateRecurring(month) {
  return apiFetch(`/api/recurring/generate?month=${encodeURIComponent(month)}`, {
    method: "POST",
    headers: {},
  });
}

export function importCsv(rows, source = "csv") {
  return apiFetch("/api/import/csv", {
    method: "POST",
    body: JSON.stringify({ rows, source }),
  });
}

export function dryRunImport({ month, rows, mapping }) {
  return apiFetch("/api/import/csv/dry-run", {
    method: "POST",
    body: JSON.stringify({ month, rows, mapping }),
  });
}

