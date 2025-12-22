# Budget Tracker (Full-Stack)

A full-stack budget tracker app for managing transactions, categories, budgets, rules, and CSV imports.

## Features
- Add / edit / delete transactions
- Category management + filtering
- Rules for auto-categorization (optional/if enabled in your app)
- CSV import with column mapping + dry-run validation
- Responsive UI (desktop + mobile friendly)
## Screenshots

![Dashboard](screenshots/dashboard.png)

![CSV Import](screenshots/csv-import.png)

## Tech Stack
- Frontend: React (Vite)
- Backend: Node.js + Express
- Database: SQLite + Prisma
- Auth/Sessions: Express Session (if enabled)

## Local Setup

### 1) Server
```bash
cd server
npm install
# create your env file (see .env.example if provided)
npm run dev
