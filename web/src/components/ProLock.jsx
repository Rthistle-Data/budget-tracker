// src/components/ProLock.jsx
import React from "react";

/**
 * Wrap any content that should be Pro-only.
 *
 * Props:
 * - isPro: boolean
 * - title: string (shown in overlay)
 * - teaser: string
 * - ctaText: string
 * - onUpgrade: () => void
 * - preview: ReactNode (optional: what to show blurred behind overlay)
 * - children: ReactNode (the real unlocked content)
 */
export default function ProLock({
  isPro,
  title = "Pro feature",
  teaser = "Unlock this insight with Pro.",
  ctaText = "Unlock with Pro →",
  onUpgrade,
  preview = null,
  children,
}) {
  if (isPro) return <>{children}</>;

  return (
    <div className="prolock">
      <div className="prolock__blur">
        {/* If you provide a preview, we blur that.
            If not, we render children (still blurred) so layout stays identical. */}
        <div className="prolock__content">{preview ?? children}</div>
      </div>

      <div className="prolock__overlay" role="note" aria-label="Pro feature locked">
        <div className="prolock__badge">🔒 Pro</div>
        <div className="prolock__title">{title}</div>
        <div className="prolock__teaser">{teaser}</div>

        <button
          type="button"
          className="prolock__cta"
          onClick={onUpgrade}
        >
          {ctaText}
        </button>

        <div className="prolock__fineprint">Cancel anytime • No ads</div>
      </div>
    </div>
  );
}
