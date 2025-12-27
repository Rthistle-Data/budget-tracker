// server/forecast.js

function toISODate(d) {
  // returns YYYY-MM-DD (local)
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s) {
  // expects YYYY-MM-DD
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameISO(a, b) {
  return a === b;
}

function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);

  // handle month rollover (e.g., Jan 31 -> Feb)
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

/**
 * Expand recurring items into dated events within [startISO, endISO]
 * Recurring shape expected:
 * { id, description, amount, cadence, nextDate, active }
 *
 * cadence supported: weekly | biweekly | monthly | yearly
 */
function expandRecurring(recurringList, startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);

  const events = [];

  for (const r of recurringList) {
    if (!r?.active) continue;
    if (!r?.nextDate) continue;

    let cursor = parseISODate(r.nextDate);

    // advance cursor forward until >= start
    while (cursor < start) {
      cursor = step(cursor, r.cadence);
      if (!cursor) break;
    }
    if (!cursor) continue;

    // generate until end
    while (cursor <= end) {
      const iso = toISODate(cursor);
      events.push({
        kind: "recurring",
        recurringId: r.id,
        date: iso,
        amount: Number(r.amount) || 0,
        description: r.description || "Recurring",
      });
      cursor = step(cursor, r.cadence);
      if (!cursor) break;
    }
  }

  return events;

  function step(date, cadence) {
    switch (cadence) {
      case "weekly":
        return addDays(date, 7);
      case "biweekly":
        return addDays(date, 14);
      case "monthly":
        return addMonths(date, 1);
      case "yearly":
        return addYears(date, 1);
      default:
        return null;
    }
  }
}

function groupByDate(events) {
  const map = new Map();
  for (const e of events) {
    const k = e.date;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  // stable ordering: income first (nice UX), then expenses
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    map.set(k, arr);
  }
  return map;
}

function buildTimeline({ startISO, days, openingBalance, events }) {
  const start = parseISODate(startISO);
  const end = addDays(start, days - 1);
  const endISO = toISODate(end);

  const byDate = groupByDate(events);

  let balance = Number(openingBalance) || 0;
  let lowestBalance = balance;
  let lowestDate = startISO;

  const timeline = [];

  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const iso = toISODate(day);
    const todays = byDate.get(iso) || [];

    let delta = 0;
    for (const e of todays) delta += Number(e.amount) || 0;

    balance += delta;

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDate = iso;
    }

    timeline.push({
      date: iso,
      delta,
      balance,
      events: todays,
    });
  }

  return { endISO, timeline, lowestBalance, lowestDate };
}

function summarize({ startISO, timeline }) {
  const startBal = timeline.length ? (timeline[0].balance - timeline[0].delta) : 0;

  // next income date = earliest day with any positive event
  let nextIncomeDate = null;
  for (const day of timeline) {
    if (day.events?.some((e) => (Number(e.amount) || 0) > 0)) {
      nextIncomeDate = day.date;
      break;
    }
  }

  // balanceUntilNextIncome = balance change until (but not including) next income day
  let balanceUntilNextIncome = null;
  let safeToSpendPerDay = null;

  if (nextIncomeDate) {
    const idx = timeline.findIndex((d) => d.date === nextIncomeDate);
    const beforeIncome = timeline.slice(0, idx); // days strictly before income date
    const daysCount = Math.max(beforeIncome.length, 1);

    const deltaBefore = beforeIncome.reduce((s, d) => s + (Number(d.delta) || 0), 0);
    balanceUntilNextIncome = startBal + deltaBefore;

    // Simple “safe to spend”: spread remaining money evenly until income day.
    safeToSpendPerDay = balanceUntilNextIncome / daysCount;
  }

  return { startBal, nextIncomeDate, balanceUntilNextIncome, safeToSpendPerDay };
}

export {
  toISODate,
  parseISODate,
  addDays,
  expandRecurring,
  buildTimeline,
  summarize,
};
