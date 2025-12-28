// server/index.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { createRequire } from "module";

import pkg from "@prisma/client";
const { PrismaClient } = pkg;

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// ------------------------------------
// CJS deps (Node 20/24 + ESM safe)
// ------------------------------------
const require = createRequire(import.meta.url);
const session = require("express-session");

// ------------------------------------
// App
// ------------------------------------
const app = express();
const API = "/api";

/* ---------------------------
   Middleware
---------------------------- */
app.use(express.json({ limit: "5mb" }));

// CORS
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || "http://localhost:5173").trim();

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow curl/postman
  if (origin === CLIENT_ORIGIN) return true;

  // local dev fallbacks
  if (origin === "http://localhost:5173") return true;
  if (origin === "http://127.0.0.1:5173") return true;

  // custom domains
  if (origin === "https://balanceary.app") return true;
  if (origin === "https://www.balanceary.app") return true;

  // vercel previews
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;

  return false;
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// Rate limit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ---------------------------
   Prisma (Prisma 7 + SQLite adapter)
---------------------------- */
if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. Example: file:./dev.db");
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/* ---------------------------
   Sessions
---------------------------- */
app.set("trust proxy", 1);

app.use(
  session({
    name: "balanceary.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,          // REQUIRED for HTTPS
      sameSite: "none",      // REQUIRED for cross-site cookies
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
    store: new SqliteStore({
      client: sessionDb,
    }),
  })
);


/* ---------------------------
   Helpers
---------------------------- */
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function toStr(v) {
  return v == null ? "" : String(v).trim();
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d) {
  const x = startOfDay(d);
  return x.toISOString().slice(0, 10);
}

function parseIsoDate(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd || "")
    .split("-")
    .map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addMonths(date, n) {
  const x = new Date(date);
  x.setMonth(x.getMonth() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addYears(date, n) {
  const x = new Date(date);
  x.setFullYear(x.getFullYear() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function normalizeDateToIso(s) {
  const str = toStr(s);
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return "";
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function makeImportHash(userId, date, merchant, amount, account) {
  const raw = `${userId}|${date}|${merchant}|${amount}|${account}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

/* ---------------------------
   Merchant -> Category rules (AUTO)
   (merchant only)
---------------------------- */
function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}

function sortRulesBestFirst(rules) {
  // longest match wins (more specific)
  return (rules || [])
    .slice()
    .sort((a, b) => String(b.match || "").length - String(a.match || "").length);
}

function categoryFromRules(rules, merchantRaw) {
  const merchant = normalizeForMatch(merchantRaw);
  if (!merchant) return null;

  for (const r of rules) {
    const needle = normalizeForMatch(r.match);
    if (!needle) continue;
    if (merchant.includes(needle)) return String(r.category || "");
  }
  return null;
}

async function autoCategoryForMerchant(userId, merchant) {
  const rulesRaw = await prisma.rule.findMany({
    where: { userId },
    select: { match: true, category: true },
    orderBy: { createdAt: "desc" },
  });
  const rules = sortRulesBestFirst(rulesRaw);
  return categoryFromRules(rules, merchant) || "Uncategorized";
}

/* ---------------------------
   Recurring helpers
---------------------------- */
function monthlyOccurrencesWithinDayOfMonth(dayOfMonth, from, to) {
  const dom = Math.max(1, Math.min(28, Number(dayOfMonth || 1)));

  const start = startOfDay(from);
  const end = startOfDay(to);

  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  cursor.setHours(0, 0, 0, 0);

  const out = [];
  while (cursor <= end) {
    const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
    occurrence.setHours(0, 0, 0, 0);

    if (occurrence >= start && occurrence <= end) out.push(isoDate(occurrence));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

function cadenceNextDateOccurrences(nextDateStr, cadence, from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);

  const first = parseIsoDate(nextDateStr);
  if (!first) return [];

  let cur = startOfDay(first);
  const out = [];

  while (cur < start) {
    if (cadence === "weekly") cur = addDays(cur, 7);
    else if (cadence === "monthly") cur = addMonths(cur, 1);
    else if (cadence === "quarterly") cur = addMonths(cur, 3);
    else if (cadence === "yearly") cur = addYears(cur, 1);
    else return [];
  }

  while (cur <= end) {
    out.push(isoDate(cur));
    if (cadence === "weekly") cur = addDays(cur, 7);
    else if (cadence === "monthly") cur = addMonths(cur, 1);
    else if (cadence === "quarterly") cur = addMonths(cur, 3);
    else if (cadence === "yearly") cur = addYears(cur, 1);
    else break;
  }

  return out;
}

/* ---------------------------
   Health
---------------------------- */
app.get(`${API}/health`, (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ---------------------------
   Route sanity list
---------------------------- */
app.get(`${API}/__routes`, (req, res) => {
  const routes = app._router.stack
    .filter((r) => r.route)
    .map((r) => ({
      method: Object.keys(r.route.methods)[0].toUpperCase(),
      path: r.route.path,
    }));
  res.json({ count: routes.length, routes });
});

/* ---------------------------
   Auth
---------------------------- */
app.post(`${API}/auth/register`, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const existing = await prisma.user.findUnique({ where: { email: String(email) } });
    if (existing) return res.status(400).json({ error: "Email already in use" });

    const hash = await bcrypt.hash(String(password), 12);

    const user = await prisma.user.create({
      data: { email: String(email), passwordHash: hash },
      select: { id: true, email: true, createdAt: true },
    });

    req.session.userId = user.id;
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/auth/login`, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    req.session.userId = user.id;
    res.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/auth/logout`, (req, res) => {
  req.session?.destroy(() => res.json({ ok: true }));
});

app.get(`${API}/auth/me`, async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.json({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });

    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Settings
---------------------------- */
app.get(`${API}/settings`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const settings =
      (await prisma.userSettings.findUnique({ where: { userId } })) ||
      (await prisma.userSettings.create({ data: { userId } }));

    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/settings/balance`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentBalance } = req.body || {};
    const num = Number(currentBalance);
    if (!Number.isFinite(num)) return res.status(400).json({ error: "Invalid currentBalance" });

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: { currentBalance: num },
      create: { userId, currentBalance: num },
    });

    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Forecast  ✅ (single source of truth)
   - Uses userSettings.currentBalance
   - Adds monthly recurring + subscription occurrences
   - Estimates daily variable from last 90 days net (clamped <= 0)
   - Day 0 = startBalance (no delta applied on day 0)
---------------------------- */
app.get(`${API}/forecast`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const days = Math.max(7, Math.min(180, Number(req.query.days || 60)));
    const from = startOfDay(new Date());
    const to = addDays(from, days);

    const settings =
      (await prisma.userSettings.findUnique({ where: { userId } })) ||
      (await prisma.userSettings.create({ data: { userId } }));

    const startBalance = Number(settings.currentBalance || 0);
    let balance = startBalance;

    // Monthly recurring (your model)
    const recurring = await prisma.recurring.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, amount: true, dayOfMonth: true },
    });

    // Subscriptions (your model)
    const subs = await prisma.subscription.findMany({
      where: {
        userId,
        isActive: true,
        nextDate: { not: null },
        cadence: { in: ["weekly", "monthly", "quarterly", "yearly"] },
      },
      select: {
        id: true,
        displayName: true,
        expectedAmount: true,
        amountMin: true,
        amountMax: true,
        nextDate: true,
        cadence: true,
      },
    });

    // Variable spend estimate (avg daily NET over last 90 days, clamped to <= 0)
    const todayIso = isoDate(from);
    const ninetyDaysAgoIso = isoDate(addDays(from, -90));

    const tx = await prisma.transaction.findMany({
      where: { userId, date: { gte: ninetyDaysAgoIso, lt: todayIso } },
      select: { amount: true },
    });

    const net90 = tx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const avgDailyNet = net90 / 90;
    const estimatedDailyVariable = Math.min(0, avgDailyNet);

    // Initialize daily deltas
    const deltas = {};
    for (let i = 0; i <= days; i++) {
      const d = isoDate(addDays(from, i));
      deltas[d] = { recurring: 0, variable: estimatedDailyVariable };
    }

    // Monthly recurring occurrences
    for (const r of recurring) {
      const dates = monthlyOccurrencesWithinDayOfMonth(r.dayOfMonth, from, to);
      for (const d of dates) deltas[d].recurring += Number(r.amount || 0);
    }

    // Subscription occurrences
    for (const s of subs) {
      const amt = Number(s.expectedAmount ?? s.amountMax ?? s.amountMin ?? 0);
      if (!Number.isFinite(amt) || amt === 0) continue;
      const dates = cadenceNextDateOccurrences(s.nextDate, s.cadence, from, to);
      for (const d of dates) if (deltas[d]) deltas[d].recurring += amt;
    }

    // Build series
    const series = [];
    let lowest = { date: isoDate(from), balance };

    // Day 0: starting point (no delta)
    series.push({
      date: isoDate(from),
      delta: 0,
      balance,
      breakdown: { recurring: 0, variable: 0 },
    });

    // Days 1..N apply deltas
    for (let i = 1; i <= days; i++) {
      const d = isoDate(addDays(from, i));
      const day = deltas[d] || { recurring: 0, variable: 0 };
      const delta = (day.recurring || 0) + (day.variable || 0);

      balance = balance + delta;

      if (balance < lowest.balance) lowest = { date: d, balance };

      series.push({
        date: d,
        delta,
        balance,
        breakdown: {
          recurring: day.recurring || 0,
          variable: day.variable || 0,
        },
      });
    }

    res.json({
      days,
      startBalance,
      estimatedDailyVariable,
      lowest,
      series,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   CSV Import
   - POST /api/import/csv
   - POST /api/import/csv/dry-run
   Uses MANUAL dedupe (no skipDuplicates)
========================================================= */
app.post(`${API}/import/csv/dry-run`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { month, rows } = req.body || {};

    if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array required" });
    }

    const preview = [];
    let invalid = 0;

    for (const r of rows) {
      const date = normalizeDateToIso(r.date || r.Date || r["Posting Date"] || r["Transaction Date"]);
      const merchant = toStr(r.merchant || r.Description || r.description || r.Merchant || r.Payee || r.Name);
      const account = toStr(r.account || r.Account) || "Chequing";
      const amount = Number(r.amount ?? r.Amount ?? r.CAD ?? r.Value);

      if (!date || !date.startsWith(month) || !Number.isFinite(amount) || !merchant) {
        invalid++;
        continue;
      }

      const category = await autoCategoryForMerchant(userId, merchant);
      preview.push({ date, merchant, amount, account, category, note: toStr(r.note || r.Note) });
      if (preview.length >= 50) break;
    }

    res.json({ ok: true, previewCount: preview.length, invalid, preview });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/import/csv`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { rows, source } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array required" });
    }

    const toInsert = [];
    let skipped = 0;

    for (const r of rows) {
      const date = normalizeDateToIso(r.date || r.Date || r["Posting Date"] || r["Transaction Date"]);
      const merchant = toStr(r.merchant || r.Description || r.description || r.Merchant || r.Payee || r.Name);
      const account = toStr(r.account || r.Account) || "Chequing";
      const note = toStr(r.note || r.Note);
      const amount = Number(r.amount ?? r.Amount ?? r.CAD ?? r.Value);

      if (!date || !merchant || !Number.isFinite(amount)) {
        skipped++;
        continue;
      }

      const category = await autoCategoryForMerchant(userId, merchant);
      const importHash = makeImportHash(userId, date, merchant, amount, account);

      toInsert.push({
        userId,
        date,
        amount,
        category,
        merchant,
        account,
        note,
        source: toStr(source) || "csv",
        importHash,
      });
    }

    if (toInsert.length === 0) {
      return res.json({ inserted: 0, skipped });
    }

    // manual dedupe
    const hashes = toInsert.map((r) => r.importHash);

    const existing = await prisma.transaction.findMany({
      where: { userId, importHash: { in: hashes } },
      select: { importHash: true },
    });

    const existingSet = new Set(existing.map((x) => x.importHash));
    const newRows = toInsert.filter((r) => !existingSet.has(r.importHash));

    let inserted = 0;
    if (newRows.length) {
      const result = await prisma.transaction.createMany({ data: newRows });
      inserted = Number(result?.count ?? 0);
    }

    const deduped = toInsert.length - newRows.length;
    return res.json({ inserted, skipped: skipped + deduped });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Transactions
---------------------------- */
app.get(`${API}/transactions`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const items = await prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json({ transactions: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/transactions`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { date, amount, category, merchant, account, note } = req.body || {};
    if (!date || amount == null) return res.status(400).json({ error: "date and amount required" });

    let finalCategory = String(category || "");
    if (!finalCategory || finalCategory.toLowerCase() === "uncategorized") {
      finalCategory = await autoCategoryForMerchant(userId, merchant);
    }

    const created = await prisma.transaction.create({
      data: {
        userId,
        date: String(date),
        amount: Number(amount),
        category: finalCategory || "Uncategorized",
        merchant: String(merchant || ""),
        account: String(account || ""),
        note: String(note || ""),
        source: "manual",
      },
    });

    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put(`${API}/transactions/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const { date, amount, category, merchant, account, note } = req.body || {};

    // if merchant changes and category is not explicitly set, re-auto-categorize
    let nextCategory = category;
    const catStr = category == null ? "" : String(category);
    const shouldAuto = merchant != null && (!catStr || catStr.toLowerCase() === "uncategorized");

    if (shouldAuto) {
      nextCategory = await autoCategoryForMerchant(userId, merchant);
    }

    const updated = await prisma.transaction.updateMany({
      where: { id, userId },
      data: {
        ...(date != null ? { date: String(date) } : {}),
        ...(amount != null ? { amount: Number(amount) } : {}),
        ...(nextCategory != null ? { category: String(nextCategory) } : {}),
        ...(merchant != null ? { merchant: String(merchant) } : {}),
        ...(account != null ? { account: String(account) } : {}),
        ...(note != null ? { note: String(note) } : {}),
      },
    });

    if (updated.count === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete(`${API}/transactions/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await prisma.transaction.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Budgets
---------------------------- */
app.get(`${API}/budgets`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Optional: filter by month if provided
    const month = req.query?.month ? String(req.query.month) : null;

    const where = { userId, ...(month ? { month } : {}) };

    const items = await prisma.budget.findMany({
      where,
      orderBy: [{ month: "desc" }, { category: "asc" }],
    });

    res.json({ budgets: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Save a whole month’s budget (array of { category, amount })
app.post(`${API}/budgets/save`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { month, items } = req.body || {};
    if (!month || !Array.isArray(items)) return res.status(400).json({ error: "month and items required" });

    await prisma.budget.deleteMany({ where: { userId, month: String(month) } });

    if (items.length) {
      await prisma.budget.createMany({
        data: items.map((it) => ({
          userId,
          month: String(month),
          category: String(it.category || ""),
          amount: Number(it.amount || 0),
        })),
      });
    }

    const saved = await prisma.budget.findMany({ where: { userId, month: String(month) } });
    res.json({ budgets: saved });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Categories
---------------------------- */
app.get(`${API}/categories`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const items = await prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } });
    res.json({ categories: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/categories`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const created = await prisma.category.create({ data: { userId, name: String(name) } });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete(`${API}/categories/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await prisma.category.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Rules
---------------------------- */
app.get(`${API}/rules`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const items = await prisma.rule.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    res.json({ rules: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/rules`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { match, category } = req.body || {};
    if (!match || !category) return res.status(400).json({ error: "match and category required" });

    const created = await prisma.rule.create({
      data: { userId, match: String(match).toLowerCase(), category: String(category) },
    });

    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete(`${API}/rules/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await prisma.rule.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Recurring (monthly only)
---------------------------- */
app.get(`${API}/recurring`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const items = await prisma.recurring.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    res.json({ recurring: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/recurring`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name, amount, category, merchant, account, note, dayOfMonth } = req.body || {};
    if (!name || amount == null || !dayOfMonth) {
      return res.status(400).json({ error: "name, amount, dayOfMonth required" });
    }

    const dom = Math.max(1, Math.min(28, Number(dayOfMonth)));

    const created = await prisma.recurring.create({
      data: {
        userId,
        name: String(name),
        amount: Number(amount),
        category: String(category || ""),
        merchant: String(merchant || ""),
        account: String(account || ""),
        note: String(note || ""),
        dayOfMonth: dom,
        isActive: true,
      },
    });

    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/recurring/:id/toggle`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const r = await prisma.recurring.findFirst({ where: { id, userId } });
    if (!r) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.recurring.update({ where: { id }, data: { isActive: !r.isActive } });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete(`${API}/recurring/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await prisma.recurring.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Generate recurring transactions for a month (YYYY-MM)
// UPDATED: manual dedupe (no skipDuplicates)
app.post(`${API}/recurring/generate`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { month } = req.body || {};
    if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ error: "month must be YYYY-MM" });
    }

    const items = await prisma.recurring.findMany({
      where: { userId, isActive: true },
    });

    const rows = items.map((r) => {
      const dd = String(Math.max(1, Math.min(28, r.dayOfMonth))).padStart(2, "0");
      const date = `${month}-${dd}`;
      const importHash = `recurring:${r.id}:${date}`;
      return {
        userId,
        date,
        amount: Number(r.amount),
        category: r.category || "",
        merchant: r.merchant || "",
        account: r.account || "",
        note: r.note || "",
        source: "recurring",
        recurringId: r.id,
        importHash,
      };
    });

    if (!rows.length) return res.json({ ok: true, generated: 0 });

    const hashes = rows.map((r) => r.importHash);

    const existing = await prisma.transaction.findMany({
      where: { userId, importHash: { in: hashes } },
      select: { importHash: true },
    });

    const existingSet = new Set(existing.map((x) => x.importHash));
    const newRows = rows.filter((r) => !existingSet.has(r.importHash));

    if (newRows.length) {
      await prisma.transaction.createMany({ data: newRows });
    }

    res.json({ ok: true, generated: newRows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   Subscriptions / Bills
---------------------------- */
function normalizeMerchantKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .slice(0, 80);
}

app.get(`${API}/subscriptions/candidates`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const lookbackDays = Math.max(30, Math.min(365, Number(req.query.days || 180)));
    const fromIso = isoDate(addDays(new Date(), -lookbackDays));
    const toIso = isoDate(new Date());

    const tx = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: fromIso, lte: toIso },
        merchant: { not: "" },
      },
      select: { date: true, amount: true, merchant: true, category: true, account: true },
      orderBy: { date: "asc" },
    });

    const ignored = await prisma.subscriptionIgnore.findMany({
      where: { userId },
      select: { merchantKey: true },
    });
    const ignoredSet = new Set(ignored.map((x) => x.merchantKey));

    const existing = await prisma.subscription.findMany({
      where: { userId },
      select: { merchantKey: true },
    });
    const existingSet = new Set(existing.map((x) => x.merchantKey));

    const groups = new Map();
    for (const t of tx) {
      const key = normalizeMerchantKey(t.merchant);
      if (!key) continue;
      if (ignoredSet.has(key)) continue;
      if (existingSet.has(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    function daysBetween(a, b) {
      const da = parseIsoDate(a);
      const db = parseIsoDate(b);
      if (!da || !db) return 0;
      return Math.round((db - da) / (1000 * 60 * 60 * 24));
    }

    function median(nums) {
      const arr = nums.slice().sort((a, b) => a - b);
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    }

    function cadenceFromMedianGap(gap) {
      if (!Number.isFinite(gap) || gap <= 0) return "unknown";
      if (gap >= 5 && gap <= 10) return "weekly";
      if (gap >= 20 && gap <= 45) return "monthly";
      if (gap >= 70 && gap <= 110) return "quarterly";
      if (gap >= 330 && gap <= 400) return "yearly";
      return "unknown";
    }

    const candidates = [];

    for (const [merchantKey, items] of groups.entries()) {
      if (items.length < 2) continue;

      const first = items[0];
      const last = items[items.length - 1];
      const spanDays = daysBetween(first.date, last.date);
      if (spanDays < 20) continue;

      const gaps = [];
      for (let i = 1; i < items.length; i++) gaps.push(daysBetween(items[i - 1].date, items[i].date));
      const medGap = median(gaps);
      const cadence = cadenceFromMedianGap(medGap);

      const amts = items.map((x) => Number(x.amount || 0)).filter((n) => Number.isFinite(n));
      if (amts.length < 2) continue;
      const expectedAmount = median(amts);

      let confidence = 30;
      if (items.length >= 3) confidence += 20;
      if (cadence !== "unknown") confidence += 30;
      if (Math.abs(expectedAmount) >= 5) confidence += 10;
      confidence = Math.max(0, Math.min(100, confidence));

      candidates.push({
        merchantKey,
        displayName: items[0].merchant,
        cadence,
        expectedAmount,
        amountMin: Math.min(...amts),
        amountMax: Math.max(...amts),
        lastDate: last.date,
        nextDate: null,
        confidence,
        kind: "subscription",
        categoryId: null,
        notes: null,
      });
    }

    candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    res.json({ candidates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(`${API}/subscriptions`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const items = await prisma.subscription.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    res.json({ subscriptions: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/subscriptions`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const {
      merchantKey,
      displayName,
      cadence = "unknown",
      expectedAmount,
      amountMin,
      amountMax,
      lastDate,
      nextDate,
      confidence = 0,
      isActive = true,
      kind = "subscription",
      categoryId,
      notes,
    } = req.body || {};

    const key = normalizeMerchantKey(merchantKey || displayName);
    if (!key) return res.status(400).json({ error: "merchantKey or displayName required" });

    const saved = await prisma.subscription.upsert({
      where: { userId_merchantKey: { userId, merchantKey: key } },
      update: {
        displayName: String(displayName || key),
        cadence: String(cadence || "unknown"),
        expectedAmount: expectedAmount == null ? null : Number(expectedAmount),
        amountMin: amountMin == null ? null : Number(amountMin),
        amountMax: amountMax == null ? null : Number(amountMax),
        lastDate: lastDate == null ? null : String(lastDate),
        nextDate: nextDate == null ? null : String(nextDate),
        confidence: Number(confidence || 0),
        isActive: Boolean(isActive),
        kind: String(kind || "subscription"),
        categoryId: categoryId == null ? null : String(categoryId),
        notes: notes == null ? null : String(notes),
      },
      create: {
        userId,
        merchantKey: key,
        displayName: String(displayName || key),
        cadence: String(cadence || "unknown"),
        expectedAmount: expectedAmount == null ? null : Number(expectedAmount),
        amountMin: amountMin == null ? null : Number(amountMin),
        amountMax: amountMax == null ? null : Number(amountMax),
        lastDate: lastDate == null ? null : String(lastDate),
        nextDate: nextDate == null ? null : String(nextDate),
        confidence: Number(confidence || 0),
        isActive: Boolean(isActive),
        kind: String(kind || "subscription"),
        categoryId: categoryId == null ? null : String(categoryId),
        notes: notes == null ? null : String(notes),
      },
    });

    res.json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch(`${API}/subscriptions/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const patch = req.body || {};

    const updated = await prisma.subscription.updateMany({
      where: { id, userId },
      data: {
        ...(patch.displayName != null ? { displayName: String(patch.displayName) } : {}),
        ...(patch.cadence != null ? { cadence: String(patch.cadence) } : {}),
        ...(patch.expectedAmount !== undefined
          ? { expectedAmount: patch.expectedAmount == null ? null : Number(patch.expectedAmount) }
          : {}),
        ...(patch.amountMin !== undefined ? { amountMin: patch.amountMin == null ? null : Number(patch.amountMin) } : {}),
        ...(patch.amountMax !== undefined ? { amountMax: patch.amountMax == null ? null : Number(patch.amountMax) } : {}),
        ...(patch.lastDate !== undefined ? { lastDate: patch.lastDate == null ? null : String(patch.lastDate) } : {}),
        ...(patch.nextDate !== undefined ? { nextDate: patch.nextDate == null ? null : String(patch.nextDate) } : {}),
        ...(patch.confidence != null ? { confidence: Number(patch.confidence) } : {}),
        ...(patch.isActive != null ? { isActive: Boolean(patch.isActive) } : {}),
        ...(patch.kind != null ? { kind: String(patch.kind) } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId == null ? null : String(patch.categoryId) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes == null ? null : String(patch.notes) } : {}),
      },
    });

    if (updated.count === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete(`${API}/subscriptions/:id`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    const deleted = await prisma.subscription.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post(`${API}/subscriptions/ignore`, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { merchantKey } = req.body || {};
    const key = normalizeMerchantKey(merchantKey);
    if (!key) return res.status(400).json({ error: "merchantKey required" });

    await prisma.subscriptionIgnore.upsert({
      where: { userId_merchantKey: { userId, merchantKey: key } },
      update: {},
      create: { userId, merchantKey: key },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------------------
   AI (stub)
---------------------------- */
app.get(`${API}/ai/suggest-rule`, requireAuth, async (req, res) => {
  const { transactionId } = req.query || {};
  if (!transactionId) return res.status(400).json({ error: "transactionId required" });

  res.json({
    match: "amazon",
    category: "Shopping",
    confidence: 0.55,
    reasoning: "Stub suggestion (AI route not implemented yet).",
  });
});

/* ---------------------------
   Start server
---------------------------- */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ API running on http://localhost:${PORT}`);
  console.log(`✅ CLIENT_ORIGIN = ${CLIENT_ORIGIN}`);

  if (CLIENT_ORIGIN.includes('"') || CLIENT_ORIGIN.includes("\n")) {
    console.warn("⚠️ Your CLIENT_ORIGIN env looks malformed. Use: CLIENT_ORIGIN=http://localhost:5173");
  }
});
