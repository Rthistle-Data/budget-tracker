import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./styles.css";


import EditTransactionModal from "./components/EditTransactionModal";
import InsightsPanel from "./components/InsightsPanel";

import {
  me,
  logout,

  // transactions
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,

  // budgets
  getBudgets,
  saveBudget,

  // categories
  getCategories,
  addCategory,
  deleteCategory,

  // rules
  getRules,
  addRule,
  deleteRule,

  // recurring
  getRecurring,
  addRecurring,
  toggleRecurring,
  deleteRecurring,
  generateRecurring,

  // CSV import
  importCsv,

  // auth
  login,
  register,

  // AI helper
  suggestRule,
} from "./api";

/* ---------------------------
   Helpers (safe response shapes)
---------------------------- */

function toArray(value, key) {
  // Supports:
  // - direct array
  // - { [key]: array }
  // - null/undefined
  if (Array.isArray(value)) return value;
  if (value && key && Array.isArray(value[key])) return value[key];
  return [];
}

function monthNow() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function isoDateForMonthDay(month, day) {
  const dd = String(day).padStart(2, "0");
  return `${month}-${dd}`;
}

function money(n) {
  const x = Number(n) || 0;
  return x.toFixed(2);
}

/* ---------------------------
   CSV Import Card
---------------------------- */

function CsvImportCard({ month, onImported }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function normalizeDateToIso(s) {
    if (!s) return "";
    const str = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // MM/DD/YYYY or M/D/YY etc
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const mm = m[1].padStart(2, "0");
      const dd = m[2].padStart(2, "0");
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
    }
    return "";
  }

  async function handleFile(file) {
    setMsg("");
    setBusy(true);

    try {
      const text = await file.text();

      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors?.length) {
        throw new Error(parsed.errors[0].message || "CSV parse error");
      }

      const rowsRaw = parsed.data || [];
      if (!rowsRaw.length) throw new Error("No rows found in CSV.");

      const rows = rowsRaw.map((r) => {
        const date = normalizeDateToIso(
          pick(r, ["Date", "date", "Transaction Date", "Posted Date", "Posting Date"])
        );

        const merchant = String(
          pick(r, ["Description", "Merchant", "Payee", "Name", "Memo", "Details", "description"])
        ).trim();

        const amountRaw = pick(r, ["Amount", "amount", "CAD", "Value"]);
        const debitRaw = pick(r, ["Debit", "debit"]);
        const creditRaw = pick(r, ["Credit", "credit"]);

        let amount = amountRaw;
        if (!amount && (debitRaw || creditRaw)) {
          if (debitRaw) amount = `-${debitRaw}`;
          else amount = creditRaw;
        }

        const account = String(pick(r, ["Account", "account"]) || "Chequing").trim();

        return { date, merchant, amount, account, note: "" };
      });

      // Prefer rows in selected month if present
      const filtered = rows.filter((r) => r.date && r.date.startsWith(month));
      const toSend = filtered.length ? filtered : rows;

      // Your server route expects: { rows, source }
      const result = await importCsv(toSend, file.name);

      // Your server returns: { ok, inserted, skipped }
      const inserted = Number(result?.inserted) || 0;
      const skipped = Number(result?.skipped) || 0;

      setMsg(`Imported: ${inserted} • Skipped: ${skipped}`);

      await onImported?.();
    } catch (e) {
      setMsg(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card cardPad" style={{ borderRadius: 16, marginBottom: 14 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div>
          <div className="brandTitle" style={{ fontSize: 16 }}>
            Import bank CSV
          </div>
          <div className="brandSub">Upload a CSV. We’ll auto-dedupe and apply your Rules.</div>
        </div>
        <div className="spacer" />
        <label className="btn btnPrimary" style={{ cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "Importing…" : "Choose CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {msg && (
        <div style={{ marginTop: 10, color: msg.startsWith("Imported:") ? "var(--muted)" : "var(--danger)" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
        Tip: If your bank uses different headers, we can add a tiny “column mapper” next.
      </div>
    </div>
  );
}

/* ---------------------------
   Home
---------------------------- */

export default function Home() {
  // --------------------
  // Auth
  // --------------------
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // --------------------
  // UI state
  // --------------------
  const [tab, setTab] = useState("dashboard");
  const [month, setMonth] = useState(monthNow());

  // --------------------
  // Data state
  // --------------------
  const [txns, setTxns] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [rules, setRules] = useState([]);
  const [recurring, setRecurring] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // txn form
  const [date, setDate] = useState(`${month}-01`);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [merchant, setMerchant] = useState("");
  const [account, setAccount] = useState("Chequing");
  const [note, setNote] = useState("");

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTx, setEditTx] = useState(null);

  function openEdit(tx) {
    setEditTx(tx);
    setEditOpen(true);
  }

  // --------------------
  // AI Rule Builder modal
  // --------------------
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiTx, setAiTx] = useState(null);

  const addRuleApi = addRule;

  async function openAiRule(tx) {
    setAiTx(tx);
    setAiSuggestion(null);
    setAiError("");
    setAiOpen(true);
    setAiLoading(true);

    try {
      const result = await suggestRule(tx.id);
      setAiSuggestion(result);
    } catch (e) {
      setAiError(e?.message || "Failed to get AI suggestion");
    } finally {
      setAiLoading(false);
    }
  }

  async function confirmAiRule() {
    if (!aiSuggestion) return;
    await addRuleApi(aiSuggestion.match, aiSuggestion.category);

    // rule list can be either array or {rules:[]}
    const r = await getRules();
    setRules(toArray(r, "rules"));

    setAiOpen(false);
    setAiSuggestion(null);
    setAiTx(null);
  }

  // --------------------
  // Auth: check session once
  // --------------------
  useEffect(() => {
    (async () => {
      try {
        const data = await me();
        setUser(data?.user || null);
      } catch {
        setUser(null);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  // --------------------
  // Load all data (defensive)
  // --------------------
  async function loadAll() {
    setLoading(true);
    setErr("");

    try {
      const [t, b, c, r, rec] = await Promise.all([
        getTransactions(month),
        getBudgets(month),
        getCategories(),
        getRules(),
        getRecurring(),
      ]);

      setTxns(toArray(t, "transactions"));
      setBudgets(toArray(b, "budgets"));
      setCategoriesList(toArray(c, "categories"));
      setRules(toArray(r, "rules"));
      setRecurring(toArray(rec, "recurring"));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setDate(`${month}-01`);
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, user]);

  // Always safe arrays
  const safeTxns = Array.isArray(txns) ? txns : [];
  const safeBudgets = Array.isArray(budgets) ? budgets : [];
  const safeCategoriesList = Array.isArray(categoriesList) ? categoriesList : [];
  const safeRules = Array.isArray(rules) ? rules : [];
  const safeRecurring = Array.isArray(recurring) ? recurring : [];

  // --------------------
  // Derived data
  // --------------------
  const summary = useMemo(() => {
    const income = safeTxns.filter((x) => Number(x.amount) > 0).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const spend = safeTxns.filter((x) => Number(x.amount) < 0).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    return { income, spend, net: income + spend };
  }, [safeTxns]);

  const spentByCategory = useMemo(() => {
    const map = new Map();
    for (const t of safeTxns) {
      const amt = Number(t.amount) || 0;
      if (amt >= 0) continue;
      const cat = t.category || "Uncategorized";
      map.set(cat, (map.get(cat) || 0) + Math.abs(amt));
    }
    return map;
  }, [safeTxns]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const c of safeCategoriesList) set.add(c.name);
    for (const b of safeBudgets) set.add(b.category);
    for (const t of safeTxns) set.add(t.category || "Uncategorized");
    set.add("Uncategorized");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [safeCategoriesList, safeBudgets, safeTxns]);

  const budgetMap = useMemo(() => {
    const m = new Map();
    for (const b of safeBudgets) m.set(b.category, Number(b.amount) || 0);
    return m;
  }, [safeBudgets]);

  const budgetRows = useMemo(() => {
    return categories.map((cat) => {
      const budgeted = budgetMap.get(cat) || 0;
      const spent = spentByCategory.get(cat) || 0;
      const remaining = budgeted - spent;
      return { cat, budgeted, spent, remaining };
    });
  }, [categories, budgetMap, spentByCategory]);

  const topCategories = useMemo(() => {
    const arr = Array.from(spentByCategory.entries()).map(([cat, spent]) => ({
      cat,
      spent: Number(spent) || 0,
    }));
    arr.sort((a, b) => b.spent - a.spent);
    return arr.slice(0, 6);
  }, [spentByCategory]);

  const budgetProgress = useMemo(() => {
    const rows = budgetRows
      .filter((r) => (Number(r.budgeted) || 0) > 0 || (Number(r.spent) || 0) > 0)
      .map((r) => ({
        ...r,
        budgeted: Number(r.budgeted) || 0,
        spent: Number(r.spent) || 0,
      }));

    rows.sort((a, b) => (b.budgeted > 0) - (a.budgeted > 0) || b.spent - a.spent);
    return rows.slice(0, 10);
  }, [budgetRows]);

  // ✅ Exact matching using recurringId
  const recurringForecast = useMemo(() => {
    const active = safeRecurring.filter((x) => x.isActive !== 0 && x.isActive !== false);

    function isApplied(recItem) {
      return safeTxns.some((t) => t.recurringId === recItem.id);
    }

    const rows = active
      .map((x) => {
        const dueDate = isoDateForMonthDay(month, x.dayOfMonth);
        const applied = isApplied(x);
        return {
          id: x.id,
          name: x.name,
          amount: Number(x.amount) || 0,
          category: x.category,
          merchant: x.merchant,
          dayOfMonth: x.dayOfMonth,
          dueDate,
          applied,
        };
      })
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

    const upcoming = rows.filter((x) => !x.applied);

    const upcomingExpenseTotal = upcoming
      .filter((x) => x.amount < 0)
      .reduce((sum, x) => sum + Math.abs(x.amount), 0);

    const upcomingIncomeTotal = upcoming
      .filter((x) => x.amount > 0)
      .reduce((sum, x) => sum + x.amount, 0);

    return { rows, upcoming, upcomingExpenseTotal, upcomingIncomeTotal };
  }, [safeRecurring, safeTxns, month]);

  // --------------------
  // Actions
  // --------------------
  async function onAddTxn(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) return alert("Enter a valid amount (non-zero).");
    if (!date) return alert("Enter a date (YYYY-MM-DD).");

    await addTransaction({
      date,
      amount: amt,
      category: category || "Uncategorized",
      merchant,
      account,
      note,
    });

    setAmount("");
    setMerchant("");
    setNote("");
    await loadAll();
  }

  async function onSaveBudget(cat, value) {
    const amt = Number(value);
    if (!Number.isFinite(amt) || amt < 0) return alert("Budget must be a number >= 0");
    await saveBudget({ month, category: cat, amount: amt });
    await loadAll();
  }

  async function onSaveEdit(payload) {
    if (!editTx) return;

    const patch = {
      date: payload.date,
      amount: Number(payload.amount),
      category: payload.category || "Uncategorized",
      merchant: payload.merchant || "",
      account: payload.account || "Chequing",
      note: payload.note || "",
    };

    const updated = await updateTransaction(editTx.id, patch);

    // Some APIs return { transaction }, others return transaction directly
    const updatedTx = updated?.transaction ?? updated;

    setTxns((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map((t) => (t.id === updatedTx.id ? updatedTx : t));
    });

    setEditOpen(false);
    setEditTx(null);
  }

  async function onDeleteTxn(id) {
    const ok = confirm("Delete this transaction?");
    if (!ok) return;

    const snapshot = safeTxns;
    setTxns((prev) => (Array.isArray(prev) ? prev.filter((t) => t.id !== id) : []));

    try {
      await deleteTransaction(id);
    } catch (e) {
      setTxns(snapshot);
      alert(e?.message || "Delete failed");
    }
  }

  // --------------------
  // Auth gating
  // --------------------
  if (!authChecked) {
    return (
      <div className="container">
        <div className="card cardPad">
          <div className="brandTitle">Budget Tracker</div>
          <div className="brandSub">Checking session…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card cardPad" style={{ maxWidth: 520, margin: "60px auto" }}>
          <div className="brandTitle" style={{ fontSize: 26 }}>
            Budget Tracker
          </div>
          <div className="brandSub" style={{ marginBottom: 14 }}>
            Sign in to access your workspace.
          </div>

          <AuthScreen onAuthed={(u) => setUser(u)} />

          <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </div>
      </div>
    );
  }

  const modalCategories = categories;

  // --------------------
  // Main UI
  // --------------------
  return (
    <div className="container">
      <div className="shell">
        {/* Sidebar */}
        <aside className="card">
          <div className="topbar">
            <div>
              <div className="brandTitle">Budget Tracker</div>
              <div className="brandSub">
                Signed in as <b>{user.email}</b>
              </div>
            </div>
          </div>

          <div className="nav">
            <NavItem active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
              Dashboard
              
              <NavItem active={tab === "insights"} onClick={() => setTab("insights")}>
  	      Insights
	    </NavItem>

            </NavItem>
            <NavItem active={tab === "transactions"} onClick={() => setTab("transactions")}>
              Transactions
            </NavItem>
            <NavItem active={tab === "budgets"} onClick={() => setTab("budgets")}>
              Budgets
            </NavItem>
            <NavItem active={tab === "categories"} onClick={() => setTab("categories")}>
              Categories
            </NavItem>
            <NavItem active={tab === "rules"} onClick={() => setTab("rules")}>
              Rules
            </NavItem>
            <NavItem active={tab === "recurring"} onClick={() => setTab("recurring")}>
              Recurring
            </NavItem>
	<Link className="navItem" to="/why">
  	  Why this app exists
	</Link>

	<Link className="navItem" to="/profile">
 		 Profile
	</Link>

            <div style={{ height: 8 }} />

            <button
              className="navItem"
              onClick={async () => {
                await logout();
                setUser(null);
              }}
              style={{ textAlign: "left", width: "100%" }}
              type="button"
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="card">
          <div className="topbar">
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{tabLabel(tab)}</div>
              <div className="brandSub">Month view + categorized spending</div>
            </div>

            <div className="spacer" />

            <div className="row">
              <label className="field" style={{ width: 160 }}>
                <div className="label">Month</div>
                <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
              </label>

              <button className="btn" onClick={loadAll} type="button">
                Refresh
              </button>
            </div>
          </div>

          <div className="cardPad">
            {err && (
              <div className="noticeErr" style={{ marginBottom: 12 }}>
                <b>Error:</b> {err}
              </div>
            )}
            {loading && <div style={{ color: "var(--muted)" }}>Loading…</div>}

            {!loading && (
              <>
                {tab === "dashboard" ? (
                  <DashboardPanel
                    month={month}
                    income={summary.income}
                    spend={Math.abs(summary.spend)}
                    net={summary.net}
                    topCategories={topCategories}
                    budgetProgress={budgetProgress}
                    recurringForecast={recurringForecast}
                  />
                  ) : tab === "insights" ? (
  		    <InsightsPanel month={month} />
                ) : tab === "transactions" ? (
                  <>
                    <div className="kpiGrid" style={{ marginBottom: 14 }}>
                      <KPI label={`Income · ${month}`} value={`$${money(summary.income)}`} />
                      <KPI label={`Spend · ${month}`} value={`$${money(Math.abs(summary.spend))}`} />
                      <KPI label={`Net · ${month}`} value={`$${money(summary.net)}`} />
                    </div>

                    <CsvImportCard month={month} onImported={loadAll} />

                    <div className="card" style={{ borderRadius: 16 }}>
                      <div className="cardPad">
                        <form onSubmit={onAddTxn} className="grid3">
                          <div className="field">
                            <div className="label">Date</div>
                            <input className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                          </div>

                          <div className="field">
                            <div className="label">Amount (negative = expense)</div>
                            <input
                              className="input"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="-54.23"
                            />
                          </div>

                          <div className="field">
                            <div className="label">Category</div>
                            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                              {categories.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="field">
                            <div className="label">Merchant</div>
                            <input
                              className="input"
                              value={merchant}
                              onChange={(e) => setMerchant(e.target.value)}
                              placeholder="Superstore"
                            />
                          </div>

                          <div className="field">
                            <div className="label">Account</div>
                            <input
                              className="input"
                              value={account}
                              onChange={(e) => setAccount(e.target.value)}
                              placeholder="Chequing"
                            />
                          </div>

                          <div className="field">
                            <div className="label">Note</div>
                            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
                          </div>

                          <button className="btn btnPrimary" style={{ gridColumn: "1 / -1" }}>
                            Add transaction
                          </button>
                        </form>
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Merchant</th>
                            <th>Category</th>
                            <th>Account</th>
                            <th>Amount</th>
                            <th>Note</th>
                            <th style={{ width: 270 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {safeTxns.map((t) => (
                            <tr key={t.id}>
                              <td>{t.date}</td>
                              <td>{t.merchant}</td>
                              <td>{t.category}</td>
                              <td>{t.account}</td>
                              <td style={{ fontWeight: 800 }}>{money(t.amount)}</td>
                              <td style={{ color: "var(--muted)" }}>{t.note}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <button className="btn" type="button" onClick={() => openEdit(t)}>
                                  Edit
                                </button>{" "}
                                <button className="btn" type="button" onClick={() => openAiRule(t)}>
                                  Suggest rule
                                </button>{" "}
                                <button className="btn btnDanger" type="button" onClick={() => onDeleteTxn(t.id)}>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}

                          {safeTxns.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 18 }}>
                                No transactions for {month}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <EditTransactionModal
                      open={editOpen}
                      onClose={() => {
                        setEditOpen(false);
                        setEditTx(null);
                      }}
                      tx={editTx}
                      categories={modalCategories}
                      onSave={onSaveEdit}
                    />

                    <AiRuleModal
                      open={aiOpen}
                      loading={aiLoading}
                      error={aiError}
                      suggestion={aiSuggestion}
                      tx={aiTx}
                      onClose={() => setAiOpen(false)}
                      onConfirm={confirmAiRule}
                    />
                  </>
                ) : tab === "budgets" ? (
                  <BudgetsPanel month={month} rows={budgetRows} onSave={onSaveBudget} />
                ) : tab === "categories" ? (
                  <CategoriesPanel
                    items={safeCategoriesList}
                    onAdd={async (name) => {
                      await addCategory(name);
                      const c = await getCategories();
                      setCategoriesList(toArray(c, "categories"));
                    }}
                    onDelete={async (id) => {
                      await deleteCategory(id);
                      const c = await getCategories();
                      setCategoriesList(toArray(c, "categories"));
                    }}
                  />
                ) : tab === "rules" ? (
                  <RulesPanel
                    rules={safeRules}
                    categories={categories}
                    onAdd={async (match, cat) => {
                      await addRuleApi(match, cat);
                      const r = await getRules();
                      setRules(toArray(r, "rules"));
                    }}
                    onDelete={async (id) => {
                      await deleteRule(id);
                      const r = await getRules();
                      setRules(toArray(r, "rules"));
                    }}
                  />
                ) : (
                  <RecurringPanel
                    month={month}
                    categories={categories}
                    items={safeRecurring}
                    onAdd={async (payload) => {
                      await addRecurring(payload);
                      const rec = await getRecurring();
                      setRecurring(toArray(rec, "recurring"));
                    }}
                    onToggle={async (id, isActive) => {
                      await toggleRecurring(id, isActive);
                      const rec = await getRecurring();
                      setRecurring(toArray(rec, "recurring"));
                    }}
                    onDelete={async (id) => {
                      await deleteRecurring(id);
                      const rec = await getRecurring();
                      setRecurring(toArray(rec, "recurring"));
                    }}
                    onGenerate={async () => {
                      const result = await generateRecurring(month);
                      await loadAll();
                      alert(`Generated ${result.createdCount} transaction(s) for ${month}`);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------------------
   Small components
---------------------------- */

function tabLabel(tab) {
  if (tab === "dashboard") return "Dashboard";
  if (tab === "insights") return "Insights";
  if (tab === "transactions") return "Transactions";
  if (tab === "budgets") return "Budgets";
  if (tab === "categories") return "Categories";
  if (tab === "rules") return "Rules";
  return "Recurring";
}


function NavItem({ active, children, onClick }) {
  return (
    <button
      className={`navItem ${active ? "navItemActive" : ""}`}
      onClick={onClick}
      style={{ width: "100%", textAlign: "left" }}
      type="button"
    >
      {children}
    </button>
  );
}

function KPI({ label, value }) {
  return (
    <div className="kpi">
      <div className="kpiLabel">{label}</div>
      <div className="kpiValue">{value}</div>
    </div>
  );
}


/* ---------------------------
   AI Modal
---------------------------- */

function AiRuleModal({ open, loading, error, suggestion, tx, onClose, onConfirm }) {
  if (!open) return null;

  return (
    <div className="modalBackdrop">
      <div className="modal card cardPad" style={{ maxWidth: 520 }}>
        <div className="brandTitle" style={{ fontSize: 18 }}>
          AI Rule Suggestion
        </div>
        <div className="brandSub" style={{ marginTop: 4 }}>
          {tx?.merchant ? `For: ${tx.merchant}` : "For selected transaction"}
        </div>

        {loading && <div className="brandSub" style={{ marginTop: 12 }}>Analyzing transaction…</div>}
        {error && <div className="noticeErr" style={{ marginTop: 12 }}>{error}</div>}

        {!loading && suggestion && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div>
              <b>Match:</b> <code>{suggestion.match}</code>
            </div>
            <div>
              <b>Category:</b> {suggestion.category}
            </div>
            {typeof suggestion.confidence === "number" && (
              <div>
                <b>Confidence:</b> {(suggestion.confidence * 100).toFixed(0)}%
              </div>
            )}
            {(suggestion.reasoning || suggestion.reason) && (
              <div style={{ color: "var(--muted)", marginTop: 4 }}>
                {suggestion.reasoning || suggestion.reason}
              </div>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <div className="spacer" />
          <button className="btn btnPrimary" onClick={onConfirm} disabled={!suggestion} type="button">
            Create rule
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   Panels (same as yours)
---------------------------- */

function DashboardPanel({ month, income, spend, net, topCategories, budgetProgress, recurringForecast }) {
  const big = (n) => {
    const x = Number(n) || 0;
    const s = Math.abs(x).toFixed(2);
    return x < 0 ? `-$${s}` : `$${s}`;
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="kpiGrid">
        <KPI label={`Income · ${month}`} value={big(income)} />
        <KPI label={`Spend · ${month}`} value={big(spend)} />
        <KPI label={`Net · ${month}`} value={big(net)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card cardPad" style={{ borderRadius: 16 }}>
          <div className="brandTitle" style={{ fontSize: 16 }}>Forecast (Recurring)</div>
          <div className="brandSub">What’s still coming in {month}</div>

          {(() => {
            const upcoming = recurringForecast?.upcoming || [];
            const upcomingExpenseTotal = Number(recurringForecast?.upcomingExpenseTotal) || 0;
            const upcomingIncomeTotal = Number(recurringForecast?.upcomingIncomeTotal) || 0;

            const forecastSpend = (Number(spend) || 0) + upcomingExpenseTotal;
            const forecastNet = (Number(net) || 0) + upcomingIncomeTotal - upcomingExpenseTotal;

            return (
              <>
                <div className="kpiGrid" style={{ marginTop: 12 }}>
                  <KPI label="Upcoming income" value={`$${money(upcomingIncomeTotal)}`} />
                  <KPI label="Upcoming expenses" value={`$${money(upcomingExpenseTotal)}`} />
                  <KPI label="Forecast net" value={`$${money(forecastNet)}`} />
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {upcoming.length === 0 ? (
                    <div className="brandSub">Nothing upcoming — looks like you’re caught up.</div>
                  ) : (
                    upcoming.slice(0, 6).map((x) => (
                      <div
                        key={x.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 14,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {x.name}
                          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                            Due {x.dueDate}{x.category ? ` · ${x.category}` : ""}
                          </div>
                        </div>

                        <div style={{ marginLeft: "auto", fontWeight: 800 }}>
                          {x.amount < 0 ? `-$${money(Math.abs(x.amount))}` : `$${money(x.amount)}`}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                  Forecast spend: <b>${money(forecastSpend)}</b>
                </div>
              </>
            );
          })()}
        </div>

        <div className="card cardPad" style={{ borderRadius: 16 }}>
          <div className="brandTitle" style={{ fontSize: 16 }}>Top spending categories</div>
          <div className="brandSub">Highest spending in {month}</div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {topCategories.length === 0 ? (
              <div className="brandSub">No spending yet this month.</div>
            ) : (
              topCategories.map((x) => (
                <div key={x.cat} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{x.cat}</div>
                    <div style={{ marginLeft: "auto", color: "var(--muted)" }}>{big(x.spent)}</div>
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.round((x.spent / (topCategories[0]?.spent || 1)) * 100))}%`,
                        background: "rgba(91,140,255,0.55)",
                        transition: "width 180ms ease",
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card cardPad" style={{ borderRadius: 16, gridColumn: "1 / -1" }}>
          <div className="brandTitle" style={{ fontSize: 16 }}>Budget progress</div>
          <div className="brandSub">Spent vs Budgeted (top 10)</div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {budgetProgress.length === 0 ? (
              <div className="brandSub">No budgets or spending yet.</div>
            ) : (
              budgetProgress.slice(0, 10).map((r) => {
                const spent = Number(r.spent) || 0;
                const budgeted = Number(r.budgeted) || 0;

                const hasBudget = budgeted > 0;
                const pctRaw = hasBudget ? (spent / budgeted) * 100 : 0;
                const fill = hasBudget ? Math.min(120, Math.max(0, pctRaw)) : 0;

                const remaining = budgeted - spent;

                return (
                  <div key={r.cat} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 800 }}>{r.cat}</div>
                      <div style={{ marginLeft: "auto", color: "var(--muted)" }}>
                        {hasBudget
                          ? `${big(spent)} / ${big(budgeted)} · ${pctRaw.toFixed(0)}% · ${
                              remaining >= 0 ? `${big(remaining)} left` : `${big(-remaining)} over`
                            }`
                          : `${big(spent)} spent (no budget)`}
                      </div>
                    </div>

                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${fill}%`,
                          background: "rgba(255,255,255,0.18)",
                          transition: "width 180ms ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetsPanel({ month, rows, onSave }) {
  return (
    <div className="card cardPad" style={{ borderRadius: 16 }}>
      <div className="brandTitle" style={{ fontSize: 16 }}>Budgets for {month}</div>
      <div className="brandSub" style={{ marginTop: 4 }}>Edit Budgeted and press Save.</div>

      <div style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th style={{ width: 180 }}>Budgeted</th>
              <th style={{ width: 160 }}>Spent</th>
              <th style={{ width: 160 }}>Remaining</th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BudgetRow key={r.cat} row={r} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BudgetRow({ row, onSave }) {
  const { cat, budgeted, spent, remaining } = row;
  const [val, setVal] = useState(String(budgeted ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => setVal(String(budgeted ?? 0)), [budgeted]);

  const overspent = remaining < 0;

  async function save() {
    setSaving(true);
    try {
      await onSave(cat, val);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 800 }}>{cat}</td>
      <td><input className="input" value={val} onChange={(e) => setVal(e.target.value)} /></td>
      <td>${money(spent)}</td>
      <td style={{ fontWeight: 800, color: overspent ? "var(--danger)" : "var(--text)" }}>${money(remaining)}</td>
      <td>
        <button className="btn btnPrimary" onClick={save} disabled={saving} type="button">
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

function CategoriesPanel({ items, onAdd, onDelete }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await onAdd(clean);
      setName("");
    } catch (e2) {
      alert(e2?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card cardPad" style={{ borderRadius: 16 }}>
      <div className="brandTitle" style={{ fontSize: 16 }}>Categories</div>
      <div className="brandSub">Keep your budget tidy with clear buckets.</div>

      <form onSubmit={submit} className="row" style={{ marginTop: 12 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a category…" />
        <button className="btn btnPrimary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      <div style={{ marginTop: 12 }}>
        {items.length === 0 ? (
          <div className="brandSub">No categories yet.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th style={{ width: 140 }} /></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 800 }}>{c.name}</td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(c.id)} type="button">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RulesPanel({ rules, categories, onAdd, onDelete }) {
  const [match, setMatch] = useState("");
  const [category, setCategory] = useState(
    categories.includes("Groceries") ? "Groceries" : categories[0] || "Uncategorized"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] || "Uncategorized");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join("|")]);

  async function submit(e) {
    e.preventDefault();
    const clean = match.trim();
    if (!clean) return;

    setBusy(true);
    try {
      await onAdd(clean, category);
      setMatch("");
    } catch (e2) {
      alert(e2?.message || "Failed to add rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card cardPad" style={{ borderRadius: 16 }}>
      <div className="brandTitle" style={{ fontSize: 16 }}>Rules</div>
      <div className="brandSub">Auto-assign categories based on merchant text.</div>

      <form onSubmit={submit} className="row" style={{ marginTop: 12 }}>
        <input className="input" value={match} onChange={(e) => setMatch(e.target.value)} placeholder='Match text (e.g. "amazon")' />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 220 }}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btnPrimary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add rule"}
        </button>
      </form>

      <div style={{ marginTop: 12 }}>
        {rules.length === 0 ? (
          <div className="brandSub">No rules yet.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Match</th><th>Category</th><th style={{ width: 140 }} /></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800 }}>{r.match}</td>
                  <td>{r.category}</td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(r.id)} type="button">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RecurringPanel({ month, categories, items, onAdd, onToggle, onDelete, onGenerate }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories.includes("Rent") ? "Rent" : categories[0] || "Uncategorized");
  const [merchant, setMerchant] = useState("");
  const [account, setAccount] = useState("Chequing");
  const [note, setNote] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] || "Uncategorized");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join("|")]);

  async function submit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    const amt = Number(amount);
    const dom = Number(dayOfMonth);

    if (!cleanName) return alert("Name required");
    if (!Number.isFinite(amt) || amt === 0) return alert("Amount must be non-zero");
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) return alert("Day of month must be 1..28");

    setBusy(true);
    try {
      await onAdd({ name: cleanName, amount: amt, category, merchant, account, note, dayOfMonth: dom });
      setName(""); setAmount(""); setMerchant(""); setNote(""); setDayOfMonth("1");
    } catch (e2) {
      alert(e2?.message || "Failed to add recurring");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card cardPad" style={{ borderRadius: 16 }}>
      <div className="row">
        <div>
          <div className="brandTitle" style={{ fontSize: 16 }}>Recurring</div>
          <div className="brandSub">Subscriptions, rent, bills. Generate creates missing items.</div>
        </div>
        <div className="spacer" />
        <button className="btn btnPrimary" onClick={onGenerate} type="button">Generate for {month}</button>
      </div>

      <form onSubmit={submit} className="grid3" style={{ marginTop: 12 }}>
        <div className="field"><div className="label">Name</div><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><div className="label">Amount</div><input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-1200" /></div>
        <div className="field"><div className="label">Day (1–28)</div><input className="input" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} /></div>

        <div className="field"><div className="label">Category</div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><div className="label">Merchant</div><input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} /></div>
        <div className="field"><div className="label">Account</div><input className="input" value={account} onChange={(e) => setAccount(e.target.value)} /></div>
        <div className="field" style={{ gridColumn: "1 / -1" }}><div className="label">Note</div><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>

        <button className="btn btnPrimary" disabled={busy} style={{ gridColumn: "1 / -1" }} type="submit">
          {busy ? "Adding…" : "Add recurring item"}
        </button>
      </form>

      <div style={{ marginTop: 12 }}>
        {items.length === 0 ? (
          <div className="brandSub">No recurring items yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Amount</th><th>Day</th><th>Category</th><th>Merchant</th><th>Account</th><th>Active</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 800 }}>{it.name}</td>
                  <td>{money(it.amount)}</td>
                  <td>{it.dayOfMonth}</td>
                  <td>{it.category}</td>
                  <td>{it.merchant}</td>
                  <td>{it.account}</td>
                  <td>
                    <input type="checkbox" checked={!!it.isActive} onChange={(e) => onToggle(it.id, e.target.checked)} />
                  </td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(it.id)} type="button">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const fn = mode === "login" ? login : register;
      const data = await fn(email, password);
      onAuthed(data.user);
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn ${mode === "login" ? "btnPrimary" : ""}`} onClick={() => setMode("login")} type="button">
          Login
        </button>
        <button className={`btn ${mode === "register" ? "btnPrimary" : ""}`} onClick={() => setMode("register")} type="button">
          Register
        </button>
      </div>

      <form onSubmit={submit} className="card cardPad" style={{ borderRadius: 16, boxShadow: "none" }}>
        <div className="field">
          <div className="label">Email</div>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>

        <div className="field">
          <div className="label">Password</div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {err && <div className="noticeErr">{err}</div>}

        <button className="btn btnPrimary" disabled={busy} type="submit">
          {busy ? "Please wait…" : mode === "login" ? "Login" : "Create account"}
        </button>
      </form>
    </div>
  );
}

