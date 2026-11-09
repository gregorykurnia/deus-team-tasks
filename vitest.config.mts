import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for lib/. Two projects:
// - unit (npm run test:unit): the pure tests, with no emulator, so they start in seconds.
// - data (npm run test:data): the tests that read and write Firestore, inside the emulator, so they never reach live
//   projects. A data test is named *.data.test.ts or imports the app's Firestore (`@/lib/firebase`) or emulator helpers.
const dir = "tests/unit";
const dataTests = [dir, "lib"].flatMap((folder) => readdirSync(folder)
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => `${folder}/${f}`))
  .filter((file) => /\.data\.test\.tsx?$/.test(file) || /from "@\/lib\/firebase"|support\/emulator/.test(readFileSync(file, "utf8")));

const shared = {
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
};

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          include: [`${dir}/**/*.test.{ts,tsx}`, "lib/**/*.test.{ts,tsx}"],
          exclude: dataTests,
          environment: "node",
          env: { NEXT_PUBLIC_USE_EMULATOR: "1" },
        },
      },
      {
        ...shared,
        test: {
          name: "data",
          include: dataTests,
          environment: "node",
          globalSetup: ["tests/unit/global-setup.ts"],
          env: { NEXT_PUBLIC_USE_EMULATOR: "1" },
          fileParallelism: false,
        },
      },
    ],
  },
});
