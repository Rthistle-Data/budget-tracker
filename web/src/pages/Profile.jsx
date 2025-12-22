import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { me, changePassword } from "../api";

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await me();
        if (alive) setUser(data.user);
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setLoadingMe(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus({ type: "idle", msg: "" });

    if (!user) {
      setStatus({ type: "err", msg: "Not logged in." });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ type: "err", msg: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirm) {
      setStatus({ type: "err", msg: "Passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setStatus({ type: "ok", msg: "Password updated." });
    } catch (err) {
      setStatus({ type: "err", msg: err.message || "Failed to update password." });
    } finally {
      setSaving(false);
    }
  }

  if (loadingMe) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h2>Profile</h2>
        <div>Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h2>Profile</h2>
        <div style={{ padding: 10, background: "#fdecea", borderRadius: 8, marginBottom: 12 }}>
          Not logged in.
        </div>
        <button onClick={() => navigate("/")} style={{ padding: 10 }}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Profile</h2>
        <button onClick={() => navigate("/")} style={{ marginLeft: "auto", padding: 10 }}>
          Back
        </button>
      </div>

      <div style={{ padding: 10, background: "#f6f6f6", borderRadius: 8, marginTop: 12 }}>
        <div>
          <b>Email:</b> {user.email}
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Change password</h3>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div>Current password</div>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>New password</div>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>Confirm new password</div>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={{ padding: 10 }}
          />
        </label>

        <button disabled={saving} style={{ padding: 10 }}>
          {saving ? "Saving..." : "Update password"}
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
