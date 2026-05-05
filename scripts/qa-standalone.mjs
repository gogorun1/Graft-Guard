import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const port = 5180;
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = "tmp/playwright";

await mkdir(outputDir, { recursive: true });

let server;

try {
  if (!(await isServerReady(baseUrl))) {
    server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  await waitForServer(baseUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const issues = [];
  page.on("pageerror", (error) => issues.push(`Page error: ${error.message}`));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      issues.push(`Console ${message.type()}: ${message.text()}`);
    }
  });

  await page.goto(baseUrl);
  await page.screenshot({ path: `${outputDir}/01-initial.png`, fullPage: true });

  await expectVisible(page, "text=Acme ERP Order Management v3.2", issues);
  await expectVisible(page, "text=Graft Guard", issues);

  await page.getByRole("button", { name: "Learn this app" }).click();
  await page.getByText("queryOrders(startDate: Date, endDate: Date, minAmount: Number): Order[]").waitFor();
  await page.screenshot({ path: `${outputDir}/02-learned-schema.png`, fullPage: true });

  await page.getByRole("button", { name: "Run tool" }).click();
  await page.getByText("Approval required").waitFor();
  await page.screenshot({ path: `${outputDir}/03-approval.png`, fullPage: true });

  await page.getByRole("button", { name: "Allow once" }).click();
  await page.getByText("LLM calls during replay: 0").waitFor();
  await page.screenshot({ path: `${outputDir}/04-replay-complete.png`, fullPage: true });

  const startDate = await page.locator("#start-date").inputValue();
  const endDate = await page.locator("#end-date").inputValue();
  const minAmount = await page.locator("#min-amount").inputValue();
  const rowCount = await page.locator("#orders-table tbody tr").count();
  const traceText = await page.locator(".trace-list").innerText().catch(() => "");

  if (startDate !== "2026-04-01") issues.push(`Expected start date 2026-04-01, got ${startDate}`);
  if (endDate !== "2026-04-30") issues.push(`Expected end date 2026-04-30, got ${endDate}`);
  if (minAmount !== "1000") issues.push(`Expected min amount 1000, got ${minAmount}`);
  if (rowCount !== 3) issues.push(`Expected 3 filtered rows, got ${rowCount}`);
  if (!traceText.includes("Extracted 3 rows")) issues.push("Replay trace did not include extracted row count.");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
  await mobile.goto(baseUrl);
  await mobile.screenshot({ path: `${outputDir}/05-mobile-initial.png`, fullPage: true });
  const mobilePanelVisible = await mobile.getByText("Graft Guard").isVisible();
  if (!mobilePanelVisible) issues.push("Graft Guard panel was not visible on mobile viewport.");

  await browser.close();

  console.log(JSON.stringify({ ok: issues.length === 0, issues, screenshots: outputDir }, null, 2));
  process.exitCode = issues.length === 0 ? 0 : 1;
} finally {
  server?.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function isServerReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function expectVisible(page, selector, issues) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    issues.push(`Expected visible selector: ${selector}`);
  }
}
