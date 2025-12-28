// web/src/pages/Dashboard.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ProLock from "../components/ProLock";
import "./dashboard.css";

function Card({ title, right, children }) {
  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">{title}</div>
        {right ? <div className="card__right">{right}</div> : null}
      </div>
      <div className="card__body">{children}</div>
    </div>
  );
}

function fmtMoney(n) {
  const x = Number(n) || 0;
  const abs = Math.abs(x).toFixed(2);
  return x < 0 ? `-$${abs}` : `$${abs}`;
}

function ForecastPreview() {
  return (
    <div className="preview">
      <div className="preview__line" />
      <div className="preview__line" />
      <div className="preview__line preview__line--short" />
      <div className="preview__pill">Forecast timeline</div>
    </div>
  );
}

function StressPreview() {
  return (
    <div className="preview">
      <div className="preview__ring" />
      <div className="preview__line" />
      <div className="preview__line preview__line--short" />
    </div>
  );
}

function SubscriptionsPreview() {
  return (
    <div className="preview">
      <div className="preview__row">
        <div className="preview__dot" />
        <div className="preview__line" />
      </div>
      <div className="preview__row">
        <div className="preview__dot" />
        <div className="preview__line preview__line--short" />
      </div>
      <div className="preview__pill">Auto-detected subscriptions</div>
    </div>
  );
}

function PaydayPreview() {
  return (
    <div className="preview">
      <div className="preview__pill">Payday summary</div>
      <div className="preview__line" />
      <div className="preview__line preview__line--short" />
    </div>
  );
}

export default function Dashboard({
  user,
  budgets = [],
  transactions = [],
  onOpenPaywall,
}) {
  const navigate = useNavigate();

  // plan may not exist yet; default to free
  const isPro = (user?.plan || "free") === "pro";

  function goToAppTab(tab) {
    navigate(`/app?tab=${encodeURIComponent(tab)}`);
  }

  const openPaywall = () => {
    if (typeof onOpenPaywall === "function") return onOpenPaywall();

    // If you have a pricing page route, use it:
    // navigate("/pricing");
    alert("TODO: open paywall / pricing page");
  };

  // Totals for the month
  const totals = useMemo(() => {
    const income = transactions.reduce((sum, t) => {
      const a = Number(t.amount) || 0;
      return a > 0 ? sum + a : sum;
    }, 0);

    const spend = transactions.reduce((sum, t) => {
      const a = Number(t.amount) || 0;
      return a < 0 ? sum + Math.abs(a) : sum;
    }, 0);

    return {
      income,
      spend,
      net: income - spend,
      activity: transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    };
  }, [transactions]);

  // Spent per category (expenses only)
  const spentByCategory = useMemo(() => {
    const m = new Map();
    for (const t of transactions) {
      const amt = Number(t.amount) || 0;
      if (amt >= 0) continue;
      const cat = t.category || "Uncategorized";
      m.set(cat, (m.get(cat) || 0) + Math.abs(amt));
    }
    return m;
  }, [transactions]);

  // Budget overview rows (based on your actual budget shape: { category, amount })
  const budgetOverview = useMemo(() => {
    const rows = (Array.isArray(budgets) ? budgets : [])
      .map((b) => {
        const cat = b.category || b.name || "Uncategorized";
        const budgeted = Number(b.amount) || 0;
        const spent = Number(spentByCategory.get(cat) || 0);
        const pct = budgeted > 0 ? Math.min(120, (spent / budgeted) * 100) : 0;
        return {
          key: b.id || `${cat}`,
          category: cat,
          budgeted,
          spent,
          pct,
          remaining: budgeted - spent,
        };
      })
      .filter((r) => r.budgeted > 0 || r.spent > 0)
      .sort((a, b) => {
        // show over-budget first, then highest spend
        const aOver = a.spent > a.budgeted && a.budgeted > 0;
        const bOver = b.spent > b.budgeted && b.budgeted > 0;
        if (aOver !== bOver) return aOver ? -1 : 1;
        return b.spent - a.spent;
      });

    return rows.slice(0, 6);
  }, [budgets, spentByCategory]);

  const recentTx = useMemo(() => {
    const arr = Array.isArray(transactions) ? transactions : [];
    return arr.slice(0, 8);
  }, [transactions]);

  return (
    <div className="dash">
      <div className="dash__header">
        <div>
          <div className="dash__kicker">Overview</div>
          <div className="dash__headline">Dashboard</div>
        </div>

        <div className="dash__meta">
          <div className="chip">
            Plan: <b style={{ marginLeft: 6 }}>{isPro ? "Pro" : "Free"}</b>
          </div>
          <div className="chip">
            Net: <b style={{ marginLeft: 6 }}>{fmtMoney(totals.net)}</b>
          </div>
        </div>
      </div>

      <div className="dash__grid">
        {/* PRO: Cash Flow Forecast */}
        <Card title="Cash Flow Forecast" right={!isPro ? <span className="lock">🔒</span> : null}>
          <ProLock
            isPro={isPro}
            title="See if you’ll run short before payday"
            teaser="Forecast your balance, safe-to-spend, and what-if fixes."
            ctaText="Unlock Forecast →"
            onUpgrade={openPaywall}
            preview={<ForecastPreview />}
          >
            <div className="real">
              <div className="real__big">Safe to spend today: $42</div>
              <div className="real__muted">Risk date: Jan 6</div>
              <button
                className="btn"
                type="button"
                onClick={() => goToAppTab("forecast")}
              >
                Simulate a fix
              </button>
            </div>
          </ProLock>
        </Card>

        {/* PRO: Financial Stress */}
        <Card title="Financial Stress" right={!isPro ? <span className="lock">🔒</span> : null}>
          <ProLock
            isPro={isPro}
            title="Your Financial Stress Score"
            teaser="One score that reflects cash buffer, fixed costs, and volatility."
            ctaText="See Stress Score →"
            onUpgrade={openPaywall}
            preview={<StressPreview />}
          >
            <div className="real">
              <div className="real__big">Stress: 58 / 100</div>
              <div className="real__muted">Top driver: fixed expenses</div>
              <button
                className="btn"
                type="button"
                onClick={() => goToAppTab("insights")}
              >
                Show actions
              </button>
            </div>
          </ProLock>
        </Card>

        {/* Budgets overview (FREE) */}
        <Card title="Budgets Overview">
          {budgetOverview.length === 0 ? (
            <div className="empty">No budgets yet. Add budgets in the Budgets tab.</div>
          ) : (
            <div className="list">
              {budgetOverview.map((r) => {
                const pct = Number.isFinite(r.pct) ? r.pct : 0;
                const over = r.budgeted > 0 && r.spent > r.budgeted;
                return (
                  <div key={r.key} className="budgetRow">
                    <div className="budgetRow__top">
                      <div className="budgetRow__name">{r.category}</div>
                      <div className="budgetRow__nums">
                        {fmtMoney(r.spent)} / {fmtMoney(r.budgeted)}
                        {over ? (
                          <span style={{ marginLeft: 8 }} title="Over budget">
                            ⚠️
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="budgetRow__bar">
                      <div
                        className="budgetRow__fill"
                        style={{ width: `${Math.min(120, Math.max(0, pct))}%` }}
                      />
                    </div>

                    <div className="budgetRow__sub">
                      {r.budgeted > 0 ? (
                        <span>
                          {over
                            ? `${fmtMoney(Math.abs(r.remaining))} over`
                            : `${fmtMoney(r.remaining)} left`}
                        </span>
                      ) : (
                        <span>No budget set</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* PRO: Subscriptions */}
        <Card title="Subscriptions" right={!isPro ? <span className="lock">🔒</span> : null}>
          <ProLock
            isPro={isPro}
            title="Find forgotten subscriptions"
            teaser="Auto-detect recurring charges and flag leaks."
            ctaText="Scan for Leaks →"
            onUpgrade={openPaywall}
            preview={<SubscriptionsPreview />}
          >
            <div className="real">
              <div className="real__big">Leaks found: $27.98/mo</div>
              <div className="real__muted">2 unused subscriptions detected</div>
              <button
                className="btn"
                type="button"
                onClick={() => goToAppTab("subscriptions")}
              >
                Review subscriptions
              </button>
            </div>
          </ProLock>
        </Card>

        {/* Recent transactions (FREE) */}
        <Card title="Recent Transactions">
          {recentTx.length === 0 ? (
            <div className="empty">No transactions yet.</div>
          ) : (
            <div className="txlist">
              {recentTx.map((t) => (
                <div
                  key={t.id || `${t.date}-${t.merchant}-${t.amount}`}
                  className="tx"
                >
                  <div className="tx__left">
                    <div className="tx__desc">{t.merchant || "Transaction"}</div>
                    <div className="tx__sub">
                      {t.date || ""} • {t.category || "Uncategorized"}
                    </div>
                  </div>
                  <div className="tx__amt">{fmtMoney(t.amount)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="chip">
              Income: <b style={{ marginLeft: 6 }}>{fmtMoney(totals.income)}</b>
            </div>
            <div className="chip">
              Spend: <b style={{ marginLeft: 6 }}>{fmtMoney(-totals.spend)}</b>
            </div>
          </div>
        </Card>

        {/* PRO: Payday Mode */}
        <Card title="Payday Mode" right={!isPro ? <span className="lock">🔒</span> : null}>
          <ProLock
            isPro={isPro}
            title="Turn payday into clarity"
            teaser="Auto-allocate, rebalance, and get safe-to-spend."
            ctaText="Open Payday Mode →"
            onUpgrade={openPaywall}
            preview={<PaydayPreview />}
          >
            <div className="real">
              <div className="real__big">Allocation plan ready</div>
              <div className="real__muted">Run once per paycheque</div>
              <button
                className="btn"
                type="button"
                onClick={() => goToAppTab("payday")}
              >
                Run Payday Mode
              </button>
            </div>
          </ProLock>
        </Card>
      </div>
    </div>
  );
}
