import React from "react";

function money(n) {
  return (Number(n) || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function statusFromPct(pct) {
  if (pct < 75) return "good";
  if (pct <= 100) return "warn";
  return "bad";
}

export default function BudgetProgressList({ items = [] }) {
  if (!items.length) {
    return (
      <div style={{ opacity: 0.8 }}>
        <div style={{ marginTop: 10 }}>No budgets or spending yet.</div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Tip: Set budgets for your top categories to get meaningful progress.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
      {items.slice(0, 10).map((row) => {
        const spent = Number(row.spent) || 0;
        const budgeted = Number(row.budgeted) || 0;

        const pctRaw = budgeted > 0 ? (spent / budgeted) * 100 : 0;
        const pct = clamp(pctRaw, 0, 999);
        const fill = clamp(pctRaw, 0, 120); // cap visual fill

        const status = budgeted <= 0 ? "none" : statusFromPct(pctRaw);
        const remaining = budgeted - spent;

        const barBg = "rgba(255,255,255,0.10)";
        const barFill =
          status === "good"
            ? "rgba(46, 204, 113, 0.75)"
            : status === "warn"
            ? "rgba(241, 196, 15, 0.80)"
            : status === "bad"
            ? "rgba(231, 76, 60, 0.80)"
            : "rgba(255,255,255,0.18)";

        return (
          <div
            key={row.category}
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 650 }}>{row.category}</div>

              {budgeted > 0 ? (
                <div style={{ fontSize: 13, opacity: 0.9, textAlign: "right" }}>
                  <div>
                    {money(spent)} / {money(budgeted)}
                  </div>
                  <div style={{ opacity: 0.8 }}>
                    {pctRaw.toFixed(0)}% •{" "}
                    {remaining >= 0 ? `${money(remaining)} left` : `${money(-remaining)} over`}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.8 }}>No budget set</div>
              )}
            </div>

            <div
              style={{
                marginTop: 10,
                height: 10,
                borderRadius: 999,
                background: barBg,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${fill}%`,
                  height: "100%",
                  background: barFill,
                  borderRadius: 999,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
