// web/src/api.js
// Single, consistent API layer using cookie sessions.
// Dev: use Vite proxy with VITE_API_URL="" (or omit it) and proxy /api -> http://localhost:4000
// Prod: set VITE_API_URL="https://your-backend.onrender.com" (your backend URL)

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

// NOTE: These are currently NOT implemented on the server.
// Keep them only if you plan to add routes later.
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

// NOTE: Not implemented on the server yet (unless you added it).
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

// ⚠️ Your server route in the rewritten backend is POST /api/budgets/save
// If your UI still calls POST /api/budgets, either:
//   A) change UI to call saveBudgetsMonth(), or
//   B) add a POST /api/budgets route on the server.
// For now, leaving your original behavior.
export const saveBudget = ({ month, category, amount }) =>
  apiFetch("/api/budgets", {
    method: "POST",
    body: JSON.stringify({ month, category, amount }),
  });

// If you want to use the backend month-save endpoint:
export const saveBudgetsMonth = ({ month, items }) =>
  apiFetch("/api/budgets/save", {
    method: "POST",
    body: JSON.stringify({ month, items }),
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

// ✅ Match server: POST /api/recurring/:id/toggle
export const toggleRecurring = (id) =>
  apiFetch(`/api/recurring/${encodeURIComponent(id)}/toggle`, {
    method: "POST",
  });

export const deleteRecurring = (id) =>
  apiFetch(`/api/recurring/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

// ✅ Match server: POST /api/recurring/generate with JSON body { month }
export const generateRecurring = (month) =>
  apiFetch("/api/recurring/generate", {
    method: "POST",
    body: JSON.stringify({ month }),
  });

/* ---------------------------
   Subscriptions / Bills
---------------------------- */

export const getSubscriptionCandidates = (days = 180) =>
  apiFetch(`/api/subscriptions/candidates?days=${encodeURIComponent(days)}`);

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

// NOTE: Your server dry-run currently ignores mapping. It accepts { month, rows }.
// Keeping mapping in case your UI sends it, but server will just ignore extra fields.
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
   Settings + Forecast
---------------------------- */

export const getSettings = () => apiFetch("/api/settings");

export const setCurrentBalance = (currentBalance) =>
  apiFetch("/api/settings/balance", {
    method: "POST",
    body: JSON.stringify({ currentBalance }),
  });

// ✅ Single forecast function (no duplicates)
export const getForecast = (days = 60) =>
  apiFetch(`/api/forecast?days=${encodeURIComponent(days)}`, {
    method: "GET",
  });
