// web/src/components/PaywallModal.jsx
import React, { useEffect } from "react";

export default function PaywallModal({
  open,
  onClose,
  onUpgrade,
  planName = "Balanceary Pro",
  priceText = "$8.99/month",
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modalBackdrop"
      onMouseDown={(e) => {
        // close if clicking backdrop
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modal card cardPad" style={{ maxWidth: 720 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="brandTitle" style={{ fontSize: 22 }}>
              Unlock {planName}
            </div>
            <div className="brandSub" style={{ marginTop: 6 }}>
              Turn your dashboard into an actual money decision tool.
            </div>
          </div>

          <div className="spacer" />

          <button className="btn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <div className="card" style={{ borderRadius: 16 }}>
            <div className="cardPad">
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{priceText}</div>
                <div style={{ color: "var(--muted)" }}>Cancel anytime • No contracts</div>
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <Feature icon="🔮" title="Cash Flow Forecast">
                  Predict balance & “safe-to-spend” before payday.
                </Feature>
                <Feature icon="📉" title="Financial Stress Score">
                  One number that tells you if you’re tight or safe.
                </Feature>
                <Feature icon="🧾" title="Subscription Leak Finder">
                  Detect recurring charges and flag waste.
                </Feature>
                <Feature icon="💸" title="Payday Mode">
                  Auto-allocate and rebalance your month in minutes.
                </Feature>
              </div>

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" type="button" onClick={onClose}>
                  Not now
                </button>
                <div className="spacer" />
                <button className="btn btnPrimary" type="button" onClick={onUpgrade}>
                  Upgrade to Pro
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                By upgrading you agree to our terms. (We’ll wire this to Stripe next.)
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Tip: You can also offer an annual plan later (ex: $59/yr) with a “Best value” badge.
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 10,
        alignItems: "start",
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 18, lineHeight: "22px" }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 850 }}>{title}</div>
        <div style={{ color: "var(--muted)", marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}
