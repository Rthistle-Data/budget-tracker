// web/src/Home.jsx
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";

import PaywallModal from "./components/PaywallModal";
import Dashboard from "./pages/Dashboard";
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

  // subs / bills
  getSubscriptionCandidates,
  getSubscriptions,
  saveSubscription,
  ignoreSubscriptionCandidate,
  updateSubscription,
  deleteSubscription,

  // CSV import
  importCsv,

  // auth
  login,
  register,

  // AI helper
  suggestRule,

  // settings + forecast
  getSettings,
  setCurrentBalance,
  getForecast,
} from "./api";

/* ---------------------------
   Helpers
---------------------------- */

function toArray(value, key) {
  if (Array.isArray(value)) return value;
  if (value && key && Array.isArray(value[key])) return value[key];
  return [];
}

function monthNow() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function money(n) {
  const x = Number(n) || 0;
  return x.toFixed(2);
}

function titleCaseFromKey(key) {
  const s = String(key || "").replace(/\s+/g, " ").trim();
  if (!s) return "Unknown";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/* ---------------------------
   Simple SVG line chart (no deps)
---------------------------- */

function ForecastChart({ series, height = 180 }) {
  const svgRef = useRef(null);
  const [w, setW] = useState(600);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    function onResize() {
      const rect = el.getBoundingClientRect();
      setW(Math.max(260, Math.floor(rect.width)));
    }

    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = Array.isArray(series) ? series : [];
  if (points.length < 2) {
    return (
      <div style={{ marginTop: 12, color: "var(--muted)" }}>
        Not enough data to chart yet.
      </div>
    );
  }

  const balances = points.map((p) => Number(p.balance) || 0);
  const minY = Math.min(...balances);
  const maxY = Math.max(...balances);

  const pad = (maxY - minY) * 0.08 || 50;
  const y0 = minY - pad;
  const y1 = maxY + pad;

  const left = 8;
  const right = 8;
  const top = 10;
  const bottom = 18;
  const innerW = Math.max(1, w - left - right);
  const innerH = Math.max(1, height - top - bottom);

  const xFor = (i) => left + (i / (points.length - 1)) * innerW;
  const yFor = (val) => {
    const t = (val - y0) / (y1 - y0 || 1);
    return top + (1 - clamp(t, 0, 1)) * innerH;
  };

  const d = points
    .map((p, i) => {
      const x = xFor(i);
      const y = yFor(Number(p.balance) || 0);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const last = points[points.length - 1];
  const lastX = xFor(points.length - 1);
  const lastY = yFor(Number(last.balance) || 0);

  return (
    <div ref={svgRef} style={{ width: "100%" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`}>
        <line
          x1={left}
          y1={top + innerH}
          x2={left + innerW}
          y2={top + innerH}
          stroke="rgba(255,255,255,0.08)"
        />

        <path d={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" />
        <circle cx={lastX} cy={lastY} r="4" fill="rgba(255,255,255,0.95)" />

        <text x={left} y={height - 4} fontSize="11" fill="rgba(255,255,255,0.55)">
          {points[0]?.date || ""}
        </text>
        <text
          x={left + innerW}
          y={height - 4}
          fontSize="11"
          textAnchor="end"
          fill="rgba(255,255,255,0.55)"
        >
          {points[points.length - 1]?.date || ""}
        </text>
      </svg>
    </div>
  );
}

/* ---------------------------
   Forecast Card (Dashboard premium widget)
---------------------------- */

function ForecastCard({ isPro, onOpenPaywall }) {
  const [settings, setSettingsState] = useState(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [days, setDays] = useState(60);
  const [forecast, setForecastState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const locked = !isPro;

  async function load() {
    setErr("");
    setBusy(true);
    try {
      const s = await getSettings();
      const currentBalance = s?.settings?.currentBalance ?? s?.currentBalance ?? 0;

      setSettingsState(s?.settings ?? s);
      setBalanceInput(String(currentBalance ?? 0));

      const f = await getForecast(days);
      setForecastState(f?.forecast ?? f);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBalance() {
    setErr("");
    const val = Number(balanceInput);
    if (!Number.isFinite(val)) {
      setErr("Enter a valid number for current balance.");
      return;
    }

    setBusy(true);
    try {
      await setCurrentBalance(val);
      await load();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const series = useMemo(() => {
    const s = forecast?.series || forecast?.points || forecast?.data || [];
    return Array.isArray(s) ? s : [];
  }, [forecast]);

  const kpis = useMemo(() => {
    if (!series.length) return null;

    const lowest =
      forecast?.lowest ||
      series.reduce(
        (best, r) => (Number(r.balance) < Number(best.balance) ? r : best),
        series[0]
      );

    const end = series[series.length - 1];
    const estDaily = Number(forecast?.estimatedDailyVariable);

    return {
      endBalance: Number(end?.balance) || 0,
      endDate: end?.date || "",
      lowestBalance: Number(lowest?.balance) || 0,
      lowestDate: lowest?.date || "",
      estimatedDailyVariable: Number.isFinite(estDaily) ? estDaily : null,
    };
  }, [forecast, series]);

  return (
    <div className="card cardPad" style={{ borderRadius: 16 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div>
          <div className="brandTitle" style={{ fontSize: 16 }}>
            Cash-Flow Forecast
          </div>
          <div className="brandSub">
            Project your balance forward using recurring items + recent spending patterns.
          </div>
        </div>
        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <select
            className="select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 140 }}
            disabled={busy}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>

          <button className="btn" type="button" onClick={load} disabled={busy}>
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {locked && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            marginTop: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="cardPad">
            <div className="row" style={{ alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900 }}>Forecast is a Pro feature</div>
                <div className="brandSub" style={{ marginTop: 4 }}>
                  Set your current balance, then see the lowest point ahead + projected runway.
                </div>
              </div>
              <div className="spacer" />
              <button className="btn btnPrimary" type="button" onClick={onOpenPaywall}>
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="row"
        style={{
          marginTop: 12,
          gap: 10,
          alignItems: "end",
          flexWrap: "wrap",
          opacity: locked ? 0.55 : 1,
          pointerEvents: locked ? "none" : "auto",
        }}
      >
        <label className="field" style={{ width: 220 }}>
          <div className="label">Current balance</div>
          <input
            className="input"
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </label>

        <button className="btn btnPrimary" type="button" onClick={saveBalance} disabled={busy}>
          Save balance
        </button>
      </div>

      {err && (
        <div className="noticeErr" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}

      {!locked && (
        <>
          {kpis ? (
            <div className="kpiGrid" style={{ marginTop: 14 }}>
              <KPI label={`Projected end (${days}d)`} value={`$${money(kpis.endBalance)}`} />
              <KPI label="Lowest point" value={`$${money(kpis.lowestBalance)}`} />
              <KPI label="Lowest date" value={kpis.lowestDate || "-"} />
              <KPI
                label="Est. daily variable"
                value={
                  kpis.estimatedDailyVariable == null ? "-" : `$${money(kpis.estimatedDailyVariable)}`
                }
              />
            </div>
          ) : (
            <div style={{ marginTop: 12, color: "var(--muted)" }}>
              {busy ? "Loading forecast…" : "No forecast data yet."}
            </div>
          )}

          {series.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <ForecastChart series={series} />
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
                End date: <b>{kpis?.endDate || series[series.length - 1]?.date || "-"}</b>
                {" · "}
                Starting from your saved current balance.
              </div>
            </div>
          )}
        </>
      )}

      {!locked && settings && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          Uses your recurring items + transaction history to estimate variable spending.
        </div>
      )}
    </div>
  );
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

      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors?.length) throw new Error(parsed.errors[0].message || "CSV parse error");

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

      const filtered = rows.filter((r) => r.date && r.date.startsWith(month));
      const toSend = filtered.length ? filtered : rows;

      const result = await importCsv(toSend, file.name);
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
        <div
          style={{
            marginTop: 10,
            color: msg.startsWith("Imported:") ? "var(--muted)" : "var(--danger)",
          }}
        >
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
  // Auth
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Tabs
  const [topTab, setTopTab] = useState("dashboard"); // dashboard | tracker
  const [trackerTab, setTrackerTab] = useState("transactions"); // insights | transactions | budgets | categories | rules | recurring | subscriptions

  // URL <-> tab sync (/app?tab=...)
  const location = useLocation();
  const navigate = useNavigate();

  const TRACKER_TABS = new Set([
    "insights",
    "transactions",
    "budgets",
    "categories",
    "rules",
    "recurring",
    "subscriptions",
  ]);

  function setUrlTab(tab) {
    const sp = new URLSearchParams(location.search);
    if (tab) sp.set("tab", tab);
    else sp.delete("tab");

    const search = sp.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "" },
      { replace: true }
    );
  }

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const raw = sp.get("tab");
    if (!raw) return;

    const tab = String(raw).toLowerCase().trim();

    if (TRACKER_TABS.has(tab)) {
      setTopTab("tracker");
      setTrackerTab(tab);
      return;
    }

    if (tab === "dashboard" || tab === "forecast" || tab === "payday") {
      setTopTab("dashboard");
      return;
    }
  }, [location.search]);

  // Month
  const [month, setMonth] = useState(monthNow());

  // Paywall modal
  const [paywallOpen, setPaywallOpen] = useState(false);
  const isPro = user?.plan === "pro";

  function openPaywall() {
    setPaywallOpen(true);
  }
  function closePaywall() {
    setPaywallOpen(false);
  }

  // TEMP: fake upgrade for testing
  function fakeUpgradeToPro() {
    setUser((u) => ({ ...(u || {}), plan: "pro" }));
    setPaywallOpen(false);
  }

  // Data
  const [txns, setTxns] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [rules, setRules] = useState([]);
  const [recurring, setRecurring] = useState([]);

  // subscriptions
  const [subCandidates, setSubCandidates] = useState([]);
  const [subs, setSubs] = useState([]);
  const [subsBusy, setSubsBusy] = useState(false);
  const [subsMsg, setSubsMsg] = useState("");

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

  // AI Rule Builder modal
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
    const r = await getRules();
    setRules(toArray(r, "rules"));

    setAiOpen(false);
    setAiSuggestion(null);
    setAiTx(null);
  }

  // Auth: check session once
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

  // Load all data
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

  async function loadSubs() {
    setSubsBusy(true);
    setSubsMsg("");
    try {
      const [cand, list] = await Promise.all([getSubscriptionCandidates(), getSubscriptions()]);
      setSubCandidates(toArray(cand, "candidates"));
      setSubs(toArray(list, "subscriptions"));
    } catch (e) {
      setSubsMsg(String(e?.message || e));
    } finally {
      setSubsBusy(false);
    }
  }

  useEffect(() => {
    setDate(`${month}-01`);
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, user]);

  useEffect(() => {
    if (!user) return;
    if (trackerTab === "subscriptions") loadSubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerTab, user]);

  // Safe arrays
  const safeTxns = Array.isArray(txns) ? txns : [];
  const safeBudgets = Array.isArray(budgets) ? budgets : [];
  const safeCategoriesList = Array.isArray(categoriesList) ? categoriesList : [];
  const safeRules = Array.isArray(rules) ? rules : [];
  const safeRecurring = Array.isArray(recurring) ? recurring : [];
  const safeSubCandidates = Array.isArray(subCandidates) ? subCandidates : [];
  const safeSubs = Array.isArray(subs) ? subs : [];

  // Derived
  const summary = useMemo(() => {
    const income = safeTxns
      .filter((x) => Number(x.amount) > 0)
      .reduce((a, b) => a + (Number(b.amount) || 0), 0);

    const spend = safeTxns
      .filter((x) => Number(x.amount) < 0)
      .reduce((a, b) => a + (Number(b.amount) || 0), 0);

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

  const subsTotals = useMemo(() => {
    const active = safeSubs.filter((s) => s.isActive);
    const bills = active.filter((s) => (s.kind || "subscription") === "bill");
    const subsOnly = active.filter((s) => (s.kind || "subscription") !== "bill");

    const sum = (arr) =>
      arr.reduce(
        (a, s) =>
          a + (Number(s.expectedAmount) || Number(s.amountMax) || Number(s.amountMin) || 0),
        0
      );

    return {
      activeCount: active.length,
      subsCount: subsOnly.length,
      billsCount: bills.length,
      estMonthly: sum(active),
    };
  }, [safeSubs]);

  // Actions
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

  // Subs actions
  async function onConfirmCandidate(c) {
    setSubsBusy(true);
    setSubsMsg("");
    try {
      await saveSubscription({
        merchantKey: c.merchantKey,
        displayName: c.displayName || titleCaseFromKey(c.merchantKey),
        cadence: c.cadence || "monthly",
        expectedAmount: c.expectedAmount ?? null,
        lastDate: c.lastDate ?? null,
        nextDate: c.nextDate ?? null,
        confidence: c.confidence ?? 0,
        isActive: true,
        kind: "subscription",
      });
      await loadSubs();
    } catch (e) {
      setSubsMsg(String(e?.message || e));
    } finally {
      setSubsBusy(false);
    }
  }

  async function onIgnoreCandidate(c) {
    setSubsBusy(true);
    setSubsMsg("");
    try {
      await ignoreSubscriptionCandidate(c.merchantKey);
      await loadSubs();
    } catch (e) {
      setSubsMsg(String(e?.message || e));
    } finally {
      setSubsBusy(false);
    }
  }

  async function onToggleSubActive(id, isActive) {
    setSubsBusy(true);
    setSubsMsg("");
    try {
      await updateSubscription(id, { isActive });
      await loadSubs();
    } catch (e) {
      setSubsMsg(String(e?.message || e));
    } finally {
      setSubsBusy(false);
    }
  }

  async function onDeleteSub(id) {
    const ok = confirm("Delete this subscription/bill?");
    if (!ok) return;
    setSubsBusy(true);
    setSubsMsg("");
    try {
      await deleteSubscription(id);
      await loadSubs();
    } catch (e) {
      setSubsMsg(String(e?.message || e));
    } finally {
      setSubsBusy(false);
    }
  }

  // Auth gating
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

  return (
    <div className="container">
      <div className="shell">
        {/* Sidebar */}
        <aside className="card">
          <div className="topbar">
            <div style={{ width: "100%" }}>
              <div className="row" style={{ alignItems: "center" }}>
                <div>
                  <div className="brandTitle">Budget Tracker</div>
                  <div className="brandSub">
                    Signed in as <b>{user.email}</b>
                  </div>
                </div>

                <div className="spacer" />

                <span
                  className="chip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 12,
                    background: isPro ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  }}
                  title={isPro ? "You’re on Pro" : "Free plan"}
                >
                  {isPro ? "⭐ PRO" : "FREE"}
                </span>
              </div>

              {!isPro && (
                <button
                  className="btn btnPrimary"
                  style={{ width: "100%", marginTop: 12 }}
                  type="button"
                  onClick={openPaywall}
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>

          {/* Nav */}
          <div className="nav">
            <NavItem
              active={topTab === "dashboard"}
              onClick={() => {
                setTopTab("dashboard");
                setUrlTab("dashboard");
              }}
            >
              Dashboard
            </NavItem>

            <NavItem
              active={topTab === "tracker"}
              onClick={() => {
                setTopTab("tracker");
                setUrlTab(trackerTab || "transactions");
              }}
            >
              Budget Tracker
            </NavItem>

            {topTab === "tracker" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 8 }} />

                <NavItem
                  active={trackerTab === "insights"}
                  onClick={() => {
                    setTrackerTab("insights");
                    setUrlTab("insights");
                  }}
                >
                  Insights
                </NavItem>

                <NavItem
                  active={trackerTab === "transactions"}
                  onClick={() => {
                    setTrackerTab("transactions");
                    setUrlTab("transactions");
                  }}
                >
                  Transactions
                </NavItem>

                <NavItem
                  active={trackerTab === "budgets"}
                  onClick={() => {
                    setTrackerTab("budgets");
                    setUrlTab("budgets");
                  }}
                >
                  Budgets
                </NavItem>

                <NavItem
                  active={trackerTab === "categories"}
                  onClick={() => {
                    setTrackerTab("categories");
                    setUrlTab("categories");
                  }}
                >
                  Categories
                </NavItem>

                <NavItem
                  active={trackerTab === "rules"}
                  onClick={() => {
                    setTrackerTab("rules");
                    setUrlTab("rules");
                  }}
                >
                  Rules
                </NavItem>

                <NavItem
                  active={trackerTab === "recurring"}
                  onClick={() => {
                    setTrackerTab("recurring");
                    setUrlTab("recurring");
                  }}
                >
                  Recurring
                </NavItem>

                <NavItem
                  active={trackerTab === "subscriptions"}
                  onClick={() => {
                    setTrackerTab("subscriptions");
                    setUrlTab("subscriptions");
                  }}
                >
                  Bills & Subs
                </NavItem>
              </div>
            )}

            <div style={{ height: 8 }} />

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
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {topTab === "dashboard" ? "Dashboard" : tabLabel(trackerTab)}
              </div>
              <div className="brandSub">
                {topTab === "dashboard"
                  ? "Premium overview + Pro features"
                  : trackerTab === "subscriptions"
                  ? "Detect recurring charges and manage bills/subscriptions"
                  : "Month view + categorized spending"}
              </div>
            </div>

            <div className="spacer" />

            {topTab === "tracker" && (
              <div className="row">
                <label className="field" style={{ width: 160 }}>
                  <div className="label">Month</div>
                  <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
                </label>

                <button
                  className="btn"
                  onClick={async () => {
                    await loadAll();
                    if (trackerTab === "subscriptions") await loadSubs();
                  }}
                  type="button"
                >
                  Refresh
                </button>
              </div>
            )}
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
                {topTab === "dashboard" ? (
                  <div style={{ display: "grid", gap: 14 }}>
                    <ForecastCard isPro={isPro} onOpenPaywall={openPaywall} />
                    <Dashboard
                      user={user}
                      budgets={safeBudgets}
                      transactions={safeTxns}
                      onOpenPaywall={openPaywall}
                    />
                  </div>
                ) : trackerTab === "insights" ? (
                  <InsightsPanel month={month} summary={summary} transactions={safeTxns} budgets={safeBudgets} />
                ) : trackerTab === "transactions" ? (
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
                ) : trackerTab === "budgets" ? (
                  <BudgetsPanel month={month} rows={budgetRows} onSave={onSaveBudget} />
                ) : trackerTab === "categories" ? (
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
                ) : trackerTab === "rules" ? (
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
                ) : trackerTab === "subscriptions" ? (
                  <SubscriptionsPanel
                    isPro={isPro}
                    onOpenPaywall={openPaywall}
                    busy={subsBusy}
                    msg={subsMsg}
                    totals={subsTotals}
                    candidates={safeSubCandidates}
                    subscriptions={safeSubs}
                    onRefresh={loadSubs}
                    onConfirmCandidate={onConfirmCandidate}
                    onIgnoreCandidate={onIgnoreCandidate}
                    onToggleActive={onToggleSubActive}
                    onDelete={onDeleteSub}
                    onSetKind={async (id, kind) => {
                      setSubsBusy(true);
                      setSubsMsg("");
                      try {
                        await updateSubscription(id, { kind });
                        await loadSubs();
                      } catch (e) {
                        setSubsMsg(String(e?.message || e));
                      } finally {
                        setSubsBusy(false);
                      }
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

      <PaywallModal open={paywallOpen} onClose={closePaywall} onUpgrade={fakeUpgradeToPro} />
    </div>
  );
}

/* ---------------------------
   Small components
---------------------------- */

function tabLabel(tab) {
  if (tab === "insights") return "Insights";
  if (tab === "transactions") return "Transactions";
  if (tab === "budgets") return "Budgets";
  if (tab === "categories") return "Categories";
  if (tab === "rules") return "Rules";
  if (tab === "recurring") return "Recurring";
  return "Bills & Subs";
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
   Bills & Subs Panel
---------------------------- */

function SubscriptionsPanel({
  isPro,
  onOpenPaywall,
  busy,
  msg,
  totals,
  candidates,
  subscriptions,
  onRefresh,
  onConfirmCandidate,
  onIgnoreCandidate,
  onToggleActive,
  onDelete,
  onSetKind,
}) {
  const [filter, setFilter] = useState("active"); // active | all | subs | bills
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    let list = Array.isArray(subscriptions) ? subscriptions : [];

    if (filter === "active") list = list.filter((s) => s.isActive);
    if (filter === "subs") list = list.filter((s) => (s.kind || "subscription") === "subscription");
    if (filter === "bills") list = list.filter((s) => (s.kind || "subscription") === "bill");

    if (text) {
      list = list.filter((s) => {
        const hay = `${s.displayName || ""} ${s.merchantKey || ""}`.toLowerCase();
        return hay.includes(text);
      });
    }

    return list.slice().sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  }, [subscriptions, filter, q]);

  const locked = !isPro;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {locked && (
        <div className="card cardPad" style={{ borderRadius: 16 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <div>
              <div className="brandTitle" style={{ fontSize: 16 }}>
                Bills & Subscriptions (Pro)
              </div>
              <div className="brandSub">
                Auto-detect recurring charges, track what’s active, and spot surprise increases.
              </div>
            </div>
            <div className="spacer" />
            <button className="btn btnPrimary" type="button" onClick={onOpenPaywall}>
              Upgrade to Pro
            </button>
          </div>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            You can still view the tab, but confirming candidates + managing items requires Pro.
          </div>
        </div>
      )}

      <div className="kpiGrid">
        <KPI label="Active items" value={String(totals?.activeCount ?? 0)} />
        <KPI label="Subscriptions" value={String(totals?.subsCount ?? 0)} />
        <KPI label="Bills" value={String(totals?.billsCount ?? 0)} />
        <KPI label="Est. monthly total" value={`$${money(totals?.estMonthly ?? 0)}`} />
      </div>

      <div className="card cardPad" style={{ borderRadius: 16 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="brandTitle" style={{ fontSize: 16 }}>
              Detected candidates
            </div>
            <div className="brandSub">
              Based on your past transactions. Confirm what’s real, ignore the rest.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn" type="button" onClick={onRefresh} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {msg && (
          <div className="noticeErr" style={{ marginTop: 10 }}>
            {msg}
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="brandSub" style={{ marginTop: 12 }}>
            No candidates yet. Import more CSV history or add more transactions.
          </div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Cadence</th>
                  <th>Expected</th>
                  <th>Last</th>
                  <th>Confidence</th>
                  <th style={{ width: 220 }} />
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.merchantKey}>
                    <td style={{ fontWeight: 800 }}>
                      {c.displayName || titleCaseFromKey(c.merchantKey)}
                    </td>
                    <td>{c.cadence || "unknown"}</td>
                    <td>${money(c.expectedAmount ?? 0)}</td>
                    <td>{c.lastDate || "-"}</td>
                    <td>{Math.round(Number(c.confidence) || 0)}%</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        disabled={busy || locked}
                        onClick={() => onConfirmCandidate(c)}
                        title={locked ? "Upgrade to Pro to confirm" : ""}
                      >
                        Confirm
                      </button>{" "}
                      <button
                        className="btn"
                        type="button"
                        disabled={busy || locked}
                        onClick={() => onIgnoreCandidate(c)}
                        title={locked ? "Upgrade to Pro to ignore" : ""}
                      >
                        Ignore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card cardPad" style={{ borderRadius: 16 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="brandTitle" style={{ fontSize: 16 }}>
              Your items
            </div>
            <div className="brandSub">
              Toggle active, tag as Bill vs Subscription, delete anything wrong.
            </div>
          </div>
          <div className="spacer" />
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }}>
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="subs">Subscriptions</option>
            <option value="bills">Bills</option>
          </select>
          <input
            className="input"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 220 }}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="brandSub" style={{ marginTop: 12 }}>
            Nothing to show yet.
          </div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Cadence</th>
                  <th>Expected</th>
                  <th>Next</th>
                  <th>Active</th>
                  <th style={{ width: 160 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 800 }}>
                      {s.displayName || titleCaseFromKey(s.merchantKey)}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={s.kind || "subscription"}
                        onChange={(e) => onSetKind(s.id, e.target.value)}
                        disabled={busy || locked}
                        title={locked ? "Upgrade to Pro to edit" : ""}
                        style={{ width: 150 }}
                      >
                        <option value="subscription">Subscription</option>
                        <option value="bill">Bill</option>
                      </select>
                    </td>
                    <td>{s.cadence || "unknown"}</td>
                    <td>${money(s.expectedAmount ?? s.amountMax ?? s.amountMin ?? 0)}</td>
                    <td>{s.nextDate || "-"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!s.isActive}
                        onChange={(e) => onToggleActive(s.id, e.target.checked)}
                        disabled={busy || locked}
                        title={locked ? "Upgrade to Pro to edit" : ""}
                      />
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn btnDanger"
                        type="button"
                        onClick={() => onDelete(s.id)}
                        disabled={busy || locked}
                        title={locked ? "Upgrade to Pro to delete" : ""}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
          Next step: we’ll auto-calc <b>nextDate</b> and show a “Upcoming charges (30 days)” widget on Dashboard.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   AI Modal
---------------------------- */

function AiRuleModal({ open, loading, error, suggestion, tx, onClose, onConfirm }) {
  if (!open) return null;

  const conf =
    typeof suggestion?.confidence === "number"
      ? suggestion.confidence > 1
        ? suggestion.confidence
        : suggestion.confidence * 100
      : null;

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
            {conf != null && (
              <div>
                <b>Confidence:</b> {Number(conf).toFixed(0)}%
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
   Panels
---------------------------- */

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
      <td style={{ fontWeight: 800, color: overspent ? "var(--danger)" : "var(--text)" }}>
        ${money(remaining)}
      </td>
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
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a category…"
        />
        <button className="btn btnPrimary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add"}
        </button>
      </form>

      <div style={{ marginTop: 12 }}>
        {items.length === 0 ? (
          <div className="brandSub">No categories yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th style={{ width: 140 }} /></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 800 }}>{c.name}</td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(c.id)} type="button">
                      Delete
                    </button>
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
        <input
          className="input"
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder='Match text (e.g. "amazon")'
        />
        <select
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ width: 220 }}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
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
            <thead>
              <tr><th>Match</th><th>Category</th><th style={{ width: 140 }} /></tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800 }}>{r.match}</td>
                  <td>{r.category}</td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(r.id)} type="button">
                      Delete
                    </button>
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
        <button className="btn btnPrimary" onClick={onGenerate} type="button">
          Generate for {month}
        </button>
      </div>

      <form onSubmit={submit} className="grid3" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="label">Name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <div className="label">Amount</div>
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-1200" />
        </div>
        <div className="field">
          <div className="label">Day (1–28)</div>
          <input className="input" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </div>

        <div className="field">
          <div className="label">Category</div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <div className="label">Merchant</div>
          <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </div>
        <div className="field">
          <div className="label">Account</div>
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <div className="label">Note</div>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

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
                    <input
                      type="checkbox"
                      checked={!!it.isActive}
                      onChange={(e) => onToggle(it.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <button className="btn btnDanger" onClick={() => onDelete(it.id)} type="button">
                      Delete
                    </button>
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
        <button
          className={`btn ${mode === "login" ? "btnPrimary" : ""}`}
          onClick={() => setMode("login")}
          type="button"
        >
          Login
        </button>
        <button
          className={`btn ${mode === "register" ? "btnPrimary" : ""}`}
          onClick={() => setMode("register")}
          type="button"
        >
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
