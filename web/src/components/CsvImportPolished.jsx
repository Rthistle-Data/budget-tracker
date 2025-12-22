import Papa from "papaparse";
import { useMemo, useState } from "react";
import { dryRunImport, importCsv } from "../api";



function guessColumn(headers, kind) {
  const h = headers.map((x) => String(x || "").toLowerCase().trim());

  const candidates = {
    date: ["date", "transaction date", "posted date", "posting date", "time"],
    description: ["description", "memo", "details", "merchant", "name", "payee"],
    amount: ["amount", "amt", "value", "debit", "credit", "total"],
  }[kind];

  for (const c of candidates) {
    const idx = h.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  // fallback: partial match
  for (let i = 0; i < h.length; i++) {
    if (candidates.some((c) => h[i].includes(c))) return headers[i];
  }
  return "";
}

export default function CsvImportPolished({ month, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);

  const [mapping, setMapping] = useState({ date: "", description: "", amount: "" });

  const [dryRunEnabled, setDryRunEnabled] = useState(true);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const preview = useMemo(() => rawRows.slice(0, 10), [rawRows]);

  function onPickFile(f) {
    setErr("");
    setMsg("");
    setDryRunResult(null);

    if (!f) return;
    setFileName(f.name);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => {
        const rows = results.data || [];
        const fields = results.meta?.fields || [];

        setRawRows(rows);
        setHeaders(fields);

        // auto-guess mapping
        const guessed = {
          date: guessColumn(fields, "date"),
          description: guessColumn(fields, "description"),
          amount: guessColumn(fields, "amount"),
        };
        setMapping(guessed);
      },
      error: (e) => {
        setErr(e?.message || "Failed to parse CSV");
      },
    });
  }

  const mappingValid = !!mapping.date && !!mapping.description && !!mapping.amount;

  async function runDryRun() {
    setErr("");
    setMsg("");
    setDryRunResult(null);

    if (!month) return setErr("Missing month context");
    if (!rawRows.length) return setErr("No CSV rows loaded");
    if (!mappingValid) return setErr("Please map Date / Description / Amount first");

    setDryRunBusy(true);
    try {
      const r = await dryRunImport({ month, rows: rawRows, mapping });
      setDryRunResult(r);
      setMsg(`Dry run complete: ${r.willImport} will import, ${r.willSkip} will skip.`);
    } catch (e) {
      setErr(e?.message || "Dry run failed");
    } finally {
      setDryRunBusy(false);
    }
  }

  async function doImport() {
  setErr("");
  setMsg("");

  if (!month) return setErr("Missing month context");
  if (!rawRows.length) return setErr("No CSV rows loaded");
  if (!mappingValid) return setErr("Please map Date / Description / Amount first");

  // If dry run is enabled, encourage running it first
  if (dryRunEnabled && !dryRunResult) {
    setErr("Run Dry Run first so you can see what will import / skip.");
    return;
  }

  setDryRunBusy(true);
  try {
    const result = await importCsv({ month, rows: rawRows, mapping });

    // result could include inserted count, skipped, etc.
    setMsg(`Imported ${result.imported ?? "transactions"} successfully.`);
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setDryRunResult(null);

    onImported?.();
  } catch (e) {
    setErr(e?.message || "Import failed");
  } finally {
    setDryRunBusy(false);
  }
}


    try {
      // Wire this to your existing endpoint.
      // Example:
      // await importCsv({ month, rows: rawRows, mapping });
      // onImported?.();

      setMsg("Import hook is ready — connect doImport() to your importCsv endpoint.");
    } catch (e) {
      setErr(e?.message || "Import failed");
    }
  }

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>CSV Import</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Preview → Map columns → Dry run → Import
          </div>
        </div>

        <label style={fileBtn}>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          Choose CSV
        </label>
      </div>

      {fileName ? (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          Loaded: <span style={{ fontWeight: 600 }}>{fileName}</span> ({rawRows.length} rows)
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
          Pick a CSV to start.
        </div>
      )}

      {!!headers.length && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <FieldSelect
              label="Date column"
              headers={headers}
              value={mapping.date}
              onChange={(v) => {
                setMapping((m) => ({ ...m, date: v }));
                setDryRunResult(null);
              }}
            />
            <FieldSelect
              label="Description column"
              headers={headers}
              value={mapping.description}
              onChange={(v) => {
                setMapping((m) => ({ ...m, description: v }));
                setDryRunResult(null);
              }}
            />
            <FieldSelect
              label="Amount column"
              headers={headers}
              value={mapping.amount}
              onChange={(v) => {
                setMapping((m) => ({ ...m, amount: v }));
                setDryRunResult(null);
              }}
            />
          </div>

          <div style={toggleRow}>
            <label style={toggleLabel}>
              <input
                type="checkbox"
                checked={dryRunEnabled}
                onChange={(e) => setDryRunEnabled(e.target.checked)}
              />
              <span style={{ marginLeft: 8 }}>Dry run before import</span>
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={btnSecondary}
                disabled={!mappingValid || !rawRows.length || dryRunBusy}
                onClick={runDryRun}
              >
                {dryRunBusy ? "Running…" : "Run dry run"}
              </button>

              <button
                style={btnPrimary}
                disabled={!mappingValid || !rawRows.length}
                onClick={doImport}
              >
                Import
              </button>
            </div>
          </div>

          {dryRunResult && (
            <div style={summaryBox}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Pill label="Total" value={dryRunResult.totalRows} />
                <Pill label="Will import" value={dryRunResult.willImport} strong />
                <Pill label="Will skip" value={dryRunResult.willSkip} />
              </div>

              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Skip reasons</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {Object.entries(dryRunResult.reasonsBreakdown || {}).map(([k, v]) => (
                    <div key={k} style={reasonItem}>
                      <div style={{ fontWeight: 700 }}>{v}</div>
                      <div style={{ opacity: 0.8 }}>{k.replaceAll("_", " ")}</div>
                    </div>
                  ))}
                </div>

                {!!dryRunResult.sampleSkipped?.length && (
                  <>
                    <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>Sample skipped rows</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={table}>
                        <thead>
                          <tr>
                            <th style={th}>Reason</th>
                            <th style={th}>Date</th>
                            <th style={th}>Description</th>
                            <th style={th}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dryRunResult.sampleSkipped.map((x, idx) => (
                            <tr key={idx}>
                              <td style={td}>{x.reason}</td>
                              <td style={td}>{x.normalized?.date || ""}</td>
                              <td style={td}>{x.normalized?.description || ""}</td>
                              <td style={td}>{Number.isFinite(x.normalized?.amount) ? x.normalized.amount : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {!!preview.length && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Preview (first 10 rows)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      {headers.slice(0, 8).map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        {headers.slice(0, 8).map((h) => (
                          <td key={h} style={td}>{String(r?.[h] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  Showing up to 8 columns for readability.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!!msg && <div style={ok}>{msg}</div>}
      {!!err && <div style={bad}>{err}</div>}
    </div>
  );


function FieldSelect({ label, headers, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={select}>
        <option value="">— Select —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function Pill({ label, value, strong }) {
  return (
    <div style={{ ...pill, borderColor: strong ? "rgba(80,200,120,0.35)" : "rgba(255,255,255,0.12)" }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

// ---- tiny inline styles to keep it drop-in ----
const card = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
};

const headerRow = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };

const fileBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  cursor: "pointer",
  fontWeight: 700,
};

const select = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.22)",
  color: "inherit",
};

const toggleRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.14)",
};

const toggleLabel = { display: "inline-flex", alignItems: "center", cursor: "pointer", fontWeight: 700 };

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(90,140,255,0.30)",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  cursor: "pointer",
  fontWeight: 800,
};

const summaryBox = {
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.16)",
};

const pill = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  minWidth: 120,
};

const reasonItem = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  overflow: "hidden",
};

const th = {
  textAlign: "left",
  padding: "10px 10px",
  fontSize: 12,
  opacity: 0.85,
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
};

const td = {
  padding: "9px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
  whiteSpace: "nowrap",
  opacity: 0.9,
};

const ok = { marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(80,200,120,0.16)" };
const bad = { marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(255,90,90,0.16)" };
