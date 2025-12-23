// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

import pg from "pg";
const { Pool } = pg;

import pkg from "@prisma/client";
const { PrismaClient } = pkg;

import { PrismaPg } from "@prisma/adapter-pg";

const app = express();

// --------------------
// Prisma (Postgres) + Pool
// --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If your hosted Postgres requires SSL, uncomment this:
  // ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg({ pool });
const prisma = new PrismaClient({ adapter });

// --------------------
// Middleware
// --------------------
app.use(express.json());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.set("trust proxy", 1);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    },
  })
);

// --------------------
// OpenAI (optional)
// --------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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
      req.session.save((err2) => {
        if (err2) return reject(err2);
        resolve();
      });
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

// --------------------
// Health
// --------------------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// --------------------
// Auth
// --------------------
app.get("/api/auth/me", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });

  res.json({ user: user || null });
});

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
  } catch (e) {
    // Usually unique constraint on email
    res.status(409).json({ error: "Email already in use" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  await rotateSession(req, user.id);

  res.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } });
});

app.post("/api/auth/logout", async (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --------------------
// Password recovery
// --------------------
app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  // Always respond OK to avoid account enumeration
  res.json({ ok: true });

  if (!email.includes("@")) return;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = makeToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt, usedAt: null },
  });

  const resetUrl = `${CLIENT_ORIGIN}/reset-password?email=${encodeURIComponent(
    email
  )}&token=${encodeURIComponent(token)}`;

  console.log("\n=== Password Reset Link ===");
  console.log(resetUrl);
  console.log("===========================\n");
});

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
});

// --------------------
// AI rule suggestion endpoint (optional stub)
// --------------------
app.post("/api/ai/rule-suggestion", requireAuth, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(501).json({ error: "OPENAI_API_KEY not set on server" });
  }

  // Example stub — replace with your real handler
  res
    .status(501)
    .json({ error: "Not implemented yet in this clean file. Paste your handler here." });
});

// --------------------
// TODO: paste your Categories/Rules/Transactions/Budgets/Recurring/CSV routes here
// --------------------

// --------------------
// Start
// --------------------
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`CLIENT_ORIGIN: ${CLIENT_ORIGIN}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
});
