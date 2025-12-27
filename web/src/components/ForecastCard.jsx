import { useEffect, useState } from "react";
import { getForecast } from "../api";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

export default function ForecastCard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        setErr("");
        const d = await getForecast(days);
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr(String(e?.message || e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days]);

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>Cash-Flow Forecast</div>
          <div style={styles.sub}>
            {data ? `${data.start} → ${data.end}` : "—"}
          </div>
        </div>

        <div style={styles.controls}>
          <label style={styles.label}>Window</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={styles.select}
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {busy && <div style={styles.note}>Loading forecast…</div>}
      {err && <div style={styles.err}>{err}</div>}

      {data && (
        <>
          <div style={styles.grid}>
            <Stat label="Opening balance" value={money(data.openingBalance)} />
            <Stat label="Lowest point" value={`${money(data.lowestBalance)} (${data.lowestDate})`} />
            <Stat
              label="Next income date"
              value={data.summary.nextIncomeDate || "None found"}
            />
            <Stat
              label="Safe to spend/day (until next income)"
              value={
                data.summary.nextIncomeDate
                  ? money(data.summary.safeToSpendPerDay)
                  : "—"
              }
            />
          </div>

          <div style={styles.tableWrap}>
            <div style={styles.tableTitle}>Upcoming</div>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Events</th>
                  <th style={styles.thRight}>Delta</th>
                  <th style={styles.thRight}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.timeline
                  .filter((d) => (d.events?.length || 0) > 0)
                  .slice(0, 12)
                  .map((d) => {
                    const danger = d.balance < 0;
                    return (
                      <tr key={d.date}>
                        <td style={styles.td}>{d.date}</td>
                        <td style={styles.td}>
                          {d.events.map((e, i) => (
                            <div key={i} style={styles.eventLine}>
                              <span>{e.description}</span>
                              <span style={styles.eventAmt}>
                                {money(e.amount)}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td style={styles.tdRight}>{money(d.delta)}</td>
                        <td style={{ ...styles.tdRight, ...(danger ? styles.danger : null) }}>
                          {money(d.balance)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            <div style={styles.smallNote}>
              Showing the next 12 days with events.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 16,
    background: "rgba(255,255,255,0.04)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  sub: { opacity: 0.75, fontSize: 12, marginTop: 2 },
  controls: { display: "flex", gap: 8, alignItems: "center" },
  label: { opacity: 0.75, fontSize: 12 },
  select: {
    borderRadius: 10,
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "inherit",
  },
  note: { opacity: 0.8, marginTop: 8 },
  err: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    background: "rgba(255,0,0,0.10)",
    border: "1px solid rgba(255,0,0,0.25)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12,
    marginBottom: 14,
  },
  stat: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: 12,
    background: "rgba(0,0,0,0.18)",
  },
  statLabel: { opacity: 0.7, fontSize: 12, marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: 700 },
  tableWrap: {
    borderTop: "1px solid rgba(255,255,255,0.10)",
    paddingTop: 12,
  },
  tableTitle: { fontWeight: 700, marginBottom: 8 },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    opacity: 0.75,
    fontWeight: 600,
    padding: "8px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  thRight: {
    textAlign: "right",
    opacity: 0.75,
    fontWeight: 600,
    padding: "8px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  td: {
    padding: "10px 6px",
    verticalAlign: "top",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  tdRight: {
    padding: "10px 6px",
    verticalAlign: "top",
    textAlign: "right",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  },
  danger: { color: "#ffb4b4", fontWeight: 800 },
  eventLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },
  eventAmt: { opacity: 0.9, whiteSpace: "nowrap" },
  smallNote: { opacity: 0.65, fontSize: 12, marginTop: 8 },
};
