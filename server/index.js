import OpenAI from "openai";
import Database from "better-sqlite3";
import express from "express";
import cors from "cors";
import "dotenv/config";
import session from "express-session";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import SqliteStoreFactory from "better-sqlite3-session-store";

import pkg from "@prisma/client";
const { PrismaClient } = pkg;

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const app = express();

// --------------------
// Middleware
// --------------------
app.use(express.json());

// CORS (works with Vite proxy OR direct origin calls)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

// --------------------
// Prisma (Prisma + SQLite adapter)
// --------------------
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
// --------------------
// OpenAI (server-side only)
// --------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";


// --------------------
// Persistent sessions in SQLite
// --------------------
function sqlitePathFromDatabaseUrl(url) {
  // Expect: file:./dev.db or file:/abs/path.db
  if (!url) return "./dev.db";
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}

const sessionDbPath =
  process.env.SESSION_DB_PATH || sqlitePathFromDatabaseUrl(process.env.DATABASE_URL);

// IMPORTANT: better-sqlite3-session-store requires a direct better-sqlite3 client
const sessionDb = new Database(sessionDbPath);
sessionDb.pragma("journal_mode = WAL");

const SqliteStore = SqliteStoreFactory(session);

app.use(
  session({
    store: new SqliteStore({
      client: sessionDb,
      table: "sessions",
    }),
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
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

// session rotation (anti session-fixation)
function rotateSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

// password reset token hashing
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

// rate limit forgot-password
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Try again later." },
});
function normalizeMerchant(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function bestMatchCandidate(merchant) {
  // try to produce a stable substring token (not too broad)
  const m = normalizeMerchant(merchant);
  if (!m) return "";
  const parts = m
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((p) => p.length >= 4 && !/^\d+$/.test(p));

  // prefer first meaningful token (often "amazon", "walmart", "shell", etc.)
  return parts[0] || m.slice(0, 12);
}

// --------------------
// Health
// --------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// --------------------
// Auth
// --------------------

// GET /api/auth/me
app.get("/api/auth/me", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });

  res.json({ user: user || null });
});

// POST /api/auth/register { email, password }
app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email.includes("@")) return res.status(400).json({ error: "Valid email required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be 8+ chars" });

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    await rotateSession(req, user.id);
    res.status(201).json({ user });
  } catch {
    return res.status(409).json({ error: "Email already in use" });
  }
});

// POST /api/auth/login { email, password }
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  await rotateSession(req, user.id);

  res.json({
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
  });
});

// POST /api/auth/logout
app.post("/api/auth/logout", async (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// --------------------
// Password recovery
// --------------------

// POST /api/auth/forgot-password { email }
// Always returns ok to prevent email enumeration.
app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  // Always respond ok
  res.json({ ok: true });

  if (!email.includes("@")) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = makeToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: null,
    },
  });

  const resetUrl = `${CLIENT_ORIGIN}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(
    token
  )}`;

  // Dev: print link in console (replace with email provider later)
  console.log("\n=== Password Reset Link ===");
  console.log(resetUrl);
  console.log("===========================\n");
});

// POST /api/auth/reset-password { email, token, newPassword }
app.post("/api/auth/reset-password", async (req, res) => {
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
    where: {
      userId: user.id,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
  });

  if (!record) return res.status(400).json({ error: "Invalid or expired reset link" });

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
  ]);

  await rotateSession(req, user.id);
  res.json({ ok: true });
});

// --------------------
// Profile
// --------------------

// POST /api/profile/change-password { currentPassword, newPassword }
app.post("/api/profile/change-password", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be 8+ chars" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await rotateSession(req, userId);
  res.json({ ok: true });
});
// --------------------
// AI: Rule suggestion (AI Rule Builder)
// --------------------
// POST /api/ai/rule-suggestion { txId }
// Returns: { match, category, confidence, reason, warnings, exampleMerchants, testHits }
app.post("/api/ai/rule-suggestion", requireAuth, async (req, res) => {
  const userId = req.session.userId;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: "OPENAI_API_KEY not set on server" });
  }

  const txId = String(req.body.txId || "").trim();
  if (!txId) return res.status(400).json({ error: "txId required" });

  const tx = await prisma.transaction.findFirst({
    where: { id: txId, userId },
  });
  if (!tx) return res.status(404).json({ error: "transaction not found" });

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const rules = await prisma.rule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { match: true, category: true },
  });

  // some example merchants to help the model be consistent
  const merchantNorm = normalizeMerchant(tx.merchant);
  const similar = merchantNorm
    ? await prisma.transaction.findMany({
        where: {
          userId,
          merchant: { contains: tx.merchant }, // simple, works with your current schema
        },
        select: { merchant: true },
        take: 8,
        orderBy: { date: "desc" },
      })
    : [];

  const categoryNames = categories.map((c) => c.name);
  const fallbackCategory = categoryNames.includes("Uncategorized") ? "Uncategorized" : (categoryNames[0] || "Uncategorized");

  // If you have no categories yet, still work.
  const safeCategories = categoryNames.length ? categoryNames : ["Uncategorized"];

  // JSON Schema for Structured Outputs (reliable shape) :contentReference[oaicite:2]{index=2}
  const schema = {
    name: "rule_suggestion",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["match", "category", "confidence", "reason", "warnings"],
      properties: {
        match: {
          type: "string",
          description:
            "Lowercase substring to match against merchant text. Keep it specific (usually 4-18 chars). No regex.",
        },
        category: {
          type: "string",
          description: "Must be one of the provided categories.",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence from 0 to 1.",
        },
        reason: {
          type: "string",
          description: "Short explanation for why this rule is suggested.",
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Any caveats (too broad, overlaps, etc.).",
        },
        exampleMerchants: {
          type: "array",
          items: { type: "string" },
          description: "Optional examples of merchant strings this rule should match.",
        },
      },
    },
  };

  const merchantForPrompt = tx.merchant || "";
  const initialHint = bestMatchCandidate(merchantForPrompt);

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: schema,
      },
      messages: [
        {
          role: "system",
          content:
            "You help build budgeting rules. You must output JSON that matches the schema exactly. " +
            "Rules are substring matches on merchant text. Prefer a specific token (not too broad). " +
            "Never output regex. Keep match lowercase.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              transaction: {
                id: tx.id,
                date: tx.date,
                amount: tx.amount,
                merchant: merchantForPrompt,
                category: tx.category || fallbackCategory,
                account: tx.account || "",
                note: tx.note || "",
              },
              categories: safeCategories,
              existingRules: rules.slice(0, 30), // keep prompt small
              merchantExamples: similar.map((x) => x.merchant).filter(Boolean),
              hint: {
                suggestedMatchToken: initialHint,
              },
              goal:
                "Suggest ONE new rule (match + category). Avoid duplicates with existing rules. " +
                "Match should be specific enough to avoid false positives.",
            },
            null,
            2
          ),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let suggestion;
    try {
      suggestion = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    // --- Server-side guardrails ---
    const match = String(suggestion.match || "").trim().toLowerCase();
    const category = String(suggestion.category || "").trim();

    if (!match || match.length < 3) {
      return res.status(422).json({ error: "AI suggestion too weak (match too short)" });
    }
    if (!safeCategories.includes(category)) {
      // force into a safe category instead of failing hard
      suggestion.category = fallbackCategory;
      suggestion.warnings = [...(suggestion.warnings || []), "Suggested category wasn't valid; defaulted to Uncategorized."];
    }

    // Avoid suggesting an identical existing rule
    const dup = rules.find((r) => r.match === match && r.category === suggestion.category);
    if (dup) {
      suggestion.warnings = [...(suggestion.warnings || []), "This rule already exists."];
    }

    // Compute testHits in YOUR DB (how many txns this would affect)
    const testHits = await prisma.transaction.count({
      where: {
        userId,
        merchant: { contains: match, mode: "insensitive" },
      },
    });

    res.json({
      ...suggestion,
      match,
      testHits,
    });
  } catch (e) {
    console.error("AI rule suggestion error:", e);
    res.status(500).json({ error: "AI rule suggestion failed" });
  }
});

// --------------------
// Categories
// --------------------
app.get("/api/categories", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const cats = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
  res.json(cats);
});

app.post("/api/categories", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const clean = String(req.body.name || "").trim();
  if (!clean) return res.status(400).json({ error: "name required" });

  try {
    const created = await prisma.category.create({
      data: { userId, name: clean },
    });
    res.status(201).json(created);
  } catch {
    return res.status(409).json({ error: "category already exists" });
  }
});

app.delete("/api/categories/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const cat = await prisma.category.findFirst({ where: { id, userId } });
  if (!cat) return res.status(404).json({ error: "not found" });

  await prisma.category.delete({ where: { id } });
  res.json({ ok: true });
});

// --------------------
// Rules
// --------------------
app.get("/api/rules", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const rules = await prisma.rule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rules);
});

app.post("/api/rules", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const match = String(req.body.match || "").trim().toLowerCase();
  const category = String(req.body.category || "").trim();

  if (!match || !category) return res.status(400).json({ error: "match and category required" });

  const rule = await prisma.rule.create({
    data: { userId, match, category },
  });

  res.status(201).json(rule);
});

app.delete("/api/rules/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const rule = await prisma.rule.findFirst({ where: { id, userId } });
  if (!rule) return res.status(404).json({ error: "not found" });

  await prisma.rule.delete({ where: { id } });
  res.json({ ok: true });
});

// --------------------
// Transactions
// --------------------
app.get("/api/transactions", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { month } = req.query;

  const where = month ? { userId, date: { startsWith: String(month) } } : { userId };

  const items = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  res.json(items);
});

app.post("/api/transactions", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { date, amount, category, merchant, account, note } = req.body;

  if (!date || typeof date !== "string")
    return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0)
    return res.status(400).json({ error: "amount must be a non-zero number" });

  const m = String(merchant || "").trim();
  let finalCategory = String(category || "Uncategorized").trim() || "Uncategorized";

  // Apply rules
  if (m) {
    const rules = await prisma.rule.findMany({ where: { userId } });
    const found = rules.find((r) => m.toLowerCase().includes(r.match));
    if (found) finalCategory = found.category;
  }

  const created = await prisma.transaction.create({
    data: {
      userId,
      date,
      amount: amt,
      category: finalCategory,
      merchant: m,
      account: String(account || ""),
      note: String(note || ""),
    },
  });

  res.status(201).json(created);
});

// PUT /api/transactions/:id (EDIT)
app.put("/api/transactions/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "not found" });

  const { date, amount, category, merchant, account, note } = req.body;

  if (!date || typeof date !== "string")
    return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0)
    return res.status(400).json({ error: "amount must be a non-zero number" });

  const m = String(merchant || "").trim();
  let finalCategory = String(category || "Uncategorized").trim() || "Uncategorized";

  // Re-apply rules when merchant is present (optional but consistent)
  if (m) {
    const rules = await prisma.rule.findMany({ where: { userId } });
    const found = rules.find((r) => m.toLowerCase().includes(r.match));
    if (found) finalCategory = found.category;
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      date,
      amount: amt,
      category: finalCategory,
      merchant: m,
      account: String(account || ""),
      note: String(note || ""),
    },
  });

  res.json(updated);
});

// DELETE /api/transactions/:id
app.delete("/api/transactions/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) return res.status(404).json({ error: "not found" });

  await prisma.transaction.delete({ where: { id } });
  res.json({ ok: true });
});

// --------------------
// Budgets
// --------------------
app.get("/api/budgets", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "month required" });

  const budgets = await prisma.budget.findMany({
    where: { userId, month: String(month) },
    orderBy: { category: "asc" },
  });

  res.json(budgets);
});

app.post("/api/budgets", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { month, category, amount } = req.body;

  if (!month || typeof month !== "string") return res.status(400).json({ error: "month required" });
  if (!category || typeof category !== "string") return res.status(400).json({ error: "category required" });

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: "amount must be a number >= 0" });

  const saved = await prisma.budget.upsert({
    where: { userId_month_category: { userId, month, category } },
    update: { amount: amt },
    create: { userId, month, category, amount: amt },
  });

  res.status(201).json(saved);
});

// --------------------
// Recurring
// --------------------
app.get("/api/recurring", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const items = await prisma.recurring.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

app.post("/api/recurring", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { name, amount, category, merchant, account, note, dayOfMonth, isActive } = req.body;

  const cleanName = String(name || "").trim();
  const cleanCategory = String(category || "Uncategorized").trim();
  const cleanMerchant = String(merchant || "").trim();
  const cleanAccount = String(account || "").trim();
  const cleanNote = String(note || "");

  const amt = Number(amount);
  const dom = Number(dayOfMonth);

  if (!cleanName) return res.status(400).json({ error: "name required" });
  if (!Number.isFinite(amt) || amt === 0) return res.status(400).json({ error: "amount must be non-zero" });
  if (!Number.isInteger(dom) || dom < 1 || dom > 28)
    return res.status(400).json({ error: "dayOfMonth must be an integer 1..28" });

  const created = await prisma.recurring.create({
    data: {
      userId,
      name: cleanName,
      amount: amt,
      category: cleanCategory,
      merchant: cleanMerchant,
      account: cleanAccount,
      note: cleanNote,
      dayOfMonth: dom,
      isActive: typeof isActive === "boolean" ? isActive : true,
    },
  });

  res.status(201).json(created);
});

app.patch("/api/recurring/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const item = await prisma.recurring.findFirst({ where: { id, userId } });
  if (!item) return res.status(404).json({ error: "not found" });

  const updated = await prisma.recurring.update({
    where: { id },
    data: { isActive: req.body.isActive !== undefined ? !!req.body.isActive : item.isActive },
  });

  res.json(updated);
});

app.delete("/api/recurring/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;

  const item = await prisma.recurring.findFirst({ where: { id, userId } });
  if (!item) return res.status(404).json({ error: "not found" });

  await prisma.recurring.delete({ where: { id } });
  res.json({ ok: true });
});

// ============================
// CSV Import (Option A: client parses CSV -> sends rows JSON)
// POST /api/import/csv
// body: { rows: [{date, amount, merchant, account?, note?, category?}], source?: string }
// ============================
app.post("/api/import/csv", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { rows, source } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array required" });
    }

    // Load rules so we can auto-categorize on import
    const rules = await prisma.rule.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    const normalizeDate = (s) => {
      if (!s) return null;
      const str = String(s).trim();

      // already ISO-ish
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

      // try common bank formats: MM/DD/YYYY or DD/MM/YYYY (we assume MM/DD/YYYY by default)
      // If your bank is DD/MM/YYYY, swap the parsing below.
      const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m1) {
        let mm = m1[1].padStart(2, "0");
        let dd = m1[2].padStart(2, "0");
        let yyyy = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
        return `${yyyy}-${mm}-${dd}`;
      }

      // last resort: Date parse (can be locale-dependent)
      const d = new Date(str);
      if (!Number.isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }

      return null;
    };

    const parseAmount = (v) => {
      if (v == null) return NaN;
      let s = String(v).trim();

      // Handle parentheses as negative: (12.34)
      let neg = false;
      if (s.startsWith("(") && s.endsWith(")")) {
        neg = true;
        s = s.slice(1, -1);
      }

      // Remove currency symbols/commas/spaces
      s = s.replace(/[$,\s]/g, "");

      const n = Number(s);
      if (!Number.isFinite(n)) return NaN;
      return neg ? -Math.abs(n) : n;
    };

    const applyRules = (merchant, fallbackCategory = "Uncategorized") => {
      const m = String(merchant || "").toLowerCase();
      for (const r of rules) {
        const needle = String(r.match || "").toLowerCase().trim();
        if (!needle) continue;
        if (m.includes(needle)) return r.category;
      }
      return fallbackCategory;
    };

    const makeImportHash = (row) => {
      // stable dedupe key
      const raw = [
        userId || "",
        row.date || "",
        String(row.amount ?? ""),
        (row.merchant || "").toLowerCase().trim(),
        (row.account || "").toLowerCase().trim(),
      ].join("|");
      return crypto.createHash("sha256").update(raw).digest("hex");
    };

    const data = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const date = normalizeDate(r.date);
      const amount = parseAmount(r.amount);
      const merchant = String(r.merchant || r.description || "").trim();

      if (!date) {
        errors.push({ row: i + 1, error: "Invalid/missing date" });
        continue;
      }
      if (!Number.isFinite(amount) || amount === 0) {
        errors.push({ row: i + 1, error: "Invalid/missing amount" });
        continue;
      }
      if (!merchant) {
        errors.push({ row: i + 1, error: "Missing merchant/description" });
        continue;
      }

      const account = String(r.account || "Chequing").trim();
      const note = String(r.note || "").trim();

      // If CSV provided a category, keep it; otherwise apply rules
      const category = String(r.category || applyRules(merchant, "Uncategorized")).trim() || "Uncategorized";

      const rowForDb = {
        userId,
        date,
        amount,
        category,
        merchant,
        account,
        note,
        source: source ? String(source) : "csv",
      };

      rowForDb.importHash = makeImportHash(rowForDb);

      data.push(rowForDb);
    }

    // Insert in one shot; duplicates are ignored because of @@unique([userId, importHash])
    // Prisma createMany skipDuplicates works with SQLite.
    const result = await prisma.transaction.createMany({
      data,
      skipDuplicates: true,
    });

    return res.json({
      received: rows.length,
      valid: data.length,
      inserted: result.count,
      skippedDuplicates: data.length - result.count,
      errors,
    });
  } catch (e) {
    console.error("CSV import error:", e);
    return res.status(500).json({ error: e?.message || "CSV import failed" });
  }
});

app.post("/api/recurring/generate", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { month } = req.query;

  if (!month) {
    return res.status(400).json({ error: "month required (YYYY-MM)" });
  }

  // Fetch active recurring items
  const recurringItems = await prisma.recurring.findMany({
    where: { userId, isActive: true },
  });

  // Fetch existing recurring-generated transactions for this month
  const existing = await prisma.transaction.findMany({
    where: {
      userId,
      recurringId: { not: null },
      date: { startsWith: String(month) },
    },
    select: { recurringId: true },
  });

  const alreadyApplied = new Set(existing.map((t) => t.recurringId));

  const created = [];

  for (const r of recurringItems) {
    // Skip if already generated for this recurring item
    if (alreadyApplied.has(r.id)) continue;

    const day = String(r.dayOfMonth).padStart(2, "0");
    const date = `${month}-${day}`;

    // Stable hash so CSV + recurring logic can coexist later
    const importHash = crypto
      .createHash("sha256")
      .update(
        `${userId}|recurring|${r.id}|${date}|${r.amount}`
      )
      .digest("hex");

    const tx = await prisma.transaction.create({
      data: {
        userId,
        date,
        amount: r.amount,
        category: r.category,
        merchant: r.merchant,
        account: r.account,
        note: r.note || "",
        source: "recurring",
        importHash,
        recurringId: r.id,
      },
    });

    created.push(tx);
  }

  res.json({
    createdCount: created.length,
    created,
  });
});

// --------------------
// AI helper (Rule suggestion)
// --------------------
// GET /api/ai/suggest-rule?transactionId=...
app.get("/api/ai/suggest-rule", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const transactionId = String(req.query.transactionId || "").trim();

  if (!transactionId) {
    return res.status(400).json({ error: "transactionId is required" });
  }

  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true, merchant: true, amount: true, category: true },
  });

  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const merchant = String(tx.merchant || "").trim();
  const m = merchant.toLowerCase();

  // Simple “AI-ish” heuristic (portfolio-safe starter)
  // You can swap this later for a real LLM call.
  let suggestedCategory = "Uncategorized";

  if (
    m.includes("superstore") ||
    m.includes("walmart") ||
    m.includes("costco") ||
    m.includes("save-on") ||
    m.includes("sobeys") ||
    m.includes("safeway")
  ) {
    suggestedCategory = "Groceries";
  } else if (m.includes("shell") || m.includes("esso") || m.includes("petro") || m.includes("chevron")) {
    suggestedCategory = "Gas";
  } else if (m.includes("amazon") || m.includes("best buy") || m.includes("memory express")) {
    suggestedCategory = "Shopping";
  } else if (m.includes("spotify") || m.includes("netflix") || m.includes("disney") || m.includes("prime video")) {
    suggestedCategory = "Subscriptions";
  } else if (m.includes("telus") || m.includes("rogers") || m.includes("bell")) {
    suggestedCategory = "Phone/Internet";
  }

  // "match" should be the text your rule will look for (substring)
  const match = merchant ? merchant.split(" ")[0].toLowerCase() : "merchant";

  res.json({
    match,
    category: suggestedCategory,
    merchant,
    transactionId: tx.id,
    note: "Suggestion based on merchant text (starter heuristic).",
  });
});
// --- CSV DRY RUN (no insert) ---
app.post("/import/csv/dry-run", async (req, res) => {
  try {
    // If you have auth middleware, keep using it
    // if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });

    const { month, rows, mapping } = req.body;

    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "month and rows are required" });
    }
    if (!mapping?.date || !mapping?.description || !mapping?.amount) {
      return res.status(400).json({ error: "mapping(date/description/amount) is required" });
    }

    // Helpers
    const toStr = (v) => (v == null ? "" : String(v)).trim();

    const normalizeDateToIso = (raw) => {
      // Accepts ISO already, or common formats like YYYY-MM-DD / MM/DD/YYYY
      const s = toStr(raw);
      if (!s) return "";

      // If already ISO-ish:
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

      // Try MM/DD/YYYY
      const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        const mm = mdy[1].padStart(2, "0");
        const dd = mdy[2].padStart(2, "0");
        const yyyy = mdy[3];
        return `${yyyy}-${mm}-${dd}`;
      }

      // Try DD/MM/YYYY (common in some exports) — if you support it:
      const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      // NOTE: ambiguous; only enable if you actually want it.
      // For now, treat ambiguous as invalid unless ISO or MM/DD/YYYY.

      return "";
    };

    const parseAmount = (raw) => {
      // Handles "$1,234.56", "1,234.56", "-12.34"
      const s = toStr(raw).replace(/[$,]/g, "");
      if (!s) return NaN;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };

    // Validate each mapped row
    let willImport = 0;
    let willSkip = 0;

    const reasons = {
      missing_date: 0,
      invalid_date: 0,
      missing_description: 0,
      invalid_amount: 0,
      duplicate: 0,
    };

    const sampleSkipped = [];

    // OPTIONAL: If you can detect duplicates, do it here.
    // Example duplicate check signature: month + date + description + amount
    // If your DB has a unique constraint or "findMany" matching these, use Prisma.
    // This is a simple in-memory set for within-file duplicates.
    const seen = new Set();

    for (const r of rows) {
      const rawDate = r[mapping.date];
      const rawDesc = r[mapping.description];
      const rawAmt = r[mapping.amount];

      const dateIso = normalizeDateToIso(rawDate);
      const desc = toStr(rawDesc);
      const amt = parseAmount(rawAmt);

      let skipReason = "";

      if (!toStr(rawDate)) skipReason = "missing_date";
      else if (!dateIso) skipReason = "invalid_date";
      else if (!desc) skipReason = "missing_description";
      else if (!Number.isFinite(amt)) skipReason = "invalid_amount";

      // within-file dup check (basic)
      if (!skipReason) {
        const key = `${month}|${dateIso}|${desc.toLowerCase()}|${amt}`;
        if (seen.has(key)) skipReason = "duplicate";
        else seen.add(key);
      }

      if (skipReason) {
        willSkip++;
        reasons[skipReason] = (reasons[skipReason] || 0) + 1;
        if (sampleSkipped.length < 10) {
          sampleSkipped.push({
            row: r,
            reason: skipReason,
            normalized: { date: dateIso, description: desc, amount: amt },
          });
        }
      } else {
        willImport++;
      }
    }

    return res.json({
      month,
      totalRows: rows.length,
      willImport,
      willSkip,
      reasonsBreakdown: reasons,
      sampleSkipped,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Dry run failed" });
  }
});
// -----------------------------
// CSV IMPORT (REAL INSERT)
// -----------------------------
app.post("/import/csv", async (req, res) => {
  try {
    const { month, rows, mapping } = req.body;

    if (!month || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "month and rows are required" });
    }
    if (!mapping?.date || !mapping?.description || !mapping?.amount) {
      return res.status(400).json({ error: "mapping(date/description/amount) is required" });
    }

    const toStr = (v) => (v == null ? "" : String(v)).trim();

    const normalizeDateToIso = (raw) => {
      const s = toStr(raw);
      if (!s) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

      const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        const mm = mdy[1].padStart(2, "0");
        const dd = mdy[2].padStart(2, "0");
        const yyyy = mdy[3];
        return `${yyyy}-${mm}-${dd}`;
      }
      return "";
    };

    const parseAmount = (raw) => {
      const s = toStr(raw).replace(/[$,]/g, "");
      if (!s) return NaN;
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };

    const inserts = [];
    const skipped = [];
    const seen = new Set();

    for (const r of rows) {
      const rawDate = r[mapping.date];
      const rawDesc = r[mapping.description];
      const rawAmt = r[mapping.amount];

      const dateIso = normalizeDateToIso(rawDate);
      const desc = toStr(rawDesc);
      const amt = parseAmount(rawAmt);

      let reason = "";
      if (!toStr(rawDate)) reason = "missing_date";
      else if (!dateIso) reason = "invalid_date";
      else if (!desc) reason = "missing_description";
      else if (!Number.isFinite(amt)) reason = "invalid_amount";

      const key = `${month}|${dateIso}|${desc.toLowerCase()}|${amt}`;
      if (!reason && seen.has(key)) reason = "duplicate";
      if (!reason) seen.add(key);

      if (reason) {
        skipped.push({ reason });
        continue;
      }

      inserts.push({
        month,
        date: new Date(dateIso + "T00:00:00.000Z"), // safe for Prisma DateTime
        description: desc,
        amount: amt,
        // userId: req.session.userId,
      });
    }

    if (inserts.length === 0) {
      return res.json({ imported: 0, skipped: skipped.length });
    }

    const created = await prisma.transaction.createMany({
      data: inserts,
      skipDuplicates: true,
    });

    return res.json({
      imported: created.count ?? inserts.length,
      skipped: skipped.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Import failed" });
  }
});

// --------------------
// Start server (LAST)
// --------------------
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`CLIENT_ORIGIN: ${CLIENT_ORIGIN}`);
  console.log(`Session DB: ${sessionDbPath}`);
});

