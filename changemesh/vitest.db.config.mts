import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests run against a real PostgreSQL instance (TEST_DATABASE_URL).
// They apply every migration and verify Row Level Security as real roles.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
