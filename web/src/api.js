// web/src/api.js
// Single, consistent API layer using cookie sessions.
// Works with local dev + deployed Vercel (frontend) -> Render (backend).

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

/**
 * apiFetch("/api/...", { method, body, headers })
 * - Always includes cookies for session auth
 * - Parses JSON safely (even if server returns text)
 * - Throws a nice Error() on non-2xx responses
 */
export async function apiFetch(path, options = {}) {
  const url =
    path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${API_BASE}${path}`;

  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
      // Only set JSON content-type if caller didn't override
      ...(options.body != null && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
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
    // Prefer server-provided error messages
    const msg =
      data?.error ||
      data?.message ||
      `Request failed (${res.status} ${res.statusText})`;
    throw new Error(msg);
  }

  return data;
}

/* ---------------------------
   Auth / Session
---------------------------- */

export function me() {
  return apiFetch("/api/auth/me");
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
  return apiFetch(url);
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
  return apiFetch(`/api/budgets?month=${encodeURIComponent(month)}`);
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
  return apiFetch("/api/categories");
}

export async function addCategory(name) {
  try {
    return await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (e) {
    // Keep your friendly 409 message
    if (String(e?.message || "").toLowerCase().includes("409")) {
      throw new Error("Category already exists");
    }
    // If your server returns {error:"Category already exists"} it will already be nice.
    throw e;
  }
}

export function deleteCategory(id) {
  return apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}

/* ---------------------------
   Rules
---------------------------- */

export function getRules() {
  return apiFetch("/api/rules");
}

export function addRule(match, category) {
  return apiFetch("/api/rules", {
    method: "POST",
    body: JSON.stringify({ match, category }),
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
  return apiFetch("/api/recurring");
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
  });
}

/* ---------------------------
   CSV Import
---------------------------- */

export function importCsv(rows, source = "csv") {
  return apiFetch("/api/import/csv", {
    method: "POST",
    body: JSON.stringify({ rows, source }),
  });
}

export function dryRunImport({ month, rows, mapping }) {
  // IMPORTANT: include /api prefix and keep everything through apiFetch
  return apiFetch("/api/import/csv/dry-run", {
    method: "POST",
    body: JSON.stringify({ month, rows, mapping }),
  });
}

