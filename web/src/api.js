// web/src/api.js
const API_BASE =
  (import.meta.env.VITE_API_BASE || "http://localhost:4000").replace(/\/$/, "");

async function apiFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { error: text } : {};
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------------------------
   Auth / Session
---------------------------- */
export const me = () => apiFetch("/api/auth/me");
export const logout = () => apiFetch("/api/auth/logout", { method: "POST" });

export const register = (email, password) =>
  apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const login = (email, password) =>
  apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const forgotPassword = (email) =>
  apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const resetPassword = (email, token, newPassword) =>
  apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, token, newPassword }),
  });

/* ---------------------------
   Transactions
---------------------------- */
export function getTransactions(month) {
  const url = month
    ? `/api/transactions?month=${encodeURIComponent(month)}`
    : `/api/transactions`;
  return apiFetch(url, { method: "GET", headers: {} });
}

export const addTransaction = (txn) =>
  apiFetch("/api/transactions", { method: "POST", body: JSON.stringify(txn) });

export const updateTransaction = (id, patch) =>
  apiFetch(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(patch) });

export const deleteTransaction = (id) =>
  apiFetch(`/api/transactions/${id}`, { method: "DELETE" });

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

export const saveBudget = ({ month, category, amount }) =>
  apiFetch("/api/budgets", {
    method: "POST",
    body: JSON.stringify({ month, category, amount }),
  });

/* ---------------------------
   Categories
---------------------------- */
export const getCategories = () => apiFetch("/api/categories", { method: "GET", headers: {} });

export async function addCategory(name) {
  // Custom 409 message
  try {
    return await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (e) {
    if (String(e.message).includes("(409)")) throw new Error("Category already exists");
    throw e;
  }
}

export const deleteCategory = (id) =>
  apiFetch(`/api/categories/${id}`, { method: "DELETE" });

/* ---------------------------
   Rules
---------------------------- */
export const getRules = () => apiFetch("/api/rules", { method: "GET", headers: {} });

export const addRule = (match, category) =>
  apiFetch("/api/rules", { method: "POST", body: JSON.stringify({ match, category }) });

export const deleteRule = (id) =>
  apiFetch(`/api/rules/${id}`, { method: "DELETE" });

/* ---------------------------
   AI
---------------------------- */
export const suggestRule = (transactionId) =>
  apiFetch(`/api/ai/suggest-rule?transactionId=${encodeURIComponent(transactionId)}`);

/* ---------------------------
   Recurring
---------------------------- */
export const getRecurring = () => apiFetch("/api/recurring", { method: "GET", headers: {} });

export const addRecurring = (payload) =>
  apiFetch("/api/recurring", { method: "POST", body: JSON.stringify(payload) });

export const toggleRecurring = (id, isActive) =>
  apiFetch(`/api/recurring/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

export const deleteRecurring = (id) =>
  apiFetch(`/api/recurring/${id}`, { method: "DELETE" });

export const generateRecurring = (month) =>
  apiFetch(`/api/recurring/generate?month=${encodeURIComponent(month)}`, {
    method: "POST",
    headers: {},
  });

/* ---------------------------
   CSV import
---------------------------- */
export const importCsv = (rows, source = "csv") =>
  apiFetch("/api/import/csv", { method: "POST", body: JSON.stringify({ rows, source }) });

export const dryRunImport = ({ month, rows, mapping }) =>
  apiFetch("/api/import/csv/dry-run", {
    method: "POST",
    body: JSON.stringify({ month, rows, mapping }),
  });

