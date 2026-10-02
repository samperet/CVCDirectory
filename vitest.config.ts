import { defineConfig } from "vitest/config";

/** Unit tests for the pure parts of `src/lib` (`*.test.ts` beside the code they test): `npm test`. */
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
