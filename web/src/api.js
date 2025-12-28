// web/src/api.js
// Single, consistent API layer using cookie sessions.
// Dev: you can use Vite proxy with VITE_API_URL="" (or omit it) and proxy /api -> http://localhost:4000
// Prod: set VITE_API_URL="https://budget-tracker-u8to.onrender.com" (your backend URL)

const rawBase = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE = rawBase ? rawBase.replace(/\/+$/, "") : ""; // "" means relative (/api/...) for Vite proxy

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    credentials: "include", // REQUIRED for cookie sessions
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  // parse JSON if possible, otherwise surface text
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text ? { error: text } : {};
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/* ---------------------------
   Auth / Session
---------------------------- */

export const me = () => apiFetch("/api/auth/me");

export const login = (email, password) =>
  apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const register = (email, password) =>
  apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const logout = () =>
  apiFetch("/api/auth/logout", {
    method: "POST",
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
   Profile
---------------------------- */

export const changePassword = (currentPassword, newPassword) =>
  apiFetch("/api/profile/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

/* ---------------------------
   Transactions
---------------------------- */

export const getTransactions = (month) => {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiFetch(`/api/transactions${qs}`);
};

export const addTransaction = (txn) =>
  apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify(txn),
  });

export const updateTransaction = (id, patch) =>
  apiFetch(`/api/transactions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });

export const deleteTransaction = (id) =>
  apiFetch(`/api/transactions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/* ---------------------------
   Budgets
---------------------------- */

export const getBudgets = (month) => {
  if (!month) throw new Error("month is required for getBudgets()");
  return apiFetch(`/api/budgets?month=${encodeURIComponent(month)}`);
};

export const saveBudget = ({ month, category, amount }) =>
  apiFetch("/api/budgets", {
    method: "POST",
    body: JSON.stringify({ month, category, amount }),
  });

/* ---------------------------
   Categories
---------------------------- */

export const getCategories = () => apiFetch("/api/categories");

export const addCategory = async (name) => {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Category name required");

  try {
    return await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: clean }),
    });
  } catch (e) {
    if (e?.status === 409) throw new Error("Category already exists");
    throw e;
  }
};

export const deleteCategory = (id) =>
  apiFetch(`/api/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/* ---------------------------
   Rules
---------------------------- */

export const getRules = () => apiFetch("/api/rules");

export const addRule = (match, category) =>
  apiFetch("/api/rules", {
    method: "POST",
    body: JSON.stringify({
      match: String(match ?? "").trim().toLowerCase(),
      category: String(category ?? "").trim(),
    }),
  });

export const deleteRule = (id) =>
  apiFetch(`/api/rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/* ---------------------------
   AI: Rule Suggestion
---------------------------- */

export const suggestRule = (transactionId) =>
  apiFetch(`/api/ai/suggest-rule?transactionId=${encodeURIComponent(transactionId)}`);

/* ---------------------------
   Recurring
---------------------------- */

export const getRecurring = () => apiFetch("/api/recurring");

export const addRecurring = (payload) =>
  apiFetch("/api/recurring", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const toggleRecurring = (id, isActive) =>
  apiFetch(`/api/recurring/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

export const deleteRecurring = (id) =>
  apiFetch(`/api/recurring/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const generateRecurring = (month) =>
  apiFetch(`/api/recurring/generate?month=${encodeURIComponent(month)}`, {
    method: "POST",
  });

/* ---------------------------
   Subscriptions / Bills
---------------------------- */

export const getSubscriptionCandidates = () => apiFetch("/api/subscriptions/candidates");

export const getSubscriptions = () => apiFetch("/api/subscriptions");

export const saveSubscription = (payload) =>
  apiFetch("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const ignoreSubscriptionCandidate = (merchantKey) =>
  apiFetch("/api/subscriptions/ignore", {
    method: "POST",
    body: JSON.stringify({ merchantKey }),
  });

export const updateSubscription = (id, patch) =>
  apiFetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const deleteSubscription = (id) =>
  apiFetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

/* ---------------------------
   CSV Import
---------------------------- */

export const importCsv = (rows, source = "csv") =>
  apiFetch("/api/import/csv", {
    method: "POST",
    body: JSON.stringify({ rows, source }),
  });

export const dryRunImport = ({ month, rows, mapping }) =>
  apiFetch("/api/import/csv/dry-run", {
    method: "POST",
    body: JSON.stringify({ month, rows, mapping }),
  });

/* ---------------------------
   Insights
   NOTE: Your backend route is /insights (NOT /api/insights)
---------------------------- */

export const getInsights = (month) => {
  if (!month) throw new Error("month is required for getInsights()");
  return apiFetch(`/insights?month=${encodeURIComponent(month)}`);
};

/* ---------------------------
   Forecast
---------------------------- */

export async function getForecast(days = 30) {
  const res = await fetch(`${API_BASE}/api/forecast?days=${encodeURIComponent(days)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
