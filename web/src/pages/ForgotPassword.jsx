import { useState } from "react";
import { forgotPassword } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: "idle", msg: "" });

    try {
      await forgotPassword(email);
      setStatus({
        type: "ok",
        msg: "If that email exists, a reset link was sent (check the server console in dev).",
      });
    } catch {
      // Still show generic message for privacy/security
      setStatus({
        type: "ok",
        msg: "If that email exists, a reset link was sent (check the server console in dev).",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h2>Forgot password</h2>
      <p>Enter your email and we’ll send a reset link.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <button disabled={loading} style={{ padding: 10 }}>
          {loading ? "Sending..." : "Send reset link"}
        </button>

        {status.type === "ok" && (
          <div style={{ padding: 10, background: "#eaf7ea", borderRadius: 8 }}>
            {status.msg}
          </div>
        )}
      </form>
    </div>
  );
}
