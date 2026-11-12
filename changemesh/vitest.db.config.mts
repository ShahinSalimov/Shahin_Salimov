import { defineConfig } from "vitest/config";

// Database tests run against a real PostgreSQL instance (TEST_DATABASE_URL).
// They apply every migration and verify Row Level Security as real roles.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
