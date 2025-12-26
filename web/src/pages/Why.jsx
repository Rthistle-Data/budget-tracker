export default function Why() {
  return (
    <div className="why-page">
      <h1>Why This App Exists</h1>

      <section>
        <h2>The Problem</h2>
        <p>
          Most budgeting apps are either too simple to be useful or so complex
          that they feel overwhelming. Many focus on charts and automation
          without helping users understand <em>why</em> their money behaves the
          way it does.
        </p>
        <p>
          I wanted a budgeting tool that feels calm, transparent, and practical —
          something that helps you stay aware of your finances without punishing
          you for mistakes.
        </p>
      </section>

      <section>
        <h2>The Goal</h2>
        <p>
          This app is designed to answer one core question clearly:
        </p>
        <blockquote>
          “Where did my money go this month, and what should I adjust next?”
        </blockquote>
        <p>
          Instead of chasing perfection, the goal is consistency, clarity, and
          confidence.
        </p>
      </section>

      <section>
        <h2>Design Philosophy</h2>
        <ul>
          <li>
            <strong>Month-first thinking:</strong> People budget in months, not
            dashboards. Every view is anchored to a clear monthly context.
          </li>
          <li>
            <strong>Transparency over magic:</strong> Automation (rules,
            recurring transactions) is visible, predictable, and reversible.
          </li>
          <li>
            <strong>Low friction:</strong> Editing transactions, fixing
            categories, and importing data should feel fast and forgiving.
          </li>
          <li>
            <strong>Calm UI:</strong> Financial tools shouldn’t feel stressful.
            The interface is intentionally subdued and readable.
          </li>
        </ul>
      </section>

      <section>
        <h2>Key Features</h2>
        <ul>
          <li>Monthly dashboard with income, spending, and net flow</li>
          <li>Category-based budgets with progress tracking</li>
          <li>Rule-based auto-categorization (with previews)</li>
          <li>Recurring income and expenses for cashflow forecasting</li>
          <li>CSV import with normalization and validation</li>
          <li>Clear handling of uncategorized transactions</li>
        </ul>
      </section>

      <section>
        <h2>Technical Choices</h2>
        <p>
          This project was also an opportunity to build a clean, maintainable
          full-stack application.
        </p>
        <ul>
          <li><strong>Frontend:</strong> React + Vite</li>
          <li><strong>Backend:</strong> Node.js + Express</li>
          <li><strong>Database:</strong> SQLite with Prisma</li>
          <li><strong>Auth:</strong> Session-based authentication</li>
        </ul>
        <p>
          The architecture prioritizes clarity over cleverness — readable code,
          predictable data flow, and room to grow.
        </p>
      </section>

      <section>
        <h2>Tradeoffs & Constraints</h2>
        <ul>
          <li>
            This app avoids aggressive bank syncing in favor of user-controlled
            data imports.
          </li>
          <li>
            Advanced analytics are intentionally limited to keep the experience
            focused.
          </li>
          <li>
            The UI favors stability and clarity over flashy animations.
          </li>
        </ul>
      </section>

      <section>
        <h2>What I’d Build Next</h2>
        <ul>
          <li>Global month selector across all pages</li>
          <li>Inline transaction editing</li>
          <li>Improved recurring cashflow visualization</li>
          <li>Smarter budget warnings and nudges</li>
          <li>Optional mobile-first layout</li>
        </ul>
      </section>

      <section>
        <h2>Who This App Is For</h2>
        <p>
          This app is for people who want to be aware of their money without
          feeling judged by it. It’s especially useful for anyone rebuilding
          financial habits, managing irregular income, or simply wanting a
          clearer picture of their spending.
        </p>
      </section>
    </div>
  );
}
