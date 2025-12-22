import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resetPassword } from "../api";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPassword() {
  const q = useQuery();
  const navigate = useNavigate();

  const email = q.get("email") || "";
  const token = q.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [loading, setLoading] = useState(false);

  const disabled = !email || !token;

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ type: "idle", msg: "" });

    if (newPassword.length < 8) {
      setStatus({ type: "err", msg: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirm) {
      setStatus({ type: "err", msg: "Passwords do not match." });
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, token, newPassword);
      setStatus({ type: "ok", msg: "Password reset successful. Redirecting..." });
      setTimeout(() => navigate("/"), 600);
    } catch (err) {
      setStatus({ type: "err", msg: err.message || "Reset failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: 16 }}>
      <h2>Reset password</h2>

      {disabled ? (
        <div style={{ padding: 10, background: "#fff3cd", borderRadius: 8 }}>
          Missing token or email. Please use the link from the reset email/console.
        </div>
      ) : (
        <p>
          Resetting password for <b>{email}</b>
        </p>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <label>
          New password
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            required
            disabled={disabled}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Confirm new password
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            autoComplete="new-password"
            required
            disabled={disabled}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>

        <button disabled={loading || disabled} style={{ padding: 10 }}>
          {loading ? "Resetting..." : "Reset password"}
        </button>

        {status.type !== "idle" && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: status.type === "ok" ? "#eaf7ea" : "#fdecea",
            }}
          >
            {status.msg}
          </div>
        )}
      </form>
    </div>
  );
}
