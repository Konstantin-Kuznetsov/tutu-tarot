import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    // Port 3000 is occupied by an unrelated project on this machine
    // (see .superpowers/sdd/progress.md's ENV NOTE); this project's own dev
    // server runs on 3100. Without this, reuseExistingServer happily
    // attaches to whatever is already listening on 3000 and every test in
    // this suite silently exercises the wrong app.
    command: "PORT=3100 npm run dev",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
