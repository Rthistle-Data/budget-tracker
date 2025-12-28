// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import Database from "better-sqlite3";
import SqliteStoreFactory from "better-sqlite3-session-store";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import {
  toISODate,
  addDays,
  expandRecurring,
  buildTimeline,
  summarize,
} from "./forecast.js";

const app = express();
app.set("trust proxy", 1);

// --------------------
// Env
// --------------------
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL. For SQLite, set DATABASE_URL="file:./dev.db" in server/.env (or file:/var/data/budget.db on Render).'
  );
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

// --------------------
// Prisma (SQLite adapter)
// --------------------
const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// --------------------
// Middleware
// --------------------
app.use(express.json());

// --------------------
// CORS
// --------------------
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || "").trim(); // e.g. https://balanceary.app

const DEV_ALLOWED = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl / server-to-server
  if (!IS_PROD) return DEV_ALLOWED.has(origin) || origin === CLIENT_ORIGIN;
  return origin === CLIENT_ORIGIN;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// --------------------
// Sessions: persistent SQLite store
// --------------------
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";
const SESSIONS_DB_PATH =
  process.env.SESSIONS_DB_PATH ||
  (IS_PROD ? "/var/data/sessions.db" : "./sessions.db");

const SqliteStore = SqliteStoreFactory(session);
const sessionDb = new Database(SESSIONS_DB_PATH);

try {
  sessionDb.pragma("journal_mode = WAL");
  sessionDb.pragma("synchronous = NORMAL");
} catch {
  // ignore
}

app.use(
  session({
    store: new SqliteStore({ client: sessionDb }),
    name: "budget.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

// --------------------
// Helpers
// --------------------
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not logged in" });
  next();
}

function rotateSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Try again later." },
});

function normalizeMerchant(desc) {
  return String(desc || "")
    .toLowerCase()
    .replace(/(sq\*|paypal|visa|mastercard|debit|credit)/g, "")
    .replace(/\b(inc|ltd|corp|co)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function daysBetween(a, b) {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function prismaMissingTableError(e) {
  // Prisma "table does not exist" is often P2021
  return e?.code === "P2021" || String(e?.message || "").includes("does not exist");
}

function subscriptionsNotReady(res, e) {
  console.error("Subscriptions tables missing / not migrated:", e);
  return res.status(500).json({
    error:
      "Subscriptions tables are not in your database yet. Run Prisma migrate to create them (see terminal instructions).",
    code: e?.code || "SUBSCRIPTIONS_NOT_MIGRATED",
  });
}

// --------------------
// OpenAI (optional)
// --------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// --------------------
// Health
// --------------------
app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

app.get("/api/db-health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// --------------------
// Auth
// --------------------
app.get("/api/auth/me", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.json({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });

    res.json({ user: user || null });
  } catch (err) {
    console.error("GET /api/auth/me failed:", err);
    res.status(500).json({ error: "Failed to load session" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be 8+ chars" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    await rotateSession(req, user.id);
    res.status(201).json({ user });
  } catch (err) {
    console.error("POST /api/auth/register failed:", err);
    res.status(409).json({ error: "Email already in use" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await rotateSession(req, user.id);
    res.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
  } catch (err) {
    console.error("POST /api/auth/login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --------------------
// Password recovery (prints reset link to console)
// --------------------
app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    res.json({ ok: true });
    if (!email.includes("@")) return;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const token = makeToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt, usedAt: null },
    });

    const base = CLIENT_ORIGIN || "http://localhost:5173";
    const resetUrl = `${base}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

    console.log("\n=== Password Reset Link ===");
    console.log(resetUrl);
    console.log("===========================\n");
  } catch (err) {
    console.error("POST /api/auth/forgot-password failed:", err);
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required" });
    if (!token) return res.status(400).json({ error: "Token required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be 8+ chars" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid reset link" });

    const tokenHash = hashToken(token);
    const now = new Date();

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
    });
    if (!record) return res.status(400).json({ error: "Invalid or expired reset link" });

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    ]);

    await rotateSession(req, user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/reset-password failed:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

// --------------------
// Profile
// --------------------
app.post("/api/profile/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (newPassword.length < 8) return res.status(400).json({ error: "New password must be 8+ chars" });

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/profile/change-password failed:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// --------------------
// Categories
// --------------------
app.get("/api/categories", requireAuth, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.session.userId },
      orderBy: { name: "asc" },
    });
    res.json({ categories });
  } catch (err) {
    console.error("GET /api/categories failed:", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

app.post("/api/categories", requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name required" });

    const existing = await prisma.category.findFirst({
      where: { userId: req.session.userId, name },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: "Category already exists" });

    const category = await prisma.category.create({
      data: { userId: req.session.userId, name },
    });

    res.status(201).json({ category });
  } catch (err) {
    console.error("POST /api/categories failed:", err);
    res.status(500).json({ error: "Failed to add category" });
  }
});

app.delete("/api/categories/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.category.deleteMany({ where: { id, userId: req.session.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/categories/:id failed:", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// --------------------
// Rules
// --------------------
app.get("/api/rules", requireAuth, async (req, res) => {
  try {
    const rules = await prisma.rule.findMany({
      where: { userId: req.session.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ rules });
  } catch (err) {
    console.error("GET /api/rules failed:", err);
    res.status(500).json({ error: "Failed to load rules" });
  }
});

app.post("/api/rules", requireAuth, async (req, res) => {
  try {
    const match = String(req.body.match ?? "").trim().toLowerCase();
    const category = String(req.body.category ?? "").trim();

    if (!match) return res.status(400).json({ error: "match is required" });
    if (!category) return res.status(400).json({ error: "category is required" });

    const rule = await prisma.rule.create({
      data: { userId: req.session.userId, match, category },
    });

    res.status(201).json({ rule });
  } catch (err) {
    console.error("POST /api/rules failed:", err);
    res.status(500).json({ error: "Failed to add rule" });
  }
});

app.delete("/api/rules/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.rule.deleteMany({ where: { id, userId: req.session.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/rules/:id failed:", err);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

// --------------------
// Budgets
// --------------------
app.get("/api/budgets", requireAuth, async (req, res) => {
  try {
    const month = String(req.query.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });

    const budgets = await prisma.budget.findMany({
      where: { userId: req.session.userId, month },
      orderBy: [{ category: "asc" }],
    });

    res.json({ budgets });
  } catch (err) {
    console.error("GET /api/budgets failed:", err);
    res.status(500).json({ error: "Failed to load budgets" });
  }
});

app.post("/api/budgets", requireAuth, async (req, res) => {
  try {
    const month = String(req.body.month || "").trim();
    const category = String(req.body.category || "").trim();
    const amount = Number(req.body.amount);

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });
    if (!category) return res.status(400).json({ error: "category is required" });
    if (!Number.isFinite(amount)) return res.status(400).json({ error: "amount must be a number" });

    const existing = await prisma.budget.findFirst({
      where: { userId: req.session.userId, month, category },
      select: { id: true },
    });

    const budget = existing
      ? await prisma.budget.update({ where: { id: existing.id }, data: { amount } })
      : await prisma.budget.create({ data: { userId: req.session.userId, month, category, amount } });

    res.status(201).json({ budget });
  } catch (err) {
    console.error("POST /api/budgets failed:", err);
    res.status(500).json({ error: "Failed to save budget" });
  }
});

// --------------------
// Transactions
// --------------------
app.get("/api/transactions", requireAuth, async (req, res) => {
  try {
    const month = String(req.query.month || "").trim();
    const baseWhere = { userId: req.session.userId };

    const txWhere =
      month && /^\d{4}-\d{2}$/.test(month) ? { ...baseWhere, date: { startsWith: `${month}-` } } : baseWhere;

    const transactions = await prisma.transaction.findMany({
      where: txWhere,
      orderBy: { date: "desc" },
    });

    res.json({ transactions });
  } catch (err) {
    console.error("GET /api/transactions failed:", err);
    res.status(500).json({ error: "Failed to load transactions" });
  }
});

app.post("/api/transactions", requireAuth, async (req, res) => {
  try {
    const date = String(req.body.date || "").trim();
    const amount = Number(req.body.amount);
    const category = String(req.body.category || "").trim();
    const merchant = String(req.body.merchant || "").trim();
    const account = String(req.body.account || "").trim();
    const note = String(req.body.note || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    if (!Number.isFinite(amount)) return res.status(400).json({ error: "amount must be a number" });

    const transaction = await prisma.transaction.create({
      data: {
        userId: req.session.userId,
        date,
        amount,
        category: category || "Uncategorized",
        merchant: merchant || "Unknown",
        account: account || "Default",
        note,
        source: "manual",
      },
    });

    res.status(201).json({ transaction });
  } catch (err) {
    console.error("POST /api/transactions failed:", err);
    res.status(500).json({ error: "Failed to add transaction" });
  }
});

app.put("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);

    const patch = {};
    if (req.body.date != null) {
      const v = String(req.body.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      patch.date = v;
    }
    if (req.body.amount != null) {
      const v = Number(req.body.amount);
      if (!Number.isFinite(v)) return res.status(400).json({ error: "amount must be a number" });
      patch.amount = v;
    }
    if (req.body.category != null) patch.category = String(req.body.category).trim();
    if (req.body.merchant != null) patch.merchant = String(req.body.merchant).trim();
    if (req.body.account != null) patch.account = String(req.body.account).trim();
    if (req.body.note != null) patch.note = String(req.body.note).trim();

    const updated = await prisma.transaction.updateMany({
      where: { id, userId: req.session.userId },
      data: patch,
    });

    if (updated.count === 0) return res.status(404).json({ error: "Transaction not found" });

    const transaction = await prisma.transaction.findFirst({ where: { id, userId: req.session.userId } });
    res.json({ transaction });
  } catch (err) {
    console.error("PUT /api/transactions/:id failed:", err);
    res.status(500).json({ error: "Failed to update transaction" });
  }
});

app.delete("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.transaction.deleteMany({ where: { id, userId: req.session.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transactions/:id failed:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// --------------------
// Recurring
// --------------------
app.get("/api/recurring", requireAuth, async (req, res) => {
  try {
    const recurring = await prisma.recurring.findMany({
      where: { userId: req.session.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ recurring });
  } catch (err) {
    console.error("GET /api/recurring failed:", err);
    res.status(500).json({ error: "Failed to load recurring" });
  }
});

app.post("/api/recurring", requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const amount = Number(req.body.amount);
    const category = String(req.body.category || "").trim();
    const merchant = String(req.body.merchant || "").trim();
    const account = String(req.body.account || "").trim();
    const note = String(req.body.note || "").trim();
    const dayOfMonth = Number(req.body.dayOfMonth);
    const isActive = req.body.isActive == null ? true : Boolean(req.body.isActive);

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Number.isFinite(amount)) return res.status(400).json({ error: "amount must be a number" });
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
      return res.status(400).json({ error: "dayOfMonth must be 1..28" });
    }

    const rec = await prisma.recurring.create({
      data: {
        userId: req.session.userId,
        name,
        amount,
        category: category || "Uncategorized",
        merchant: merchant || "Unknown",
        account: account || "Default",
        note,
        dayOfMonth,
        isActive,
      },
    });

    res.status(201).json({ recurring: rec });
  } catch (err) {
    console.error("POST /api/recurring failed:", err);
    res.status(500).json({ error: "Failed to add recurring" });
  }
});

app.patch("/api/recurring/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const isActive = Boolean(req.body.isActive);

    const updated = await prisma.recurring.updateMany({
      where: { id, userId: req.session.userId },
      data: { isActive },
    });

    if (updated.count === 0) return res.status(404).json({ error: "Recurring not found" });

    const recurring = await prisma.recurring.findFirst({ where: { id, userId: req.session.userId } });
    res.json({ recurring });
  } catch (err) {
    console.error("PATCH /api/recurring/:id failed:", err);
    res.status(500).json({ error: "Failed to update recurring" });
  }
});

app.delete("/api/recurring/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.recurring.deleteMany({ where: { id, userId: req.session.userId } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/recurring/:id failed:", err);
    res.status(500).json({ error: "Failed to delete recurring" });
  }
});

app.post("/api/recurring/generate", requireAuth, async (req, res) => {
  try {
    const month = String(req.query.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });

    const recurring = await prisma.recurring.findMany({
      where: { userId: req.session.userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const created = [];
    for (const r of recurring) {
      const day = Math.min(r.dayOfMonth, 28);
      const date = `${month}-${String(day).padStart(2, "0")}`;

      const importHash = crypto
        .createHash("sha256")
        .update(`${req.session.userId}|recurring|${r.id}|${month}`)
        .digest("hex");

      const exists = await prisma.transaction.findFirst({
        where: { userId: req.session.userId, importHash },
        select: { id: true },
      });
      if (exists) continue;

      const tx = await prisma.transaction.create({
        data: {
          userId: req.session.userId,
          date,
          amount: r.amount,
          category: r.category,
          merchant: r.merchant,
          account: r.account,
          note: r.note,
          source: "recurring",
          recurringId: r.id,
          importHash,
        },
      });

      created.push(tx);
    }

    res.json({ ok: true, createdCount: created.length, created });
  } catch (err) {
    console.error("POST /api/recurring/generate failed:", err);
    res.status(500).json({ error: "Failed to generate recurring" });
  }
});

// --------------------
// Subscriptions & Bills
// --------------------

// Detect candidates from transactions (merchant-based)
app.get("/api/subscriptions/candidates", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const txs = await prisma.transaction.findMany({
      where: { userId, amount: { lt: 0 } },
      orderBy: { date: "asc" },
    });

    // If the ignore table doesn't exist yet, just treat as none ignored (don’t crash)
    let ignoredKeys = new Set();
    try {
      const ignored = await prisma.subscriptionIgnore.findMany({
        where: { userId },
        select: { merchantKey: true },
      });
      ignoredKeys = new Set(ignored.map((i) => i.merchantKey));
    } catch (e) {
      if (!prismaMissingTableError(e)) throw e;
    }

    const groups = {};
    for (const t of txs) {
      // ✅ FIX: model uses merchant (not description)
      const key = normalizeMerchant(t.merchant || "");
      if (!key || ignoredKeys.has(key)) continue;
      groups[key] ||= [];
      groups[key].push(t);
    }

    const candidates = [];

    for (const [merchantKey, items] of Object.entries(groups)) {
      if (items.length < 3) continue;

      const gaps = [];
      for (let i = 1; i < items.length; i++) {
        gaps.push(daysBetween(items[i].date, items[i - 1].date));
      }

      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

      // monthly-ish window
      if (avgGap < 25 || avgGap > 35) continue;

      const amounts = items
        .map((i) => Math.abs(Number(i.amount) || 0))
        .filter((n) => n > 0);

      if (!amounts.length) continue;

      const min = Math.min(...amounts);
      const max = Math.max(...amounts);

      // within 25% variance
      if (min > 0 && max / min > 1.25) continue;

      const confidence =
        50 + Math.min(30, items.length * 5) + Math.max(0, 20 - Math.abs(30 - avgGap));

      candidates.push({
        merchantKey,
        displayName: merchantKey.replace(/\b\w/g, (l) => l.toUpperCase()),
        cadence: "monthly",
        expectedAmount: Number((amounts.reduce((a, b) => a + b, 0) / amounts.length).toFixed(2)),
        lastDate: items[items.length - 1].date,
        confidence: Math.min(100, Math.round(confidence)),
      });
    }

    res.json({ candidates });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("GET /api/subscriptions/candidates failed:", e);
    res.status(500).json({ error: "Failed to compute candidates" });
  }
});

// List saved subscriptions/bills
app.get("/api/subscriptions", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ subscriptions });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("GET /api/subscriptions failed:", e);
    res.status(500).json({ error: "Failed to load subscriptions" });
  }
});

// Create or update by unique (userId, merchantKey)
app.post("/api/subscriptions", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const payload = req.body || {};
    const merchantKey = String(payload.merchantKey || "").trim();
    if (!merchantKey) return res.status(400).json({ error: "merchantKey required" });

    const data = {
      userId,
      merchantKey,
      displayName: payload.displayName ? String(payload.displayName) : merchantKey,
      cadence: payload.cadence ? String(payload.cadence) : "unknown",
      expectedAmount: payload.expectedAmount == null ? null : Number(payload.expectedAmount),
      amountMin: payload.amountMin == null ? null : Number(payload.amountMin),
      amountMax: payload.amountMax == null ? null : Number(payload.amountMax),
      lastDate: payload.lastDate ? String(payload.lastDate) : null,
      nextDate: payload.nextDate ? String(payload.nextDate) : null,
      confidence: payload.confidence == null ? 0 : Number(payload.confidence),
      isActive: payload.isActive == null ? true : Boolean(payload.isActive),
      kind: payload.kind ? String(payload.kind) : "subscription",
      categoryId: payload.categoryId ? String(payload.categoryId) : null,
      notes: payload.notes ? String(payload.notes) : null,
    };

    const subscription = await prisma.subscription.upsert({
      where: { userId_merchantKey: { userId, merchantKey } },
      create: data,
      update: data,
    });

    res.json({ subscription });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("POST /api/subscriptions failed:", e);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// Patch fields
app.patch("/api/subscriptions/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = String(req.params.id);

    const patch = req.body || {};
    const allowed = [
      "displayName",
      "cadence",
      "expectedAmount",
      "amountMin",
      "amountMax",
      "lastDate",
      "nextDate",
      "confidence",
      "isActive",
      "kind",
      "categoryId",
      "notes",
    ];

    const data = {};
    for (const k of allowed) {
      if (patch[k] === undefined) continue;
      if (k === "expectedAmount" || k === "amountMin" || k === "amountMax") {
        data[k] = patch[k] == null ? null : Number(patch[k]);
      } else if (k === "confidence") {
        data[k] = patch[k] == null ? 0 : Number(patch[k]);
      } else if (k === "isActive") {
        data[k] = Boolean(patch[k]);
      } else if (k === "lastDate" || k === "nextDate") {
        data[k] = patch[k] ? String(patch[k]) : null;
      } else {
        data[k] = patch[k] == null ? null : String(patch[k]);
      }
    }

    const updated = await prisma.subscription.updateMany({
      where: { id, userId },
      data,
    });

    if (!updated.count) return res.status(404).json({ error: "Not found" });

    const subscription = await prisma.subscription.findFirst({ where: { id, userId } });
    res.json({ subscription });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("PATCH /api/subscriptions/:id failed:", e);
    res.status(500).json({ error: "Failed to update subscription" });
  }
});

app.delete("/api/subscriptions/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = String(req.params.id);

    await prisma.subscription.deleteMany({ where: { id, userId } });
    res.json({ ok: true });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("DELETE /api/subscriptions/:id failed:", e);
    res.status(500).json({ error: "Failed to delete subscription" });
  }
});

// Ignore merchantKey (stop showing in candidates)
app.post("/api/subscriptions/ignore", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const merchantKey = String(req.body?.merchantKey || "").trim();
    if (!merchantKey) return res.status(400).json({ error: "merchantKey required" });

    await prisma.subscriptionIgnore.upsert({
      where: { userId_merchantKey: { userId, merchantKey } },
      create: { userId, merchantKey },
      update: {}, // nothing
    });

    res.json({ ok: true });
  } catch (e) {
    if (prismaMissingTableError(e)) return subscriptionsNotReady(res, e);
    console.error("POST /api/subscriptions/ignore failed:", e);
    res.status(500).json({ error: "Failed to ignore merchant" });
  }
});

// --------------------
// CSV Import (same logic you had)
// --------------------
function toStr(v) {
  return v == null ? "" : String(v).trim();
}
function parseAmount(v) {
  const s = toStr(v).replace(/[$,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normalizeDateToYMD(v, monthHint) {
  const s = toStr(v);
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replaceAll("/", "-");

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    const y = Number(m[3]);
    let mm = a;
    let dd = b;
    if (a > 12 && b <= 12) {
      dd = a;
      mm = b;
    }
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  if (/^\d{1,2}$/.test(s) && monthHint && /^\d{4}-\d{2}$/.test(monthHint)) {
    return `${monthHint}-${String(Number(s)).padStart(2, "0")}`;
  }

  return "";
}

app.post("/api/import/csv/dry-run", requireAuth, async (req, res) => {
  try {
    const month = String(req.body.month || "").trim();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const mapping = req.body.mapping || {};

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month is required (YYYY-MM)" });
    if (!rows.length) return res.status(400).json({ error: "rows is required" });
    if (!mapping?.date || !mapping?.amount) {
      return res.status(400).json({ error: "mapping.date and mapping.amount are required" });
    }

    const preview = [];
    let okCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const dateRaw = r[mapping.date];
      const amountRaw = r[mapping.amount];
      const descRaw = mapping.description ? r[mapping.description] : "";

      const date = normalizeDateToYMD(dateRaw, month);
      const amount = parseAmount(amountRaw);
      const merchant = toStr(descRaw) || "Unknown";

      const good = /^\d{4}-\d{2}-\d{2}$/.test(date) && amount != null;
      if (good) okCount++;

      preview.push({
        row: i + 1,
        ok: good,
        date,
        amount,
        merchant,
        raw: { date: dateRaw, amount: amountRaw, description: descRaw },
      });
    }

    res.json({ ok: true, total: rows.length, okCount, preview: preview.slice(0, 50) });
  } catch (err) {
    console.error("POST /api/import/csv/dry-run failed:", err);
    res.status(500).json({ error: "Dry run failed" });
  }
});

app.post("/api/import/csv", requireAuth, async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const source = String(req.body.source || "csv").trim();

    if (!rows.length) return res.status(400).json({ error: "rows is required" });

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      const date = normalizeDateToYMD(r.date, "");
      const amount = parseAmount(r.amount ?? r.Amount ?? r.AMOUNT);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || amount == null) {
        skipped++;
        continue;
      }

      const category = toStr(r.category) || "Uncategorized";
      const merchant = toStr(r.merchant) || toStr(r.description) || "Unknown";
      const account = toStr(r.account) || "Default";
      const note = toStr(r.note) || "";

      const importHash = crypto
        .createHash("sha256")
        .update(`${req.session.userId}|${source}|${date}|${amount}|${category}|${merchant}|${account}|${note}`)
        .digest("hex");

      const exists = await prisma.transaction.findFirst({
        where: { userId: req.session.userId, importHash },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }

      await prisma.transaction.create({
        data: {
          userId: req.session.userId,
          date,
          amount,
          category,
          merchant,
          account,
          note,
          source,
          importHash,
        },
      });
      inserted++;
    }

    res.json({ ok: true, inserted, skipped });
  } catch (err) {
    console.error("POST /api/import/csv failed:", err);
    res.status(500).json({ error: "Import failed" });
  }
});

// --------------------
// Insights (unchanged)
// --------------------
app.get("/insights", async (req, res) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.session.userId;
    const month = String(req.query.month || "").trim();

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

    const start = `${month}-01`;
    const endMonth = (() => {
      const [y, m] = month.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1, 1));
      d.setUTCMonth(d.getUTCMonth() + 1);
      const yy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${yy}-${mm}`;
    })();
    const end = `${endMonth}-01`;

    const txns = await prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { date: true, amount: true, category: true },
      orderBy: { date: "asc" },
    });

    const budgets = await prisma.budget.findMany({
      where: { userId, month },
      select: { category: true, amount: true },
    });

    const budgetByCat = new Map();
    for (const b of budgets) budgetByCat.set(b.category, Number(b.amount) || 0);

    let income = 0;
    let expenses = 0;

    const byCategory = new Map();
    const daily = new Map();

    for (const t of txns) {
      const amt = Number(t.amount) || 0;
      const cat = (t.category || "Uncategorized").trim() || "Uncategorized";
      const day = t.date;

      if (!daily.has(day)) daily.set(day, { date: day, income: 0, expenses: 0 });

      if (amt >= 0) {
        income += amt;
        daily.get(day).income += amt;
      } else {
        const out = Math.abs(amt);
        expenses += out;
        daily.get(day).expenses += out;
        byCategory.set(cat, (byCategory.get(cat) || 0) + out);
      }
    }

    const net = income - expenses;

    const daysInMonth = (() => {
      const [y, m] = month.split("-").map(Number);
      return new Date(Date.UTC(y, m, 0)).getUTCDate();
    })();

    const dailySeries = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, "0");
      const key = `${month}-${dd}`;
      dailySeries.push(daily.get(key) || { date: key, income: 0, expenses: 0 });
    }

    const avgDailySpend = daysInMonth ? expenses / daysInMonth : 0;
    const projectedSpend = avgDailySpend * daysInMonth;

    const cats = new Set([...byCategory.keys(), ...budgetByCat.keys()]);
    const byCategoryList = Array.from(cats).map((categoryName) => {
      const spent = byCategory.get(categoryName) || 0;
      const budget = budgetByCat.get(categoryName) || 0;
      const pctUsed = budget > 0 ? (spent / budget) * 100 : null;
      return { categoryName, spent, budget, pctUsed };
    });

    byCategoryList.sort((a, b) => b.spent - a.spent);

    const overBudget = byCategoryList
      .filter((c) => (c.budget || 0) > 0 && c.spent > c.budget)
      .map((c) => ({
        categoryName: c.categoryName,
        spent: c.spent,
        budget: c.budget,
        overBy: c.spent - c.budget,
      }))
      .sort((a, b) => b.overBy - a.overBy);

    res.json({
      month,
      totals: { income, expenses, net, avgDailySpend, projectedSpend },
      byCategory: byCategoryList,
      daily: dailySeries,
      overBudget,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// Forecast (unchanged)
// --------------------
app.get("/api/forecast", async (req, res) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.session.userId;

    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));
    const startISO = toISODate(new Date());
    const endISO = toISODate(addDays(new Date(), days - 1));

    const agg = await prisma.transaction.aggregate({
      where: { userId, date: { lte: startISO } },
      _sum: { amount: true },
    });

    const openingBalance = Number(agg?._sum?.amount || 0);

    const futureTx = await prisma.transaction.findMany({
      where: { userId, date: { gte: startISO, lte: endISO } },
      select: { id: true, date: true, amount: true },
      orderBy: [{ date: "asc" }],
    });

    const txEvents = futureTx.map((t) => ({
      kind: "transaction",
      transactionId: t.id,
      date: t.date,
      amount: Number(t.amount) || 0,
      description: "Transaction",
    }));

    const recurring = await prisma.recurring.findMany({
      where: { userId, isActive: true },
    });

    const recurringEvents = expandRecurring(recurring, startISO, endISO);

    const allEvents = [...txEvents, ...recurringEvents];

    const { timeline, lowestBalance, lowestDate } = buildTimeline({
      startISO,
      days,
      openingBalance,
      events: allEvents,
    });

    const sum = summarize({ startISO, timeline });

    return res.json({
      start: startISO,
      end: endISO,
      days,
      openingBalance,
      lowestBalance,
      lowestDate,
      summary: sum,
      timeline,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Forecast failed" });
  }
});

// --------------------
// AI: Rule suggestion
// --------------------
app.get("/api/ai/suggest-rule", requireAuth, async (req, res) => {
  try {
    if (!openai) return res.status(501).json({ error: "OPENAI_API_KEY not set on server" });

    const transactionId = String(req.query.transactionId || "").trim();
    if (!transactionId) return res.status(400).json({ error: "transactionId is required" });

    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId, userId: req.session.userId },
    });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    const categories = await prisma.category.findMany({
      where: { userId: req.session.userId },
      select: { name: true },
      orderBy: { name: "asc" },
    });

    const prompt = {
      role: "user",
      content: [
        "You are helping create auto-categorization rules for a budget app.",
        "Given a transaction, propose a rule to categorize similar transactions.",
        "Return JSON ONLY with keys: match, category, confidence, reasoning.",
        "match should be a lowercase substring that is likely to appear in merchant/description.",
        `Allowed categories: ${categories.map((c) => c.name).join(", ") || "None"}`,
        `Transaction: merchant="${tx.merchant}", account="${tx.account}", amount=${tx.amount}, currentCategory="${tx.category}"`,
      ].join("\n"),
    };

    const out = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [prompt],
      temperature: 0.2,
    });

    const text = out.choices?.[0]?.message?.content || "{}";
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { match: "", category: "", confidence: 0.0, reasoning: "Model did not return valid JSON." };
    }

    res.json(json);
  } catch (err) {
    console.error("GET /api/ai/suggest-rule failed:", err);
    res.status(500).json({ error: "AI suggestion failed" });
  }
});

// --------------------
// API JSON 404 (prevents <!DOCTYPE html> errors)
// --------------------
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// --------------------
// Global error handler
// --------------------
app.use((err, _req, res, _next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({ error: "Server error" });
});

// --------------------
// Start
// --------------------
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
  console.log(`NODE_ENV: ${NODE_ENV}`);
  console.log(`CLIENT_ORIGIN: ${CLIENT_ORIGIN || "(not set)"}`);
  console.log(`DATABASE_URL: ${DATABASE_URL}`);
  console.log(`SESSIONS_DB_PATH: ${SESSIONS_DB_PATH}`);
});
