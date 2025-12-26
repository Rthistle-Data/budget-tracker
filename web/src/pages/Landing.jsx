import { Link } from "react-router-dom";
import { forwardRef } from "react";
import useReveal from "../hooks/useReveal";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const Glass = forwardRef(function Glass({ className = "", children }, ref) {
  return (
    <div
      ref={ref}
      className={cx(
        "rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl",
        "shadow-[0_12px_45px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      {children}
    </div>
  );
});

function Pill({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
      {children}
    </span>
  );
}

function Feature({ title, desc, delayClass = "" }) {
  const ref = useReveal();
  return (
    <Glass
      ref={ref}
      className={cx(
        "reveal p-6 transition hover:-translate-y-0.5 hover:bg-white/[0.075]",
        delayClass
      )}
    >
      <div className="text-sm font-semibold text-white/90">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/65">{desc}</div>
    </Glass>
  );
}

function PriceCard({
  title,
  price,
  subtitle,
  bullets,
  highlight,
  ctaLabel,
  ctaTo,
  delayClass = "",
}) {
  const ref = useReveal();

  return (
    <div
      ref={ref}
      className={cx(
        "reveal relative rounded-3xl border p-7 backdrop-blur-xl",
        "shadow-[0_12px_45px_rgba(0,0,0,0.45)]",
        "transition hover:-translate-y-0.5",
        delayClass,
        highlight
          ? "border-white/15 bg-white/[0.08]"
          : "border-white/10 bg-white/[0.06]"
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-6 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-semibold text-white/80">
          Most popular
        </div>
      )}

      <div className="text-base font-semibold text-white/90">{title}</div>
      <div className="mt-1 text-sm text-white/60">{subtitle}</div>

      <div className="mt-6 flex items-end gap-2">
        <div className="text-4xl font-black tracking-tight text-white">{price}</div>
        {price !== "Free" && <div className="pb-1 text-sm text-white/60">/mo</div>}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-white/70">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-white/80">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Link
        to={ctaTo}
        className={cx(
          "mt-7 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
          "shimmer-hover",
          highlight
            ? "bg-white/90 text-black hover:bg-white"
            : "bg-white/10 text-white hover:bg-white/15 border border-white/10"
        )}
      >
        {ctaLabel}
      </Link>

      {highlight && (
        <div className="mt-3 text-center text-xs text-white/50">
          Cancel anytime • Upgrade when you want
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const heroLeftRef = useReveal();
  const heroRightRef = useReveal();
  const featuresHeaderRef = useReveal();
  const proRef = useReveal();
  const faqRef = useReveal();
  const ctaRef = useReveal();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050913] text-white">
      {/* BACKDROP */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#06102a] via-[#050913] to-[#050913]" />

        <div className="aurora-float absolute -right-40 -top-40 h-[650px] w-[650px] rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.20),transparent_60%)] blur-2xl" />
        <div className="aurora-float2 absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.14),transparent_60%)] blur-2xl" />
        <div className="aurora-float3 absolute left-1/2 top-[78%] h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(168,85,247,0.14),transparent_65%)] blur-2xl" />

        <div className="vignette-pulse absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
      </div>

      {/* star strip */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[70px] opacity-70">
        <div className="h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="absolute inset-0 bg-gradient-to-l from-black/70 to-transparent" />
      </div>

      {/* NAV */}
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 shadow">
            <span className="text-lg font-black">B</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white/90">Balanceary</div>
            <div className="text-xs text-white/50">Budgeting, simplified</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-white/65 md:flex">
          <a href="#features" className="hover:text-white/90">
            Features
          </a>
          <a href="#pro" className="hover:text-white/90">
            Pro
          </a>
          <a href="#faq" className="hover:text-white/90">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="shimmer-hover rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* HERO */}
      <main className="relative mx-auto w-full max-w-6xl px-6 pb-14 pt-6">
        <section className="grid items-start gap-10 md:grid-cols-2">
          {/* Left */}
          <div ref={heroLeftRef} className="reveal">
            <div className="flex flex-wrap gap-2">
              <Pill>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live on balanceary.app
              </Pill>
              <Pill>Private by design</Pill>
              <Pill>CSV import + Rules</Pill>
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
              Balanceary
              <span className="block pt-2 text-white/80">clarity for your money.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              Balanceary is a modern budgeting and expense-tracking app built to help
              you understand where your money goes—without the overwhelm. Track
              transactions, set budgets, organize categories, and automate cleanup
              with rules.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/register"
                className="shimmer-hover inline-flex items-center justify-center rounded-2xl bg-white/90 px-6 py-3 text-sm font-semibold text-black hover:bg-white"
              >
                Create free account
              </Link>
              <a
                href="#pro"
                className="shimmer-hover inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Explore Balanceary Pro
              </a>
            </div>

            <div className="mt-6 text-xs text-white/45">
              Simple, clean dashboards • Automation that saves time • Built for real life
            </div>
          </div>

          {/* Right */}
          <div ref={heroRightRef} className="reveal reveal-delay-2">
            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[34px] bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_60%)] blur-2xl" />

              <Glass className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white/90">Monthly Snapshot</div>
                    <div className="text-xs text-white/50">A quick read on your month</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70">
                    Demo
                  </span>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="text-xs text-white/50">Budget health</div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="text-2xl font-bold text-white">On track</div>
                      <div className="text-xs text-white/45">73% of month</div>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                      <div className="h-2 w-[68%] rounded-full bg-white/70" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Income", value: "$4,200" },
                      { label: "Spend", value: "$2,980" },
                      { label: "Net", value: "$1,220" },
                    ].map((x) => (
                      <div
                        key={x.label}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="text-xs text-white/50">{x.label}</div>
                        <div className="mt-2 text-lg font-bold text-white">{x.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="text-xs text-white/50">Smart rule example</div>
                    <div className="mt-2 text-sm font-semibold text-white/90">
                      “Tim Hortons” → Dining Out
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Auto-categorized 14 transactions this month
                    </div>
                  </div>
                </div>
              </Glass>

              <div className="mt-4 text-center text-xs text-white/45">
                Clean glass UI • Soft contrast • No clutter
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="mt-16">
          <div ref={featuresHeaderRef} className="reveal">
            <h2 className="text-2xl font-bold text-white/90">Built for momentum</h2>
            <p className="mt-2 text-sm text-white/60">
              Track, categorize, budget, and automate—without babysitting your finances.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Feature
              title="Fast CSV imports"
              desc="Bring your bank exports in seconds with mapping + validation so your data stays clean."
              delayClass="reveal-delay-1"
            />
            <Feature
              title="Rules & automation"
              desc="Auto-categorize transactions by merchant/keywords. Less manual work, more consistency."
              delayClass="reveal-delay-2"
            />
            <Feature
              title="Recurring forecasting"
              desc="See what’s still coming this month so budgets don’t get blindsided."
              delayClass="reveal-delay-3"
            />
            <Feature
              title="Clear monthly dashboard"
              desc="Understand income, spending, and net at a glance—then drill down when you want."
              delayClass="reveal-delay-4"
            />
          </div>
        </section>

        {/* PRO */}
        <section id="pro" className="mt-16">
          <Glass ref={proRef} className="reveal p-8">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white/95">
                  Balanceary Pro
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-white/60">
                  Keep the core simple. Unlock power when you’re ready—advanced insights,
                  exports, bulk actions, and smarter automation.
                </p>
              </div>
              <div className="text-xs text-white/45">
                Pricing is placeholder — easy to change later.
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <PriceCard
                title="Free"
                price="Free"
                subtitle="Everything you need to start."
                bullets={[
                  "Transactions + categories",
                  "Monthly budgets",
                  "CSV import",
                  "Recurring transactions",
                ]}
                ctaLabel="Create account"
                ctaTo="/register"
                delayClass="reveal-delay-1"
              />
              <PriceCard
                title="Pro"
                price="$6"
                subtitle="Automation + insights."
                bullets={[
                  "Everything in Free",
                  "Advanced analytics",
                  "Smarter rules & bulk actions",
                  "Export + reporting tools",
                  "Priority improvements roadmap",
                ]}
                ctaLabel="Explore Pro (coming soon)"
                ctaTo="/register"
                highlight
                delayClass="reveal-delay-2"
              />
              <PriceCard
                title="Team"
                price="$12"
                subtitle="Shared finances (household)."
                bullets={[
                  "Everything in Pro",
                  "Shared budgets",
                  "Permissions & history",
                  "Household insights",
                ]}
                ctaLabel="Join waitlist (coming soon)"
                ctaTo="/register"
                delayClass="reveal-delay-3"
              />
            </div>
          </Glass>
        </section>

        {/* FAQ */}
        <section id="faq" className="mt-16">
          <div ref={faqRef} className="reveal">
            <h2 className="text-2xl font-bold text-white/90">FAQ</h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Glass className="p-6">
                <div className="text-sm font-semibold text-white/90">Is Balanceary free?</div>
                <p className="mt-2 text-sm text-white/60">
                  Yep. Core features are free. Pro adds advanced tools later.
                </p>
              </Glass>
              <Glass className="p-6">
                <div className="text-sm font-semibold text-white/90">Can I import transactions?</div>
                <p className="mt-2 text-sm text-white/60">
                  Yes—export CSV from your bank and import with mapping.
                </p>
              </Glass>
              <Glass className="p-6">
                <div className="text-sm font-semibold text-white/90">Does it automate categorizing?</div>
                <p className="mt-2 text-sm text-white/60">
                  Rules can auto-assign categories based on description/keywords.
                </p>
              </Glass>
              <Glass className="p-6">
                <div className="text-sm font-semibold text-white/90">What’s coming in Pro?</div>
                <p className="mt-2 text-sm text-white/60">
                  Better analytics, exports, bulk actions, and stronger automation.
                </p>
              </Glass>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mt-16">
          <Glass ref={ctaRef} className="reveal relative overflow-hidden p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <h2 className="text-3xl font-black tracking-tight text-white/95">
              Build a budget you can actually stick to.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/60">
              Simpler, cleaner, and more predictable finances—starting today.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/register"
                className="shimmer-hover inline-flex items-center justify-center rounded-2xl bg-white/90 px-6 py-3 text-sm font-semibold text-black hover:bg-white"
              >
                Get started free
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Log in
              </Link>
            </div>

            <p className="mt-4 text-xs text-white/45">No spam. No fluff. Just clarity.</p>
          </Glass>
        </section>

        <footer className="mt-14 pb-10 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Balanceary. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
