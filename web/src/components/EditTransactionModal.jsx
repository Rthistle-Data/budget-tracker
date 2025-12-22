import { useEffect, useMemo, useState } from "react";

export default function EditTransactionModal({ open, onClose, tx, categories, onSave }) {
  // Normalize categories into: [{ id: string|null, name: string }]
  const catOptions = useMemo(() => {
    const raw = Array.isArray(categories) ? categories : [];

    // If array of objects {id,name}
    if (raw.length && typeof raw[0] === "object" && raw[0] !== null) {
      const list = raw
        .map((c) => ({
          id: c.id ?? null,
          name: String(c.name ?? "").trim(),
        }))
        .filter((c) => c.name);

      // Ensure Uncategorized exists
      if (!list.some((c) => c.name === "Uncategorized")) {
        list.unshift({ id: null, name: "Uncategorized" });
      }
      // Dedup by name
      const seen = new Set();
      return list.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
    }

    // If array of strings
    const list = raw
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .map((name) => ({ id: null, name }));

    if (!list.some((c) => c.name === "Uncategorized")) list.unshift({ id: null, name: "Uncategorized" });

    const seen = new Set();
    return list.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  }, [categories]);

  // Form state (supports both your old txn fields + the modal fields)
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense"); // "income" | "expense"
  const [categoryName, setCategoryName] = useState("Uncategorized"); // string category
  const [categoryId, setCategoryId] = useState(null); // optional id if your modal wants it
  const [description, setDescription] = useState(""); // maps to merchant in backend
  const [account, setAccount] = useState("Chequing");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !tx) return;

    setErr("");

    const txDate = String(tx.date || "").slice(0, 10);
    setDate(txDate || "");

    // Support either:
    // - your txn: amount is signed (negative for expense)
    // - modal tx: amount is positive + separate type
    const rawAmt = Number(tx.amount);
    const inferredType = tx.type === "income" || tx.type === "expense" ? tx.type : rawAmt >= 0 ? "income" : "expense";
    setType(inferredType);

    const absAmt = Number.isFinite(rawAmt) ? Math.abs(rawAmt) : "";
    setAmount(absAmt === "" ? "" : String(absAmt));

    // category can come from tx.category or category_id
    const txCatName = String(tx.category || "Uncategorized");
    setCategoryName(txCatName || "Uncategorized");

    setCategoryId(tx.category_id ?? null);

    // merchant vs description
    setDescription(String(tx.description ?? tx.merchant ?? ""));

    setAccount(String(tx.account || "Chequing"));
    setNote(String(tx.note || ""));
  }, [open, tx]);

  // Keep selected category valid if options change
  useEffect(() => {
    if (!open) return;
    const names = catOptions.map((c) => c.name);
    if (!names.includes(categoryName)) {
      setCategoryName(names.includes("Uncategorized") ? "Uncategorized" : names[0] || "Uncategorized");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catOptions.map((c) => c.name).join("|"), open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const amt = Number(amount);
    if (!date) return setErr("Date is required.");
    if (!Number.isFinite(amt) || amt <= 0) return setErr("Amount must be a number greater than 0.");

    // Convert (type + positive amount) -> signed amount for your backend
    const signedAmount = type === "income" ? Math.abs(amt) : -Math.abs(amt);

    setSaving(true);
    try {
      await onSave({
        // modal-friendly fields:
        date,
        amount: signedAmount,
        type,
        description, // maps to merchant
        category_id: categoryId,

        // your backend-friendly fields:
        category: categoryName || "Uncategorized",
        merchant: description,
        account,
        note,
      });
      onClose();
    } catch (e2) {
      setErr(e2?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Edit transaction</div>
            <div style={styles.sub}>Update details then save.</div>
          </div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={styles.form}>
          <div style={styles.grid2}>
            <label style={styles.label}>
              Date
              <input
                className="input"
                style={styles.input}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>

            <label style={styles.label}>
              Amount
              <input
                className="input"
                style={styles.input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="54.23"
              />
            </label>
          </div>

          <div style={styles.grid2}>
            <label style={styles.label}>
              Type
              <select className="select" style={styles.input} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>

            <label style={styles.label}>
              Category
              <select
                className="select"
                style={styles.input}
                value={categoryName}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setCategoryName(nextName);

                  // If we have id/name options, keep categoryId in sync
                  const found = catOptions.find((c) => c.name === nextName);
                  setCategoryId(found?.id ?? null);
                }}
              >
                {catOptions.map((c) => (
                  <option key={c.id ?? c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={styles.grid2}>
            <label style={styles.label}>
              Description / Merchant
              <input
                className="input"
                style={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Superstore"
              />
            </label>

            <label style={styles.label}>
              Account
              <input
                className="input"
                style={styles.input}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="Chequing"
              />
            </label>
          </div>

          <label style={styles.label}>
            Note
            <input
              className="input"
              style={styles.input}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </label>

          {err ? <div style={styles.error}>{err}</div> : null}

          <div style={styles.footer}>
            <button type="button" className="btn" style={styles.btnGhost} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    width: "min(680px, 100%)",
    background: "#11131a",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    color: "white",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "16px 16px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: { fontSize: 16, fontWeight: 900, letterSpacing: 0.2 },
  sub: { marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.65)" },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
  },
  form: { padding: 16, display: "grid", gap: 12 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label: { display: "grid", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: "10px 12px",
    color: "white",
    outline: "none",
  },
  error: {
    background: "rgba(255, 80, 80, 0.12)",
    border: "1px solid rgba(255, 80, 80, 0.25)",
    padding: "10px 12px",
    borderRadius: 12,
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
  },
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  btnGhost: { border: "1px solid rgba(255,255,255,0.12)", background: "transparent" },
};
