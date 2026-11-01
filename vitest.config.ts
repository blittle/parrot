import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't boot the Cloudflare dev runtime.
export default defineConfig({
  test: { include: ["shared/**/*.test.ts", "src/**/*.test.ts"] },
});
