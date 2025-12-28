// server/prisma.config.ts
import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load server/.env (this file lives in server/)
config({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
