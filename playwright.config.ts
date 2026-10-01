import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Banco descartável: cada execução começa do zero e nunca toca em ./data.
const dbFile = path.join(os.tmpdir(), `saldo-futuro-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", channel: "msedge" },
  webServer: {
    command: "npx next dev -H 127.0.0.1 -p 3100",
    url: "http://127.0.0.1:3100/login",
    env: { DATABASE_PATH: dbFile, NEXT_DIST_DIR: ".next-e2e" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
