import { Link } from "react-router-dom";
import "./Landing.css";

function Pill({ live, children }) {
  return (
    <span className="pill">
      {live && <span className="pillDot" />}
      {children}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="landing">
      {/* Background */}
      <div className="landing__bg" aria-hidden="true">
        <div className="landing__bgBase" />
        <div className="landing__glow landing__glow--teal" />
        <div className="landing__glow landing__glow--blue" />
        <div className="landing__glow landing__glow--purple" />
        <div className="landing__vignette" />
      </div>

      {/* Star strip */}
      <div className="landing__stars" aria-hidden="true">
        <div className="landing__starsDots" />
        <div className="landing__starsFade" />
      </div>

      <div className="landing__container">
        {/* Nav */}
        <header className="landing__nav">
          <Link to="/" className="brand">
            <div className="brand__icon">B</div>
            <div>
              <div className="brand__name">Balanceary</div>
              <div className="brand__tag">Budgeting, simplified</div>
            </div>
          </Link>

          <div className="navActions">
            <Link to="/app" className="navLink">Log in</Link>
            <Link to="/app" className="btn btn--ghost">Get started</Link>
          </div>
        </header>

        {/* Hero */}
        <main className="hero">
          <div className="pills">
            <Pill live>Live on balanceary.app</Pill>
            <Pill>Private by design</Pill>
            <Pill>CSV import + Rules</Pill>
          </div>

          <h1 className="h1">
            Balanceary
            <span className="h1Sub">clarity for your money.</span>
          </h1>

          <p className="lead">
            Balanceary is a modern budgeting and expense-tracking app built to help you
            understand where your money goes—without the overwhelm. Track transactions,
            set budgets, organize categories, and automate cleanup with rules.
          </p>

          <div className="ctaRow">
            <Link to="/app" className="btn btn--primary">Open the app</Link>
            <a href="#preview" className="btn btn--ghost">See how it feels</a>
          </div>

          <div className="meta">
            Calm dashboards • Smart categorization • Built for real life
          </div>
        </main>

        {/* Preview */}
        <section id="preview" className="previewWrap">
          <div className="glass preview">
            <div className="previewTop">
              <div style={{ textAlign: "left" }}>
                <div className="previewTitle">Monthly Snapshot</div>
                <div className="previewSub">A quick read on your month</div>
              </div>
              <div className="chip">Demo</div>
            </div>

            <div className="grid">
              <div className="card">
                <div className="label">Budget health</div>
                <div className="row">
                  <div className="big">On track</div>
                  <div className="small">73% of month</div>
                </div>
                <div className="bar">
                  <div className="barFill" />
                </div>
              </div>

              <div className="kpis">
                <div className="kpi">
                  <div className="label">Income</div>
                  <div className="kpiVal">$4,200</div>
                </div>
                <div className="kpi">
                  <div className="label">Spend</div>
                  <div className="kpiVal">$2,980</div>
                </div>
                <div className="kpi">
                  <div className="label">Net</div>
                  <div className="kpiVal">$1,220</div>
                </div>
              </div>

              <div className="card" style={{ textAlign: "left" }}>
                <div className="label">Smart rule example</div>
                <div className="row" style={{ alignItems: "center" }}>
                  <div style={{ fontWeight: 950, opacity: 0.92 }}>
                    “Tim Hortons” → Dining Out
                  </div>
                </div>
                <div className="small">Auto-categorized 14 transactions this month</div>
              </div>
            </div>
          </div>

          <div className="caption">Clean glass UI • Soft contrast • No clutter</div>
        </section>

        <footer className="footer">
          © {new Date().getFullYear()} Balanceary. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
