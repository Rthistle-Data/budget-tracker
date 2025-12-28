// server/prisma.config.ts
import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import path from "node:path";

// Force-load server/.env even when Prisma says it's skipping env loading
config({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
