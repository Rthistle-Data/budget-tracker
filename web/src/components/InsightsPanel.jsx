// web/src/components/InsightsPanel.jsx
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

import { getInsights } from "../api";

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function pctLabel(p) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${Math.round(p)}%`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function statusFor(pctUsed) {
  if (pctUsed == null) return { label: "No budget", tone: "muted" };
  if (pctUsed < 80) return { label: "On track", tone: "good" };
  if (pctUsed <= 100) return { label: "Watch", tone: "warn" };
  return { label: "Over", tone: "bad" };
}

export default function InsightsPanel({ month, summary, transactions = [], budgets = [] }) {
  // Safe fallbacks so this never crashes
  const safeSummary = summary || { income: 0, spend: 0, net: 0 };
  const incomeFallback = Number(safeSummary.income || 0);
  const spendFallback = Math.abs(Number(safeSummary.spend || 0));
  const netFallback = Number(safeSummary.net || 0);

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Helps prevent Recharts measuring -1/-1 on first paint in CSS grid/cards.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    let raf = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setErr("");

    getInsights(month)
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Failed to load insights");
      })
      .finally(() => {
        if (!alive) return;
        setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [month]);

  const topCats = useMemo(() => {
    if (!data?.byCategory) return [];
    return data.byCategory.slice(0, 8).map((c) => ({
      name: c.categoryName,
      spent: c.spent,
    }));
  }, [data]);

  const dailySpend = useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.map((d) => ({
      date: String(d.date || "").slice(8), // "DD"
      expenses: d.expenses,
      income: d.income,
    }));
  }, [data]);

  // If API not loaded yet, show loading
  if (busy && !data) return <div className="card">Loading insights…</div>;
  if (err) return <div className="card" style={{ borderColor: "rgba(255,0,0,.3)" }}>{err}</div>;

  // If API fails to return anything, still show summary KPIs (fallback)
  const totals = data?.totals || {
    income: incomeFallback,
    expenses: spendFallback,
    net: netFallback,
    avgDailySpend: 0,
    projectedSpend: 0,
  };

  const byCategory = Array.isArray(data?.byCategory) ? data.byCategory : [];
  const overBudget = Array.isArray(data?.overBudget) ? data.overBudget : [];

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))", minWidth: 0 }}>
        <Kpi title="Income" value={money(totals.income)} />
        <Kpi title="Expenses" value={money(totals.expenses)} />
        <Kpi title="Net" value={money(totals.net)} />
        <Kpi
          title="Avg / day"
          value={money(totals.avgDailySpend)}
          sub={totals.projectedSpend ? `Projected: ${money(totals.projectedSpend)}` : undefined}
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.2fr 1fr", minWidth: 0 }}>
        <div className="card" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Spending by Category</h3>
            <div style={{ opacity: 0.7, fontSize: 13 }}>Top {topCats.length}</div>
          </div>

          <div style={{ height: 320, minHeight: 320, marginTop: 8, minWidth: 0 }}>
            {chartsReady && topCats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCats} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid vertical={false} opacity={0.2} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="spent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ opacity: 0.75, marginTop: 8 }}>No category spending data yet.</div>
            )}
          </div>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Daily Trend</h3>
            <div style={{ opacity: 0.7, fontSize: 13 }}>{month}</div>
          </div>

          <div style={{ height: 320, minHeight: 320, marginTop: 8, minWidth: 0 }}>
            {chartsReady && dailySpend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySpend} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => `Day ${l}`} />
                  <Line type="monotone" dataKey="expenses" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ opacity: 0.75, marginTop: 8 }}>No daily trend data yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Budget health + Alerts */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.2fr 1fr", minWidth: 0 }}>
        <div className="card" style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>Budget Health</h3>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {byCategory.slice(0, 12).map((c) => (
              <BudgetRow key={c.categoryName} row={c} />
            ))}
            {byCategory.length === 0 && <div style={{ opacity: 0.7 }}>No spending yet this month.</div>}
          </div>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>Alerts</h3>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {overBudget.length === 0 ? (
              <div style={{ opacity: 0.75 }}>✅ No categories over budget.</div>
            ) : (
              overBudget.slice(0, 6).map((o) => (
                <div
                  key={o.categoryName}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>{o.categoryName}</strong>
                    <span style={{ opacity: 0.8 }}>Over by {money(o.overBy)}</span>
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 13, marginTop: 6 }}>
                    {money(o.spent)} spent / {money(o.budget)} budget
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ title, value, sub }) {
  return (
    <div className="card" style={{ padding: 14, minWidth: 0 }}>
      <div style={{ opacity: 0.7, fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub ? <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

function BudgetRow({ row }) {
  const spent = Number(row.spent) || 0;
  const budget = Number(row.budget) || 0;
  const pctUsed = row.pctUsed;

  const pctForBar = pctUsed == null ? 0 : clamp(pctUsed, 0, 120);
  const status = statusFor(pctUsed);

  const badgeStyle =
    status.tone === "good"
      ? { background: "rgba(0,255,140,0.10)", border: "1px solid rgba(0,255,140,0.18)" }
      : status.tone === "warn"
      ? { background: "rgba(255,210,0,0.10)", border: "1px solid rgba(255,210,0,0.18)" }
      : status.tone === "bad"
      ? { background: "rgba(255,0,80,0.10)", border: "1px solid rgba(255,0,80,0.18)" }
      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" };

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <strong>{row.categoryName}</strong>
        <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, ...badgeStyle }}>
          {status.label} {pctLabel(pctUsed)}
        </span>
      </div>

      <div style={{ opacity: 0.75, fontSize: 13, marginTop: 6 }}>
        {money(spent)} {budget > 0 ? ` / ${money(budget)}` : ""}
      </div>

      {budget > 0 ? (
        <div
          style={{
            height: 10,
            borderRadius: 999,
            marginTop: 8,
            background: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pctForBar}%`,
              background: "rgba(255,255,255,0.35)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
