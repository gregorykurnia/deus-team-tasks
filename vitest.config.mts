import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for lib/. `npm run test:unit` runs them inside a Firestore
// emulator, so the tests that write data never reach live projects.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
    globalSetup: ["tests/unit/global-setup.ts"],
    env: { NEXT_PUBLIC_USE_EMULATOR: "1" },
    fileParallelism: false,
  },
});
